// MAP-07B optimizer: hard rules, protection of confirmed/manual assignments, determinism, explanations. Real saved local roads, no network.
import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createScenario,createPlan,applyAction,validatePlan,placementError} from '../planner-model.mjs';
import {assessBasket} from '../routes.mjs';
import {proposeDayPlan,reorderBaskets,evaluateDay,eligibility,diffPlans,VARIANTS,RULE_STATUS} from '../optimizer.mjs';
const [dataset,geocoding,routes]=await Promise.all(['addresses.json','uug-geocoding.json','local-routes.json'].map(name=>readFile(new URL('../data/'+name,import.meta.url),'utf8').then(JSON.parse)));
const scenario=createScenario(dataset,geocoding,routes);
const DATE='2026-11-19';
const strip=result=>JSON.stringify({plan:result.plan,changes:result.changes,after:result.after.count});
const protectedPlan=()=>{
  let plan=createPlan(scenario);
  plan=applyAction(scenario,plan,{type:'ASSIGN',orderId:'TEST-075',teamId:'TEST-03',date:DATE,start:0});
  plan=applyAction(scenario,plan,{type:'ASSIGN',orderId:'TEST-090',teamId:'TEST-01',date:DATE,start:1});
  return applyAction(scenario,plan,{type:'CONFIRM',orderId:'TEST-075'});
};

test('every variant yields a valid plan without limit violations and never mutates its input',()=>{
  const start=protectedPlan(),snapshot=JSON.stringify(start);
  for(const variant of Object.keys(VARIANTS)) {
    const result=proposeDayPlan(scenario,start,DATE,{variant,budgetMs:4000});
    assert.equal(JSON.stringify(start),snapshot,`${variant} mutated the input`);
    assert.equal(validatePlan(scenario,result.plan),true);
    for(const team of scenario.teams)assert.deepEqual(assessBasket(scenario,result.plan,team.id,DATE).violations,[],`${variant} ${team.id}`);
    assert.equal(result.simulation,true);assert.equal(result.variant,variant);
    assert.ok(result.after.count>=result.before.count);
  }
});

test('confirmed and manual assignments and other days are untouched',()=>{
  let start=protectedPlan();
  start=applyAction(scenario,start,{type:'GENERATE',date:'2026-11-20'});
  const result=proposeDayPlan(scenario,start,DATE,{budgetMs:4000});
  for(const item of start.assignments.filter(a=>a.confirmed||a.origin==='MANUAL'))assert.ok(result.plan.assignments.some(b=>JSON.stringify(b)===JSON.stringify(item)),`${item.orderId} must stay as is`);
  const other=plan=>JSON.stringify(plan.assignments.filter(a=>a.date!==DATE));
  assert.equal(other(result.plan),other(start));
  assert.ok(result.excluded.some(item=>item.orderId==='TEST-075'&&/chronion/i.test(item.reason)));
});

test('a proposal is at least as good as the current generator for the same day on its own objective',()=>{
  const generated=applyAction(scenario,createPlan(scenario),{type:'GENERATE',date:DATE});
  const generatedFigures=evaluateDay(scenario,generated,DATE);
  const coverage=proposeDayPlan(scenario,createPlan(scenario),DATE,{variant:'COVERAGE_FIRST',budgetMs:4000});
  assert.ok(coverage.after.count>=generatedFigures.count);
  assert.ok(coverage.after.count>generatedFigures.count||coverage.after.ageSum>=generatedFigures.ageSum);
  const oldest=figures=>{for(let i=Math.max(figures.ageHist.length,generatedFigures.ageHist.length)-1;i>=0;i--){const d=(figures.ageHist[i]??0)-(generatedFigures.ageHist[i]??0);if(d)return d;}return 0;};
  const age=proposeDayPlan(scenario,createPlan(scenario),DATE,{variant:'AGE_FIRST',budgetMs:4000});
  assert.ok(oldest(age.after)>=0,'seniority never worse than the generator');
  assert.ok(coverage.after.km<generatedFigures.km||coverage.after.count>generatedFigures.count,'frozen dataset: shorter or fuller than the generator');
});

test('results are deterministic when the time budget is not the limiting factor',()=>{
  const a=proposeDayPlan(scenario,createPlan(scenario),DATE,{budgetMs:20000}),b=proposeDayPlan(scenario,createPlan(scenario),DATE,{budgetMs:20000});
  assert.equal(a.truncated,false);assert.equal(strip(a),strip(b));
});

test('a tiny time budget still returns a valid plan and reports truncation honestly',()=>{
  const result=proposeDayPlan(scenario,createPlan(scenario),DATE,{budgetMs:1});
  assert.equal(validatePlan(scenario,result.plan),true);assert.equal(result.truncated,true);
  for(const team of scenario.teams)assert.deepEqual(assessBasket(scenario,result.plan,team.id,DATE).violations,[]);
});

test('seven unlocated points, not-ready orders and manual exclusions are never planned and carry a reason',()=>{
  const unlocated=scenario.orders.filter(order=>!scenario.routing.points.some(point=>point.addressId===order.addressId));
  assert.equal(new Set(unlocated.map(order=>order.addressId)).size,7);
  const result=proposeDayPlan(scenario,createPlan(scenario),DATE,{budgetMs:4000});
  const planned=new Set(result.plan.assignments.map(a=>a.orderId));
  for(const order of unlocated) {assert.ok(!planned.has(order.id));assert.equal(result.explanations[order.id].status,'EXCLUDED');assert.match(result.explanations[order.id].reason,/lokalizacji|punktu dostępu|gotowości/);}
  for(const order of scenario.orders.filter(order=>!order.ready))assert.ok(!planned.has(order.id));
  const first=result.plan.assignments.find(a=>a.date===DATE&&a.origin==='AUTO'),removed=applyAction(scenario,result.plan,{type:'REMOVE',orderId:first.orderId});
  const again=proposeDayPlan(scenario,removed,DATE,{budgetMs:4000});
  assert.ok(!again.plan.assignments.some(a=>a.orderId===first.orderId),'a manual exclusion for the day is respected');
  assert.match(again.explanations[first.orderId].reason,/Ręcznie pozostawione/);
});

