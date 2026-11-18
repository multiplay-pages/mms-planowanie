// MAP-07B: explainable cross-basket optimisation of ONE day. SIMULATION ONLY: the result is a proposed plan that the user must
// accept explicitly; nothing here mutates the input plan, calls a service or invents a rule.
// All hard constraints come from the existing model (validatePlan + local road assessment through placementError); the order of the
// objectives is NOT an approved business rule, so it is an explicit, named simulation variant.
import {placementError,validatePlan,applyAction} from './planner-model.mjs';
import {assessBasket} from './routes.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const DAY_MS=86400000;
const nowMs=()=>(typeof performance!=='undefined'?performance.now():Date.now());

/** Objective hierarchies are named simulation variants; none of them is an approved rule. */
export const VARIANTS={
  AGE_FIRST:{id:'AGE_FIRST',label:'Starszeństwo najpierw',keys:['seniority','-count','km','minutes','sumsq','-sameTown'],
    hierarchy:['starszeństwo: najstarsze zlecenia mają pierwszeństwo (porównanie liczby zaplanowanych w kolejnych grupach wieku od najstarszej)','liczba zaplanowanych zleceń','km','minuty przejazdu','równomierność ekip','ta sama miejscowość (tylko remis)']},
  COVERAGE_FIRST:{id:'COVERAGE_FIRST',label:'Liczba i czas oczekiwania, potem km',keys:['-count','-ageSum','km','minutes','sumsq','-sameTown'],
    hierarchy:['liczba zaplanowanych zleceń','dni oczekiwania zaplanowanych zleceń','km','minuty przejazdu','równomierność ekip','ta sama miejscowość (tylko remis)']},
  BALANCE_FIRST:{id:'BALANCE_FIRST',label:'Równomierność przed kilometrami',keys:['-count','-ageSum','sumsq','km','minutes','-sameTown'],
    hierarchy:['liczba zaplanowanych zleceń','dni oczekiwania zaplanowanych zleceń','równomierność ekip','km','minuty przejazdu','ta sama miejscowość (tylko remis)']},
};

/** Which rules come from the documented decisions and which are only assumptions of this simulation. */
export const RULE_STATUS={
  confirmed:['Maks. 3 instalacje w koszyku; część zleceń wymaga 2 sąsiednich slotów jednej ekipy','Instalacje i pomiary dzielą zasoby ekip (sloty)','Dostępność ekip to konkretne okna','Kwalifikacje ekip (MPL / BSA / POMIAR)','Potwierdzone i ręczne przydziały są chronione','Roboczy limit 30 km między kolejnymi instalacjami (łańcuch, także z pomiarami)','Roboczy wspólny limit +10 km dla pomiarów','Praca i szacowany dojazd mieszczą się w oknie (normy testowe)','Tylko zlecenia gotowe, z ustaloną lokalizacją i pewnym punktem dostępu do drogi'],
  simulation:['Kolejność celów (wariant symulacyjny, niezatwierdzona)','Wiek zlecenia jako liniowa suma dni oczekiwania','Równomierność obciążenia ekip','Preferencja tej samej miejscowości (wyłącznie przy remisie)'],
  notApplied:['U01 / U02 / U04 (warianty robocze)','D10','Wyjątki koordynatora','Pomiar poza pierwszą/ostatnią instalacją','Regionalne i operatorskie normy czasu','Terminy BSA','Regionalne/operatorskie ograniczenia — czekają na zatwierdzenie'],
};

const orderOf=(scenario,id)=>scenario.orders.find(order=>order.id===id);
const addressOf=(scenario,order)=>scenario.addresses.find(address=>address.id===order.addressId);
const ageDays=(order,date)=>Math.max(0,Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(order.createdOn+'T12:00:00Z'))/DAY_MS));
const km=meters=>`${(meters/1000).toFixed(1).replace('.',',')} km`;
const minutes=seconds=>`${Math.round(seconds/60)} min`;
const slotText=(scenario,start,count=1)=>`${scenario.windows[start][0]}–${scenario.windows[start+count-1][1]}`;
const proposalOf=(orderId,teamId,date,start)=>({orderId,teamId,date,start,origin:'AUTO',confirmed:false});
const withAssignments=(plan,assignments)=>({...plan,assignments});
const without=(plan,orderId)=>withAssignments(plan,plan.assignments.filter(item=>item.orderId!==orderId));
const withAdded=(plan,assignment)=>withAssignments(plan,[...plan.assignments,assignment]);

