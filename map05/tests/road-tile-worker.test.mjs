// MAP-06.1: road tiles built off the main thread (worker service + client) and gzip-base64 data blocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createRoadTileService} from '../road-tile-worker.mjs';
import {createWorkerRoadTiles,createInlineRoadTiles} from '../road-tile-client.mjs';
import {createRoadTileIndex,encodeRoadTile} from '../road-tiles.mjs';
import {decodeEmbeddedText} from '../embedded-data.mjs';

const encodePolyline=points=>{
  let out='',plat=0,plon=0;
  const enc=v=>{v=v<0?~(v<<1):v<<1;let s='';while(v>=32){s+=String.fromCharCode((32|(v&31))+63);v>>=5;}return s+String.fromCharCode(v+63);};
  for(const [lon,lat] of points){const la=Math.round(lat*1e5),lo=Math.round(lon*1e5);out+=enc(la-plat)+enc(lo-plon);plat=la;plon=lo;}
  return out;
};
const roads={encoding:'polyline5-indexed',categories:['primary','residential'],names:['','ulica Testowa'],bounds:[18.5,50.1,18.8,50.3],
  features:[['101',0,0,encodePolyline([[18.60,50.20],[18.70,50.22]]),[18.60,50.20,18.70,50.22]],['202',1,1,encodePolyline([[18.640,50.210],[18.642,50.211]]),[18.640,50.210,18.642,50.211]]]};
