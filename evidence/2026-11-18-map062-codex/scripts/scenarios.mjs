// Real-Chrome scenario run for MMS Planowanie 2.0 (map05 planner).
// Usage: node scenarios.mjs [url] [tag]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { launch, ready, shot, save, EVID } from './lib.mjs';

const URL_ = process.argv[2] || 'http://127.0.0.1:8771/';
const TAG = process.argv[3] || 'served';
const results = [];
const record = (id, title, expected, actual, status, evidence = []) => {
  results.push({ id, title, expected, actual, status, evidence });
  console.log(`[${status}] ${id} ${title}\n   expected: ${expected}\n   actual:   ${actual}`);
};
const getPlan = (page) => page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('mms-map05-plan')); return k ? JSON.parse(localStorage.getItem(k)) : null; });
const msg = (page) => page.evaluate(() => { const m = document.querySelector('#message'); return m.hidden ? '' : `${m.className}: ${m.textContent}`; });
const viewBox = (page) => page.getAttribute('#planner-map', 'viewBox');
const mapStats = (page) => page.evaluate(() => ({
  viewBox: document.querySelector('#planner-map').getAttribute('viewBox'),
  roads: document.querySelectorAll('#planner-map [data-feature]').length,
  roadLabels: document.querySelectorAll('#planner-map .map-road-label').length,
  townLabels: [...document.querySelectorAll('#planner-map .map-town-label')].map((t) => t.textContent).slice(0, 12),
  markers: document.querySelectorAll('#planner-map .map-marker').length,
  routes: document.querySelectorAll('#planner-map .basket-route').length,
}));
const timed = async (page, fn) => { const t = await page.evaluate(() => performance.now()); await fn(); return page.evaluate((t0) => new Promise((r) => requestAnimationFrame(() => r(Math.round(performance.now() - t0)))), t); };

const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-dl-'));
const { ctx, page, log } = await launch({ downloadsPath: dl });
const loadMs = await ready(page, URL_);
page.on('dialog', (d) => d.dismiss());

// ---------- S1 desktop overview ----------
try {
  const s = await page.evaluate(() => ({
    queue: document.querySelector('#queue-count').textContent,
    located: document.querySelector('#located-count').textContent,
    review: [...document.querySelectorAll('#location-review button')].map((b) => b.textContent.slice(0, 80)),
    markers: document.querySelectorAll('#planner-map .map-marker').length,
    dashed: document.querySelectorAll('#planner-map .map-marker.postcode-note').length,
  }));
  const unlocated = s.review.filter((t) => /nieustal|brak|Brak/i.test(t)).length;
  await shot(page, `S1-${TAG}-desktop-full.png`, { fullPage: true });
  await page.locator('#planner-map').screenshot({ path: path.join(EVID, `S1-${TAG}-map-overview.png`) });
  const ok = s.queue === '109' && s.markers === 102 && s.dashed === 6 && s.review.length === 13;
  record('S1', 'Desktop: kolejka, koszyki, 102 punkty, 7 nieustalonych i 6 uwag PNA jawne',
    'kolejka 109, 102 markery, 6 przerywanych, panel uwag 13 (7+6), brak błędów konsoli',
    `kolejka ${s.queue}; markery ${s.markers}; przerywane ${s.dashed}; panel uwag ${s.review.length} (wpisy z „brak/nieustal”: ${unlocated}); load ${loadMs} ms`,
    ok ? 'PASS' : 'FAIL', [`S1-${TAG}-desktop-full.png`, `S1-${TAG}-map-overview.png`]);
  save(`S1-${TAG}-review-panel.json`, s);
} catch (e) { record('S1', 'Desktop overview', '-', String(e), 'FAIL'); }