/** Aggregate figures of one day, shared by the optimizer, the UI comparison and the benchmark. */
/**
 * `baseline` (optional) is {issueMap,unassessedBaskets} of the current plan. A candidate that introduces or worsens a limit issue in ANY basket
 * (also in a basket an order was moved out of, where removal can create a new long leg) is flagged `invalid`.
 */
export function evaluateDay(scenario,plan,date,baseline=null) {
  const issueMap=new Map(),rows=[],ageHist=[],totals={count:0,installs:0,ageSum:0,km:0,minutes:0,sumsq:0,sameTown:0,unassessedBaskets:0,violations:0};
  for(const team of scenario.teams) {
    const items=plan.assignments.filter(item=>item.teamId===team.id&&item.date===date);
    const assessment=assessBasket(scenario,plan,team.id,date);
    const orders=items.map(item=>orderOf(scenario,item.orderId));
    const distanceM=assessment.distanceM??0,durationS=assessment.estimatedDurationS??0;
    if(orders.length>1&&assessment.distanceM===null)totals.unassessedBaskets++;
    totals.count+=orders.length;totals.installs+=orders.filter(order=>order.type!=='POMIAR').length;
    totals.ageSum+=orders.reduce((sum,order)=>sum+ageDays(order,date),0);
    for(const order of orders){const days=ageDays(order,date);ageHist[days]=(ageHist[days]??0)+1;}
    totals.km+=distanceM;totals.minutes+=durationS;totals.sumsq+=orders.length*orders.length;
    const towns=assessment.orders.map(id=>addressOf(scenario,orderOf(scenario,id)).city);
    for(let i=1;i<towns.length;i++)if(towns[i]===towns[i-1])totals.sameTown++;
    totals.violations+=assessment.violations.length;
    for(const issue of assessment.issues)issueMap.set(`${team.id}/${issue.key}`,issue.excess);
    rows.push({teamId:team.id,orders:assessment.orders,visits:orders.length,distanceM:assessment.distanceM,estimatedDurationS:assessment.estimatedDurationS,violations:assessment.violations,checks:{installationDistance:assessment.installationDistance.status,measurementExtra:assessment.measurementExtra.status,windows:assessment.windows.status}});
  }
  for(let i=0;i<ageHist.length;i++)ageHist[i]??=0;
  const invalid=baseline?([...issueMap].some(([key,excess])=>excess>(baseline.issueMap.get(key)??0))||totals.unassessedBaskets>baseline.unassessedBaskets):false;
  return {date,teams:rows,...totals,ageHist,issueMap,invalid};
}

const better=(a,b,keys)=>{
  if(a.invalid)return false;
  if(b.invalid)return true;
  for(const key of keys) {
    if(key==='seniority') {
      // Counts of planned orders per age (days waiting), compared from the oldest age downward.
      for(let i=Math.max(a.ageHist.length,b.ageHist.length)-1;i>=0;i--){const diff=(a.ageHist[i]??0)-(b.ageHist[i]??0);if(diff>0)return true;if(diff<0)return false;}
      continue;
    }
    const sign=key.startsWith('-')?-1:1,name=key.replace('-','');
    const tolerance=name==='km'||name==='minutes'?1:0,diff=sign*(a[name]-b[name]);
    if(diff<-tolerance)return true;
    if(diff>tolerance)return false;
  }
  return false;
};

function positionsFor(scenario,order) {
  const result=[];
  for(const team of scenario.teams.filter(item=>item.skills.includes(order.type)))
    for(let start=0;start+order.slotsRequired<=scenario.windows.length;start++)result.push({teamId:team.id,start});
  return result;
}

