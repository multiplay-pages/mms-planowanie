# T4 — MAP-06: niezależny przegląd planu i kontraktów

17.11.2026, Codex CLI. Gałąź `map06-interactive-map`, baza `0c2a0a8`. Lider jest właścicielem implementacji. Przegląd dotyczy planu `docs/MAP06-PLAN.md` oraz kontraktów MAP-05; nie jest odbiorem równolegle powstającego kodu MAP-06. Numery linii istniejących testów/buildera/serwera odnoszą się do stanu sprzed integracji MAP-06.

**Ocena: kierunek spełnia zakres funkcjonalny, lecz wymaga doprecyzowania kontraktów przed odbiorem. Najważniejsza bramka P1 to rzeczywiste uruchomienie workera pod docelową CSP z `file://`.** Warstwa czystej projekcji i lokalny routing to właściwy podział; nie trzeba zmieniać planu v1 ani silnika dróg. Nie jest to zgoda na merge/push na main — pozostaje wymagana akceptacja użytkownika.

Odczytano wskazane instrukcje, plan, architekturę, `planner.mjs`, model, `routes.mjs`, builder, serwer i testy. Dodatkowo lokalne źródła zainstalowanego `maplibre-gl@6.19.0`, jego manifest/licencję i manifest `@mapbox/tiny-sdf@2.3.0`. Bez sieci. Nie uruchamiano builda, testów ani przeglądarki; wcześniejsze 190/190 jest historycznym baseline, nie wynikiem T4. Jedyny zapis T4 to ten katalog evidence.

## Macierz wymagań

| Wymaganie użytkownika | Element planu | Ocena / luka do zamknięcia |
| --- | --- | --- |
| Interaktywna mapa MapLibre, płynny zoom/pan/obrót | §2, `maplibre-view.mjs` | Pokryte kierunkowo. Dowód musi pochodzić z pełnego regionalnego zbioru i finalnej CSP, nie z małego spike'a. |
| Wszystkie koszyki wybranego dnia jednocześnie | §1 i §3, `visits/routes` | Pokryte; dopisać niezależność od filtrów kolejki i zachowanie przy pustym dniu. Stary `mapOrders()` przełącza jeden koszyk, więc nie może zostać źródłem nowej projekcji wszystkich koszyków. |
| Stały kolor ekipy | §3, properties GeoJSON | Brakuje reguły stabilności: kolor po ID, niezależny od kolejności teams, liczby koszyków, daty i ukrycia sąsiada. Kolor nie może być jedynym rozróżnieniem. |
| Numeracja i zgodność z trasą | §3: sortowanie po start | Użyć kanonu `assessBasket().orders`: `start`, potem `orderId` (`routes.mjs:66`). Dwa sloty to jedna wizyta. Numeracja obejmuje również wizytę bez pozycji; po ukryciu punktu nie renumerować pozostałych. |
| Przełączniki warstw/koszyków | §3 adapter | Nie podano jawnego kontraktu `options`. Ukrycie koszyka nie zmienia planu i nie zamienia wizyt w kolejkę. Ukrycie typu nie może tworzyć drogi A→C z pominięciem B. |
| Popup z przejściem do edycji | §3, `selectMapOrder()` | Dopisać fokus na formularzu/nagłówku po przewinięciu, bezpieczny DOM, zamknięcie starego popupu po zmianie dnia/importowaniu/usunięciu. |
| Synchronizacja z jednym planem | §1 i §3: render → update | Właściwie. Aktualizować także undo/reset/import/odczyt localStorage, nie tylko ASSIGN. Przy asynchronicznym style/load stosować najnowszy stan; stara odpowiedź nie może odtworzyć poprzedniego dnia. |
| Trasy tylko z lokalnych wyników | §3, assessBasket/decodeRouteGeometry | Właściwie. Status OK nie wystarcza przy uszkodzonej geometrii: błąd dekodera też daje gap. Osobne odcinki, bez sklejenia przez brakującą nogę. |
| Brak wymyślonych pozycji i odległości | §3, lista 7 braków | Właściwie. Rozdzielić brak pozycji, brak drogi, uszkodzoną geometrię i nieocenioną regułę. Brak ma null/status, nie 0 km. Zachować 6 uwag PNA i źródłową pozycję budynku. |
| Drogowa / satelita / hybryda | §4 | Lokalna drogowa i hybryda z lokalnymi etykietami zgodne z zakresem. Opisać błąd dostawcy i powrót do lokalnej mapy; bez automatycznego nowego dostawcy. |
| Satelita dopiero po konfiguracji i opt-in | §4: UI + ostrzeżenie + CLI origin | Właściwy model dwóch bramek. Potrzebna walidacja dokładnego originu i dowód 0 żądań także przy samej zapisanej konfiguracji, anulowaniu dialogu, reload i wyłączeniu warstwy. |
| Brak sekretów | §4: klucz tylko localStorage | Klucz musi być oddzielony od planu, eksportu, popupu, błędów i evidence network. Frontend obsługuje wyłącznie klucze przeznaczone do publicznego klienta; localStorage nie czyni prywatnego klucza tajnym. |
| Samodzielny offline | §2/§4: vendor, brak satelity w file | Właściwa granica funkcjonalna. Bramka P1 worker/CSP jest nierozwiązana w samym opisie. Sprawdzić brak ukrytych glyph/sprite/style URL i worker imports. |
| Fallback bez WebGL | §3: dotychczasowy SVG | Potrzebna jawna decyzja: ten sam zestaw warstw/projekcji albo jasno opisany ograniczony tryb. Sam stary SVG obsługuje jeden koszyk i stare kolory, więc nie dowodzi MAP-06. |
| Wydajność i pamięć | §3 indeks/kafle + §5 kompresja | Kierunek dobry; brak budżetów, limitu cache, pomiaru cold start, peak heap i długiego pan. Gzip nie ogranicza rozmiaru obiektów w pamięci. |
| Prototyp na gałęzi, bez publikacji main | nagłówek, §6/§8 | Pokryte. Brak nowych wywołań OSRM/ORS/geokodowania i zmian źródłowych. |

