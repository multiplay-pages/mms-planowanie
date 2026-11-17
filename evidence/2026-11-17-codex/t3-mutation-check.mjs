// No browser; copies trusted source and DOM tests into an isolated OS temp directory.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const evidence=fileURLToPath(new URL('.',import.meta.url));
const root=path.resolve(evidence,'../..'),temp=await mkdtemp(path.join(os.tmpdir(),'mms-t3-review-'));
const sanitize=text=>text.split(pathToFileURL(temp).href).join('file:///<temp>').split(temp).join('<temp>').split(pathToFileURL(root).href).join('file:///<repo>').split(root).join('<repo>');
const files=['planner.mjs','planner-model.mjs','planner-map.mjs','map.mjs','locations.mjs','routes.mjs','planner.css','planner.html',
  'tests/planner-map.test.mjs','tests/planner-ui.test.mjs','tests/road-fixture.mjs','data/addresses.json','data/geocoding.json','data/uug-geocoding.json','basemap/data.json'];
for(const relative of files){const target=path.join(temp,relative);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,'map05',relative),target);}
const uiPath=path.join(temp,'tests/planner-ui.test.mjs');
const uiSource=(await readFile(uiPath,'utf8')).replace("from 'happy-dom';",`from ${JSON.stringify(pathToFileURL(path.join(root,'map05/node_modules/happy-dom/lib/index.js')).href)};`);
const reviewControl=`
test('review control: renders do not steal focus from filters, generator, map basket or availability',async t=>{
  const ui=await mount(t,{geocoding:uug});
  for(const [selector,value] of [['#planning-date','2026-11-19'],['#kind-filter','BSA']]){
    ui.$(selector).focus();ui.change(selector,value);assert.equal(ui.window.document.activeElement.id,selector.slice(1));
  }
  ui.$('#queue-search').focus();ui.$('#queue-search').value='TEST-';
  ui.$('#queue-search').dispatchEvent(new ui.window.Event('input',{bubbles:true}));
  assert.equal(ui.window.document.activeElement.id,'queue-search');
  for(const selector of ['#generate','[data-basket-map="TEST-02"]']){
    const id=ui.$(selector).id;ui.$(selector).focus();ui.click(selector);assert.equal(ui.window.document.activeElement.id,id);
  }
  const checkbox='[data-availability="TEST-05"][data-slot="2"]';ui.$(checkbox).focus();ui.change(checkbox,false);
  assert.equal(ui.window.document.activeElement.dataset.availability,'TEST-05');
  assert.equal(ui.window.document.activeElement.dataset.slot,'2');
});
`;
await writeFile(uiPath,uiSource+reviewControl);
const run=label=>{
  const result=spawnSync(process.execPath,['--test','tests/planner-map.test.mjs','tests/planner-ui.test.mjs'],{cwd:temp,encoding:'utf8',maxBuffer:5_000_000});
  assert.equal(result.error,undefined);
  const output=sanitize(result.stdout+result.stderr);
  return writeFile(path.join(evidence,`t3-${label}.txt`),output).then(()=>({label,exit:result.status,summary:output.split(/\r?\n/).filter(line=>/ℹ (tests|pass|fail) /.test(line)),failures:output.split(/\r?\n/).filter(line=>line.startsWith('✖ ')&&!line.includes('failing tests'))}));
};
const current=await run('current-controls');assert.equal(current.exit,0);
for(const relative of ['planner.mjs','planner-map.mjs','planner.css']){
  const old=execFileSync('git',['show',`8ce430a:map05/${relative}`],{cwd:root,encoding:'utf8'});
  await writeFile(path.join(temp,relative),old);
}
const baseline=await run('baseline-mutations');assert.equal(baseline.exit,1);
for(const name of ['over-limit regional view keeps legible','label and scale halos','keyboard focus stays in order details','changing the day in basket map mode'])assert.ok(baseline.failures.some(line=>line.includes(name)),name);
const report={tempDirectory:'<temp>',sourceWrites:'temp only; repository untouched',current,baseline};
await writeFile(path.join(evidence,'t3-mutation-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