/** Orders that can really be recomputed, with the reasons for everything else. */
export function eligibility(scenario,plan,date,orderIds=null) {
  const scope=orderIds?new Set(orderIds):null,pool=[],excluded=[];
  const protectedIds=new Set(plan.assignments.filter(item=>item.confirmed||item.origin==='MANUAL').map(item=>item.orderId));
  for(const order of scenario.orders) {
    if(scope&&!scope.has(order.id))continue;
    const point=scenario.routing?.points.find(item=>item.addressId===order.addressId);
    let reason=null;
    if(protectedIds.has(order.id))reason='Przydział potwierdzony lub ręczny — chroniony';
    else if(plan.assignments.some(item=>item.orderId===order.id&&item.date!==date&&(item.confirmed||item.origin==='MANUAL')))reason='Chroniony przydział na inny dzień';
    else if(plan.manualExclusions?.some(item=>item.orderId===order.id&&item.date===date))reason='Ręcznie pozostawione w kolejce na ten dzień';
    else if(!order.ready)reason='Brak gotowości (parametr testowy)';
    else if(scenario.routing&&!point)reason='Brak ustalonej lokalizacji (decyzja użytkownika: bez pozycji)';
    else if(scenario.routing&&point.snap.status!=='OK')reason='Brak pewnego punktu dostępu do drogi w lokalnym grafie';
    if(reason)excluded.push({orderId:order.id,reason});else pool.push(order);
  }
  return {pool,excluded};
}

function summariseErrors(errors) {
  const groups=new Map();
  for(const error of errors){const key=error.kind+':'+error.message;groups.set(key,(groups.get(key)??0)+1);}
  return [...groups].sort((a,b)=>b[1]-a[1]).map(([key,count])=>({kind:key.split(':')[0],message:key.slice(key.indexOf(':')+1),count}));
}

/**
 * Computes a proposal for `date`. Confirmed and manual assignments are never touched; automatic unconfirmed ones in scope are
 * released and recomputed. Returns the proposed plan together with metrics, changes and explanations.
 */
