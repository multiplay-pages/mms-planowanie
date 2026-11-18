// MAP-06.1 performance: identical scenarios for the BEFORE and AFTER artifacts.
// Usage: node map061-perf.mjs <url> <tag> [run]
// Measures main-thread long tasks, frame times, JS heap and the whole browser process tree.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { CHROME, EVID, save } from './lib.mjs';

const URL_ = process.argv[2], TAG = process.argv[3] || 'after', RUN = process.argv[4] || '1';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-perf61-'));
const ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1000 }, args: ['--enable-precise-memory-info'] });
const page = ctx.pages()[0];
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  window.__lt = [];
  try { new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {}
});

// Sum of private bytes and working set of the whole browser process tree of this profile.
function processTree() {
  const script = `
    $dir = '${dir}'
    $all = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'"
    $root = $all | Where-Object { $_.CommandLine -like "*$dir*" -and $_.CommandLine -notlike '*--type=*' } | Select-Object -First 1
    if (-not $root) { '{"processes":0,"privateMB":0,"workingSetMB":0}'; exit }
    $ids = @($root.ProcessId); $queue = @($root.ProcessId)
    while ($queue.Count) { $next = @(); foreach ($q in $queue) { $kids = $all | Where-Object { $_.ParentProcessId -eq $q }; foreach ($k in $kids) { $ids += $k.ProcessId; $next += $k.ProcessId } }; $queue = $next }
    $procs = $all | Where-Object { $ids -contains $_.ProcessId }
    $priv = ($procs | Measure-Object -Property PrivatePageCount -Sum).Sum
    $ws = ($procs | Measure-Object -Property WorkingSetSize -Sum).Sum
    '{"processes":' + $procs.Count + ',"privateMB":' + [math]::Round($priv/1MB) + ',"workingSetMB":' + [math]::Round($ws/1MB) + '}'`;
  try { return JSON.parse(execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim()); } catch (e) { return { error: String(e.message).slice(0, 120) }; }
}
const heap = () => page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
const longTasks = (from = 0, to = Infinity) => page.evaluate(([a, b]) => { const l = window.__lt.filter(([s]) => s >= a && s < b); return { count: l.length, totalMs: Math.round(l.reduce((x, [, d]) => x + d, 0)), maxMs: Math.round(Math.max(0, ...l.map(([, d]) => d))) }; }, [from, to]);
const now = () => page.evaluate(() => performance.now());
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };

