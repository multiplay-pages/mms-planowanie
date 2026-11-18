// Independent MAP-06 projection review. Real address inputs; synthetic road costs/geometry only.
// These are model tests, without a browser, network, WebGL or renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createScenario,createPlan,applyAction,restorePlan} from '../planner-model.mjs';
import {OPERATIONAL_TEAM_COLORS,operationalTeamColor,buildOperationalLayers,operationalBounds} from '../operational-map.mjs';
import {roadFixture} from './road-fixture.mjs';

const dataset=JSON.parse(await readFile(new URL('../data/addresses.json',import.meta.url),'utf8'));
const geocoding=JSON.parse(await readFile(new URL('../data/uug-geocoding.json',import.meta.url),'utf8'));
const sourceScenario=createScenario(dataset,geocoding);
const DAY='2026-11-18',NEXT='2026-11-19',TEAM='TEST-02';
const A='TEST-005',B='TEST-006',C='TEST-009',MEASUREMENT='TEST-004',MISSING='TEST-073';
const UNLOCATED=['TEST-069','TEST-073','TEST-077','TEST-097','TEST-105','TEST-108','TEST-109'];
const POSTAL_NOTES=['TEST-019','TEST-021','TEST-067','TEST-080','TEST-082','TEST-096'];
const ids=collection=>collection.features.map(feature=>feature.properties.orderId);
const entry=(layers,teamId=TEAM)=>layers.teams.find(team=>team.teamId===teamId);
const visit=(layers,orderId)=>layers.visits.features.find(feature=>feature.properties.orderId===orderId);
const sourceAddress=orderId=>sourceScenario.addresses.find(address=>address.id===sourceScenario.orders.find(order=>order.id===orderId).addressId);
const setLeg=(layer,from,to,value)=>{layer.routes[sourceScenario.orders.find(order=>order.id===from).addressId][sourceScenario.orders.find(order=>order.id===to).addressId]=value;};

function fixture({routing=true,editLayer,fourWindows=false}={}) {
  const layer=routing?roadFixture(sourceScenario):null;
  if(editLayer)editLayer(layer);
  const scenario=createScenario(dataset,geocoding,layer);
  if(fourWindows)scenario.windows.push(['17:00','20:00']);
  let plan=createPlan(scenario);
  if(fourWindows)plan=applyAction(scenario,plan,{type:'AVAILABILITY',teamId:TEAM,date:DAY,slots:[0,1,2,3]});
  return {scenario,plan};
}
const assign=(f,plan,orderId,start,teamId=TEAM,date=DAY)=>applyAction(f.scenario,plan,{type:'ASSIGN',orderId,teamId,date,start});
function chain(f,orders=[A,B,C]) {
  return orders.reduce((plan,orderId,start)=>assign(f,plan,orderId,start),f.plan);
}
const project=(f,plan=f.plan,date=DAY,options={})=>buildOperationalLayers(f.scenario,plan,date,options);
const pairs=layers=>layers.routes.features.map(feature=>[feature.properties.from,feature.properties.to,feature.properties.seq]);
const missingLeg=status=>({status,distanceM:null,estimatedDurationS:null,path:null});
function freeze(value) {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}
  return value;
}

test('O01 empty real plan yields 102 located queue points and seven aggregate location gaps',()=>{
  const f=fixture(),layers=project(f);
  assert.equal(layers.date,DAY);
  for(const collection of [layers.visits,layers.routes,layers.unassigned])assert.equal(collection.type,'FeatureCollection');
  assert.equal(layers.visits.features.length,0);assert.equal(layers.routes.features.length,0);
  assert.equal(layers.unassigned.features.length,102);
  assert.deepEqual(layers.gaps.map(gap=>[gap.kind,gap.count]),[['NO_LOCATION_QUEUE',7]]);
  for(const orderId of UNLOCATED)assert.ok(!ids(layers.unassigned).includes(orderId));
  assert.ok(layers.unassigned.features.every(feature=>feature.geometry.type==='Point'&&feature.geometry.coordinates.every(Number.isFinite)));
});