export function proposeDayPlan(scenario,current,date,{variant='COVERAGE_FIRST',orderIds=null,budgetMs=2500}={}) {
  const spec=VARIANTS[variant]??VARIANTS.COVERAGE_FIRST,keys=spec.keys,started=nowMs(),deadline=started+budgetMs;
  validatePlan(scenario,current);
  const scope=orderIds?new Set(orderIds):new Set(scenario.orders.map(order=>order.id));
  const before=evaluateDay(scenario,current,date);
  // 1. Release only automatic, unconfirmed proposals of this day within the scope.
  let plan=withAssignments(clone(current),current.assignments.filter(item=>item.date!==date||item.origin!=='AUTO'||item.confirmed||!scope.has(item.orderId)).map(clone));
  const {pool:rawPool,excluded}=eligibility(scenario,plan,date,[...scope]);
  const assignedElsewhere=new Set(plan.assignments.map(item=>item.orderId));
  const pool=rawPool.filter(order=>!assignedElsewhere.has(order.id)).sort((a,b)=>a.createdOn.localeCompare(b.createdOn)||a.id.localeCompare(b.id));
  let evaluations=0,truncated=false,iterations=0;
  // Baseline = limit issues of the CURRENT plan (before any order is released): removing a visit can create a new long leg, which must count as new.
  const baseline={issueMap:before.issueMap,unassessedBaskets:before.unassessedBaskets};
  const evaluate=candidate=>{evaluations++;return evaluateDay(scenario,candidate,date,baseline);};
  const place=(base,order,position)=>{
    const assignment=proposalOf(order.id,position.teamId,date,position.start);
    if(placementError(scenario,base,assignment))return null;
    return {plan:withAdded(base,assignment),assignment};
  };
  const basePlan=plan;
  // 2a. Start A: construction, oldest first; every feasible team/slot is compared by the objective of the variant.
  const construct=()=>{
    let built=basePlan;const flexible=new Set();
    for(const order of pool) {
      let best=null;
      for(const position of positionsFor(scenario,order)) {
        const trial=place(built,order,position);if(!trial)continue;
        const score=evaluate(trial.plan);
        if(score.invalid)continue;
        if(!best||better(score,best.score,keys))best={...trial,score};
      }
      if(best){built=best.plan;flexible.add(order.id);}
    }
    return {plan:built,flexible};
  };
  // 2b. Start B: the result of the current MAP-06 generator for the same scope. The search never ends worse than its start,
  // so the proposal is at least as good as MAP-06 by the chosen objective for this day.
  const fromGenerator=()=>{
    const generated=applyAction(scenario,basePlan,{type:'GENERATE',date,orderIds:[...scope]});
    const kept=new Set(basePlan.assignments.map(item=>item.orderId));
    return {plan:generated,flexible:new Set(generated.assignments.filter(item=>item.date===date&&!kept.has(item.orderId)).map(item=>item.orderId))};
  };
  // 3. Local search (deterministic, time-boxed): relocate, swap, insert and eject-and-reinsert moves.
  const improve=start=>{
    let plan=start.plan;const flexible=new Set(start.flexible);
    let currentScore=evaluate(plan);
    const unscheduled=()=>pool.filter(order=>!flexible.has(order.id));
    let rounds=0;
    while(rounds<60) {
      if(nowMs()>deadline){truncated=true;break;}
      rounds++;iterations++;
      let best=null;const offer=candidate=>{if(better(candidate.score,currentScore,keys)&&(!best||better(candidate.score,best.score,keys)))best=candidate;};
      const flexibleOrders=[...flexible].map(id=>orderOf(scenario,id));
      const assignmentOf=id=>plan.assignments.find(item=>item.orderId===id);
      for(const order of flexibleOrders) {
        const own=assignmentOf(order.id),base=without(plan,order.id);
        for(const position of positionsFor(scenario,order)) {
          if(position.teamId===own.teamId&&position.start===own.start)continue;
          const trial=place(base,order,position);if(trial)offer({plan:trial.plan,score:evaluate(trial.plan)});
        }
      }
      for(let i=0;i<flexibleOrders.length;i++)for(let j=i+1;j<flexibleOrders.length;j++) {
        const a=flexibleOrders[i],b=flexibleOrders[j],pa=assignmentOf(a.id),pb=assignmentOf(b.id);
        if(pa.teamId===pb.teamId&&pa.start===pb.start)continue;
        const base=without(without(plan,a.id),b.id);
        const first=place(base,a,{teamId:pb.teamId,start:pb.start});if(!first)continue;
        const second=place(first.plan,b,{teamId:pa.teamId,start:pa.start});if(second)offer({plan:second.plan,score:evaluate(second.plan)});
      }
      const waiting=unscheduled();
      for(const order of waiting) {
        for(const position of positionsFor(scenario,order)) {
          const trial=place(plan,order,position);if(trial)offer({plan:trial.plan,score:evaluate(trial.plan),flexible:[order.id]});
        }
      }
      for(const order of waiting.slice(0,12)) {
        for(const victim of flexibleOrders) {
          if(nowMs()>deadline){truncated=true;break;}
          const base=without(plan,victim.id);
          for(const position of positionsFor(scenario,order)) {
            const placed=place(base,order,position);if(!placed)continue;
            offer({plan:placed.plan,score:evaluate(placed.plan),flexible:[order.id],dropped:[victim.id]});
            for(const again of positionsFor(scenario,victim)) {
              const moved=place(placed.plan,victim,again);if(moved)offer({plan:moved.plan,score:evaluate(moved.plan),flexible:[order.id]});
            }
          }
        }
      }
      if(!best)break;
      plan=best.plan;currentScore=best.score;
      for(const id of best.flexible??[])flexible.add(id);
      for(const id of best.dropped??[])flexible.delete(id);
    }
    return {plan,flexible,score:currentScore};
  };
  const candidates=[improve(construct()),improve(fromGenerator())];
  const chosen=candidates.reduce((best,item)=>better(item.score,best.score,keys)?item:best);
  plan=chosen.plan;const flexible=chosen.flexible;
  const startedFrom=chosen===candidates[0]?'CONSTRUCTION':'MAP06_GENERATOR';
  validatePlan(scenario,plan);
  const after=evaluateDay(scenario,plan,date);
  const result={variant:spec.id,variantLabel:spec.label,hierarchy:spec.hierarchy,date,plan,before,after,pool:pool.map(order=>order.id),excluded,
    startedFrom,evaluations,iterations,truncated,elapsedMs:Math.round(nowMs()-started),ruleStatus:RULE_STATUS,simulation:true};
  result.changes=diffPlans(scenario,current,plan,date);
  result.explanations=explainProposal(scenario,current,plan,date,{pool,flexible,keys,excluded,baseline});
  result.elapsedMs=Math.round(nowMs()-started);
  return result;
}