## Luki i ryzyka P1–P3

### P1-1 — kontrakt worker/CSP nie wynika z samego „worker-src blob:”

Plan `docs/MAP06-PLAN.md:14`, `:27`, `:55`. Lokalne źródło konkretnej wersji, `map05/node_modules/maplibre-gl/src/util/web_worker.ts:79`–`:100`, zawiera specjalną ścieżkę dla opaque origin: `workerFactory()` przy workerze modułowym wywołuje `fetchAsDataUrl(url)`, które **najpierw wykonuje fetch kodu workera**, a następnie tworzy worker z `data:`. Komentarz źródła wskazuje ograniczenie Chrome przy module worker z blob na opaque origin. Domyślny worker URL dla nie-HTTP jest pusty (`:37`–`:45`).

Wniosek statyczny: `worker-src blob:` + `connect-src 'none'` nie opisuje kompletnej ścieżki tej wersji dla file. Nie twierdzę, że wykonano reprodukcję browser ani że MapLibre nie może działać offline. Przed odbiorem trzeba pokazać działający finalny HTML z dokładnymi politykami, właściwą strategią workera oraz pełnym logiem CSP/worker/network. Jeżeli konieczne okaże się dopuszczenie wyłącznie pamięciowych `blob:`/`data:` dla odpowiedniej dyrektywy, uzasadnić to osobno; nie rozszerzać domyślnie HTTP/HTTPS, `unsafe-eval` ani dowolnych skryptów. Nie „naprawiać” testu usunięciem zakazu sieci.

### P2-1 — dwie CSP i brak pełnego kontraktu tile origin

`planner.html:6` ma meta CSP, a `serve.py:55` CSP nagłówka. Dodanie originu wyłącznie do nagłówka pozostawi blokadę w meta. Trzeba spójnie wygenerować obie polityki albo świadomie przenieść autorytatywną politykę served do nagłówka, zachowując osobną ścisłą politykę w artefakcie offline.

