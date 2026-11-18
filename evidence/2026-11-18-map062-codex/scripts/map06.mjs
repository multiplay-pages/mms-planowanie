// MAP-06 acceptance in real Chrome (GPU WebGL). Usage: node map06.mjs <url> <tag> [satelliteUrl]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from './guard.mjs';
import { CHROME, EVID, save } from './lib.mjs';

const URL_ = process.argv[2] || 'http://127.0.0.1:8771/';
const TAG = process.argv[3] || 'served';
const SAT_URL = process.argv[4] || null; // planner URL served with --allow-tile-origin for the mock provider
const results = [];
const record = (id, title, expected, actual, ok, evidence = []) => { results.push({ id, title, expected, actual, status: ok ? 'PASS' : 'FAIL', evidence }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} ${title}\n   ${actual}`); };
const net = { all: [], external: [], tiles: [], failed: [], blobFailed: [], console: [], pageErrors: [] };
const isLocal = (u) => /^(http:\/\/127\.0\.0\.1:(8771|8772)\/|file:|data:|blob:|about:)/.test(u);

async function open(url, { width = 1440, height = 1000, offline = false, args = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-map06-'));
  const ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, headless: true, viewport: { width, height }, acceptDownloads: true, args });
  if (offline) await ctx.setOffline(true);
  ctx.on('request', (r) => { const u = r.url(); net.all.push(u.slice(0, 160)); if (u.startsWith('http://127.0.0.1:8791/')) net.tiles.push(u); else if (!isLocal(u)) net.external.push(u); });
  ctx.on('requestfailed', (r) => { if (r.url().startsWith('blob:')) net.blobFailed.push(`${r.url().slice(0, 60)} ${r.failure()?.errorText}`); else net.failed.push(`${r.url().slice(0, 120)} ${r.failure()?.errorText}`); });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) net.console.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => net.pageErrors.push(String(e)));
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForSelector('#planner:not([hidden])', { timeout: 180000 });
  return { ctx, page };
}
const opReady = (page) => page.waitForFunction(() => document.querySelector('#operational-map')?.operationalView && !document.querySelector('#op-map-shell').hidden, null, { timeout: 60000 });
const idle = (page) => page.evaluate(() => new Promise((r) => { const m = document.querySelector('#operational-map').operationalView.map; if (m.loaded() && !m.isMoving()) setTimeout(r, 300); else m.once('idle', () => setTimeout(r, 200)); setTimeout(r, 8000); }));
const mapData = (page) => page.evaluate(() => {
  const v = document.querySelector('#operational-map').operationalView, m = v.map;
  const src = (id) => m.getSource(id).serialize().data;
  return { visits: src('visits').features.map((f) => f.properties), routes: src('routes').features.map((f) => ({ ...f.properties, n: f.geometry.coordinates.length })), unassigned: src('unassigned').features.length,
    layers: Object.fromEntries(['roads-fill', 'road-labels', 'routes', 'visits-installation', 'unassigned', 'satellite'].map((id) => [id, m.getLayer(id) ? (m.getLayoutProperty(id, 'visibility') ?? 'visible') : 'absent'])),
    satelliteSource: Boolean(m.getSource('satellite')), zoom: m.getZoom(), date: document.querySelector('#planning-date').value };
});
const plan = (page) => page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('mms-map05-plan')); return k ? JSON.parse(localStorage.getItem(k)) : null; });
const msg = (page) => page.evaluate(() => { const m = document.querySelector('#message'); return m.hidden ? '' : `${m.className}: ${m.textContent}`; });
const setDate = async (page, d) => { await page.fill('#planning-date', d); await page.dispatchEvent('#planning-date', 'change'); };
const COLORS = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#D55E00'];
// Expected visits computed independently from the saved plan (not from the map module).
async function expectedVisits(page, date) {
  const p = await plan(page);
  const located = await page.evaluate(() => { const s = JSON.parse(document.querySelector('#address-data')?.textContent ?? 'null'); return null; });
  const byTeam = {};
  for (const a of p.assignments.filter((x) => x.date === date)) (byTeam[a.teamId] ??= []).push(a);
  const out = [];
  for (const [team, list] of Object.entries(byTeam)) list.sort((x, y) => x.start - y.start || x.orderId.localeCompare(y.orderId)).forEach((a, i) => out.push({ orderId: a.orderId, teamId: team, seq: i + 1, color: COLORS[Number(team.slice(-2)) - 1] }));
  return out;
}
const sameVisits = (map, exp, unlocated) => {
  const m = new Map(map.map((v) => [v.orderId, v]));
  const missing = exp.filter((e) => !m.has(e.orderId) && !unlocated.includes(e.orderId));
  const wrong = exp.filter((e) => m.has(e.orderId) && (m.get(e.orderId).teamId !== e.teamId || m.get(e.orderId).seq !== e.seq || m.get(e.orderId).color !== e.color));
  const extra = map.filter((v) => !exp.some((e) => e.orderId === v.orderId));
  return { ok: !missing.length && !wrong.length && !extra.length, missing: missing.map((e) => e.orderId), wrong: wrong.map((e) => e.orderId), extra: extra.map((v) => v.orderId) };
};
const unlocatedIds = (page) => page.evaluate(() => [...document.querySelectorAll('#op-gaps li.NO_LOCATION')].map((li) => li.textContent.split(':')[0]));

const { ctx, page } = await open(URL_, { offline: Boolean(process.env.OFFLINE) });
const offlineMode = Boolean(process.env.OFFLINE) && await page.evaluate(() => !navigator.onLine);
const loadedMarker = await page.evaluate(() => (window.__mmsNoReload = Math.random()));
try {
  await opReady(page); await idle(page);
  const d0 = await mapData(page);
  await page.screenshot({ path: path.join(EVID, `M0-${TAG}-initial.png`) });
  record('M0', 'Mapa operacyjna startuje lokalnie (WebGL)', 'MapLibre aktywny, podkład z lokalnych kafli, 0 żądań zewnętrznych', `przeglądarka offline=${offlineMode}; wizyty ${d0.visits.length}, nieprzydzielone ${d0.unassigned}, warstwy ${JSON.stringify(d0.layers)}, zoom ${d0.zoom.toFixed(1)}`, d0.layers['roads-fill'] === 'visible' && d0.unassigned > 90 && d0.layers.satellite === 'absent', [`M0-${TAG}-initial.png`]);

  // M1 generate all baskets for a day
  await setDate(page, '2026-11-19'); await page.click('#generate'); await idle(page);
  const d1 = await mapData(page), e1 = await expectedVisits(page, '2026-11-19'), un1 = await unlocatedIds(page), c1 = sameVisits(d1.visits, e1, un1);
  const teams1 = [...new Set(d1.visits.map((v) => v.teamId))].sort();
  const kinds = d1.visits.reduce((a, v) => ((a[v.kind] = (a[v.kind] || 0) + 1), a), {});
  await page.locator('#op-map-shell').screenshot({ path: path.join(EVID, `M1-${TAG}-all-baskets.png`) });
  record('M1', 'Wszystkie koszyki dnia, kolor ekipy, numeracja, spójność z planem', 'każda wizyta dnia z pozycją jest na mapie z poprawną ekipą/kolorem/numerem; brak nadmiarowych', `plan ${e1.length} wizyt, mapa ${d1.visits.length}; ekipy ${teams1.join(',')}; rodzaje ${JSON.stringify(kinds)}; trasy ${d1.routes.length} nóg; bez pozycji ${JSON.stringify(un1)}; zgodność ${JSON.stringify(c1)}`, c1.ok && teams1.length >= 4 && d1.routes.length > 0, [`M1-${TAG}-all-baskets.png`]);

  // M2 popup + edit in planner
  const target = d1.visits.find((v) => v.kind === 'installation');
  const pt = await page.evaluate((id) => { const v = document.querySelector('#operational-map').operationalView, m = v.map; const f = m.getSource('visits').serialize().data.features.find((x) => x.properties.orderId === id); m.jumpTo({ center: f.geometry.coordinates, zoom: 14 }); return true; }, target.orderId);
  await idle(page);
  const box = await page.locator('#operational-map').boundingBox();
  const px = await page.evaluate((id) => { const m = document.querySelector('#operational-map').operationalView.map; const f = m.getSource('visits').serialize().data.features.find((x) => x.properties.orderId === id); const p = m.project(f.geometry.coordinates); return [p.x, p.y]; }, target.orderId);
  await page.mouse.click(box.x + px[0], box.y + px[1]);
  await page.waitForSelector('.maplibregl-popup .op-popup', { timeout: 5000 });
  const popupText = await page.innerText('.maplibregl-popup .op-popup');
  await page.locator('#op-map-shell').screenshot({ path: path.join(EVID, `M2-${TAG}-popup.png`) });
  await page.click('.maplibregl-popup .op-popup button');
  await page.waitForTimeout(400);
  const edit = await page.evaluate(() => ({ title: document.querySelector('#order-title').textContent, focus: document.activeElement.id, popup: Boolean(document.querySelector('.maplibregl-popup')) }));
  record('M2', 'Kliknięcie punktu: szczegóły i przejście do edycji', 'popup ze zleceniem, ekipą, numerem; „Edytuj w planerze” wybiera zlecenie i ustawia fokus w formularzu', `popup: "${popupText.replace(/\n/g, ' | ')}"; po edycji tytuł "${edit.title}", fokus ${edit.focus}, popup otwarty=${edit.popup}`, popupText.includes(target.orderId) && popupText.includes(target.teamId) && edit.title.includes(target.orderId) && edit.focus === 'assignment-team' && !edit.popup, [`M2-${TAG}-popup.png`]);

  // M3 move an installation through the planner form -> map updates without reload
  const before3 = await mapData(page), routesBefore = before3.routes.length;
  let moved = null; const tries = [];
  for (const [team, slot, day] of [['TEST-05', '2', '2026-11-19'], ['TEST-01', '2', '2026-11-19'], ['TEST-02', '0', '2026-11-20']]) {
    await page.selectOption('#assignment-team', team); await page.fill('#assignment-date', day); await page.selectOption('#assignment-slot', slot);
    await page.click('#assign-order'); await page.waitForTimeout(300);
    const a = (await plan(page)).assignments.find((x) => x.orderId === target.orderId); tries.push(`${team}/${day}/${slot}: ${(await msg(page)).slice(0, 90)}`);
    if (a.teamId === team && a.date === day && a.start === Number(slot)) { moved = { team, day, slot }; break; }
  }
  await idle(page);
  const d3 = await mapData(page), e3 = await expectedVisits(page, '2026-11-19'), c3 = sameVisits(d3.visits, e3, await unlocatedIds(page));
  const onMap = d3.visits.find((v) => v.orderId === target.orderId);
  const noReload = (await page.evaluate(() => window.__mmsNoReload)) === loadedMarker;
  await page.locator('#op-map-shell').screenshot({ path: path.join(EVID, `M3-${TAG}-after-move.png`) });
  record('M3', 'Przeniesienie instalacji aktualizuje markery i trasy bez przeładowania', 'po zmianie w planerze punkt ma nową ekipę/kolor/numer lub znika z dnia; trasy przeliczone; strona nieprzeładowana', `${target.orderId} ${target.teamId} → ${JSON.stringify(moved)} (próby: ${tries.join(' ; ')}); na mapie: ${onMap ? onMap.teamId + ' nr ' + onMap.seq + ' ' + onMap.color : 'brak (inny dzień)'}; trasy ${routesBefore}→${d3.routes.length}; zgodność ${JSON.stringify(c3)}; bez przeładowania=${noReload}`, moved && c3.ok && noReload && (moved.day !== '2026-11-19' ? !onMap : onMap?.teamId === moved.team), [`M3-${TAG}-after-move.png`]);

  // M4 undo + return-to-queue update the map
  await page.click('#undo'); await idle(page);
  const d4 = await mapData(page), c4 = sameVisits(d4.visits, await expectedVisits(page, '2026-11-19'), await unlocatedIds(page));
  const back = d4.visits.find((v) => v.orderId === target.orderId);
  const planBeforeRemove = JSON.stringify((await plan(page)).assignments);
  await page.click(`#op-layers [data-order="${target.orderId}"]`); let removeClickError = null; await page.click('#remove-order').catch((e) => { removeClickError = String(e.message).slice(0, 120); }); await idle(page);
  const removeMsg = await msg(page);
  const d4b = await mapData(page), c4b = sameVisits(d4b.visits, await expectedVisits(page, '2026-11-19'), await unlocatedIds(page));
  const removed = !d4b.visits.some((v) => v.orderId === target.orderId);
  const planAfterRemove = JSON.stringify((await plan(page)).assignments);
  const removeEffective = !removeClickError && removed && planAfterRemove !== planBeforeRemove && !(await plan(page)).assignments.some((a) => a.orderId === target.orderId);
  await page.click('#undo'); await idle(page);
  record('M4', 'Cofnięcie i powrót do kolejki aktualizują mapę', 'po cofnięciu punkt wraca do koszyka; po „Wróć do kolejki” znika z koszyka (albo odmowa reguły bez zmian)', `po cofnięciu ${back?.teamId} nr ${back?.seq}, zgodność ${c4.ok}; powrót do kolejki: ${removeMsg.slice(0, 120)} → usunięty z mapy=${removed}, skuteczne usunięcie z planu=${removeEffective}${removeClickError ? ' (błąd kliknięcia: ' + removeClickError + ')' : ''}, zgodność ${c4b.ok}`, back?.teamId === target.teamId && c4.ok && c4b.ok && removeEffective, []);

  // M5 date change: no visits of the previous day
  await setDate(page, '2026-11-18'); await idle(page);
  const d5 = await mapData(page), p5 = await plan(page);
  const eyebrow18 = await page.textContent('#op-layers .eyebrow');
  const leftovers = d5.visits.filter((v) => p5.assignments.find((a) => a.orderId === v.orderId)?.date !== '2026-11-18');
  await setDate(page, '2026-11-19'); await idle(page);
  const d5b = await mapData(page);
  record('M5', 'Zmiana daty bez wizyt z poprzedniego dnia', 'na 18.11 tylko wizyty 18.11; powrót na 19.11 przywraca koszyki', `18.11: ${d5.visits.length} wizyt, pozostałości ${JSON.stringify(leftovers.map((v) => v.orderId))}, panel "${eyebrow18}"; 19.11: ${d5b.visits.length} wizyt`, !leftovers.length && /2026-11-18/.test(eyebrow18) && d5b.visits.length === d1.visits.length, []);

  // M6 layer toggles
  const planBeforeToggles = JSON.stringify((await plan(page)).assignments);
  await page.uncheck('#op-layers [data-op-team="TEST-02"]'); await idle(page);
  const h = await mapData(page);
  const hiddenOk = !h.visits.some((v) => v.teamId === 'TEST-02') && !h.routes.some((r) => r.teamId === 'TEST-02') && h.visits.filter((v) => v.teamId !== 'TEST-02').every((v) => d5b.visits.find((x) => x.orderId === v.orderId)?.seq === v.seq);
  await page.uncheck('#op-layers [data-op-toggle="unassigned"]'); await page.uncheck('#op-layers [data-op-toggle="routes"]'); await page.uncheck('#op-layers [data-op-toggle="roads"]'); await idle(page);
  const t = await mapData(page);
  await page.locator('#op-map-shell').screenshot({ path: path.join(EVID, `M6-${TAG}-layers-off.png`) });
  const planSame = JSON.stringify((await plan(page)).assignments) === planBeforeToggles;
  for (const sel of ['[data-op-team="TEST-02"]', '[data-op-toggle="unassigned"]', '[data-op-toggle="routes"]', '[data-op-toggle="roads"]']) await page.check(`#op-layers ${sel}`);
  await idle(page); const t2 = await mapData(page);
  record('M6', 'Ukrywanie/pokazywanie koszyka, nieprzydzielonych, tras i podkładu', 'ukrycie TEST-02 usuwa tylko jego punkty/trasy bez renumeracji innych; przełączniki działają i wracają', `TEST-02 ukryty ok=${hiddenOk}; po wyłączeniu: nieprzydzielone ${t.unassigned}, trasy ${t.routes.length}, drogi ${t.layers['roads-fill']}; po włączeniu: nieprzydzielone ${t2.unassigned}, trasy ${t2.routes.length}, drogi ${t2.layers['roads-fill']}`, hiddenOk && t.unassigned === 0 && t.routes.length === 0 && t.layers['roads-fill'] === 'none' && t2.unassigned > 0 && t2.routes.length === d5b.routes.length && t2.layers['roads-fill'] === 'visible' && planSame, [`M6-${TAG}-layers-off.png`]);

  // M7 satellite without configuration stays local
  const tilesBefore = net.tiles.length;
  await page.click('input[name="op-basemap"][value="satellite"]'); await page.waitForTimeout(400);
  const satMsg = await msg(page), dialogOpen = await page.evaluate(() => document.querySelector('#satellite-dialog').open);
  await page.keyboard.press('Escape');
  const d7 = await mapData(page);
  record('M7', 'Satelita bez konfiguracji nie wysyła żądań', 'pozostaje podkład drogowy, komunikat i dialog konfiguracji; 0 żądań do dostawców', `komunikat: ${satMsg.slice(0, 160)}; dialog=${dialogOpen}; źródło satelity=${d7.satelliteSource}; radio drogowa=${await page.isChecked('input[name="op-basemap"][value="road"]')}; żądania kafli ${net.tiles.length - tilesBefore}`, /wyłączone/.test(satMsg) && dialogOpen && !d7.satelliteSource && net.tiles.length === tilesBefore, []);

  // M8 reload keeps the plan and the map
  const planBefore = JSON.stringify(await plan(page));
  await page.reload(); await page.waitForSelector('#planner:not([hidden])'); await opReady(page); await setDate(page, '2026-11-19'); await idle(page);
  const d8 = await mapData(page), c8 = sameVisits(d8.visits, await expectedVisits(page, '2026-11-19'), await unlocatedIds(page));
  record('M8', 'Zachowanie planu po odświeżeniu', 'plan identyczny; mapa odtwarza te same wizyty', `plan identyczny=${planBefore === JSON.stringify(await plan(page))}; wizyty ${d8.visits.length}; zgodność ${JSON.stringify(c8)}`, planBefore === JSON.stringify(await plan(page)) && c8.ok && d8.visits.length === d1.visits.length, []);

  // M9 import a plan JSON updates the map without reload
  const exported = JSON.parse(planBefore); exported.assignments = exported.assignments.filter((a) => a.date !== '2026-11-19' || a.teamId !== 'TEST-01');
  const file = path.join(os.tmpdir(), `mms-import-${TAG}.json`); fs.writeFileSync(file, JSON.stringify(exported));
  await page.setInputFiles('#load-plan', file); await idle(page);
  const d9 = await mapData(page);
  record('M9', 'Import planu aktualizuje mapę', 'po imporcie planu bez koszyka TEST-01 mapa nie pokazuje jego wizyt', `komunikat: ${(await msg(page)).slice(0, 80)}; wizyty TEST-01: ${d9.visits.filter((v) => v.teamId === 'TEST-01').length}; razem ${d9.visits.length}`, !d9.visits.some((v) => v.teamId === 'TEST-01') && d9.visits.length > 0, []);
  await page.click('#undo'); await idle(page);

  // M10 keyboard alternative + mobile layout
  await page.focus(`#op-layers button[data-order]`); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  const kb = await page.evaluate(() => ({ focus: document.activeElement.dataset?.order, title: document.querySelector('#order-title').textContent }));
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('#operational-map').operationalView.resize());
  const mob = await page.evaluate(() => { const m = document.querySelector('#operational-map').getBoundingClientRect(), l = document.querySelector('#op-layers').getBoundingClientRect(); return { mapW: Math.round(m.width), mapH: Math.round(m.height), panelBelow: l.top >= m.bottom - 1, scrollW: document.documentElement.scrollWidth, innerW: innerWidth }; });
  await page.locator('#op-map-shell').scrollIntoViewIfNeeded(); await idle(page);
  await page.screenshot({ path: path.join(EVID, `M10-${TAG}-mobile.png`) });
  await page.setViewportSize({ width: 1440, height: 1000 });
  record('M10', 'Klawiatura (lista wizyt) i widok mobilny', 'Enter na pozycji listy wybiera zlecenie i zachowuje fokus; na 390 px mapa pełnej szerokości, panel pod mapą, brak poziomego przewijania', `klawiatura: fokus ${kb.focus}, szczegóły "${kb.title}"; mobile: mapa ${mob.mapW}×${mob.mapH}, panel pod mapą=${mob.panelBelow}, scrollWidth ${mob.scrollW}/${mob.innerW}`, kb.focus && kb.title.includes(kb.focus) && mob.mapW >= 300 && mob.mapH >= 340 && mob.panelBelow && mob.scrollW <= mob.innerW, [`M10-${TAG}-mobile.png`]);
} catch (e) { record('MX', 'Błąd przebiegu', '-', String(e).slice(0, 400), false); }
await ctx.close();

