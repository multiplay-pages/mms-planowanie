# T6 — niezależny code review MAP-06

17.11.2026, Codex CLI. Gałąź `map06-interactive-map`, baza `0c2a0a8`, niezacommitowany stan przekazany do review. **Werdykt dla tego stanu: CHANGES REQUESTED.** Nie ma ustalenia P1; przed odbiorem pozostają potwierdzone P2 poniżej. To nie jest zgoda na merge/push do main.

Zakres: cały kod MAP-06, integracja, kontrakty dostarczania, vendor, dokumentacja, skrypty i zapisane dowody Chrome. Bez sieci, buildu, commit/push i zmian kodu. Jedyny zapis T6 to ten raport. Numery linii odnoszą się do stanu odczytanego przed poprawkami review. Lider jest właścicielem implementacji i późniejszych poprawek.

## Niezależna weryfikacja

| Polecenie | Wynik |
| --- | --- |
| `npm test` w map05 | **121/121 PASS**, 0 FAIL, 0 skipped; exit 0; 22,43 s |
| `python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v` | **82/82 PASS**, exit 0; 13,96 s |
| `python -X utf8 -m unittest discover -s map04/tests -v` | **24/24 PASS**, exit 0 |

Łącznie **227/227 PASS**. Python uruchomiony z `PYTHONDONTWRITEBYTECODE=1`. Weryfikacja odczytowa artefaktu: **71 294 188 B**, SHA256 **74e780e750812a70c9a4f4021212d181443e94a60b82835593cfbb36ef2b1579** — zgodne z przekazaniem. Nie uruchamiałem buildu. Wyniki poleceń otrzymano w terminalu, bez dodatkowych plików logów.

Nie wykonywałem nowego przebiegu Chrome. Odczytałem skrypty, JSON i logi lidera, obejrzałem zapisane PNG `served/M1-served-all-baskets.png` i `offline/M10-offline-mobile.png`. Jest to kontrola zapisanych dowodów, nie własny test wizualny.

## Potwierdzone ustalenia

### F1 — P2: popup zachowuje nieaktualny przydział po zmianie planu

`map05/maplibre-view.mjs:96`–`:105`, `:117`–`:121`.

Popup tworzy tekst raz z klikniętego feature. `update()` zamyka go tylko, jeśli orderId zniknie jednocześnie z visits i unassigned. Powrót do kolejki przenosi ten sam ID między kolekcjami, więc popup nadal pokazuje poprzednią ekipę, numer, okno i status. Analogicznie zmiana ekipy/okna/potwierdzenia w obrębie dnia nie aktualizuje tekstu. To narusza synchronizację mapy z jedynym planem.

Reprodukcja wykonana bez sieci: rzeczywisty `createOperationalMapView`, DOM z Happy DOM oraz kontrolowane atrapy Map/Popup; `Map.queryRenderedFeatures()` zwraca TEST-001 przypisany do TEST-01, okno 08:00–11:00. Po kliknięciu wywołano:

```js
await view.update({visits:fc([]), routes:fc([]),
  unassigned:fc([queueFeatureWithSameOrderId])});
```

Oczekiwane: popup odświeżony do kolejki albo zamknięty. Rzeczywiste: `popupClosed=false`, tekst nadal `Koszyk TEST-01 · wizyta nr 1 · 08:00–11:00`. Atrapa rejestruje DOM i `remove()`, bez implementowania produkcyjnej logiki popupu.

Poprawka: wiązać popup z aktualnym feature i odświeżać albo zamykać przy zmianie jego danych/rodzaju. Testy: REMOVE, ASSIGN w tym samym dniu, CONFIRM/UNCONFIRM, import/undo; samo zaznaczenie tego samego feature nie powinno usuwać właśnie otwartego popupu.

### F2 — P2: URL z userinfo przechodzi walidację, a komunikat zachowuje hasło

`map05/maplibre-view.mjs:11`, `:18`–`:27`, `:112`.

Wykonana minimalna reprodukcja z fikcyjnymi danymi:

```js
const url='https://review-user:review-password@tiles.example/{z}/{x}/{y}.png';
validateSatelliteConfig({url,consent:true,attribution:'Test'},
  ['https://tiles.example']); // {ok:true, origin:'https://tiles.example'}
let error; try { new Request(url); } catch(e) { error=e.message; }
maskSecrets(error).includes('review-password'); // true
```

