import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createScenario,createPlan,applyAction,validatePlan,queueOrders,explainOrder,restorePlan} from '../planner-model.mjs';

const dataset=JSON.parse(await readFile(new URL('../data/addresses.json',import.meta.url),'utf8'));
const scenario=createScenario(dataset),date='2026-11-18';
const act=(plan,action)=>applyAction(scenario,plan,action);
const find=(type,slots=1)=>scenario.orders.find(o=>o.type===type&&o.slotsRequired===slots&&o.ready);

test('109 unique source addresses remain separate from synthetic orders and no coordinates are invented',()=>{
  assert.equal(scenario.addresses.length,109);assert.equal(scenario.orders.length,109);
  assert.equal(new Set(scenario.addresses.map(a=>a.id)).size,109);
  assert.ok(scenario.addresses.every(a=>a.coordinates===null&&a.region===null));
  assert.equal(dataset.quality.duplicates.length,1);
  assert.ok(scenario.orders.every(o=>o.synthetic===true));
});

test('queue is independent of planning date; new days have no implied capacity',()=>{
  const plan=createPlan(scenario);
  assert.equal(queueOrders(scenario,plan).length,109);
  const generated=act(plan,{type:'GENERATE',date:'2026-12-01'});
  assert.equal(generated.assignments.length,0);
  assert.match(explainOrder(scenario,generated,find('MPL'),'2026-12-01'),/slot/);
});

test('generator uses actual slots, qualifications and unique shared resources across days',()=>{
  const original=createPlan(scenario),plan=act(original,{type:'GENERATE',date});
  assert.equal(original.assignments.length,0,'immutable transaction');
  assert.ok(plan.assignments.length>0);validatePlan(scenario,plan);
  const next=act(plan,{type:'GENERATE',date:'2026-11-19'});
  assert.equal(new Set(next.assignments.map(a=>a.orderId)).size,next.assignments.length);
  assert.ok(next.assignments.length>plan.assignments.length);
  assert.equal(queueOrders(scenario,next).length+next.assignments.length,109);
  assert.ok(next.assignments.every(a=>a.confirmed===false));
});

test('manual moves validate skills, occupied and adjacent slots without mutating original',()=>{
  const order=find('BSA'),plan=createPlan(scenario);
  assert.throws(()=>act(plan,{type:'ASSIGN',orderId:order.id,teamId:'TEST-01',date,start:0}),/kwalifik/);
  const assigned=act(plan,{type:'ASSIGN',orderId:order.id,teamId:'TEST-02',date,start:0});
  const other=scenario.orders.find(o=>o.id!==order.id&&o.type==='BSA'&&o.ready&&o.slotsRequired===1);
  assert.throws(()=>act(assigned,{type:'ASSIGN',orderId:other.id,teamId:'TEST-02',date,start:0}),/zajęt/);
  const two=find('MPL',2);
  assert.throws(()=>act(plan,{type:'ASSIGN',orderId:two.id,teamId:'TEST-01',date,start:2}),/sąsiedni/);
  const blocked=act(plan,{type:'AVAILABILITY',teamId:'TEST-01',date,slots:[0,2]});
  assert.throws(()=>act(blocked,{type:'ASSIGN',orderId:two.id,teamId:'TEST-01',date,start:0}),/dostępn/);
  assert.equal(assigned.assignments.length,1);
});

test('availability reduction rejects occupied slots; surveys share installation capacity',()=>{
  const order=find('POMIAR');let plan=createPlan(scenario);
  plan=act(plan,{type:'ASSIGN',orderId:order.id,teamId:'TEST-02',date,start:0});
  assert.throws(()=>act(plan,{type:'AVAILABILITY',teamId:'TEST-02',date,slots:[1,2]}),/Nie można wyłączyć okna/);
  assert.throws(()=>act(plan,{type:'ASSIGN',orderId:find('MPL').id,teamId:'TEST-02',date,start:0}),/zajęt/);
  assert.equal(plan.availability.find(a=>a.teamId==='TEST-02'&&a.date===date).slots.length,3);
});

for(const item of [
  {name:'single occupied slot',required:1,start:1,slots:[0,2],window:'11:00–14:00',confirmed:false},
  {name:'first slot of a two-slot visit',required:2,start:0,slots:[1,2],window:'08:00–11:00',confirmed:false},
  {name:'second slot of a two-slot visit',required:2,start:0,slots:[0,2],window:'11:00–14:00',confirmed:false},
  {name:'second slot of a confirmed two-slot visit',required:2,start:1,slots:[0,1],window:'14:00–17:00',confirmed:true},
])test(`closing ${item.name} reports its window, team, date and order without changing the plan`,()=>{
  const order=find('MPL',item.required),teamId='TEST-02',day='2026-11-19';
  let plan=act(createPlan(scenario),{type:'ASSIGN',orderId:order.id,teamId,date:day,start:item.start});
  if(item.confirmed)plan=act(plan,{type:'CONFIRM',orderId:order.id});
  const original=structuredClone(plan);
  assert.throws(()=>act(plan,{type:'AVAILABILITY',teamId,date:day,slots:item.slots}),error=>{
    assert.match(error.message,/Nie można wyłączyć okna/);
    for(const text of [item.window,teamId,day,order.id])assert.ok(error.message.includes(text),`Missing ${text}: ${error.message}`);
    assert.match(error.message,/Najpierw przenieś zlecenie lub przywróć je do kolejki/);
    return true;
  });
  assert.deepEqual(plan,original);
});

