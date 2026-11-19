// Style-switch robustness in real Chrome with the PROVIDER MOCKED by Playwright routes: no real external traffic at all.
// Covers the cases that sequential online QA cannot: failing second style, invalid JSON, timeout, A→B→A races, out-of-order and stale failures.
import {startServer, waitForServer, launch, URL_BASE, shot, save, check, results} from './common.mjs';

const POSITRON = '#c8e6c9', LIBERTY = '#ffe0b2';
const mockStyle = (color) => JSON.stringify({version: 8, sources: {}, layers: [{id: 'background', type: 'background', paint: {'background-color': color}}]});
const behavior = {positron: {}, liberty: {}};
const seen = {handled: 0, unmocked: []};
const server = startServer();
let s;

const bg = (page) => page.evaluate(() => __map09.map.getPaintProperty('background', 'background-color'));
const snap = (page) => page.evaluate(() => ({active: __map09.state.active, requested: __map09.state.requested, pending: __map09.state.pending, failed: __map09.state.failed, radio: document.querySelector('input[name="style"]:checked').value,
  retryVisible: !document.getElementById('retry').hidden, status: document.getElementById('status').textContent, overlay: __map09.overlayLayerPresent(), styleLoads: __map09.state.styleLoads}));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fresh(page, query = '') {
  await page.goto(`${URL_BASE}${query}`, {waitUntil: 'load'});
  await page.waitForFunction(() => document.documentElement.dataset.mapReady === 'true');
}
const pick = (page, name) => page.check(`input[name="style"][value="${name}"]`);

