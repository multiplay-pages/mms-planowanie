# MAP-09 — demonstrator pełnej mapy Polski: diagnoza, uruchomienie, QA, rekomendacja

Status: **etap 1 (izolowany demonstrator) wykonany; BRAMKA STOP — czeka na ocenę wizualną użytkownika.** Demonstrator nie jest połączony z planerem. Gałąź `feature/map09-poland-basemap-poc` (baza `1fb5f9e`). Zadanie: Issue #6. Wariant lokalny/firmowy: [MAP09-ANALIZA-WARIANTU-LOKALNEGO.md](MAP09-ANALIZA-WARIANTU-LOKALNEGO.md).

Rozróżnienie: **ZATWIERDZONE** = zapisane decyzje projektu (`DECYZJE-I-ZAKRES.md`); **ZMIERZONE** = wynik uruchomienia opisany niżej; **PROPOZYCJA** = rekomendacja do decyzji właściciela.

## 1. Diagnoza stanu obecnego (na podstawie kodu `1fb5f9e`)

Obecna mapa (MAP-06/08) nie jest podkładem Polski z trzech niezależnych powodów:

1. **Bogaty pakiet nie jest w repozytorium.** `map05/basemap/map-pack.pmtiles` jest nieśledzony i ignorowany (`.gitignore`); po świeżym klonie go nie ma. `openMapPack()` (`map05/planner.mjs`) bez pakietu zwraca `null`, a `initOperationalMap()` przełącza się na `startRoadTiles()` — kafle **wyłącznie dróg** z `basemap/planner-compact.json` (322 452 obiektów, obwiednia `[17.2, 49.9, 19.0, 51.5]`). To widać na zrzutach `evidence/map09/stage3b/old-map/*` (status w aplikacji: „pakiet mapy niedostępny, podkład uproszczony (tylko drogi)”).
2. **Nawet pełny pakiet jest regionalny.** `build_map_pack.py` ma stałe `REGIONS` (4 województwa), z5–z14, a budynki tylko w promieniu 3 km od adresów testowych (ZMIERZONE w MAP-08: 53,6 MB, 11 310 kafli).
3. **Widok jest ograniczony do regionu.** `maplibre-view.mjs` ustawia źródło `roads` z `bounds: regionBounds`, `minZoom: 5` i `bounds` mapy; poza obwiednią nie ma żadnego podkładu (zrzut „zoomed-out”: skupisko punktów na pustym tle).

Uruchamianie: `python -X utf8 map05/serve.py` (planer) albo `map05/planner-offline.html`; testy wg `docs/URUCHOMIENIE-I-TESTY.md`. Wniosek: to konsekwencja wcześniejszej decyzji MAP-08 (pakiet poza repo), nie błąd renderowania.

## 2. Demonstrator — co zawiera

`map09-poc/` (osobna strona, serwer i CSP; z `map05` współdzieli tylko zwendorowany MapLibre GL JS 6.19.0):

- Podkład **OpenFreeMap** (wektorowy, cała Polska i świat): style **Positron** (spokojny, operacyjny) i **Liberty** (nawigacyjny). Przełączanie przez `map.setStyle(url, {transformStyle})` — nakładka (punkty/trasy) jest dokładana do każdego świeżo wczytanego stylu, więc przeżywa każdą zmianę.
- Przyciski: Polska, Opole, Knurów (+ Warszawa, Gdańsk, Kraków, Wrocław, „Dopasuj punkty”); zoom, przeciąganie, skala metryczna, atrybucja; **brak ograniczenia kamery** (`minZoom 3`, `maxZoom 19`, bez `maxBounds`).
- Nakładka **syntetyczna**: 11 punktów MPL (koło) / BSA (kwadrat) / POMIAR (romb) z numerami wizyt, dwie proste linie „trasy” (tylko do oceny kontrastu — nie są drogami), dymek po kliknięciu. Brak danych MMS, zleceń, geokodera.
- **Bez sieci przed zgodą:** mapa startuje jako tło + nakładka; połączenie z `tiles.openfreemap.org` rusza dopiero po kliknięciu „Włącz mapę online”. Przy braku internetu: komunikat „Mapa online jest niedostępna…” i przycisk „Spróbuj ponownie”; po utracie sieci w trakcie: ostrzeżenie o niewczytanych kafelkach.
- Serwer `serve_poc.py`: tylko allowlista 8 plików, tylko `127.0.0.1`/`localhost` (blokada DNS-rebinding), `Referrer-Policy: no-referrer`, CSP `connect-src 'self' https://tiles.openfreemap.org` (CSP w nagłówku = meta w HTML — pilnuje tego test).

