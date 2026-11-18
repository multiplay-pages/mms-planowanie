import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const {chromium}=await import(pathToFileURL(path.join(process.env.LOCALAPPDATA,'mms-e2e/node_modules/playwright-core/index.mjs')).href);
const origin='http://127.0.0.1:8782';
const output=path.dirname(fileURLToPath(import.meta.url));
const evidencePrefix=process.env.MMS_AUDIT_PREFIX??'';
const days=['2026-11-18','2026-11-19','2026-11-20'];
const variants=['COVERAGE_FIRST','AGE_FIRST','BALANCE_FIRST'];
const clean=value=>String(value).replace(/file:\/\/\/[^\s)]+/g,'<local file>').replace(/C:\\Users\\[^\s)]+/ig,'<local path>');
const snapshot=page=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('mms-map05-plan-v1')).map(k=>localStorage.getItem(k))[0]??null);
const rows=page=>page.locator('#opt-compare tr').evaluateAll(list=>list.map(row=>Array.from(row.cells,c=>c.textContent.trim())));
const loaded=async(page,url)=>{
  await page.goto(url,{waitUntil:'load',timeout:120000});
  await page.locator('#planner').waitFor({timeout:120000});
  await page.waitForFunction(()=>Boolean(document.querySelector('#operational-map')?.operationalView?.map.loaded()),null,{timeout:90000});
};
const result=page=>page.waitForFunction(()=>!document.querySelector('#opt-result').hidden&&/To symulacja|symulacja: plan nie został zmieniony/.test(document.querySelector('#opt-status').textContent),null,{timeout:30000});
const day=(page,date)=>page.locator('#planning-date').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},date);
const run=async(page,variant='COVERAGE_FIRST')=>{
  await page.selectOption('#opt-variant',variant);
  await page.locator('#opt-run').click();
  await result(page);
};
const loadPlan=(page,raw)=>page.locator('#load-plan').setInputFiles({name:'test-plan.json',mimeType:'application/json',buffer:Buffer.from(raw)});
const browser=await chromium.launch({
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:true,
  args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
});
const child=spawn('python',['-B','-X','utf8','map05/serve.py','--port','8782'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
const childExit=once(child,'exit');

async function audit(label,url) {
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
  const requests=[],errors=[],checks=[];
  const page=await context.newPage();
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin||['file:','blob:','data:','about:'].includes(url.protocol))return route.continue();
    requests.push(url.hostname);return route.abort();
  });
  page.on('pageerror',error=>errors.push(clean(error)));
  page.on('console',m=>{if(m.type()==='error')errors.push(clean(m.text()));});
  const check=async(id,action)=>{
    try {const detail=await action();checks.push({id,status:'PASS',detail});console.log(label,id,'PASS');}
    catch(error){const detail=clean(error.message);checks.push({id,status:'FAIL',detail});console.log(label,id,'FAIL',detail);}
  };
  const evidence={label,chrome:browser.version(),checks,requests,errors,matrix:[]};
  try {
    await loaded(page,url);
    evidence.map=await page.evaluate(()=>{
      const {map}=document.querySelector('#operational-map').operationalView;
      const gl=map.getCanvas().getContext('webgl2');
      return {loaded:map.loaded(),renderer:gl?.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL??gl.RENDERER)};
    });
    await page.evaluate(()=>{window.__longTasks=[];new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__longTasks.push(Math.round(entry.duration));}).observe({type:'longtask'});});
    const initial=await snapshot(page);
    for(const date of days)for(const variant of variants)await check(`matrix/${date}/${variant}`,async()=>{
      await day(page,date);
      if(await page.locator('#opt-reject').isVisible())await page.click('#opt-reject');
      const start=Date.now();
      await run(page,variant);
      const elapsedMs=Date.now()-start;
      const comparison=await rows(page);
      const status=await page.textContent('#opt-status');
      assert.equal(await snapshot(page),initial);
      assert.equal(comparison.length,7);
      evidence.matrix.push({date,variant,elapsedMs,status,comparison});
    });

    await check('preview changes map only; reject keeps plan',async()=>{
      const count=()=>page.locator('#op-layers ol li').count();
      const before=await count();
      await page.check('input[name="opt-view"][value="proposal"]');
      await page.locator('#op-layers .opt-banner').waitFor();
      const preview=await count();
      assert.ok(preview>before);
      assert.equal(await snapshot(page),initial);
      await page.check('input[name="opt-view"][value="current"]');
      assert.equal(await count(),before);
      await page.click('#opt-reject');
      assert.ok(await page.locator('#opt-result').isHidden());
      assert.equal(await snapshot(page),initial);
      return {before,preview};
    });
    await check('accept and undo with keyboard; Tab and Esc',async()=>{
      await page.locator('#opt-run').focus();
      await page.keyboard.press('Enter');
      await result(page);
      await page.locator('#opt-accept').focus();
      await page.keyboard.press('Enter');
      assert.ok(await page.locator('#opt-dialog').isVisible());
      await page.keyboard.press('Tab');
      assert.ok(await page.locator('#opt-dialog').evaluate(dialog=>dialog.contains(document.activeElement)));
      await page.keyboard.press('Escape');
      assert.ok(await page.locator('#opt-dialog').isHidden());
      assert.equal(await snapshot(page),initial);
      await page.locator('#opt-accept').focus();
      await page.keyboard.press('Enter');
      await page.locator('#opt-dialog-accept').focus();
      await page.keyboard.press('Enter');
      assert.ok(JSON.parse(await snapshot(page)).assignments.length>0);
      await page.click('#undo');
      assert.deepEqual(JSON.parse(await snapshot(page)).assignments,initial===null?[]:JSON.parse(initial).assignments);
    });
    await check('protected assignments survive; no preview in JSON; import invalidates proposal',async()=>{
      await day(page,days[1]);
      await page.click('#generate');
      const generated=JSON.parse(await snapshot(page));
      assert.ok(generated.assignments.length>2);
      generated.assignments[0].confirmed=true;
      generated.assignments[1].origin='MANUAL';
      const locks=generated.assignments.slice(0,2);
      const seeded=JSON.stringify(generated);
      await loadPlan(page,seeded);
      await page.waitForFunction(()=>JSON.parse(Object.keys(localStorage).filter(k=>k.startsWith('mms-map05-plan-v1')).map(k=>localStorage.getItem(k))[0]).assignments[0].confirmed);
      const before=await snapshot(page);
      await run(page);
      await page.check('input[name="opt-view"][value="proposal"]');
      const downloading=page.waitForEvent('download');
      await page.click('#save-plan');
      const download=await downloading;
      let exported='';
      for await(const chunk of await download.createReadStream())exported+=chunk.toString('utf8');
      assert.deepEqual(JSON.parse(exported),JSON.parse(before));
      assert.equal(await snapshot(page),before);
      await page.click('#opt-accept');
      await page.click('#opt-dialog-accept');
      const accepted=JSON.parse(await snapshot(page));
      for(const locked of locks)assert.deepEqual(accepted.assignments.find(a=>a.orderId===locked.orderId),locked);
      await page.click('#undo');
      assert.equal(await snapshot(page),before);
      await run(page);
      await page.check('input[name="opt-view"][value="proposal"]');
      const empty=JSON.stringify({...generated,assignments:[]});
      await loadPlan(page,empty);
      await page.locator('#opt-result').waitFor({state:'hidden'});
      assert.deepEqual(JSON.parse(await snapshot(page)).assignments,[]);
      assert.equal(await page.locator('#op-layers .opt-banner').count(),0);
      return locks.map(({orderId,origin,confirmed})=>({orderId,origin,confirmed}));
    });
    await check('layout and reachable controls at 1440/1150/700/390',async()=>{
      if(await page.locator('#opt-result').isHidden())await run(page);
      const layout=[];
      for(const width of [1440,1150,700,390]){
        await page.setViewportSize({width,height:1000});
        const metrics=await page.locator('#optimizer').evaluate(el=>({doc:document.documentElement.scrollWidth-document.documentElement.clientWidth,panel:el.scrollWidth-el.clientWidth,table:el.querySelector('.table-scroll').scrollWidth-el.querySelector('.table-scroll').clientWidth}));
        layout.push({width,...metrics});
      }
      await page.locator('#opt-compare').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(output,`${evidencePrefix}${label}-390.png`)});
      await page.setViewportSize({width:1440,height:1000});
      assert.ok(layout.every(item=>item.doc<=1&&item.panel<=1),JSON.stringify(layout));
      return layout;
    });
    await check('same-turn repeated run clicks do not change plan',async()=>{
      if(await page.locator('#opt-reject').isVisible())await page.click('#opt-reject');
      const before=await snapshot(page);
      const handled=await page.locator('#opt-run').evaluate(button=>{
        let handled=0;button.addEventListener('click',()=>handled++);
        button.click();button.click();button.click();
        return handled;
      });
      await result(page);
      assert.equal(handled,1);
      assert.equal(await snapshot(page),before);
      return handled;
    });
    await check('run stays bound to the date at click',async()=>{
      await day(page,days[0]);
      const before=await snapshot(page);
      await page.evaluate(date=>{
        document.querySelector('#opt-run').click();
        const d=document.querySelector('#planning-date');d.value=date;d.dispatchEvent(new Event('change',{bubbles:true}));
        const s=document.querySelector('#queue-search');s.value='TEST-075';s.dispatchEvent(new Event('input',{bubbles:true}));
      },days[1]);
      await page.waitForFunction(()=>!/Obliczanie/.test(document.querySelector('#opt-status').textContent));
      assert.equal(await snapshot(page),before);
      if(await page.locator('#opt-accept').isVisible()){
        await page.click('#opt-accept');
        const dialog=await page.textContent('#opt-dialog-text');
        await page.keyboard.press('Escape');
        assert.ok(dialog.includes(days[0]),dialog);
      }
    });
    await check('dialog remains bound to the simulated plan it described',async()=>{
      await day(page,days[1]);
      await page.locator('#queue-search').fill('');
      if(await page.locator('#opt-reject').isVisible())await page.click('#opt-reject');
      const before=await snapshot(page);
      const matrix=evidence.matrix.filter(row=>row.date===days[1]);
      const candidates=matrix.flatMap(a=>matrix.filter(b=>a.variant!==b.variant&&JSON.stringify(a.comparison)!==JSON.stringify(b.comparison)).map(b=>[a,b]));
      assert.ok(candidates.length,'Need two different proposals for the same base day');
      const [first,second]=candidates[0];
      await run(page,first.variant);
      const beforeRows=await rows(page);
      await page.selectOption('#opt-variant',second.variant);
      await page.evaluate(()=>{document.querySelector('#opt-run').click();document.querySelector('#opt-accept').click();});
      const shown=await page.textContent('#opt-dialog-text');
      await result(page);
      const afterRows=await rows(page);
      const stillOpen=await page.locator('#opt-dialog').isVisible();
      if(stillOpen){
        await page.screenshot({path:path.join(output,`${evidencePrefix}${label}-dialog-race.png`)});
        await page.click('#opt-dialog-accept');
      }
      const saved=await snapshot(page);
      const detail={first:first.variant,second:second.variant,shown,beforeRows,afterRows,stillOpen,changed:saved!==before,savedCount:saved?JSON.parse(saved).assignments.length:0};
      evidence.race=detail;
      if(saved!==before)await page.click('#undo');
      assert.ok(!stillOpen||JSON.stringify(beforeRows)===JSON.stringify(afterRows)||saved===before,'Dialog continued to display the earlier summary and accepted after a different calculation');
      return detail;
    });
    evidence.longTasksMs=await page.evaluate(()=>window.__longTasks);
  } catch(error) {checks.push({id:'startup/orchestration',status:'BLOCKED',detail:clean(error.message)});}
  await check('no external attempts',()=>assert.deepEqual(requests,[]));
  await check('no errors in console or page',()=>assert.deepEqual(errors,[]));
  await context.close();
  await writeFile(path.join(output,`${evidencePrefix}${label}-results.json`),JSON.stringify(evidence,null,2));
}

