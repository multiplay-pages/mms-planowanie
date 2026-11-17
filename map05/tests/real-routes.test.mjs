// Real saved local road data, without browser navigation or any network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createScenario,createPlan,applyAction,restorePlan} from '../planner-model.mjs';
import {decodeRoadPolyline,assessBasket} from '../routes.mjs';
const [dataset,geocoding,routes]=await Promise.all(['addresses.json','uug-geocoding.json','local-routes.json'].map(name=>readFile(new URL('../data/'+name,import.meta.url),'utf8').then(JSON.parse)));

test('all available real road paths are continuous and end at their own snapped input points',()=>{
  const endpoints=routes.segments.map(encoded=>{const p=decodeRoadPolyline(encoded);return [p[0],p.at(-1)];});
  const snaps=new Map(routes.points.map(point=>[point.addressId,point.snap]));
  const close=(a,b)=>Math.hypot((a[0]-b[0])*72000,(a[1]-b[1])*112000)<2;
  let available=0,unknown=0;
  for(const [from,row] of Object.entries(routes.routes))for(const [to,route] of Object.entries(row)) {
    if(route.status!=='OK'){assert.equal(route.distanceM,null);assert.equal(route.estimatedDurationS,null);assert.equal(route.path,null);unknown++;continue;}
    if(from!==to)available++;
    let previous=null,first=null;
    for(const id of route.path) {
      const pair=endpoints[Math.abs(id)-1],start=pair[id>0?0:1],end=pair[id>0?1:0];
      if(previous)assert.deepEqual(start,previous,`${from} -> ${to}: unconnected public road segments`);
      first??=start;previous=end;
    }
    if(first){assert.ok(close(first,snaps.get(from).coordinates));assert.ok(close(previous,snaps.get(to).coordinates));}
    else {assert.equal(route.distanceM,0);assert.deepEqual(snaps.get(from).coordinates,snaps.get(to).coordinates);}
  }
  assert.equal(available,9702);assert.equal(unknown,601);
});

test('the actual regional route snapshot generates consistent baskets while preserving a legacy plan',()=>{
  const source=createScenario(dataset,geocoding),scenario=createScenario(dataset,geocoding,routes);
  const old=applyAction(source,createPlan(source),{type:'GENERATE',date:'2026-11-18'});
  assert.deepEqual(restorePlan(scenario,JSON.stringify(old)),old);
  const plan=applyAction(scenario,createPlan(scenario),{type:'GENERATE',date:'2026-11-18'});
  assert.ok(plan.assignments.length>0);assert.equal(new Set(plan.assignments.map(a=>a.orderId)).size,plan.assignments.length);
  for(const team of scenario.teams)assert.deepEqual(assessBasket(scenario,plan,team.id,'2026-11-18').violations,[]);
  const unlocated=new Set(scenario.addresses.filter(address=>!address.coordinates).map(address=>address.id));
  assert.ok(plan.assignments.every(item=>!unlocated.has(scenario.orders.find(order=>order.id===item.orderId).addressId)));
  assert.equal(unlocated.size,7);assert.equal(scenario.orders.length,109);
});