Oczekiwane: odrzucenie username/password oraz brak poświadczeń w komunikatach. Rzeczywiste: konfiguracja zaakceptowana; konstrukcja Request odrzuca ją jako URL z poświadczeniami, a obecne maskowanie parametrów query pozostawia hasło w tekście błędu. Nie wykonano fetch ani połączenia z dostawcą. Użyte wartości są wyłącznie fikcyjne.

Poprawka: odrzucić `url.username` / `url.password` przed zapisaniem i użyciem konfiguracji; obronnie maskować userinfo w komunikatach. Dodać test walidatora i maskowania. Zachować obsługę jawnych kluczy klienta w oddzielnej konfiguracji, bez planu/eksportu.

### F3 — P2: valid_origin przyjmuje fragmenty HTML/CSP i nieprawidłowy port

`map05/serve.py:53`–`:58`, `:77`–`:78`.

Import rzeczywistego modułu przez importlib i bezpośrednie wywołanie `valid_origin` dały ACCEPTED dla każdego z:

```text
https://tiles.example;report-uri
https://tiles.example:invalid
https://tiles.example" data-review="1
```

Oczekiwane: argparse odrzuca wartości, które nie są poprawnym, znormalizowanym originem. Rzeczywiste: zwraca niezmienione netloc; wartość jest następnie surowo interpolowana do nagłówka CSP, meta CSP i atrybutu HTML. `urlsplit` rozdziela URL, ale nie waliduje hosta ani portu. Można wprowadzić dodatkowe atrybuty/dyrektywy zamiast jednego originu.

To wejście CLI zaufanego operatora; **nie jest to dowód zdalnego exploita**. Jest to niespełniony kontrakt ścisłej allowlisty z T4 i błąd generowania HTML. Poprawka: walidować host/port i zakazane znaki, normalizować origin, odrzucać userinfo/wildcard/whitespace/CRLF/średnik/cudzysłowy; dodatkowo escapować wartość w meta HTML. Dodać negatywne przypadki do test_delivery.py, zachować HTTPS i jawny loopback HTTP.

### F4 — P2: początkowy błąd workera/mapy nie uruchamia fallbacku SVG

`map05/maplibre-view.mjs:78`–`:82`, `:112`–`:114`; `map05/planner.mjs:310`–`:320`.

SVG jest ukrywany przed `await opView.ready`. Promise `ready` rozwiązuje się wyłącznie na `load`; zdarzenie `error` wywołuje tylko onError, nie odrzuca Promise ani nie wywołuje onFatal. Jeśli worker nie wystartuje, planner pozostaje przy nieukończonym WebGL zamiast mapy uproszczonej.

Reprodukcja rzeczywistego adaptera z kontrolowaną Map: przed load wysłano `error(new Error('Initial local map load failed'))`. Po przejściu mikrozadań i 25 ms: `readyAfterInitialError='pending', onError=1, onFatal=0`. To nie jest test timeoutu, lecz sprawdzenie braku ścieżki zakończenia po obsłużonym błędzie. Lokalny kod konkretnego vendora `node_modules/maplibre-gl/src/util/actor.ts:275`–`:276` potwierdza, że błąd ładowania workera emituje map.error z tekstem `Worker failed to load. Check that the worker URL is correct.`

Poprawka: odrzucać inicjalizację lub uruchamiać fallback przy krytycznym błędzie przed load, z ograniczeniem oczekiwania i cleanup. Późniejszy pojedynczy błąd rastra dostawcy nie musi niszczyć mapy lokalnej. Test: początkowy worker error → SVG, edycja planu nadal działa; późniejszy błąd satelity → komunikat/powrót do drogowej. Ścieżki brak WebGL i contextlost są już obsłużone.

### F5 — P2: niepełne noty dystrybucji zależności i standalone

`map05/vendor/maplibre-gl/THIRD-PARTY-NOTICES.md:3`–`:28`, `map05/vendor_maplibre.py:16`, `map05/build_planner.py:21`–`:41` i składanie wynikowego HTML.

