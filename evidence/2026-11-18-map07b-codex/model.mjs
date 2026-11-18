import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {applyAction,createPlan,createScenario,placementError,validatePlan} from '../../map05/planner-model.mjs';
import {assessBasket} from '../../map05/routes.mjs';
import {evaluateDay,proposeDayPlan,reorderBaskets,VARIANTS} from '../../map05/optimizer.mjs';
import {APPROACHES,SCENARIOS,measure} from '../../map05/benchmark-optimizer.mjs';

const [dataset,geocoding,savedRoutes]=await Promise.all(['addresses.json','uug-geocoding.json','local-routes.json'].map(file=>readFile(new URL('../../map05/data/'+file,import.meta.url),'utf8').then(JSON.parse)));
const date='2026-11-18';
const before=createScenario(dataset,geocoding);
const located=before.addresses.filter(a=>a.coordinates);
const [a,b,c,d]=before.orders.filter(o=>o.ready&&o.type==='MPL'&&o.slotsRequired===1&&located.some(a=>a.id===o.addressId)).slice(0,4);
const routes=Object.fromEntries(located.map(from=>[from.id,Object.fromEntries(located.map(to=>[to.id,{status:'OK',distanceM:from.id===to.id?0:1000,estimatedDurationS:from.id===to.id?0:60,path:from.id===to.id?[]:[1]}]))]));
for(const [from,to,distanceM] of [[a,b,20000],[b,c,20000],[a,c,40000]])routes[from.addressId][to.addressId].distanceM=distanceM;
const layer={schemaVersion:1,datasetId:before.datasetId,
  source:{provider:'LOCAL_OSM',profile:'shortest-distance',roadsSha256:'b'.repeat(64),engineSha256:'c'.repeat(64)},
  points:located.map(a=>({addressId:a.id,coordinates:a.coordinates,snap:{status:'OK',distanceM:0,coordinates:a.coordinates}})),
  segments:['_sdpH_gs~B?_pR'],routes};
const scenario=createScenario(dataset,geocoding,layer);
const setTown=(order,city)=>scenario.addresses.find(addr=>addr.id===order.addressId).city=city;
setTown(a,'Miasto A');setTown(b,'Miasto B');setTown(c,'Miasto A');setTown(d,'Miasto B');
const assign=(plan,orderId,teamId,start)=>applyAction(scenario,plan,{type:'ASSIGN',orderId,teamId,date,start});
let base=createPlan(scenario);
for(const [start,o] of [a,b,c].entries())base=assign(base,o.id,'TEST-02',start);
base=assign(base,d.id,'TEST-01',0);
base=applyAction(scenario,base,{type:'CONFIRM',orderId:a.id});
base.assignments.find(item=>item.orderId===b.id).origin='AUTO';
const original=JSON.stringify(base);
const assess=plan=>assessBasket(scenario,plan,'TEST-02',date);
assert.equal(assess(base).installationDistance.status,'PASS');
assert.throws(()=>assign(base,b.id,'TEST-01',1),/30 km/);
assert.throws(()=>applyAction(scenario,base,{type:'GENERATE',date,orderIds:[b.id]}),/30 km/);
for(const variant of Object.keys(VARIANTS)){
  const proposal=proposeDayPlan(scenario,base,date,{variant,orderIds:[b.id],budgetMs:5000});
  const assignment=proposal.plan.assignments.find(item=>item.orderId===b.id);
  console.log(JSON.stringify({case:'bridge',variant,before:assess(base).installationDistance.status,after:assess(proposal.plan).installationDistance.status,violations:assess(proposal.plan).violations,assignment,inputUnchanged:JSON.stringify(base)===original,structurallyValid:validatePlan(scenario,proposal.plan)}));
}

const scoreA=evaluateDay(scenario,base,date),changed=structuredClone(base);
[changed.assignments[1],changed.assignments[2]]=[changed.assignments[2],changed.assignments[1]];
const scoreB=evaluateDay(scenario,changed,date);
assert.deepEqual(scoreA.teams,scoreB.teams);
console.log(JSON.stringify({case:'assignment-array-order',sameRoute:true,sameTownA:scoreA.sameTown,sameTownB:scoreB.sameTown}));