// ---------- S2 address outside Opole, zoom/pan ----------
try {
  await page.fill('#queue-search', 'Knurów');
  await page.waitForTimeout(200);
  const first = page.locator('#queue-list .order').first();
  const id = await first.getAttribute('data-order');
  await first.click();
  const tSel = await timed(page, () => page.click('[data-map="selected"]'));
  const atSel = await mapStats(page);
  const halo = await page.evaluate(() => { const svg = document.querySelector('#planner-map').getBoundingClientRect(); return [...document.querySelectorAll('#planner-map text')].map((t) => { const b = t.getBoundingClientRect(); return { cls: t.getAttribute('class') || 'scale', ve: getComputedStyle(t).vectorEffect, wide: b.width > svg.width * 0.6 }; }); });
  const haloOk = halo.every((h) => h.ve === 'non-scaling-stroke' && !h.wide);
  await page.locator('#planner-map').screenshot({ path: path.join(EVID, `S2-${TAG}-selected-knurow.png`) });
  const tIn = await timed(page, () => page.click('[data-map="in"]'));
  const atIn = await mapStats(page);
  // drag pan
  const box = await page.locator('#planner-map').boundingBox();
  const vb0 = await viewBox(page);
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2 + 120, box.y + box.height * 0.25 + 40, { steps: 8 });
  await page.mouse.up();
  const vb1 = await viewBox(page);
  const tOut = await timed(page, async () => { for (let i = 0; i < 6; i++) await page.click('[data-map="out"]'); });
  const atOut = await mapStats(page);
  await page.locator('#planner-map').screenshot({ path: path.join(EVID, `S2-${TAG}-zoomed-out-panned.png`) });
  // wheel zoom over map
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(150);
  const scrollAfter = await page.evaluate(() => scrollY);
  await page.fill('#queue-search', '');
  const tAll = await timed(page, () => page.click('[data-map="all"]'));
  const atAll = await mapStats(page);
  const labelsLocal = atSel.townLabels.some((t) => /Knur/i.test(t)) || atSel.roadLabels > 0;
  const ok = haloOk && atSel.roads > 0 && labelsLocal && vb0 !== vb1 && atAll.viewBox === '0 0 680 380' && atAll.markers === 102;
  record('S2', `Adres poza Opolem (${id}, Knurów): wybrany adres, przybliżenie, przesunięcie, powrót do całego zakresu`,
    'po „Wybrany adres” lokalne ulice i etykiety Knurowa; przeciąganie zmienia widok; „Cały zakres” = 0 0 680 380 i 102 punkty; czasy reakcji < 1 s',
    `obwódki tekstów: ${haloOk ? 'stała szerokość ekranowa' : 'BŁĄD ' + JSON.stringify(halo.slice(0, 4))}; wybrany: ${atSel.roads} odcinków, ${atSel.roadLabels} nazw ulic, miasta ${JSON.stringify(atSel.townLabels)} (${tSel} ms); +: ${atIn.roads} odc. (${tIn} ms); przeciąganie ${vb0} → ${vb1}; 6×−: ${atOut.roads} odc. (${tOut} ms); kółko: scrollY ${scrollBefore}→${scrollAfter}; cały zakres: ${atAll.viewBox}, ${atAll.markers} punktów (${tAll} ms)`,
    ok ? 'PASS' : 'FAIL', [`S2-${TAG}-selected-knurow.png`, `S2-${TAG}-zoomed-out-panned.png`]);
} catch (e) { record('S2', 'Adres poza Opolem', '-', String(e), 'FAIL'); }

