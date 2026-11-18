# MAP-07B — inteligentne grupowanie instalacji pomiędzy koszykami

Stan: 18.11.2026, gałąź `map07b-cross-basket-optimization` (od `map06-interactive-map`, commit `69aed04`). **Prototyp w trybie symulacji. Nic nie jest zatwierdzane automatycznie.** Nie ma scalenia do `main` ani wdrożenia.

## 1. Punkt wyjścia i MAP-07A

W repozytorium **nie było** wyniku „MAP-07A” (brak gałęzi, commitu, dokumentu, stash; tylko niezatwierdzony zrzut `MAP-07_TEST-02_24-8-km.jpg`). Za zgodą użytkownika baza = `map06-interactive-map` (PR #1), a **MAP-07A (tylko zmiana kolejności wizyt w istniejącym koszyku) zaimplementowano jako krok 0** (`reorderBaskets` w `map05/optimizer.mjs`). Zestawienie porównuje więc „MAP-06 / MAP-07A (nasza implementacja) / MAP-07B”, a nie rzeczywiście wcześniej przetestowany MAP-07A użytkownika.

## 2. Co robi MAP-07B

Dla wybranego dnia szuka podziału zleceń między ekipy i sloty zamiast „pierwszej pasującej ekipy”:

1. **Pula zleceń możliwych do policzenia** (`eligibility`): gotowe, z ustaloną lokalizacją i pewnym punktem dostępu do drogi, bez ręcznych wykluczeń na ten dzień, bez zleceń chronionych. Każde pominięcie ma powód.
2. **Zachowanie potwierdzeń i blokad:** potwierdzone i ręczne przydziały oraz inne dni nie są ruszane (sprawdzane w kodzie, w teście i ponownie przed zastosowaniem w UI).
3. **Wyliczenie kombinacji instalacja × ekipa × slot** wyłącznie przez istniejące reguły twarde: `placementError` (= `validatePlan` + lokalna ocena dróg): kwalifikacje, dostępność, wspólne sloty instalacji/pomiarów, maks. 3 instalacje, 30 km łańcuch, +10 km pomiary, mieszczenie w oknie (norma testowa).
4. **Porównanie kosztu wstawienia zlecenia w różne pozycje trasy** przez ocenę całego dnia (km, minuty, liczba, wiek, równomierność).
5. **Konstrukcja + deterministyczne przeszukiwanie lokalne** (przenieś, zamień, wstaw, wyrzuć-i-wstaw) z budżetem czasu. Drugi start to wynik obecnego generatora MAP-06 — propozycja nie jest gorsza od niego według własnego celu danego wariantu dla tego dnia.
6. **Ta sama miejscowość** jest tylko ostatnim kryterium remisu, nigdy ponad regułami twardymi.
7. Limit 30 km **nie jest celem**: cel to km; limit jest regułą twardą.

### Warianty hierarchii celów (symulacja, niezatwierdzone)

Hierarchia priorytetów i zasady dzielenia ekip **nie są zatwierdzone** (Discovery/MAP-01..03 nie rozstrzygają; strony Notion były niedostępne w sesji). Dlatego trzy nazwane warianty:

| Wariant | Kolejność celów |
| --- | --- |
| **Liczba i czas oczekiwania, potem km** (domyślny; najbliższy kolejności z polecenia) | liczba zaplanowanych → dni oczekiwania zaplanowanych → km → minuty → równomierność → ta sama miejscowość |
| **Starszeństwo najpierw** | liczba zaplanowanych zleceń w grupach wieku od najstarszej → liczba → km → … |
| **Równomierność przed kilometrami** | liczba → dni oczekiwania → równomierność ekip → km → … |

Zlecenia „zaplanowane” = instalacje **i** pomiary (jeden zasób); to założenie jest otwarte (pkt 6 niżej).

## 3. Wyjaśnialność

Dla każdego zlecenia: dlaczego wybrane i do której ekipy/okna, ile koszyków rozważono, alternatywy z Δkm i Δmin dla całego dnia oraz powód odrzucenia (wskazany pierwszy cel hierarchii, na którym alternatywa przegrywa) lub niewykonalności (np. „slot zajęty”, „brak kwalifikacji”). Dla zleceń pozostawionych w kolejce: powód, najstarsze zlecenia zajmujące kwalifikowane sloty, wynik próby wymiany i oznaczenie „starsze niż najmłodsze zaplanowane”; uwaga, że przeszukiwanie jest ograniczone budżetem (to nie dowód, że inny plan nie istnieje). Osobno: reguły potwierdzone / założenia symulacji / niezastosowane (U01/U02/U04, D10, wyjątki koordynatora, pomiar poza pierwszą/ostatnią instalacją, normy regionalne/operatorskie, terminy BSA).

## 4. Interfejs

Karta „Optymalizacja między koszykami” (05 / MAP-07B · SYMULACJA): wybór wariantu, „Oblicz propozycję dla tego dnia”, tabela „Obecny plan / Propozycja”, koszyki obok siebie, uzasadnienia, zlecenia w kolejce, reguły. Przełącznik „Mapa: obecny plan / propozycja” pokazuje propozycję na mapie operacyjnej z banerem „PODGLĄD PROPOZYCJI (symulacja)”; podgląd nie zapisuje niczego. **Akceptacja** wymaga okna potwierdzenia, ponownej walidacji i sprawdzenia, że plan nie zmienił się od obliczenia; wpis trafia do historii (`Cofnij zmianę`). Propozycja nie trafia do `localStorage` ani do pliku planu. Zmiana planu lub dnia wycofuje propozycję.

## 5. Benchmark (zamrożony zbiór: 109 adresów, 5 ekip, 18–20.11.2026, mediana z 3 przebiegów)

Pełne tabele i JSON: `evidence/2026-11-18-map07b/benchmark/`. Skrypt: `map05/benchmark-optimizer.mjs`. Naruszeń reguł: **0** we wszystkich wariantach; chronione przydziały bez zmian we wszystkich.

**Pusty plan, 3 dni**

| Wariant | Zaplanowane (inst.+pom.) | Najstarsze 40 w planie | Dni oczekiwania | km | min dojazdu | Puste sloty / nieuzasadnione | Odch. std. obciążenia | Czas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MAP-06 | 40 (40+0) | 30/40 | 585 | 388,0 | 597 | 1 / 0 | 0,083 | 0,1 s |
| MAP-07A | 40 (40+0) | 30/40 | 585 | 353,3 | 538 | 1 / 0 | 0,083 | 0,1 s |
| MAP-07B Starszeństwo | 39 (37+2) | **33/40** | 583 | **254,1** | 408 | 2 / 0 | 0,113 | 4,7 s |
| MAP-07B Liczba i czas, potem km | **41** (40+1) | 31/40 | **612** | 304,5 | 474 | **0 / 0** | **0** | 5,0 s |
| MAP-07B Równomierność | 41 (40+1) | 31/40 | 612 | 304,5 | 474 | 0 / 0 | 0 | 4,2 s |

**Z chronionymi przydziałami (1 potwierdzony, 2 ręczne)**: MAP-06 39 (38+1), 362,5 km; MAP-07A 349,9 km; MAP-07B Starszeństwo 39 (37+2), **259,9 km**, najstarsze 28/36 (MAP-06: 27/36); MAP-07B Liczba i czas 39 (37+2), 326,4 km, najstarsze **26/36 (MAP-06: 27/36)**.

**Ograniczona dostępność (19.11: ekipy 2 i 4 bez okna 3, ekipa 5 wyłączona)**: wszystkie 36 zleceń; MAP-06 315,7 km → MAP-07A 290,1 km → MAP-07B 258,6–275,8 km; najstarsze 28/36 (MAP-06: 27/36).

Definicje: „najstarsze N” = N najstarszych kwalifikujących się zleceń, gdzie N = liczba zleceń zaplanowanych przez MAP-06 (minus chronione); „puste sloty nieuzasadnione” = otwarty wolny slot, w który da się wykonalnie wstawić niezaplanowane zlecenie jednoslotowe; „odchylenie obciążenia” = odchylenie standardowe zajętości slotów ekip-dni; czas = 3 dni.

**Uczciwe zastrzeżenia do tabeli**
- Wariant domyślny w scenariuszu z chronionymi przydziałami ma **o jedno z najstarszych 36 zleceń mniej** niż MAP-06 (26 vs 27) i **o jedną instalację mniej** (37 vs 38, za to 2 pomiary zamiast 1) przy tej samej łącznej liczbie wizyt; więcej dni oczekiwania w sumie (581 vs 576). To skutek przyjętej, niezatwierdzonej hierarchii (liniowa suma dni, instalacje i pomiary liczone jednakowo), nie zysk km kosztem trudnych zleceń — km jest kryterium dopiero po liczbie i wieku. Wariant „Starszeństwo” nie ma tej wady na najstarszych, ale w pustym planie planuje 39 zamiast 40.
- Wynik zależy od syntetycznych typów, wieku i gotowości zleceń oraz od normy testowych czasów; nie jest dowodem na rzeczywistym zbiorze zleceń.
- Czas 4–5 s dotyczy 3 dni (~1–1,7 s/dzień) w Node; w przeglądarce obliczenie blokuje wątek główny na ~0,7–1,0 s dla jednego dnia (Chrome: zadania długie 700–1000 ms).

## 6. Przykłady poprawionych koszyków (pusty plan, wariant domyślny; `evidence/.../examples-coverage-first.md`)

- 18.11, TEST-05: MAP-06 — Szum → Wąsice, 2 wizyty, 6,1 km. MAP-07B — trzy zlecenia z Tarnowa Opolskiego (TEST-038, 050, 098), 3 wizyty, **1,8 km**.
- 19.11, TEST-04: MAP-06 — Tarnów Opolski → Opole → Szydłów, **54,4 km** (odcinek 27,8 km). MAP-07B — Ściborzyce Małe → Grudynia Wielka × 2, **15,2 km**.
- 19.11, TEST-01: 35,8 km (odcinek 28,6 km) → 2 wizyty, 6,1 km.
- 20.11, TEST-02 (przypadek ze zrzutu użytkownika: Opole → Brynica → Opole, **42,2 km**): MAP-07B rozdziela te zlecenia — Brynica (TEST-051) i Opole (TEST-027) trafiają do TEST-03 razem z Osowcem (TEST-019; 35,5 km, najdłuższy odcinek 19,0 km), trzecie Opole (TEST-090) wraca na 18.11, a TEST-02 dostaje dwie inne wizyty (21,3 km). Dla zlecenia z dłuższym dojazdem poprawa jest umiarkowana (koszyk 42,2 → 35,5 km), nie „kilka km”.
- Łączna odległość 388,0 → 304,5 km, zaplanowane 40 → 41, najdłuższy odcinek 28,6 → 24,1 km. Nie każdy koszyk się skraca (np. 19.11, TEST-02: 21,8 → 35,5 km, bo zyskuje trzecią wizytę).

## 7. Otwarte decyzje biznesowe

1. Hierarchia celów (liczba / wiek / km / równomierność) — do zatwierdzenia; do tego czasu wyłącznie warianty symulacyjne.
2. Wiek: liniowa suma dni czy ścisłe starszeństwo; czy istnieje próg „zbyt stare”.
3. Zasady dzielenia ekip między koszyki (czy zlecenie może zmienić ekipę względem ustalonego wcześniej koszyka) — dziś zmieniają się tylko automatyczne, niepotwierdzone propozycje.
4. Czy pomiar liczy się tak samo jak instalacja w „liczbie zaplanowanych”.
5. Ograniczenia regionalne i operatorskie, normy czasów, terminy BSA, pomiar poza pierwszą/ostatnią instalacją, wyjątki koordynatora (U01/U02/U04, D10) — niezastosowane.
6. Start i powrót ekipy, czas dojazdu do pierwszej wizyty — poza modelem (jak w MAP-06).

## 8. Ograniczenia

- Obliczenia na wątku głównym (do ~1 s/dzień); rozwiązanie docelowe: Web Worker.
- Przeszukiwanie lokalne nie gwarantuje optimum; zakres to jeden dzień naraz (kolejność dni wpływa na wynik).
- Wykonano przegląd Codex (zob. `evidence/2026-11-18-map07b-codex/`, jeśli dołączony) i testy Chrome; fizyczny dotyk, Safari/Edge, czytnik ekranu i Firefox dla panelu MAP-07B nie były testowane.
- Bez zmiany schematu planu v1, `datasetId`, ID zleceń, silnika tras, reguł generatora MAP-06 i fixture MAP-04.

## 9. Testy

`npm test` w `map05`: 157/157 (w tym 11 testów optymalizatora i 4 testy panelu w DOM); `unittest map05` 82/82; `unittest map04` 24/24. Chrome 157 (GPU): 26/26 w trybie serwera i 26/26 z pliku offline (`evidence/2026-11-18-map07b/chrome/`). Test „offline bundle” kompiluje konkatenację modułów (wykrył i zabezpiecza kolizję nazw, która psuła tylko `planner-offline.html`).