Notices zawiera tabelę nazw i identyfikatorów licencji, bez pełnych wymaganych not zależności. Lokalny `node_modules/@mapbox/tiny-sdf/LICENSE.txt` zawiera copyright `2016–2024 Mapbox, Inc.` oraz warunki/disclaimer BSD-2, których nie ma w vendor mjs ani notices. Podobnie samo wskazanie MIT/ISC nie dostarcza tekstów not.

Osobny samodzielny `planner-offline.html` ma komentarz z URL licencji MapLibre, lecz nie zawiera copyright `Copyright (c) 2023, MapLibre contributors`, warunków redystrybucji ani pełnych not zależności. Wszystkie trzy dokładne sprawdzenia stringów: false. Lokalny vendor/LICENSE.txt ma pełne warunki wymagające reprodukcji copyright/warunków/disclaimer w dystrybucji.

Poprawka oparta na lokalnych plikach, bez sieci: zebrać pełne noty licencji rzeczywiście dołączonych runtime dependencies, zapisać je deterministycznie w vendor/notices (objąć manifestem) oraz osadzić pełne notices i główną licencję w samodzielnym HTML, np. jako tekst w sekcji „Licencje”. Testować treść, nie tylko istnienie stringa BSD w pliku obok. To ustalenie o kompletności materiałów repo względem dostarczonych licencji, nie opinia o warunkach usług satelitarnych.

### F6 — P3: dwie asercje Chrome są zbyt słabe dla deklarowanego dowodu

`evidence/2026-11-17-map06/scripts/map06.mjs:113`–`:118`, `:129`–`:139`.

M6 `planSame` porównuje dwa odczyty assignments wykonane dopiero po zmianie warstw. Obie strony są stanem po operacji, więc nie wykrywa mutacji planu wywołanej togglami. Zapisać plan przed pierwszym toggle i porównać z planem po całej sekwencji.

M4 oblicza `removed`, lecz nie używa go w warunku PASS; wyjątek kliknięcia remove jest ignorowany. Porównanie mapy z niezmienionym planem przejdzie także wtedy, gdy akcja wcale nie nastąpi. Wymagać faktycznego REMOVE i odpowiedniej zmiany kolejki/tras albo jawnie zweryfikowanej odmowy z niezmienionym planem. Dla tego znanego, niepotwierdzonego zlecenia test powinien wymagać skutecznego usunięcia.

Dodatkowa granica dowodów: listener requestfailed w tym skrypcie pomija wszystkie blob URL. Raport „0 nieudanych” jest więc liczbą po tym filtrze; krytyczny blob/worker warto logować osobno. Nie wykazałem faktycznej pominiętej awarii w obecnym przebiegu.

## Ocena reszty implementacji i zamknięcia T4

- Czysta projekcja nie zapisuje planu ani drugiej bazy przydziałów. Kolejność i numeracja pochodzą z assessBasket; filtry kolejki dotyczą tylko unassigned; przypisanie w dowolnym dniu wyklucza z kolejki. Pokrywają to 29 niezależnych testów T5.
- Nogi tras są osobnymi LineString tylko po statusie OK i poprawnym decodeRouteGeometry. Błędna geometria i brak drogi są raportowane; nie ma zastąpienia prostą. Źródłowe dane/model/routing/reguły nie mają diffu.
- CSP offline jest świadomie zmieniona na pamięciowe blob/data, bez HTTP/HTTPS, unsafe-eval i zewnętrznych glyph/style/sprite. Vendor pin i hashe są sprawdzane. Dwie CSP served są rozszerzane razem; brak walidacji z F3 pozostaje do naprawy.
- Satelita nie jest źródłem przed zgodą/konfiguracją/allowlistą; domyślny i odświeżony widok startują na drogowej. Powrót do drogowej usuwa source rastra. localStorage konfiguracji jest oddzielony od planu/JSON. F2 pozostaje otwartą granicą wejścia.
- Popup używa textContent, atrybucja jest escapowana przed przekazaniem MapLibre. Nie znaleziono niebezpiecznego wstawienia tych pól jako aktywnego HTML.
- Numerowana lista daje alternatywę klawiaturową, render panelu następuje przed przywróceniem fokusu. Stored PNG pokazują listę pod mapą w mobile. Nie jest to dowód testu czytnika ekranu/dotyku ani pełnego audytu dostępności.
- MVT używa indeksu przestrzennego, filtrowania klas, przycinania i FIFO 25 000. Test encoder–niezależny decoder jest sensowny. Brak abort i generowanie na głównym wątku pozostają ograniczeniem; nie traktuję zmierzonej klatki 401 ms jako nowego ukrytego błędu, bo jest jawnie opisana. Pomiar dokumentuje 183 MB po starcie i 356 MB po objeździe, nie dowodzi braku wycieku po długiej pracy ani budżetu urządzeń mobilnych.
- P1 worker/file/CSP z T4 jest zamknięte dla normalnego startu przez zapisany Chrome offline. P2 lifecycle/fallback jest zamknięte częściowo — F1/F4 pozostały. Licencje wymagały doprecyzowania w T4; F5 pokazuje konkretny brak w rezultacie.

