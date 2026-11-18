import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),base=path.resolve('evidence/2026-11-18-map062-codex'),out=path.join(base,'firefox');fs.mkdirSync(out,{recursive:true});
const server=spawn('python',['-X','utf8','map05/serve.py','--port','8771'],{windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:'ignore'});
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:8771/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const child=spawn(process.execPath,[path.join(base,'scripts/firefox-bidi.mjs'),pathToFileURL(path.join(root,'map05/planner-offline.html')).href,'http://127.0.0.1:8771/'],{windowsHide:true,env:{...process.env,EVID:out}});let text='';child.stdout.on('data',d=>{text+=d;process.stdout.write(d);});child.stderr.on('data',d=>{text+=d;process.stdout.write(d);});
 const exit=await new Promise(r=>child.on('exit',r));fs.writeFileSync(path.join(base,'logs/firefox.txt'),text.replaceAll(root,'<repo>'));console.log('Firefox process exit='+exit);
}finally{server.kill();console.log('Owned Firefox server stopped.');}
