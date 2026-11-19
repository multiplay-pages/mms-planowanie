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
| — | Niezależny przegląd kodu (Codex T30) | **w toku** — patrz `evidence/map09/codex-T30-REPORT.md`, jeśli jest | — |

Łącznie ostatni pełny przebieg: **39/39 PASS** (+2 PASS lekki test widoku Polski, +2 PASS baseline).

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

- **Zrobione:** diagnoza (kod), izolowany demonstrator, testy jednostkowe (6 JS + 8 Python), QA w Chrome (39/39 PASS, z zastrzeżeniami wyżej), baseline MAP-08, analiza wariantu lokalnego (Codex).
- **Pozostało:** ocena wizualna użytkownika; wynik przeglądu Codex T30; ewentualna lokalizacja etykiet na polskie; decyzja A/B; Draft PR (nie gotowy do merge).
- **Status:** STOP — nie integrowano z planerem; `main` nietknięty.
- **Jedna konkretna następna czynność:** uruchom `python -X utf8 map09-poc/serve_poc.py`, otwórz `http://127.0.0.1:8765/`, kliknij „Włącz mapę online”, porównaj Positron/Liberty w Polsce, Opolu i Knurowie i napisz: akceptuję jakość / chcę poprawek.