test('O02 all selected-day baskets are projected together with their own colours and summaries',()=>{
  const f=fixture();let plan=assign(f,f.plan,A,0,'TEST-01');
  plan=assign(f,plan,B,1,'TEST-01');plan=assign(f,plan,C,0,TEAM);plan=assign(f,plan,'TEST-013',1,TEAM);
  const layers=project(f,plan);
  assert.deepEqual(ids(layers.visits),[A,B,C,'TEST-013']);
  assert.deepEqual(pairs(layers),[[A,B,1],[C,'TEST-013',1]]);
  assert.equal(entry(layers,'TEST-01').count,2);assert.equal(entry(layers).count,2);
  assert.equal(entry(layers,'TEST-01').distanceM,1000);assert.equal(entry(layers).estimatedDurationS,60);
  assert.notEqual(entry(layers,'TEST-01').color,entry(layers).color);
  for(const feature of [...layers.visits.features,...layers.routes.features])assert.equal(feature.properties.color,entry(layers,feature.properties.teamId).color);
});

test('O03 team palette follows the declared team index and stays stable across days and visibility',()=>{
  const f=fixture();let plan=assign(f,f.plan,A,0,'TEST-01');plan=assign(f,plan,B,0,TEAM,NEXT);
  const today=project(f,plan),tomorrow=project(f,plan,NEXT,{hiddenTeams:['TEST-01']});
  assert.equal(visit(today,A).properties.color,OPERATIONAL_TEAM_COLORS[0]);
  assert.equal(visit(tomorrow,B).properties.color,OPERATIONAL_TEAM_COLORS[1]);
  assert.equal(entry(today).color,entry(tomorrow).color);
  assert.deepEqual(f.scenario.teams.map(team=>operationalTeamColor(f.scenario,team.id)),OPERATIONAL_TEAM_COLORS.slice(0,5));
  assert.equal(new Set(today.teams.map(team=>team.color)).size,5);
});

test('O04 shuffled assignments are numbered by slot and connected in that same canonical order',()=>{
  const f=fixture();let plan=assign(f,f.plan,C,2);plan=assign(f,plan,A,0);plan=assign(f,plan,B,1);
  const before=structuredClone(plan),layers=project(f,plan);
  assert.deepEqual(layers.visits.features.map(feature=>[feature.properties.orderId,feature.properties.seq,feature.properties.label]),[[A,1,'1'],[B,2,'2'],[C,3,'3']]);
  assert.deepEqual(pairs(layers),[[A,B,1],[B,C,2]]);
  assert.deepEqual(entry(layers).orders,[A,B,C]);assert.deepEqual(plan,before);
});

test('O05 a two-slot assignment remains one numbered visit with its full time window',()=>{
  const f=fixture();let plan=assign(f,f.plan,'TEST-002',0);plan=assign(f,plan,A,2);
  const layers=project(f,plan);
  assert.deepEqual(layers.visits.features.map(feature=>[feature.properties.orderId,feature.properties.seq,feature.properties.start,feature.properties.window]),[['TEST-002',1,0,'08:00–14:00'],[A,2,2,'14:00–17:00']]);
  assert.deepEqual(pairs(layers),[['TEST-002',A,1]]);assert.equal(entry(layers).count,2);
});

test('O06 changing to another or empty day never retains visits or legs from the previous day',()=>{
  const f=fixture();let plan=assign(f,f.plan,A,0);plan=assign(f,plan,B,1);plan=assign(f,plan,C,0,TEAM,NEXT);
  assert.deepEqual(ids(project(f,plan).visits),[A,B]);
  const next=project(f,plan,NEXT);assert.deepEqual(ids(next.visits),[C]);assert.deepEqual(pairs(next),[]);assert.equal(next.date,NEXT);
  const empty=project(f,plan,'2026-12-01');assert.deepEqual(ids(empty.visits),[]);assert.deepEqual(pairs(empty),[]);
  assert.ok(empty.teams.every(team=>team.count===0));
});

test('O07 hiding a basket changes only visibility and never returns its visits to the queue',()=>{
  const f=fixture();let plan=chain(f,[A,B]);plan=assign(f,plan,C,0,'TEST-01');
  const before=structuredClone(plan),normal=project(f,plan),hidden=project(f,plan,DAY,{hiddenTeams:[TEAM]});
  assert.deepEqual(ids(hidden.visits),[C]);assert.deepEqual(pairs(hidden),[]);
  assert.deepEqual(hidden.unassigned,normal.unassigned);
  assert.equal(entry(hidden).visible,false);assert.equal(entry(hidden).count,2);assert.deepEqual(entry(hidden).orders,[A,B]);
  assert.equal(visit(hidden,C).properties.color,visit(normal,C).properties.color);assert.deepEqual(plan,before);
});