// ---------- S3 day/capacity/type/scope + generate ----------
try {
  await page.fill('#planning-date', '2026-11-19');
  await page.dispatchEvent('#planning-date', 'change');
  const qBefore = await page.textContent('#queue-count');
  // Close one slot of TEST-01 before generation (capacity change)
  await page.uncheck('[data-availability="TEST-01"][data-slot="2"]');
  const slotsMetric = await page.evaluate(() => document.querySelector('#metrics').innerText.split('\n').slice(4, 6).join(' '));
  await page.selectOption('#kind-filter', 'MPL');
  const mplCount = await page.textContent('#queue-count');
  await page.selectOption('#kind-filter', 'ALL');
  await page.fill('#queue-search', 'TEST-01');
  const searchCount = await page.textContent('#queue-count');
  await page.fill('#queue-search', '');
  const cities = await page.$$eval('#city-filter option', (o) => o.length);
  const tGen = await timed(page, () => page.click('#generate'));
  const m = await msg(page);
  const plan = await getPlan(page);
  const onDay = plan.assignments.filter((a) => a.date === '2026-11-19');
  const t01closed = onDay.some((a) => a.teamId === 'TEST-01' && a.start === 2);
  const reasons = await page.$$eval('#queue-list .order .reason', (r) => { const c = {}; r.forEach((x) => { c[x.textContent] = (c[x.textContent] || 0) + 1; }); return c; });
  const qAfter = await page.textContent('#queue-count');
  // date switch keeps queue independent
  await page.fill('#planning-date', '2026-11-18');
  await page.dispatchEvent('#planning-date', 'change');
  const qOther = await page.textContent('#queue-count');
  await page.fill('#planning-date', '2026-11-19');
  await page.dispatchEvent('#planning-date', 'change');
  await shot(page, `S3-${TAG}-after-generate.png`, { fullPage: true });
  save(`S3-${TAG}-reasons.json`, { reasons, onDay, message: m });
  const ok = onDay.length > 0 && !t01closed && Object.keys(reasons).length > 0 && qAfter === qOther;
  record('S3', 'Dzień 19.11, wyłączony slot TEST-01 14–17, filtry typu/wyszukiwanie, generowanie',
    'generator nie używa wyłączonego slotu; kolejka niezależna od dnia; powody nieprzydzielenia widoczne przy zleceniach',
    `kolejka przed ${qBefore}; sloty: ${slotsMetric}; MPL ${mplCount}; szukaj TEST-01 → ${searchCount}; miejscowości ${cities - 1}; po generowaniu ${onDay.length} przydziałów (${tGen} ms), kolejka ${qAfter} (na 18.11: ${qOther}); TEST-01 slot 3 użyty: ${t01closed}; ${Object.keys(reasons).length} różnych powodów; komunikat: ${m.slice(0, 160)}`,
    ok ? 'PASS' : 'FAIL', [`S3-${TAG}-after-generate.png`, `S3-${TAG}-reasons.json`]);
} catch (e) { record('S3', 'Generowanie', '-', String(e), 'FAIL'); }

// ---------- S4 basket map ----------
try {
  const plan = await getPlan(page);
  const counts = {};
  plan.assignments.filter((a) => a.date === '2026-11-19').forEach((a) => { counts[a.teamId] = (counts[a.teamId] || 0) + 1; });
  const team = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const t = await timed(page, () => page.click(`#map-basket-${team}`));
  const st = await mapStats(page);
  const summary = await page.textContent('#route-summary');
  const checks = await page.locator(`section.basket[aria-label="Koszyk ${team}"] .road-checks`).innerText();
  await page.locator('#planner-map').screenshot({ path: path.join(EVID, `S4-${TAG}-basket-${team}.png`) });
  // R3: move the basket view away from its visits, then switch the day; the map must refit to the chosen day.
  // Without the fix the panned-away viewport is kept, so this check is discriminating.
  await page.focus('#planner-map');
  for (let i = 0; i < 4; i++) await page.keyboard.press('+');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
  const awayBefore = await page.evaluate(() => { const [l, t, w, h] = document.querySelector('#planner-map').getAttribute('viewBox').split(' ').map(Number); return [...document.querySelectorAll('#planner-map .map-marker')].filter((m) => { const x = +m.getAttribute('cx'), y = +m.getAttribute('cy'); return x >= l && x <= l + w && y >= t && y <= t + h; }).length; });
  results.r3away = awayBefore;
  await page.fill('#planning-date', '2026-11-18'); await page.dispatchEvent('#planning-date', 'change');
  await page.fill('#planning-date', '2026-11-19'); await page.dispatchEvent('#planning-date', 'change');
  const inside = await page.evaluate(() => { const [l, t, w, h] = document.querySelector('#planner-map').getAttribute('viewBox').split(' ').map(Number); return [...document.querySelectorAll('#planner-map .map-marker')].map((m) => { const x = +m.getAttribute('cx'), y = +m.getAttribute('cy'); return x >= l && x <= l + w && y >= t && y <= t + h; }); });
  results.r3 = inside;
  await page.locator(`section.basket[aria-label="Koszyk ${team}"]`).screenshot({ path: path.join(EVID, `S4-${TAG}-basket-${team}-card.png`) });
  const ok = st.routes > 0 && st.markers === counts[team] && /→/.test(summary) && !/0 km/.test(summary.replace(/\d0 km/g, '')) && awayBefore === 0 && inside.length === counts[team] && inside.every(Boolean);
  record('S4', `Mapa koszyka ${team}`,
    'trasa ze znanych odcinków, kolejność wizyt, wyniki 30 km/+10 km/okien; brak dorysowanych prostych i „0 km” dla braków',
    `${st.routes} odcinków trasy, ${st.markers} markerów (koszyk ${counts[team]}); ${t} ms; po przybliżeniu i przesunięciu w bok w widoku ${awayBefore} markerów; po zmianie dnia 19→18→19 markery w widoku: ${JSON.stringify(inside)}; podsumowanie: ${summary.slice(0, 260)}; kontrole: ${checks.replace(/\n/g, ' | ')}`,
    ok ? 'PASS' : 'FAIL', [`S4-${TAG}-basket-${team}.png`, `S4-${TAG}-basket-${team}-card.png`]);
} catch (e) { record('S4', 'Mapa koszyka', '-', String(e), 'FAIL'); }

