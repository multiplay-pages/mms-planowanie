import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createScenario,createPlan,applyAction,restorePlan,explainOrder} from '../planner-model.mjs';
import {assessBasket} from '../routes.mjs';
const dataset=JSON.parse(await readFile(new URL('../data/addresses.json',import.meta.url),'utf8'));
const geocoding=JSON.parse(await readFile(new URL('../data/uug-geocoding.json',import.meta.url),'utf8'));
const date='2026-11-18';
function fixture(distanceM=1000,estimatedDurationS=60) {
  const before=createScenario(dataset,geocoding),located=before.addresses.filter(a=>a.coordinates);
  const orders=before.orders.filter(o=>o.ready&&o.type==='MPL'&&o.slotsRequired===1&&located.some(a=>a.id===o.addressId)).slice(0,2);
  const layer={schemaVersion:1,datasetId:before.datasetId,source:{provider:'LOCAL_OSM',profile:'shortest-distance',roadsSha256:'b'.repeat(64),engineSha256:'c'.repeat(64)},
    points:located.map(a=>({addressId:a.id,coordinates:a.coordinates,snap:{status:'OK',distanceM:0,coordinates:a.coordinates}})),segments:['_sdpH_gs~B?_pR'],
    routes:Object.fromEntries(located.map(from=>[from.id,Object.fromEntries(located.map(to=>[to.id,{status:'OK',distanceM:from.id===to.id?0:1000,estimatedDurationS:from.id===to.id?0:60,path:from.id===to.id?[]:[1]}]))]))};
  for(const [a,b] of [[orders[0],orders[1]],[orders[1],orders[0]]])Object.assign(layer.routes[a.addressId][b.addressId],{distanceM,estimatedDurationS});
  return {before,scenario:createScenario(dataset,geocoding,layer),orders,layer};
}
const assign=(scenario,plan,order,start)=>applyAction(scenario,plan,{type:'ASSIGN',orderId:order.id,teamId:'TEST-02',date,start});

test('manual correction rejects a known 30001m road violation without mutating the saved plan',()=>{
  const f=fixture(30001);let plan=assign(f.scenario,createPlan(f.scenario),f.orders[0],0);
  const original=structuredClone(plan);
  assert.throws(()=>assign(f.scenario,plan,f.orders[1],1),/30 km/);
  assert.deepEqual(plan,original);
  const boundary=fixture(30000);plan=assign(boundary.scenario,createPlan(boundary.scenario),boundary.orders[0],0);
  assert.equal(assign(boundary.scenario,plan,boundary.orders[1],1).assignments.length,2);
});

test('generator skips a known road violation and explains it independently of slot capacity',()=>{
  const f=fixture(30001);let plan=createPlan(f.scenario);
  plan.availability=plan.availability.map(a=>({...a,slots:a.teamId==='TEST-02'?[0,1,2]:[]}));
  const result=applyAction(f.scenario,plan,{type:'GENERATE',date,orderIds:f.orders.map(o=>o.id)});
  assert.equal(result.assignments.length,1);
  const remaining=f.orders.find(o=>!result.assignments.some(a=>a.orderId===o.id));
  assert.match(explainOrder(f.scenario,result,remaining,date),/30 km/);
});

test('travel plus synthetic work cannot exceed the allotted window by a second',()=>{
  const f=fixture(1000,3601);const plan=assign(f.scenario,createPlan(f.scenario),f.orders[0],0);
  assert.throws(()=>assign(f.scenario,plan,f.orders[1],1),/czas|okno|dojazd/);
  const boundary=fixture(1000,3600);let other=assign(boundary.scenario,createPlan(boundary.scenario),boundary.orders[0],0);
  assert.equal(assign(boundary.scenario,other,boundary.orders[1],1).assignments.length,2);
});