test('every considered order has an explanation: alternatives with deltas, or the reason for skipping, with old orders flagged',()=>{
  const result=proposeDayPlan(scenario,createPlan(scenario),DATE,{budgetMs:4000});
  const scheduled=Object.values(result.explanations).filter(item=>item.status==='SCHEDULED'),skipped=Object.values(result.explanations).filter(item=>item.status==='SKIPPED');
  assert.ok(scheduled.length>=10&&skipped.length>10);
  for(const item of scheduled) {
    assert.match(item.reason,/Rozważono 5 koszyków/);assert.equal(item.consideredBaskets,5);
    assert.ok(item.alternatives.every(alt=>typeof alt.verdict==='string'&&alt.verdict.length>5));
    for(const alt of item.alternatives.filter(alt=>!alt.blocked))assert.ok(Number.isFinite(alt.deltaM)&&Number.isFinite(alt.deltaS));
  }
  for(const item of skipped)assert.ok(item.reason.length>20&&Array.isArray(item.blockedBy));
  const oldestSkipped=skipped.sort((a,b)=>b.ageDays-a.ageDays)[0];
  assert.ok(oldestSkipped.ageDays>=0);
  if(oldestSkipped.olderThanScheduled)assert.match(oldestSkipped.note,/budżetem czasu/);
  assert.ok(RULE_STATUS.confirmed.length&&RULE_STATUS.simulation.length&&RULE_STATUS.notApplied.length);
});

test('change list matches the plans and a swap is not reported as a loss of the planned orders',()=>{
  const start=applyAction(scenario,createPlan(scenario),{type:'GENERATE',date:DATE});
  const result=proposeDayPlan(scenario,start,DATE,{budgetMs:4000});
  assert.deepEqual(diffPlans(scenario,start,result.plan,DATE),result.changes);
  const applied=new Map(start.assignments.map(a=>[a.orderId,a]));
  for(const change of result.changes) {
    if(change.type==='ADDED')assert.ok(!applied.has(change.orderId));
    if(change.type==='MOVED'||change.type==='REMOVED')assert.ok(applied.has(change.orderId));
  }
});

test('MAP-07A reordering never lengthens a basket, keeps orders, occupied slots and protected visits',()=>{
  const generated=applyAction(scenario,createPlan(scenario),{type:'GENERATE',date:DATE});
  const result=reorderBaskets(scenario,generated,DATE);
  assert.equal(validatePlan(scenario,result.plan),true);
  for(const team of scenario.teams) {
    const before=assessBasket(scenario,generated,team.id,DATE),after=assessBasket(scenario,result.plan,team.id,DATE);
    assert.deepEqual([...after.orders].sort(),[...before.orders].sort());
    assert.deepEqual(after.violations,[]);
    assert.ok((after.distanceM??0)<=(before.distanceM??0)+1);
  }
  const byId=new Map(scenario.orders.map(order=>[order.id,order]));
  const slotsOf=plan=>plan.assignments.flatMap(a=>Array.from({length:byId.get(a.orderId).slotsRequired},(_,i)=>`${a.teamId}/${a.date}/${a.start+i}`)).sort().join();
  assert.equal(slotsOf(result.plan),slotsOf(generated));
  const confirmed=applyAction(scenario,generated,{type:'CONFIRM',orderId:generated.assignments.find(a=>a.date===DATE).orderId});
  const kept=confirmed.assignments.find(a=>a.confirmed);
  const stable=reorderBaskets(scenario,confirmed,DATE).plan.assignments.find(a=>a.orderId===kept.orderId);
  assert.equal(stable.start,kept.start);assert.equal(stable.teamId,kept.teamId);
});

test('a proposal cannot be built on a plan from another dataset and eligibility explains exclusions',()=>{
  assert.throws(()=>proposeDayPlan(scenario,{...createPlan(scenario),datasetId:'other'},DATE),/innego zbioru/);
  const {pool,excluded}=eligibility(scenario,protectedPlan(),DATE);
  assert.ok(pool.length>50&&excluded.length>10);
  assert.ok(excluded.every(item=>item.reason.length>5));
  assert.equal(placementError(scenario,createPlan(scenario),{orderId:'TEST-001',teamId:'TEST-01',date:DATE,start:0,origin:'AUTO',confirmed:false})?.kind,'resource');
});

test('the modules still concatenate into the single offline script scope without duplicate top-level names',async()=>{
  // build_planner.py strips imports/exports and concatenates the modules; a clash is a SyntaxError that module-based tests cannot see.
  const names=['locations.mjs','routes.mjs','planner-model.mjs','optimizer.mjs','map.mjs','planner-map.mjs','operational-map.mjs','embedded-data.mjs','road-tiles.mjs','road-tile-client.mjs','maplibre-view.mjs','planner.mjs'];
  const parts=await Promise.all(names.map(name=>readFile(new URL('../'+name,import.meta.url),'utf8')));
  const build=await readFile(new URL('../build_planner.py',import.meta.url),'utf8');
  for(const name of names)assert.ok(build.includes(`'${name}'`),`${name} is part of the offline build`);
  const body=parts.map(part=>part.replace(/^export (function|const|class|async function) /gm,'$1 ').replace(/^import[^\n]*\n/gm,'')).join('\n');
  assert.doesNotThrow(()=>new vm.Script('(function(){"use strict";\n'+body+'\n})();'));
});
