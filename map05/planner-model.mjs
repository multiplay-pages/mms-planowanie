// Local resource simulation. Address provenance is real; orders and teams are not.
// Optional local road checks remain planning estimates; no customer contact or final D−1 assignment.
import {mergeGeocoding} from './locations.mjs';
import {mergeRoutes,routeLeg,assessBasket} from './routes.mjs';
const copy=value=>JSON.parse(JSON.stringify(value));
const fail=message=>{throw new Error(message);};
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const validDate=value=>typeof value==='string'&&datePattern.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const teamFor=(s,id)=>s.teams.find(t=>t.id===id)??fail('Nieznana ekipa.');
const orderFor=(s,id)=>s.orders.find(o=>o.id===id)??fail('Nieznane zlecenie.');
const availabilityFor=(p,id,date)=>p.availability.find(a=>a.teamId===id&&a.date===date)?.slots??[];

export function createScenario(dataset,geocoding=null,routes=null) {
  if(dataset?.schemaVersion!==1||!Array.isArray(dataset.addresses)||!dataset.addresses.length||typeof dataset.source?.sha256!=='string') fail('Nieprawidłowy katalog adresów.');
  if(new Set(dataset.addresses.map(a=>a.id)).size!==dataset.addresses.length||dataset.addresses.some(a=>!a.id||!a.city||!a.building)) fail('Niekompletne lub powtórzone adresy.');
  const addresses=mergeGeocoding(dataset,geocoding);
  const orders=addresses.map((address,i)=>({
    id:`TEST-${String(i+1).padStart(3,'0')}`,addressId:address.id,
    type:['MPL','MPL','BSA','POMIAR'][i%4],synthetic:true,
    createdOn:`2026-11-${String(1+i%12).padStart(2,'0')}`,
    ready:i%17!==0,slotsRequired:i%13===1?2:1,
    serviceMinutes:([120,120,150,45][i%4])*(i%13===1?2:1),
  }));
  return {datasetId:dataset.source.sha256,source:copy(dataset.source),quality:copy(dataset.quality),addresses,orders,routing:mergeRoutes(dataset.source.sha256,addresses,routes),
    teams:[
      {id:'TEST-01',skills:['MPL','POMIAR']},
      {id:'TEST-02',skills:['MPL','BSA','POMIAR']},
      {id:'TEST-03',skills:['BSA','POMIAR']},
      {id:'TEST-04',skills:['MPL','BSA','POMIAR']},
      {id:'TEST-05',skills:['MPL','POMIAR']},
    ],windows:[['08:00','11:00'],['11:00','14:00'],['14:00','17:00']],
    defaultDates:['2026-11-18','2026-11-19','2026-11-20']};
}

export function createPlan(scenario) {
  return {schemaVersion:1,datasetId:scenario.datasetId,
    availability:scenario.defaultDates.flatMap(date=>scenario.teams.map(team=>({teamId:team.id,date,slots:[0,1,2]}))),
    assignments:[],manualExclusions:[]};
}

export function queueOrders(scenario,plan) {
  const assigned=new Set(plan.assignments.map(a=>a.orderId));
  return scenario.orders.filter(o=>!assigned.has(o.id));
}