test('new road assessment annotates existing manual or confirmed plans without deleting them on import',()=>{
  const f=fixture(30001);let old=assign(f.before,createPlan(f.before),f.orders[0],0);old=assign(f.before,old,f.orders[1],1);
  old=applyAction(f.before,old,{type:'CONFIRM',orderId:f.orders[0].id});
  const restored=restorePlan(f.scenario,JSON.stringify(old));assert.deepEqual(restored,old);
  assert.ok(assessBasket(f.scenario,restored,'TEST-02',date).violations.length>0);
  const next=applyAction(f.scenario,restored,{type:'GENERATE',date,orderIds:f.orders.map(o=>o.id)});
  assert.deepEqual(next.assignments,restored.assignments);
});

test('seven intentionally unlocated addresses remain in the queue with a geographic reason',()=>{
  const f=fixture();const order=f.scenario.orders.find(o=>o.ready&&!f.scenario.addresses.find(a=>a.id===o.addressId).coordinates);
  assert.ok(order);
  const plan=applyAction(f.scenario,createPlan(f.scenario),{type:'GENERATE',date,orderIds:[order.id]});
  assert.equal(plan.assignments.length,0);assert.match(explainOrder(f.scenario,plan,order,date),/lokalizac|współrzęd/);
  assert.equal(f.scenario.orders.length,109);
});

function chainFixture() {
  const f=fixture(),[a,b]=f.orders,c=f.scenario.orders.find(o=>o.ready&&o.type==='MPL'&&o.slotsRequired===1&&!f.orders.some(x=>x.id===o.id)&&f.scenario.addresses.find(x=>x.id===o.addressId).coordinates);
  Object.assign(f.scenario.routing.routes[a.addressId][b.addressId],{distanceM:20000});
  Object.assign(f.scenario.routing.routes[b.addressId][c.addressId],{distanceM:20000});
  Object.assign(f.scenario.routing.routes[a.addressId][c.addressId],{distanceM:40000});
  let plan=assign(f.scenario,createPlan(f.scenario),a,0);plan=assign(f.scenario,plan,b,1);plan=assign(f.scenario,plan,c,2);
  return {...f,plan,a,b,c};
}

test('manual move and return to queue cannot introduce a new road violation in the source basket',()=>{
  const f=chainFixture(),before=structuredClone(f.plan);
  assert.equal(assessBasket(f.scenario,f.plan,'TEST-02',date).installationDistance.status,'PASS');
  assert.throws(()=>applyAction(f.scenario,f.plan,{type:'ASSIGN',orderId:f.b.id,teamId:'TEST-01',date,start:0}),/30 km/);
  assert.throws(()=>applyAction(f.scenario,f.plan,{type:'REMOVE',orderId:f.b.id}),/30 km/);
  assert.deepEqual(f.plan,before);
});

test('scoped regeneration cannot move an automatic bridge visit and break protected source visits',()=>{
  const f=chainFixture();f.plan.assignments.find(item=>item.orderId===f.b.id).origin='AUTO';
  const d=f.scenario.orders.find(o=>o.ready&&o.type==='MPL'&&o.slotsRequired===1&&![f.a.id,f.b.id,f.c.id].includes(o.id)&&f.scenario.addresses.find(x=>x.id===o.addressId).coordinates);
  f.scenario.addresses.find(a=>a.id===d.addressId).city=f.scenario.addresses.find(a=>a.id===f.b.addressId).city;
  const plan=applyAction(f.scenario,f.plan,{type:'ASSIGN',orderId:d.id,teamId:'TEST-01',date,start:0}),before=structuredClone(plan);
  assert.throws(()=>applyAction(f.scenario,plan,{type:'GENERATE',date,orderIds:[f.b.id]}),/30 km/);
  assert.deepEqual(plan,before);
});

test('an existing legacy violation can still be repaired by removing an offending endpoint',()=>{
  const f=fixture(40000);let old=assign(f.before,createPlan(f.before),f.orders[0],0);old=assign(f.before,old,f.orders[1],1);
  const restored=restorePlan(f.scenario,JSON.stringify(old));
  const repaired=applyAction(f.scenario,restored,{type:'REMOVE',orderId:f.orders[1].id});
  assert.equal(repaired.assignments.length,1);assert.deepEqual(assessBasket(f.scenario,repaired,'TEST-02',date).violations,[]);
});
