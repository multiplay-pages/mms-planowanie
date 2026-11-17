import path from 'node:path';
import { launch, ready, EVID } from './lib.mjs';
const TAG = process.argv[3] || 'served';
const { ctx, page } = await launch({ width: 390, height: 844 });
await ready(page, process.argv[2] || 'http://127.0.0.1:8765/');
await page.fill('#planning-date', '2026-11-19');
await page.click('#generate');
for (const [sel, name] of [['#queue', 'queue'], ['#baskets', 'baskets'], ['#planner-map', 'map'], ['.resources', 'availability'], ['.save-panel', 'save']]) {
  await page.locator(sel).first().scrollIntoViewIfNeeded();
  await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'start' }), sel);
  await page.screenshot({ path: path.join(EVID, `narrow-${TAG}-${name}.png`) });
}
await ctx.close();
