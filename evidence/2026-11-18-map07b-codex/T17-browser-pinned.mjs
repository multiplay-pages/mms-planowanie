import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const commit=process.argv[2];
assert.match(commit,/^[a-f0-9]{7,40}$/i);
const out=path.dirname(fileURLToPath(import.meta.url)),origin='http://127.0.0.1:8782';
const offline=path.join(out,`T17-${commit}-temporary.html`);
const fromGit=file=>execFileSync('git',['show',`${commit}:map05/${file}`],{maxBuffer:80*1024*1024});
const overrides=new Map();
for(const file of ['planner.mjs','optimizer.mjs','planner-model.mjs','routes.mjs'])overrides.set('/'+file,fromGit(file));
const {chromium}=await import(pathToFileURL(path.join(process.env.LOCALAPPDATA,'mms-e2e/node_modules/playwright-core/index.mjs')).href);
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
  args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
const server=spawn('python',['-B','-X','utf8','map05/serve.py','--port','8782'],{windowsHide:true,stdio:'ignore'});
const serverExit=once(server,'exit');
let created=false;
const outputs=[];
try{
  let reachable=false;
  for(let i=0;i<80&&!reachable;i++){
    assert.equal(server.exitCode,null);
    try {const response=await fetch(origin+'/planner.html');reachable=response.ok;await response.body?.cancel();}catch{}
    if(!reachable)await delay(150);
  }
  assert.ok(reachable);
  await writeFile(offline,fromGit('planner-offline.html'),{flag:'wx'});created=true;
  for(const [label,url] of [['served',origin+'/planner.html'],['offline',pathToFileURL(offline).href]]){
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
    const requests=[],errors=[],checks=[];
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin){
        if(!overrides.has(url.pathname))return route.continue();
        const response=await route.fetch({maxRedirects:0,maxRetries:0});
        const headers=response.headers();
        delete headers['content-length'];delete headers['content-encoding'];
        return route.fulfill({status:response.status(),headers,body:overrides.get(url.pathname)});
      }
      if(['file:','blob:','data:','about:'].includes(url.protocol))return route.continue();
      requests.push(url.hostname);
      return route.abort();
    });
    const page=await context.newPage();
    page.on('pageerror',err=>errors.push(err.name));
    page.on('console',msg=>{if(msg.type()==='error')errors.push('console error');});
    const snapshot=()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('mms-map05-plan-v1')).map(k=>localStorage.getItem(k)));
    const completed=()=>page.waitForFunction(()=>!document.querySelector('#opt-result').hidden&&/symulacja: plan nie został zmieniony/.test(document.querySelector('#opt-status').textContent),null,{timeout:30000});
    const hidden=()=>page.locator('#opt-result').isHidden();
    await page.goto(url,{waitUntil:'load',timeout:120000});
    await page.locator('#planner').waitFor({timeout:120000});
    await page.waitForFunction(()=>Boolean(document.querySelector('#operational-map')?.operationalView?.map.loaded()),null,{timeout:90000});
    const before=await snapshot();
    await page.click('#opt-run');
    await completed();
    await page.selectOption('#opt-variant','AGE_FIRST');
    assert.ok(await hidden());
    assert.match(await page.textContent('#opt-status'),/poprzednia propozycja została wycofana/);
    assert.deepEqual(await snapshot(),before);
    checks.push('variant change withdraws proposal');
    await page.click('#opt-run');
    await completed();
    const oldVariant=await page.textContent('#opt-status');
    await page.evaluate(()=>{
      const select=document.querySelector('#opt-variant');
      select.value='BALANCE_FIRST';select.dispatchEvent(new Event('change',{bubbles:true}));
      document.querySelector('#opt-run').click();
      document.querySelector('#opt-accept').click();
    });
    await completed();
    assert.match(oldVariant,/Starszeństwo/);
    assert.match(await page.textContent('#opt-status'),/Równomierność/);
    assert.ok(await page.locator('#opt-dialog').isHidden());
    assert.deepEqual(await snapshot(),before);
    checks.push('old proposal cannot be applied during new computation');
    await page.evaluate(()=>{
      document.querySelector('#opt-run').click();
      const input=document.querySelector('#planning-date');
      input.value=input.value==='2026-11-20'?'2026-11-19':'2026-11-20';
      input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>!document.querySelector('#opt-run').disabled);
    assert.ok(await hidden());
    assert.match(await page.textContent('#opt-status'),/zmienił się przed rozpoczęciem obliczeń/);
    assert.deepEqual(await snapshot(),before);
    checks.push('day change cancels pending computation');
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    outputs.push({label,commit,chrome:browser.version(),checks,errors,requests});
    await context.close();
  }
  await writeFile(path.join(out,`T17-${commit}-chrome-pinned.json`),JSON.stringify(outputs,null,2));
} finally {
  if(created)await unlink(offline);
  await browser.close();
  if(server.exitCode===null){server.kill();await serverExit;}
}
