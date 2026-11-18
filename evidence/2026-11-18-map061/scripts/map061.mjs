// MAP-06.1 checks in real Chrome (GPU WebGL): road-tile Web Worker in use, graceful fallbacks, compressed data.
// Usage: node map061.mjs <offlineFileUrl> <servedUrl>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';
import { CHROME, EVID, save } from './lib.mjs';

const OFFLINE = process.argv[2], SERVED = process.argv[3] || 'http://127.0.0.1:8765/';
const results = [];
const record = (id, title, expected, actual, ok) => { results.push({ id, title, expected, actual, status: ok ? 'PASS' : 'FAIL' }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} ${title}\n   actual: ${actual}`); };

async function open(url, { init, route, offline = false, width = 1440, height = 1000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-m61-'));
  const ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, headless: true, viewport: { width, height } });
  if (offline) await ctx.setOffline(true);
  const page = ctx.pages()[0], log = { console: [], pageErrors: [], external: [], workers: [] };
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.console.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => log.pageErrors.push(String(e).slice(0, 200)));
  page.on('worker', (w) => log.workers.push(w.url().slice(0, 80)));
  ctx.on('request', (r) => { const u = r.url(); if (!/^(http:\/\/127\.0\.0\.1:(8765|8766)\/|file:|data:|blob:|about:)/.test(u)) log.external.push(u); });
  if (init) await page.addInitScript(init);
  if (route) await route(page);
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForSelector('#planner:not([hidden])', { timeout: 180000 });
  return { ctx, page, log };
}
const mapReady = (page) => page.waitForFunction(() => { const v = document.querySelector('#operational-map')?.operationalView; return v && v.map.loaded() && !v.map.isMoving(); }, null, { timeout: 120000 });
const roadFeatures = (page) => page.evaluate(() => { const m = document.querySelector('#operational-map').operationalView.map; m.jumpTo({ center: [17.92, 50.67], zoom: 13 }); return new Promise((r) => m.once('idle', () => r({ roads: m.queryRenderedFeatures({ layers: ['roads-fill'] }).length, zoom: m.getZoom() }))); });

// W1: offline artifact, tiles from a Web Worker
{
  const { ctx, page, log } = await open(OFFLINE, { offline: true });
  await mapReady(page);
  const info = await roadFeatures(page);
  const structure = await page.evaluate(() => ({ tileWorkerSource: Boolean(document.getElementById('road-tile-worker-source')), basemapEncoding: document.getElementById('basemap-data').dataset.encoding, routingEncoding: document.getElementById('routing-data').dataset.encoding, svgPaths: document.querySelectorAll('#planner-map path').length, opShellHidden: document.getElementById('op-map-shell').hidden }));
  await page.screenshot({ path: path.join(EVID, 'W1-offline-roads-from-worker.png') });
  record('W1', 'Plik offline: drogi z lokalnego Web Workera, bez mapy SVG na głównym wątku', 'kafle dróg rysowane (>0 odcinków), 2+ workery (MapLibre + kafle), brak ścieżek SVG, dane gzip-base64', `odcinki dróg w widoku ${info.roads}; workery ${JSON.stringify(log.workers)}; ${JSON.stringify(structure)}; zewnętrzne ${log.external.length}; konsola ${JSON.stringify(log.console.slice(0, 3))}; błędy ${JSON.stringify(log.pageErrors.slice(0, 2))}`,
    info.roads > 20 && log.workers.length >= 2 && structure.tileWorkerSource && structure.basemapEncoding === 'gzip-base64' && structure.routingEncoding === 'gzip-base64' && structure.svgPaths === 0 && !structure.opShellHidden && !log.external.length && !log.pageErrors.length && !log.console.length);
  await ctx.close();
}

// W2: served variant, tile worker file cannot be loaded -> SVG hand-over with a clear message
{
  const { ctx, page, log } = await open(SERVED, { route: (p) => p.route('**/road-tile-worker.mjs', (r) => r.abort()) });
  await page.waitForFunction(() => document.getElementById('op-map-shell').hidden && document.querySelectorAll('#planner-map path').length > 50, null, { timeout: 60000 });
  const info = await page.evaluate(() => ({ message: document.getElementById('message').textContent.slice(0, 160), svgPaths: document.querySelectorAll('#planner-map path').length, queue: document.querySelectorAll('#queue-list [data-order]').length }));
  await page.screenshot({ path: path.join(EVID, 'W2-served-worker-blocked-svg.png') });
  // The planner still works on the fallback map: generate and see markers.
  await page.fill('#planning-date', '2026-11-19'); await page.dispatchEvent('#planning-date', 'change'); await page.click('#generate');
  const baskets = await page.evaluate(() => document.querySelectorAll('#baskets [data-order], #basket-list [data-order], [data-basket] [data-order]').length);
  record('W2', 'Blokada pliku workera: automatyczne przejście na mapę SVG, planer działa', 'mapa operacyjna ukryta, SVG z drogami, komunikat, kolejka 109, generator działa', `${JSON.stringify(info)}; zlecenia w koszykach po generowaniu ${baskets}; zewnętrzne ${log.external.length}`,
    info.svgPaths > 50 && info.queue === 109 && /wyłączona/.test(info.message) && baskets > 0 && !log.external.length);
  await ctx.close();
}

// W3: no Worker API at all -> SVG fallback, no crash
{
  const { ctx, page, log } = await open(OFFLINE, { offline: true, init: () => { delete window.Worker; } });
  await page.waitForFunction(() => document.getElementById('op-map-shell').hidden && document.querySelectorAll('#planner-map path').length > 50, null, { timeout: 60000 });
  const info = await page.evaluate(() => ({ svgPaths: document.querySelectorAll('#planner-map path').length, queue: document.querySelectorAll('#queue-list [data-order]').length }));
  record('W3', 'Brak API Worker: mapa SVG działa, planer bez błędów', 'SVG z drogami, kolejka 109, brak błędów strony', `${JSON.stringify(info)}; błędy strony ${JSON.stringify(log.pageErrors.slice(0, 2))}; zewnętrzne ${log.external.length}`, info.svgPaths > 50 && info.queue === 109 && !log.pageErrors.length && !log.external.length);
  await ctx.close();
}

// W4: raw data survives the compression: both variants show the same located addresses and routing status
{
  const a = await open(OFFLINE, { offline: true }), b = await open(SERVED);
  const read = (p) => p.evaluate(() => ({ located: document.getElementById('located-count').textContent, routing: document.getElementById('routing-status').textContent.slice(0, 60), queue: document.querySelectorAll('#queue-list [data-order]').length, summary: document.getElementById('dataset-summary').textContent }));
  const [ra, rb] = [await read(a.page), await read(b.page)];
  record('W4', 'Dane zapakowane (gzip-base64) dają ten sam planer co dane niepakowane z serwera', 'identyczne liczniki: zlokalizowane, kolejka, status dróg', `offline ${JSON.stringify(ra)} | serwer ${JSON.stringify(rb)}`, JSON.stringify(ra) === JSON.stringify(rb) && /102 \/ 109/.test(ra.located));
  await a.ctx.close(); await b.ctx.close();
}

save('map061-chrome-results.json', { results });
console.log(`${results.filter((r) => r.status === 'PASS').length}/${results.length} PASS`);
