// MAP-06.1: touch input on the operational map in real Chrome (CDP touch events, GPU WebGL).
// Synthetic touch from DevTools, not a physical screen: results say "the app reacts to touch events", nothing about real-device feel.
// Usage: node map061-touch.mjs <plannerUrl> <tag>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';
import { CHROME, EVID, save } from './lib.mjs';

const URL_ = process.argv[2], TAG = process.argv[3] || 'offline';
const results = [];
const record = (id, title, status, actual) => { results.push({ id, title, status, actual }); console.log(`[${status}] ${id} ${title}\n   ${actual}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-touch-'));
const ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, headless: true, viewport: { width: 1024, height: 900 }, hasTouch: true, isMobile: false });
if (URL_.startsWith('file:')) await ctx.setOffline(true);
const page = ctx.pages()[0];
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
const cdp = await ctx.newCDPSession(page);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) });
const mapState = () => page.evaluate(() => { const m = document.querySelector('#operational-map').operationalView.map; return { z: m.getZoom(), lng: m.getCenter().lng, lat: m.getCenter().lat }; });
const idle = () => page.waitForFunction(() => { const v = document.querySelector('#operational-map')?.operationalView; return v && v.map.loaded() && !v.map.isMoving(); }, null, { timeout: 60000 });

try {
  await page.goto(URL_, { waitUntil: 'load', timeout: 180000 });
  await page.waitForSelector('#planner:not([hidden])', { timeout: 180000 });
  await idle();
  await page.fill('#planning-date', '2026-11-19'); await page.dispatchEvent('#planning-date', 'change'); await page.click('#generate');
  await page.waitForFunction(() => (document.querySelector('#operational-map').operationalView.layers?.visits?.features?.length ?? 0) > 3, null, { timeout: 60000 });

  // T1: tap on a visit marker opens the popup.
  const target = await page.evaluate(async () => { const v = document.querySelector('#operational-map').operationalView, m = v.map; const f = v.layers.visits.features[0]; document.querySelector('#operational-map').scrollIntoView({ block: 'center' }); m.jumpTo({ center: f.geometry.coordinates, zoom: 15 }); await new Promise((r) => m.once('idle', r)); const p = m.project(f.geometry.coordinates), r = m.getCanvas().getBoundingClientRect(); return { x: Math.round(r.left + p.x), y: Math.round(r.top + p.y), id: f.properties.orderId }; });
  await page.touchscreen.tap(target.x, target.y);
  const popup = await page.waitForSelector('.maplibregl-popup .op-popup', { timeout: 6000 }).then(() => true, () => false);
  await page.screenshot({ path: path.join(EVID, `T-touch-${TAG}-popup.png`) });
  record('K1', 'Chrome (dotyk CDP): tap w wizytę otwiera popup', popup ? 'PASS' : 'FAIL', JSON.stringify({ target, popup }));
  await page.evaluate(() => document.querySelector('.maplibregl-popup-close-button')?.click());

  // T2: one-finger drag pans the map.
  const box = await page.evaluate(() => { const r = document.querySelector('#operational-map').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
  await sleep(1200); // a second tap at the same spot within ~300 ms would legitimately count as a double-tap zoom
  const s0 = await mapState();
  await touch('touchStart', [{ x: box.x, y: box.y }]);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', [{ x: box.x + i * 10, y: box.y + i * 5 }]); await sleep(16); }
  await touch('touchEnd', []);
  await sleep(1200); await idle();
  const s1 = await mapState();
  record('K2', 'Chrome (dotyk CDP): przeciągnięcie jednym palcem przesuwa mapę', Math.abs(s1.lng - s0.lng) + Math.abs(s1.lat - s0.lat) > 1e-5 && Math.abs(s1.z - s0.z) < 0.05 ? 'PASS' : 'FAIL', JSON.stringify({ before: s0, after: s1 }));

  // T3: two-finger pinch out zooms in.
  const z0 = (await mapState()).z;
  await touch('touchStart', [{ x: box.x - 20, y: box.y }, { x: box.x + 20, y: box.y }]);
  for (let i = 1; i <= 14; i++) { await touch('touchMove', [{ x: box.x - 20 - i * 8, y: box.y }, { x: box.x + 20 + i * 8, y: box.y }]); await sleep(16); }
  await touch('touchEnd', []);
  await sleep(1200); await idle();
  const z1 = (await mapState()).z;
  await page.screenshot({ path: path.join(EVID, `T-touch-${TAG}-pinch.png`) });
  record('K3', 'Chrome (dotyk CDP): szczypnięcie dwoma palcami zmienia skalę', z1 > z0 + 0.3 ? 'PASS' : 'FAIL', JSON.stringify({ z0, z1 }));

  // T4: touch scrolling of the page outside the map still works (map does not trap the whole page).
  await page.evaluate(() => scrollTo(0, 0));
  const y0 = await page.evaluate(() => scrollY);
  const out = await page.evaluate(() => { const r = document.querySelector('#queue-list')?.getBoundingClientRect(); return r ? { x: Math.round(r.left + 40), y: Math.round(Math.min(r.top + 80, innerHeight - 40)) } : null; });
  if (out) {
    await touch('touchStart', [out]);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', [{ x: out.x, y: out.y - i * 20 }]); await sleep(16); }
    await touch('touchEnd', []);
    await sleep(600);
    const y1 = await page.evaluate(() => scrollY), listTop = await page.evaluate(() => document.querySelector('#queue-list').scrollTop);
    const hit = await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + '#' + e.id + '.' + String(e.className).slice(0, 40) : null; }, out);
    record('K4', 'Chrome (dotyk CDP): przewijanie dotykiem poza mapą (strona lub lista kolejki) działa', y1 > y0 || listTop > 0 ? 'PASS' : 'FAIL', JSON.stringify({ y0, y1, listTop, out, hit }));
  } else record('K4', 'Chrome (dotyk CDP): przewijanie dotykiem poza mapą (strona lub lista kolejki) działa', 'BLOCKED', 'brak elementu #queue-list');
  record('K5', 'Chrome (dotyk CDP): brak błędów strony i konsoli w całym przebiegu', errors.length ? 'FAIL' : 'PASS', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
  record('K-ERR', 'Przebieg dotykowy przerwany', 'BLOCKED', String(e.message).slice(0, 300));
}
save(`map061-touch-${TAG}.json`, { results });
await ctx.close();
console.log(`${results.filter((r) => r.status === 'PASS').length}/${results.length} PASS`);