// ---------- S5 move / remove / undo / taken slot ----------
try {
  const date = '2026-11-19';
  // capacity increase: re-open TEST-01 14–17 closed in S3
  await page.check('[data-availability="TEST-01"][data-slot="2"]');
  const reopened = await msg(page);
  const freeAfterReopen = await page.evaluate(() => document.querySelector('#metrics').innerText.split('\n')[4]);
  let plan = await getPlan(page);
  const auto = plan.assignments.find((a) => a.date === date && a.origin === 'AUTO' && a.teamId !== 'TEST-01');
  await page.locator(`#baskets button[data-order="${auto.orderId}"]`).first().click();
  const attempts = [];
  let moved = null;
  // try to move the auto visit into the freshly opened TEST-01 slot (only if qualified), else to another day
  for (const [team, slot, day] of [['TEST-01', '2', date], ['TEST-05', '2', date], ['TEST-02', '0', '2026-11-20'], ['TEST-04', '0', '2026-11-20'], ['TEST-03', '0', '2026-11-20']]) {
    await page.selectOption('#assignment-team', team);
    await page.fill('#assignment-date', day);
    await page.selectOption('#assignment-slot', slot);
    const beforeTry = JSON.stringify(await getPlan(page));
    await page.click('#assign-order');
    const after = await getPlan(page);
    const a = after.assignments.find((x) => x.orderId === auto.orderId);
    const m = await msg(page);
    attempts.push(`${team}/${day}/${slot}: ${m.slice(0, 120)}`);
    if (a && a.teamId === team && a.start === Number(slot) && a.date === day) { moved = { team, slot, day, origin: a.origin }; break; }
    if (JSON.stringify(after) !== beforeTry) { moved = { partial: true }; break; }
  }
  const moveMsg = await msg(page);
  await shot(page, `S5-${TAG}-after-move.png`, { fullPage: false });
  // undo the move
  await page.click('#undo');
  plan = await getPlan(page);
  const undone = plan.assignments.find((x) => x.orderId === auto.orderId);
  // remove (back to queue)
  await page.click(`#baskets button[data-order="${auto.orderId}"]`);
  await page.click('#remove-order');
  plan = await getPlan(page);
  const removed = !plan.assignments.some((x) => x.orderId === auto.orderId) && plan.manualExclusions.some((x) => x.orderId === auto.orderId && x.date === date);
  const inQueue = await page.locator(`#queue-list [data-order="${auto.orderId}"]`).count();
  const includeBtn = await page.locator('#include-auto').count();
  await page.click('#undo');
  plan = await getPlan(page);
  const back = plan.assignments.find((x) => x.orderId === auto.orderId);
  // taken slot: try to disable an occupied slot
  const occ = plan.assignments.find((a) => a.date === date);
  const before = JSON.stringify(plan);
  await page.uncheck(`[data-availability="${occ.teamId}"][data-slot="${occ.start}"]`).catch(() => {});
  const takenMsg = await msg(page);
  const stillChecked = await page.isChecked(`[data-availability="${occ.teamId}"][data-slot="${occ.start}"]`);
  const unchanged = JSON.stringify(await getPlan(page)) === before;
  // invalid manual assign (occupied slot) must not partially change plan
  const other = plan.assignments.find((a) => a.date === date && a.orderId !== occ.orderId && a.teamId !== occ.teamId);
  let atomic = 'nie sprawdzono';
  if (other) {
    await page.click(`#baskets button[data-order="${other.orderId}"]`);
    await page.selectOption('#assignment-team', occ.teamId).catch(() => {});
    await page.selectOption('#assignment-slot', String(occ.start));
    const b2 = JSON.stringify(await getPlan(page));
    await page.click('#assign-order');
    const err2 = await msg(page);
    atomic = (JSON.stringify(await getPlan(page)) === b2 ? 'plan bez zmian' : 'PLAN ZMIENIONY') + ` · ${err2.slice(0, 140)}`;
  }
  const ok = moved && !moved.partial && undone.teamId === auto.teamId && undone.start === auto.start && removed && inQueue === 1 && back && stillChecked && unchanged && /bez zmian/.test(atomic) && /error/.test(takenMsg) && /Nie można wyłączyć okna/.test(takenMsg);
  record('S5', 'Przeniesienie automatu, cofnięcie, powrót do kolejki, cofnięcie, wyłączenie zajętego slotu, błędny przydział',
    'przeniesienie zapisuje MANUAL; cofnięcie przywraca; usunięcie → kolejka + wykluczenie dnia; zajęty slot nie wyłącza się; błędna operacja nie zmienia planu',
    `otwarcie TEST-01 14–17: ${reopened.slice(0, 60)}, wolne/otwarte ${freeAfterReopen}; zlecenie ${auto.orderId} ${auto.teamId}/${auto.start} → ${JSON.stringify(moved)} (próby: ${attempts.join(' ; ')}); cofnięcie → ${undone?.teamId}/${undone?.start}; usunięcie: ${removed}, w kolejce ${inQueue}, przycisk włączenia generatora ${includeBtn}; cofnięcie → ${back?.teamId}/${back?.start}; zajęty slot: zaznaczony=${stillChecked}, plan bez zmian=${unchanged}, ${takenMsg.slice(0, 140)}; błędny przydział: ${atomic}`,
    ok ? 'PASS' : 'FAIL', [`S5-${TAG}-after-move.png`]);
} catch (e) { record('S5', 'Ręczna korekta', '-', String(e), 'FAIL'); }