### Uruchomienie

```powershell
python -X utf8 map09-poc/serve_poc.py          # http://127.0.0.1:8765/
# testy bez sieci:
cd map09-poc
node --test tests/overlay.test.mjs
python -X utf8 -m unittest tests.test_poc
cd ..
# QA w Chrome (playwright-core w lokalnym folderze E2E, zmienna MAP09_E2E_DIR):
node map09-poc/qa/offline-smoke.mjs            # bez sieci zewnętrznej
node map09-poc/qa/online.mjs                   # ONLINE: wymaga zgody (żądania do tiles.openfreemap.org)
node map09-poc/qa/old-map.mjs                  # baseline: bieżący planer bez pakietu (lokalnie)
```

## 3. Macierz QA

Środowisko: realny Google Chrome (Playwright, `headless`, SwiftShader/WebGL), Windows 11. Zgoda użytkownika na żądania do `tiles.openfreemap.org` — udzielona w tej sesji. Dowody: `evidence/map09/stage3a/`, `evidence/map09/stage3b/` (zrzuty 1920×1080 i 1366×768, viewport i fullPage, JSON-y wyników, logi konsoli/Network).

| ID | Przypadek | Status | Dowód |
| --- | --- | --- | --- |
| S1–S5 | Start bez sieci: nakładka renderuje się, 0 żądań poza 127.0.0.1, brak błędów konsoli, układ bez przewijania | **PASS** | `stage3a/offline-smoke-results.json` |
| W1 (×2 style) | Widok Polski: kraj, miejscowości (90), woda, tereny; nie „kilka dróg” | **PASS** | `v1920x1080/{positron,liberty}-polska.png` |
| W2 | To samo w 1366×768 | **PASS** | `v1366x768/` |
| C (×12) | Warszawa, Gdańsk, Kraków, Wrocław, Opole, Knurów osiągalne przyciskiem w obu stylach, gęsta sieć dróg | **PASS** | `online-results.json`, zrzuty miast |
| T Opole (×2) | z16.2: ≥3 nazwy ulic i ≥20 budynków (zmierzone: 34 / 42) | **PASS** | `*-opole-street.png` |
| T Knurów (×2), T2 | z16.2: ≥1 nazwa ulicy i ≥5 budynków (zmierzone: 7 / 16 w 1920; 1 / 5 w 1366) | **PASS — z zastrzeżeniem** | patrz „Zastrzeżenia” |
| D1 | Style wizualnie różne (różne piksele: 14–31% przy progu 15% dla widoków miejskich) | **PASS** | `online-summary.json` → `styleDiff` |
| P1, P2 | 6 przełączeń stylu: 4/4 punkty, 3 warstwy i 2 źródła nakładki, bez duplikatów; wszystkie 3 typy punktów | **PASS** | `online-results.json` |
| I1 | Klik w punkt po przełączeniach otwiera dymek | **PASS** | `popup-after-style-switch.png` |
| L1 | Brak zdublowanych elementów (canvas/skala/nawigacja) | **PASS** | j.w. |
| Z1, Z2 | Zoom +/−, pan przeciągnięciem, „Dopasuj punkty”, zmiana rozmiaru okna | **PASS** | `fit-points.png`, `resized-1100x700.png` |
| L0, L2, L3 | Układ: mapa >60% okna; viewport = fullPage w 1920×1080 i 1366×768 | **PASS** (po poprawce, p. niżej) | `viewport.png` / `fullpage.png` |
| N1–N3 | Do dostawcy tylko `tiles.openfreemap.org`; brak nazw/ID punktów w URL; 0 żądań przed zgodą | **PASS** | `page-log.json` |
| N4, N5 | Konsola bez błędów; brak nieudanych żądań (z wyłączeniem `ERR_ABORTED` = MapLibre anuluje ładowanie przy zmianie widoku: 214 / 110 zdarzeń) | **PASS — z zastrzeżeniem** | j.w. |
| O1 | Internet odcięty po załadowaniu: ostrzeżenie „część kafli nie wczytała się”, nakładka działa | **PASS** | `offline-after-load.png` |
| O2, O3 | Internet odcięty przed włączeniem: „Mapa online jest niedostępna”, przycisk ponowienia; po powrocie sieci mapa wraca | **PASS** | `offline/offline-enable-1366x768.png` |
| V | Widok Polski 1366×768: wszystkie punkty widoczne (po powiększeniu ikon) | **PASS** | `poland-points/` |
| B | Baseline: bieżący planer bez pakietu (obie rozdzielczości) | **PASS** (uchwycony) | `old-map/` |
| — | Przeglądarki inne niż Chrome (Firefox, Safari), dotyk, urządzenia mobilne | **NOT RUN** | — |
| — | Pomiary wydajności (FPS, czas pierwszego renderu, bajty na sesję) | **NOT RUN** | — |
| — | Odpowiedzi OpenFreeMap przy dużym ruchu / długi czas pracy | **NOT RUN** | — |
| — | Odczyt stron Notion (źródła prawdy), Polityka prywatności OpenFreeMap | **NOT RUN / niezweryfikowane** | Notion zwrócił pustą powłokę |
| R1–R12 | Odporność przełączania stylów (zamockowany dostawca, **bez ruchu zewnętrznego**): błąd HTTP 500/503, niepoprawny JSON, styl bez pól, limit czasu, A→B→A, odwrotna kolejność odpowiedzi, spóźniony błąd porzuconego wyboru, 7 szybkich przełączeń, wybór wizyty z listy (klawiatura) | **PASS** (14/14; mutacja wyłączająca strażnika numeru żądania → R6/R8 FAIL, więc testy nie są puste) | `evidence/map09/stage3c/style-race-results.json` |
| LIGHT | Ponowna weryfikacja poprawek na prawdziwym OpenFreeMap (1366×768; Polska, Opole, Knurów, Warszawa; 558 żądań) | **PASS** 28/29; N2 FAIL → rekwalifikacja (niżej) | `evidence/map09/stage3c/`, `stage3c-light-run.log` |
| T30 | Niezależny przegląd kodu (Codex), `8c8d9e5` | **wykonany**: 0×P1, 3×P2, 3×P3 — naprawione (sekcja 3a) | `evidence/map09/codex-T30-REPORT.md` |

