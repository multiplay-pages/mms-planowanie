// MAP-08 stage A: BEFORE screenshots of the current map on fixed points and zoom levels.
import path from 'node:path';
import { launch, ready, save } from './lib.mjs';
import { EVID } from './lib.mjs';
const URL_ = process.argv[2] || 'http://127.0.0.1:8765/planner.html';
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const { ctx, page, log } = await launch({ width: W, height: H });
await ready(page, URL_);
await page.waitForSelector('#op-map-shell:not([hidden])', { timeout: 30000 });
await page.fill('#planning-date', '2026-11-19'); await page.dispatchEvent('#planning-date', 'change');
await page.click('#generate'); await page.waitForTimeout(2500);
const idle = () => page.waitForFunction(() => { const v = document.querySelector('#operational-map')?.operationalView; return v && v.map.loaded() && !v.map.isMoving(); }, null, { timeout: 60000 });
await idle();
const info = await page.evaluate(() => { const v = document.querySelector('#operational-map').operationalView; const l = v.layers; return { visits: l.visits.features.length, routes: l.routes.features.length, teams: l.teams.map(t => [t.teamId, t.count, Math.round(t.distanceM / 100) / 10]), first: l.visits.features[0].geometry.coordinates, ids: l.visits.features.slice(0, 40).map(f => [f.properties.orderId, f.properties.teamId, f.properties.city]) }; });
save('before-info.json', info); console.log(JSON.stringify(info.teams), info.visits, info.routes);
const mapEl = page.locator('#op-map-shell');
const shotMap = async (name) => { await idle(); await page.waitForTimeout(700); await mapEl.screenshot({ path: path.join(EVID, name) }); };
await shotMap(`before-${W}-overview.png`);
const view = (c, z) => page.evaluate(([c, z]) => { document.querySelector('#operational-map').operationalView.map.jumpTo({ center: c, zoom: z }); }, [c, z]);
for (const z of [9, 11, 13, 15, 17]) { await view(info.first, z); await shotMap(`before-${W}-z${z}.png`); }
console.log('errors', log.pageErrors, 'external', log.external);
await ctx.close();
