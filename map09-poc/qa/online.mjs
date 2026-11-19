// Stage 3b: ONLINE test in real Chrome (user consent given for tiles.openfreemap.org only).
// Sends only tile/style/glyph/sprite requests for public places. Synthetic overlay never leaves the machine.
import {startServer, waitForServer, launch, URL_BASE, shot, save, check, results, waitIdle, providerAudit} from './common.mjs';
import {PLACES} from '../overlay.mjs';

// MAP09_LIGHT=1: re-verification after code changes with ~300 requests (one 1366x768 session, 4 views) instead of the full ~950-request run.
const LIGHT = process.env.MAP09_LIGHT === '1';
const DIR = LIGHT ? 'light-1366x768' : 'v1920x1080';

const PROVIDER = 'https://tiles.openfreemap.org';
const server = startServer();
const summary = {sessions: []};

const featureCounts = (page) => page.evaluate(() => {
  const m = __map09.map, layers = m.getStyle().layers;
  const ids = (sl) => layers.filter((l) => l['source-layer'] === sl).map((l) => l.id);
  const count = (sl) => { const l = ids(sl); return l.length ? m.queryRenderedFeatures({layers: l}).length : 0; };
  const named = (sl) => { const l = ids(sl).filter((id) => layers.find((x) => x.id === id).type === 'symbol'); return l.length ? m.queryRenderedFeatures({layers: l}).filter((f) => f.properties.name || f.properties['name:latin']).length : 0; };
  const names = (sl) => { const l = ids(sl).filter((id) => layers.find((x) => x.id === id).type === 'symbol'); return l.length ? [...new Set(m.queryRenderedFeatures({layers: l}).map((f) => f.properties['name:latin'] ?? f.properties.name).filter(Boolean))].slice(0, 12) : []; };
  return {
    transportation: count('transportation'), streetNameFeatures: named('transportation_name'), streetNames: names('transportation_name'),
    buildings: count('building'), places: named('place'), placeNames: names('place'), water: count('water'), landuse: count('landuse') + count('landcover'),
    layerCount: layers.length, zoom: m.getZoom(), center: m.getCenter().toArray(),
    points: __map09.renderedPointCount(),
  };
});

// ERR_ABORTED is expected only for vector tiles that MapLibre cancels when the view moves on; any other abort is a real failure.
const realFailed = (log) => log.failed.filter((f) => !(f.error === 'net::ERR_ABORTED' && /\.pbf$/.test(new URL(f.url).pathname)));
const go = async (page, key) => { await page.click(`[data-place="${key}"]`); await waitIdle(page); };
const setStyle = async (page, value) => { await page.check(`input[name="style"][value="${value}"]`); await page.waitForFunction((v) => __map09.state.active === v && !__map09.state.pending, value, {timeout: 30000}); await waitIdle(page); };
const snapshot = (page, name) => page.evaluate((n) => { const c = __map09.map.getCanvas(), t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const g = t.getContext('2d'); g.drawImage(c, 0, 0); (globalThis.__snaps ??= {})[n] = g.getImageData(0, 0, t.width, t.height); return [t.width, t.height]; }, name);
const pixelDiff = (page, a, b) => page.evaluate(([x, y]) => { const A = __snaps[x].data, B = __snaps[y].data; let diff = 0, n = A.length / 4, sum = 0; for (let i = 0; i < A.length; i += 4) { const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); if (d > 48) diff++; sum += d; } return {fractionDifferent: diff / n, meanAbsDiff: sum / n / 3}; }, [a, b]);