/** Added, removed and moved assignments of one day between two plans. */
export function diffPlans(scenario,from,to,date) {
  const a=new Map(from.assignments.filter(item=>item.date===date).map(item=>[item.orderId,item])),b=new Map(to.assignments.filter(item=>item.date===date).map(item=>[item.orderId,item]));
  const changes=[];
  for(const [id,item] of b) {
    const old=a.get(id);
    if(!old)changes.push({type:'ADDED',orderId:id,to:{teamId:item.teamId,start:item.start}});
    else if(old.teamId!==item.teamId||old.start!==item.start)changes.push({type:'MOVED',orderId:id,from:{teamId:old.teamId,start:old.start},to:{teamId:item.teamId,start:item.start}});
  }
  for(const [id,item] of a)if(!b.has(id))changes.push({type:'REMOVED',orderId:id,from:{teamId:item.teamId,start:item.start}});
  return changes;
}

const KEY_LABEL={seniority:'starszeństwo (najstarsze zlecenia)',count:'liczba zaplanowanych zleceń',ageSum:'dni oczekiwania zaplanowanych zleceń',km:'kilometry dnia',minutes:'minuty przejazdu dnia',sumsq:'równomierność ekip',sameTown:'ta sama miejscowość'};

/** First objective on which `a` differs from `b`: {key,better,delta} (delta = a-b), or null for a tie. */
function firstDifference(a,b,keys) {
  for(const key of keys) {
    if(key==='seniority') {
      for(let i=Math.max(a.ageHist.length,b.ageHist.length)-1;i>=0;i--){const diff=(a.ageHist[i]??0)-(b.ageHist[i]??0);if(diff)return {key,better:diff>0,delta:diff,age:i};}
      continue;
    }
    const sign=key.startsWith('-')?-1:1,name=key.replace('-',''),tolerance=name==='km'||name==='minutes'?1:0,diff=sign*(a[name]-b[name]);
    if(Math.abs(diff)>tolerance)return {key:name,better:diff<0,delta:a[name]-b[name]};
  }
  return null;
}
function describeDifference(difference) {
  if(!difference)return 'remis na wszystkich celach hierarchii — rozstrzygnęła deterministyczna kolejność';
  const sign=difference.delta>=0?'+':'';
  const label=KEY_LABEL[difference.key];
  const detail=difference.key==='km'?` (${sign}${km(difference.delta)})`:difference.key==='minutes'?` (${sign}${minutes(difference.delta)})`:difference.key==='seniority'?` (grupa ${difference.age} dni: ${sign}${difference.delta})`:` (${sign}${difference.delta})`;
  return `${difference.better?'lepsze':'gorsze'} pod względem: ${label}${detail}`;
}