`--allow-tile-origin` powinien przyjmować znormalizowany origin (scheme/host/port), nie dowolny fragment CSP: bez wildcard, userinfo, query, fragmentu, ścieżki i CR/LF. HTTPS dla zewnętrznego dostawcy, jawny loopback HTTP tylko dla lokalnego testu. URL szablonu musi odpowiadać temu originowi; nie dopuszczać zewnętrznych style/glyph/sprite/worker URL przez konfigurację satelity. Nie dodawać proxy pobierającego dowolny URL po stronie Python. Dla faktycznego loadera rastra sprawdzić wymagane connect/img/CORS, nie zgadywać szerokich dyrektyw.

### P2-2 — filtry i numeracja mogą zmienić znaczenie trasy

`docs/MAP06-PLAN.md:31`–`:44`, aktualny `planner.mjs:213`–`:217`, `routes.mjs:66`–`:68`. Zdefiniować zakres mapy wszystkich koszyków oddzielnie od filtrów kolejki. Najpierw ustalić pełną kolejność i rzeczywiste nogi z assessBasket, dopiero potem sterować widocznością. Nie przeliczać następstwa po ukryciu POMIAR/braku pozycji; nie numerować drugiego slotu jako drugiej wizyty. Nie dodawać przypisanych na inny dzień do globalnej kolejki.

### P2-3 — „update z renderPlanner” wymaga obsługi asynchronicznego adaptera

`docs/MAP06-PLAN.md:42`, `planner.mjs:32`–`:59`, `:75`–`:82`, `:330`. Init następuje po odczycie planu; render już ma wspólny punkt dla działań i undo. Adapter nie może przechowywać własnych przydziałów. Musi zatrzymać najnowszą projekcję do style/load, odrzucić przestarzałe aktualizacje, odtworzyć sources po zmianie stylu i zamknąć popup nieaktualnego zlecenia. MapLibre init/error nie może zatrzymać kolejki/edycji planu. Rejestracja protokołu, eventów i workera tylko raz; cleanup po fallback/destroy.

### P2-4 — popup, konfigurowana atrybucja i klucz są nową granicą wejścia

`docs/MAP06-PLAN.md:42`, `:55`; dotychczasowy test `planner-ui.test.mjs:180` broni wyświetlenia zewnętrznego adresu jako tekstu. Popup tworzyć przez bezpieczne węzły/textContent, nie setHTML z adresem. Podobnie atrybucja dostawcy nie może stać się dowolnym wykonywalnym HTML. Rozdzielić konfigurację i stan opt-in od `plan`/schema v1. Przed zgodą nie dodawać źródła rastra, nawet jako niewidocznego; po wyłączeniu zatrzymać nowe żądania i usuwać źródło/warstwy. Obsłużyć odmowę localStorage i maskować klucz w logach/błędach/evidence. Zapisany URL lub sam flag CLI nie jest kliknięciem zgody.

### P2-5 — generowanie MVT nie staje się automatycznie pracą w workerze

Plan `:36`–`:40`, `:64`–`:73`. Lokalne `src/source/protocol_crud.ts:9` opisuje addProtocol jako callback na głównym wątku, do którego mogą odwołać się workery. Indeks siatki musi ograniczyć kandydatów przed dekodowaniem; nie skanować/dekodować 322 452 dróg dla każdego kafla i renderu planu. Potrzebne przycinanie, sensowne uproszczenie niskich zoomów, limit LRU kafli/dekodowanych dróg, obsługa abort i pomiar najgorszego obszaru.

Pliki mają 28 677 049 B podkładu i 40 630 912 B tras. Ponad to istnieją tekst JSON, obiekty, kopia walidowanych tras, rozkodowana geometria, bufory MVT, worker i GPU. Nie tworzyć pełnej drugiej kopii GeoJSON całego podkładu równolegle z SVG. Fallback przygotowywać leniwie. Kompresja zmniejsza plik, ale przy uruchomieniu może jednocześnie utrzymywać base64, gzip, bufor UTF-8, string i obiekty — musi być osobnym pomiarem peak memory.