export function validatePlan(scenario,plan) {
  if(plan?.schemaVersion!==1) fail('Nieobsługiwana wersja planu.');
  if(plan.datasetId!==scenario.datasetId) fail('Plan dotyczy innego zbioru adresów.');
  if(!Array.isArray(plan.availability)||!Array.isArray(plan.assignments)||plan.availability.length>10000||plan.assignments.length>scenario.orders.length) fail('Nieprawidłowa struktura lub rozmiar planu.');
  const seenAvailability=new Set();
  const exclusions=plan.manualExclusions??[];
  if(!Array.isArray(exclusions)||exclusions.length>20000) fail('Nieprawidłowe ręczne wykluczenia.');
  const seenExclusions=new Set();
  for(const item of exclusions) {
    if(!item||!validDate(item.date)) fail('Nieprawidłowy dzień ręcznego wykluczenia.');
    orderFor(scenario,item.orderId);
    const key=`${item.orderId}/${item.date}`;
    if(seenExclusions.has(key)) fail('Powtórzone ręczne wykluczenie.');
    seenExclusions.add(key);
  }
  for(const a of plan.availability) {
    if(!a||!validDate(a.date)) fail('Nieprawidłowy dzień dostępności.');
    teamFor(scenario,a.teamId);
    if(!Array.isArray(a.slots)||a.slots.some(n=>!Number.isInteger(n)||n<0||n>=scenario.windows.length)||new Set(a.slots).size!==a.slots.length) fail('Nieprawidłowy slot dostępności.');
    const key=`${a.teamId}/${a.date}`;
    if(seenAvailability.has(key)) fail('Powtórzona dostępność ekipy.');
    seenAvailability.add(key);
  }
  const seenOrders=new Set(),occupied=new Set(),installations=new Map();
  for(const a of plan.assignments) {
    if(!a||!validDate(a.date)||!['AUTO','MANUAL'].includes(a.origin)||typeof a.confirmed!=='boolean') fail('Nieprawidłowy przydział.');
    const order=orderFor(scenario,a.orderId),team=teamFor(scenario,a.teamId);
    if(seenOrders.has(order.id)) fail('Zlecenie przydzielono dwukrotnie.');
    seenOrders.add(order.id);
    if(!order.ready) fail('Brak gotowości testowego zlecenia.');
    if(!team.skills.includes(order.type)) fail('Brak wymaganych kwalifikacji ekipy.');
    if(!Number.isInteger(a.start)||a.start<0||a.start+order.slotsRequired>scenario.windows.length) fail('Brak wymaganych sąsiednich slotów jednej ekipy.');
    const slots=availabilityFor(plan,team.id,a.date);
    for(let i=a.start;i<a.start+order.slotsRequired;i++) {
      if(!slots.includes(i)) fail('Brak dostępności: slot jest wyłączony lub nie został podany.');
      const key=`${team.id}/${a.date}/${i}`;
      if(occupied.has(key)) fail('Slot jest zajęty przez inne zlecenie (wspólny zasób instalacji i pomiarów).');
      occupied.add(key);
    }
    if(order.type!=='POMIAR') {
      const key=`${team.id}/${a.date}`,count=(installations.get(key)??0)+1;
      if(count>3) fail('Koszyk może zawierać maksymalnie 3 instalacje.');
      installations.set(key,count);
    }
    if(a.releaseReason!==undefined&&(typeof a.releaseReason!=='string'||a.releaseReason.length>400)) fail('Nieprawidłowy powód korekty.');
  }
  return true;
}

function checkRoadCandidate(scenario,plan,assignment) {
  if(!scenario.routing)return;
  const order=orderFor(scenario,assignment.orderId);
  if(assignment.origin==='AUTO') {
    const point=scenario.routing.points.find(point=>point.addressId===order.addressId);
    if(!point)fail('Brak ustalonej lokalizacji: zlecenie pozostaje w kolejce.');
    if(point.snap.status!=='OK')fail('Brak pewnego punktu dostępu do przejezdnej drogi w lokalnym grafie.');
  }
  const assessment=assessBasket(scenario,plan,assignment.teamId,assignment.date);
  if(assessment.violations.length)fail(assessment.violations[0]);
  if(assignment.origin==='AUTO'&&assessment.missingRoads)fail('Brak obliczonego odcinka drogi dla koszyka.');
  if(assignment.origin==='AUTO'&&assessment.hasMeasurements&&assessment.measurementExtra.status==='UNASSESSED')fail(assessment.measurementExtra.reason??'Nie można ocenić wspólnego dojazdu do pomiarów.');
}

function candidateError(scenario,plan,assignment) {
  const candidate={...plan,assignments:[...plan.assignments,assignment]};
  try {validatePlan(scenario,candidate);} catch(error) {return {kind:'resource',message:error.message};}
  try {checkRoadCandidate(scenario,candidate,assignment);} catch(error) {return {kind:'road',message:error.message};}
  return null;
}

function checkNewRoadIssues(scenario,before,after,affected) {
  if(!scenario.routing)return;
  const buckets=new Map(affected.map(item=>[`${item.teamId}/${item.date}`,item]));
  for(const {teamId,date} of buckets.values()) {
    const previous=new Map(assessBasket(scenario,before,teamId,date).issues.map(issue=>[issue.key,issue.excess]));
    const introduced=assessBasket(scenario,after,teamId,date).issues.find(issue=>issue.excess>(previous.get(issue.key)??0));
    if(introduced)fail(`Zmiana tworzy lub zwiększa naruszenie w koszyku ${teamId} (${date}): ${introduced.message}`);
  }
}