// M11 satellite and hybrid through an explicitly allowed loopback mock provider
if (SAT_URL) {
  const { ctx: c2, page: p2 } = await open(SAT_URL);
  try {
    await opReady(p2); await idle(p2);
    await p2.click('#op-satellite-settings'); await p2.selectOption('#satellite-preset', 'custom');
    await p2.fill('#satellite-url', 'http://127.0.0.1:8791/{z}/{x}/{y}.png?key=SECRET123'); await p2.fill('#satellite-attribution', 'Atrapa <b>testowa</b>');
    await p2.click('#satellite-save'); const noConsent = await msg(p2);
    await p2.check('#satellite-consent'); await p2.click('#satellite-save');
    const saved = await msg(p2);
    const t0 = net.tiles.length;
    await p2.check('input[name="op-basemap"][value="satellite"]'); await idle(p2); await p2.waitForTimeout(800);
    const s1 = await mapData(p2), sTiles = net.tiles.length - t0;
    await p2.locator('#op-map-shell').screenshot({ path: path.join(EVID, `M11-${TAG}-satellite.png`) });
    await p2.check('input[name="op-basemap"][value="hybrid"]'); await idle(p2);
    const s2 = await mapData(p2);
    await p2.locator('#op-map-shell').screenshot({ path: path.join(EVID, `M11-${TAG}-hybrid.png`) });
    const attribution = await p2.innerHTML('.maplibregl-ctrl-attrib-inner');
    await p2.check('input[name="op-basemap"][value="road"]'); await idle(p2);
    const s3 = await mapData(p2), t1 = net.tiles.length;
    await p2.evaluate(() => document.querySelector('#operational-map').operationalView.map.zoomTo(12)); await idle(p2);
    const afterRoad = net.tiles.length - t1;
    const status = await p2.textContent('#op-status');
    record('M11', 'Satelita i hybryda wyłącznie po konfiguracji, zgodzie i dopuszczeniu originu', 'bez zgody zapis odrzucony; satelita: raster widoczny, drogi ukryte; hybryda: raster + drogi + etykiety; atrybucja jako tekst; powrót do drogowej usuwa źródło i zatrzymuje żądania; klucz nie pokazany', `bez zgody: ${noConsent.slice(0, 90)}; zapis: ${saved.slice(0, 60)}; satelita: warstwy ${JSON.stringify(s1.layers)}, kafle ${sTiles}; hybryda: ${JSON.stringify(s2.layers)}; atrybucja HTML zawiera <b>=${/<b>testowa/.test(attribution)}; drogowa: źródło=${s3.satelliteSource}, nowe kafle po zoomie ${afterRoad}; status "${status}" klucz widoczny=${status.includes('SECRET123')}`,
      /Nie zapisano/.test(noConsent) && s1.layers.satellite === 'visible' && s1.layers['roads-fill'] === 'none' && sTiles > 0 && s2.layers.satellite === 'visible' && s2.layers['roads-fill'] === 'visible' && s2.layers['road-labels'] === 'visible' && !/<b>testowa/.test(attribution) && !s3.satelliteSource && afterRoad === 0 && !status.includes('SECRET123'), [`M11-${TAG}-satellite.png`, `M11-${TAG}-hybrid.png`]);
  } catch (e) { record('M11', 'Satelita', '-', String(e).slice(0, 400), false); }
  await c2.close();
}

