// MAP-07B + MAP-08 integration E2E, real Chrome. No customer data or external URLs.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const cases=[
  {name:'served',url:'http://127.0.0.1:8765/',offline:false},
  {name:'offline',url:pathToFileURL(resolve('map05/planner-offline.html')).href,offline:true},
];
const browser=await chromium.launch({channel:process.env.CI_CHROME_CHANNEL||undefined,headless:true,args:['--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let count=0;
const check=(name,value,detail='')=>{assert.ok(value,name+(detail?' — '+detail:''));console.log('PASS '+name+(detail?' — '+detail:''));count++;};
try{
  for(const item of cases){
    const context=await browser.newContext({viewport:{width:1440,height:900},offline:item.offline});
    const page=await context.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push('PAGE: '+String(e)));
    page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE: '+m.text());});
    context.on('request',r=>{if(!/^(http:\/\/127\.0\.0\.1:\d+\/|file:|data:|blob:|about:)/.test(r.url()))external.push(r.url());});
    await page.goto(item.url,{waitUntil:'domcontentloaded',timeout:180000});
    await page.waitForSelector('#planner:not([hidden])',{timeout:120000});
    await page.waitForSelector('#op-map-shell:not([hidden])',{timeout:120000});
    check(item.name+' map shell',await page.isVisible('#operational-map'));
    check(item.name+' optimisation remains labelled simulation',/BEZ AUTOMATYCZNEGO ZATWIERDZANIA/.test(await page.textContent('#optimizer')));
    check(item.name+' map variants',await page.locator('#op-variant option').count()>=2);
    await page.fill('#planning-date','2026-11-19');
    await page.dispatchEvent('#planning-date','change');
    await page.click('#opt-run');
    await page.waitForSelector('#opt-result:not([hidden])',{timeout:120000});
    check(item.name+' optimizer proposal',await page.isVisible('#opt-compare'));
    const before=await page.locator('#op-layers ol li').count();
    await page.check('input[name="opt-view"][value="proposal"]');
    await page.waitForFunction(()=>document.querySelector('#op-layers')?.textContent.includes('PODGLĄD PROPOZYCJI'),{timeout:60000});
    const after=await page.locator('#op-layers ol li').count();
    check(item.name+' map synced with proposal',after>before,`${before} to ${after} visits`);
    check(item.name+' preview not stored',await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('mms-map05-plan-v1')).every(k=>JSON.parse(localStorage.getItem(k)).assignments.length===0)));
    await page.click('#op-workspace');
    check(item.name+' large map opens',await page.evaluate(()=>document.body.classList.contains('op-ws-open')));
    await page.click('#op-workspace-close');
    check(item.name+' large map closes',await page.evaluate(()=>!document.body.classList.contains('op-ws-open')));
    await page.click('#opt-accept');
    check(item.name+' acceptance requires dialog',await page.isVisible('#opt-dialog'));
    await page.click('#opt-dialog-cancel');
    check(item.name+' cancelling preserves empty plan',await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('mms-map05-plan-v1')).every(k=>JSON.parse(localStorage.getItem(k)).assignments.length===0)));
    await page.click('#opt-accept');
    await page.click('#opt-dialog-accept');
    const accepted=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('mms-map05-plan-v1')).reduce((sum,k)=>sum+JSON.parse(localStorage.getItem(k)).assignments.length,0));
    check(item.name+' accepted proposal stored',accepted>0,String(accepted));
    await page.click('#undo');
    const afterUndo=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('mms-map05-plan-v1')).reduce((sum,k)=>sum+JSON.parse(localStorage.getItem(k)).assignments.length,0));
    check(item.name+' undo restores plan',afterUndo===0,String(afterUndo));
    check(item.name+' no external traffic',external.length===0,external.join(';'));
    check(item.name+' no page/console errors',errors.length===0,errors.slice(0,3).join('; '));
    await context.close();
  }
  console.log(`INTEGRATION PASS ${count}/${count}`);
}finally{await browser.close();}