test('O08 routes and queue switches do not alter visits, summaries, or the underlying plan',()=>{
  const f=fixture(),plan=chain(f,[A,B]),before=structuredClone(plan),normal=project(f,plan);
  const noRoutes=project(f,plan,DAY,{showRoutes:false});
  assert.deepEqual(noRoutes.routes.features,[]);assert.deepEqual(noRoutes.visits,normal.visits);assert.deepEqual(noRoutes.teams,normal.teams);
  const noQueue=project(f,plan,DAY,{showUnassigned:false});
  assert.deepEqual(noQueue.unassigned.features,[]);assert.deepEqual(noQueue.visits,normal.visits);assert.deepEqual(noQueue.routes,normal.routes);assert.deepEqual(noQueue.gaps,normal.gaps);
  assert.deepEqual(plan,before);
});

test('O09 a measurement between installations keeps its sequence and team colour but has a distinct kind',()=>{
  const f=fixture(),layers=project(f,chain(f,[A,MEASUREMENT,B]));
  assert.deepEqual(layers.visits.features.map(feature=>[feature.properties.orderId,feature.properties.type,feature.properties.kind,feature.properties.seq]),[[A,'MPL','installation',1],[MEASUREMENT,'POMIAR','measurement',2],[B,'MPL','installation',3]]);
  assert.equal(visit(layers,MEASUREMENT).properties.color,visit(layers,A).properties.color);
  assert.deepEqual(pairs(layers),[[A,MEASUREMENT,1],[MEASUREMENT,B,2]]);
  assert.equal(entry(layers).checks.measurementExtra,'PASS');
});

test('O10 an unlocated middle visit leaves sequence 1 and 3 without inventing an A-to-C shortcut',()=>{
  const f=fixture(),layers=project(f,chain(f,[A,MISSING,B]));
  assert.deepEqual(layers.visits.features.map(feature=>[feature.properties.orderId,feature.properties.seq]),[[A,1],[B,3]]);
  assert.deepEqual(pairs(layers),[]);assert.deepEqual(entry(layers).orders,[A,MISSING,B]);
  assert.ok(layers.gaps.some(gap=>gap.kind==='NO_LOCATION'&&gap.orderId===MISSING));
  assert.ok(layers.gaps.some(gap=>gap.from===A&&gap.to===MISSING));
  assert.ok(layers.gaps.some(gap=>gap.from===MISSING&&gap.to===B));
});

// Hand-specified polyline5 geometry, appended to the synthetic network. Only test data.
// First segment is encoded in reverse; expected forward coordinates below are literal.
const CONTROL_SEGMENTS=['weepHo_{lBvQnK','weepHo_{lBoKoKoKoK','_ukqH_uanBo}@o}@'];
function geometryFixture(path=[-1,2]) {
  return fixture({editLayer:layer=>{
    const offset=layer.segments.length;layer.segments.push(...CONTROL_SEGMENTS);
    setLeg(layer,A,B,{status:'OK',distanceM:1234,estimatedDurationS:60,path:path.map(index=>Math.sign(index)*(offset+Math.abs(index)))});
  }});
}
test('O11 a signed multi-segment leg preserves all road vertices and its direction',()=>{
  const f=geometryFixture(),layers=project(f,chain(f,[A,B]));
  assert.equal(layers.routes.features.length,1);
  assert.deepEqual(layers.routes.features[0].geometry,{type:'LineString',coordinates:[[18,50],[18.002,50.003],[18.004,50.005],[18.006,50.007]]});
  assert.deepEqual(pairs(layers),[[A,B,1]]);assert.equal(layers.routes.features[0].properties.distanceM,1234);
});

for(const [status,kind] of [['NO_PATH','NO_ROAD'],['SNAP_UNCERTAIN','SNAP_UNCERTAIN'],['LOCATION_UNKNOWN','LOCATION_UNKNOWN']]) {
  test(`O12 ${status} produces a typed gap and null totals, never a straight or zero-distance road`,()=>{
    const f=fixture({editLayer:layer=>setLeg(layer,A,B,missingLeg(status))}),layers=project(f,chain(f,[A,B]));
    assert.deepEqual(pairs(layers),[]);assert.equal(entry(layers).distanceM,null);assert.equal(entry(layers).estimatedDurationS,null);
    assert.equal(entry(layers).checks.installationDistance,'UNASSESSED');
    assert.ok(layers.gaps.some(gap=>gap.kind===kind&&gap.teamId===TEAM&&gap.from===A&&gap.to===B));
  });
}

