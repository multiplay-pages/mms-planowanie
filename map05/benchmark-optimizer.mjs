// MAP-07B benchmark: MAP-06 generator vs MAP-07A (reorder only) vs MAP-07B (cross-basket, named simulation variants)
// on the frozen dataset. Offline, deterministic apart from runtime. Usage: node benchmark-optimizer.mjs [--json out.json]
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createScenario,createPlan,applyAction,validatePlan,placementError} from './planner-model.mjs';
import {assessBasket} from './routes.mjs';
import {proposeDayPlan,reorderBaskets,evaluateDay,eligibility,VARIANTS} from './optimizer.mjs';

export const DATES=['2026-11-18','2026-11-19','2026-11-20'];
const now=()=>performance.now();

export async function loadScenario() {
  const [dataset,geocoding,routes]=await Promise.all(['addresses.json','uug-geocoding.json','local-routes.json'].map(name=>readFile(new URL('./data/'+name,import.meta.url),'utf8').then(JSON.parse)));
  return createScenario(dataset,geocoding,routes);
}

/** Starting situations. Each returns a fresh plan. */
export const SCENARIOS={
  EMPTY:{label:'Pusty plan, 3 dni, pełna dostępność',make:scenario=>createPlan(scenario)},
  PROTECTED:{label:'Z chronionymi przydziałami (1 potwierdzony, 2 ręczne)',make(scenario) {
    let plan=createPlan(scenario);
    plan=applyAction(scenario,plan,{type:'ASSIGN',orderId:'TEST-075',teamId:'TEST-03',date:DATES[0],start:0});
    plan=applyAction(scenario,plan,{type:'ASSIGN',orderId:'TEST-090',teamId:'TEST-01',date:DATES[1],start:1});
    plan=applyAction(scenario,plan,{type:'ASSIGN',orderId:'TEST-104',teamId:'TEST-05',date:DATES[2],start:2});
    return applyAction(scenario,plan,{type:'CONFIRM',orderId:'TEST-075'});
  }},
  REDUCED:{label:'Ograniczona dostępność (19.11: ekipy 2 i 4 bez okna 3, ekipa 5 wyłączona)',make(scenario) {
    let plan=createPlan(scenario);
    plan=applyAction(scenario,plan,{type:'AVAILABILITY',teamId:'TEST-02',date:DATES[1],slots:[0,1]});
    plan=applyAction(scenario,plan,{type:'AVAILABILITY',teamId:'TEST-04',date:DATES[1],slots:[0,1]});
    return applyAction(scenario,plan,{type:'AVAILABILITY',teamId:'TEST-05',date:DATES[1],slots:[]});
  }},
};

export const APPROACHES={
  MAP06:{label:'MAP-06 (obecny generator)',run:(scenario,plan)=>DATES.reduce((p,date)=>applyAction(scenario,p,{type:'GENERATE',date}),plan)},
  MAP07A:{label:'MAP-07A (tylko kolejność w koszykach)',run:(scenario,plan)=>DATES.reduce((p,date)=>reorderBaskets(scenario,applyAction(scenario,p,{type:'GENERATE',date}),date).plan,plan)},
  ...Object.fromEntries(Object.values(VARIANTS).map(variant=>[`MAP07B_${variant.id}`,{label:`MAP-07B · ${variant.label}`,run:(scenario,plan)=>DATES.reduce((p,date)=>proposeDayPlan(scenario,p,date,{variant:variant.id,budgetMs:5000}).plan,plan)}])),
};

const stdev=values=>{if(!values.length)return 0;const mean=values.reduce((a,b)=>a+b,0)/values.length;return Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/values.length);};
const age=(order,date)=>Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(order.createdOn+'T12:00:00Z'))/86400000);

/** Metrics of a finished multi-day plan. `referenceCount` is the number of oldest eligible orders used for the "oldest included" share. */
export function measure(scenario,plan,{referenceIds,protectedBefore,runtimeMs}) {
  validatePlan(scenario,plan);
  const byId=new Map(scenario.orders.map(order=>[order.id,order]));
  const days=DATES.map(date=>evaluateDay(scenario,plan,date));
  const planned=new Set(plan.assignments.map(item=>item.orderId));
  let emptySlots=0,unjustified=0,violations=0;const loads=[];
  for(const date of DATES) for(const team of scenario.teams) {
    const open=plan.availability.find(a=>a.teamId===team.id&&a.date===date)?.slots??[];
    const used=new Set(plan.assignments.filter(item=>item.teamId===team.id&&item.date===date).flatMap(item=>Array.from({length:byId.get(item.orderId).slotsRequired},(_,i)=>item.start+i)));
    if(open.length)loads.push(used.size/open.length);
    violations+=assessBasket(scenario,plan,team.id,date).violations.length;
    for(const slot of open) {
      if(used.has(slot))continue;
      emptySlots++;
      const fits=scenario.orders.some(order=>!planned.has(order.id)&&order.ready&&team.skills.includes(order.type)&&order.slotsRequired<=1&&placementError(scenario,plan,{orderId:order.id,teamId:team.id,date,start:slot,origin:'AUTO',confirmed:false})===null);
      if(fits)unjustified++;
    }
  }
  const protectedKept=protectedBefore.every(item=>plan.assignments.some(a=>a.orderId===item.orderId&&a.teamId===item.teamId&&a.date===item.date&&a.start===item.start&&a.confirmed===item.confirmed&&a.origin===item.origin));
  const total=key=>days.reduce((sum,day)=>sum+day[key],0);
  return {planned:plan.assignments.length,installations:total('installs'),measurements:plan.assignments.length-total('installs'),
    oldestIncluded:referenceIds.filter(id=>planned.has(id)).length,oldestReference:referenceIds.length,
    km:+(total('km')/1000).toFixed(1),minutes:Math.round(total('minutes')/60),waitingDays:plan.assignments.reduce((sum,item)=>sum+age(byId.get(item.orderId),item.date),0),
    emptySlots,unjustifiedEmptySlots:unjustified,loadStdev:+stdev(loads).toFixed(3),violations,protectedKept,runtimeMs:Math.round(runtimeMs)};
}