// ---------- S6 confirm / regenerate / protection / release ----------
try {
  const date = '2026-11-19';
  let plan = await getPlan(page);
  const target = plan.assignments.find((a) => a.date === date);
  await page.click(`#baskets button[data-order="${target.orderId}"]`);
  await page.click('#confirm-order');
  plan = await getPlan(page);
  const confirmed = plan.assignments.find((a) => a.orderId === target.orderId).confirmed;
  await page.click('#generate');
  plan = await getPlan(page);
  const kept = plan.assignments.find((a) => a.orderId === target.orderId);
  await page.click(`#baskets button[data-order="${target.orderId}"]`);
  const assignDisabled = await page.isDisabled('#assign-order');
  const removeDisabled = await page.isDisabled('#remove-order');
  await page.click('#release-order');
  const noReason = await msg(page);
  plan = await getPlan(page);
  const stillConfirmed = plan.assignments.find((a) => a.orderId === target.orderId).confirmed;
  await page.fill('#release-reason', 'Test przeglądarki S6');
  await page.click('#release-order');
  plan = await getPlan(page);
  const released = plan.assignments.find((a) => a.orderId === target.orderId);
  await shot(page, `S6-${TAG}-released.png`);
  // re-confirm for later export check
  await page.click(`#baskets button[data-order="${target.orderId}"]`);
  await page.click('#confirm-order');
  const ok = confirmed && kept?.confirmed && kept.teamId === target.teamId && kept.start === target.start && assignDisabled && removeDisabled && /error/.test(noReason) && stillConfirmed && !released.confirmed && released.releaseReason === 'Test przeglądarki S6';
  record('S6', 'Potwierdzenie okna, regeneracja, ochrona, zwolnienie z powodem',
    'potwierdzone okno przetrwa regenerację; przenieś/usuń zablokowane; zwolnienie bez powodu odrzucone, z powodem zapisane',
    `${target.orderId}: potwierdzone=${confirmed}; po regeneracji ${kept?.teamId}/${kept?.start} confirmed=${kept?.confirmed}; przyciski przenieś/usuń disabled=${assignDisabled}/${removeDisabled}; bez powodu: ${noReason.slice(0, 110)}; nadal potwierdzone=${stillConfirmed}; po powodzie confirmed=${released.confirmed}, reason="${released.releaseReason}", origin=${released.origin}`,
    ok ? 'PASS' : 'FAIL', [`S6-${TAG}-released.png`]);
} catch (e) { record('S6', 'Potwierdzenia', '-', String(e), 'FAIL'); }