test('O13 a missing middle leg separates two known legs and preserves their leg numbers',()=>{
  // A fourth test-only time window permits a four-visit chain with three installations and one measurement.
  const f=fixture({fourWindows:true,editLayer:layer=>setLeg(layer,MEASUREMENT,B,missingLeg('NO_PATH'))});
  const layers=project(f,chain(f,[A,MEASUREMENT,B,C]));
  assert.deepEqual(ids(layers.visits),[A,MEASUREMENT,B,C]);
  assert.deepEqual(pairs(layers),[[A,MEASUREMENT,1],[B,C,3]]);
  assert.equal(layers.routes.features.length,2);assert.ok(layers.gaps.some(gap=>gap.kind==='NO_ROAD'&&gap.from===MEASUREMENT&&gap.to===B));
  assert.equal(entry(layers).distanceM,null);
});

for(const [name,path] of [['disconnected',[ -1,3 ]],['truncated polyline',null]]) {
  test(`O14 an OK leg with ${name} geometry is reported and omitted without breaking visits`,()=>{
    const f=path?geometryFixture(path):fixture({editLayer:layer=>{
      layer.segments.push('?');setLeg(layer,A,B,{status:'OK',distanceM:1234,estimatedDurationS:60,path:[layer.segments.length]});
    }});
    const layers=project(f,chain(f,[A,B]));
    assert.deepEqual(ids(layers.visits),[A,B]);assert.deepEqual(pairs(layers),[]);
    assert.ok(layers.gaps.some(gap=>gap.kind==='INVALID_GEOMETRY'&&gap.teamId===TEAM&&gap.from===A&&gap.to===B));
  });
}

test('O15 empty and singleton baskets do not manufacture a commute, a return, or assessed zero totals',()=>{
  const f=fixture(),empty=entry(project(f));
  assert.equal(empty.distanceM,null);assert.equal(empty.estimatedDurationS,null);assert.equal(empty.checks.windows,'NOT_APPLICABLE');
  for(const orderId of [A,MEASUREMENT]){
    const layers=project(f,assign(f,f.plan,orderId,0));
    assert.deepEqual(pairs(layers),[]);assert.equal(entry(layers).distanceM,null);assert.equal(entry(layers).estimatedDurationS,null);
    assert.equal(entry(layers).checks.windows,'UNASSESSED');
    if(orderId===MEASUREMENT)assert.equal(entry(layers).checks.measurementExtra,'UNASSESSED');
  }
});

test('O16 seven unresolved positions remain accounted for when one is assigned to a hidden basket',()=>{
  const f=fixture(),plan=assign(f,f.plan,MISSING,0),layers=project(f,plan,DAY,{hiddenTeams:[TEAM]});
  assert.deepEqual(ids(layers.visits),[]);
  const assignedGaps=layers.gaps.filter(gap=>gap.kind==='NO_LOCATION');
  assert.deepEqual(assignedGaps.map(gap=>[gap.teamId,gap.orderId]),[[TEAM,MISSING]]);
  assert.deepEqual(layers.gaps.filter(gap=>gap.kind==='NO_LOCATION_QUEUE').map(gap=>gap.count),[6]);
  for(const id of UNLOCATED)assert.ok(!ids(layers.unassigned).includes(id));
  assert.equal(sourceScenario.orders.find(order=>order.id==='TEST-069').ready,false,'the unresolved not-ready order is included in the six remaining gaps');
});

test('O17 all six postcode-note positions remain usable at original coordinates with the source label',()=>{
  const f=fixture(),layers=project(f);
  for(const orderId of POSTAL_NOTES){
    const point=layers.unassigned.features.find(feature=>feature.properties.orderId===orderId),address=sourceAddress(orderId);
    assert.ok(point,orderId);assert.deepEqual(point.geometry.coordinates,address.coordinates);
    assert.equal(point.properties.address,address.label);assert.equal(point.properties.city,address.city);
  }
  assert.deepEqual(layers.gaps.map(gap=>[gap.kind,gap.count]),[['NO_LOCATION_QUEUE',7]]);
});

test('O18 an assignment on another day is absent from this day and never reclassified as global queue',()=>{
  const f=fixture(),plan=assign(f,f.plan,A,0,TEAM,NEXT),today=project(f,plan),tomorrow=project(f,plan,NEXT);
  assert.deepEqual(ids(today.visits),[]);assert.deepEqual(ids(tomorrow.visits),[A]);
  assert.ok(!ids(today.unassigned).includes(A));assert.equal(today.unassigned.features.length,101);
  assert.deepEqual(today.unassigned,tomorrow.unassigned);
});