try {
  await waitForServer();
  s = await launch({width: 1366, height: 768});
  const {page, ctx, log} = s;
  await ctx.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.origin !== 'https://tiles.openfreemap.org') { seen.unmocked.push(url.href); return route.abort(); }
    seen.handled += 1;
    const name = url.pathname.endsWith('/liberty') ? 'liberty' : url.pathname.endsWith('/positron') ? 'positron' : null;
    const b = name ? behavior[name] : {status: 404};
    if (b.delay) await sleep(b.delay);
    if (b.hang) { await sleep(b.hang); return route.abort(); }
    return route.fulfill({status: b.status ?? 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: b.body ?? mockStyle(name === 'liberty' ? LIBERTY : POSITRON)});
  });
  const reset = () => { behavior.positron = {}; behavior.liberty = {}; };

  // R1: first style fails (HTTP 500) -> honest unavailable state, overlay stays, retry recovers
  reset(); behavior.positron = {status: 500, body: 'oops'};
  await fresh(page); await page.click('#enable-online');
  await page.waitForFunction(() => __map09.state.failed === 'positron', null, {timeout: 8000});
  let a = await snap(page);
  check('R1a', 'pierwszy styl: błąd HTTP 500 → komunikat „niedostępna”, retry, nakładka lokalna', a.active === null && a.retryVisible && /niedostępna/.test(a.status) && a.overlay && !a.pending ? 'PASS' : 'FAIL', JSON.stringify(a));
  behavior.positron = {}; await page.click('#retry');
  await page.waitForFunction(() => __map09.state.active === 'positron' && !__map09.state.pending, null, {timeout: 8000});
  a = await snap(page);
  check('R1b', 'po „Spróbuj ponownie” mapa wraca (styl Positron aktywny, retry ukryty)', a.active === 'positron' && !a.retryVisible && a.failed === null && (await bg(page)) === POSITRON ? 'PASS' : 'FAIL', JSON.stringify(a));
  const focus = await page.evaluate(() => document.activeElement?.name + ':' + document.activeElement?.value);
  check('R1c', 'fokus po ponowieniu trafia na wybrany styl (przewidywalny)', focus === 'style:positron' ? 'PASS' : 'FAIL', focus);

  // R2: second style returns invalid JSON -> previous style stays, radio reverts, no false "działa Liberty"
  for (const [id, label, body, extra] of [['R2', 'niepoprawny JSON', '{not json', {}], ['R3', 'styl bez wymaganych pól (version 7)', JSON.stringify({version: 7}), {}], ['R4', 'błąd HTTP 503', 'x', {status: 503}]]) {
    reset();
    await fresh(page); await page.click('#enable-online');
    await page.waitForFunction(() => __map09.state.active === 'positron' && !__map09.state.pending, null, {timeout: 8000});
    behavior.liberty = {body, ...extra};
    await pick(page, 'liberty');
    await page.waitForFunction(() => __map09.state.failed === 'liberty', null, {timeout: 8000});
    await page.waitForTimeout(600); // a wrongly handled failure would flip to "działa · Liberty" on the next idle
    a = await snap(page);
    const ok = a.active === 'positron' && a.radio === 'positron' && a.retryVisible && !a.pending && /Nadal wyświetlany jest styl Positron/.test(a.status) && !/Liberty wczytany|działa · styl Liberty/.test(a.status) && a.overlay && (await bg(page)) === POSITRON;
    check(id, `drugi styl: ${label} → zostaje Positron, radio cofnięte, retry, bez fałszywego „działa”`, ok ? 'PASS' : 'FAIL', JSON.stringify(a));
  }

  // R5: timeout of the second style
  reset();
  await fresh(page, '?styleTimeoutMs=700'); await page.click('#enable-online');
  await page.waitForFunction(() => __map09.state.active === 'positron' && !__map09.state.pending, null, {timeout: 8000});
  behavior.liberty = {hang: 2500};
  await pick(page, 'liberty');
  await page.waitForFunction(() => __map09.state.failed === 'liberty', null, {timeout: 8000});
  a = await snap(page);
  check('R5', 'drugi styl: brak odpowiedzi → limit czasu, Positron zachowany, retry', a.active === 'positron' && a.retryVisible && /czas/.test(a.status) ? 'PASS' : 'FAIL', JSON.stringify(a));

  // R6: A -> B -> A quickly (B slow): final must be A, and B's late answer must be ignored
  reset();
  await fresh(page); await page.click('#enable-online');
  await page.waitForFunction(() => __map09.state.active === 'positron' && !__map09.state.pending, null, {timeout: 8000});
  const loadsBefore = (await snap(page)).styleLoads;
  behavior.liberty = {delay: 900}; behavior.positron = {delay: 150};
  await pick(page, 'liberty'); await pick(page, 'positron');
  await page.waitForFunction(() => !__map09.state.pending, null, {timeout: 8000});
  await page.waitForTimeout(1300); // let the stale Liberty answer arrive
  a = await snap(page);
  check('R6', 'szybkie Positron→Liberty→Positron: wynik = Positron, spóźniony Liberty ignorowany, radio/stan/mapa zgodne', a.active === 'positron' && a.radio === 'positron' && !a.pending && !a.retryVisible && (await bg(page)) === POSITRON && a.overlay ? 'PASS' : 'FAIL', JSON.stringify({...a, loadsDelta: a.styleLoads - loadsBefore}));

  // R7: out of order: Positron slow, Liberty fast -> Liberty wins
  reset(); behavior.positron = {delay: 900};
  await fresh(page); await page.click('#enable-online');
  behavior.liberty = {delay: 50};
  await pick(page, 'liberty');
  await page.waitForFunction(() => !__map09.state.pending, null, {timeout: 8000});
  await page.waitForTimeout(1200);
  a = await snap(page);
  check('R7', 'odpowiedzi w odwrotnej kolejności: wygrywa ostatni wybór (Liberty)', a.active === 'liberty' && a.radio === 'liberty' && (await bg(page)) === LIBERTY ? 'PASS' : 'FAIL', JSON.stringify(a));

  // R8: stale failure must not show a banner for a choice the user already abandoned
  reset();
  await fresh(page); await page.click('#enable-online');
  await page.waitForFunction(() => __map09.state.active === 'positron' && !__map09.state.pending, null, {timeout: 8000});
  behavior.liberty = {delay: 500, status: 500, body: 'x'}; behavior.positron = {delay: 50};
  await pick(page, 'liberty'); await pick(page, 'positron');
  await page.waitForFunction(() => !__map09.state.pending, null, {timeout: 8000});
  await page.waitForTimeout(1000);
  a = await snap(page);
  check('R8', 'spóźniony błąd porzuconego wyboru nie pokazuje komunikatu ani retry', a.active === 'positron' && !a.retryVisible && a.failed === null && !/Nie udało się/.test(a.status) ? 'PASS' : 'FAIL', JSON.stringify(a));

  // R9: 6 rapid alternations, every other answer delayed: always consistent at the end
  reset();
  await fresh(page); await page.click('#enable-online');
  await page.waitForFunction(() => __map09.state.active === 'positron' && !__map09.state.pending, null, {timeout: 8000});
  behavior.liberty = {delay: 300}; behavior.positron = {delay: 120};
  for (let i = 0; i < 3; i++) { await pick(page, 'liberty'); await pick(page, 'positron'); }
  await pick(page, 'liberty');
  await page.waitForFunction(() => !__map09.state.pending, null, {timeout: 10000});
  await page.waitForTimeout(800);
  a = await snap(page);
  const layers = await page.evaluate(() => __map09.map.getStyle().layers.filter((l) => l.id.startsWith('demo-')).length);
  check('R9', '7 szybkich przełączeń: stan końcowy spójny (Liberty), 3 warstwy nakładki, brak duplikatów', a.active === 'liberty' && a.radio === 'liberty' && a.overlay && layers === 3 && (await bg(page)) === LIBERTY ? 'PASS' : 'FAIL', JSON.stringify({...a, layers}));

  // R10: keyboard path to a visit (select) opens the popup; no click on the canvas needed
  await page.selectOption('#point-pick', 'SYN-OPO-2');
  await page.waitForSelector('.maplibregl-popup', {timeout: 4000}).catch(() => {});
  const pop = await page.evaluate(() => document.querySelector('.maplibregl-popup')?.textContent ?? null);
  check('R10', 'wizyta wybierana z listy (klawiatura) otwiera dymek', /BSA · wizyta 2 · Opole/.test(pop ?? '') ? 'PASS' : 'FAIL', String(pop));

  // R11: no real network at all
  check('R11', 'wszystkie żądania do dostawcy obsłużone przez mocki; żadne inne żądanie zewnętrzne nie wyszło', seen.unmocked.length === 0 && seen.handled > 0 ? 'PASS' : 'FAIL', JSON.stringify({handled: seen.handled, unmocked: seen.unmocked}));
  await shot(page, 'style-race/final.png');
  const errs = log.pageErrors;
  check('R12', 'brak wyjątków strony w trakcie testów wyścigów', errs.length === 0 ? 'PASS' : 'FAIL', JSON.stringify(errs.slice(0, 3)));
} catch (e) {
  check('X', 'wykonanie style-race', 'FAIL', String(e?.stack ?? e));
} finally {
  await s?.close();
  server.stop();
  save('style-race-results.json', results);
}
process.exit(results.every((r) => r.status === 'PASS') ? 0 : 1);
