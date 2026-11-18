import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {applyAction,createPlan,createScenario,restorePlan,validatePlan} from '../../map05/planner-model.mjs';
import {assessBasket} from '../../map05/routes.mjs';
import {evaluateDay,proposeDayPlan,VARIANTS} from '../../map05/optimizer.mjs';

const [data,geo]=await Promise.all(['addresses.json','uug-geocoding.json'].map(file=>readFile(new URL('../../map05/data/'+file,import.meta.url),'utf8').then(JSON.parse)));
const seed=createScenario(data,geo);
const located=seed.addresses.filter(a=>a.coordinates);
const ready=type=>seed.orders.filter(o=>o.ready&&o.type===type&&o.slotsRequired===1&&located.some(a=>a.id===o.addressId));
const [a,b]=ready('MPL'),[m,n]=ready('POMIAR');
const date='2026-11-18',teamId='TEST-02';

function fixture(orders,flexible,{missingReference=false}={}){
  const routes=Object.fromEntries(located.map(from=>[from.id,Object.fromEntries(located.map(to=>[to.id,{status:'OK',distanceM:from.id===to.id?0:1000,estimatedDurationS:from.id===to.id?0:60,path:from.id===to.id?[]:[1]}]))]));
  const scenario=createScenario(data,geo,{schemaVersion:1,datasetId:seed.datasetId,source:{provider:'LOCAL_OSM',profile:'shortest-distance',roadsSha256:'b'.repeat(64),engineSha256:'c'.repeat(64)},segments:['_sdpH_gs~B?_pR'],routes,
    points:located.map(a=>({addressId:a.id,coordinates:a.coordinates,snap:{status:'OK',distanceM:0,coordinates:a.coordinates}}))});
  let plan=createPlan(scenario);
  for(const [start,order] of orders.entries())plan=applyAction(scenario,plan,{type:'ASSIGN',orderId:order.id,teamId,date,start});
  plan.assignments.find(row=>row.orderId===flexible.id).origin='AUTO';
  if(missingReference)Object.assign(scenario.routing.routes[a.addressId][b.addressId],{status:'NO_PATH',distanceM:null,estimatedDurationS:null,path:[]});
  return {scenario,plan:restorePlan(scenario,JSON.stringify(plan))};
}

function health(scenario,plan){
  const assessment=assessBasket(scenario,plan,teamId,date);
  const orders=assessment.orders.map(id=>scenario.orders.find(o=>o.id===id));
  const measurements=orders.map((o,i)=>o.type==='POMIAR'?{
    id:o.id,hasInstallationBefore:orders.slice(0,i).some(x=>x.type!=='POMIAR'),
    hasInstallationAfter:orders.slice(i+1).some(x=>x.type!=='POMIAR'),
  }:null).filter(Boolean);
  return {orderIds:assessment.orders,measurements,missingLegs:assessment.legs.filter(x=>x.status!=='OK').map(({from,to,status})=>({from,to,status})),
    limits:assessment.violations,measurement:assessment.measurementExtra.status,reason:assessment.measurementExtra.reason};
}

function exercise(name,orders,flexible,options){
  const {scenario,plan}=fixture(orders,flexible,options),snapshot=JSON.stringify(plan),before=health(scenario,plan);
  const score=evaluateDay(scenario,plan,date);
  for(const variant of Object.keys(VARIANTS)){
    const proposed=proposeDayPlan(scenario,plan,date,{variant,orderIds:[flexible.id],budgetMs:1000});
    assert.equal(validatePlan(scenario,proposed.plan),true);
    assert.equal(JSON.stringify(plan),snapshot);
    const candidate=evaluateDay(scenario,proposed.plan,date,score);
    const after=health(scenario,proposed.plan);
    console.log(JSON.stringify({name,variant,invalid:candidate.invalid,before,after,changes:proposed.changes,gapsBefore:[...score.gaps],gapsAfter:[...candidate.gaps]}));
  }
}

exercise('lose-start-boundary-with-legacy-reference-gap',[a,m,b],a,{missingReference:true});
exercise('lose-end-boundary-with-legacy-reference-gap',[a,m,b],b,{missingReference:true});
exercise('lose-remaining-installation-same-legacy-gap-text',[a,m,n],a);
exercise('do-not-lose-boundary-while-reference-is-known',[a,m,b],b);
