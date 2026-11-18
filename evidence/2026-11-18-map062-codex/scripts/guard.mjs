import path from 'node:path';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium:raw}=await import(pathToFileURL(path.join(process.env.LOCALAPPDATA,'mms-e2e/node_modules/playwright-core/index.mjs')).href);
const records=[];
const allowed=url=>{const u=new URL(url);return ['file:','data:','blob:','about:'].includes(u.protocol)||(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&['8771','8772','8791'].includes(u.port));};
async function guard(ctx){
  await ctx.route('**/*',route=>allowed(route.request().url())?route.continue():route.abort('blockedbyclient'));
  ctx.on('request',r=>{if(!allowed(r.url()))records.push({blocked:true,url:r.url().replace(/([?&](?:key|token)=)[^&]+/gi,'$1***')});});
  return ctx;
}
export const chromium={
  async launchPersistentContext(...args){return guard(await raw.launchPersistentContext(...args));},
  async launch(...args){const browser=await raw.launch(...args);const create=browser.newContext.bind(browser);browser.newContext=async(...a)=>guard(await create(...a));return browser;}
};
process.on('exit',()=>{if(process.env.EVID){fs.mkdirSync(process.env.EVID,{recursive:true});fs.writeFileSync(path.join(process.env.EVID,'external-blocks.json'),JSON.stringify(records,null,2));}});
