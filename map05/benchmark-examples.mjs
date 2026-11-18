// MAP-07B: concrete baskets of the MAP-06 generator next to the MAP-07B proposal (frozen dataset, empty start). Markdown on stdout.
import {loadScenario,DATES} from './benchmark-optimizer.mjs';
import {createPlan,applyAction} from './planner-model.mjs';
import {proposeDayPlan} from './optimizer.mjs';
import {assessBasket} from './routes.mjs';
const scenario=await loadScenario(),city=id=>scenario.addresses.find(a=>a.id===scenario.orders.find(o=>o.id===id).addressId).city;
const km=m=>m===null?'—':(m/1000).toFixed(1).replace('.',',')+' km';
const describe=(plan,team,date)=>{const a=assessBasket(scenario,plan,team,date);const longest=Math.max(0,...a.legs.map(l=>l.distanceM??0));return {text:a.orders.map(id=>`${id} (${city(id)})`).join(' → ')||'pusty',total:a.distanceM,longest,count:a.orders.length};};
let base=createPlan(scenario),next=createPlan(scenario);const variant=process.argv[2]??'COVERAGE_FIRST';
for(const date of DATES){base=applyAction(scenario,base,{type:'GENERATE',date});next=proposeDayPlan(scenario,next,date,{variant,budgetMs:5000}).plan;}
console.log(`| Dzień | Ekipa | MAP-06 | km | najdł. odcinek | MAP-07B (${variant}) | km | najdł. odcinek |\n| --- | --- | --- | --- | --- | --- | --- | --- |`);
let a=0,b=0;
for(const date of DATES)for(const team of scenario.teams){const x=describe(base,team.id,date),y=describe(next,team.id,date);a+=x.total??0;b+=y.total??0;console.log(`| ${date.slice(5)} | ${team.id} | ${x.text} | ${km(x.total)} | ${km(x.longest)} | ${y.text} | ${km(y.total)} | ${km(y.longest)} |`);}
console.log(`\nRazem: MAP-06 ${km(a)}, MAP-07B ${km(b)}; zaplanowane ${base.assignments.length} → ${next.assignments.length}.`);
const maxLeg=plan=>Math.max(...DATES.flatMap(d=>scenario.teams.map(t=>describe(plan,t.id,d).longest)));
console.log(`Najdłuższy pojedynczy odcinek: MAP-06 ${km(maxLeg(base))}, MAP-07B ${km(maxLeg(next))}.`);
