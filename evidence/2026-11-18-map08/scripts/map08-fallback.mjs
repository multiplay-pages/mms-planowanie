// MAP-08: fallback when the local map pack is missing (HTTP 404) or corrupt: roads-only map, honest status, plan intact.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { chromium } from 'playwright-core';
import { CHROME, EVID } from './lib.mjs';
const results = [];
const check = (id, ok, detail) => { results.push({ id, ok: !!ok, detail }); console.log(ok ? 'PASS' : 'FAIL', id, detail ?? ''); };
for (const mode of ['missing-404', 'corrupt']) {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-m08f-')), { executablePath: CHROME, headless: true, viewport: { width: 1440, height: 900 } });
  const page = ctx.pages()[0]; const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.route('**/map-pack.pmtiles', (route) => mode === 'missing-404' ? route.fulfill({ status: 404, body: 'not found' }) : route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from('this is not a pmtiles archive'.repeat(8)) }));
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await page.waitForSelector('#op-map-shell:not([hidden])', { timeout: 120000 });
  await page.waitForFunction(() => { const v = document.querySelector('#operational-map')?.operationalView; return v && v.map.loaded() && !v.map.isMoving(); }, null, { timeout: 60000 });
  const rich = await page.evaluate(() => document.querySelector('#operational-map').operationalView.rich);
  const status = await page.textContent('#op-status');
  check(`${mode}: roads-only map starts`, rich === false, `rich=${rich}`);
  check(`${mode}: status says the pack is unavailable`, /pakiet mapy niedostępny/.test(status) && /^Podkład: Drogowa/.test(status), status.slice(0, 120));
  await page.fill('#planning-date', '2026-11-19'); await page.dispatchEvent('#planning-date', 'change'); await page.click('#generate'); await page.waitForTimeout(2500);
  const n = await page.evaluate(() => document.querySelector('#operational-map').operationalView.layers.visits.features.length);
  check(`${mode}: routes and visits still work`, n > 3, `${n} visits`);
  const disabled = await page.evaluate(() => ['buildings', 'nature'].map((f) => document.querySelector(`[data-op-flag="${f}"]`)?.disabled));
  await page.click('#op-layers-menu summary').catch(() => {});
  check(`${mode}: building/nature switches disabled (no data)`, disabled.every(Boolean), JSON.stringify(disabled));
  if (mode === 'missing-404') await page.screenshot({ path: path.join(EVID, 'fallback-roads-only-1440.png') });
  check(`${mode}: no uncaught errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
const failed = results.filter((r) => !r.ok).length; console.log(`${results.length - failed} PASS / ${failed} FAIL`);
fs.writeFileSync(path.join(EVID, 'fallback-results.json'), JSON.stringify(results, null, 2));
