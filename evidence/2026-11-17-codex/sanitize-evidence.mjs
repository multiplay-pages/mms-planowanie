// Anonymize machine-specific prefixes in this agent's own textual evidence only.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const own=fileURLToPath(new URL('.',import.meta.url)),root=path.resolve(own,'../..');
const mutation=JSON.parse(await readFile(path.join(own,'t3-mutation-results.json'),'utf8'));
const prefixes=[[root,'<repo>']];
if(mutation.tempDirectory!=='<temp>')prefixes.push([mutation.tempDirectory,'<temp>']);
const replacements=prefixes.flatMap(([prefix,label])=>[
  [pathToFileURL(prefix).href,`file:///${label}`],
  [decodeURI(pathToFileURL(prefix).href),`file:///${label}`],
  [JSON.stringify(prefix).slice(1,-1),label],
  [prefix.replaceAll('\\','/'),label],
  [prefix,label],
]);
const changed=[];
for(const entry of await readdir(own,{withFileTypes:true})){
  if(!entry.isFile()||!/[.](?:md|mjs|json|txt|diff)$/.test(entry.name))continue;
  const target=path.join(own,entry.name),before=await readFile(target,'utf8');let after=before;
  for(const [prefix,label] of replacements)after=after.split(prefix).join(label);
  if(after!==before){await writeFile(target,after);changed.push(entry.name);}
}
console.log(JSON.stringify({anonymizedFiles:changed}));