// ---------- S7 JSON download / import in clean profile / reload ----------
let exportPath = null;
try {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save-plan')]);
  exportPath = path.join(EVID, `S7-${TAG}-${download.suggestedFilename()}`);
  await download.saveAs(exportPath);
  const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  const current = await getPlan(page);
  const same = JSON.stringify(exported) === JSON.stringify(current);
  // reload persistence
  await page.reload();
  await page.waitForSelector('#planner:not([hidden])');
  const afterReload = await getPlan(page);
  const basketsAfterReload = await page.$$eval('#baskets button[data-order]', (b) => b.length);
  // clean second profile, import
  const second = await launch({});
  await ready(second.page, URL_);
  const emptyBefore = (await getPlan(second.page))?.assignments?.length ?? 0;
  await second.page.setInputFiles('#load-plan', exportPath);
  await second.page.waitForTimeout(300);
  const importMsg = await msg(second.page);
  const imported = await getPlan(second.page);
  await second.page.fill('#planning-date', '2026-11-19');
  await second.page.dispatchEvent('#planning-date', 'change');
  await shot(second.page, `S7-${TAG}-imported-clean-profile.png`);
  // bad file
  const bad = path.join(dl, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ ...exported, datasetId: 'x' }));
  await second.page.setInputFiles('#load-plan', bad);
  await second.page.waitForTimeout(200);
  const badMsg = await msg(second.page);
  const unchangedAfterBad = JSON.stringify(await getPlan(second.page)) === JSON.stringify(imported);
  // Merge the complete log of the clean import profile so S10 covers both browser profiles.
  log.external.push(...second.log.external);
  log.pageErrors.push(...second.log.pageErrors.map((e) => `[profil importu] ${e}`));
  log.failed.push(...second.log.failed.map((f) => ({ ...f, profile: 'import' })));
  log.console.push(...second.log.console.map((c) => ({ ...c, profile: 'import' })));
  log.requests.push(...second.log.requests.map((r) => ({ ...r, profile: 'import' })));
  await second.ctx.close();
  const ok = same && JSON.stringify(afterReload) === JSON.stringify(current) && emptyBefore === 0 && JSON.stringify(imported) === JSON.stringify(exported) && /error/.test(badMsg) && unchangedAfterBad;
  record('S7', 'Rzeczywiste pobranie JSON, import w czystym profilu, odświeżenie',
    'plik pobrany = stan planu; po odświeżeniu plan zachowany; import w czystym profilu odtwarza plan; plik z innym datasetId odrzucony bez zmian',
    `pobrano ${path.basename(exportPath)} (${fs.statSync(exportPath).size} B), zgodny=${same}; po reload zgodny=${JSON.stringify(afterReload) === JSON.stringify(current)} (${basketsAfterReload} przycisków w koszykach); czysty profil: ${emptyBefore} przydziałów → import ${imported?.assignments?.length} (${importMsg.slice(0, 90)}); zły plik: ${badMsg.slice(0, 90)}, bez zmian=${unchangedAfterBad}`,
    ok ? 'PASS' : 'FAIL', [path.basename(exportPath), `S7-${TAG}-imported-clean-profile.png`]);
} catch (e) { record('S7', 'JSON', '-', String(e), 'FAIL'); }

