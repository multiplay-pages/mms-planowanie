# Uruchomienie, testy i odtwarzanie danych

Wszystkie ścieżki poniżej są względem katalogu sklonowanego repozytorium. Nie są zależne od pierwotnej lokalizacji w OneDrive.

## Używanie gotowego planera

Otwórz `map05/planner-offline.html` zwykłym dwuklikiem. To aktualny planer z 109 adresami, 102 pozycjami, podkładem całego obszaru i lokalnymi drogami. Nie wymaga instalacji, klucza API ani dostępu do Internetu. Plik jest duży, około 69,5 MB, ponieważ zawiera regionalną mapę i komplet zapisanych wyników. Stary `map05/offline.html` ma 19 syntetycznych wpisów i służy porównaniu, nie jest najnowszym planerem.

Alternatywnie z katalogu repozytorium:

```text
python -X utf8 map05/serve.py
```

Następnie otwórz `http://127.0.0.1:8765`. `/` to planer; `/index.html` to stary demonstrator. Zatrzymanie: Ctrl+C. Nie otwieraj modułowego `planner.html` bez serwera, ponieważ importy/fetch plików mogą być blokowane dla `file:`. Wersja offline ma kod i dane osadzone i tego nie wymaga.

Adresy i dane dróg nie trafiają do serwera zewnętrznego. Serwer nie zapisuje planu; UI zapisuje go lokalnie w pamięci przeglądarki lub pliku JSON. Jeżeli pamięć jest wyłączona, komunikat kieruje do eksportu JSON. Przechowuj własną kopię planu przed zmianą przeglądarki lub czyszczeniem jej danych.

## Uruchomienie jednym kliknięciem (Windows)

Dwuklik w `Uruchom-planer.bat` (katalog główny repozytorium) startuje lokalny serwer (`127.0.0.1`) i otwiera planer pod `http://127.0.0.1:8765/`. Ten plik dopuszcza połączenie z serwerem ortofotomapy GUGiK (`https://mapy.geoportal.gov.pl`), dzięki czemu działają przyciski **Satelita** i **Hybryda**: zdjęcia są pobierane dopiero po wybraniu przycisku i zaznaczeniu zgody w oknie „Dostawca zdjęć” (wysyłany jest widoczny obszar mapy). `Uruchom-planer-bez-satelity.bat` uruchamia planer całkowicie bez połączeń zewnętrznych (Satelita/Hybryda wyłączone). Samodzielny plik `planner-offline.html` nigdy nie pobiera zdjęć. Okno z serwerem musi pozostać otwarte; jego zamknięcie zatrzymuje serwer — adres `127.0.0.1:8765` działa tylko, gdy serwer jest uruchomiony. Wymaga Pythona (`py` lub `python`). Bez Pythona plik otwiera samodzielną wersję `map05\planner-offline.html`, która nie wymaga serwera i można ją też otworzyć dwuklikiem.

## Mapa operacyjna MAP-06 (gałąź `map06-interactive-map`)

Planer (offline i `serve.py`) uruchamia interaktywną mapę MapLibre, jeżeli przeglądarka ma WebGL. W przeciwnym razie zostaje dotychczasowa mapa SVG. Mapa pokazuje wszystkie koszyki wybranego dnia: kolor ekipy, numer wizyty, koło dla instalacji, romb dla pomiaru. Pokazuje też trasy wyłącznie po zapisanych lokalnych drogach, nieprzydzielone zlecenia (szare) i listę braków danych. Panel obok mapy pozwala ukrywać koszyki i warstwy, a numerowana lista wizyt obsługuje klawiaturę. Kliknięcie punktu → „Edytuj w planerze”.

Domyślnie aplikacja nie wykonuje żadnych żądań zewnętrznych. Zdjęcia satelitarne (Satelita/Hybryda) to opcja wymagająca trzech kroków:

1. Uruchom serwer z jawnie dopuszczonym originem dostawcy, np. `python -X utf8 map05/serve.py --allow-tile-origin https://mapy.geoportal.gov.pl`. Plik offline nie pobiera zdjęć.
2. W planerze wybierz „Dostawca zdjęć…”, ustaw adres kafli i atrybucję, zaznacz zgodę na wysyłanie widocznego obszaru. Klucz API zostaje tylko w `localStorage` tej przeglądarki.
3. Wybierz „Satelita” lub „Hybryda”. Powrót do „Drogowa” usuwa źródło rastrów i zatrzymuje żądania.