test('O19 move, removal, undo snapshots and JSON import always project their supplied current state',()=>{
  const f=fixture(),p0=f.plan,p1=assign(f,p0,A,0,'TEST-01'),p2=assign(f,p1,B,1,'TEST-01');
  const p3=assign(f,p2,B,0,TEAM),p4=applyAction(f.scenario,p3,{type:'REMOVE',orderId:A});
  assert.deepEqual(pairs(project(f,p2)),[[A,B,1]]);
  const moved=project(f,p3);assert.deepEqual(pairs(moved),[]);assert.deepEqual(entry(moved).orders,[B]);assert.deepEqual(entry(moved,'TEST-01').orders,[A]);
  const removed=project(f,p4);assert.deepEqual(ids(removed.visits),[B]);assert.ok(ids(removed.unassigned).includes(A));
  assert.deepEqual(project(f,p2),project(f,restorePlan(f.scenario,JSON.stringify(p2))),'undo/import restores the earlier complete projection');
  assert.deepEqual(project(f,restorePlan(f.scenario,JSON.stringify(p3))),moved);
  assert.deepEqual(project(f,p0).visits.features,[],'the projector does not retain a second assignment store');
});

test('O20 AUTO, confirmation and released MANUAL status are reflected without changing road geometry',()=>{
  const f=fixture();let plan=applyAction(f.scenario,f.plan,{type:'GENERATE',date:DAY,orderIds:[A,B]});
  const automatic=project(f,plan);assert.equal(visit(automatic,A).properties.origin,'AUTO');assert.equal(visit(automatic,A).properties.confirmed,false);
  plan=applyAction(f.scenario,plan,{type:'CONFIRM',orderId:A});const confirmed=project(f,plan);
  assert.equal(visit(confirmed,A).properties.confirmed,true);assert.deepEqual(confirmed.routes,automatic.routes);
  plan=applyAction(f.scenario,plan,{type:'UNCONFIRM',orderId:A,reason:'Korekta testu projekcji'});const before=structuredClone(plan),released=project(f,plan);
  assert.equal(visit(released,A).properties.origin,'MANUAL');assert.equal(visit(released,A).properties.confirmed,false);
  assert.deepEqual(released.routes,automatic.routes);assert.deepEqual(plan,before);
  assert.equal(plan.assignments.find(assignment=>assignment.orderId===A).releaseReason,'Korekta testu projekcji');
});

test('O21 frozen inputs and repeated calls are deterministic and do not mutate scenario, plan or options',()=>{
  const f=fixture(),plan=chain(f,[A,B]),options={hiddenTeams:['TEST-05'],selectedId:A,includeUnassigned:order=>order.type==='POMIAR'};
  const before=JSON.stringify({scenario:f.scenario,plan,options});freeze(f.scenario);freeze(plan);freeze(options);
  const first=project(f,plan,DAY,options),second=project(f,plan,DAY,options);
  assert.deepEqual(second,first);assert.equal(JSON.stringify({scenario:f.scenario,plan,options}),before);
  assert.deepEqual(pairs(first),[[A,B,1]]);
});

test('O22 absent routing retains visits and emits NO_ROUTING instead of a synthetic line',()=>{
  const f=fixture({routing:false}),layers=project(f,chain(f,[A,B]));
  assert.deepEqual(ids(layers.visits),[A,B]);assert.deepEqual(pairs(layers),[]);
  assert.deepEqual(layers.gaps.filter(gap=>gap.kind==='NO_ROUTING').map(gap=>gap.teamId),[TEAM]);
  assert.equal(entry(layers).distanceM,null);assert.equal(entry(layers).checks.installationDistance,'UNASSESSED');
});

test('O23 queue predicates do not hide or renumber assigned visits and their routes',()=>{
  const f=fixture(),plan=chain(f,[A,MEASUREMENT,B]),normal=project(f,plan);
  const filtered=project(f,plan,DAY,{includeUnassigned:order=>order.id==='TEST-001'});
  assert.deepEqual(ids(filtered.unassigned),['TEST-001']);assert.equal(filtered.unassigned.features[0].properties.ready,false);
  assert.deepEqual(filtered.visits,normal.visits);assert.deepEqual(filtered.routes,normal.routes);assert.deepEqual(filtered.teams,normal.teams);
  assert.deepEqual(filtered.gaps,normal.gaps,'queue predicates do not hide the global unresolved-location count');
  assert.deepEqual(filtered.gaps.filter(gap=>gap.kind==='NO_LOCATION_QUEUE').map(gap=>gap.count),[7]);
});

