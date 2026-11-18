import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {applyAction,createPlan,createScenario,validatePlan,placementError} from '../../map05/planner-model.mjs';
import {assessBasket} from '../../map05/routes.mjs';
import {evaluateDay,proposeDayPlan,VARIANTS} from '../../map05/optimizer.mjs';

const date='2026-11-18';
const [dataset,geocoding,savedRoutes]=await Promise.all(['addresses.json','uug-geocoding.json','local-routes.json'].map(file=>readFile(new URL('../../map05/data/'+file,import.meta.url),'utf8').then(JSON.parse)));
const unlocated=createScenario(dataset,geocoding);
const addresses=unlocated.addresses.filter(addr=>addr.coordinates);
const choices=type=>unlocated.orders.filter(o=>o.ready&&o.type===type&&o.slotsRequired===1&&addresses.some(a=>a.id===o.addressId));
const [a,b,c,d,e,f,g]=choices('MPL'),[m,n]=choices('POMIAR');
const emit=value=>console.log(JSON.stringify(value));

function fixture(extraWindow=false){
  const routes=Object.fromEntries(addresses.map(from=>[from.id,Object.fromEntries(addresses.map(to=>[to.id,{status:'OK',distanceM:from.id===to.id?0:1000,estimatedDurationS:from.id===to.id?0:60,path:from.id===to.id?[]:[1]}]))]));
  const layer={schemaVersion:1,datasetId:unlocated.datasetId,source:{provider:'LOCAL_OSM',profile:'shortest-distance',roadsSha256:'b'.repeat(64),engineSha256:'c'.repeat(64)},
    points:addresses.map(a=>({addressId:a.id,coordinates:a.coordinates,snap:{status:'OK',distanceM:0,coordinates:a.coordinates}})),segments:['_sdpH_gs~B?_pR'],routes};
  const scenario=createScenario(dataset,geocoding,layer);
  for(const addr of scenario.addresses)addr.city='Miasto '+addr.id;
  if(extraWindow)scenario.windows.push(['17:00','20:00']);
  const edge=(from,to,meters,seconds=60)=>Object.assign(scenario.routing.routes[from.addressId][to.addressId],meters===null?{status:'NO_PATH',distanceM:null,estimatedDurationS:null,path:[]}:{distanceM:meters,estimatedDurationS:seconds});
  const seed=(...baskets)=>{
    let plan=createPlan(scenario);
    if(extraWindow)plan.availability=plan.availability.map(row=>({...row,slots:[0,1,2,3]}));
    for(const [team,orders] of baskets)for(const [start,{order,origin='MANUAL',confirmed=false}] of orders.entries()){
      plan=applyAction(scenario,plan,{type:'ASSIGN',orderId:order.id,date,teamId:team,start});
      if(confirmed)plan=applyAction(scenario,plan,{type:'CONFIRM',orderId:order.id});
      plan.assignments.find(row=>row.orderId===order.id).origin=origin;
    }
    return plan;
  };
  return {scenario,edge,seed};
}
const placed=(order,origin='MANUAL',confirmed=false)=>({order,origin,confirmed});
const source=(head,bridge,tail,team='TEST-02')=>[team,[placed(head,'MANUAL',true),placed(bridge,'AUTO'),placed(tail)]];
const scoreOf=({scenario},plan)=>evaluateDay(scenario,plan,date);
const health=(scenario,plan,team)=>{const a=assessBasket(scenario,plan,team,date);return {issues:a.issues,missingRoads:a.missingRoads,extra:a.measurementExtra.status,orders:a.orders};};

function exercise(name,fixture,base,scope,budgetMs=1000){
  const snapshot=JSON.stringify(base),before=scoreOf(fixture,base);
  for(const variant of Object.keys(VARIANTS)){
    const result=proposeDayPlan(fixture.scenario,base,date,{variant,orderIds:scope.map(o=>o.id),budgetMs});
    assert.equal(JSON.stringify(base),snapshot);
    assert.equal(validatePlan(fixture.scenario,result.plan),true);
    const after=evaluateDay(fixture.scenario,result.plan,date,before);
    const teams=['TEST-02','TEST-04'];
    const beforeHealth=teams.map(team=>health(fixture.scenario,base,team));
    const afterHealth=teams.map(team=>health(fixture.scenario,result.plan,team));
    const decision={case:name,variant,budgetMs,startedFrom:result.startedFrom,violations:after.violations,invalid:after.invalid,changes:result.changes,beforeHealth,afterHealth};
    if(name==='bridge')decision.blockedAlternatives=result.explanations[b.id]?.alternatives.filter(a=>a.blocked).length;
    emit(decision);
  }
}

