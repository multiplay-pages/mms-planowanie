// Baseline for the comparison: the CURRENT planner map (MAP-08 code on main, WITHOUT the untracked rich pack = what a fresh clone shows).
// Local only: the planner runs offline on 127.0.0.1; no external request is expected.
import {spawn} from 'node:child_process';
import path from 'node:path';
import {launch, shot, save, check, results, POC_DIR} from './common.mjs';
const PORT = 8766, URL = `http://127.0.0.1:${PORT}/`;
const server = spawn('python', ['-X', 'utf8', path.join(POC_DIR, '..', 'map05', 'serve.py'), '--port', String(PORT)], {stdio: 'ignore', cwd: path.join(POC_DIR, '..')});
let s;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  for (const [w, h] of [[1920, 1080], [1366, 768]]) {
    s = await launch({width: w, height: h});
    const {page, log} = s;
    await page.goto(URL, {waitUntil: 'load', timeout: 120000});
    await page.waitForSelector('#planner:not([hidden])', {timeout: 120000});
    await page.fill('#planning-date', '2026-11-19'); await page.dispatchEvent('#planning-date', 'change');
    await page.click('#generate'); await page.waitForTimeout(3500);
    const status = await page.textContent('#op-status').catch(() => null);
    await page.locator('#op-map-shell').scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, `old-map/${w}x${h}-planner-viewport.png`);
    const box = await page.locator('#op-map-shell').boundingBox().catch(() => null);
    if (box) {
      await page.locator('#op-map-shell').screenshot({path: path.join(process.env.MAP09_OUT, `old-map/${w}x${h}-op-map.png`)});
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(250); }
      await page.waitForTimeout(2500);
      await page.locator('#op-map-shell').screenshot({path: path.join(process.env.MAP09_OUT, `old-map/${w}x${h}-op-map-zoomed-out.png`)});
    }
    save(`old-map/${w}x${h}-info.json`, {status, box, external: log.external, errors: log.console.filter((m) => m.type === 'error'), pageErrors: log.pageErrors});
    check(`B-${w}x${h}`, `baseline MAP-08 bez pakietu (${w}×${h}) uchwycony lokalnie`, box && log.external.length === 0 ? 'PASS' : 'FAIL', JSON.stringify({status, external: log.external.length}));
    await s.close();
  }
} catch (e) { check('X', 'old-map', 'FAIL', String(e)); } finally { server.kill(); save('old-map-results.json', results); }