export async function runBenchmark({repeats=1,log=()=>{}}={}) {
  const scenario=await loadScenario();
  const results={};
  for(const [scenarioId,scenarioSpec] of Object.entries(SCENARIOS)) {
    results[scenarioId]={label:scenarioSpec.label,approaches:{}};
    const start=scenarioSpec.make(scenario);
    const protectedBefore=start.assignments.filter(item=>item.confirmed||item.origin==='MANUAL');
    const reference=APPROACHES.MAP06.run(scenario,start);
    const referenceSize=reference.assignments.length;
    const eligibleOrders=[...scenario.orders].filter(order=>order.ready&&!start.assignments.some(item=>item.orderId===order.id)&&eligibility(scenario,start,DATES[0],[order.id]).pool.length).sort((a,b)=>a.createdOn.localeCompare(b.createdOn)||a.id.localeCompare(b.id));
    const referenceIds=eligibleOrders.slice(0,referenceSize-protectedBefore.length).map(order=>order.id);
    for(const [id,approach] of Object.entries(APPROACHES)) {
      const times=[];let plan;
      for(let i=0;i<repeats;i++){const t=now();plan=approach.run(scenario,start);times.push(now()-t);}
      times.sort((a,b)=>a-b);
      results[scenarioId].approaches[id]={label:approach.label,...measure(scenario,plan,{referenceIds,protectedBefore,runtimeMs:times[times.length>>1]}),plan};
      log(scenarioId,id);
    }
  }
  return {scenario,results};
}

/** Baskets whose total distance or longest leg improved between two plans (concrete examples for the report). */
export function improvedBaskets(scenario,before,after,dates=DATES) {
  const rows=[];
  for(const date of dates) for(const team of scenario.teams) {
    const a=assessBasket(scenario,before,team.id,date),b=assessBasket(scenario,after,team.id,date);
    const longest=assessment=>Math.max(0,...assessment.legs.filter(leg=>leg.status==='OK').map(leg=>leg.distanceM));
    rows.push({date,teamId:team.id,before:{orders:a.orders,m:a.distanceM,longest:longest(a)},after:{orders:b.orders,m:b.distanceM,longest:longest(b)}});
  }
  return rows;
}

const table=(rows,columns)=>[`| ${columns.map(c=>c[0]).join(' | ')} |`,`| ${columns.map(()=>'---').join(' | ')} |`,...rows.map(row=>`| ${columns.map(c=>c[1](row)).join(' | ')} |`)].join('\n');

export function renderMarkdown(results) {
  const parts=[];
  for(const [id,block] of Object.entries(results)) {
    const rows=Object.values(block.approaches);
    parts.push(`### ${id}: ${block.label}\n`,table(rows,[
      ['Wariant',r=>r.label],['Zaplanowane (inst.+pom.)',r=>`${r.planned} (${r.installations}+${r.measurements})`],['Najstarsze w planie',r=>`${r.oldestIncluded}/${r.oldestReference}`],
      ['Dni oczekiwania',r=>r.waitingDays],['km',r=>r.km],['min dojazdu',r=>r.minutes],['Puste sloty / nieuzasadnione',r=>`${r.emptySlots} / ${r.unjustifiedEmptySlots}`],
      ['Odch. std. obciążenia',r=>r.loadStdev],['Naruszenia',r=>r.violations],['Chronione bez zmian',r=>r.protectedKept?'tak':'NIE'],['Czas [ms]',r=>r.runtimeMs]]),'');
  }
  return parts.join('\n');
}

if(import.meta.url===`file:///${process.argv[1]?.replace(/\\/g,'/')}`||process.argv[1]?.endsWith('benchmark-optimizer.mjs')) {
  const repeats=Number(process.env.REPEATS??3);
  const {scenario,results}=await runBenchmark({repeats,log:(s,a)=>process.stderr.write(`${s}/${a}\n`)});
  console.log(renderMarkdown(results));
  const jsonIndex=process.argv.indexOf('--json');
  if(jsonIndex>0) {
    const clean=Object.fromEntries(Object.entries(results).map(([id,block])=>[id,{label:block.label,approaches:Object.fromEntries(Object.entries(block.approaches).map(([key,value])=>{const {plan,...rest}=value;return [key,rest];}))}]));
    await writeFile(process.argv[jsonIndex+1],JSON.stringify({generated:'frozen dataset, 5 teams, 3 days',repeats,results:clean},null,2),'utf8');
  }
  const base=results.EMPTY.approaches.MAP06.plan,best=results.EMPTY.approaches.MAP07B_AGE_FIRST.plan;
  console.log('\nNajdłuższy odcinek w koszykach (EMPTY): MAP-06 vs MAP-07B AGE_FIRST');
  for(const row of improvedBaskets(scenario,base,best).filter(row=>row.before.longest>20000||row.after.longest>20000))console.log(JSON.stringify(row));
}
