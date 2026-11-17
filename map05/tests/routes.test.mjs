import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRoutes,routeLeg,assessBasket,decodeRouteGeometry} from '../routes.mjs';

const sha='a'.repeat(64),coordinates=[18,50],ids=['A','M','B','N'];
const addresses=ids.map(id=>({id,coordinates:[...coordinates]}));
function layer() {
  return {schemaVersion:1,datasetId:sha,source:{provider:'LOCAL_OSM',profile:'shortest-distance',roadsSha256:'b'.repeat(64),engineSha256:'c'.repeat(64)},
    points:addresses.map(a=>({addressId:a.id,coordinates:a.coordinates,snap:{status:'OK',distanceM:0,coordinates:a.coordinates}})),
    segments:['_sdpH_gs~B?_pR'],
    routes:Object.fromEntries(ids.map(from=>[from,Object.fromEntries(ids.map(to=>[to,{status:'OK',distanceM:from===to?0:1000,estimatedDurationS:from===to?0:300,path:from===to?[]:[1]}]))]))};
}
function fixture(overrides={}) {
  const value=layer();
  for(const [pair,properties] of Object.entries(overrides)){const [a,b]=pair.split(':');value.routes[a][b]={...value.routes[a][b],...properties};}
  const routing=mergeRoutes(sha,addresses,value);
  const scenario={datasetId:sha,addresses,orders:ids.map((id,i)=>({id,addressId:id,type:i%2?'POMIAR':'MPL',serviceMinutes:60})),windows:[['08:00','11:00'],['11:00','14:00'],['14:00','17:00'],['17:00','20:00']],routing};
  const plan={assignments:[]};
  const put=(sequence)=>{plan.assignments=sequence.map((orderId,start)=>({orderId,start,teamId:'T1',date:'2026-11-18'}));return assessBasket(scenario,plan,'T1','2026-11-18');};
  return {scenario,plan,put};
}

test('local route layer rejects foreign identities coordinates negative values and broken segment references',()=>{
  for(const mutate of [v=>{v.datasetId='other';},v=>{v.points[0].coordinates=[19,51];},v=>{v.routes.A.B.distanceM=-1;},v=>{v.routes.A.B.path=[2];},v=>{delete v.routes.A.B;},v=>{v.source.provider='remote';},v=>{v.routes.A.B.status='NO_PATH';}]) {
    const bad=layer();mutate(bad);assert.throws(()=>mergeRoutes(sha,addresses,bad),/tras|drog|współrzęd/);
  }
  assert.equal(mergeRoutes(sha,addresses,null),null);
});

test('30km applies to the full road chain via a measurement and includes the boundary',()=>{
  const f=fixture({'A:M':{distanceM:16000},'M:B':{distanceM:14000},'A:B':{distanceM:20000}});
  let result=f.put(['A','M','B']);
  assert.equal(result.installationDistance.status,'PASS');assert.equal(result.installationDistance.maxM,30000);
  assert.equal(result.measurementExtra.status,'PASS');assert.equal(result.measurementExtra.extraM,10000);
  f.scenario.routing.routes.M.B.distanceM=14001;
  result=f.put(['A','M','B']);assert.equal(result.installationDistance.status,'LIMIT');assert.equal(result.measurementExtra.status,'LIMIT');
});

test('multiple measurements share one extra-distance budget across the basket',()=>{
  const f=fixture({'A:M':{distanceM:8000},'M:N':{distanceM:9000},'N:B':{distanceM:13001},'A:B':{distanceM:20000}});
  const result=f.put(['A','M','N','B']);
  assert.equal(result.measurementExtra.extraM,10001);assert.equal(result.measurementExtra.status,'LIMIT');
});

test('missing start end or disconnected road remains unassessed without zero-distance claims',()=>{
  const f=fixture();
  assert.equal(f.put(['M','A','B']).measurementExtra.status,'UNASSESSED');
  assert.equal(f.put(['A','B','M']).measurementExtra.status,'UNASSESSED');
  f.scenario.routing.routes.A.B={status:'NO_PATH',distanceM:null,estimatedDurationS:null,path:null};
  const result=f.put(['A','B']);assert.equal(result.installationDistance.status,'UNASSESSED');assert.equal(result.distanceM,null);
  assert.equal(routeLeg(f.scenario.routing,'unknown','B').distanceM,null);
});

test('travel and synthetic service share the allotted window and first commute remains unknown',()=>{
  const f=fixture({'A:B':{estimatedDurationS:7200}});
  let result=f.put(['A','B']);assert.equal(result.windows.status,'UNASSESSED');
  assert.equal(result.windows.entries[1].status,'PASS');
  f.scenario.routing.routes.A.B.estimatedDurationS=7201;
  result=f.put(['A','B']);assert.equal(result.windows.status,'LIMIT');assert.equal(result.windows.entries[1].status,'LIMIT');
});

test('polyline segments decode in the correct direction and gaps are not synthesized',()=>{
  const r=layer();r.segments=['_p~iF~ps|U_ulLnnqC_mqNvxq`@'];
  assert.deepEqual(decodeRouteGeometry(r,{status:'OK',path:[1]}),[[-120.2,38.5],[-120.95,40.7],[-126.453,43.252]]);
  assert.deepEqual(decodeRouteGeometry(r,{status:'OK',path:[-1]}),[[-126.453,43.252],[-120.95,40.7],[-120.2,38.5]]);
  assert.deepEqual(decodeRouteGeometry(r,{status:'NO_PATH',path:null}),[]);
});