Aktualizacja vendorowanego MapLibre (świadoma, z sieci npm): `cd map05 && npm ci` → `python -X utf8 map05/vendor_maplibre.py` → przegląd diffu → build. Sprawdzenie bez sieci: `python -X utf8 map05/vendor_maplibre.py --check`.

Scenariusze akceptacyjne MAP-06 w Chrome: `evidence/2026-11-17-map06/scripts/map06.mjs` (instrukcja jak dla `scenarios.mjs`, do testu satelity atrapa `mock_tiles.py 8791` i drugi serwer z `--allow-tile-origin http://127.0.0.1:8791`).

## Środowisko deweloperskie

Testowane lokalnie: Python 3.12.10, Node.js 26.13.0, openpyxl 3.1.5 i happy-dom 21.0.3. Użyj wybranego środowiska Python; nie zmieniaj globalnej instalacji bez potrzeby. `requirements-dev.txt` dotyczy importera/testów XLSX. Aplikacja uruchamia się bez openpyxl i npm.

Jednorazowe przygotowanie do pełnych testów:

```text
python -m pip install -r requirements-dev.txt
python -X utf8 map05/prepare_assets.py
cd map05
npm ci --ignore-scripts
cd ..
```

`prepare_assets.py` nie pobiera danych. Weryfikuje/odtwarza dwa duże publiczne wejścia JSON z `.json.gz` znajdujących się w repo. Sprawdza dozwolone ścieżki, rozmiary i hashe, a zmienionego lokalnego pliku nie nadpisuje. Ten krok jest potrzebny po świeżym clone przed pełnymi testami źródeł lub przeliczaniem grafu. Używanie gotowego HTML nie wymaga go.

## Pełne sprawdzenia

Z katalogu `map05`:

```text
npm test
npm run build
```

Z katalogu głównego repo:

```text
python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v
python -X utf8 -m unittest discover -s map04/tests -v
```

`npm run test:planner` jest podzbiorem `npm test`, nie dodatkową niezależną liczbą testów. Bieżące wyniki i dokładną liczbę sprawdzeń odczytuj z `map05/VERIFICATION.md`.

Nie ma komendy TypeScript/typecheck ani lint. Dodatkowo stosowano `node --check` do modułów i połączonych skryptów offline oraz `ast.parse` do źródeł Python. Testy dostarczania kontrolują zgodność osadzonych danych i hashy CSP. Nie uruchamiaj pobierania map ani geokodowania jako części testów.

## Zawężone sprawdzenia

```text
node --test map05/tests/routes.test.mjs map05/tests/planner-routing.test.mjs
node --test map05/tests/planner-map.test.mjs map05/tests/map.test.mjs
node --test map05/tests/real-routes.test.mjs
node --test map05/tests/planner-ui.test.mjs
python -X utf8 -m unittest discover -s map05/tests -p test_local_routing.py -v
python -X utf8 -m unittest discover -s map05/tests -p test_osm_pbf.py -v
python -X utf8 -m unittest discover -s map05/tests -p test_delivery.py -v
```

Ostatni plik sprawdza prawdziwy handler HTTP w pamięci bez gniazd i artefakty offline. Testy UI uruchamiają zaufany kod z wyłączoną nawigacją, siecią i rendererem graficznym; nie dowodzą wyglądu w Chrome.

## Odbudowanie artefaktów bez nowych zapytań

```text
python -X utf8 map05/prepare_assets.py
python -X utf8 map05/data/import_uug.py
python -X utf8 map05/build_local_routes.py
cd map05
npm run build
```

Importer GUGiK czyta zapisane odpowiedzi. Builder dróg czyta lokalny graf i pozycje. Jeżeli ich hashe się nie zmieniły, używa checkpointów wierszy. Build offline sprawdza źródłowy XLSX, odpowiedzi GUGiK, graf i silnik. Nie maskuj błędu hashy zmianą oczekiwanej wartości: ustal, które wejście zmieniono i dlaczego.

Ponowne wyliczenie samych dróg nie jest potrzebne po zmianie CSS lub zwykłego tekstu UI. Zmiana profilu/algorytmu Python unieważnia wyniki i wymaga przeliczenia. Zmiana reguł koszyka w JS wymaga testów i nowego HTML, ale nie nowego publicznego pobrania OSM.

## Odzyskanie pełnego publicznego wejścia z PBF

To ścieżka dla świadomego odświeżenia danych, nie zwykłego uruchomienia. W repo znajduje się już dokładny przetworzony graf w gzip. Publiczne PBF to około 555 MB cache i nie są przechowywane w Git.

