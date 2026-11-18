import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=process.cwd(),base=path.resolve('evidence/2026-11-18-map062-codex'),scripts=path.dirname(fileURLToPath(import.meta.url));
const children=[],runs=[];
const clean=s=>s.replaceAll(root,'<repo>').replaceAll(root.replaceAll('\\','/'),'<repo>');
function server(args,name){const c=spawn('python',['-X','utf8',...args],{cwd:root,windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});children.push(c);let output='';c.stdout.on('data',d=>output+=d);c.stderr.on('data',d=>output+=d);c.on('exit',code=>fs.writeFileSync(path.join(base,'logs',name+'.txt'),clean(output)+'\nexit='+code));return c;}
async function ready(port){for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:'+port+'/');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Server not ready: '+port);}
async function run(script,args,tag,extra={}){
  const evid=path.join(base,tag);fs.mkdirSync(evid,{recursive:true});console.log('START '+tag);
  const start=Date.now();const c=spawn(process.execPath,[path.join(scripts,script),...args],{cwd:root,windowsHide:true,env:{...process.env,EVID:evid,...extra}});children.push(c);let output='';c.stdout.on('data',d=>output+=d);c.stderr.on('data',d=>output+=d);
  const exit=await new Promise(r=>c.on('exit',r));fs.writeFileSync(path.join(base,'logs',tag+'.txt'),clean(output));runs.push({tag,exit,elapsedMs:Date.now()-start});console.log('END '+tag+' exit='+exit+' '+output.slice(-250));
}
try{
  server(['map05/serve.py','--port','8771'],'server-plain');
  server(['map05/serve.py','--port','8772','--allow-tile-origin','http://127.0.0.1:8791'],'server-tiles');
  server(['evidence/2026-11-18-map061/scripts/mock_tiles.py','8791',path.join(base,'logs','mock-requests.txt')],'mock');
  await Promise.all([ready(8771),ready(8772),ready(8791)]);
  const file=pathToFileURL(path.join(root,'map05/planner-offline.html')).href;
  await run('address.mjs',[], 'address');
  await run('map06.mjs',['http://127.0.0.1:8771/','served','http://127.0.0.1:8772/'],'m06-served');
  await run('map06.mjs',[file,'offline'],'m06-offline',{OFFLINE:'1'});
  const svg={CHROME_ARGS:'--disable-gpu --disable-3d-apis --disable-webgl'};
  await run('scenarios.mjs',['http://127.0.0.1:8771/','served-svg'],'svg-served',svg);
  await run('scenarios.mjs',[file,'offline-svg'],'svg-offline',svg);
  await run('map061.mjs',[file,'http://127.0.0.1:8771/'],'m061');
  await run('map061-touch.mjs',['http://127.0.0.1:8771/','served'],'touch-served');
  await run('map061-touch.mjs',[file,'offline'],'touch-offline');
}catch(e){console.log('RUNNER ERROR '+clean(e.stack));runs.push({error:clean(e.stack)});}
finally{for(const c of children)if(c.exitCode===null)c.kill();fs.writeFileSync(path.join(base,'runs.json'),JSON.stringify(runs,null,2));console.log('Owned server processes stopped.');}
