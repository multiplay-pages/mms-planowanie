// MAP-08 Chrome audit: operational map workspace, routes, clusters, selection sync, layers, variants, layout.
// Usage: node map08.mjs <url> <label>   (EVID env = output directory; W/H env = viewport)
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { chromium } from 'playwright-core';
import { CHROME, EVID, save } from './lib.mjs';
const ROOT = 'file:///C:/Users/lcichanowicz/work/mms-map08/map05/';
const { createScenario } = await import(ROOT + 'planner-model.mjs');
const { hasLocation } = await import(ROOT + 'locations.mjs');
const rd = (n) => JSON.parse(fs.readFileSync(new URL(n, ROOT + 'data/'), 'utf8'));
const scenario = createScenario(rd('addresses.json'), rd('uug-geocoding.json'), rd('local-routes.json'));
const unlocated = scenario.orders.filter((o) => !hasLocation(scenario.addresses.find((a) => a.id === o.addressId))).map((o) => o.id);

const URL_ = process.argv[2], LABEL = process.argv[3] || 'run';
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-m08-'));
const ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, headless: true, viewport: { width: W, height: H }, acceptDownloads: true });
const page = ctx.pages()[0];
const errors = [], external = [], results = [], failedReq = [];
const isLocal = (u) => /^(http:\/\/127\.0\.0\.1:\d+\/|file:|data:|blob:|about:)/.test(u);
ctx.on('request', (r) => { if (!isLocal(r.url())) external.push(r.url().slice(0, 120)); });
ctx.on('requestfailed', (r) => failedReq.push(r.url().slice(0, 100)));
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const check = (id, ok, detail) => { results.push({ id, ok: !!ok, detail }); console.log(ok ? 'PASS' : 'FAIL', id, detail ?? ''); };
const V = '(document.querySelector("#operational-map").operationalView)';
const idle = () => page.waitForFunction(() => { const v = document.querySelector('#operational-map')?.operationalView; return !v || (v.map.loaded() && !v.map.isMoving()); }, null, { timeout: 90000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const layers = () => ev(() => { const l = document.querySelector('#operational-map').operationalView.layers; return { visits: l.visits.features.map((f) => f.properties), routes: l.routes.features.map((f) => f.properties), teams: l.teams.map((t) => ({ id: t.teamId, count: t.count, unlocated: t.unlocated, incomplete: t.incomplete, km: t.distanceM })), unassigned: l.unassigned.features.length, gaps: l.gaps.map((g) => g.kind) }; });
const out = { label: LABEL, viewport: [W, H] };
try {
  const t0 = Date.now();
  await page.goto(URL_, { waitUntil: 'load', timeout: 180000 });
  await page.waitForSelector('#planner:not([hidden])', { timeout: 180000 });
  await page.waitForSelector('#op-map-shell:not([hidden])', { timeout: 60000 }); await idle();
  out.loadMs = Date.now() - t0;
  out.rich = await ev(() => document.querySelector('#operational-map').operationalView.rich);
  await page.fill('#planning-date', '2026-11-19'); await page.dispatchEvent('#planning-date', 'change'); await idle();
  // inline proportions
  const inlineRect = await ev(() => { const r = document.querySelector('#operational-map').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  out.inlineMap = inlineRect; out.inlineShare = +(inlineRect[0] * inlineRect[1] / (W * H)).toFixed(3);
  await page.click('#generate'); await page.waitForTimeout(2500); await idle();
  const base = await layers();
  check('S1 several teams in different towns', base.teams.filter((t) => t.count > 0).length >= 3 && new Set(base.visits.map((v) => v.city)).size >= 3, `${base.teams.filter((t) => t.count > 0).length} teams, towns ${[...new Set(base.visits.map((v) => v.city))].join(',')}`);
  check('S1b team colours distinct', new Set(base.visits.map((v) => v.color)).size === new Set(base.visits.map((v) => v.teamId)).size);
  check('S6 shapes: MPL circle, BSA square (POMIAR diamond if present)', base.visits.some((v) => v.type === 'MPL' && v.shape === 'circle') && base.visits.some((v) => v.type === 'BSA' && v.shape === 'square') && base.visits.filter((v) => v.type === 'POMIAR').every((v) => v.shape === 'diamond'), [...new Set(base.visits.map((v) => v.type + ':' + v.shape))].join(' '));
  check('S5 numbers 1..n per team', base.teams.filter((t) => t.count).every((t) => base.visits.filter((v) => v.teamId === t.id).map((v) => v.seq).sort().join() === Array.from({ length: t.count }, (_, i) => i + 1).join()));
  // workspace
  await page.click('#op-workspace'); await page.waitForTimeout(900); await idle();
  const ws = await ev(() => { const r = document.querySelector('#operational-map').getBoundingClientRect(); const c = document.querySelector('#map-card'); return { map: [Math.round(r.width), Math.round(r.height)], fixed: getComputedStyle(c).position, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, bodyLocked: document.body.classList.contains('op-ws-open') }; });
  out.workspaceMap = ws.map; out.workspaceShare = +(ws.map[0] * ws.map[1] / (W * H)).toFixed(3);
  check('S2 workspace map takes most of the window', out.workspaceShare >= 0.5 && ws.fixed === 'fixed' && ws.bodyLocked, `${ws.map.join('x')} = ${(out.workspaceShare * 100).toFixed(0)}% of ${W}x${H} (inline ${(out.inlineShare * 100).toFixed(0)}%)`);
  check('S2b no horizontal overflow in workspace', ws.overflowX <= 1, `${ws.overflowX}`);
  await page.screenshot({ path: path.join(EVID, `${LABEL}-workspace-${W}.png`) });
  // team list + toggles
  const toggle = async (id, on) => { const box = page.locator(`[data-op-team="${id}"]`); if ((await box.isChecked()) !== on) await box.click(); await page.waitForTimeout(250); };
  await toggle('TEST-02', false);
  let l = await layers();
  check('S3a team toggle hides its visits and route', !l.visits.some((v) => v.teamId === 'TEST-02') && !l.routes.some((r) => r.teamId === 'TEST-02'));
  await toggle('TEST-02', true);
  // single route with 3 visits
  await page.click('[data-op-solo="TEST-01"]'); await page.waitForTimeout(500); await idle();
  l = await layers();
  check('S3 single route, three visits', l.visits.length === 3 && l.visits.every((v) => v.teamId === 'TEST-01') && l.routes.length === 2, `${l.visits.length} visits, ${l.routes.length} legs`);
  const fitted = await ev(() => { const v = document.querySelector('#operational-map').operationalView, b = v.map.getBounds(); return v.layers.visits.features.every((f) => b.contains(f.geometry.coordinates)); });
  check('S4 view auto-fits the selected route', fitted);
  const sum = await page.textContent('.op-team[data-team="TEST-01"] .op-sum');
  check('S3b team sum shows km and time', /\d+,\d km/.test(sum) && /min/.test(sum), sum.trim());
  const legs = await page.$$eval('.op-team[data-team="TEST-01"] .op-leg', (n) => n.map((x) => x.textContent.trim()));
  check('S3c leg lengths between visits', legs.length === 2 && legs.every((t) => /\d+,\d km/.test(t)), legs.join(' | '));
  await page.screenshot({ path: path.join(EVID, `${LABEL}-solo-route-${W}.png`) });
  await page.click('[data-op-all]'); await page.waitForTimeout(500); await idle();
  l = await layers();
  check('S3d show all routes again', l.teams.filter((t) => t.count).length >= 3 && l.visits.length === base.visits.length);
  // focus (dim others)
  await page.click('[data-op-focus="TEST-04"]'); await page.waitForTimeout(500); await idle();
  l = await layers();
  const dim = await ev(() => document.querySelector('#operational-map').operationalView.layers.routes.features.map((f) => [f.properties.teamId, f.properties.active]));
  check('S4b focus dims other routes', dim.filter(([t, a]) => t === 'TEST-04').every(([, a]) => a) && dim.filter(([t]) => t !== 'TEST-04').every(([, a]) => !a));
  await page.click('[data-op-all]'); await idle();
  // select from basket list and from map
  const firstOrder = base.visits[0].orderId;
  await page.click(`#op-layers [data-order="${firstOrder}"]`); await page.waitForTimeout(900); await idle();
  check('S8a select from basket shows details', await page.isVisible('#op-detail') && (await page.textContent('#op-detail')).includes(firstOrder) && (await page.locator(`#op-layers [data-order="${firstOrder}"]`).getAttribute('aria-pressed')) === 'true');
  await page.click('[data-op-close]'); check('S8b details can be closed', await page.isHidden('#op-detail'));
  const target = base.visits.find((v) => v.orderId !== firstOrder && v.teamId === 'TEST-04') || base.visits[1];
  await ev((id) => { const v = document.querySelector('#operational-map').operationalView, f = v.layers.visits.features.find((x) => x.properties.orderId === id); v.map.jumpTo({ center: f.geometry.coordinates, zoom: 15 }); }, target.orderId);
  await idle(); await page.waitForTimeout(800);
  const pt = await ev((id) => { const v = document.querySelector('#operational-map').operationalView, f = v.layers.visits.features.find((x) => x.properties.orderId === id), p = v.map.project(f.geometry.coordinates), r = v.map.getCanvas().getBoundingClientRect(); return [r.left + p.x, r.top + p.y]; }, target.orderId);
  await page.mouse.click(pt[0], pt[1]); await page.waitForTimeout(700);
  const popup = await page.isVisible('.maplibregl-popup');
  check('S8c select from map: popup + details + list sync', popup && (await page.textContent('#op-detail')).includes(target.orderId) && (await page.locator(`#op-layers [data-order="${target.orderId}"]`).getAttribute('aria-pressed')) === 'true', `popup=${popup}`);
  await page.screenshot({ path: path.join(EVID, `${LABEL}-select-${W}.png`) });
  // clusters: overview
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('Esc closes popup/details first, not the large map', await ev(() => document.querySelector('#map-card').classList.contains('op-workspace')));
  await page.click('#op-fit-all'); await idle(); await page.waitForTimeout(900);
  const clustersFar = await ev(() => document.querySelector('#operational-map').operationalView.map.queryRenderedFeatures({ layers: ['unassigned-cluster', 'visits-cluster'] }).length);
  check('S7 overlapping markers are clustered when zoomed out', clustersFar > 0, `${clustersFar} cluster features`);
  await page.screenshot({ path: path.join(EVID, `${LABEL}-clusters-${W}.png`) });
  const dense = await ev(() => { const v = document.querySelector('#operational-map').operationalView, r = v.map.getCanvas().getBoundingClientRect(); const list = v.map.queryRenderedFeatures({ layers: ['unassigned-cluster'] }).sort((a, b) => b.properties.point_count - a.properties.point_count); for (const f of list) { const q = v.map.project(f.geometry.coordinates); const el = document.elementFromPoint(r.left + q.x, r.top + q.y); if (el && el.tagName === 'CANVAS') return { c: f.geometry.coordinates, n: f.properties.point_count, x: r.left + q.x, y: r.top + q.y, z: v.map.getZoom() }; } return null; });
  if (dense) {
    await page.mouse.click(dense.x, dense.y); await page.waitForTimeout(1500); await idle();
    const z = await ev(() => document.querySelector('#operational-map').operationalView.map.getZoom());
    check('S7b clicking a cluster zooms in', z > dense.z + 0.4, `zoom ${dense.z.toFixed(1)} -> ${z.toFixed(1)} for cluster of ${dense.n}`);
  } else check('S7b clicking a cluster zooms in', false, 'no clickable cluster');
  const q1 = await ev(() => { const v = document.querySelector('#operational-map').operationalView; return v.layers.unassigned.features[0].geometry.coordinates; });
  await ev((c) => document.querySelector('#operational-map').operationalView.map.jumpTo({ center: c, zoom: 15 }), q1);
  await idle(); await page.waitForTimeout(900);
  const single = await ev(() => document.querySelector('#operational-map').operationalView.map.queryRenderedFeatures({ layers: ['unassigned', 'unassigned-measurement', 'visits-icon'] }).length);
  check('S7c individual installations can be picked when zoomed in', single > 0, `${single} single markers`);
  // layer toggles
  await page.click('#op-layers-menu summary');
  const flagLayers = { arrows: 'routes-arrows', legs: 'routes-leg-labels', numbers: 'visits-label', streets: 'road-labels', places: 'place-labels', buildings: 'building', nature: 'water' };
  for (const [flag, layer] of Object.entries(flagLayers)) {
    const box = page.locator(`[data-op-flag="${flag}"]`);
    if (!(await box.isEnabled())) { check(`S14 toggle ${flag}`, false, 'disabled'); continue; }
    await box.uncheck(); await page.waitForTimeout(150);
    const off = await ev((id) => document.querySelector('#operational-map').operationalView.map.getLayoutProperty(id, 'visibility'), layer);
    await page.locator(`[data-op-flag="${flag}"]`).check(); await page.waitForTimeout(150);
    const on = await ev((id) => document.querySelector('#operational-map').operationalView.map.getLayoutProperty(id, 'visibility'), layer);
    check(`S14 layer switch ${flag}`, off === 'none' && on === 'visible', `${off} -> ${on}`);
  }
  await page.locator('[data-op-toggle="routes"]').uncheck(); await page.waitForTimeout(200);
  check('S14b routes switch removes routes', (await layers()).routes.length === 0); await page.locator('[data-op-toggle="routes"]').check();
  await page.click('#op-layers-menu summary');
  // variants
  const colorOf = () => ev(() => JSON.stringify(document.querySelector('#operational-map').operationalView.map.getPaintProperty('roads-fill', 'line-color')));
  const lightColor = await colorOf();
  await page.selectOption('#op-variant', 'nav'); await page.waitForTimeout(600); await idle();
  const navColor = await colorOf();
  check('S16 style variant switches the whole style and persists', lightColor !== navColor && (await ev(() => localStorage.getItem('mms-map08-variant-v1'))) === 'nav');
  await page.selectOption('#op-variant', 'light'); await page.waitForTimeout(400);
  // basemap status honesty
  const status = await page.textContent('#op-status');
  check('S15 basemap status states the real source', /Drogowa/.test(status) && !/Hybryda|Satelita —/.test(status) && (out.rich ? /pakiet mapy/.test(status) : /uproszczony/.test(status)), status.slice(0, 120));
  check('S15b satellite/hybrid honestly unavailable by default', await page.locator('input[name="op-basemap"][value="satellite"]').isDisabled() && await page.locator('input[name="op-basemap"][value="hybrid"]').isDisabled());
  // change day + regenerate
  await page.fill('#op-date', '2026-11-20'); await page.dispatchEvent('#op-date', 'change'); await page.waitForTimeout(800); await idle();
  check('S10 day change empties/updates map without refresh', (await layers()).visits.length === 0 && (await page.inputValue('#planning-date')) === '2026-11-20' && /2026-11-20/.test(await page.textContent('#op-layers')));
  await page.click('#op-generate'); await page.waitForTimeout(2500); await idle();
  const d20 = await layers();
  check('S11 regenerate from the workspace redraws immediately', d20.visits.length > 0, `${d20.visits.length} visits on 20.11`);
  await page.fill('#op-date', '2026-11-19'); await page.dispatchEvent('#op-date', 'change'); await page.waitForTimeout(800); await idle();
  const back = await layers();
  check('S11b going back keeps the earlier plan', back.visits.length === base.visits.length);
  // order without verified coordinates: the model keeps it in the queue; the map must say so and never invent a position
  await page.click('#op-workspace-close'); await page.waitForTimeout(500);
  if (unlocated.length) {
    const id = unlocated[0];
    await page.fill('#queue-search', id); await page.waitForTimeout(400);
    await page.click(`#queue-list [data-order="${id}"]`); await page.waitForTimeout(500); await idle();
    const lu = await layers();
    check('S13 order without coordinates is not drawn', !lu.visits.some((v) => v.orderId === id) && lu.gaps.includes('NO_LOCATION_QUEUE'), `${id}; gaps ${[...new Set(lu.gaps)].join(',')}`);
    check('S13b the gap message names the unlocated queue orders', /bez ustalonej pozycji/.test(await page.textContent('#op-gaps')));
    check('S13c details explain the missing position', /Brak zweryfikowanych współrzędnych/.test(await page.textContent('#op-detail')) && !(await page.locator('#op-detail [data-op-zoom]').count()));
    await page.fill('#queue-search', ''); await page.waitForTimeout(300);
  } else check('S13 order without coordinates', false, 'no unlocated order found');
  // layout screenshots
  await page.click('#op-workspace'); await page.waitForTimeout(800); await idle();
  await page.screenshot({ path: path.join(EVID, `${LABEL}-final-${W}.png`) });
  // perf: frame times during an animated pan/zoom
  const perf = await ev(async () => {
    const v = document.querySelector('#operational-map').operationalView, map = v.map;
    map.jumpTo({ center: [18.0, 50.67], zoom: 11 }); await new Promise((r) => setTimeout(r, 1500));
    const frames = []; let last = performance.now(), stop = false;
    const tick = (t) => { frames.push(t - last); last = t; if (!stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    for (const [c, z] of [[[18.1, 50.7], 13], [[17.95, 50.66], 15], [[18.3, 50.9], 10], [[18.0, 50.67], 12]]) { map.flyTo({ center: c, zoom: z, duration: 1800 }); await new Promise((r) => map.once('moveend', r)); }
    stop = true; await new Promise((r) => setTimeout(r, 100));
    frames.sort((a, b) => a - b);
    return { frames: frames.length, medianMs: +frames[frames.length >> 1].toFixed(1), p95Ms: +frames[Math.floor(frames.length * 0.95)].toFixed(1), worstMs: +frames.at(-1).toFixed(1), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
  });
  out.perf = perf; console.log('perf', JSON.stringify(perf));
  check('perf: p95 frame time under 50 ms while flying across zoom levels', perf.p95Ms < 50, JSON.stringify(perf));
} catch (e) { out.error = String(e).slice(0, 500); check('script completed', false, out.error); }
out.errors = errors.slice(0, 6); out.external = external; out.failedRequests = failedReq.slice(0, 5);
check('no console/page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
check('no external requests', external.length === 0, external.slice(0, 2).join(' '));
out.results = results; out.pass = results.filter((r) => r.ok).length; out.fail = results.filter((r) => !r.ok).length;
save(`${LABEL}-results.json`, out);
console.log(`${LABEL}: ${out.pass} PASS / ${out.fail} FAIL; load ${out.loadMs} ms; rich=${out.rich}; inline ${out.inlineMap} (${(out.inlineShare * 100).toFixed(0)}%) workspace ${out.workspaceMap} (${(out.workspaceShare * 100).toFixed(0)}%)`);
await ctx.close();