function canAssign(scenario,plan,assignment) {
  return candidateError(scenario,plan,assignment)===null;
}

function proposal(orderId,teamId,date,start,origin='AUTO') {
  return {orderId,teamId,date,start,origin,confirmed:false};
}

export function explainOrder(scenario,plan,order,date) {
  const assigned=plan.assignments.find(a=>a.orderId===order.id);
  if(assigned) return `${assigned.confirmed?'Potwierdzone okno':'Propozycja'}: ${assigned.date} · ${assigned.teamId}`;
  if(plan.manualExclusions?.some(item=>item.orderId===order.id&&item.date===date)) return 'Ręcznie pozostawione w kolejce na ten dzień. Włącz ponownie do generatora lub przydziel ręcznie.';
  if(!order.ready) return 'Brak gotowości — scenariusz testowy.';
  if(scenario.routing) {
    const point=scenario.routing.points.find(point=>point.addressId===order.addressId);
    if(!point)return 'Brak ustalonej lokalizacji — pozostawiono bez pozycji zgodnie z decyzją użytkownika.';
    if(point.snap.status!=='OK')return 'Brak pewnego dostępu do drogi w lokalnym grafie.';
  }
  const teams=scenario.teams.filter(t=>t.skills.includes(order.type));
  if(!teams.length) return 'Brak kwalifikowanej ekipy.';
  const errors=teams.flatMap(team=>scenario.windows.map((_,start)=>candidateError(scenario,plan,proposal(order.id,team.id,date,start))));
  if(errors.includes(null))return scenario.routing?'Można zaproponować slot z lokalną oceną dróg; czasy są szacunkowe, start ekipy pozostaje nieustalony.':'Można zaproponować slot; lokalizacja i przejazd pozostają nieocenione.';
  const roadIssue=errors.find(error=>error?.kind==='road');
  if(roadIssue)return roadIssue.message;
  return order.slotsRequired>1?'Brak 2 sąsiednich dostępnych slotów jednej kwalifikowanej ekipy.':'Brak wolnego slotu kwalifikowanej ekipy w tym dniu.';
}

