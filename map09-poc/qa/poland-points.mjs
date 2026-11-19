// Light follow-up (online, ~100 tiles): point legibility in the whole-Poland view after enlarging low-zoom icons.
import {startServer, waitForServer, launch, URL_BASE, shot, check, results, save, waitIdle} from './common.mjs';
const server = startServer();
let s;
try {
  await waitForServer();
  s = await launch({width: 1366, height: 768});
  const {page} = s;
  await page.goto(URL_BASE); await page.waitForFunction(() => document.documentElement.dataset.mapReady === 'true');
  await page.click('#enable-online'); await page.waitForFunction(() => __map09.state.styleLoaded, null, {timeout: 40000}); await waitIdle(page);
  for (const style of ['positron', 'liberty']) {
    await page.check(`input[name="style"][value="${style}"]`);
    await page.waitForFunction((v) => __map09.state.style === v && __map09.state.styleLoaded && !__map09.state.pending, style, {timeout: 30000});
    await page.click('[data-place="polska"]'); await waitIdle(page);
    const n = await page.evaluate(() => ({pts: __map09.renderedPointCount(), zoom: __map09.map.getZoom()}));
    await shot(page, `poland-points/${style}-1366x768.png`);
    // measure icon size in CSS px from a rendered Warszawa point
    const size = await page.evaluate(() => { const l = __map09.map.getLayoutProperty('demo-points', 'icon-size'); return {expr: JSON.stringify(l)}; });
    check(`V-${style}`, `1366×768, widok Polski (${style}): punkty widoczne`, n.pts >= 4 ? 'PASS' : 'FAIL', JSON.stringify({...n, ...size}));
  }
} catch (e) { check('X', 'poland-points', 'FAIL', String(e)); } finally { await s?.close(); server.stop(); save('poland-points-results.json', results); }
process.exit(results.every((r) => r.status === 'PASS') ? 0 : 1);
