// QA helpers for the MAP-09 demonstrator. Real Chrome through playwright-core (installed in the local E2E folder, not in the repo).
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const POC_DIR = path.resolve(HERE, '..');
export const E2E = process.env.MAP09_E2E_DIR || 'C:/Users/lcichanowicz/AppData/Local/mms-e2e';
export const CHROME = process.env.MAP09_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const PORT = Number(process.env.MAP09_PORT || 8765);
export const URL_BASE = `http://127.0.0.1:${PORT}/`;
export const OUT = process.env.MAP09_OUT || path.resolve(POC_DIR, '..', 'evidence', 'map09');
fs.mkdirSync(OUT, {recursive: true});

export async function loadChromium() {
  const mod = await import(pathToFileURL(path.join(E2E, 'node_modules', 'playwright-core', 'index.mjs')).href);
  return mod.chromium ?? mod.default.chromium;
}

export function startServer() {
  const child = spawn('python', ['-X', 'utf8', path.join(POC_DIR, 'serve_poc.py'), '--port', String(PORT)], {stdio: 'ignore'});
  return {stop: () => child.kill()};
}

export async function waitForServer(timeoutMs = 8000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { const r = await fetch(URL_BASE); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('PoC server did not start');
}

/** Real Chrome (not bundled Chromium). Records every request, console message and page error. */
export async function launch({width = 1920, height = 1080, args = []} = {}) {
  const chromium = await loadChromium();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'map09-profile-'));
  const ctx = await chromium.launchPersistentContext(dir, {
    executablePath: CHROME, headless: !process.env.HEADED, viewport: {width, height}, deviceScaleFactor: 1,
    args: ['--no-first-run', '--no-default-browser-check', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...args],
  });
  const log = {console: [], pageErrors: [], requests: [], failed: [], external: []};
  ctx.on('request', (r) => {
    const u = r.url();
    log.requests.push({method: r.method(), url: u.length > 220 ? `${u.slice(0, 220)}…` : u});
    if (!/^(http:\/\/127\.0\.0\.1:\d+\/|data:|blob:|about:)/.test(u)) log.external.push(u);
  });
  ctx.on('requestfailed', (r) => log.failed.push({url: r.url(), error: r.failure()?.errorText}));
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('console', (m) => log.console.push({type: m.type(), text: m.text()}));
  page.on('pageerror', (e) => log.pageErrors.push(String(e)));
  return {ctx, page, log, close: async () => { await ctx.close(); fs.rmSync(dir, {recursive: true, force: true}); }};
}

export function save(name, data) {
  const file = path.join(OUT, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return file;
}

export async function shot(page, name, {fullPage = false} = {}) {
  const file = path.join(OUT, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  await page.screenshot({path: file, fullPage});
  return file;
}

export async function waitIdle(page, timeout = 45000) {
  await page.waitForFunction(() => { const m = globalThis.__map09?.map; return m && m.loaded() && !m.isMoving() && m.areTilesLoaded(); }, null, {timeout});
  await page.waitForTimeout(400);
}

export const results = [];
export function check(id, name, status, evidence) {
  results.push({id, name, status, evidence});
  console.log(`${status.padEnd(8)} ${id} ${name}${evidence ? ` — ${evidence}` : ''}`);
}