### P2-6 — fallback i klawiatura nie są pokryte zachowaniem starego canvas/SVG

`docs/MAP06-PLAN.md:45`, `:79`–`:81`. HTML canvas nie udostępni automatycznie 109 fokusowalnych punktów jak obecne circle/tabindex. Wymagana alternatywna lista wizyt z numerem/ekipą/typem i akcją edycji, etykiety kontrolek, Escape i powrót fokusu popupu, brak pułapki klawiatury, osobna weryfikacja dotyku. Fallback uruchamiać także po odrzuceniu importu vendora, błędzie workera/contextlost — nie tylko po synchronicznym sprawdzeniu WebGL. Nie wykonywać nieudanego importu przed osiągnięciem kodu fallbacku.

### P3-1 — licencje i parametry dostawców wymagają rozdzielenia dowodów

MapLibre 6.19.0 lokalnie deklaruje BSD-3-Clause, a LICENSE.txt wymaga zachowania not/licencji przy dystrybucji. TinySDF 2.3.0 ma lokalnie **BSD-2-Clause**; jeżeli jest osobno vendorowany, zachować jego notę. Do dystrybucji vendora dodać manifest wersji/hash i odpowiednie noty komponentów; sama linia „MapLibre BSD-3” nie zastępuje wszystkich not zależności. OSM/ODbL i pochodzenie lokalnego podkładu pozostają widoczne również przy zmianie stylu, fallbacku i satelicie/hybrydzie. Dostawca rastra wymaga własnej atrybucji.

Ceny, limity i uprawnienia dostawców w §4 planu nie zostały w T4 potwierdzone — obowiązuje zakaz sieci. Nie traktować tych wpisów jako aktualnej decyzji licencyjnej ani gotowej konfiguracji produkcyjnej. Preset ma pozostać nieaktywny do weryfikacji parametrów, warunków i jawnego opt-in.

## Konkretne testy i asercje przy integracji

