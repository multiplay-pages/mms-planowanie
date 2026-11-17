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

W poprzednim runtime lokalne testy Browser Use były odrzucone polityką narzędzia. Nowe środowisko musi sprawdzić swoje uprawnione możliwości; nie ma zgody na obchodzenie odmowy. Opisane scenariusze pozostają checklistą przyszłej rzeczywistej weryfikacji, a nie deklaracją, że zostały wykonane.
