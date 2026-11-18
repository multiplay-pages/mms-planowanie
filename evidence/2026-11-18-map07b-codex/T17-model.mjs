import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {applyAction,createPlan,createScenario,restorePlan,validatePlan} from '../../map05/planner-model.mjs';
import {assessBasket} from '../../map05/routes.mjs';
import {evaluateDay,proposeDayPlan,VARIANTS} from '../../map05/optimizer.mjs';

const date='2026-11-18';
const [dataset,geocoding]=await Promise.all(['addresses.json','uug-geocoding.json'].map(name=>readFile(new URL('../../map05/data/'+name,import.meta.url),'utf8').then(JSON.parse)));
const seed=createScenario(dataset,geocoding);
const located=seed.addresses.filter(a=>a.coordinates);
const mpl=seed.orders.filter(o=>o.ready&&o.type==='MPL'&&located.some(a=>a.id===o.addressId));
const single=mpl.filter(o=>o.slotsRequired===1),twoSlot=mpl.find(o=>o.slotsRequired===2);
const [a,b,c,d,e,f,g,h,i]=single;
const measurement=seed.orders.find(o=>o.ready&&o.type==='POMIAR'&&o.slotsRequired===1&&located.some(a=>a.id===o.addressId));

function scenarioFixture(extraWindow=false) {
  const routes=Object.fromEntries(located.map(from=>[from.id,Object.fromEntries(located.map(to=>[to.id,{status:'OK',distanceM:from.id===to.id?0:1000,estimatedDurationS:from.id===to.id?0:60,path:from.id===to.id?[]:[1]}]))]));
  const routing={schemaVersion:1,datasetId:seed.datasetId,source:{provider:'LOCAL_OSM',profile:'shortest-distance',roadsSha256:'b'.repeat(64),engineSha256:'c'.repeat(64)},segments:['_sdpH_gs~B?_pR'],routes,
    points:located.map(a=>({addressId:a.id,coordinates:a.coordinates,snap:{status:'OK',distanceM:0,coordinates:a.coordinates}}))};
  const scenario=createScenario(dataset,geocoding,routing);
  if(extraWindow)scenario.windows.push(['17:00','20:00']);
  for(const addr of scenario.addresses)addr.city='Miasto '+addr.id;
  const edge=(from,to,meters,seconds=60)=>Object.assign(scenario.routing.routes[from.addressId][to.addressId],meters===null
    ?{status:'NO_PATH',distanceM:null,estimatedDurationS:null,path:[]}
    :{status:'OK',distanceM:meters,estimatedDurationS:seconds,path:[1]});
  let plan=createPlan(scenario);
  if(extraWindow)plan.availability=plan.availability.map(row=>({...row,slots:[0,1,2,3]}));
  return {scenario,edge,plan};
}

function addBridge(s,{teamId,orders:[first,bridge,last]}){
  let start=0;
  for(const order of [first,bridge,last]){
    s.plan=applyAction(s.scenario,s.plan,{type:'ASSIGN',orderId:order.id,teamId,date,start});
    start+=order.slotsRequired;
  }
  s.plan=applyAction(s.scenario,s.plan,{type:'CONFIRM',orderId:first.id});
  s.plan.assignments.find(row=>row.orderId===bridge.id).origin='AUTO';
}

