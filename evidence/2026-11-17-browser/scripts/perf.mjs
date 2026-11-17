import path from 'node:path';
import { launch, ready, save, EVID } from './lib.mjs';
const URL_ = process.argv[2] || 'http://127.0.0.1:8765/';
const TAG = process.argv[3] || 'served';
const { ctx, page } = await launch();
const loadMs = await ready(page, URL_);
const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const stats = () => page.evaluate(() => ({ vb: document.querySelector('#planner-map').getAttribute('viewBox'), roads: document.querySelectorAll('#planner-map [data-feature]').length, cats: [...document.querySelectorAll('#planner-map [data-feature]')].reduce((m, p) => (m[p.getAttribute('class')] = (m[p.getAttribute('class')] || 0) + 1, m), {}) }));
const out = { loadMs, zoom: [], drag: null };
await page.click('[data-map="all"]');
out.overview = await stats();
// halo check: computed stroke on labels at deep zoom
await page.focus('#planner-map');
for (let i = 0; i < 16; i++) {
  const t0 = await page.evaluate(() => performance.now());
  await page.keyboard.press('+');
  await frame();
  const dt = await page.evaluate((t) => performance.now() - t, t0);
  out.zoom.push({ step: i + 1, ms: Math.round(dt), ...(await stats()) });
}
await page.locator('#planner-map').screenshot({ path: path.join(EVID, `perf-${TAG}-zoom16.png`) });
out.labelHalo = await page.evaluate(() => [...document.querySelectorAll('#planner-map text')].slice(0, 4).map((t) => { const s = getComputedStyle(t); const b = t.getBoundingClientRect(); return { cls: t.getAttribute('class'), ve: s.vectorEffect, sw: s.strokeWidth, box: [Math.round(b.width), Math.round(b.height)] }; }));
// back to a mid zoom (≈ zoom 8) and measure drag
await page.keyboard.press('Home');
for (let i = 0; i < 9; i++) await page.keyboard.press('+');
await frame();
const box = await page.locator('#planner-map').boundingBox();
const x = box.x + box.width * 0.1, y = box.y + box.height * 0.1;
await page.mouse.move(x, y);
await page.mouse.down();
const t0 = Date.now();
const steps = 30;
for (let i = 1; i <= steps; i++) await page.mouse.move(x + i * 8, y + i * 3);
await frame();
const dragMs = Date.now() - t0;
await page.mouse.up();
out.drag = { steps, totalMs: dragMs, msPerMove: Math.round(dragMs / steps), ...(await stats()) };
// long tasks while dragging
save(`perf-${TAG}.json`, out);
console.log(JSON.stringify({ loadMs, overview: out.overview.roads, overviewCats: out.overview.cats, zoom: out.zoom.map((z) => `${z.step}:${z.ms}ms/${z.roads}`).join(' '), labelHalo: out.labelHalo, drag: out.drag }, null, 1));
await ctx.close();