## Spójność dowodów i prywatność

JSON lidera: served **14 PASS / 0 FAIL**, offline **13 PASS / 0 FAIL**, regresja SVG **10 PASS / 0 FAIL**. Sieć served: 78 zdarzeń, 4 kafle atrapy loopback; external/failed/console/pageErrors puste. Offline: 5 zdarzeń, 0 kafli, pozostałe tablice puste. Skrypty łączą logi profili głównego, dostawcy i fallbacku. Ograniczenia asercji i filtrów opisano w F6.

Logi testów i nowe tabele dokumentacji są zgodne z 121+82+24. Perf JSON i README są zgodne: firstIdle 3693 ms, 10 przelotów, najgorsza klatka 401 ms, peak 356 MB. Dokumentacja uczciwie ogranicza dowód do prototypu i lokalnego mocka; nie testuje faktycznego zewnętrznego dostawcy. Uwaga redakcyjna: `VERIFICATION.md:3` nadal nazywa historyczne 86/80/24 „STATUS AKTUALNY”, mimo nowej sekcji MAP-06 poniżej.

Skan tekstowych dowodów nie znalazł nazwy lokalnego użytkownika/OneDrive ani prywatnych ścieżek profili. Generyczna ścieżka instalacji Chrome w skrypcie nie jest ścieżką użytkownika. `SECRET123` w skrypcie to jawna atrapa klucza lokalnego PNG; nie znaleziono rzeczywistych sekretów. Plany/eksporty używają testowych ID. Zgoda użytkownika na publiczne źródłowe adresy i współrzędne nie jest rozszerzana na nowych dostawców.

Nie znaleziono zmiany datasetId, źródłowych XLSX/CSV, fixture MAP-04, ID zleceń, schematu v1, lokalnego silnika dróg, zasad 30 km/+10 km ani regresji A→B 20 / B→C 20 / A→C 40. Nie wykonywano połączeń OSRM/ORS/geokodowania. Nie wykonano publikacji ani integracji z main.

## Re-check 9af3f3f

17.11.2026, zadanie T7. Oceniany commit: `9af3f3f06443c937a3a8bc9e3e604fc3d75579e0` na `map06-interactive-map`. Drzewo było czyste na początku kontroli. **Werdykt: CHANGES REQUESTED — F1 i F5 zamknięte częściowo; F2, F3, F4 i F6 zamknięte.** Późniejsze równoległe zmiany lidera w working tree nie są objęte tym werdyktem.

| Ustalenie | Wynik ponownej kontroli |
| --- | --- |
| F1 popup | Tekst ekipy/okna/kolejki jest już odświeżany, a opuszczenie mapy zamyka popup. Pozostała nowa regresja P2 fokusu opisana niżej. |
| F2 userinfo | Zamknięte: username/password odrzucane, maskSecrets usuwa userinfo; nowy test regresji PASS. |
| F3 origin | Zamknięte: regex odrzuca cytowane HTML/CSP, whitespace i niepoprawny port; negatywne przypadki PASS. Nadal tylko jawne HTTPS/loopback HTTP. |
| F4 fallback | Zamknięte dla zgłoszonej awarii: błąd startowy bez sourceId/tile odrzuca ready i trafia do istniejącego catch → SVG; błędy kafli nie odrzucają ready. Nowy test PASS. Nie jest to dowód obsługi awarii bez żadnego zdarzenia/timeoutu. |
| F5 licencje | Główna licencja MapLibre i pełne teksty plików LICENSE zależności są dodane do manifestu i standalone. Jeden pełny tekst MIT w README został pominięty — poniżej. |
| F6 dowody | Zamknięte: M4 wymaga skutecznego usunięcia z planu i mapy; M6 porównuje snapshot przed przełączeniem ze stanem po wyłączeniu; blobFailed jest logowane i objęte warunkiem M13. |

