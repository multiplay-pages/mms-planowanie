// MAP-08: AFTER screenshots (same points/zooms as BEFORE) for both style variants.
import path from 'node:path';
import { launch, ready, save, EVID } from './lib.mjs';
const URL_ = process.argv[2] || 'http://127.0.0.1:8765/planner.html';
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const POINT = process.env.POINT || 'Opole';
const { ctx, page, log } = await launch({ width: W, height: H });
await ready(page, URL_);
await page.waitForSelector('#op-map-shell:not([hidden])', { timeout: 30000 });
await page.fill('#planning-date', '2026-11-19'); await page.dispatchEvent('#planning-date', 'change');
await page.click('#generate'); await page.waitForTimeout(2500);
const idle = () => page.waitForFunction(() => { const v = document.querySelector('#operational-map')?.operationalView; return v && v.map.loaded() && !v.map.isMoving(); }, null, { timeout: 60000 });
await idle();
const info = await page.evaluate((pt) => { const v = document.querySelector('#operational-map').operationalView; const l = v.layers; const f = l.visits.features.find(f => f.properties.city === pt) || l.visits.features[0]; return { rich: v.rich, pack: v.packInfo, status: document.querySelector('#op-status').textContent, point: f.geometry.coordinates, city: f.properties.city }; }, POINT);
console.log(JSON.stringify(info));
await page.click('#op-workspace'); await page.waitForTimeout(800); await idle();
const view = (c, z) => page.evaluate(([c, z]) => { document.querySelector('#operational-map').operationalView.map.jumpTo({ center: c, zoom: z }); }, [c, z]);
for (const variant of (process.env.VARIANTS || 'light,nav').split(',')) {
  await page.selectOption('#op-variant', variant); await page.waitForTimeout(500);
  await page.click('#op-fit-baskets'); await idle(); await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(EVID, `after-${variant}-${W}-overview.png`) });
  for (const z of [9, 11, 13, 15, 17]) { await view(info.point, z); await idle(); await page.waitForTimeout(900); await page.screenshot({ path: path.join(EVID, `after-${variant}-${W}-z${z}.png`) }); }
}
console.log('errors', log.pageErrors, log.console.filter(c => c.type === 'error').slice(0, 5), 'external', log.external);
await ctx.close();