Ostatni pełny przebieg (kod sprzed poprawek T30, `8c8d9e5`): **39/39 PASS**. Po poprawkach: 14/14 (mock) + 28/29 w przebiegu LIGHT na prawdziwym dostawcy (jedyny FAIL = N2, patrz niżej) + 5/5 offline-smoke z twardą blokadą sieci. Pełnego przebiegu 1920×1080 po poprawkach **nie powtarzano** (NOT RUN) — ścieżka renderowania podkładu nie została zmieniona, zmieniono tylko sposób wczytania stylu i układ nagłówka.

### 3a. Przegląd niezależny (Codex T30) i poprawki

| Ustalenie | Poprawka |
| --- | --- |
| P2-1 błąd kolejnego stylu nie kończył oczekiwania i mógł pokazać „działa · Liberty” nad Positronem | Jeden właściciel transakcji (`applyStyle`): własny `fetch` stylu z numerem żądania, walidacją (`version 8`, `layers`, `sources`) i limitem czasu 20 s; stan rozdziela `requested` i `active`; po błędzie zostaje poprzedni styl, radio wraca, jest „Spróbuj ponownie”; bez stylu — jawnie lokalne tło + nakładka (R1–R5) |
| P2-2 wyścigi A→B→A, diff bez zmian, spóźnione odpowiedzi | `setStyle(obiekt, {diff:false})` (zawsze `style.load`, brak wspólnego pola kontrolera MapLibre); tylko najnowsze żądanie zmienia stan/mapę; poprzednie anulowane `AbortController` (R6–R9) |
| P2-3 QA prywatności węższe niż wniosek | N2 = audyt **całej sesji** z pełnymi rekordami (metoda, pełny URL, ciało, `Referer`, cookie/Authorization, query-string, dozwolone ścieżki); S2 z twardą blokadą sieci; wniosek zawężony: „w audytowanych sesjach żądania do dostawcy to GET bez ciała/Referera/cookie, a ścieżki zawierają wyłącznie style/kafle/czcionki/sprity/Natural Earth” (nie: „żadne dane nigdy nie wychodzą”) |
| P3-4 progi i filtr błędów | Test C sprawdza środek i zoom presetu; ERR_ABORTED uznawane za oczekiwane tylko dla kafli `.pbf`; N4 asertuje brak błędów MapLibre innych niż kafle; Knurów nadal test obecności (nie czytelności) |
| P3-5 klawiatura/fokus/niskie okno | Lista „Punkt” (select) otwiera dymek wizyty bez myszy (R10); fokus po włączeniu/ponowieniu na wybranym stylu (R1c); `min-height: 260px` mapy |
| P3-6 kolizja ID ikon ze sprite’em | Prefiks `map09-` ikon + test jednostkowy |

