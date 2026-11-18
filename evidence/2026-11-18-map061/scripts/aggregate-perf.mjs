// Usage: node aggregate-perf.mjs <directory with map061-perf-{before,after}-{1,2,3}.json>
// Prints the median (and min–max range) of every measure over the three interleaved runs of each variant.
import fs from 'node:fs';

const dir = process.argv[2] ?? '.';
const get = (tag) => [1, 2, 3].map((r) => JSON.parse(fs.readFileSync(`${dir}/map061-perf-${tag}-${r}.json`, 'utf8')));
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const rows = [
  ['Planer widoczny [ms]', (r) => r.plannerVisibleMs],
  ['Pierwsza bezczynna mapa [ms]', (r) => r.firstIdleMs],
  ['Start: najdłuższe zadanie [ms]', (r) => r.startup.longTasks.maxMs],
  ['Start: suma długich zadań [ms]', (r) => r.startup.longTasks.totalMs],
  ['Start: sterta JS [MB]', (r) => r.startup.heapMB],
  ['Start: pamięć prywatna procesów [MB]', (r) => r.startup.process.privateMB],
  ['Wycieczka (10 widoków): najgorsza klatka [ms]', (r) => r.tourSummary.worstFrameMs],
  ['Wycieczka: klatki >50 ms', (r) => r.tourSummary.framesOver50ms],
  ['Wycieczka: suma długich zadań [ms]', (r) => r.tourSummary.longTaskTotalMs],
  ['Wycieczka: mediana do bezczynności [ms]', (r) => r.tourSummary.medianIdleMs],
  ['60 zmian widoku: mediana do bezczynności [ms]', (r) => r.manyViews.medianIdleMs],
  ['60 zmian widoku: p95 [ms]', (r) => r.manyViews.p95IdleMs],
  ['60 zmian widoku: długie zadania [ms]', (r) => r.manyViews.longTasks.totalMs],
  ['Interakcje planera: mediana opóźnienia [ms]', (r) => r.interactionSummary.medianLatencyMs],
  ['Interakcje planera: maks. opóźnienie [ms]', (r) => r.interactionSummary.maxLatencyMs],
  ['Sterta JS: szczyt (główny wątek) [MB]', (r) => r.peakHeapMB],
  ['Po wycieczce: sterta JS [MB]', (r) => r.afterTour.heapMB],
  ['Po wycieczce: pamięć prywatna procesów [MB]', (r) => r.afterTour.process.privateMB],
  ['Koniec: sterta JS [MB]', (r) => r.final.heapMB],
  ['Koniec: pamięć prywatna procesów [MB]', (r) => r.final.process.privateMB],
  ['Koniec: working set procesów [MB]', (r) => r.final.process.workingSetMB],
  ['Długie zadania razem: liczba', (r) => r.final.longTasksTotal.count],
  ['Długie zadania razem: suma [ms]', (r) => r.final.longTasksTotal.totalMs],
  ['Długie zadania: maks. [ms]', (r) => r.final.longTasksTotal.maxMs],
];
const before = get('before'), after = get('after');
const range = (x) => `${Math.min(...x)}–${Math.max(...x)}`;
let out = '| Miara | PRZED: mediana (zakres) | PO: mediana (zakres) |\n| --- | --- | --- |\n';
for (const [name, pick] of rows) {
  const b = before.map(pick), a = after.map(pick);
  out += `| ${name} | ${med(b)} (${range(b)}) | ${med(a)} (${range(a)}) |\n`;
}
console.log(out);
console.log('błędy strony:', JSON.stringify([...before, ...after].map((r) => r.final.pageErrors)), '· przekroczony czas interakcji:', JSON.stringify([...before, ...after].map((r) => r.interactionSummary.timedOut)));