// M12 WebGL disabled -> SVG fallback keeps the planner usable
{
  const { ctx: c3, page: p3 } = await open(URL_, { args: ['--disable-webgl', '--disable-3d-apis'] });
  await p3.waitForTimeout(1500);
  const fb = await p3.evaluate(() => ({ shell: document.querySelector('#op-map-shell').hidden, svgMarkers: document.querySelectorAll('#planner-map .map-marker').length, svgVisible: getComputedStyle(document.querySelector('.map-wrap')).display !== 'none' }));
  await p3.click('#generate'); const gen = await msg(p3);
  record('M12', 'Brak WebGL → mapa uproszczona (SVG)', 'mapa operacyjna ukryta, SVG z 102 punktami, generowanie działa', `op ukryta=${fb.shell}; SVG widoczne=${fb.svgVisible}, markery ${fb.svgMarkers}; generowanie: ${gen.slice(0, 60)}`, fb.shell && fb.svgVisible && fb.svgMarkers === 102 && /success/.test(gen), []);
  await c3.close();
}

record('M13', 'Konsola i sieć', '0 błędów konsoli/strony, 0 żądań poza loopback/file (atrapa dostawcy tylko w M11)', `konsola ${JSON.stringify(net.console.slice(0, 5))}; pageerror ${JSON.stringify(net.pageErrors.slice(0, 3))}; nieudane ${JSON.stringify(net.failed.slice(0, 5))}; nieudane blob ${JSON.stringify(net.blobFailed.slice(0, 5))}; zewnętrzne ${JSON.stringify(net.external.slice(0, 5))}; kafle atrapy ${net.tiles.length}; wszystkich ${net.all.length}`, !net.console.length && !net.pageErrors.length && !net.external.length && !net.failed.length && !net.blobFailed.length);
save(`map06-results-${TAG}.json`, { url: URL_.replace(/file:\/\/\/.*?\/map05\//, 'file:///<repo>/map05/'), results, network: { total: net.all.length, external: net.external, tiles: net.tiles.length, failed: net.failed, blobFailed: net.blobFailed, console: net.console, pageErrors: net.pageErrors } });