const out = { tag: TAG, run: RUN, url: URL_.replace(/file:\/\/\/.*\/(map05|before)\//, 'file:///<path>/') };

// S1: cold start
const t0 = Date.now();
await page.goto(URL_, { waitUntil: 'load', timeout: 180000 });
await page.waitForSelector('#planner:not([hidden])', { timeout: 180000 });
out.plannerVisibleMs = Date.now() - t0;
await page.waitForFunction(() => document.querySelector('#operational-map')?.operationalView, null, { timeout: 120000 });
await page.evaluate(() => new Promise((r) => { const m = document.querySelector('#operational-map').operationalView.map; if (m.loaded()) r(); else m.once('idle', r); }));
out.firstIdleMs = Date.now() - t0;
await page.waitForTimeout(500);
out.startup = { longTasks: await longTasks(), heapMB: await heap(), process: processTree() };

// S2: zoom/pan tour over real regional data (same stops as MAP-06)
const stops = [[18.1, 50.6, 7], [18.1, 50.6, 9], [17.92, 50.67, 12], [17.92, 50.67, 15], [18.66, 50.22, 14], [18.66, 50.22, 17], [17.6, 50.4, 11], [18.9, 50.0, 13], [18.3, 51.0, 10], [18.1, 50.6, 8]];
out.tour = [];
for (const [lon, lat, zoom] of stops) {
  const from = await now();
  const r = await page.evaluate(({ lon, lat, zoom }) => new Promise((resolve) => {
    const m = document.querySelector('#operational-map').operationalView.map; let frames = 0, worst = 0, jank = 0, last = performance.now();
    const tick = () => { const t = performance.now(), d = t - last; worst = Math.max(worst, d); if (d > 50) jank++; last = t; frames++; if (m.isMoving()) requestAnimationFrame(tick); };
    const start = performance.now(); m.once('idle', () => resolve({ idleMs: Math.round(performance.now() - start), frames, worstFrameMs: Math.round(worst), framesOver50ms: jank }));
    m.flyTo({ center: [lon, lat], zoom, duration: 1200 }); requestAnimationFrame(tick);
  }), { lon, lat, zoom });
  out.tour.push({ lon, lat, zoom, ...r, longTasks: await longTasks(from) });
}
out.tourSummary = { worstFrameMs: Math.max(...out.tour.map((s) => s.worstFrameMs)), medianWorstFrameMs: median(out.tour.map((s) => s.worstFrameMs)), framesOver50ms: out.tour.reduce((a, s) => a + s.framesOver50ms, 0), longTaskTotalMs: out.tour.reduce((a, s) => a + s.longTasks.totalMs, 0), longTaskMaxMs: Math.max(...out.tour.map((s) => s.longTasks.maxMs)), medianIdleMs: median(out.tour.map((s) => s.idleMs)) };
out.afterTour = { heapMB: await heap(), process: processTree() };

// S3: many view changes (deterministic pseudo-random jumps, wait for idle each time)
const jumps = [], jumpFrom = await now();
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let i = 0; i < 60; i++) {
  const lon = 17.2 + rnd() * 1.7, lat = 49.95 + rnd() * 1.5, zoom = 8 + Math.floor(rnd() * 9);
  jumps.push(await page.evaluate(({ lon, lat, zoom }) => new Promise((resolve) => {
    const m = document.querySelector('#operational-map').operationalView.map, start = performance.now();
    const done = () => resolve(Math.round(performance.now() - start)); m.once('idle', done); m.jumpTo({ center: [lon, lat], zoom }); setTimeout(done, 15000);
  }), { lon, lat, zoom }));
}
out.manyViews = { count: jumps.length, medianIdleMs: median(jumps), p95IdleMs: pct(jumps, 0.95), maxIdleMs: Math.max(...jumps), longTasks: await longTasks(jumpFrom), heapMB: await heap(), process: processTree() };

// S4: planner interactions with the map attached (generate, team filters, layers, remove/undo, date change)
await page.evaluate(() => document.querySelector('#operational-map').operationalView.map.jumpTo({ center: [18.1, 50.6], zoom: 9 }));
await page.waitForTimeout(800);
const act = async (label, doAction, predicate) => {
  const from = await now();
  const r = await page.evaluate(async ({ doAction, predicate }) => {
    const view = () => document.querySelector('#operational-map').operationalView, count = () => view().layers?.visits?.features?.length ?? -1, routes = () => view().layers?.routes?.features?.length ?? -1;
    const before = { visits: count(), routes: routes() };
    let frames = 0, worst = 0, last = performance.now(), running = true;
    const tick = () => { const t = performance.now(); worst = Math.max(worst, t - last); last = t; frames++; if (running) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    const start = performance.now(); new Function('return (' + doAction + ')')()();
    const check = new Function('before', 'count', 'routes', 'return (' + predicate + ')(before,count,routes)');
    while (!check(before, count, routes)) { if (performance.now() - start > 20000) { running = false; return { timedOut: true }; } await new Promise((r) => requestAnimationFrame(r)); }
    const latency = performance.now() - start; running = false;
    return { latencyMs: Math.round(latency), worstFrameMs: Math.round(worst), visits: count(), routes: routes(), before };
  }, { doAction, predicate });
  const lt = await longTasks(from);
  return { label, ...r, longTasks: lt };
};
const s4 = [];
await page.fill('#planning-date', '2026-11-19'); await page.dispatchEvent('#planning-date', 'change');
s4.push(await act('generate all baskets', "() => document.querySelector('#generate').click()", '(b,c) => c() > 3'));
await page.waitForTimeout(800);
const teams = await page.$$eval('#op-layers [data-op-team]', (n) => n.map((x) => x.dataset.opTeam));
for (const team of teams.slice(0, 3)) {
  s4.push(await act(`hide team ${team}`, `() => { const c = document.querySelector('#op-layers [data-op-team="${team}"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }`, '(b,c) => c() < b.visits'));
  s4.push(await act(`show team ${team}`, `() => { const c = document.querySelector('#op-layers [data-op-team="${team}"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }`, '(b,c) => c() > b.visits'));
}
s4.push(await act('hide routes layer', "() => { const c = document.querySelector('#op-layers [data-op-toggle=\"routes\"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }", '(b,c,r) => r() === 0'));
s4.push(await act('show routes layer', "() => { const c = document.querySelector('#op-layers [data-op-toggle=\"routes\"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }", '(b,c,r) => r() > 0'));
// remove a visit (back to queue) and undo it
s4.push(await act('return a visit to the queue', "() => { document.querySelector('#op-layers button[data-order]').click(); document.querySelector('#remove-order').click(); }", '(b,c) => c() < b.visits'));
s4.push(await act('undo (visit returns)', "() => document.querySelector('#undo').click()", '(b,c) => c() > b.visits'));
s4.push(await act('change day to 2026-11-18', "() => { const d = document.querySelector('#planning-date'); d.value = '2026-11-18'; d.dispatchEvent(new Event('change', { bubbles: true })); }", '(b,c) => c() === 0'));
s4.push(await act('change day back to 2026-11-19', "() => { const d = document.querySelector('#planning-date'); d.value = '2026-11-19'; d.dispatchEvent(new Event('change', { bubbles: true })); }", '(b,c) => c() > 3'));
out.interactions = s4;
out.interactionSummary = { medianLatencyMs: median(s4.filter((s) => !s.timedOut).map((s) => s.latencyMs)), maxLatencyMs: Math.max(...s4.filter((s) => !s.timedOut).map((s) => s.latencyMs)), worstFrameMs: Math.max(...s4.filter((s) => !s.timedOut).map((s) => s.worstFrameMs)), longTaskMaxMs: Math.max(...s4.map((s) => s.longTasks.maxMs)), timedOut: s4.filter((s) => s.timedOut).map((s) => s.label) };
out.final = { heapMB: await heap(), process: processTree(), longTasksTotal: await longTasks(), pageErrors: errors };
out.peakHeapMB = Math.max(out.startup.heapMB, out.afterTour.heapMB, out.manyViews.heapMB, out.final.heapMB);
save(`map061-perf-${TAG}-${RUN}.json`, out);
console.log(JSON.stringify({ tag: TAG, run: RUN, plannerVisibleMs: out.plannerVisibleMs, firstIdleMs: out.firstIdleMs, startup: out.startup, tour: out.tourSummary, manyViews: out.manyViews, interactions: out.interactionSummary, final: out.final, peakHeapMB: out.peakHeapMB }, null, 1));
await ctx.close();
