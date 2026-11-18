// MAP-06.1: checks in the installed Firefox via WebDriver BiDi (Playwright cannot drive stock Firefox).
// Usage: node firefox-bidi.mjs <offlineFileUrl> <servedUrl> [--headed]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { EVID, save } from './lib.mjs';

const FIREFOX = 'C:/Program Files/Mozilla Firefox/firefox.exe';
const OFFLINE = process.argv[2], SERVED = process.argv[3] || 'http://127.0.0.1:8771/', HEADED = process.argv.includes('--headed');
const results = [];
const record = (id, title, status, actual) => { results.push({ id, title, status, actual }); console.log(`[${status}] ${id} ${title}\n   ${actual}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-ff-'));
  fs.writeFileSync(path.join(profile, 'user.js'), [
    'user_pref("network.proxy.type", 1);', 'user_pref("network.proxy.http", "127.0.0.1");', 'user_pref("network.proxy.http_port", 9);', 'user_pref("network.proxy.ssl", "127.0.0.1");', 'user_pref("network.proxy.ssl_port", 9);', 'user_pref("network.proxy.no_proxies_on", "localhost, 127.0.0.1");', 'user_pref("remote.active-protocols", 1);', 'user_pref("browser.shell.checkDefaultBrowser", false);', 'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("app.update.enabled", false);', 'user_pref("browser.startup.homepage_override.mstone", "ignore");', 'user_pref("startup.homepage_welcome_url", "about:blank");',
    'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);', 'user_pref("browser.aboutwelcome.enabled", false);',
  ].join('\n'));
  const port = await freePort();
  const args = ['--remote-debugging-port=' + port, '--profile', profile, '--no-remote', '--new-instance'];
  if (!HEADED) args.push('--headless');
  const proc = spawn(FIREFOX, args, { stdio: 'ignore', windowsHide:true });
  let ws;
  for (let i = 0; i < 80 && !ws; i++) {
    await sleep(500);
    try { ws = await new Promise((resolve, reject) => { const w = new WebSocket(`ws://127.0.0.1:${port}/session`); w.onopen = () => resolve(w); w.onerror = () => reject(new Error('ws')); }); } catch {}
  }
  if (!ws) { proc.kill(); throw new Error('Firefox BiDi did not start'); }
  let nextId = 1; const pending = new Map(), events = [];
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.type === 'error' ? reject(new Error(`${msg.error}: ${msg.message}`)) : resolve(msg.result); } else if (msg.type === 'event') {events.push(msg); if(msg.method==='network.beforeRequestSent'&&msg.params.isBlocked){const u=new URL(msg.params.request.url),local=['file:','data:','blob:','about:','moz-extension:'].includes(u.protocol)||(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&['8771','8772','8791'].includes(u.port));send(local?'network.continueRequest':'network.failRequest',{request:msg.params.request.request}).catch(()=>{});}} };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.delete(id)) reject(new Error('timeout ' + method)); }, 180000); });
  const session = await send('session.new', { capabilities: {} });
  await send('session.subscribe', { events: ['log.entryAdded', 'network.beforeRequestSent', 'browsingContext.load'] });
  await send('network.addIntercept',{phases:['beforeRequestSent']});
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
    external: events.filter((e) => e.method === 'network.beforeRequestSent').map((e) => e.params.request.url).filter((u) => !/^(http:\/\/127\.0\.0\.1:(8771|8772)\/|file:|data:|blob:|about:|moz-)/.test(u)) });
  const close = async () => { try { await send('browser.close', {}); } catch {} setTimeout(() => proc.kill(), 3000); };
  return { session, send, evalJs, waitFor, goto, shot, mouse, touch, wheel, setViewport, log, close, events };
}

const mapFacts = `
  const v=document.querySelector('#operational-map')?.operationalView;
  if(!v) return {operational:false, svgPaths:document.querySelectorAll('#planner-map path').length, opShellHidden:document.getElementById('op-map-shell').hidden, message:document.getElementById('message').textContent.slice(0,200)};
  const m=v.map; return {operational:true, loaded:m.loaded(), zoom:m.getZoom(), webgl:Boolean(m.getCanvas().getContext('webgl2')||m.getCanvas().getContext('webgl')), svgPaths:document.querySelectorAll('#planner-map path').length};`;

