// MAP-06.1: checks in the installed Firefox via WebDriver BiDi (Playwright cannot drive stock Firefox).
// Usage: node firefox-bidi.mjs <offlineFileUrl> <servedUrl> [--headed]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { EVID, save } from './lib.mjs';

const FIREFOX = 'C:/Program Files/Mozilla Firefox/firefox.exe';
const OFFLINE = process.argv[2], SERVED = process.argv[3] || "http://127.0.0.1:8765/", HEADED = false;
const results = [];
const record = (id, title, status, actual) => { results.push({ id, title, status, actual }); console.log(`[${status}] ${id} ${title}\n   ${actual}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-ff-'));
  fs.writeFileSync(path.join(profile, 'user.js'), [
    'user_pref("remote.active-protocols", 1);', 'user_pref("browser.shell.checkDefaultBrowser", false);', 'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("app.update.enabled", false);', 'user_pref("browser.startup.homepage_override.mstone", "ignore");', 'user_pref("startup.homepage_welcome_url", "about:blank");',
    'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);', 'user_pref("browser.aboutwelcome.enabled", false);',
  ].join('\n'));
  const port = await freePort();
  const args = ['--remote-debugging-port=' + port, '--profile', profile, '--no-remote', '--new-instance'];
  if (!HEADED) args.push('--headless');
  const proc = spawn(FIREFOX, args, { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 80 && !ws; i++) {
    await sleep(500);
    try { ws = await new Promise((resolve, reject) => { const w = new WebSocket(`ws://127.0.0.1:${port}/session`); w.onopen = () => resolve(w); w.onerror = () => reject(new Error('ws')); }); } catch {}
  }
  if (!ws) { proc.kill(); throw new Error('Firefox BiDi did not start'); }
  let nextId = 1; const pending = new Map(), events = [];
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.type === 'error' ? reject(new Error(`${msg.error}: ${msg.message}`)) : resolve(msg.result); } else if (msg.type === 'event') events.push(msg); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.delete(id)) reject(new Error('timeout ' + method)); }, 180000); });
  const session = await send('session.new', { capabilities: {} });
  await send('session.subscribe', { events: ['log.entryAdded', 'network.beforeRequestSent', 'browsingContext.load'] });
  const tree = await send('browsingContext.getTree', {});
  console.log('contexts', JSON.stringify(tree.contexts.map((c) => [c.url, c.userContext, c.parent])));
  const created = await send('browsingContext.create', { type: 'tab' });
  const context = created.context;
  const evalJs = async (expression) => {
    const r = await send('script.evaluate', { expression: `(async()=>{ return JSON.stringify(await (async()=>{ ${expression} })()); })()`, target: { context }, awaitPromise: true });
    if (r.type !== 'success') throw new Error('script error: ' + JSON.stringify(r.exceptionDetails?.text ?? r).slice(0, 300));
    return r.result.value === undefined ? undefined : JSON.parse(r.result.value);
  };
  const waitFor = async (expression, timeout = 120000) => { const t = Date.now(); while (Date.now() - t < timeout) { try { if (await evalJs(`return Boolean(${expression});`)) return true; } catch {} await sleep(300); } return false; };
  const goto = (url) => send('browsingContext.navigate', { context, url, wait: 'complete' });
  const shot = async (name) => { const r = await send('browsingContext.captureScreenshot', { context }); fs.writeFileSync(path.join(EVID, name), Buffer.from(r.data, 'base64')); };
  const mouse = (actions) => send('input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions }] });
  const touch = (actions) => send('input.performActions', { context, actions: [{ type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' }, actions }] });
  const wheel = (x, y, deltaY) => send('input.performActions', { context, actions: [{ type: 'wheel', id: 'wheel', actions: [{ type: 'scroll', x, y, deltaX: 0, deltaY }] }] });
  const setViewport = (width, height) => send('browsingContext.setViewport', { context, viewport: { width, height } });
  const log = () => ({ errors: events.filter((e) => e.method === 'log.entryAdded' && ['error'].includes(e.params.level)).map((e) => String(e.params.text).slice(0, 200)), warnings: events.filter((e) => e.method === 'log.entryAdded' && e.params.level === 'warn').map((e) => String(e.params.text).slice(0, 160)),
    external: events.filter((e) => e.method === 'network.beforeRequestSent').map((e) => e.params.request.url).filter((u) => !/^(http:\/\/127\.0\.0\.1:(8765|8766)\/|file:|data:|blob:|about:|moz-)/.test(u)) });
  const close = async () => { try { await send('browser.close', {}); } catch {} setTimeout(() => proc.kill(), 3000); };
  return { session, send, evalJs, waitFor, goto, shot, mouse, touch, wheel, setViewport, log, close, events };
}

const mapFacts = `
  const v=document.querySelector('#operational-map')?.operationalView;
  if(!v) return {operational:false, svgPaths:document.querySelectorAll('#planner-map path').length, opShellHidden:document.getElementById('op-map-shell').hidden, message:document.getElementById('message').textContent.slice(0,200)};
  const m=v.map; return {operational:true, loaded:m.loaded(), zoom:m.getZoom(), webgl:Boolean(m.getCanvas().getContext('webgl2')||m.getCanvas().getContext('webgl')), svgPaths:document.querySelectorAll('#planner-map path').length};`;


const planWait = "(document.querySelector('#operational-map')?.operationalView?.layers?.visits?.features?.length??0)>3";
async function scenario(ff, label, url, expectRich) {
  await ff.goto(url);
  const ok = await ff.waitFor("!document.getElementById('planner').hidden", 240000);
  await ff.waitFor("document.querySelector('#operational-map')?.operationalView?.map?.loaded()", 120000);
  const facts = ok ? await ff.evalJs(mapFacts + "") : null;
  const rich = await ff.evalJs("return document.querySelector('#operational-map').operationalView.rich;");
  record(`${label}-1`, `Firefox ${label}: mapa operacyjna startuje, pakiet mapy ${expectRich ? 'wczytany' : 'opcjonalny'}`, ok && facts.operational && (!expectRich || rich) ? 'PASS' : 'FAIL', JSON.stringify({ facts, rich }));
  await ff.evalJs("const d=document.querySelector('#planning-date'); d.value='2026-11-19'; d.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#generate').click(); return true;");
  await ff.waitFor(planWait, 60000);
  for (const [w, h] of [[1920, 1080], [1366, 768]]) {
    await ff.setViewport(w, h); await sleep(600);
    await ff.evalJs("if(!document.querySelector('#map-card').classList.contains('op-workspace')) document.querySelector('#op-workspace').click(); return true;");
    await sleep(1800);
    const ws = await ff.evalJs("const r=document.querySelector('#operational-map').getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height),fixed:getComputedStyle(document.querySelector('#map-card')).position,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};");
    await ff.shot(`FF-${label}-workspace-${w}.png`);
    const share = ws.w * ws.h / (w * h);
    record(`${label}-ws${w}`, `Firefox ${label}: duża mapa ${w}×${h}`, share >= 0.5 && ws.fixed === 'fixed' && ws.overflow <= 1 ? 'PASS' : 'FAIL', JSON.stringify({ ...ws, share: +share.toFixed(2) }));
    await ff.evalJs("document.querySelector('#op-workspace-close').click(); return true;");
  }
  await ff.setViewport(1440, 900); await ff.evalJs("document.querySelector('#op-workspace').click(); return true;"); await sleep(1500);
  // pack layers render at street scale near a located visit
  const near = await ff.evalJs(`const v=document.querySelector('#operational-map').operationalView,m=v.map,f=v.layers.visits.features[0]; m.jumpTo({center:f.geometry.coordinates,zoom:16.5}); await new Promise(r=>m.once('idle',r)); await new Promise(r=>setTimeout(r,800)); const q=l=>m.getLayer(l)?m.queryRenderedFeatures({layers:[l]}).length:-1; return {buildings:q('building'),roads:q('roads-fill'),streetLabels:q('road-labels'),places:q('place-labels')};`);
  await ff.shot(`FF-${label}-street-zoom.png`);
  record(`${label}-2`, `Firefox ${label}: warstwy podkładu przy skali ulicy`, near.roads > 0 && (!expectRich || near.buildings > 0) ? 'PASS' : 'FAIL', JSON.stringify(near));
  const solo = await ff.evalJs(`const b=document.querySelector('[data-op-solo]'); const id=b.dataset.opSolo; b.click(); await new Promise(r=>setTimeout(r,1200)); const v=document.querySelector('#operational-map').operationalView; const n=v.layers.visits.features.length, only=v.layers.visits.features.every(f=>f.properties.teamId===id); const sum=document.querySelector('.op-team[data-team="'+id+'"] .op-sum').textContent.trim(); document.querySelector('[data-op-all]').click(); await new Promise(r=>setTimeout(r,600)); return {id,n,only,sum,after:v.layers.visits.features.length};`);
  record(`${label}-3`, `Firefox ${label}: jedna trasa i powrót do wszystkich`, solo.only && solo.after > solo.n && /\d+,\d km/.test(solo.sum) ? 'PASS' : 'FAIL', JSON.stringify(solo));
  const variant = await ff.evalJs(`const s=document.querySelector('#op-variant'); const m=document.querySelector('#operational-map').operationalView.map; const get=()=>JSON.stringify(m.getPaintProperty('roads-fill','line-color')); const a=get(); s.value='nav'; s.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,1500)); const b=get(); await ff.shot; return {a:a.slice(0,40),b:b.slice(0,40),different:a!==b};`.replace('await ff.shot;', ''));
  await ff.shot(`FF-${label}-nav.png`);
  record(`${label}-4`, `Firefox ${label}: przełączenie wariantu stylu`, variant.different ? 'PASS' : 'FAIL', JSON.stringify(variant));
  const status = await ff.evalJs("return document.querySelector('#op-status').textContent;");
  record(`${label}-5`, `Firefox ${label}: komunikat o podkładzie zgodny z trybem`, /^Podkład: Drogowa/.test(status) && (expectRich ? /pakiet mapy OSM/.test(status) : /pakiet mapy|uproszczony/.test(status)) ? 'PASS' : 'FAIL', status.slice(0, 110));
}

let ff;
try {
  ff = await launch();
  console.log('Firefox', ff.session.capabilities?.browserVersion);
  await ff.setViewport(1440, 900);
  await scenario(ff, 'served', SERVED, true);
  await scenario(ff, 'rich-offline', OFFLINE, true);
  const l = ff.log();
  record('FIN', 'Firefox: brak żądań zewnętrznych i błędów konsoli w całym przebiegu', l.external.length === 0 && l.errors.length === 0 ? 'PASS' : 'FAIL', JSON.stringify({ external: l.external.slice(0, 3), errors: l.errors.slice(0, 3) }));
  save('map08-firefox-results.json', { firefox: { version: ff.session.capabilities?.browserVersion }, results });
} catch (error) {
  record('F-ERR', 'Przebieg Firefox przerwany', 'BLOCKED', String(error.message).slice(0, 300));
  save('map08-firefox-results.json', { results });
} finally { await ff?.close(); }
console.log(`${results.filter((r) => r.status === 'PASS').length}/${results.length} PASS; ${results.filter((r) => r.status === 'FAIL').length} FAIL; ${results.filter((r) => r.status === 'BLOCKED').length} BLOCKED`);
setTimeout(() => process.exit(0), 4000);