export function applyAction(scenario,current,action) {
  validatePlan(scenario,current);
  const plan=copy(current);
  const affected=[];
  plan.manualExclusions??=[];
  const assignment=()=>plan.assignments.find(a=>a.orderId===action.orderId)??fail('Brak przydziału.');
  const protect=a=>{if(a?.confirmed) fail('Wizyta jest potwierdzona. Najpierw jawnie zwolnij potwierdzenie z powodem.');};
  if(action.type==='AVAILABILITY') {
    const index=plan.availability.findIndex(a=>a.teamId===action.teamId&&a.date===action.date);
    const item={teamId:action.teamId,date:action.date,slots:copy(action.slots)};
    if(Array.isArray(item.slots))for(const a of plan.assignments.filter(a=>a.teamId===action.teamId&&a.date===action.date)) {
      const order=orderFor(scenario,a.orderId);
      for(let slot=a.start;slot<a.start+order.slotsRequired;slot++) {
        if(!item.slots.includes(slot))fail(`Nie można wyłączyć okna ${scenario.windows[slot].join('–')} ekipy ${a.teamId} (${a.date}): zajmuje je ${a.orderId}. Najpierw przenieś zlecenie lub przywróć je do kolejki.`);
      }
    }
    if(index===-1) plan.availability.push(item);else plan.availability[index]=item;
  } else if(action.type==='ASSIGN') {
    const previous=plan.assignments.find(a=>a.orderId===action.orderId);protect(previous);
    if(previous)affected.push({teamId:previous.teamId,date:previous.date});
    plan.assignments=plan.assignments.filter(a=>a.orderId!==action.orderId);
    plan.manualExclusions=plan.manualExclusions.filter(item=>item.orderId!==action.orderId||item.date!==action.date);
    const candidate=proposal(action.orderId,action.teamId,action.date,action.start,'MANUAL');
    if(previous?.releaseReason!==undefined)candidate.releaseReason=previous.releaseReason;
    plan.assignments.push(candidate);validatePlan(scenario,plan);checkRoadCandidate(scenario,plan,candidate);
  } else if(action.type==='REMOVE') {
    const a=assignment();protect(a);
    affected.push({teamId:a.teamId,date:a.date});
    plan.manualExclusions=plan.manualExclusions.filter(item=>item.orderId!==a.orderId||item.date!==a.date);
    plan.manualExclusions.push({orderId:a.orderId,date:a.date});
    plan.assignments=plan.assignments.filter(item=>item.orderId!==action.orderId);
  } else if(action.type==='ALLOW_AUTO') {
    orderFor(scenario,action.orderId);
    if(!validDate(action.date)) fail('Nieprawidłowy dzień.');
    plan.manualExclusions=plan.manualExclusions.filter(item=>item.orderId!==action.orderId||item.date!==action.date);
  } else if(action.type==='CONFIRM') {
    const candidate=assignment();checkRoadCandidate(scenario,plan,candidate);candidate.confirmed=true;
  } else if(action.type==='UNCONFIRM') {
    if(typeof action.reason!=='string'||action.reason.trim().length<3||action.reason.length>400) fail('Podaj powód zwolnienia potwierdzenia (3–400 znaków).');
    const a=assignment();a.confirmed=false;a.origin='MANUAL';a.releaseReason=action.reason.trim();
  } else if(action.type==='GENERATE') {
    if(!validDate(action.date)) fail('Nieprawidłowy dzień generowania.');
    affected.push(...scenario.teams.map(team=>({teamId:team.id,date:action.date})));
    const ids=new Set(action.orderIds??scenario.orders.map(o=>o.id));
    if([...ids].some(id=>!scenario.orders.some(o=>o.id===id))) fail('Nieznane zlecenie w zakresie generowania.');
    // Only automatic, unconfirmed proposals within the visible scope are replaced.
    plan.assignments=plan.assignments.filter(a=>a.date!==action.date||a.origin!=='AUTO'||a.confirmed||!ids.has(a.orderId));
    const candidates=queueOrders(scenario,plan).filter(o=>ids.has(o.id)&&o.ready&&!plan.manualExclusions.some(item=>item.orderId===o.id&&item.date===action.date)).sort((a,b)=>a.createdOn.localeCompare(b.createdOn)||a.id.localeCompare(b.id));
    const cityFor=o=>scenario.addresses.find(a=>a.id===o.addressId).city;
    for(const order of candidates) {
      // Same-town preference is only a grouping hint, never a distance claim.
      const teams=[...scenario.teams].sort((a,b)=>{
        const same=t=>Number(plan.assignments.some(x=>x.date===action.date&&x.teamId===t.id&&cityFor(orderFor(scenario,x.orderId))===cityFor(order)));
        const distance=t=>{
          if(!scenario.routing)return Infinity;
          const last=plan.assignments.filter(x=>x.date===action.date&&x.teamId===t.id).sort((x,y)=>y.start-x.start)[0];
          if(!last)return Infinity;
          return routeLeg(scenario.routing,orderFor(scenario,last.orderId).addressId,order.addressId).distanceM??Infinity;
        };
        return same(b)-same(a)||(distance(a)-distance(b))||a.id.localeCompare(b.id);
      });
      let placed=false;
      for(const team of teams) {
        for(let start=0;start<scenario.windows.length;start++) {
          const a=proposal(order.id,team.id,action.date,start);
          if(canAssign(scenario,plan,a)) {plan.assignments.push(a);placed=true;break;}
        }
        if(placed) break;
      }
    }
  } else fail('Nieznana operacja planera.');
  validatePlan(scenario,plan);
  checkNewRoadIssues(scenario,current,plan,affected);
  return plan;
}

export function restorePlan(scenario,text) {
  if(typeof text!=='string'||text.length>2000000) fail('Plik planu jest za duży lub nieprawidłowy.');
  const raw=JSON.parse(text);
  validatePlan(scenario,raw);
  // Whitelist persisted fields; imported objects never become executable markup.
  return {schemaVersion:1,datasetId:raw.datasetId,
    availability:raw.availability.map(a=>({teamId:a.teamId,date:a.date,slots:[...a.slots]})),
    assignments:raw.assignments.map(a=>({orderId:a.orderId,teamId:a.teamId,date:a.date,start:a.start,origin:a.origin,confirmed:a.confirmed,...(a.releaseReason!==undefined?{releaseReason:a.releaseReason}:{})})),
    manualExclusions:(raw.manualExclusions??[]).map(item=>({orderId:item.orderId,date:item.date}))};
}
