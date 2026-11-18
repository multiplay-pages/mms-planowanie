import fs from 'node:fs';
import path from 'node:path';
import {chromium} from './guard.mjs';
import {CHROME} from './lib.mjs';
const base=path.resolve('evidence/2026-11-18-map062-codex'),rows=[];
const record=(id,ok,actual)=>{rows.push({id,status:ok?'PASS':'FAIL',actual});console.log(id,ok?'PASS':'FAIL',JSON.stringify(actual));};
const lum=rgb=>rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[0.2126,0.7152,0.0722][i],0);
const b=await chromium.launch({executablePath:CHROME,headless:true});
try{
 const c=await b.newContext({viewport:{width:1600,height:1000}}),p=await c.newPage();await p.goto('http://127.0.0.1:8771/');await p.waitForSelector('#planner:not([hidden])');await p.waitForFunction(()=>document.querySelector('#operational-map').operationalView?.map.loaded());
 await p.fill('#planning-date','2026-11-19');await p.dispatchEvent('#planning-date','change');await p.click('#generate');
 const plan=await p.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(x=>x.startsWith('mms-map05-plan')))));
 for(const a of plan.assignments.filter(x=>x.date==='2026-11-19')){
  const cards=p.locator(`#baskets button[data-order="${a.orderId}"]`),n=await cards.count();await cards.first().click();const line=await p.textContent('.address-slot');const times=['08:00','11:00','14:00','17:00'];record('full-window-'+a.orderId,line===`${a.date} · ${a.teamId} · ${times[a.start]}–${times[a.start+n]}`,{n,line});
 }
 await p.click('#queue-list [data-order="TEST-107"]');await p.selectOption('#assignment-team','TEST-02');await p.fill('#assignment-date','2026-11-20');await p.selectOption('#assignment-slot','0');await p.click('#assign-order');
 record('long-address-assigned',(await p.textContent('.address-slot'))==='2026-11-20 · TEST-02 · 08:00–11:00',await p.textContent('#message'));
 await p.fill('#planning-date','2026-11-20');await p.dispatchEvent('#planning-date','change');
 for(const width of [1600,1440,1150,700,390]){
  await p.setViewportSize({width,height:1000});await p.click('#baskets button[data-order="TEST-107"]');
  const m=await p.evaluate(()=>{const sel=s=>document.querySelector(s);const slot=sel('#baskets .visit-address b'),layer=sel('#op-layers .op-address'),card=sel('.address-card'),text=sel('.address-street');return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,slot:{street:slot.textContent,width:slot.clientWidth,scroll:slot.scrollWidth,color:getComputedStyle(slot).color,background:getComputedStyle(slot.closest('button')).backgroundColor,font:getComputedStyle(slot).fontSize,weight:getComputedStyle(slot).fontWeight},layer:{text:layer.textContent,width:layer.clientWidth,scroll:layer.scrollWidth},panel:{color:getComputedStyle(text).color,background:getComputedStyle(card).backgroundColor,slot:sel('.address-slot').textContent}};});
  const contrast=Object.fromEntries(['slot','panel'].map(k=>{const x=lum(m[k].color),y=lum(m[k].background);return[k,(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)];}));
  record('long-basket-'+width,m.scrollWidth<=width&&m.slot.scroll<=m.slot.width+1&&m.layer.scroll<=m.layer.width+1&&contrast.slot>=4.5&&contrast.panel>=4.5&&m.slot.street==='ul. Kardynała Stefana Wyszyńskiego 7/24',{...m,contrast});
  await p.locator('#baskets').screenshot({path:path.join(base,'screenshots',`A-long-basket-${width}.png`)});await p.locator('#order-details .address-card').screenshot({path:path.join(base,'screenshots',`A-long-assigned-${width}.png`)});
 }
 await c.close();
}catch(e){record('HARNESS',false,String(e.stack).replaceAll(process.cwd(),'<repo>'));}
finally{await b.close();fs.writeFileSync(path.join(base,'followup-results.json'),JSON.stringify(rows,null,2));}