async function supplemental(label,url) {
  const contextOptions={serviceWorkers:'block',viewport:{width:1440,height:1000}};
  const checks=[],external=[],errors=[];
  async function exercise(id,denyStorage,action){
    const context=await browser.newContext(contextOptions);
    await context.route('**/*',route=>{
      const request=new URL(route.request().url());
      if(request.origin===origin||['file:','blob:','data:','about:'].includes(request.protocol))return route.continue();
      external.push(request.hostname);return route.abort();
    });
    if(denyStorage)await context.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Test blocks Web Storage','SecurityError');}}));
    const page=await context.newPage();
    page.on('pageerror',err=>errors.push(clean(err)));
    page.on('console',msg=>{if(msg.type()==='error')errors.push(clean(msg.text()));});
    try{const detail=await action(page);checks.push({id,status:'PASS',detail});console.log(label,id,'PASS');}
    catch(error){const detail=clean(error.message);checks.push({id,status:'FAIL',detail});console.log(label,id,'FAIL',detail);}
    finally{await context.close();}
  }
  await exercise('disabled localStorage permits in-memory acceptance and undo',true,async page=>{
    await loaded(page,url);
    await day(page,days[1]);
    const count=()=>page.locator('#op-layers ol li').count();
    const empty=await count();
    await run(page);
    await page.check('input[name="opt-view"][value="proposal"]');
    assert.ok(await count()>empty);
    await page.check('input[name="opt-view"][value="current"]');
    assert.equal(await count(),empty);
    await page.click('#opt-accept');
    await page.click('#opt-dialog-accept');
    const accepted=await count();
    const storageStatus=await page.textContent('#storage-status');
    assert.ok(accepted>empty);
    assert.match(storageStatus,/niedostępn/);
    await page.click('#undo');
    assert.equal(await count(),empty);
    await run(page);
    await page.click('#opt-accept');
    await page.click('#opt-dialog-accept');
    await loaded(page,url);
    await day(page,days[1]);
    assert.equal(await count(),empty);
    return {empty,accepted,storageStatus};
  });
  await exercise('filter-only change during run and refresh during preview',false,async page=>{
    await loaded(page,url);
    await day(page,days[1]);
    await page.click('#generate');
    const initial=await snapshot(page);
    await run(page);
    const baseline=await rows(page);
    await page.click('#opt-reject');
    await page.evaluate(()=>{
      document.querySelector('#opt-run').click();
      const input=document.querySelector('#queue-search');
      input.value='TEST-075';input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    await result(page);
    assert.deepEqual(await rows(page),baseline);
    assert.equal(await snapshot(page),initial);
    await page.check('input[name="opt-view"][value="proposal"]');
    await loaded(page,url);
    assert.equal(await snapshot(page),initial);
    assert.ok(await page.locator('#opt-result').isHidden());
    assert.equal(await page.locator('#op-layers .opt-banner').count(),0);
    return {persistedAssignments:JSON.parse(initial).assignments.length};
  });
  await exercise('changing variant invalidates the previous proposal',false,async page=>{
    await loaded(page,url);
    await day(page,days[1]);
    await run(page,'COVERAGE_FIRST');
    const oldStatus=await page.textContent('#opt-status');
    await page.selectOption('#opt-variant','AGE_FIRST');
    const remains=await page.locator('#opt-accept').isVisible();
    const hierarchy=await page.textContent('#opt-hierarchy');
    const status=await page.textContent('#opt-status');
    assert.ok(!remains,JSON.stringify({remains,unchangedStatus:oldStatus===status,hierarchy,status}));
  });
  await writeFile(path.join(output,`${evidencePrefix}${label}-supplement.json`),JSON.stringify({checks,external,errors},null,2));
}

try {
  let reachable=false;
  for(let i=0;i<80&&!reachable;i++){
    if(child.exitCode!==null)throw Error('The test server exited before it was ready');
    try {const res=await fetch(origin+'/planner.html');reachable=res.ok;await res.body?.cancel();}catch{}
    if(!reachable)await delay(150);
  }
  assert.ok(reachable,'Loopback server did not start');
  for(const [label,url] of [['served',origin+'/planner.html'],['offline',pathToFileURL(path.resolve('map05/planner-offline.html')).href]]){
    if(process.argv.includes('--supplement'))await supplemental(label,url);
    else await audit(label,url);
  }
} finally {
  await browser.close();
  if(child.exitCode===null){child.kill();await childExit;}
}
