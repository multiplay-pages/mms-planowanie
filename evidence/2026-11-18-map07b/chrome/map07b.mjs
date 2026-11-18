// MAP-07B real Chrome audit: simulation proposal, preview, accept/undo, reject, layout, console/network, long tasks.
// Usage: node map07b.mjs <url> <label>   (EVID env = output directory)
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { chromium } from 'playwright-core';
import { CHROME, EVID, save } from './lib.mjs';
const URL_ = process.argv[2], LABEL = process.argv[3] || 'run';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-m07b-'));
const ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = ctx.pages()[0];
const errors = [], external = [], results = [];
const isLocal = (u) => /^(http:\/\/127\.0\.0\.1:\d+\/|file:|data:|blob:|about:)/.test(u);
ctx.on('request', (r) => { if (!isLocal(r.url())) external.push(r.url().slice(0, 120)); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const check = (id, ok, detail) => { results.push({ id, ok: !!ok, detail }); console.log(ok ? 'PASS' : 'FAIL', id, detail ?? ''); };
const idle = () => page.waitForFunction(() => { const v = document.querySelector('#operational-map')?.operationalView; return !v || (v.map.loaded() && !v.map.isMoving()); }, null, { timeout: 90000 });
const storedCount = () => page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('mms-map05-plan-v1')); return k ? JSON.parse(localStorage.getItem(k)).assignments.length : 0; });
const visitCount = () => page.evaluate(() => document.querySelectorAll('#op-layers ol li').length);
const out = { url: LABEL };
try {
  await page.goto(URL_, { waitUntil: 'load', timeout: 180000 });
  await page.waitForSelector('#planner:not([hidden])', { timeout: 180000 }); await idle();
  await page.evaluate(() => { window.__long = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); });
  await page.fill('#planning-date', '2026-11-19'); await page.dispatchEvent('#planning-date', 'change'); await idle();
  check('panel visible, simulation labelled', await page.isVisible('#optimizer') && /BEZ AUTOMATYCZNEGO ZATWIERDZANIA/.test(await page.textContent('#optimizer')));
  check('hierarchy marked as not approved', /niezatwierdzona/.test(await page.textContent('#opt-hierarchy')));
  const t0 = Date.now();
  await page.click('#opt-run');
  await page.waitForSelector('#opt-result:not([hidden])', { timeout: 60000 });
  out.computeMs = Date.now() - t0;
  const status = await page.textContent('#opt-status');
  check('proposal computed within 10 s', out.computeMs < 10000, `${out.computeMs} ms`);
  check('status says simulation, plan unchanged', /symulacja: plan nie został zmieniony/.test(status), status.slice(0, 160));
  check('nothing stored by computing', (await storedCount()) === 0);
  const rows = await page.$$eval('#opt-compare tr', (trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.trim())));
  out.compare = rows; console.log(JSON.stringify(rows));
  check('comparison table has 7 measures', rows.length === 7);
  check('5 baskets compared', (await page.$$('#opt-baskets .opt-basket')).length === 5);
  await page.locator('#optimizer').scrollIntoViewIfNeeded();
  await page.locator('#optimizer').screenshot({ path: path.join(EVID, `${LABEL}-optimizer-panel.png`) });
  // open first explanation + first skipped explanation for the screenshot
  await page.locator('#opt-explain details').first().evaluate((d) => (d.open = true));
  await page.locator('#opt-skipped details').first().evaluate((d) => (d.open = true));
  await page.locator('#optimizer').screenshot({ path: path.join(EVID, `${LABEL}-optimizer-explained.png`) });
  const explainText = await page.textContent('#opt-explain'), skippedText = await page.textContent('#opt-skipped');
  check('scheduled explanations show alternatives', /Rozważono 5 koszyków/.test(explainText));
  check('skipped explanations show reasons', /pozostaje w kolejce/.test(skippedText));
  check('rules classified', /Potwierdzone w dokumentacji/.test(await page.textContent('#opt-rules')) && /Założenia tej symulacji/.test(await page.textContent('#opt-rules')));
  // map preview
  const currentVisits = await visitCount();
  await page.check('input[name="opt-view"][value="proposal"]'); await idle(); await page.waitForTimeout(800);
  const proposalVisits = await visitCount();
  check('map preview shows proposal visits and banner', proposalVisits > currentVisits && /PODGLĄD PROPOZYCJI/.test(await page.textContent('#op-layers')), `${currentVisits} -> ${proposalVisits}`);
  check('preview does not store anything', (await storedCount()) === 0);
  await page.locator('#map-card').scrollIntoViewIfNeeded();
  await page.locator('#map-card').screenshot({ path: path.join(EVID, `${LABEL}-map-proposal.png`) });
  await page.check('input[name="opt-view"][value="current"]'); await idle();
  check('current plan view restored', (await visitCount()) === currentVisits);
  // reject
  await page.click('#opt-reject');
  check('reject hides result, plan untouched', await page.isHidden('#opt-result') && (await storedCount()) === 0);
  // second run + accept
  await page.click('#opt-run'); await page.waitForSelector('#opt-result:not([hidden])', { timeout: 60000 });
  await page.click('#opt-accept');
  check('accept dialog open and informative', await page.isVisible('#opt-dialog') && /potwierdzone i ręczne przydziały pozostają/.test(await page.textContent('#opt-dialog-text')));
  await page.screenshot({ path: path.join(EVID, `${LABEL}-accept-dialog.png`) });
  await page.click('#opt-dialog-cancel');
  check('cancel keeps plan', (await storedCount()) === 0);
  await page.click('#opt-accept'); await page.click('#opt-dialog-accept'); await idle();
  const accepted = await storedCount();
  check('accepted proposal stored as plan', accepted >= 10, `${accepted} visits`);
  check('undo available after accept', await page.isEnabled('#undo'));
  const baskets = await page.textContent('#baskets');
  check('no limit violation shown in baskets', !/PRZEKROCZONY/.test(baskets) && !/Przekroczono/.test(baskets));
  await page.screenshot({ path: path.join(EVID, `${LABEL}-after-accept.png`), fullPage: false });
  await page.click('#undo');
  check('undo restores empty plan', (await storedCount()) === 0);
  // layout
  for (const width of [1440, 1150, 700, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.click('#opt-run'); await page.waitForSelector('#opt-result:not([hidden])', { timeout: 60000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const cardOverflow = await page.evaluate(() => { const c = document.querySelector('#optimizer'); return c.scrollWidth - c.clientWidth; });
    check(`no horizontal overflow at ${width}px`, overflow <= 1 && cardOverflow <= 1, `doc ${overflow} card ${cardOverflow}`);
    if (width === 390) { await page.locator('#optimizer').scrollIntoViewIfNeeded(); await page.locator('#optimizer').screenshot({ path: path.join(EVID, `${LABEL}-optimizer-390.png`) }); }
  }
  out.longTasks = await page.evaluate(() => window.__long);
} catch (e) { out.error = String(e).slice(0, 400); check('script completed', false, out.error); }
out.errors = errors.slice(0, 5); out.external = external;
check('no console/page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
check('no external requests', external.length === 0, external.slice(0, 2).join(' '));
out.results = results; out.pass = results.filter((r) => r.ok).length; out.fail = results.filter((r) => !r.ok).length;
save(`${LABEL}-results.json`, out);
console.log(`${LABEL}: ${out.pass} PASS / ${out.fail} FAIL; compute ${out.computeMs} ms; longtasks ${JSON.stringify(out.longTasks)}`);
await ctx.close();