| Plik:linia (baseline) | Obecny kontrakt | Zmiana uzasadniona / ryzyko |
| --- | --- | --- |
| `tests/test_delivery.py:72`–`:77` | 200, MIME, niepuste body, `connect-src 'self'` dla jawnych zasobów | Rozszerzyć o operational-map, maplibre-view, road-tiles i dokładne pliki vendor JS/worker/CSS. Domyślne self pozostaje; dodać osobny skonfigurowany origin, nie zmieniać wszystkich testów na dowolny connect-src. |
| `tests/test_delivery.py:78`–`:82` | Dokładne fixture/data/root i pusty HEAD | Zachować. Jeśli served HTML ma dynamiczną meta CSP, porównywać deterministyczny oczekiwany render tylko dla HTML; dane i vendor nadal porównać bajtowo. |
| `tests/test_delivery.py:84`–`:87` | 404 prywatnych/obcych ścieżek, POST 501 | Zachować w całości. Nowe wpisy FILES nie uzasadniają serwowania katalogu node_modules, PBF, sekretów, źródeł czy dowolnego pliku. Dodać próby traversal także w prefiksie vendor. |
| `tests/test_delivery.py:55`–`:58`, `:107` | Offline bez zewnętrznych script/link | Vendor osadzony inline powinien nadal spełnić kontrakt. Sam module zamiast classic nie jest powodem osłabienia asercji. Parser nie wykrywa zagnieżdżonych importów, worker fetch, glyph/sprite ani CSS url — potrzebne dodatkowe kontrole i browser. |
| `tests/test_delivery.py:108` | Dosłownie `connect-src 'none'` | Zachować, jeśli wybrana ścieżka workera go umożliwi. Jeżeli pamięciowy blob/data fetch okaże się konieczny, zmienić świadomie na parser CSP z dokładną listą tylko dozwolonych schematów oraz testem braku HTTP/HTTPS. Samo usunięcie tej asercji byłoby regresją prywatności. |
| `tests/test_delivery.py:109`–`:111` | JSON osadzony identyczny z czterema lokalnymi źródłami | Przy nieskompresowanym vendorowaniu bez zmian. Przy gzip+base64 uzasadnione rozpakowanie faktycznego envelope z HTML i porównanie każdego źródła/datasetId po dekompresji; nie zastępować przez „jakiś payload istnieje”. |
| `tests/test_delivery.py:112`–`:114` | Hash każdego script/style obecny w CSP | Rozszerzyć o nowe inline ESM/vendor CSS/worker payload. Sprawdzać właściwą dyrektywę i realny typ skryptu; nie zastępować hashy przez unsafe-inline/eval. Worker-src sprawdzać osobno. |
| `tests/planner-ui.test.mjs:7`–`:11`, `:29` | Imports podane do VM; skrypt z wyciętymi static imports | Nowe importy wymagają dostarczenia realnego API/iniekcji adaptera. `import.meta`, ESM vendora i dynamic import nie zadziałają przez prosty vm.runInContext. Zachować jawnie wymuszony SVG/test adapter; nie usuwać całych testów handlerów z powodu WebGL. |
| `tests/planner-ui.test.mjs:22`–`:25`, `:36` | Brak ładowania zasobów/nawigacji, fetch odrzuca, requests/errors puste | Zachować dla testów czystego UI/fallbacku; nie umożliwiać sieci ani prawdziwego workera w Happy DOM, żeby „naprawić” import. Testy MapLibre/WebGL to osobny prawdziwy Chrome. |
| `tests/planner-ui.test.mjs:39`–`:44`, `:86`–`:91`, `:129`–`:141`, `:187`–`:208` | SVG markery, viewBox, 46/102/6/7, brak fikcyjnych punktów | Zachować jako testy SVG fallbacku albo zastąpić mapowe selektory właściwym kontraktem adaptera przy zachowaniu liczebności/tożsamości i semantyki. Liczenie circle nie dowodzi MapLibre. |
| `tests/planner-ui.test.mjs:142`–`:162` | Jeden koszyk, zgodność wyboru i focus; „all” wraca do 46 punktów | W MAP-06 uzasadniona zmiana semantyki „wszystkie koszyki”. Rozdzielić all-day/basket focus od zakresu kolejki. Nie zachować starego ograniczenia do jednego koszyka tylko po to, by test pozostał zielony. |
| `tests/planner-ui.test.mjs:180`–`:185` | Zewnętrzny HTML adresu jest tekstem, brak img | Zachować i powtórzyć dla popupu oraz atrybucji. Regresja XSS nie jest usprawiedliwiona biblioteką. |
| `tests/planner-ui.test.mjs:221`–`:232` | Lokalna droga jest widoczna; po „all” liczba tras = 0 | Ta ostatnia asercja jest celowo sprzeczna z MAP-06 all-baskets i wymaga zmiany dla nowego trybu. Kontrola lokalnego pochodzenia i braku żądań musi pozostać. |
| `tests/planner-ui.test.mjs:235`–`:243`, `:247`–`:275` | Lokalne ulice, fokus, fit po dniu | SVG asercje zostają dla fallbacku. Dla GL dodać source features/viewport + keyboard/popup na rendererze; nowy tryb nie uzasadnia zgubienia fokusu i starego dnia. |
| `tests/planner-map.test.mjs:14`–`:59` | SVG LOD, współrzędne, CSS halo | Jeśli SVG zostaje fallbackiem, zachować. Dodać odrębne testy MVT decoderem: bbox/extent/Y, sąsiednie kafle, puste kafle, kategorie/zoom, polskie etykiety i brak fałszywych łączników. |
| `tests/planner-model.test.mjs`, `planner-routing.test.mjs:66`–`:90`, `routes.test.mjs`, `real-routes.test.mjs` | Plan/ID/import, ochrona, 20/20/40 i geometria | Nie wymagają zmiany semantyki z powodu renderera. Pozostają bramką regresji, bez ponownego liczenia dróg. |