```text
python -X utf8 map05/basemap/download_pbf.py
```

Bez flagi dostajesz tylko DRY RUN. Dopiero jawne `--execute` pobiera stałe publiczne pliki województw, bez danych zleceń:

```text
python -X utf8 map05/basemap/download_pbf.py --execute
python -X utf8 map05/basemap/extract_pbf.py
python -X utf8 map05/basemap/compact_map.py
python -X utf8 map05/build_local_routes.py
python -X utf8 map05/pack_public_assets.py
```

PBF `latest` może się z czasem zmienić. Manifest zawiera hashe użytej wersji; nie nazywaj nowego pliku tym samym snapshotem. Downloader nie nadpisuje zmienionego istniejącego pełnego pliku. Najpierw uzgodnij aktualizację źródła i zachowaj stary stan. Parser/ekstraktor nie wykonują sieci. Nie wracaj do nieudanych zapytań Overpass tylko po to, aby odtworzyć istniejącą geometrię.

## Geokodowanie

`import_geocoding.py` i `import_uug.py` są lokalnymi importerami zapisanych wyników. `fetch_uug.py` domyślnie nie wysyła niczego. Istniejące 109 wejść jest już rozliczone; 7 punktów ma pozostać bez pozycji zgodnie z decyzją użytkownika. Nie uruchamiaj `--execute` ani nowych dostawców jako automatycznej „naprawy” po clone.

Nie ma i nie powinno powstać wywołanie OSRM/ORS podczas działania aplikacji. Użytkownik wybrał obliczenia lokalne.

## Scenariusze dla prawdziwej przeglądarki w dozwolonym środowisku

1. Desktop: otwórz aktualny artefakt. Sprawdź czytelność kolejki, koszyków, szczegółów i 102 punktów; 7 nieustalonych i 6 uwag kodu są jawne.
2. Wybierz adres poza Opolem, kliknij „Wybrany adres”, przybliż i przesuń. Ulice i etykiety muszą być lokalne dla tego miejsca; wyjście do całego zakresu ma działać.
3. Zmień dzień, pojemność ekipy, typ i zakres. Generuj koszyki; kolejka jest niezależna od dnia, a przyczyny nieprzydzielenia są widoczne.
4. Wybierz „Mapa” koszyka. Sprawdź ciągłość drogi, kolejność wizyt i wyniki 30 km/+10 km/okien. Nieznanych odcinków nie wolno dorysować.
5. Przenieś wizytę, wróć do kolejki, cofnij, wyłącz zajęty slot. Błędna operacja nie może częściowo zmienić planu. Usunięcie środkowej wizyty nie może pogorszyć chronionego źródłowego koszyka.
6. Potwierdź okno, regeneruj, spróbuj przenieść. Ochrona działa; zwolnienie wymaga powodu.
7. Zapisz JSON, otwórz drugi czysty widok i wczytaj. Sprawdź rzeczywiste pobranie i odtworzenie; nie testuj na jedynej kopii swojego planu.
8. Węższy ekran: brak utraty kontrolek, panele układają się pionowo, tabele przewijają, teksty pozostają czytelne.
9. Klawiatura: Tab/Shift+Tab, Enter/spacja na punktach, strzałki/+/−/Home na mapie, przywracanie fokusu po zmianach i dialog resetu.
10. Zapisz dowody: screenshoty desktop/wąsko, błędy konsoli, błędy strony, nieudane żądania, użyty commit/artefakt i zakres testów. Nie uznawaj samego załadowania HTML za pełny PASS.

Stan 17.11.2026: wszystkie 10 scenariuszy wykonano w prawdziwym Chrome 157 dla widoku modułowego i pliku offline — 10/10 PASS w każdym wariancie. Wyniki, zrzuty i ograniczenia: `evidence/2026-11-17-browser/README.md`. W poprzednim runtime lokalne testy Browser Use były odrzucone polityką narzędzia. Każde nowe środowisko sprawdza własne uprawnione narzędzia; nie ma zgody na obchodzenie odmowy.

### Automatyczne powtórzenie scenariuszy w Chrome

Skrypty są w `evidence/2026-11-17-browser/scripts/`. Wymagają lokalnie zainstalowanego Chrome i pakietu `playwright-core`, zainstalowanego **poza repozytorium**, bez pobierania przeglądarek. Ścieżkę Chrome ustawia `lib.mjs`. Każdy przebieg tworzy nowy tymczasowy profil, więc nie dotyka planu w przeglądarce użytkownika.