**Pozostałość F1 — P2:** w tym commicie `map05/maplibre-view.mjs:139` bezwarunkowo odtwarza popup przez `setDOMContent` przy każdym update, nawet gdy dane nie uległy zmianie. Rzeczywisty vendor `src/ui/popup.ts:532` wywołuje przy tym `_focusFirstElement()`; opcja focusAfterOpen jest true. Może to po asynchronicznym update odebrać fokus formularzowi/checkboxowi, już przywrócony przez renderPlanner.

Reprodukcja wykonana z kodem adaptera pobranym bezpośrednio przez `git show 9af3f3f:map05/maplibre-view.mjs` i importowanym w pamięci (żadnego zapisu kodu). Użyto rzeczywistego vendored Popup w Happy DOM; atrapa dotyczyła Map i mocowania kontenera popupu, nie `setDOMContent` ani funkcji fokusu. Kliknięcie wizyty → fokus zewnętrznego input `op-layer-checkbox` → `await view.update(identyczneWarstwy)` daje:

```json
{"commit":"9af3f3f","before":"op-layer-checkbox","after":"Edytuj w planerze","focusStolen":true,"sameSemanticData":true}
```

Oczekiwane: fokus pozostaje na input. Poprawka: pomijać przebudowę bez zmiany danych oraz zachować fokus poza popupem podczas koniecznej aktualizacji. Potrzebny test otwartego popupu z aktywnym checkboxem/listą/formularzem. Lider rozpoczął taką poprawkę równolegle; jej ostateczny stan wymaga osobnej kontroli.

**Pozostałość F5 — P2:** `map05/vendor/maplibre-gl/THIRD-PARTY-LICENSES.txt:669` zamiast pełnej noty murmurhash-js zawiera tylko „No license file ... package.json declares license MIT and author Gary Court”. Pełny tekst jest dostępny lokalnie w `map05/node_modules/murmurhash-js/README.md:32`–`:40`: copyright 2011 Gary Court, zgoda MIT, wymóg zachowania noty i disclaimer. `vendor_maplibre.py:33` szuka wyłącznie nazw LICENSE/LICENCE/COPYING, dlatego sekcja README nie trafia do not ani standalone. Uzupełnić z tego lokalnego źródła, bez sieci.

Niezależne testy ponowione po rozpoczęciu kontroli czystego commitu: **npm 124/124 PASS** (19,33 s), **Python MAP05 82/82 PASS** (12,44 s), **MAP04 24/24 PASS** (0,002 s), razem **230/230**, exit 0. Artefakt ocenianego commitu: **71 342 164 B**, SHA256 **b700387a2fb247a6bd4d0b34998ff1c5d40e52ca8912539ac42ddf17d1ce72cf**. Osadzony blok #third-party-licenses jest dokładnie sumą LICENSE.txt + THIRD-PARTY-LICENSES.txt i ma własny zgodny hash w CSP.

Zaktualizowane zapisane dowody lidera: served **14/14**, offline **13/13**, SVG **10/10**; blobFailed/failed/external/console/pageErrors puste; served 78 zdarzeń i 4 kafle atrapy, offline 5 zdarzeń i 0 kafli. M4 jawnie raportuje skuteczne usunięcie z planu. Nie wykonywałem własnego Chrome, buildu, sieci, commit/push ani zmian kodu. Jedynym zapisem ponownej kontroli jest ten dopisek.

## Re-check a1fead2 — zamknięcie F1, pozostałość F5

17.11.2026, kontynuacja T7. Commit `a1fead227edcdc0b9bd59b9ba2d32d83ddf7e913`, czyste drzewo na początku kontroli. **F1 zamknięte wraz z regresem fokusu. Końcowy werdykt dla F1–F6 na tym commicie: CHANGES REQUESTED wyłącznie przez pozostałość F5.** F2/F3/F4/F6 zachowują wcześniejsze zamknięcie.