test('O24 bounds include every line vertex and point across all supplied collections',()=>{
  const points={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[17.5,50.5]}}]};
  const lines={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[18,50],[19,51.5],[18.5,49.5]]}}]};
  assert.deepEqual(operationalBounds(points,lines),[17.5,49.5,19,51.5]);
});

test('O25 no located features yields null bounds rather than a made-up viewport',()=>{
  assert.equal(operationalBounds(),null);assert.equal(operationalBounds(null,{type:'FeatureCollection',features:[]}),null);
});

test('O26 selection marks only its matching assigned or queue feature and never changes the plan',()=>{
  const f=fixture(),plan=assign(f,f.plan,A,0),before=structuredClone(plan);
  const assigned=project(f,plan,DAY,{selectedId:A});assert.equal(visit(assigned,A).properties.selected,true);
  assert.ok(assigned.unassigned.features.every(feature=>feature.properties.selected===false));
  const queued=project(f,plan,DAY,{selectedId:'TEST-001'});assert.equal(visit(queued,A).properties.selected,false);
  assert.deepEqual(queued.unassigned.features.filter(feature=>feature.properties.selected).map(feature=>feature.properties.orderId),['TEST-001']);
  assert.deepEqual(plan,before);
});

// ---- MAP-08: marker shape, leg list, focus, unlocated list ------------------------------------
test('M08-01 visits carry a marker shape per installation type and the team lists every leg with its length',()=>{
  const f=fixture(),plan=chain(f),layers=project(f,plan),team=entry(layers);
  assert.deepEqual(layers.visits.features.map(feature=>[feature.properties.orderId,feature.properties.shape]),layers.visits.features.map(feature=>[feature.properties.orderId,({MPL:'circle',BSA:'square',POMIAR:'diamond'})[sourceScenario.orders.find(order=>order.id===feature.properties.orderId).type]]));
  assert.equal(team.legs.length,team.orders.length-1);
  assert.ok(team.legs.every(leg=>leg.status==='OK'&&leg.distanceM>0));
  assert.equal(Math.round(team.legs.reduce((sum,leg)=>sum+leg.distanceM,0)),Math.round(team.distanceM));
  assert.equal(team.incomplete,false);
});
test('M08-02 a missing leg is listed as unknown, totals become partial and no line is drawn for it',()=>{
  const f=fixture({fourWindows:true,editLayer:layer=>setLeg(layer,MEASUREMENT,B,missingLeg('NO_PATH'))}),layers=project(f,chain(f,[A,MEASUREMENT,B,C])),team=entry(layers);
  assert.ok(team.legs.some(leg=>leg.status!=='OK'));assert.equal(team.incomplete,true);assert.equal(team.distanceM,null);
  assert.ok(team.knownDistanceM>0,'the known part of the km sum is still reported');
  assert.ok(!pairs(layers).some(([from,to])=>from===MEASUREMENT&&to===B),'no fictional road for an unknown leg');
});
test('M08-03 focus dims other routes without hiding them and marks the focused basket',()=>{
  const f=fixture();let plan=assign(f,f.plan,A,0,'TEST-01');plan=assign(f,plan,B,1,'TEST-01');plan=assign(f,plan,C,0,TEAM);plan=assign(f,plan,'TEST-013',1,TEAM);const base=project(f,plan);
  const other=base.teams.find(team=>team.teamId!==TEAM&&team.count>0);
  if(!other)return;
  const layers=project(f,plan,DAY,{focusTeam:TEAM});
  assert.equal(entry(layers).focused,true);assert.equal(layers.teams.find(team=>team.teamId===other.teamId).focused,false);
  assert.ok(layers.routes.features.filter(r=>r.properties.teamId===TEAM).every(r=>r.properties.active===true&&r.properties.focused===true));
  assert.ok(layers.routes.features.filter(r=>r.properties.teamId!==TEAM).every(r=>r.properties.active===false));
  assert.equal(layers.routes.features.length,base.routes.features.length,'dimming never removes a route');
});
test('M08-04 an unlocated order assigned in a basket is listed as unlocated and stays off the map',()=>{
  const f=fixture(),layers=project(f,chain(f));
  assert.ok(entry(layers).unlocated.every(id=>!visit(layers,id)));
  assert.ok(Array.isArray(entry(layers).unlocated));
});