async function session(width, height, tag, cities) {
  const s = await launch({width, height});
  const {page, log} = s;
  await page.goto(URL_BASE, {waitUntil: 'load'});
  await page.waitForFunction(() => document.documentElement.dataset.mapReady === 'true');
  const preExternal = log.external.length;
  await page.click('#enable-online');
  await page.waitForFunction(() => __map09.state.styleLoaded, null, {timeout: 40000});
  await waitIdle(page);
  const out = {tag, preConsentExternal: preExternal, views: {}, mapBox: await page.evaluate(() => { const b = document.getElementById('map').getBoundingClientRect(); return {w: Math.round(b.width), h: Math.round(b.height), vh: innerHeight, vw: innerWidth}; })};
  check(`L0-${tag}`, `mapa zajmuje większość okna po włączeniu online (${tag})`, out.mapBox.h > out.mapBox.vh * 0.6 && out.mapBox.w >= out.mapBox.vw - 1 ? 'PASS' : 'FAIL', JSON.stringify(out.mapBox));

  for (const style of ['positron', 'liberty']) {
    await setStyle(page, style);
    for (const key of cities) {
      await go(page, key);
      const counts = await featureCounts(page);
      out.views[`${style}/${key}`] = counts;
      await shot(page, `${tag}/${style}-${key}.png`);
      if (key === 'polska' || key === 'opole') await snapshot(page, `${style}-${key}`);
    }
    // street level: real zoom into streets and buildings of Opole and Knurów
    for (const key of ['opole', 'knurow']) {
      await go(page, key);
      await page.evaluate(() => __map09.map.jumpTo({zoom: 16.2}));
      await waitIdle(page);
      out.views[`${style}/${key}@16.2`] = await featureCounts(page);
      await shot(page, `${tag}/${style}-${key}-street.png`);
      if (key === 'opole') await snapshot(page, `${style}-opole-street`);
    }
  }
  out.styleDiff = {
    polska: await pixelDiff(page, 'positron-polska', 'liberty-polska'),
    opole: await pixelDiff(page, 'positron-opole', 'liberty-opole'),
    street: await pixelDiff(page, 'positron-opole-street', 'liberty-opole-street'),
  };
  out.log = {console: log.console, pageErrors: log.pageErrors, failed: log.failed, external: [...new Set(log.external.map((u) => new URL(u).origin))], requestTotal: log.requests.length};
  out.providerRequests = {total: log.requests.filter((r) => r.url.startsWith(PROVIDER)).length, styles: log.requests.filter((r) => /\/styles\//.test(r.url)).length, tiles: log.requests.filter((r) => /\/planet\/.*\.pbf/.test(r.url)).length, fonts: log.requests.filter((r) => /\/fonts\//.test(r.url)).length, sprites: log.requests.filter((r) => /\/sprites\//.test(r.url)).length};
  return {s, out};
}

try {
  await waitForServer();

  // ---- 1920x1080 : all cities, both styles
  const big = LIGHT ? await session(1366, 768, 'light-1366x768', ['polska', 'opole', 'knurow', 'warszawa']) : await session(1920, 1080, 'v1920x1080', ['polska', 'warszawa', 'gdansk', 'krakow', 'wroclaw', 'opole', 'knurow']);
  summary.sessions.push(big.out);
  const {page, log} = big.s;
  const v = big.out.views;

  // Poland view detail
  for (const style of ['positron', 'liberty']) {
    const c = v[`${style}/polska`];
    check(`W1-${style}`, `widok Polski (${style}) pokazuje kraj ze szczegółowym podkładem`, c.places >= 5 && c.water > 0 && c.landuse > 0 ? 'PASS' : 'FAIL', JSON.stringify({transportation: c.transportation, places: c.places, placeNames: c.placeNames, water: c.water, zoom: c.zoom}));
  }
  // cities reachable
  for (const key of LIGHT ? ['warszawa', 'opole', 'knurow'] : ['warszawa', 'gdansk', 'krakow', 'wroclaw', 'opole', 'knurow']) {
    for (const style of ['positron', 'liberty']) {
      const c = v[`${style}/${key}`];
      const want = PLACES[key], here = Math.abs(c.center[0] - want.center[0]) < 0.02 && Math.abs(c.center[1] - want.center[1]) < 0.02 && Math.abs(c.zoom - want.zoom) < 0.05;
      check(`C-${key}-${style}`, `${key} osiągalne przyciskiem: środek i zoom zgodne z presetem, mapa szczegółowa (${style})`, here && c.transportation > 20 && c.points > 0 ? 'PASS' : 'FAIL', JSON.stringify({roads: c.transportation, places: c.places, streets: c.streetNameFeatures, buildings: c.buildings, points: c.points}));
    }
  }
  // street-level
  for (const key of ['opole', 'knurow']) {
    for (const style of ['positron', 'liberty']) {
      const c = v[`${style}/${key}@16.2`];
      check(`T-${key}-${style}`, `${key} z16.2 (${style}): nazwy ulic i budynki`, (key === 'opole' ? c.streetNameFeatures >= 3 && c.buildings >= 20 : c.streetNameFeatures >= 1 && c.buildings >= 5) ? 'PASS' : 'FAIL', JSON.stringify({streetNames: c.streetNames.slice(0, 6), streetNameFeatures: c.streetNameFeatures, buildings: c.buildings}));
    }
  }
  // genuinely different styles
  const sd = big.out.styleDiff;
  check('D1', 'Positron i Liberty różnią się wizualnie', sd.opole.fractionDifferent > 0.15 && sd.street.fractionDifferent > 0.15 ? 'PASS' : 'FAIL', JSON.stringify(sd));

  // ---- style switch keeps points, interactions and does not duplicate elements
  await go(page, 'opole');
  await setStyle(page, 'positron');
  const before = await page.evaluate(() => ({pts: __map09.renderedPointCount(), layers: __map09.map.getStyle().layers.filter((l) => l.id.startsWith('demo-')).map((l) => l.id), styleLoads: __map09.state.styleLoads}));
  const ptsByStyle = {};
  for (let i = 0; i < 3; i++) {
    for (const style of ['liberty', 'positron']) {
      await setStyle(page, style);
      ptsByStyle[`${i}-${style}`] = await page.evaluate(() => ({pts: __map09.renderedPointCount(), overlay: __map09.overlayLayerPresent(), demoLayers: __map09.map.getStyle().layers.filter((l) => l.id.startsWith('demo-')).length, sources: Object.keys(__map09.map.getStyle().sources).filter((k) => k.startsWith('demo-')).length}));
    }
  }
  const stable = Object.values(ptsByStyle).every((x) => x.pts === before.pts && x.overlay && x.demoLayers === 3 && x.sources === 2);
  check('P1', 'po 6 przełączeniach stylu punkty MPL/BSA/POMIAR i trasa są zachowane, bez duplikatów warstw', stable ? 'PASS' : 'FAIL', JSON.stringify({before, sample: ptsByStyle['2-positron']}));
  const kinds = await page.evaluate(() => { const f = __map09.map.queryRenderedFeatures({layers: ['demo-points']}); return [...new Set(f.map((x) => x.properties.kind))].sort(); });
  check('P2', 'wszystkie trzy typy punktów widoczne na mapie (Opole)', JSON.stringify(kinds) === '["BSA","MPL","POMIAR"]' ? 'PASS' : 'FAIL', JSON.stringify(kinds));
  // click on a point after the switches
  const clicked = await page.evaluate(() => { const f = __map09.map.queryRenderedFeatures({layers: ['demo-points']})[0]; const p = __map09.map.project(f.geometry.coordinates); const r = __map09.map.getCanvas().getBoundingClientRect(); return {x: r.left + p.x, y: r.top + p.y}; });
  await page.mouse.click(clicked.x, clicked.y);
  await page.waitForSelector('.maplibregl-popup', {timeout: 4000}).catch(() => {});
  const popup = await page.evaluate(() => ({n: document.querySelectorAll('.maplibregl-popup').length, text: document.querySelector('.maplibregl-popup')?.textContent ?? null}));
  check('I1', 'kliknięcie punktu po zmianach stylu otwiera dymek', popup.n === 1 && /syntetyczny/.test(popup.text ?? '') ? 'PASS' : 'FAIL', JSON.stringify(popup));
  await shot(page, `${DIR}/popup-after-style-switch.png`);
  const dup = await page.evaluate(() => ({canvas: document.querySelectorAll('.maplibregl-canvas').length, scale: document.querySelectorAll('.maplibregl-ctrl-scale').length, nav: document.querySelectorAll('.maplibregl-ctrl-zoom-in').length, mapDivs: document.querySelectorAll('#map').length}));
  check('L1', 'brak zdublowanych elementów mapy po przełączeniach', dup.canvas === 1 && dup.scale === 1 && dup.nav === 1 && dup.mapDivs === 1 ? 'PASS' : 'FAIL', JSON.stringify(dup));

  // ---- zoom / pan / fit / resize
  const z0 = await page.evaluate(() => __map09.map.getZoom());
  await page.click('.maplibregl-ctrl-zoom-in'); await waitIdle(page);
  const z1 = await page.evaluate(() => __map09.map.getZoom());
  await page.click('.maplibregl-ctrl-zoom-out'); await waitIdle(page);
  const c0 = await page.evaluate(() => __map09.map.getCenter().toArray());
  await page.mouse.move(900, 600); await page.mouse.down(); await page.mouse.move(700, 520, {steps: 8}); await page.mouse.up(); await waitIdle(page);
  const c1 = await page.evaluate(() => __map09.map.getCenter().toArray());
  await page.click('#fit-points'); await waitIdle(page);
  const fit = await page.evaluate(() => ({z: __map09.map.getZoom(), pts: __map09.renderedPointCount()}));
  check('Z1', 'zoom +/−, pan przeciągnięciem i „Dopasuj punkty” działają', z1 > z0 && (c0[0] !== c1[0] || c0[1] !== c1[1]) && fit.pts >= 7 ? 'PASS' : 'FAIL', JSON.stringify({z0, z1, c0, c1, fit}));
  await shot(page, `${DIR}/fit-points.png`);
  await page.setViewportSize({width: 1100, height: 700}); await waitIdle(page);
  const rs = await page.evaluate(() => { const c = __map09.map.getCanvas(), b = document.getElementById('map').getBoundingClientRect(); return {canvas: [c.clientWidth, c.clientHeight], box: [Math.round(b.width), Math.round(b.height)], pts: __map09.renderedPointCount()}; });
  check('Z2', 'zmiana rozmiaru okna dopasowuje mapę', Math.abs(rs.canvas[0] - rs.box[0]) <= 1 && Math.abs(rs.canvas[1] - rs.box[1]) <= 1 ? 'PASS' : 'FAIL', JSON.stringify(rs));
  await shot(page, `${DIR}/resized-1100x700.png`);
  await page.setViewportSize(LIGHT ? {width: 1366, height: 768} : {width: 1920, height: 1080});

  // ---- viewport vs fullPage
  await go(page, 'polska');
  const vp = await shot(page, `${DIR}/viewport.png`);
  const fp = await shot(page, `${DIR}/fullpage.png`, {fullPage: true});
  const dims = await page.evaluate(() => ({scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], inner: [innerWidth, innerHeight]}));
  check('L2', 'układ mieści się w oknie (viewport = fullPage)', dims.scroll[0] <= dims.inner[0] && dims.scroll[1] <= dims.inner[1] ? 'PASS' : 'FAIL', JSON.stringify(dims));

  const errs = log.console.filter((m) => m.type === 'error');
  check('N4', 'konsola: brak błędów; Network: brak nieudanych żądań', errs.length === 0 && log.pageErrors.length === 0 && realFailed(log).length === 0 && (await page.evaluate(() => __map09.state.errors.filter((e) => !e.tile && !e.sourceId).length)) === 0 ? 'PASS' : 'FAIL', JSON.stringify({maplibreNonTileErrors: await page.evaluate(() => __map09.state.errors.filter((e) => !e.tile && !e.sourceId).map((e) => e.message).slice(0, 3)), errors: errs.slice(0, 5), pageErrors: log.pageErrors.slice(0, 3), realFailed: realFailed(log).slice(0, 5), abortedByViewChange: log.failed.length - realFailed(log).length}));
  save(`${DIR}/page-log.json`, {console: log.console, pageErrors: log.pageErrors, failed: log.failed, requestsByHost: big.out.providerRequests, state: await page.evaluate(() => ({errors: __map09.state.errors, tileErrors: __map09.state.tileErrors}))});

  // ---- offline AFTER load: pan to a not yet loaded place
  await go(page, 'polska');
  await page.evaluate(() => __map09.map.jumpTo({center: [22.5, 49.8], zoom: 12.3})); await page.waitForTimeout(500);
  await big.s.ctx.setOffline(true);
  await page.evaluate(() => __map09.map.jumpTo({center: [19.1, 52.9], zoom: 11.4}));
  await page.waitForFunction(() => __map09.state.tileErrors > 0, null, {timeout: 25000}).catch(() => {});
  const off1 = await page.evaluate(() => ({status: document.getElementById('status').textContent, warn: document.querySelector('.status').classList.contains('warn'), tileErrors: __map09.state.tileErrors, overlay: __map09.overlayLayerPresent()}));
  await shot(page, `${DIR}/offline-after-load.png`);
  check('O1', 'internet wyłączony po załadowaniu: aplikacja mówi, że część kafli/mapy jest niedostępna', off1.warn && off1.tileErrors > 0 && /(brak połączenia|nie wczytała|niedostępn)/i.test(off1.status) ? 'PASS' : 'FAIL', JSON.stringify(off1));
  const audit = await providerAudit(log);
  save(`${DIR}/provider-audit.json`, audit);
  check('N1', 'cała sesja: jedyny origin poza 127.0.0.1 to tiles.openfreemap.org', audit.origins.length === 1 && audit.origins[0] === PROVIDER ? 'PASS' : 'FAIL', JSON.stringify(audit.origins));
  check('N2', `cała sesja (${audit.toProvider} żądań): tylko GET bez ciała, bez Referer/cookie/Authorization, bez query-stringa, ścieżki tylko style/kafle/czcionki/sprity, bez nazw punktów w ścieżce`, audit.bad.length === 0 && audit.toProvider > 0 ? 'PASS' : 'FAIL', JSON.stringify({bad: audit.bad.slice(0, 3)}));
  check('N3', 'przed kliknięciem zgody: 0 żądań poza 127.0.0.1', big.out.preConsentExternal === 0 ? 'PASS' : 'FAIL', `${big.out.preConsentExternal}`);
  await big.s.ctx.setOffline(false);
  await big.s.close();

  if (!LIGHT) {
  // ---- 1366x768 : Poland, Opole, Knurów
  const small = await session(1366, 768, 'v1366x768', ['polska', 'opole', 'knurow']);
  summary.sessions.push(small.out);
  const sp = small.s.page;
  await go(sp, 'polska');
  await shot(sp, 'v1366x768/viewport.png');
  await shot(sp, 'v1366x768/fullpage.png', {fullPage: true});
  const d2 = await sp.evaluate(() => ({scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], inner: [innerWidth, innerHeight]}));
  check('L3', 'układ 1366×768 mieści się w oknie (viewport = fullPage)', d2.scroll[0] <= d2.inner[0] && d2.scroll[1] <= d2.inner[1] ? 'PASS' : 'FAIL', JSON.stringify(d2));
  const s2 = small.out.views;
  check('W2', '1366×768: widok Polski szczegółowy w obu stylach', ['positron', 'liberty'].every((st) => s2[`${st}/polska`].places >= 5 && s2[`${st}/polska`].water > 0 && s2[`${st}/polska`].landuse > 0) ? 'PASS' : 'FAIL', JSON.stringify({p: [s2['positron/polska'].places, s2['positron/polska'].water], l: [s2['liberty/polska'].places, s2['liberty/polska'].water]}));
  check('T2', '1366×768: ulice i budynki w Opolu i Knurowie (z16.2)', ['positron', 'liberty'].every((st) => ['opole', 'knurow'].every((k) => s2[`${st}/${k}@16.2`].streetNameFeatures >= 1 && s2[`${st}/${k}@16.2`].buildings >= 5)) ? 'PASS' : 'FAIL', JSON.stringify(Object.fromEntries(Object.entries(s2).filter(([k]) => k.includes('@')).map(([k, c]) => [k, [c.streetNameFeatures, c.buildings]]))));
  const e2 = small.s.log.console.filter((m) => m.type === 'error');
  check('N5', '1366×768: konsola i Network bez błędów', e2.length === 0 && small.s.log.pageErrors.length === 0 && realFailed(small.s.log).length === 0 ? 'PASS' : 'FAIL', JSON.stringify({e2: e2.slice(0, 5), realFailed: realFailed(small.s.log).slice(0, 5), abortedByViewChange: small.s.log.failed.length - realFailed(small.s.log).length}));
  const audit2 = await providerAudit(small.s.log);
  save('v1366x768/provider-audit.json', audit2);
  check('N6', `1366×768 cała sesja (${audit2.toProvider} żądań): ten sam audyt prywatności`, audit2.bad.length === 0 && audit2.origins.length === 1 && audit2.origins[0] === PROVIDER ? 'PASS' : 'FAIL', JSON.stringify({origins: audit2.origins, bad: audit2.bad.slice(0, 3)}));
  await small.s.close();

  }

  // ---- offline BEFORE enabling: no network at all
  const off = await launch({width: 1366, height: 768});
  await off.page.goto(URL_BASE, {waitUntil: 'load'});
  await off.page.waitForFunction(() => document.documentElement.dataset.mapReady === 'true');
  await off.ctx.setOffline(true);
  await off.page.click('#enable-online');
  await off.page.waitForSelector('#retry:not([hidden])', {timeout: 30000}).catch(() => {});
  const off2 = await off.page.evaluate(() => ({status: document.getElementById('status').textContent, retry: !document.getElementById('retry').hidden, overlay: __map09.overlayLayerPresent(), online: __map09.state.online}));
  await shot(off.page, 'offline/offline-enable-1366x768.png');
  check('O2', 'bez internetu: komunikat „mapa online niedostępna”, bez udawania podkładu, przycisk ponowienia', off2.retry && /niedostępna/.test(off2.status) && off2.overlay ? 'PASS' : 'FAIL', JSON.stringify(off2));
  // recovery
  await off.ctx.setOffline(false);
  await off.page.click('#retry');
  await off.page.waitForFunction(() => __map09.state.styleLoaded, null, {timeout: 40000}).catch(() => {});
  await waitIdle(off.page).catch(() => {});
  const rec = await off.page.evaluate(() => ({styleLoaded: __map09.state.styleLoaded, status: document.getElementById('status').textContent}));
  check('O3', 'po powrocie sieci „Spróbuj ponownie” przywraca mapę', rec.styleLoaded ? 'PASS' : 'FAIL', JSON.stringify(rec));
  await off.close();
} catch (error) {
  check('X', 'wykonanie skryptu online', 'FAIL', String(error?.stack ?? error));
} finally {
  save('online-summary.json', summary);
  save('online-results.json', results);
  server.stop();
}
process.exit(results.every((r) => r.status === 'PASS') ? 0 : 1);