Adapter porównuje sygnaturę bez selected i przy koniecznym odświeżeniu przywraca aktywny element spoza popupu (`maplibre-view.mjs:104`, `:139`–`:144`). Niezależny od nowych testów lidera replay z kodem odczytanym przez `git show a1fead2:map05/maplibre-view.mjs`, rzeczywistym vendored Popup oraz Happy DOM: **4/4 PASS** — selected bez przebudowy, zmiana ekipy + confirmed z aktualizacją tekstu, powrót do kolejki, zniknięcie z mapy. W każdym przypadku zewnętrzny input zachował fokus. Atrapy dotyczyły Map i mocowania popupu, nie vendorowego setDOMContent/focus.

Niezależnie ponowiono pełne zestawy: **npm 125/125 PASS** (18,09 s), **Python MAP05 82/82 PASS** (12,06 s), **MAP04 24/24 PASS** (0,002 s), razem **231/231**, exit 0. Bez Chrome/buildu/sieci/commit/push; jedyny zapis to raport.

**Nadal otwarte F5 — P2:** `vendor/maplibre-gl/THIRD-PARTY-LICENSES.txt:669` zawiera zastępczy opis „No license file ... MIT ... Gary Court”. Pełny tekst MIT jest w lokalnym `node_modules/murmurhash-js/README.md:32`–`:40`, ale collector go nie pobiera. `a1fead2` nie zmienia collectora ani tej noty. Należy włączyć ten lokalny tekst do vendor/notices i odświeżyć osadzony blok samodzielnego HTML. To jedyny pozostały punkt blokujący APPROVE z tego review.

## Re-check 7f825b8

18.11.2026, zamknięcie T7/T8. Commit `7f825b897ee562d82b7e6c5b50982e0101a9d787`, gałąź `map06-interactive-map`, czyste drzewo przed dopiskiem. **Werdykt końcowy: APPROVE. Wszystkie F1–F6 zamknięte; brak pozostałych ustaleń blokujących z T6/T7/T8.** To ocena prototypu na gałęzi, nie zgoda na merge/push do main ani deklaracja gotowości produkcyjnej.

F5 potwierdzone odczytem i niezależnymi asercjami: collector pobiera sekcję License z lokalnego README przy braku pliku LICENSE; pełny tekst sekcji murmurhash-js (copyright 2011 Gary Court, MIT i disclaimer) jest dokładnie zawarty w THIRD-PARTY-LICENSES.txt. Placeholder „No license file” nie występuje. Wszystkie hashe manifestu są zgodne. Blok #third-party-licenses w standalone jest dokładną konkatenacją głównej licencji i pełnych not zależności, z poprawnym własnym hashem w CSP. Wzmocniony test_delivery wymaga konkretnej noty copyright i braku placeholdera.

Kod adaptera, integracji, projekcji, modelu, kafli, źródłowych danych i MAP-04 nie zmienił się od ocenionego a1fead2; wcześniejsze zamknięcie F1/fokusu oraz F2/F3/F4/F6 pozostaje aktualne. Nie znaleziono nowej regresji w zakresie poprawki.

Ponowiona niezależna weryfikacja: **npm test 125/125 PASS** (22,34 s), **unittest MAP05 82/82 PASS** (14,39 s), **unittest MAP04 24/24 PASS** (0,002 s), razem **231/231**, 0 FAIL, exit 0. Artefakt: **71 343 809 B**, SHA256 **b0b37f91ddf2814245331f8988e000c07a725c518d8d47bd1af91884fbf14b9f**, zgodny z README i VERIFICATION.

Zapisane dowody Chrome lidera nadal spójne: served **14/14**, offline **13/13**, SVG **10/10**; failed/blobFailed/external/console/pageErrors puste. Nie wykonywałem nowego Chrome ani buildu. Zachowują ważność opisane ograniczenia prototypu: koszt MVT na głównym wątku, pomiar pamięci na jednym środowisku, brak rzeczywistego dostawcy satelity i pełnego audytu dostępności. Bez sieci, commit/push i zmian kodu; jedyny zapis to ten dopisek.
