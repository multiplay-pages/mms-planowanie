// Read-only source review probes; Happy DOM is not a visual/browser test.
// Run from repo root: node evidence/2026-11-17-codex/review-repro.mjs
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Window} from '../../map05/node_modules/happy-dom/lib/index.js';
import * as modelApi from '../../map05/planner-model.mjs';
import * as mapApi from '../../map05/map.mjs';
import * as locationApi from '../../map05/locations.mjs';
import * as roadApi from '../../map05/routes.mjs';
import * as plannerMapApi from '../../map05/planner-map.mjs';
import {roadFixture} from '../../map05/tests/road-fixture.mjs';
const read=async path=>readFile(new URL('../../map05/'+path,import.meta.url),'utf8');
const [markup,source,dataset,geocoding]=await Promise.all([
  read('planner.html'),read('planner.mjs'),read('data/addresses.json').then(JSON.parse),read('data/uug-geocoding.json').then(JSON.parse),
]);
const findings=[];
function record(id,details){findings.push({id,...details});console.log(JSON.stringify(findings.at(-1)));}
async function mount(options={}) {
  const window=new Window({settings:{enableJavaScriptEvaluation:false,disableJavaScriptFileLoading:true,enableCSSFileLoading:false,enableImageFileLoading:false,enableIframePageLoading:false,navigation:{disableMainFrameNavigation:true,disableChildFrameNavigation:true,disableChildPageNavigation:true,disableFallbackToSetURL:true}}});
  const requests=[],errors=[];const deny=async url=>{requests.push(String(url));throw Error('No network');};window.fetch=deny;
  window.document.write(markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
  for(const [id,value] of [['address-data',dataset],['geocoding-data',geocoding],['routing-data',null],['basemap-data',null]]) {
    const node=window.document.createElement('script');node.id=id;node.type='application/json';node.textContent=JSON.stringify(value);window.document.body.append(node);
  }
  const saved=options.saved??new Map();
  window.addEventListener('error',event=>errors.push(event.error?.message??event.message));
  vm.runInContext(source.replace(/^import[^\n]*\n/gm,''),vm.createContext({document:window.document,fetch:deny,localStorage:{getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)},URL,Blob,Intl,console,...modelApi,...mapApi,...locationApi,...roadApi,...plannerMapApi}),{timeout:10000});
  await new Promise(resolve=>setImmediate(resolve));
  const $=selector=>window.document.querySelector(selector);
  const click=selector=>{assert.ok($(selector),selector);$(selector).dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));};
  const change=(selector,value)=>{$(selector).value=value;$(selector).dispatchEvent(new window.Event('change',{bubbles:true}));};
  const focused=()=>({tag:window.document.activeElement.tagName,id:window.document.activeElement.id});
  const cleanup=async()=>{await window.happyDOM.abort();assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);};
  return {window,$,click,change,saved,focused,cleanup};
}
const scenario=modelApi.createScenario(dataset,geocoding),date='2026-11-18';
const order=scenario.orders.find(o=>o.ready&&o.type==='MPL'&&o.slotsRequired===1);
const action=(p,a)=>modelApi.applyAction(scenario,p,a);
let plan=action(modelApi.createPlan(scenario),{type:'ASSIGN',orderId:order.id,teamId:'TEST-02',date,start:0});
plan=action(plan,{type:'CONFIRM',orderId:order.id});
plan=action(plan,{type:'UNCONFIRM',orderId:order.id,reason:'Klient zmienił uzgodniony dzień'});
const reasonBefore=plan.assignments[0].releaseReason;
const moved=action(plan,{type:'ASSIGN',orderId:order.id,teamId:'TEST-02',date:'2026-11-19',start:0});
assert.equal(moved.assignments[0].releaseReason,undefined);
record('release-reason-lost-on-move',{before:reasonBefore,after:moved.assignments[0].releaseReason??null,exported:JSON.stringify(moved).includes(reasonBefore)});
const ui=await mount();
ui.click(`#queue-list [data-order="${order.id}"]`);
ui.$('#assignment-form').dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
for(const selector of ['#confirm-order','#release-order','#remove-order']) {
  if(selector==='#release-order')ui.$('#release-reason').value='Korekta testowa';
  ui.$(selector).focus();assert.equal(ui.focused().id,selector.slice(1));ui.click(selector);
  assert.equal(ui.focused().tag,'BODY');
  record('focus-lost-'+selector.slice(1),{after:ui.focused()});
}
await ui.cleanup();
// Date change in basket mode retains the previous date's street-scale viewport.
let mapPlan=modelApi.createPlan(scenario);
const first=scenario.orders.find(o=>o.ready&&o.type==='MPL'&&o.slotsRequired===1&&scenario.addresses.find(a=>a.id===o.addressId).coordinates);
const frame=mapApi.createMapFrame(scenario.addresses.filter(locationApi.hasLocation).map(a=>a.coordinates),680,380);
const firstPoint=mapApi.projectMapPoint(scenario.addresses.find(a=>a.id===first.addressId).coordinates,frame);
const distant=scenario.orders.filter(o=>o.ready&&o.type==='MPL'&&o.slotsRequired===1&&scenario.addresses.find(a=>a.id===o.addressId).coordinates).sort((a,b)=>{
  const distance=o=>{const p=mapApi.projectMapPoint(scenario.addresses.find(a=>a.id===o.addressId).coordinates,frame);return Math.hypot(p[0]-firstPoint[0],p[1]-firstPoint[1]);};return distance(b)-distance(a);
})[0];
for(const [o,d] of [[first,date],[distant,'2026-11-19']])mapPlan=action(mapPlan,{type:'ASSIGN',orderId:o.id,teamId:'TEST-02',date:d,start:0});
const mapUI=await mount({saved:new Map([[`mms-map05-plan-v1-${scenario.datasetId}`,JSON.stringify(mapPlan)]])});
mapUI.click('[data-basket-map="TEST-02"]');
const oldViewport=mapUI.$('#planner-map').getAttribute('viewBox');
mapUI.change('#planning-date','2026-11-19');
const newViewport=mapUI.$('#planner-map').getAttribute('viewBox');
const circle=mapUI.$(`#planner-map [data-order="${distant.id}"]`),x=Number(circle.getAttribute('cx')),y=Number(circle.getAttribute('cy'));
const [left,top,width,height]=newViewport.split(' ').map(Number);
const outside=x<left||x>left+width||y<top||y>top+height;
assert.equal(oldViewport,newViewport);assert.equal(outside,true);
record('basket-date-change-point-outside-viewport',{first:first.id,second:distant.id,oldViewport,newViewport,newMarker:[x,y],outside});
await mapUI.cleanup();
// Independent cross-basket regression: A->B 20km, B->C 20km, A->C 40km.
const routing=roadFixture(scenario),roadScenario=modelApi.createScenario(dataset,geocoding,routing);
const chain=roadScenario.orders.filter(o=>o.ready&&o.type==='MPL'&&o.slotsRequired===1&&roadScenario.addresses.find(a=>a.id===o.addressId).coordinates).slice(0,3);
for(const [a,b,distanceM] of [[chain[0],chain[1],20000],[chain[1],chain[2],20000],[chain[0],chain[2],40000]])roadScenario.routing.routes[a.addressId][b.addressId].distanceM=distanceM;
let chainPlan=modelApi.createPlan(roadScenario);
for(const [start,o] of chain.entries())chainPlan=modelApi.applyAction(roadScenario,chainPlan,{type:'ASSIGN',orderId:o.id,teamId:'TEST-02',date,start});
const before=JSON.stringify(chainPlan);
for(const operation of [{type:'REMOVE',orderId:chain[1].id},{type:'ASSIGN',orderId:chain[1].id,teamId:'TEST-01',date,start:0}]) {
  assert.throws(()=>modelApi.applyAction(roadScenario,chainPlan,operation),/30 km/);assert.equal(JSON.stringify(chainPlan),before);
}
record('cross-basket-road-atomicity',{result:'PASS',orders:chain.map(o=>o.id),actions:['REMOVE','ASSIGN'],originalUnchanged:true});
await writeFile(new URL('./review-repro-results.json',import.meta.url),JSON.stringify({baseline:'8ce430af8dd3e8c20fd775c66d78a2b422785004',findings},null,2)+'\n');
