// MAP-08 offline artifact measurement: load time, memory, frame times, no external requests.
// Usage: node map08-offline.mjs <file-url> <label>   (EVID env = output directory)
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { chromium } from 'playwright-core';
import { CHROME, EVID } from './lib.mjs';
const URL_ = process.argv[2], LABEL = process.argv[3] || 'offline';
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-m08off-'));
const ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, headless: true, viewport: { width: W, height: H }, offline: true });
const page = ctx.pages()[0];
const external = [], errors = [];
const isLocal = (u) => /^(file:|data:|blob:|about:)/.test(u);
ctx.on('request', (r) => { if (!isLocal(r.url())) external.push(r.url().slice(0, 120)); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const idle = () => page.waitForFunction(() => { const v = document.querySelector('#operational-map')?.operationalView; return !v || (v.map.loaded() && !v.map.isMoving()); }, null, { timeout: 120000 });
const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
const metric = async (name) => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === name)?.value;
const out = { label: LABEL, url: URL_, viewport: [W, H], bytes: fs.statSync(new URL(URL_)).size };
const t0 = Date.now();
await page.goto(URL_, { waitUntil: 'load', timeout: 300000 });
out.loadEventMs = Date.now() - t0;
await page.waitForSelector('#planner:not([hidden])', { timeout: 300000 });
out.plannerVisibleMs = Date.now() - t0;
await page.waitForSelector('#op-map-shell:not([hidden])', { timeout: 120000 }); await idle();
out.mapReadyMs = Date.now() - t0;
out.rich = await page.evaluate(() => document.querySelector('#operational-map').operationalView.rich);
out.status = await page.textContent('#op-status');
out.heapAfterLoadMB = +((await metric('JSHeapUsedSize')) / 1048576).toFixed(1);
await page.fill('#planning-date', '2026-11-19'); await page.dispatchEvent('#planning-date', 'change'); await idle();
await page.click('#generate'); await page.waitForTimeout(2500); await idle();
await page.click('#op-workspace'); await page.waitForTimeout(900); await idle();
await page.screenshot({ path: path.join(EVID, `${LABEL}-workspace-${W}.png`) });
// Smoothness: 24 pan/zoom steps, frame times from rAF.
out.frames = await page.evaluate(async () => {
  const v = document.querySelector('#operational-map').operationalView, map = v.map, times = []; let last = performance.now(), run = true;
  const tick = (now) => { times.push(now - last); last = now; if (run) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  const c = map.getCenter();
  for (let i = 0; i < 24; i++) { map.easeTo({ center: [c.lng + (i % 2 ? 0.05 : -0.05), c.lat + 0.02 * ((i % 3) - 1)], zoom: 9 + (i % 5), duration: 450 }); await new Promise((r) => setTimeout(r, 480)); }
  run = false; times.sort((a, b) => a - b);
  return { n: times.length, p50: +times[Math.floor(times.length * 0.5)].toFixed(1), p95: +times[Math.floor(times.length * 0.95)].toFixed(1), max: +times.at(-1).toFixed(1) };
});
await idle();
out.heapAfterInteractionMB = +((await metric('JSHeapUsedSize')) / 1048576).toFixed(1);
const mem = await page.evaluate(() => performance.memory ? { total: +(performance.memory.totalJSHeapSize / 1048576).toFixed(1) } : null);
out.totalJsHeapMB = mem?.total;
await page.evaluate(() => document.querySelector('#operational-map').operationalView.map.jumpTo({ center: [18.0, 50.6], zoom: 15 })); await idle();
await page.screenshot({ path: path.join(EVID, `${LABEL}-zoom15-${W}.png`) });
out.externalRequests = external; out.errors = errors;
console.log(JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(EVID, `${LABEL}-measure-${W}.json`), JSON.stringify(out, null, 2));
await ctx.close();