const roadHealth=(s,plan,teamId)=>{
  const view=assessBasket(s.scenario,plan,teamId,date);
  return {teamId,issues:view.issues,missing:view.legs.filter(leg=>leg.status!=='OK').map(({from,to,status})=>({from,to,status})),measurement:view.measurementExtra.status,
    orderIds:view.orders,distanceM:view.distanceM};
};
function run(name,s,groups,budgetMs){
  const beforePlan=JSON.stringify(s.plan);
  const before=evaluateDay(s.scenario,s.plan,date);
  const beforeHealth=groups.map(group=>roadHealth(s,s.plan,group.teamId));
  for(const variant of Object.keys(VARIANTS)){
    const orderIds=groups.map(group=>(group.bridge??group.orders[1]).id);
    const result=proposeDayPlan(s.scenario,s.plan,date,{variant,budgetMs,orderIds});
    assert.equal(JSON.stringify(s.plan),beforePlan);
    assert.equal(validatePlan(s.scenario,result.plan),true);
    const after=evaluateDay(s.scenario,result.plan,date,before);
    const afterHealth=groups.map(group=>roadHealth(s,result.plan,group.teamId));
    const protectedKept=s.plan.assignments.filter(x=>x.confirmed||x.origin==='MANUAL')
      .every(x=>result.plan.assignments.some(y=>JSON.stringify(y)===JSON.stringify(x)));
    const newMissing=afterHealth.flatMap((health,n)=>health.missing.filter(gap=>!beforeHealth[n].missing.some(old=>JSON.stringify(old)===JSON.stringify(gap))));
    const trulyUnchanged=JSON.stringify(result.plan)===beforePlan;
    console.log(JSON.stringify({name,variant,budgetMs,source:result.startedFrom,changes:result.changes,trulyUnchanged,protectedKept,invalid:after.invalid,
      beforeHealth,afterHealth,newMissing,legacyExplanations:name==='legacy-no-alternative'?result.explanations[orderIds[0]]:undefined}));
  }
}

{
  const s=scenarioFixture();
  const groups=[{teamId:'TEST-02',orders:[a,b,c]},{teamId:'TEST-04',orders:[d,e,f]},{teamId:'TEST-05',orders:[g,h,i]}];
  for(const {orders:[head,bridge,tail]} of groups){
    s.edge(head,bridge,20000);
    s.edge(bridge,tail,20000);
    s.edge(head,tail,40000);
    s.edge(tail,bridge,null);
    for(const {orders:[,another]} of groups)if(another!==bridge)s.edge(head,another,40000);
  }
  for(const group of groups)addBridge(s,group);
  for(const budgetMs of [0,1000])run('three-irreplaceable-bridges',s,groups,budgetMs);
}
{
  const s=scenarioFixture(true);
  const group={teamId:'TEST-02',orders:[a,twoSlot,c]};
  s.edge(a,twoSlot,5000);
  s.edge(twoSlot,c,5000);
  s.edge(a,c,7000,3700);
  addBridge(s,group);
  assert.equal(s.plan.assignments.find(x=>x.orderId===c.id).start,3);
  for(const budgetMs of [0,1000])run('two-slot-bridge-window',s,[group],budgetMs);
}
{
  const s=scenarioFixture();
  const group={teamId:'TEST-02',orders:[a,b,c]};
  s.edge(a,b,5000);
  s.edge(b,c,5000);
  s.edge(a,c,null);
  addBridge(s,group);
  // Reopen a plan against updated route data that has lost B -> C.
  s.edge(b,c,null);
  s.plan=restorePlan(s.scenario,JSON.stringify(s.plan));
  run('new-leg-within-already-unassessed-basket',s,[group],1000);
  s.plan.availability=s.plan.availability.map(row=>row.date===date&&row.teamId!=='TEST-02'?{...row,slots:[]}:row);
  run('legacy-no-alternative',s,[group],1000);
}
{
  const s=scenarioFixture(true);
  const teamId='TEST-02', group={teamId,orders:[a,measurement,b,c],bridge:b};
  s.edge(a,measurement,4000);s.edge(measurement,b,8000);s.edge(b,c,8000);
  s.edge(a,b,8000);s.edge(a,c,6000);s.edge(measurement,c,5000);
  for(const [start,order] of group.orders.entries())s.plan=applyAction(s.scenario,s.plan,{type:'ASSIGN',orderId:order.id,teamId,date,start});
  s.plan=applyAction(s.scenario,s.plan,{type:'CONFIRM',orderId:a.id});
  s.plan.assignments.find(row=>row.orderId===b.id).origin='AUTO';
  s.edge(a,b,null);s.edge(a,c,null);
  s.plan=restorePlan(s.scenario,JSON.stringify(s.plan));
  run('new-reference-leg-within-unassessed-measurement',s,[group],1000);
}