function explainProposal(scenario,current,plan,date,{pool,flexible,keys,excluded,baseline}) {
  const explanations={},scheduled=pool.filter(order=>flexible.has(order.id)),waiting=pool.filter(order=>!flexible.has(order.id));
  const youngestScheduled=scheduled.length?Math.min(...scheduled.map(order=>ageDays(order,date))):null;
  const total=evaluateDay(scenario,plan,date);
  for(const order of scheduled) {
    const own=plan.assignments.find(item=>item.orderId===order.id),base=without(plan,order.id),options=[];
    const blocked=new Map();
    for(const team of scenario.teams) {
      const errors=[];let bestOption=null;
      if(!team.skills.includes(order.type)){blocked.set(team.id,[{kind:'resource',message:'Brak wymaganych kwalifikacji ekipy.',count:1}]);continue;}
      for(let start=0;start+order.slotsRequired<=scenario.windows.length;start++) {
        const assignment=proposalOf(order.id,team.id,date,start),error=placementError(scenario,base,assignment);
        if(error){errors.push(error);continue;}
        const figures=evaluateDay(scenario,withAdded(base,assignment),date,baseline);
        if(figures.invalid){errors.push({kind:'road',message:'Zmiana tworzy naruszenie limitu w koszyku źródłowym lub docelowym.'});continue;}
        if(!bestOption||better(figures,bestOption.figures,keys))bestOption={start,figures};
      }
      if(bestOption)options.push({teamId:team.id,start:bestOption.start,windowLabel:slotText(scenario,bestOption.start,order.slotsRequired),figures:bestOption.figures,chosen:team.id===own.teamId&&bestOption.start===own.start});
      else blocked.set(team.id,summariseErrors(errors));
    }
    const chosen=options.find(option=>option.chosen),others=options.filter(option=>!option.chosen);
    const alternatives=[
      ...others.map(option=>({teamId:option.teamId,windowLabel:option.windowLabel,deltaM:option.figures.km-total.km,deltaS:option.figures.minutes-total.minutes,verdict:`odrzucone: ${describeDifference(firstDifference(option.figures,total,keys))}`})),
      ...[...blocked].map(([teamId,errors])=>({teamId,blocked:true,verdict:`niewykonalne: ${errors.slice(0,2).map(error=>error.count>1?`${error.message} (×${error.count})`:error.message).join(' / ')}`})),
    ];
    const basket=assessBasket(scenario,plan,own.teamId,date),windowLabel=slotText(scenario,own.start,order.slotsRequired);
    const feasible=options.length+(chosen?0:1);
    const nearest=others.slice().sort((x,y)=>x.figures.km-y.figures.km)[0];
    explanations[order.id]={orderId:order.id,status:'SCHEDULED',ageDays:ageDays(order,date),teamId:own.teamId,windowLabel,
      basket:{orders:basket.orders,distanceM:basket.distanceM,estimatedDurationS:basket.estimatedDurationS},
      alternatives,consideredBaskets:scenario.teams.length,feasibleBaskets:feasible,
      reason:`${order.id} (${ageDays(order,date)} dni w kolejce) → ${own.teamId}, okno ${windowLabel}. Rozważono ${scenario.teams.length} koszyków: ${feasible} wykonalnych, ${blocked.size} niewykonalnych.${nearest?` Najkrótsza inna wykonalna: ${nearest.teamId} (${nearest.figures.km-total.km>=0?'+':''}${km(nearest.figures.km-total.km)} dla dnia) — ${describeDifference(firstDifference(nearest.figures,total,keys))}.`:' Brak innej wykonalnej alternatywy.'}`};
  }
  // Skipped orders: the reason is computed per order; the oldest ones also get the best "swap in" experiment.
  const oldestWaiting=new Set(waiting.slice(0,8).map(order=>order.id));
  for(const order of waiting) {
    const errors=[];
    for(const position of positionsFor(scenario,order)) {
      const error=placementError(scenario,plan,proposalOf(order.id,position.teamId,date,position.start));
      if(error)errors.push(error);
    }
    const age=ageDays(order,date),groups=summariseErrors(errors),qualified=positionsFor(scenario,order).length>0;
    const occupiers=plan.assignments.filter(item=>item.date===date&&scenario.teams.find(team=>team.id===item.teamId).skills.includes(order.type)).map(item=>({id:item.orderId,age:ageDays(orderOf(scenario,item.orderId),date),protected:item.confirmed||item.origin==='MANUAL'}));
    const older=youngestScheduled!==null&&age>youngestScheduled;
    let why;
    if(!qualified)why='Brak kwalifikowanej ekipy.';
    else if(!errors.length)why='Wykonalne miejsce istnieje, lecz jego zajęcie nie poprawia hierarchii celów.';
    else why=groups.slice(0,3).map(group=>`${group.message} (×${group.count})`).join('; ');
    let swap=null;
    if(oldestWaiting.has(order.id)&&qualified) {
      for(const victim of scheduled) {
        const own=plan.assignments.find(item=>item.orderId===victim.id);
        if(own.confirmed||own.origin==='MANUAL')continue;
        const base=without(plan,victim.id);let bestHere=null;
        for(const position of positionsFor(scenario,order)) {
          if(position.teamId!==own.teamId)continue;
          const candidate=proposalOf(order.id,position.teamId,date,position.start);
          if(placementError(scenario,base,candidate))continue;
          const figures=evaluateDay(scenario,withAdded(base,candidate),date,baseline);
          if(figures.invalid)continue;
          if(!bestHere||better(figures,bestHere.figures,keys))bestHere={figures,position};
        }
        if(bestHere&&(!swap||better(bestHere.figures,swap.figures,keys)))swap={victimId:victim.id,victimAge:ageDays(victim,date),figures:bestHere.figures,position:bestHere.position};
      }
    }
    explanations[order.id]={orderId:order.id,status:'SKIPPED',ageDays:age,olderThanScheduled:older,
      reason:`${order.id} (${age} dni) pozostaje w kolejce: ${why}`,
      blockedBy:occupiers.sort((x,y)=>y.age-x.age).slice(0,5),constraints:groups,
      swapTried:swap?{victimId:swap.victimId,victimAgeDays:swap.victimAge,team:swap.position.teamId,windowLabel:slotText(scenario,swap.position.start,order.slotsRequired),deltaM:swap.figures.km-total.km,deltaS:swap.figures.minutes-total.minutes,verdict:`wymiana za ${swap.victimId} (${swap.victimAge} dni) odrzucona: ${describeDifference(firstDifference(swap.figures,total,keys))}`}:null,
      note:older?`To zlecenie jest starsze niż najmłodsze zaplanowane (${youngestScheduled} dni): pominięcie wymaga uzasadnienia powyżej${swap?' i wyniku próby wymiany':oldestWaiting.has(order.id)?'; próba wymiany jednej wizyty w tej ekipie nie dała wykonalnego miejsca (limity dróg, okna lub kwalifikacje)':'; próby wymiany wykonano tylko dla 8 najstarszych pominiętych zleceń, więc dla tego zlecenia jej nie sprawdzono'}. Wyszukiwanie jest ograniczone budżetem czasu — to nie dowód, że żaden inny plan nie istnieje.`:null};
  }
  for(const item of excluded)explanations[item.orderId]={orderId:item.orderId,status:'EXCLUDED',reason:item.reason};
  return explanations;
}