Obecny builder `build_planner.py:43`–`:46` usuwa wyłącznie `export function` i static import, następnie robi IIFE. To nie jest bundler ESM vendora. Należy jawnie zbudować graf modułów/inline module lub kontrolowany bundle; dodanie `export const/class`, import.meta albo import vendora nie może być naprawiane coraz szerszym przypadkowym regexem. Lokalny pakiet 6.19 zawiera main i worker `.mjs`, bez dawnego UMD `.js`. Do sprawdzania składni gotowego ESM używać parsera w trybie module, a nie wyłącznie vm.Script. Niezależnie od składni nadal konieczny jest prawdziwy test CSP/workera w obu wariantach.

## Kontrakt projekcji do uzgodnienia przed T5

Proponuję `visits`, `routes`, `unassigned` jako GeoJSON FeatureCollection oraz `gaps` jako listę jawnych diagnostyk z ID i typem (brak pozycji / brak nogi / błędna geometria / nieoceniona reguła). Opcjonalna legend może być dodatkowym polem. Ostateczne nazwy properties/options uzgadnia właściciel modułu; testy mają sprawdzać zachowanie, nie prywatną strukturę implementacji.

- Jedyny plan wejściowy, bez mutacji scenario/plan/options; deterministyczny wynik.
- Wizyta: stabilne ID zlecenia, teamId, date, numer, start, type, color, confirmed/origin i rzeczywista pozycja budynku.
- Noga: teamId/date/from/to/numery, zachowany skierowany przebieg z decodeRouteGeometry; oddzielna feature dla każdej nogi. Metry/sekundy z lokalnego assessment, braki null.
- `unassigned` oznacza globalną kolejkę z queueOrders, a nie wszystkie pozycje nieprzydzielone w wybranym dniu. Zlecenia innych dni nie wracają do kolejki.
- Domyślnie wszystkie koszyki dnia oraz nieprzydzielone punkty; diagnostyka 7 nieustalonych jest osobna i nie tworzy punktów. Ukrycie koszyka zmienia tylko widoczność; ustalić, czy diagnostyka ukrytego koszyka pozostaje w panelu (rekomendowane zachowanie informacji o brakach).

## Niezależne przypadki testowe do przyszłego zadania