test('free windows remain editable when the same slot is occupied on another team or day',()=>{
  const order=find('MPL');
  const original=act(createPlan(scenario),{type:'ASSIGN',orderId:order.id,teamId:'TEST-02',date,start:0});
  const closed=act(original,{type:'AVAILABILITY',teamId:'TEST-02',date,slots:[0,2]});
  assert.deepEqual(closed.availability.find(a=>a.teamId==='TEST-02'&&a.date===date).slots,[0,2]);
  const reopened=act(closed,{type:'AVAILABILITY',teamId:'TEST-02',date,slots:[0,1,2]});
  assert.deepEqual(reopened,original);
  for(const [teamId,day] of [['TEST-01',date],['TEST-02','2026-11-19']]) {
    const other=act(original,{type:'AVAILABILITY',teamId,date:day,slots:[1,2]});
    assert.deepEqual(other.availability.find(a=>a.teamId===teamId&&a.date===day).slots,[1,2]);
    assert.deepEqual(other.assignments,original.assignments);
  }
  assert.deepEqual(original.availability.find(a=>a.teamId==='TEST-02'&&a.date===date).slots,[0,1,2]);
});

test('regeneration preserves manual and confirmed proposals and protects agreed windows',()=>{
  let plan=createPlan(scenario);const order=find('MPL');
  plan=act(plan,{type:'ASSIGN',orderId:order.id,teamId:'TEST-01',date,start:0});
  const manual=structuredClone(plan.assignments[0]);
  plan=act(plan,{type:'GENERATE',date});assert.deepEqual(plan.assignments.find(a=>a.orderId===order.id),manual);
  plan=act(plan,{type:'CONFIRM',orderId:order.id});
  assert.throws(()=>act(plan,{type:'REMOVE',orderId:order.id}),/potwierdz/);
  assert.throws(()=>act(plan,{type:'ASSIGN',orderId:order.id,teamId:'TEST-01',date,start:1}),/potwierdz/);
  assert.throws(()=>act(plan,{type:'UNCONFIRM',orderId:order.id,reason:''}),/powód/);
  const generated=act(plan,{type:'GENERATE',date});
  assert.equal(generated.assignments.find(a=>a.orderId===order.id).confirmed,true);
  const unlocked=act(plan,{type:'UNCONFIRM',orderId:order.id,reason:'Test korekty'});
  assert.equal(act(unlocked,{type:'REMOVE',orderId:order.id}).assignments.some(a=>a.orderId===order.id),false);
});

test('not ready orders stay in queue and cannot be forced into a basket',()=>{
  const order=scenario.orders.find(o=>!o.ready),plan=createPlan(scenario);
  assert.match(explainOrder(scenario,plan,order,date),/gotowoś/);
  assert.throws(()=>act(plan,{type:'ASSIGN',orderId:order.id,teamId:'TEST-02',date,start:0}),/gotowoś/);
});

test('moving a released confirmation preserves its reason through JSON export and import',()=>{
  const order=find('MPL'),reason='Zmiana dnia na prośbę klienta';
  let plan=act(createPlan(scenario),{type:'ASSIGN',orderId:order.id,teamId:'TEST-01',date,start:0});
  plan=act(plan,{type:'CONFIRM',orderId:order.id});
  plan=act(plan,{type:'UNCONFIRM',orderId:order.id,reason});
  const original=structuredClone(plan);
  const moved=act(plan,{type:'ASSIGN',orderId:order.id,teamId:'TEST-04',date:'2026-11-19',start:1});
  assert.equal(moved.assignments.find(a=>a.orderId===order.id).releaseReason,reason);
  const restored=restorePlan(scenario,JSON.stringify(moved));
  assert.equal(restored.assignments.find(a=>a.orderId===order.id).releaseReason,reason);
  assert.deepEqual(restored,moved);
  assert.deepEqual(plan,original);
});

test('manual removal is held out of regeneration for that day until explicitly included',()=>{
  let plan=act(createPlan(scenario),{type:'GENERATE',date});
  const id=plan.assignments[0].orderId;
  plan=act(plan,{type:'REMOVE',orderId:id});
  assert.match(explainOrder(scenario,plan,scenario.orders.find(o=>o.id===id),date),/Ręcznie/);
  const held=act(plan,{type:'GENERATE',date});
  assert.equal(held.assignments.some(a=>a.orderId===id),false);
  const restored=restorePlan(scenario,JSON.stringify(held));
  assert.equal(act(restored,{type:'GENERATE',date}).assignments.some(a=>a.orderId===id),false);
  const included=act(restored,{type:'ALLOW_AUTO',orderId:id,date});
  assert.equal(act(included,{type:'GENERATE',date}).assignments.some(a=>a.orderId===id),true);
});

test('roundtrip validates dataset, shape, duplicate orders and conflicts on import',()=>{
  const plan=act(createPlan(scenario),{type:'GENERATE',date});
  assert.deepEqual(restorePlan(scenario,JSON.stringify(plan)),plan);
  assert.throws(()=>restorePlan(scenario,JSON.stringify({...plan,datasetId:'other'})),/zbior/);
  assert.throws(()=>restorePlan(scenario,JSON.stringify({...plan,assignments:[...plan.assignments,plan.assignments[0]]})),/dwukrotnie/);
  assert.throws(()=>restorePlan(scenario,'{}'),/wersj/);
  assert.throws(()=>restorePlan(scenario,JSON.stringify({...plan,availability:[{teamId:'TEST-01',date,slots:[99]}]})),/slot/);
});