const json=JSON.stringify({regions:{PLANNER:roads}});
const tileXY=(lon,lat,z)=>{const s=Math.sin(lat*Math.PI/180);return [Math.floor((lon+180)/360*2**z),Math.floor((0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*2**z)];};
const [X,Y]=tileXY(18.64,50.21,14);
const flush=async(n=8)=>{for(let i=0;i<n;i++)await new Promise(resolve=>setTimeout(resolve,5));};

// A service whose scheduler is driven by the test, so ordering and cancellation are deterministic.
function manualService(options={}) {
  const out=[],tasks=[];
  const service=createRoadTileService((message,transfer)=>out.push({message,transfer}),{schedule:fn=>tasks.push(fn),...options});
  const run=()=>{while(tasks.length)tasks.shift()();};
  return {service,out,run};
}

test('embedded gzip-base64 blocks decode to the original JSON and bad encodings fail loudly',async()=>{
  const packed=gzipSync(Buffer.from(json,'utf8'),{level:9}).toString('base64');
  assert.equal(await decodeEmbeddedText(packed,'gzip-base64'),json);
  assert.equal(await decodeEmbeddedText(json,'json'),json);
  assert.equal(await decodeEmbeddedText(json),json);
  await assert.rejects(decodeEmbeddedText(packed,'zip'),/Nieobsługiwane kodowanie/);
  await assert.rejects(decodeEmbeddedText('not base64!!','gzip-base64'));
});

test('worker service builds the same tile bytes as the inline encoder, from embedded and url sources',async()=>{
  const expected=Buffer.from(encodeRoadTile(createRoadTileIndex(roads),14,X,Y).data);
  assert.ok(expected.length>20);
  for(const source of [{kind:'embedded',text:gzipSync(Buffer.from(json)).toString('base64'),encoding:'gzip-base64'},{kind:'url',url:'http://local/roads.json'}]) {
    const {service,out,run}=manualService({fetchText:async url=>{assert.equal(url,'http://local/roads.json');return json;}});
    service.handle({type:'init',source});await flush();
    assert.equal(out[0].message.type,'ready');assert.equal(out[0].message.roads,2);
    service.handle({type:'tile',id:7,z:14,x:X,y:Y});run();
    const answer=out.find(entry=>entry.message.type==='tile');
    assert.equal(answer.message.id,7);assert.deepEqual(Buffer.from(answer.message.data),expected);
    assert.equal(answer.transfer.length,1,'tile buffer is transferred, not copied');
  }
});

test('newest tile requests are served first and cancelled ones are never built',async()=>{
  const {service,out,run}=manualService();
  service.handle({type:'tile',id:1,z:14,x:X,y:Y});service.handle({type:'tile',id:2,z:14,x:X+1,y:Y});service.handle({type:'tile',id:3,z:14,x:X,y:Y+1});
  service.handle({type:'init',source:{kind:'embedded',text:json,encoding:'json'}});await flush();
  service.handle({type:'cancel',id:3});
  run();
  const order=out.filter(entry=>entry.message.type==='tile').map(entry=>entry.message.id);
  assert.deepEqual(order,[2,1],'request 3 was cancelled; the newer of the rest comes first');
});

test('a failed init reports the error once and rejects queued tiles instead of hanging',async()=>{
  const {service,out,run}=manualService({fetchText:async()=>{throw Error('Brak pliku lokalnego: x (404).');}});
  service.handle({type:'tile',id:1,z:14,x:X,y:Y});
  service.handle({type:'init',source:{kind:'url',url:'x'}});await flush();run();
  assert.equal(out.filter(entry=>entry.message.type==='error').length,1);
  assert.match(out.find(entry=>entry.message.type==='tile').message.error,/Brak pliku/);
  // A document without the PLANNER region is rejected too.
  const second=manualService();second.service.handle({type:'init',source:{kind:'embedded',text:'{"regions":{}}',encoding:'json'}});await flush();
  assert.match(second.out[0].message.message,/PLANNER/);
});

function fakeWorker() {
  const sent=[];
  const worker={sent,terminated:false,postMessage:m=>sent.push(m),terminate(){worker.terminated=true;},emit:data=>worker.onmessage({data})};
  return worker;
}

test('client resolves tiles by id, sends cancel on abort and ignores late answers',async()=>{
  const worker=fakeWorker(),client=createWorkerRoadTiles(worker,{kind:'url',url:'u'});
  assert.deepEqual(worker.sent[0],{type:'init',source:{kind:'url',url:'u'}});
  worker.emit({type:'ready',roads:2});assert.equal((await client.ready).roads,2);
  const first=client.tile(14,1,2),second=client.tile(14,3,4);
  assert.equal(client.pending,2);
  const [,a,b]=worker.sent;
  assert.deepEqual([a.id,b.id,a.z,a.x,a.y],[1,2,14,1,2]);
  const buffer=new ArrayBuffer(4);
  worker.emit({type:'tile',id:2,data:buffer});assert.equal(await second,buffer);
  const controller=new AbortController(),third=client.tile(14,5,6,controller.signal);
  controller.abort();
  await assert.rejects(third,{name:'AbortError'});
  assert.deepEqual(worker.sent.at(-1),{type:'cancel',id:3});
  worker.emit({type:'tile',id:3,data:new ArrayBuffer(1)});    // late answer: ignored, no throw
  worker.emit({type:'tile',id:1,error:'boom'});await assert.rejects(first,/boom/);
  assert.equal(client.pending,0);
  await assert.rejects(client.tile(14,0,0,AbortSignal.abort()),{name:'AbortError'});
});

test('client rejects ready and every pending tile when the worker fails, and refuses work after destroy',async()=>{
  const worker=fakeWorker(),client=createWorkerRoadTiles(worker,{kind:'url',url:'u'});
  const pending=client.tile(14,1,1);
  worker.emit({type:'error',message:'Brak regionu PLANNER'});
  await assert.rejects(client.ready,/PLANNER/);await assert.rejects(pending,/PLANNER/);
  const crashed=fakeWorker(),second=createWorkerRoadTiles(crashed,{kind:'url',url:'u'}),pendingTile=second.tile(1,0,0);
  crashed.onerror({message:'Worker crashed'});
  await assert.rejects(second.ready,/crashed/);await assert.rejects(pendingTile,/crashed/);
  const third=fakeWorker(),client3=createWorkerRoadTiles(third,{kind:'url',url:'u'});client3.destroy();
  assert.equal(third.terminated,true);await assert.rejects(client3.tile(1,0,0),/zamknięty/);
});

test('inline fallback client returns the same bytes as the worker service',async()=>{
  const inline=createInlineRoadTiles(roads);
  assert.equal((await inline.ready).roads,2);
  const bytes=Buffer.from(await inline.tile(14,X,Y));
  assert.deepEqual(bytes,Buffer.from(encodeRoadTile(createRoadTileIndex(roads),14,X,Y).data));
});

test('a worker that dies after ready fails every pending and later tile and signals `failed`',async()=>{
  const worker=fakeWorker(),client=createWorkerRoadTiles(worker,{kind:'url',url:'u'});
  worker.emit({type:'ready',roads:2});await client.ready;
  const inFlight=client.tile(14,1,1);
  worker.onerror({message:'Worker crashed later'});
  await assert.rejects(inFlight,/crashed later/);
  assert.match((await client.failed).message,/crashed later/);
  await assert.rejects(client.tile(14,2,2),/crashed later/);
  assert.equal(client.pending,0);
  worker.onerror({message:'second error'});          // first failure stays the reported one
  assert.match((await client.failed).message,/crashed later/);
});

test('a late cancel for an already answered tile leaves no state behind and queued cancels still work',async()=>{
  const {service,out,run}=manualService();
  service.handle({type:'init',source:{kind:'embedded',text:json,encoding:'json'}});await flush();
  for(let id=1;id<=50;id++){service.handle({type:'tile',id,z:14,x:X,y:Y});run();service.handle({type:'cancel',id});}
  assert.equal(out.filter(entry=>entry.message.type==='tile').length,50);
  // Ids reused after a late cancel are not silently dropped.
  service.handle({type:'tile',id:1,z:14,x:X,y:Y});run();
  assert.equal(out.filter(entry=>entry.message.type==='tile'&&entry.message.id===1).length,2);
});