| ID | Przypadek / niezależne oczekiwanie |
| --- | --- |
| O01 | Pusty plan na rzeczywistym zbiorze: 0 visits/routes; 102 zlokalizowane pozycje kolejki; dokładnie 7 braków pozycji w gaps, żadnego punktu z wymyśloną pozycją. |
| O02 | Dwie ekipy z kilkoma wizytami na dzień: wszystkie koszyki jednocześnie, przypisanie/color/legend zgodne z teamId. |
| O03 | Ta sama ekipa po zmianie dnia, odwróceniu teams i ukryciu innej ekipy zachowuje kolor; 5 ekip ma rozróżnialne identyfikatory/styl, nie same kolory bez legendy. |
| O04 | assignments w losowej kolejności, start 2/0/1: numery 1/2/3 w kolejności 0/1/2; powiązania from/to i numery zgodne z assessBasket. Nie wyliczać oczekiwań tą samą sortującą funkcją produkcyjną. |
| O05 | Zlecenie dwuslotowe: jedna feature i jeden numer, następna wizyta ma kolejny numer, bez punktu „ciąg dalszy”. |
| O06 | Dzień X/Y i pusty dzień: tylko właściwy dzień w visits/routes, brak pozostałości poprzedniego dnia. |
| O07 | Ukrycie jednej ekipy: brak jej visits/routes, pozostałe niezmienione; ukryte zlecenia nie stają się unassigned; plan identyczny. |
| O08 | Wyłączenie punktów/tras/kolejki osobnymi options: znika tylko dana warstwa; nie zmieniają się kolejność, kolory i przydziały. |
| O09 | POMIAR między instalacjami: wyróżniony typ/styl, kolor nadal odpowiada ekipie; nogi i numeracja obejmują pomiar. |
| O10 | Ukrycie POMIAR albo wizyty bez pozycji między A i C: brak sztucznej A→C; pozostałe numery nie są kompresowane. |
| O11 | Trasa A→B ma geometrię wieloodcinkową inną niż prosta: dokładne punkty i kierunek zachowane, także ujemny indeks segmentu. |
| O12 | Statusy NO_PATH/SNAP_UNCERTAIN/LOCATION_UNKNOWN: żadnej feature drogi dla tych nóg; typowana diagnostyka pary i null metry/czas, nie 0. |
| O13 | Łańcuch A→B OK, B→C brak, C→D OK: dwie rozdzielone linie, nie jeden sklejony LineString. |
| O14 | OK z uszkodzonym/nieciągłym path: decode error pomija wyłącznie tę nogę, dodaje gap, nie wyłącza całej mapy. Prawdziwy znany odcinek zerowej długości rozróżnić od braku danych; nie rysować wymyślonej linii. |
| O15 | Jedna/pusta wizyta: brak linii do bazy/powrotu i brak fikcyjnego 0 km między wizytami; status nieoceniony nie zmienia się w PASS. |
| O16 | 7 nieustalonych pozostaje gaps także gdy gotowość blokuje generator albo ręczny stary plan ma taki przydział; żadnych współrzędnych z kandydata. |
| O17 | 6 uwag PNA: pozycje używalne z flagą uwagi, oryginalny kod zachowany; nie mieszać z 7 brakami. |
| O18 | Zlecenie zaplanowane na inny dzień: nie jest globalnie unassigned; lokalna kolejka niezależna od dnia. |
| O19 | ASSIGN/move/REMOVE/undo/import jako sekwencja wejść: nowa projekcja zmienia odpowiednie ekipy/dni, bez starych features i bez drugiej bazy. |
| O20 | Potwierdzenie, origin MANUAL/AUTO i releaseReason nie zmieniają geometrii ani przydziału; właściwy status/lock w properties, bez eksportowania konfiguracji dostawcy. |
| O21 | Wielokrotne wywołanie i deep-frozen wejścia: wynik deterministyczny, brak mutacji tablic sortowaniem. Trasy dekodowane do niezależnych features, nie zapisywane jako nowe przydziały. |
| O22 | Brak warstwy routingu: wizyty nadal obecne, routes puste, odpowiednia diagnostyka; żadnego fallbacku do prostej. |
| O23 | Test niezależności opcji widoku od filtrów kolejki: wyszukany jeden adres nie usuwa pozostałych koszyków dnia, chyba że użytkownik jawnie wyłączy je w warstwach. |

Osobne testy adaptera/Chrome (poza czystą funkcją): fallback bez WebGL i po worker/context error; async load/import/undo race; popup→edycja→fokus; zoom/obrót/pan na pełnym zbiorze; zgodność źródeł GL z projekcją po każdej akcji; satelita: brak żądań przed konfiguracją/opt-in, anulowanie i off/reload, odrzucony obcy origin, brak klucza w planie/logu, lokalna atrapa zamiast prawdziwego dostawcy; finalny file offline z wyłączonym HTTP/HTTPS i kontrolą rzeczywistego worker-src.

## Handoff

Nie pisano jeszcze testów O01–O23 ani modułów. Lista jest gotowa do T5 po przekazaniu publicznego API `operational-map.mjs` i jednoznacznych options/properties. P1 i P2 to ryzyka planu/integracji z dowodem w aktualnym kodzie lub lokalnej bibliotece, a nie deklaracja zreprodukowanych błędów nieistniejącej jeszcze finalnej implementacji MAP-06. Wykryte zmiany lidera w working tree pozostawiono nietknięte.