// ---------- S9 keyboard (desktop) ----------
try {
  await page.goto(URL_); await page.waitForSelector('#planner:not([hidden])');
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => document.activeElement.textContent.trim());
  await page.keyboard.press('Enter');
  const skipTarget = await page.evaluate(() => document.activeElement.id || location.hash);
  // tab to first queue order
  await page.focus('#queue-search');
  let order = null;
  for (let i = 0; i < 5 && !order; i++) { await page.keyboard.press('Tab'); order = await page.evaluate(() => document.activeElement.dataset.order || null); }
  await page.keyboard.press('Shift+Tab');
  const back = await page.evaluate(() => document.activeElement.id);
  // select second order via keyboard and check focus stays
  await page.focus('#queue-list .order:nth-child(2)');
  await page.keyboard.press('Enter');
  const after = await page.evaluate(() => ({ focus: document.activeElement.dataset.order, pressed: document.activeElement.getAttribute('aria-pressed'), title: document.querySelector('#order-title').textContent }));
  // map keys
  await page.focus('#planner-map');
  const v0 = await viewBox(page);
  await page.keyboard.press('+'); const v1 = await viewBox(page);
  await page.keyboard.press('ArrowLeft'); const v2 = await viewBox(page);
  await page.keyboard.press('-'); await page.keyboard.press('Home'); const v3 = await viewBox(page);
  // marker via keyboard
  await page.focus('#planner-map .map-marker');
  const mid = await page.evaluate(() => document.activeElement.dataset.order);
  await page.keyboard.press(' ');
  const selected = await page.textContent('#order-title');
  const focusAfterMarker = await page.evaluate(() => document.activeElement.dataset?.order || document.activeElement.id || document.activeElement.tagName);
  // availability checkbox focus retention
  await page.focus('[data-availability="TEST-03"][data-slot="1"]');
  await page.keyboard.press('Space');
  const availFocus = await page.evaluate(() => `${document.activeElement.dataset.availability}/${document.activeElement.dataset.slot}`);
  await page.keyboard.press('Space');
  // R2: keyboard activation of confirm / release keeps focus in the details panel
  await page.fill('#planning-date', '2026-11-19'); await page.dispatchEvent('#planning-date', 'change');
  const r2 = []; let r2msg = '';
  const bo = await page.$('#baskets button[data-order]:not(.locked)');
  if (bo) { await bo.focus(); await page.keyboard.press('Enter');
    await page.focus('#confirm-order'); await page.keyboard.press('Enter'); r2.push('po potwierdzeniu: ' + await page.evaluate(() => document.activeElement.id || document.activeElement.tagName));
    await page.keyboard.type('Test klawiatury'); await page.focus('#release-order'); await page.keyboard.press('Enter'); r2.push('po zwolnieniu: ' + await page.evaluate(() => document.activeElement.id || document.activeElement.tagName));
    await page.focus('#remove-order'); await page.keyboard.press('Enter'); r2.push('po powrocie do kolejki: ' + await page.evaluate(() => document.activeElement.id || document.activeElement.tagName)); r2msg = await msg(page); }
  const r2ok = r2.length === 3 && r2[0].endsWith('release-reason') && r2[1].endsWith('confirm-order') && (r2[2].endsWith('assign-order') || (/error/.test(r2msg) && r2[2].endsWith('remove-order')));
  // reset dialog
  await page.focus('#reset-plan'); await page.keyboard.press('Enter');
  const dialogOpen = await page.evaluate(() => document.querySelector('#reset-dialog').open);
  const dialogFocus = await page.evaluate(() => document.activeElement.id);
  await page.keyboard.press('Escape');
  const dialogClosed = await page.evaluate(() => !document.querySelector('#reset-dialog').open);
  const focusAfterEsc = await page.evaluate(() => document.activeElement.id);
  // visible focus ring check
  await page.focus('#generate');
  const outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow.slice(0, 40)}`; });
  await page.locator('.toolbar').screenshot({ path: path.join(EVID, `S9-${TAG}-focus-generate.png`) });
  const ok = r2ok && order && after.focus && after.title.includes(after.focus) && v1 !== v0 && v2 !== v1 && v3 === '0 0 680 380' && selected.includes(mid) && availFocus === 'TEST-03/1' && dialogOpen && dialogClosed && focusAfterEsc === 'reset-plan';
  record('S9', 'Klawiatura: skip link, Tab/Shift+Tab, Enter/spacja, klawisze mapy, fokus, dialog',
    'pełna obsługa bez myszy; fokus zachowany po renderze; Escape zamyka dialog i wraca na przycisk',
    `pierwszy Tab: "${first}" → ${skipTarget}; Tab do zlecenia ${order}, Shift+Tab → ${back}; Enter na zleceniu: fokus ${after.focus}, aria-pressed=${after.pressed}, szczegóły "${after.title}"; mapa + ${v0}→${v1}, ← →${v2}, Home → ${v3}; spacja na markerze ${mid} → "${selected}", fokus po: ${focusAfterMarker}; checkbox fokus: ${availFocus}; fokus w szczegółach: ${r2.join(', ')} [${r2msg.slice(0, 160)}]; dialog open=${dialogOpen}, fokus w dialogu=${dialogFocus}, Esc zamknięty=${dialogClosed}, fokus po=${focusAfterEsc}; obrys fokusu: ${outline}`,
    ok ? 'PASS' : 'FAIL', [`S9-${TAG}-focus-generate.png`]);
} catch (e) { record('S9', 'Klawiatura', '-', String(e), 'FAIL'); }

// ---------- S8 narrow ----------
try {
  const results8 = [];
  for (const [w, h] of [[390, 844], [768, 1024]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const over = [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1) && !el.closest('.table-scroll') && !el.closest('svg'); }).map((el) => `${el.tagName}.${el.className?.baseVal ?? el.className}#${el.id}`).slice(0, 8);
      const small = [...document.querySelectorAll('button, input, select, a')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.height < 24 || r.width < 24); }).map((el) => `${el.tagName}#${el.id}${el.dataset.map ? '[' + el.dataset.map + ']' : ''}`).slice(0, 10);
      const fontEls = [...document.querySelectorAll('small, .small, .order-sub, .reason, .eyebrow, .tag, .check, label, td, th')].filter((el) => el.getBoundingClientRect().width > 0); const fonts = fontEls.map((el) => parseFloat(getComputedStyle(el).fontSize)).filter(Boolean); const tiny = fontEls.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 11).map((el) => el.tagName + '.' + el.className + ':' + getComputedStyle(el).fontSize).filter((v, i, a) => a.indexOf(v) === i).slice(0, 10);
      return { scrollW: document.documentElement.scrollWidth, innerW: innerWidth, over, small, minFont: Math.min(...fonts), tiny, tableScroll: (() => { const t = document.querySelector('.table-scroll'); return `${t.scrollWidth}/${t.clientWidth}`; })() };
    });
    await shot(page, `S8-${TAG}-${w}x${h}-full.png`, { fullPage: true });
    results8.push({ w, h, ...m });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  save(`S8-${TAG}-narrow.json`, results8);
  const ok = results8.every((r) => r.scrollW <= r.innerW && r.over.length === 0);
  record('S8', 'Wąski ekran 390×844 i 768×1024',
    'brak poziomego przewijania strony, panele pionowo, tabela przewijana w kontenerze, czytelne teksty',
    results8.map((r) => `${r.w}px: scrollWidth ${r.scrollW}/${r.innerW}; wystające ${JSON.stringify(r.over)}; małe cele ${JSON.stringify(r.small)}; min font ${r.minFont}px ${JSON.stringify(r.tiny)}; tabela ${r.tableScroll}`).join(' || '),
    ok ? 'PASS' : 'FAIL', results8.map((r) => `S8-${TAG}-${r.w}x${r.h}-full.png`));
} catch (e) { record('S8', 'Wąski ekran', '-', String(e), 'FAIL'); }

// ---------- S10 console/network ----------
const errs = log.console.filter((c) => ['error', 'warning'].includes(c.type));
record('S10', 'Konsola, błędy strony, żądania sieciowe',
  '0 błędów konsoli i strony, 0 nieudanych żądań, 0 żądań poza 127.0.0.1',
  `konsola error/warning ${errs.length} ${JSON.stringify(errs.slice(0, 5))}; pageerror ${log.pageErrors.length} ${JSON.stringify(log.pageErrors.slice(0, 3))}; failed ${log.failed.length} ${JSON.stringify(log.failed.slice(0, 5))}; zewnętrzne ${log.external.length} ${JSON.stringify(log.external.slice(0, 5))}; wszystkich żądań ${log.requests.length}`,
  errs.length || log.pageErrors.length || log.failed.length || log.external.length ? 'FAIL' : 'PASS');

save(`results-${TAG}.json`, { url: URL_, chrome: ctx.browser()?.version?.() ?? 'persistent', results, log: { console: log.console, pageErrors: log.pageErrors, failed: log.failed, external: log.external, requests: log.requests } });
await ctx.close();
