// MAP-08 (Codex T21 P2-3): a pack that opens but then fails, and a pack truncated inside its data section.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { chromium } from 'playwright-core';
import { CHROME, EVID } from './lib.mjs';
const PACK = 'C:/Users/lcichanowicz/work/mms-map08/map05/basemap/map-pack.pmtiles';
const results = [];
const check = (id, ok, detail) => { results.push({ id, ok: !!ok, detail }); console.log(ok ? 'PASS' : 'FAIL', id, detail ?? ''); };
const full = fs.readFileSync(PACK);
const dataOffset = Number(full.readBigUInt64LE(56)); // PMTiles v3 header: tile data offset
async function run(mode, handler) {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-m08p-')), { executablePath: CHROME, headless: true, viewport: { width: 1440, height: 900 } });
  const page = ctx.pages()[0]; const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.route('**/map-pack.pmtiles', handler);
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await page.waitForSelector('#op-map-shell:not([hidden])', { timeout: 120000 });
  await page.fill('#planning-date', '2026-11-19'); await page.dispatchEvent('#planning-date', 'change'); await page.click('#generate');
  await page.waitForTimeout(6000);
  const idle = () => page.waitForFunction(() => { const v = document.querySelector('#operational-map')?.operationalView; return v && v.map.loaded() && !v.map.isMoving(); }, null, { timeout: 60000 });
  await idle();
  const facts = await page.evaluate(() => { const v = document.querySelector('#operational-map').operationalView; return { rich: v.rich, visits: v.layers?.visits.features.length ?? 0, status: document.querySelector('#op-status').textContent, shell: !document.querySelector('#op-map-shell').hidden }; });
  check(`${mode}: map still works on the roads-only tiles`, facts.shell && facts.rich === false && facts.visits > 3, JSON.stringify({ rich: facts.rich, visits: facts.visits }));
  check(`${mode}: status says the pack is not in use`, /uproszczony/.test(facts.status), facts.status.slice(0, 110));
  check(`${mode}: no uncaught errors`, errors.length === 0, errors.join(' | '));
  if (mode === 'fails-after-open') await page.screenshot({ path: path.join(EVID, 'packfail-after-1440.png') });
  await ctx.close();
}
// 1) Opens fine (header + root directory + 1-byte probes), then every tile/leaf read fails with HTTP 500.
await run('fails-after-open', async (route) => {
  const range = /bytes=(\d+)-(\d+)/.exec(route.request().headers().range ?? '');
  if (range && Number(range[2]) - Number(range[1]) + 1 > 1 && Number(range[1]) >= 16384) return route.fulfill({ status: 500, body: 'boom' });
  return route.fulfill({ status: range ? 206 : 200, headers: range ? { 'content-range': `bytes ${range[1]}-${Math.min(Number(range[2]), full.length - 1)}/${full.length}` } : {}, body: range ? full.subarray(Number(range[1]), Math.min(Number(range[2]) + 1, full.length)) : full });
});
// 2) Truncated inside the data section: must be rejected when opened.
const cut = full.subarray(0, dataOffset + 1000);
await run('truncated', async (route) => {
  const range = /bytes=(\d+)-(\d+)/.exec(route.request().headers().range ?? '');
  if (!range) return route.fulfill({ status: 200, body: cut });
  const s = Number(range[1]), e = Math.min(Number(range[2]), cut.length - 1);
  if (s >= cut.length) return route.fulfill({ status: 416, headers: { 'content-range': `bytes */${cut.length}` }, body: '' });
  return route.fulfill({ status: 206, headers: { 'content-range': `bytes ${s}-${e}/${cut.length}` }, body: cut.subarray(s, e + 1) });
});
const failed = results.filter((r) => !r.ok).length; console.log(`${results.length - failed} PASS / ${failed} FAIL`);
fs.writeFileSync(path.join(EVID, 'packfail-results.json'), JSON.stringify(results, null, 2));