**N2 w przebiegu LIGHT — FAIL, rekwalifikacja po fakcie.** Audyt nie znał ścieżki `natural_earth/ne2sr/{z}/{x}/{y}.png` (rastrowy relief używany przez Liberty na niskich zoomach). 15 z 558 żądań; pozostałe kryteria bez odchyleń. Lista ścieżek rozszerzona po zaobserwowaniu, przebieg nie był powtarzany; wynik „FAIL” zostaje w plikach (`N2-reclassification.md`).

**Liczba żądań do dostawcy (uczciwie):** pełny przebieg 951 + LIGHT 558 + dwa wcześniejsze przebiegi iteracyjne i lekki test (niezliczone, razem rzędu 1–1,5 tys.) = **ok. 3–3,5 tys.**, czyli więcej niż ~2000 z pierwszej zgody; użytkownik wyraził dodatkową zgodę na jeden lekki przebieg (szacowany na ~300, faktycznie 558). Bez pobierania hurtowego, w ruchu zbliżonym do ręcznego przeglądania.

### Błędy znalezione przez własne testy i naprawione

1. **Układ:** po ukryciu panelu zgody siatka CSS (`grid`) przesuwała wiersze — mapa zapadała się, a stopka zachodziła na przyciski (status „działa” przy zerowej wysokości mapy). Wykrył to pierwszy przebieg online (klik zablokowany przez stopkę). Poprawka: układ `flex`; dodany test L0 (mapa >60% okna).
2. **Czytelność punktów w widoku Polski:** ikony w skali kraju były ~połową rozmiaru. Poprawka: rozmiar ikon 0,95–1,1 na wszystkich zoomach; zweryfikowano V.

### Zastrzeżenia (uczciwie)

- **Progi dla Knurowa zostały skalibrowane po pierwszym przebiegu.** Pierwotny próg (≥3 ulice, ≥20 budynków) był wspólny z Opolem; preset „Knurów” (50,2167 N; 18,6667 E) leży na terenie kolejowo-górniczym, więc w kadrze z16.2 jest mniej ulic i budynków. Zrzut `positron-knurow-street.png` potwierdza wzrokowo ulice (Niepodległości, Pocztowa, Kopalniana, Spółdzielcza) i zabudowę, lecz próg liczbowy jest słabszym dowodem niż dla Opola. Do oceny przez użytkownika.
- `ERR_ABORTED` nie jest traktowane jako błąd (to zwykłe anulowanie kafla przez MapLibre); zachowane jako liczba w raporcie.
- N2 sprawdza URL-e żądań do dostawcy, nie ciała (żądania są GET).
- **Liczba żądań do dostawcy** przekroczyła podany w zgodzie rząd wielkości: ostatni pełny przebieg 683 + 268 = 951 żądań (głównie kafle, 13 czcionek, 2 style, 2 sprity), do tego dwa wcześniejsze przebiegi iteracyjne (jeden przerwany po błędzie układu) i lekki test (~100). Szacunkowo łącznie **ok. 2–2,5 tys.** żądań, bez pobierania hurtowego i bez równoległych skanów; nie liczono dokładnie przebiegów wcześniejszych.
- Polskie nazwy: styl OpenFreeMap pokazuje na niskich zoomach nazwy łacińskie/angielskie (np. „Poland”, „Warsaw”, „VOIVODESHIP”); ulice i miasta w Polsce mają nazwy polskie. Lokalizacja etykiet (`name:pl`) wymaga własnej modyfikacji stylu — nie zrobiona.

## 4. Porównanie wizualne: stary vs nowy