const real=createScenario(dataset,geocoding,savedRoutes);
const seed=createPlan(real);
let untruncated;
for(const budgetMs of [0,1,3000,20000,20000]){
  const t=performance.now();
  const result=proposeDayPlan(real,seed,date,{budgetMs});
  const plan=JSON.stringify(result.plan);
  console.log(JSON.stringify({case:'time-budget',budgetMs,wallMs:Math.round(performance.now()-t),elapsedMs:result.elapsedMs,truncated:result.truncated,evaluations:result.evaluations,count:result.after.count,km:result.after.km/1000,deterministic:result.truncated||!untruncated?null:plan===untruncated}));
  if(!result.truncated)untruncated=plan;
  if(budgetMs===1){
    const skipped=Object.values(result.explanations).filter(item=>item.status==='SKIPPED');
    for(const order of real.orders.filter(order=>skipped.some(item=>item.orderId===order.id))){
      const item=skipped.find(entry=>entry.orderId===order.id);
      const positions=real.teams.filter(team=>team.skills.includes(order.type)).flatMap(team=>real.windows.map((_,start)=>({teamId:team.id,start,orderId:order.id,date,origin:'AUTO',confirmed:false})));
      const feasible=positions.find(assignment=>placementError(real,result.plan,assignment)===null);
      if(feasible){console.log(JSON.stringify({case:'skipped-feasible',id:order.id,reason:item.reason,feasibleTeam:feasible.teamId,feasibleStart:feasible.start}));break;}
    }
    const beyondEight=skipped.slice(8).find(item=>item.olderThanScheduled&&item.note?.includes('nie dała wykonalnego miejsca'));
    if(beyondEight)console.log(JSON.stringify({case:'skipped-no-experiment',rank:skipped.indexOf(beyondEight)+1,id:beyondEight.orderId,note:beyondEight.note}));
  }
}
const generated=applyAction(real,seed,{type:'GENERATE',date});
const reorder=reorderBaskets(real,generated,date);
const occupancy=plan=>plan.assignments.flatMap(a=>Array.from({length:real.orders.find(o=>o.id===a.orderId).slotsRequired},(_,i)=>[a.teamId,a.date,a.start+i].join('/'))).sort();
assert.deepEqual(occupancy(generated),occupancy(reorder.plan));
console.log(JSON.stringify({case:'reorder-occupancy',preserved:true,assignments:generated.assignments.length,twoSlot:generated.assignments.filter(a=>real.orders.find(o=>o.id===a.orderId).slotsRequired===2).length}));

for(const [scenarioId,{make}] of Object.entries(SCENARIOS)){
  const start=make(real);
  const a=APPROACHES.MAP06.run(real,start),b=APPROACHES.MAP07B_COVERAGE_FIRST.run(real,start);
  const orders=new Map(real.orders.map(o=>[o.id,o]));
  const setA=new Set(a.assignments.map(x=>x.orderId)),setB=new Set(b.assignments.map(x=>x.orderId));
  const counts=(from,to)=>from.assignments.filter(x=>!to.has(x.orderId)).reduce((out,x)=>{
    const key=orders.get(x.orderId).type==='POMIAR'?'measurements':'installations';
    out[key]++;return out;
  },{installations:0,measurements:0});
  console.log(JSON.stringify({case:'benchmark-cohort',scenarioId,common:a.assignments.filter(x=>setB.has(x.orderId)).length,onlyMap06:counts(a,setB),onlyCoverage:counts(b,setA)}));
}

// Demonstrate that the benchmark's unfilled-slot metric misses a feasible two-slot visit.
const candidate=real.orders.find(order=>order.ready&&order.type==='MPL'&&order.slotsRequired===2&&real.routing.points.some(point=>point.addressId===order.addressId&&point.snap.status==='OK'));
const isolated={...real,orders:real.orders.map(order=>({...order,ready:order.id===candidate.id}))};
const open=createPlan(isolated);
open.availability=open.availability.map(row=>({...row,slots:row.date===date&&row.teamId==='TEST-02'?[0,1]:[]}));
const measurement=measure(isolated,open,{referenceIds:[candidate.id],protectedBefore:[],runtimeMs:0});
const valid=placementError(isolated,open,{orderId:candidate.id,teamId:'TEST-02',date,start:0,origin:'AUTO',confirmed:false})===null;
assert.equal(valid,true);
console.log(JSON.stringify({case:'benchmark-open-pair',id:candidate.id,empty:measurement.emptySlots,unjustified:measurement.unjustifiedEmptySlots,twoSlotAssignmentFeasible:valid}));
