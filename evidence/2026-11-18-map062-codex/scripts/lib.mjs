import { chromium } from './guard.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const EVID = process.env.EVID || path.resolve('evidence-out');
fs.mkdirSync(EVID, { recursive: true });
const clean=value=>JSON.parse(JSON.stringify(value).replaceAll(path.resolve('.').replaceAll('\\','/'),'<repo>').replaceAll(path.resolve('.').replaceAll('\\','\\\\'),'<repo>'));

export async function launch({ width = 1440, height = 900, profile, mobile = false, downloadsPath } = {}) {
  const userDataDir = profile || fs.mkdtempSync(path.join(os.tmpdir(), 'mms-profile-'));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    executablePath: CHROME,
    headless: process.env.HEADED ? false : true,
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: mobile,
    acceptDownloads: true,
    downloadsPath,
    args: ['--no-first-run', '--no-default-browser-check', ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(' ') : [])],
  });
  const log = { console: [], pageErrors: [], requests: [], failed: [], external: [] };
  ctx.on('request', (r) => {
    const u = r.url();
    log.requests.push({ method: r.method(), url: u.length > 200 ? u.slice(0, 200) + '…' : u });
    if (!/^(http:\/\/127\.0\.0\.1:8771\/|file:|data:|blob:|about:)/.test(u)) log.external.push(u);
  });
  ctx.on('requestfailed', (r) => log.failed.push({ url: r.url(), error: r.failure()?.errorText }));
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('console', (m) => log.console.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => log.pageErrors.push(String(e)));
  return { ctx, page, log, userDataDir };
}

export function save(name, data) {
  fs.writeFileSync(path.join(EVID, name), typeof data === 'string' ? data : JSON.stringify(clean(data), null, 2));
}

export async function shot(page, name, opts = {}) {
  await page.screenshot({ path: path.join(EVID, name), ...opts });
}

export async function ready(page, url = 'http://127.0.0.1:8771/') {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForSelector('#planner:not([hidden])', { timeout: 180000 });
  return Date.now() - t0;
}
