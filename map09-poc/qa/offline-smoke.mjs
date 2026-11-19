// Stage 3a (NO external network): the demonstrator in real Chrome before consent.
// Proves: page loads, overlay renders without any basemap, no request leaves 127.0.0.1, no console/page errors.
import {startServer, waitForServer, launch, URL_BASE, shot, save, check, results, waitIdle} from './common.mjs';

const server = startServer();
let session;
try {
  await waitForServer();
  session = await launch({width: 1366, height: 768});
  const {page, log} = session;
  await page.goto(URL_BASE, {waitUntil: 'load'});
  await page.waitForFunction(() => document.documentElement.dataset.mapReady === 'true', null, {timeout: 20000});
  await waitIdle(page);

  const info = await page.evaluate(() => ({
    overlay: __map09.overlayLayerPresent(),
    rendered: __map09.renderedPointCount(),
    consentVisible: !document.getElementById('consent').hidden,
    status: document.getElementById('status').textContent,
    online: __map09.state.online,
    layout: {body: [document.body.scrollWidth, document.body.scrollHeight], inner: [innerWidth, innerHeight]},
    mapBox: document.getElementById('map').getBoundingClientRect().toJSON(),
  }));
  save('offline-smoke-info.json', info);
  await shot(page, 'offline-before-consent-1366x768.png');

  check('S1', 'strona i mapa startują bez sieci', info.overlay ? 'PASS' : 'FAIL', `overlay layers present=${info.overlay}`);
  check('S2', 'przed zgodą żadne żądanie nie opuszcza 127.0.0.1', log.external.length === 0 ? 'PASS' : 'FAIL', `external=${log.external.length} ${log.external.join(',')}`);
  check('S3', 'przed zgodą widoczny komunikat o wyłączonej mapie online', info.consentVisible && /wyłączona/.test(info.status) && !info.online ? 'PASS' : 'FAIL', info.status);
  check('S4', 'brak błędów konsoli i wyjątków strony', log.pageErrors.length === 0 && !log.console.some((m) => m.type === 'error') ? 'PASS' : 'FAIL', JSON.stringify({pageErrors: log.pageErrors, console: log.console.filter((m) => m.type === 'error')}));
  const overflow = info.layout.body[0] > info.layout.inner[0] + 1 || info.layout.body[1] > info.layout.inner[1] + 1;
  check('S5', 'układ mieści się w oknie 1366×768 (bez przewijania strony)', overflow ? 'FAIL' : 'PASS', JSON.stringify(info.layout));
  save('offline-smoke-log.json', {console: log.console, pageErrors: log.pageErrors, requests: log.requests, failed: log.failed});
} finally {
  await session?.close();
  server.stop();
}
save('offline-smoke-results.json', results);
process.exit(results.every((r) => r.status === 'PASS') ? 0 : 1);