/** MAP-07A: only reorders visits inside existing baskets (automatic, unconfirmed ones) to the shortest feasible sequence. */
export function reorderBaskets(scenario,current,date) {
  validatePlan(scenario,current);
  let plan=clone(current);const changes=[];
  const permutations=items=>items.length<=1?[items]:items.flatMap((item,index)=>permutations([...items.slice(0,index),...items.slice(index+1)]).map(rest=>[item,...rest]));
  for(const team of scenario.teams) {
    const flexible=plan.assignments.filter(item=>item.teamId===team.id&&item.date===date&&item.origin==='AUTO'&&!item.confirmed).sort((a,b)=>a.start-b.start);
    if(flexible.length<2)continue;
    const slots=flexible.flatMap(item=>Array.from({length:orderOf(scenario,item.orderId).slotsRequired},(_,index)=>item.start+index)).sort((a,b)=>a-b);
    const keep=plan.assignments.filter(item=>!flexible.includes(item));
    const figures=candidate=>{const assessment=assessBasket(scenario,candidate,team.id,date);return {m:assessment.distanceM??Infinity,s:assessment.estimatedDurationS??Infinity,ok:!assessment.violations.length&&!assessment.missingRoads};};
    const original=figures(plan);
    let best={order:flexible,m:original.m,s:original.s};
    for(const order of permutations(flexible)) {
      let pointer=0,valid=true;const placed=[];
      for(const item of order) {
        const need=orderOf(scenario,item.orderId).slotsRequired,run=slots.slice(pointer,pointer+need);
        if(run.length<need||run.some((slot,index)=>slot!==run[0]+index)){valid=false;break;}
        placed.push({...item,start:run[0]});pointer+=need;
      }
      if(!valid)continue;
      const candidate=withAssignments(plan,[...keep,...placed]);
      try {validatePlan(scenario,candidate);} catch {continue;}
      const f=figures(candidate);
      if(f.ok&&(f.m<best.m-1||(Math.abs(f.m-best.m)<=1&&f.s<best.s-1)))best={order:placed,m:f.m,s:f.s};
    }
    if(best.order!==flexible) {
      for(const item of best.order) {
        const old=flexible.find(entry=>entry.orderId===item.orderId);
        if(old.start!==item.start)changes.push({type:'MOVED',orderId:item.orderId,from:{teamId:team.id,start:old.start},to:{teamId:team.id,start:item.start}});
      }
      plan=withAssignments(plan,[...keep,...best.order]);
    }
  }
  validatePlan(scenario,plan);
  return {plan,changes};
}