{
  const f=fixture();
  f.edge(a,b,20000);f.edge(b,c,20000);f.edge(a,c,40000);
  f.scenario.addresses.find(addr=>addr.id===d.addressId).city=f.scenario.addresses.find(addr=>addr.id===b.addressId).city;
  const base=f.seed(source(a,b,c),['TEST-01',[placed(d)]]);
  assert.throws(()=>applyAction(f.scenario,base,{type:'ASSIGN',orderId:b.id,teamId:'TEST-04',date,start:0}),/30 km/);
  exercise('bridge',f,base,[b]);
  const permuted=structuredClone(base);
  f.scenario.addresses.find(addr=>addr.id===c.addressId).city=f.scenario.addresses.find(addr=>addr.id===a.addressId).city;
  [permuted.assignments[1],permuted.assignments[2]]=[permuted.assignments[2],permuted.assignments[1]];
  assert.equal(scoreOf(f,base).sameTown,scoreOf(f,permuted).sameTown);
  emit({case:'same-town',equal:true,score:scoreOf(f,base).sameTown});
}
{
  const s=fixture();
  for(const [head,bridge,tail] of [[a,b,c],[d,e,f]]){
    s.edge(head,bridge,20000);s.edge(bridge,tail,20000);
    s.edge(head,tail,40000);s.edge(tail,bridge,null);
  }
  const base=s.seed(source(a,b,c),source(d,e,f,'TEST-04'));
  assert.equal(scoreOf(s,base).violations,0);
  exercise('two-bridges',s,base,[b,e],1000);
  exercise('two-bridges-plus-waiting',s,base,[b,e,g],1000);
  s.edge(a,e,40000);s.edge(d,b,40000);
  exercise('two-irreplaceable-bridges',s,base,[b,e],1000);
  exercise('two-irreplaceable-bridges-budget',s,base,[b,e],0);
}
{
  const s=fixture();
  s.edge(a,b,4000);s.edge(b,c,4000);s.edge(a,c,1000,3700);
  exercise('window',s,s.seed(source(a,b,c)),[b]);
}
{
  const s=fixture();
  s.edge(a,b,4000);s.edge(b,c,4000);s.edge(a,c,null);
  exercise('unknown-leg',s,s.seed(source(a,b,c)),[b]);
  const aPath=s.seed(source(a,b,c),['TEST-04',[placed(d),placed(e,'AUTO')]]);
  s.edge(d,e,null);
  const exchange={...aPath,assignments:aPath.assignments.map(item=>item.orderId===b.id?{...item,teamId:'TEST-04',start:2}:item.orderId===e.id?{...item,teamId:'TEST-01',start:0}:item)};
  const before=scoreOf(s,aPath),after=evaluateDay(s.scenario,exchange,date,before);
  emit({case:'unassessed-transfer',before:before.unassessedBaskets,after:after.unassessedBaskets,newMissing:health(s.scenario,exchange,'TEST-02').missingRoads,invalid:after.invalid});
  exercise('unassessed-transfer-search',s,aPath,[b,e]);
}
{
  const s=fixture();
  s.edge(a,b,20000);s.edge(b,c,20000);s.edge(a,c,40000);s.edge(a,d,40000);
  let base=s.seed(source(a,b,c));
  base={...base,availability:base.availability.map(row=>row.date===date&&row.teamId!=='TEST-02'?{...row,slots:[]}:row)};
  const result=proposeDayPlan(s.scenario,base,date,{orderIds:[b.id,d.id]});
  const reason=result.explanations[d.id];
  assert.equal(reason.status,'SKIPPED');
  assert.equal(reason.swapTried,null);
  assert.equal(result.after.violations,0);
  emit({case:'explain-swap-checked',waiting:d.id,swapTried:reason.swapTried,reason:reason.reason});
}
{
  const s=fixture(true);
  s.edge(a,m,2000);s.edge(m,n,2000);s.edge(n,c,2000);s.edge(a,c,5000);
  s.edge(a,n,18000);
  const base=s.seed(['TEST-02',[placed(a,'MANUAL',true),placed(m,'AUTO'),placed(n),placed(c)]]);
  assert.equal(health(s.scenario,base,'TEST-02').extra,'PASS');
  exercise('measurement-extra',s,base,[m]);
}
{
  const s=fixture(true);
  s.edge(a,m,4000);s.edge(m,b,8000);s.edge(b,c,8000);s.edge(a,b,8000);
  s.edge(m,c,5000);s.edge(a,c,null);
  const base=s.seed(['TEST-02',[placed(a,'MANUAL',true),placed(m),placed(b,'AUTO'),placed(c)]]);
  assert.equal(health(s.scenario,base,'TEST-02').extra,'PASS');
  const afterRemoval={...base,assignments:base.assignments.filter(row=>row.orderId!==b.id)};
  const before=scoreOf(s,base),after=evaluateDay(s.scenario,afterRemoval,date,before);
  emit({case:'unassessed-measurement-direct',before:health(s.scenario,base,'TEST-02'),after:health(s.scenario,afterRemoval,'TEST-02'),unassessedBefore:before.unassessedBaskets,unassessedAfter:after.unassessedBaskets,invalid:after.invalid});
  exercise('unassessed-measurement-search',s,base,[b]);
}
{
  const scenario=createScenario(dataset,geocoding,savedRoutes);
  const base=createPlan(scenario),start=performance.now();
  const proposal=proposeDayPlan(scenario,base,date,{budgetMs:1});
  const total=Math.round(performance.now()-start);
  const skipped=Object.values(proposal.explanations).filter(x=>x.status==='SKIPPED');
  const olderAfterEight=skipped.slice(8).filter(x=>x.olderThanScheduled);
  assert.ok(olderAfterEight.length&&olderAfterEight.every(x=>x.swapTried===null&&/jej nie sprawdzono/.test(x.note)));
  const openButSkipped=skipped.find(x=>{
    const order=scenario.orders.find(o=>o.id===x.orderId);
    return scenario.teams.some(team=>team.skills.includes(order.type)&&scenario.windows.some((_,i)=>placementError(scenario,proposal.plan,{orderId:order.id,teamId:team.id,date,start:i,origin:'AUTO',confirmed:false})===null));
  });
  emit({case:'explanations-and-budget',elapsedMs:proposal.elapsedMs,wallMs:total,truncated:proposal.truncated,notTried:olderAfterEight.map(x=>x.orderId),openButSkipped:openButSkipped?.orderId});
}
