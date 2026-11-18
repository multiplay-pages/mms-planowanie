// MAP-06.2: satellite/hybrid with the REAL GUGiK ORTO provider (one short session, generic non-customer location).
// Usage: node map062-satellite-real.mjs <servedUrlWithAllowTileOrigin>   (server: serve.py --allow-tile-origin https://mapy.geoportal.gov.pl)
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { chromium } from 'playwright-core';
import { CHROME, EVID, save } from './lib.mjs';
const URL_ = process.argv[2];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-sat-'));
const ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1000 } });
const page = ctx.pages()[0], tiles = [], errors = [];
page.on('response', (r) => { if (/mapy\.geoportal\.gov\.pl/.test(r.url())) tiles.push({ status: r.status(), type: r.headers()['content-type'] }); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const idle = () => page.waitForFunction(() => { const v = document.querySelector('#operational-map')?.operationalView; return v && v.map.loaded() && !v.map.isMoving(); }, null, { timeout: 90000 });
const out = {};
try {
  await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await page.waitForSelector('#planner:not([hidden])', { timeout: 120000 }); await idle();
  const center = process.env.SAT_CENTER ? JSON.parse(process.env.SAT_CENTER) : [19.0, 50.0];
  await page.evaluate((c) => document.querySelector('#operational-map').operationalView.map.jumpTo({ center: c, zoom: 13 }), center); await idle();
  await page.click('#op-satellite-settings');
  out.preset = await page.inputValue('#satellite-preset');
  await page.check('#satellite-consent'); await page.click('#satellite-save');
  out.saveMessage = (await page.textContent('#op-status')).slice(0, 160);
  await page.check('input[name="op-basemap"][value="satellite"]'); await idle(); await page.waitForTimeout(2500);
  out.satelliteTiles = tiles.length; out.statuses = [...new Set(tiles.map((t) => t.status))]; out.types = [...new Set(tiles.map((t) => t.type))];
  out.message = (await page.textContent('#message').catch(() => '')).slice(0, 160);
  await page.locator('#op-map-shell').screenshot({ path: path.join(EVID, 'SAT-real-satellite.png') });
  await page.check('input[name="op-basemap"][value="hybrid"]'); await idle(); await page.waitForTimeout(2000);
  await page.locator('#op-map-shell').screenshot({ path: path.join(EVID, 'SAT-real-hybrid.png') });
  out.layers = await page.evaluate(() => { const m = document.querySelector('#operational-map').operationalView.map; return { satellite: m.getLayoutProperty('satellite', 'visibility'), roads: m.getLayoutProperty('roads-fill', 'visibility') }; });
  out.attribution = (await page.innerText('.maplibregl-ctrl-attrib-inner')).slice(0, 160);
} catch (e) { out.error = String(e).slice(0, 300); }
out.errors = errors.slice(0, 4);
out.ok = !out.error && out.satelliteTiles > 0 && out.statuses.every((s) => s === 200) && /image\/(jpeg|png)/.test(out.types.join());
console.log(JSON.stringify(out, null, 1)); save('map062-satellite-real.json', out); await ctx.close();