```text
# w osobnym katalogu roboczym, np. %LOCALAPPDATA%\mms-e2e
npm install playwright-core@1.65.1
copy <repo>\evidence\2026-11-17-browser\scripts\*.mjs .
# serwer w drugim terminalu: python -X utf8 map05/serve.py
set EVID=<katalog wyników>
node scenarios.mjs http://127.0.0.1:8765/ served
node scenarios.mjs file:///<repo>/map05/planner-offline.html offline
node perf.mjs file:///<repo>/map05/planner-offline.html offline
```

Wynik: `results-<tag>.json` z oczekiwanym/rzeczywistym rezultatem, statusem i dowodem dla każdego scenariusza oraz pełnym logiem konsoli i żądań. Do tego zrzuty PNG. Skrypt rejestruje każde żądanie spoza `127.0.0.1`/`file:` jako błąd S10. Samo przejście skryptu nie zastępuje obejrzenia zrzutów: B1 (zasłonięte ulice) przechodził kontrole liczbowe i był widoczny dopiero na obrazie.

## MAP-06.1: rozmiar pliku, worker kafli i ponowne pomiary

- `python -X utf8 map05/build_planner.py` (z katalogu głównego) buduje `planner-offline.html` ≈ 32,4 MB: bloki `basemap-data` i `routing-data` są spakowane gzip+base64 i rozpakowywane w przeglądarce (`DecompressionStream`: Chrome 80+, Firefox 113+, Safari 16.4+). Kafle dróg liczy Web Worker; w `file://` jest to worker z adresu `blob:`, w `serve.py` worker modułowy.
- Ręczny test w Windows: otwórz `map05\planner-offline.html` w Chrome lub Firefoksie (dwuklik lub `file:///…`), poczekaj ok. 1–3 s na planer, wybierz dzień 2026-11-19, „Generuj”, potem przesuwaj i przybliżaj mapę. Jeśli przeglądarka nie ma WebGL/Workera, zobaczysz komunikat i mapę uproszczoną SVG.
- Skrypty Chrome/Firefox są w `evidence/2026-11-18-map061/scripts/` (instalacja `playwright-core` jak wyżej; Firefox przez WebDriver BiDi, bez dodatkowych pakietów):

```text
node map061.mjs file:///<repo>/map05/planner-offline.html http://127.0.0.1:8765/
node map061-touch.mjs file:///<repo>/map05/planner-offline.html offline
node firefox-bidi.mjs file:///<repo>/map05/planner-offline.html http://127.0.0.1:8765/
node map061-perf.mjs <url> <znacznik-before|after> <numer-przebiegu>
node aggregate-perf.mjs <katalog z wynikami>
```

- Ścieżkę mapy SVG (bez WebGL) sprawdza się, uruchamiając Chrome z `CHROME_ARGS="--disable-gpu --disable-3d-apis --disable-webgl"` i `scenarios.mjs`.
- Przy aktywnym WebGL scenariusze `scenarios.mjs` S1, S2, S4 i S9 (części dotyczące mapy SVG) nie mają zastosowania — mapę SVG zastępuje mapa operacyjna; zob. `evidence/2026-11-18-map061/README.md`.
- Bieżące liczby: `npm test` 140, `unittest map05` 82, `unittest map04` 24.
- Licencje i pochodzenie danych: `docs/ZRODLA-DANYCH-I-LICENCJE.md`.

## MAP-07B: optymalizacja między koszykami (gałąź `map07b-cross-basket-optimization`)

Karta „Optymalizacja między koszykami” w planerze (serwer lub `planner-offline.html`) wymaga lokalnych dróg. Wynik to symulacja — plan zmienia się dopiero po akceptacji w oknie potwierdzenia (cofnięcie: „Cofnij zmianę”).

```
cd map05
npm test                                   # 164 testów, w tym tests/optimizer.test.mjs
node benchmark-optimizer.mjs               # tabela MAP-06 / MAP-07A / MAP-07B (REPEATS=3 node ... dla mediany)
node benchmark-optimizer.mjs --json out.json
node benchmark-examples.mjs COVERAGE_FIRST # konkretne koszyki przed/po
```

Po zmianie `planner.mjs` lub `optimizer.mjs` odbuduj plik offline (`python -X utf8 map05/build_planner.py`); test „offline bundle” wykrywa kolizje nazw w jednym zakresie skryptu. Opis: `docs/MAP07B-OPTYMALIZACJA.md`.