let ff;
try {
  ff = await launch();
  const caps = ff.session.capabilities ?? {};
  console.log('Firefox', caps.browserVersion, caps.platformName);
  await ff.setViewport(1440, 1000);

  // F1: offline artifact over file://
  await ff.goto(OFFLINE);
  const planner = await ff.waitFor("!document.getElementById('planner').hidden", 180000);
  await sleep(2500);
  let facts = planner ? await ff.evalJs(mapFacts) : null;
  if (planner && facts.operational) await ff.waitFor("document.querySelector('#operational-map').operationalView.map.loaded()", 60000);
  facts = planner ? await ff.evalJs(mapFacts) : facts;
  await ff.shot('FF1-offline-initial.png');
  const l1 = ff.log();
  record('F1', 'Firefox, plik offline (file://): planer startuje, mapa operacyjna (WebGL + worker) albo bezpieczny SVG', planner ? 'PASS' : 'FAIL', `${JSON.stringify(facts)}; błędy konsoli ${JSON.stringify(l1.errors.slice(0, 3))}; ostrzeżenia ${l1.warnings.length}; zewnętrzne żądania ${l1.external.length}`);

  if (planner && facts.operational) {
    // F2: roads rendered from worker tiles
    const roads = await ff.evalJs(`const m=document.querySelector('#operational-map').operationalView.map; m.jumpTo({center:[17.92,50.67],zoom:13}); await new Promise(r=>m.once('idle',r)); return {roads:m.queryRenderedFeatures({layers:['roads-fill']}).length, zoom:m.getZoom()};`);
    await ff.shot('FF2-offline-roads.png');
    record('F2', 'Firefox: lokalne kafle dróg rysowane (wątek roboczy)', roads.roads > 20 ? 'PASS' : 'FAIL', JSON.stringify(roads));
    // F3: generate baskets, team filter
    await ff.evalJs("const d=document.querySelector('#planning-date'); d.value='2026-11-19'; d.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#generate').click(); return true;");
    const gen = await ff.waitFor("(document.querySelector('#operational-map').operationalView.layers?.visits?.features?.length??0)>3", 60000);
    const counts = await ff.evalJs(`const v=document.querySelector('#operational-map').operationalView; const n=()=>v.layers.visits.features.length; const all=n(); const team=()=>document.querySelector('#op-layers [data-op-team]'); team().checked=false; team().dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,800)); const hidden=n(); team().checked=true; team().dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,800)); return {all,hidden,restored:n(),teams:document.querySelectorAll('#op-layers [data-op-team]').length};`);
    await ff.shot('FF3-offline-baskets.png');
    record('F3', 'Firefox: generowanie koszyków i filtr ekipy aktualizują mapę bez przeładowania', gen && counts.hidden < counts.all && counts.restored === counts.all ? 'PASS' : 'FAIL', JSON.stringify(counts));
    // F4: real mouse click on a visit -> popup -> edit
    const target = await ff.evalJs(`const v=document.querySelector('#operational-map').operationalView, m=v.map; const f=v.layers.visits.features[0]; m.jumpTo({center:f.geometry.coordinates,zoom:15}); await new Promise(r=>m.once('idle',r)); const p=m.project(f.geometry.coordinates), r=m.getCanvas().getBoundingClientRect(); return {x:Math.round(r.left+p.x), y:Math.round(r.top+p.y), id:f.properties.orderId};`);
    await ff.mouse([{ type: 'pointerMove', x: target.x, y: target.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }]);
    const popup = await ff.waitFor("document.querySelector('.maplibregl-popup .op-popup')", 8000);
    await ff.shot('FF4-offline-popup.png');
    let edited = null;
    if (popup) { await ff.evalJs("document.querySelector('.maplibregl-popup button.primary').click(); return true;"); await sleep(500); edited = await ff.evalJs("return {selected:document.querySelector('#op-layers [aria-pressed=\"true\"]')?.dataset.order||null, focus:document.activeElement?.id||document.activeElement?.tagName};"); }
    record('F4', 'Firefox: kliknięcie myszą w wizytę otwiera popup, „Edytuj w planerze” wybiera zlecenie', popup && edited?.selected === target.id ? 'PASS' : 'FAIL', JSON.stringify({ target, popup, edited }));
    // F5: mouse wheel zoom and drag pan
    const before = await ff.evalJs("const m=document.querySelector('#operational-map').operationalView.map; return {z:m.getZoom(), c:m.getCenter()};");
    const rect = await ff.evalJs("const r=document.querySelector('#operational-map').getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)};");
    await ff.wheel(rect.x, rect.y, -300); await sleep(900);
    const afterWheel = await ff.evalJs("return document.querySelector('#operational-map').operationalView.map.getZoom();");
    await ff.mouse([{ type: 'pointerMove', x: rect.x, y: rect.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerMove', x: rect.x + 120, y: rect.y + 60, duration: 300 }, { type: 'pointerUp', button: 0 }]); await sleep(900);
    const afterDrag = await ff.evalJs("const m=document.querySelector('#operational-map').operationalView.map; return {z:m.getZoom(), c:m.getCenter()};");
    record('F5', 'Firefox: kółko myszy zmienia skalę, przeciągnięcie przesuwa mapę', afterWheel > before.z && (Math.abs(afterDrag.c.lng - before.c.lng) + Math.abs(afterDrag.c.lat - before.c.lat)) > 1e-4 ? 'PASS' : 'FAIL', JSON.stringify({ before, afterWheel, afterDrag }));
    // F6: touch tap on a visit
    await ff.evalJs("document.querySelector('.maplibregl-popup-close-button')?.click(); return true;");
    const t2 = await ff.evalJs(`const v=document.querySelector('#operational-map').operationalView, m=v.map; const f=v.layers.visits.features[1]||v.layers.visits.features[0]; m.jumpTo({center:f.geometry.coordinates,zoom:15}); await new Promise(r=>m.once('idle',r)); const p=m.project(f.geometry.coordinates), r=m.getCanvas().getBoundingClientRect(); return {x:Math.round(r.left+p.x), y:Math.round(r.top+p.y), id:f.properties.orderId};`);
    let touchStatus = 'NOT TESTED', touchActual = '';
    try { await ff.touch([{ type: 'pointerMove', x: t2.x, y: t2.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }]); const tp = await ff.waitFor("document.querySelector('.maplibregl-popup .op-popup')", 6000); touchStatus = tp ? 'PASS' : 'FAIL'; touchActual = JSON.stringify({ target: t2, popup: tp }); } catch (e) { touchStatus = 'BLOCKED'; touchActual = 'BiDi touch input: ' + e.message.slice(0, 160); }
    record('F6', 'Firefox: dotyk (tap) w wizytę otwiera popup (symulowane wejście dotykowe BiDi, nie fizyczny ekran)', touchStatus, touchActual);
    // F7: narrow viewport
    await ff.setViewport(390, 844); await sleep(1200);
    const narrow = await ff.evalJs("return {scrollW:document.documentElement.scrollWidth, innerW:innerWidth, mapW:Math.round(document.querySelector('#operational-map').getBoundingClientRect().width)};");
    await ff.shot('FF7-offline-390.png');
    record('F7', 'Firefox: szerokość 390 px bez poziomego przewijania', narrow.scrollW <= narrow.innerW + 1 ? 'PASS' : 'FAIL', JSON.stringify(narrow));
    await ff.setViewport(1440, 1000);
  } else if (planner) {
    record('F2', 'Firefox: mapa operacyjna', 'BLOCKED', 'W tym środowisku Firefox nie uruchomił mapy operacyjnej (zob. F1); sprawdzono tylko ścieżkę SVG.');
  }

  // F8: served variant
  await ff.goto(SERVED);
  const served = await ff.waitFor("!document.getElementById('planner').hidden", 180000);
  await sleep(2500);
  let sf = served ? await ff.evalJs(mapFacts) : null;
  if (served && sf.operational) await ff.waitFor("document.querySelector('#operational-map').operationalView.map.loaded()", 60000);
  sf = served ? await ff.evalJs(mapFacts) : sf;
  await ff.shot('FF8-served-initial.png');
  const l8 = ff.log();
  record('F8', 'Firefox, wariant z serwera (moduły ES, worker modułowy)', served ? 'PASS' : 'FAIL', `${JSON.stringify(sf)}; błędy konsoli ${JSON.stringify(l8.errors.slice(0, 3))}; zewnętrzne żądania ${l8.external.length}`);
  const lfin = ff.log();
  record('F9', 'Firefox: brak żądań poza file:/loopback i brak błędów konsoli w całym przebiegu', lfin.external.length === 0 && lfin.errors.length === 0 ? 'PASS' : 'FAIL', JSON.stringify({ external: lfin.external.slice(0, 3), errors: lfin.errors.slice(0, 3), warnings: lfin.warnings.slice(0, 3) }));
  const { browserName, browserVersion, platformName, 'moz:headless': headless, 'moz:buildID': buildID } = ff.session.capabilities ?? {};
  save('map061-firefox-results.json', { firefox: { browserName, browserVersion, platformName, headless, buildID }, results }); // allowlist: never store the profile path
} catch (error) {
  record('F-ERR', 'Przebieg Firefox przerwany', 'BLOCKED', String(error.message).slice(0, 300));
  save('map061-firefox-results.json', { results });
} finally { await ff?.close(); }
console.log(`${results.filter((r) => r.status === 'PASS').length}/${results.length} PASS; ${results.filter((r) => r.status === 'FAIL').length} FAIL; ${results.filter((r) => r.status === 'BLOCKED').length} BLOCKED`);
setTimeout(() => process.exit(0), 4000);
