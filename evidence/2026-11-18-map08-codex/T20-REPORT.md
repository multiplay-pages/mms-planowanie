# T20 — Testy potoku pakietu mapy MAP-08

Worktree `mms-map08`, gałąź `map08-map-quality`. Zmiany obejmują dwa pliki testowe i ten raport.

## Zakres

- [test_map_pack.py](../../map05/tests/test_map_pack.py) sprawdza ID Hilberta w obie strony, zapis i odczyt PMTiles v3, nagłówek 127 B, zasięg i poziomy zoomu, gzip metadanych, brak kafla, deduplikację i kodowanie katalogu. Większy pakiet wymusza dwa katalogi liści, a test odczytuje wszystkie 6000 kafli publiczną funkcją `read_tile`.
- Ten sam plik sprawdza obcinanie linii i pierścieni, pole i orientację pierścieni MVT, warstwy `roads`, `building` i `places`, polskie znaki, właściwości liczbowe i tekstowe oraz pomijanie pustych warstw. Sprawdza też trzy ciągi polyline5 potwierdzone przez `routes.mjs`, progi klas dróg, brzeg promienia i sąsiednie komórki `Coverage` oraz podział geometrii na kafle i liczniki `Tiler`.
- [pmtiles-reader.test.mjs](../../map05/tests/pmtiles-reader.test.mjs) odczytuje tymczasowy pakiet MVT wygenerowany przez Pythona. Sprawdza nagłówek, ID Hilberta, katalog i błędy parsera oraz porównuje rozpakowane bajty kafli z Pythonem. Sprawdza też metadane, brakujący kafel, zoom poza zakresem i atrapy HTTP 206/200 wraz z zakresem żądań, sygnałem anulowania oraz pamięcią podręczną pełnej odpowiedzi.

## Wyniki

| Polecenie | Wynik |
| --- | --- |
| `python -X utf8 -m unittest map05/tests/test_map_pack.py` | 14/14 PASS, 63,176 s |
| `node --test map05/tests/pmtiles-reader.test.mjs` | 9/9 PASS |
| `node --test tests/pmtiles-reader.test.mjs` z katalogu `map05` | 9/9 PASS |
| `node --check map05/tests/pmtiles-reader.test.mjs` i `ast.parse` pliku testowego Pythona | PASS |

Środowisko obejmowało Python 3.12.10 i Node.js 26.13.0. Testy celowo używają wyłącznie danych syntetycznych. Weryfikacja obejmuje jednostki potoku i zgodność Python–Node, bez pełnego buildu aplikacji, prawdziwych PBF ani testu przeglądarkowego. Zestaw Node wymaga polecenia `python` w `PATH`, aby wygenerować tymczasowy pakiet. Test 6000 kafli dominuje czas wykonania, ponieważ `read_tile` interpretuje katalog ponownie dla każdego odczytu.

## Usterki potwierdzone dodatkowymi reprodukcjami

1. **`Coverage.near` może pominąć punkt w zadanym promieniu.** Liczba przeszukiwanych komórek w osi długości jest obliczana bez `cos(lat)`, choć końcowy test odległości uwzględnia tę korektę. Przy 50° i promieniu 15 km punkt oddalony według wzoru z kodu o 14,669 km znajduje się pięć komórek dalej, poza sprawdzanymi czterema. Przypadek dotyczy konfigurowalnego `--detail-radius-km`.

   ```python
   from map05.basemap.build_map_pack import Coverage

   Coverage([(-0.001, 50)], 15).near(0.204, 50)
   # Wynik False, oczekiwane True.
   ```

2. **Dekodery PMTiles akceptują zerowy kod offsetu pierwszego wpisu.** Zero oznacza wpis bezpośrednio po poprzednim, więc pierwszy wpis musi mieć jawny offset. Oba dekodery zwracają offset `-1`. Zapis z obecnego writera zawsze podaje tu poprawny offset. Oczekiwane zachowanie czytnika dla takiego uszkodzonego katalogu to błąd na etapie parsowania.

   ```js
   import {parseDirectory} from './map05/pmtiles-reader.mjs';

   parseDirectory(Uint8Array.of(1, 0, 1, 1, 0));
   // [{tileId: 0, offset: -1, length: 1, run: 1}]
   ```

   ```python
   from map05.basemap.pmtiles_io import deserialize_directory

   deserialize_directory(bytes([1, 0, 1, 1, 0]))
   # [(0, -1, 1, 1)]
   ```

Wyniki powyżej dotyczą testów kontraktu i obsługi uciętego katalogu. Dwie odrębne reprodukcje dokumentują otwarte usterki w kodzie źródłowym.

## Włączenie do npm

W `map05/package.json` do obu istniejących wywołań `node --test` dopisz `tests/pmtiles-reader.test.mjs`. Poniżej są docelowe linie w `scripts`.

```json
"test": "node --test tests/model.test.mjs tests/map.test.mjs tests/ui.test.mjs tests/planner-model.test.mjs tests/planner-ui.test.mjs tests/locations.test.mjs tests/routes.test.mjs tests/planner-routing.test.mjs tests/planner-map.test.mjs tests/real-routes.test.mjs tests/road-tiles.test.mjs tests/operational-map.review.test.mjs tests/maplibre-view.test.mjs tests/road-tile-worker.test.mjs tests/pmtiles-reader.test.mjs",
"test:planner": "node --test tests/planner-model.test.mjs tests/planner-ui.test.mjs tests/locations.test.mjs tests/routes.test.mjs tests/planner-routing.test.mjs tests/planner-map.test.mjs tests/real-routes.test.mjs tests/road-tiles.test.mjs tests/operational-map.review.test.mjs tests/maplibre-view.test.mjs tests/road-tile-worker.test.mjs tests/pmtiles-reader.test.mjs",
```
