import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {applyAction,createPlan,createScenario,restorePlan,validatePlan} from '../../map05/planner-model.mjs';
import {assessBasket} from '../../map05/routes.mjs';
import {evaluateDay,proposeDayPlan,VARIANTS} from '../../map05/optimizer.mjs';

const [data,geo]=await Promise.all(['addresses.json','uug-geocoding.json'].map(file=>readFile(new URL('../../map05/data/'+file,import.meta.url),'utf8').then(JSON.parse)));
const seed=createScenario(data,geo);
const located=seed.addresses.filter(a=>a.coordinates);
const ready=(type,slots)=>seed.orders.filter(o=>o.ready&&o.type===type&&o.slotsRequired===slots&&located.some(a=>a.id===o.addressId));
const [a,b,c,d]=ready('MPL',1),[twoSlot]=ready('MPL',2),[measurement]=ready('POMIAR',1);
const date='2026-11-18',source='TEST-02',target='TEST-01';

function fixture(extend=false){
  const routes=Object.fromEntries(located.map(from=>[from.id,Object.fromEntries(located.map(to=>[to.id,{status:'OK',distanceM:from.id===to.id?0:1000,estimatedDurationS:from.id===to.id?0:60,path:from.id===to.id?[]:[1]}]))]));
  const scenario=createScenario(data,geo,{schemaVersion:1,datasetId:seed.datasetId,source:{provider:'LOCAL_OSM',profile:'shortest-distance',roadsSha256:'b'.repeat(64),engineSha256:'c'.repeat(64)},segments:['_sdpH_gs~B?_pR'],routes,
    points:located.map(a=>({addressId:a.id,coordinates:a.coordinates,snap:{status:'OK',distanceM:0,coordinates:a.coordinates}}))});
  if(extend)scenario.windows.push(['17:00','20:00']);
  let plan=createPlan(scenario);
  if(extend)plan.availability=plan.availability.map(a=>({...a,slots:[0,1,2,3]}));
  return {
    scenario,
    get plan(){return plan;},
    place(order,teamId,start){plan=applyAction(scenario,plan,{type:'ASSIGN',orderId:order.id,teamId,date,start});},
    lock(order){plan=applyAction(scenario,plan,{type:'CONFIRM',orderId:order.id});},
    flex(order){plan.assignments.find(item=>item.orderId===order.id).origin='AUTO';},
    edge(from,to,meters,seconds=60){Object.assign(scenario.routing.routes[from.addressId][to.addressId],{distanceM:meters,estimatedDurationS:seconds});},
  };
}

function check(name,fixture,flexible,expected){
  const {scenario}=fixture,input=restorePlan(scenario,JSON.stringify(fixture.plan)),raw=JSON.stringify(input);
  const group=plan=>assessBasket(scenario,plan,source,date);
  const details=result=>({orders:result.orders,issues:result.issues.map(({key,excess})=>({key,excess})),measurementExtra:result.measurementExtra.status,installationDistance:result.installationDistance.status});
  const before=group(input),score=evaluateDay(scenario,input,date);
  for(const variant of Object.keys(VARIANTS)){
    const proposal=proposeDayPlan(scenario,input,date,{variant,orderIds:[flexible.id],budgetMs:1000});
    const after=group(proposal.plan),evaluated=evaluateDay(scenario,proposal.plan,date,score);
    const kept=proposal.plan.assignments.find(item=>item.orderId===flexible.id)?.teamId===source;
    console.log(JSON.stringify({name,variant,kept,sourceBefore:details(before),sourceAfter:details(after),resultInvalid:evaluated.invalid,changes:proposal.changes}));
    assert.equal(JSON.stringify(input),raw);
    assert.ok(validatePlan(scenario,proposal.plan));
    assert.equal(evaluated.invalid,false);
    const protectedKept=input.assignments.filter(item=>item.confirmed||item.origin==='MANUAL')
      .every(item=>proposal.plan.assignments.some(candidate=>JSON.stringify(candidate)===JSON.stringify(item)));
    assert.equal(protectedKept,true);
    expected({before,after,kept,proposal});
  }
}

for(const {extra,repair} of [{extra:4500,repair:false},{extra:3700,repair:true}]){
  const fx=fixture(true);
  fx.place(a,source,0);fx.place(twoSlot,source,1);fx.place(b,source,3);fx.lock(a);fx.flex(twoSlot);
  fx.edge(twoSlot,b,4000,4000);
  fx.edge(a,b,3000,extra);
  check(repair?'legacy-two-slot-window-reduces-existing-excess':'legacy-two-slot-window-no-worse-excess',fx,twoSlot,({before,after,kept})=>{
    const key='window/'+b.id;
    assert.equal(before.issues.find(issue=>issue.key===key)?.excess,400);
    assert.equal(after.issues.find(issue=>issue.key===key)?.excess,repair?100:400);
    assert.equal(kept,!repair);
  });
}
{
  const fx=fixture();
  fx.place(a,source,0);fx.place(measurement,source,1);fx.place(b,source,2);
  fx.place(c,target,0);fx.place(d,target,2);
  fx.lock(a);fx.lock(c);fx.flex(measurement);
  fx.edge(a,measurement,16000);fx.edge(measurement,b,8000);fx.edge(a,b,8000);
  fx.edge(c,measurement,3000);fx.edge(measurement,d,3000);fx.edge(c,d,4000);
  check('legacy-measurement-limit-can-be-repaired',fx,measurement,({before,after,kept,proposal})=>{
    assert.equal(before.measurementExtra.status,'LIMIT');
    assert.equal(after.measurementExtra.status,'NOT_APPLICABLE');
    assert.equal(assessBasket(fx.scenario,proposal.plan,target,date).measurementExtra.status,'PASS');
    assert.equal(kept,false);
  });
}
{
  const fx=fixture();
  fx.place(a,source,0);fx.place(b,source,1);fx.place(c,source,2);fx.lock(a);fx.flex(b);
  fx.edge(a,b,31000);fx.edge(b,c,7000);fx.edge(a,c,7000);
  check('legacy-distance-limit-can-be-repaired',fx,b,({before,after,kept})=>{
    assert.equal(before.installationDistance.status,'LIMIT');
    assert.equal(after.installationDistance.status,'PASS');
    assert.equal(kept,false);
  });
}
