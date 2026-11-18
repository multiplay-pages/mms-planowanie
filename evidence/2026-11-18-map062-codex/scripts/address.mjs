import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from './guard.mjs';
import {CHROME} from './lib.mjs';
const root=process.cwd(),base=path.resolve('evidence/2026-11-18-map062-codex'),shots=path.join(base,'screenshots');
const dataset=JSON.parse(fs.readFileSync('map05/data/addresses.json','utf8'));
const expected=Object.fromEntries(dataset.addresses.map((a,i)=>[`TEST-${String(i+1).padStart(3,'0')}`,{street:a.label.split(', ').slice(1).join(', '),place:a.label.split(', ')[0],label:a.label}]));
const results=[];const record=(id,ok,actual)=>{results.push({id,status:ok?'PASS':'FAIL',actual});console.log(`${ok?'PASS':'FAIL'} ${id} ${JSON.stringify(actual)}`);};
const browser=await chromium.launch({executablePath:CHROME,headless:true,args:[]});
const plan=p=>p.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('mms-map05-plan')))));
async function open(url,args={}){const c=await browser.newContext({viewport:{width:1600,height:1050},...args});const p=await c.newPage();await p.goto(url,{waitUntil:'load'});await p.waitForSelector('#planner:not([hidden])');return {c,p};}
async function ready(p){await p.waitForFunction(()=>{const v=document.querySelector('#operational-map')?.operationalView;return v&&v.map.loaded()&&!v.map.isMoving();},null,{timeout:90000});}
async function select(p,id){const loc=p.locator(`#baskets button[data-order="${id}"],#queue-list button[data-order="${id}"]`).first();await loc.click();}
async function panel(p,id,assigned){const r=await p.locator('#order-details .address-card').evaluate(n=>({caption:n.querySelector('.address-caption').textContent,street:n.querySelector('.address-street').textContent,place:n.querySelector('.address-place').textContent,slot:n.querySelector('.address-slot')?.textContent??null}));record('panel-'+id+'-'+assigned,r.caption==='Adres wizyty'&&r.street===expected[id].street&&r.place===expected[id].place&&Boolean(r.slot)===assigned,r);return r;}
try{
  const {c,p}=await open('http://127.0.0.1:8771/');await ready(p);
  const gpu=await p.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl');const d=gl.getExtension('WEBGL_debug_renderer_info');return d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):'WebGL';});record('gpu',!/SwiftShader|llvmpipe|software/i.test(gpu),{chrome:browser.version(),gpu});
  await p.fill('#planning-date','2026-11-19');await p.dispatchEvent('#planning-date','change');await p.click('#generate');
  const assigned=(await plan(p)).assignments.filter(a=>a.date==='2026-11-19');
  const cards=await p.locator('#baskets button[data-order]').evaluateAll(ns=>ns.map(n=>({id:n.dataset.order,street:n.querySelector('.visit-address b')?.textContent,place:n.querySelector('.visit-address i')?.textContent})));
  const rows=await p.locator('#op-layers button[data-order]').evaluateAll(ns=>ns.map(n=>({id:n.dataset.order,street:n.querySelector('.op-address b')?.textContent})));
  record('every-slot-address',cards.length>=assigned.length&&cards.every(x=>x.street===expected[x.id].street&&x.place.replace(' · ciąg dalszy','')===expected[x.id].place),cards);
  record('every-layer-address',rows.length===assigned.length&&rows.every(x=>x.street===expected[x.id].street),rows);
  for(const a of assigned){await select(p,a.orderId);const r=await panel(p,a.orderId,true);const times=['08:00','11:00','14:00','17:00'];const card=p.locator(`#baskets button[data-order="${a.orderId}"]`).count();record('slot-line-'+a.orderId,r.slot.startsWith(`${a.date} · ${a.teamId} · `)&&r.slot.includes(times[a.start]),{slot:r.slot,start:a.start});}
  const id='TEST-013';await select(p,id);record('apartment-number',(await p.textContent('.address-street'))==='ul. Rynek 25/2',{street:await p.textContent('.address-street')});
  // Actual rendered point -> real popup -> edit button -> same panel address.
  await p.locator('#operational-map').scrollIntoViewIfNeeded();await p.evaluate(id=>{const v=document.querySelector('#operational-map').operationalView;const f=v.map.getSource('visits').serialize().data.features.find(x=>x.properties.orderId===id);v.map.jumpTo({center:f.geometry.coordinates,zoom:15});},id);await ready(p);
  const pt=await p.evaluate(id=>{const v=document.querySelector('#operational-map').operationalView;const f=v.map.getSource('visits').serialize().data.features.find(x=>x.properties.orderId===id),r=v.map.project(f.geometry.coordinates);return{x:r.x,y:r.y};},id);const box=await p.locator('#operational-map').boundingBox();await p.mouse.click(box.x+pt.x,box.y+pt.y);await p.waitForSelector('.op-popup');await p.locator('.op-popup').screenshot({path:path.join(shots,'A-popup.png')});await p.click('.op-popup button');await panel(p,id,true);
  await p.locator('#order-details').screenshot({path:path.join(shots,'A-selected-assigned.png')});
  // Confirmed window still displays the same address and reserved slot.
  await p.click('#confirm-order');const locked=await panel(p,id,true);record('confirmed-address',Boolean((await plan(p)).assignments.find(a=>a.orderId===id)?.confirmed),locked);await p.click('#undo');
  // Move through the normal form to another day (empty basket, no fabricated routes).
  await p.selectOption('#assignment-team','TEST-02');await p.fill('#assignment-date','2026-11-20');await p.selectOption('#assignment-slot','0');await p.click('#assign-order');
  const moved=(await plan(p)).assignments.find(a=>a.orderId===id);const movedCard=await panel(p,id,true);record('moved-slot',moved?.date==='2026-11-20'&&moved?.teamId==='TEST-02'&&movedCard.slot.includes('2026-11-20 · TEST-02 · 08:00'),{moved,movedCard});
  await p.fill('#planning-date','2026-11-20');await p.dispatchEvent('#planning-date','change');await select(p,id);await panel(p,id,true);
  await p.click('#remove-order');await panel(p,id,false);record('returned-to-queue',!(await plan(p)).assignments.some(a=>a.orderId===id),await p.textContent('#message'));
  await p.locator('#order-details .address-card').screenshot({path:path.join(shots,'A-queue-card.png')});
  await c.close();
  // Fresh plans for responsive checks; the longest address is selected from original labels.
  const longId=Object.keys(expected).sort((a,b)=>expected[b].street.length-expected[a].street.length)[0];
  for(const width of [1600,1440,1150,700,390]){
    const {c,p}=await open('http://127.0.0.1:8771/',{viewport:{width,height:1000}});await ready(p);
    await p.fill('#planning-date','2026-11-19');await p.dispatchEvent('#planning-date','change');await p.click('#generate');await select(p,longId);
    const metrics=await p.evaluate(()=>{const card=document.querySelector('.address-card'),street=card.querySelector('.address-street'),slot=document.querySelector('.visit-address b');const s=getComputedStyle(street),ss=getComputedStyle(slot),b=card.getBoundingClientRect(),r=street.getBoundingClientRect();return{scrollWidth:document.documentElement.scrollWidth,width:innerWidth,workspaceDisplay:getComputedStyle(document.querySelector('.workspace')).display,columns:getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns,cardWidth:b.width,streetWidth:r.width,streetHeight:r.height,lineHeight:s.lineHeight,font:s.fontSize,weight:s.fontWeight,color:s.color,background:getComputedStyle(card).backgroundColor,slotFont:ss.fontSize,slotWeight:ss.fontWeight,slotColor:ss.color,basketOverflow:[...document.querySelectorAll('.visit-address')].filter(x=>x.scrollWidth>x.clientWidth+1).map(x=>({text:x.textContent,width:x.clientWidth,scroll:x.scrollWidth})),panelOverflow:street.scrollWidth>street.clientWidth+1};});
    record('layout-'+width,metrics.scrollWidth<=width&& !metrics.panelOverflow&&metrics.basketOverflow.length===0&&parseFloat(metrics.font)>=20&&Number(metrics.weight)>=700&&(width!==1600||metrics.columns.split(' ').length===3)&&(width!==1150||metrics.columns.split(' ').length===2),{id:longId,expected:expected[longId],...metrics});
    await p.locator('#order-details').screenshot({path:path.join(shots,`A-details-${width}.png`)});await p.locator('#baskets').screenshot({path:path.join(shots,`A-baskets-${width}.png`)});await c.close();
  }
  // No server flag: valid saved mock provider still cannot start.
  for(const [tag,url] of [['no-flag','http://127.0.0.1:8771/'],['file',pathToFileURL(path.join(root,'map05/planner-offline.html')).href]]){
    const {c,p}=await open(url);await ready(p);let tiles=0;p.on('request',r=>{if(r.url().startsWith('http://127.0.0.1:8791/'))tiles++;});
    await p.evaluate(()=>localStorage.setItem('mms-map06-satellite-v1',JSON.stringify({url:'http://127.0.0.1:8791/{z}/{x}/{y}.png',attribution:'Atrapa lokalna',consent:true,preset:'custom'})));
    await p.click('input[name=op-basemap][value=satellite]');await p.waitForTimeout(500);const message=await p.textContent('#message');const data=await p.evaluate(()=>({satellite:!!document.querySelector('#operational-map').operationalView.map.getSource('satellite'),road:document.querySelector('input[name=op-basemap][value=road]').checked}));
    record('satellite-'+tag,tiles===0&&!data.satellite&&data.road&&(tag==='file'||message.includes('Uruchom planer plikiem Uruchom-planer.bat')),{message,tiles,...data});await p.locator('#message').screenshot({path:path.join(shots,`B-${tag}-blocked.png`)});await c.close();
  }
  // SVG-specific new address cards, using a genuinely WebGL-disabled browser.
  const svgBrowser=await chromium.launch({executablePath:CHROME,headless:true,args:['--disable-gpu','--disable-3d-apis','--disable-webgl']});
  const sc=await svgBrowser.newContext({viewport:{width:1150,height:1000}}),sp=await sc.newPage();await sp.goto('http://127.0.0.1:8771/');await sp.waitForSelector('#planner:not([hidden])');await sp.fill('#planning-date','2026-11-19');await sp.dispatchEvent('#planning-date','change');await sp.click('#generate');await select(sp,'TEST-013');await panel(sp,'TEST-013',true);record('svg-address',await sp.isHidden('#op-map-shell'),{street:await sp.textContent('.address-street'),markers:await sp.locator('#planner-map .map-marker').count()});await sp.locator('#order-details').screenshot({path:path.join(shots,'A-svg-details.png')});await svgBrowser.close();
}catch(e){record('HARNESS',false,String(e.stack).replaceAll(root,'<repo>'));}
finally{await browser.close();fs.writeFileSync(path.join(base,'address-results.json'),JSON.stringify(results,null,2));}
