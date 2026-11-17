// Read-only artifact/evidence audit. Never prints matching secret values.
import {readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../..',import.meta.url)),own=fileURLToPath(new URL('.',import.meta.url));
const evidence=path.join(root,'evidence/2026-11-17-browser');
const list=async base=>(await Promise.all((await readdir(base,{withFileTypes:true})).map(async entry=>(await stat(path.join(base,entry.name))).isDirectory()?list(path.join(base,entry.name)):[path.join(base,entry.name)]))).flat();
const files=await list(evidence),sensitiveMatches=[];
const secret=/(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const privatePath=/C:[\\/]+Users[\\/]+[^\\/\s]+/i;
for(const f of files.filter(f=>/\.(json|mjs|md|txt)$/i.test(f))){
  for(const [i,line] of (await readFile(f,'utf8')).split(/\r?\n/).entries()){
    if(secret.test(line))sensitiveMatches.push({file:path.relative(root,f),line:i+1,kind:'credential-pattern'});
    if(privatePath.test(line))sensitiveMatches.push({file:path.relative(root,f),line:i+1,kind:'user-profile-path'});
  }
}
const artifact=await readFile(path.join(root,'map05/planner-offline.html'));
const artifactHash=createHash('sha256').update(artifact).digest('hex');
assert.equal(artifactHash,'694d833853c7db48b2844e1192bb5ad59d079efd2cfa15132204607420e648fe');assert.equal(artifact.length,69522757);
const runs=[];
for(const tag of ['served','offline']){
  const dir=path.join(evidence,tag),result=JSON.parse(await readFile(path.join(dir,`results-${tag}.json`),'utf8'));
  const missing=[];for(const test of result.results)for(const f of test.evidence)try{await readFile(path.join(dir,f));}catch{missing.push(f);}
  const plan=JSON.parse(await readFile(path.join(dir,`S7-${tag}-mms-plan-2026-11-19.json`),'utf8'));
  const expectedKeys={root:['schemaVersion','datasetId','availability','assignments','manualExclusions'],availability:['teamId','date','slots'],assignments:['orderId','teamId','date','start','origin','confirmed','releaseReason'],manualExclusions:['orderId','date']};
  assert.ok(Object.keys(plan).every(key=>expectedKeys.root.includes(key)));
  for(const group of ['availability','assignments','manualExclusions'])for(const item of plan[group])assert.ok(Object.keys(item).every(key=>expectedKeys[group].includes(key)));
  assert.ok(plan.assignments.every(a=>/^TEST-\d{3}$/.test(a.orderId)&&/^TEST-\d{2}$/.test(a.teamId)));
  runs.push({tag,chrome:result.chrome,pass:result.results.filter(r=>r.status==='PASS').length,total:result.results.length,missingEvidence:missing,requests:result.log.requests.length,external:result.log.external.length,failed:result.log.failed.length,console:result.log.console.length,pageErrors:result.log.pageErrors.length,plan:{keys:Object.keys(plan),assignments:plan.assignments.length,reasons:plan.assignments.filter(a=>a.releaseReason).map(a=>a.releaseReason)}});
}
const changes=execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);
const sourceDataChanges=changes.filter(f=>/^(map04\/|map05\/(?:data|basemap)\/)/.test(f));assert.deepEqual(sourceDataChanges,[]);
const report={artifact:{bytes:artifact.length,sha256:artifactHash},fileCounts:{total:files.length,png:files.filter(f=>f.endsWith('.png')).length},sensitiveMatches,sourceDataChanges,changes,runs};
await writeFile(path.join(own,'t3-evidence-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