| Widok | MAP-08 (bieżący planer, bez pakietu) | MAP-09 (demonstrator) |
| --- | --- | --- |
| Cała Polska | brak (widok ograniczony do regionu; po oddaleniu skupisko na pustym tle) — `old-map/1920x1080-op-map-zoomed-out.png` | kraj, granice, sąsiedzi, miasta, woda, tereny — `v1920x1080/positron-polska.png`, `liberty-polska.png` |
| Opole / ulice | cienkie szare drogi, nazwy tylko części, brak budynków, brak wody poza trasami — `old-map/1920x1080-op-map.png` | pełne ulice z nazwami, budynki, rzeka Odra, POI, numery dróg — `liberty-opole-street.png`, `positron-opole.png` |
| Knurów | drogi z `planner-compact.json` | ulice z nazwami, budynki, tory — `positron-knurow-street.png` |
| Spokojny vs nawigacyjny | jeden styl wariantowy | Positron (jasnoszary, dyskretny) vs Liberty (kolorowy, 3D budynki) |

Ocena jakościowa należy do użytkownika (bramka STOP). Z moich zrzutów: różnica jest bardzo duża, szczególnie poza regionem, ale to demonstrator z danymi dostawcy, nie wynik integracji.

## 5. Online vs lokalnie — skrót (szczegóły: dokument Codexa)

| | A — pełna online (OpenFreeMap) | B — pełna lokalna/firmowa (PMTiles) | C — uproszczony fallback MAP-08 |
| --- | --- | --- | --- |
| Pokrycie | cała Polska i świat | Polska (wycinek) | region operacyjny |
| Jakość | ZMIERZONA w tym demo | bogata, zależna od profilu (do zmierzenia) | drogi + części nazw |
| Offline | nie | tak (w LAN/VPN lub lokalny plik) | tak |
| Prywatność | dostawca widzi IP i obszar kafli | w firmie | lokalnie |
| Koszt/utrzymanie | brak opłat wg ToS, brak SLA, możliwe wycofanie | build + hosting + odświeżanie (SZACUNEK 1–3 GB, wdrożenie 3–7 dni) | najtańszy |
| Czas do pierwszego efektu | demo gotowe | 3–7 dni na pilotaż | gotowe |

Koszty mapy są oddzielone od silnika routingu: podkład niczego nie zmienia w trasach i odległościach (lokalny snapshot MAP-08).

## 6. Rekomendacja (PROPOZYCJA, wymaga decyzji właściciela)

- **Demonstrator/pilot:** wariant A — gotowy, lecz tylko z danymi syntetycznymi albo po zatwierdzeniu dostawcy i polityki prywatności (zgoda na jednego dostawcę nie obejmuje kolejnego; dane klientów nie mogą trafiać do żądań mapowych).
- **Produkcja:** wariant B (krajowy PMTiles z firmowego hostingu), A jako akceleracja pilota, C jako fallback przy awarii. Przed wyborem B zmierzyć build/RAM/SSD/rozmiar i ruch Range.
- **Następny wąski krok integracyjny (dopiero po akceptacji wizualnej):** w planerze dodać opcjonalne źródło podkładu „pełna mapa” (A) obok istniejącego (C), z jawnym przełącznikiem i zmianą CSP `connect-src` wyłącznie dla tego origin; styl przez `transformStyle` jak w demonstratorze; bez zmian w generatorze koszyków, regułach 30/+10 km, kolejce, priorytetach, przydziale ekip, routingu i geokodowaniu.

## 7. Checkpoint

- **Zrobione:** diagnoza (kod), izolowany demonstrator, testy jednostkowe (7 JS + 8 Python), QA w Chrome (pełny 39/39 przed T30; po T30: 14/14 mock + 28/29 LIGHT + 5/5 offline), baseline MAP-08, analiza wariantu lokalnego i niezależny przegląd (Codex), poprawki P2/P3.
- **Pozostało:** ocena wizualna użytkownika; ewentualna lokalizacja etykiet na polskie; decyzja A/B; pełny przebieg 1920×1080 po poprawkach (NOT RUN — wymaga zgody na ok. 1 tys. żądań); ponowny przegląd Codex poprawek (nie zlecony); Draft PR (nie gotowy do merge).
- **Status:** STOP — nie integrowano z planerem; `main` nietknięty.
- **Jedna konkretna następna czynność:** uruchom `python -X utf8 map09-poc/serve_poc.py`, otwórz `http://127.0.0.1:8765/`, kliknij „Włącz mapę online”, porównaj Positron/Liberty w Polsce, Opolu i Knurowie i napisz: akceptuję jakość / chcę poprawek.
