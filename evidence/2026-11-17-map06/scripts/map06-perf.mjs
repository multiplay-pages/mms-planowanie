// MAP-06 performance: zoom/pan tour on the operational map, frame timings and JS heap.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';
import { CHROME, EVID, save } from './lib.mjs';
const URL_ = process.argv[2], TAG = process.argv[3] || 'offline';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-perf-'));
const ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1000 }, args: ['--enable-precise-memory-info'] });
const page = ctx.pages()[0];
const t0 = Date.now();
await page.goto(URL_, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => document.querySelector('#operational-map')?.operationalView, null, { timeout: 120000 });
await page.evaluate(() => new Promise((r) => document.querySelector('#operational-map').operationalView.map.once('idle', r)));
const firstIdleMs = Date.now() - t0;
const heap = () => page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
const out = { firstIdleMs, heapAfterLoadMB: await heap(), steps: [] };
const stops = [[18.1, 50.6, 7], [18.1, 50.6, 9], [17.92, 50.67, 12], [17.92, 50.67, 15], [18.66, 50.22, 14], [18.66, 50.22, 17], [17.6, 50.4, 11], [18.9, 50.0, 13], [18.3, 51.0, 10], [18.1, 50.6, 8]];
for (const [lon, lat, zoom] of stops) {
  const r = await page.evaluate(({ lon, lat, zoom }) => new Promise((resolve) => {
    const m = document.querySelector('#operational-map').operationalView.map; let frames = 0, worst = 0, last = performance.now();
    const tick = () => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; frames++; if (m.isMoving()) requestAnimationFrame(tick); };
    const start = performance.now(); m.once('idle', () => resolve({ idleMs: Math.round(performance.now() - start), frames, worstFrameMs: Math.round(worst) }));
    m.flyTo({ center: [lon, lat], zoom, duration: 1200 }); requestAnimationFrame(tick);
  }), { lon, lat, zoom });
  out.steps.push({ lon, lat, zoom, ...r, heapMB: await heap() });
}
await page.screenshot({ path: path.join(EVID, `perf-${TAG}-street.png`) });
out.peakHeapMB = Math.max(out.heapAfterLoadMB, ...out.steps.map((s) => s.heapMB));
save(`map06-perf-${TAG}.json`, out);
console.log(JSON.stringify(out, null, 1));
await ctx.close();
