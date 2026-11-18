# MAP-06 — interaktywna mapa operacyjna: audyt i plan architektury

Stan: 18.11.2026, gałąź `map06-interactive-map` od `main` = `0c2a0a8`. Prototyp po etapie MAP-06.1 (optymalizacja); **Technicznie zatwierdzony prototyp — optymalizacja i odbiór użytkownika w toku.** Brak scalenia do `main` i wdrożenia bez akceptacji użytkownika.

## 1. Audyt obecnej mapy (MAP-05)

| Obszar | Stan w `main` | Konsekwencja dla MAP-06 |
| --- | --- | --- |
| Renderer | Własny SVG (`planner.mjs` `drawPlannerMap`/`renderBasemapViewport`, `planner-map.mjs`), viewBox 680×380, ręczny pan/zoom, LOD do 1 600 ścieżek | Brak płynnego zoomu, obrotu, etykiet wzdłuż drogi i rastrów. SVG zostaje jako **fallback** (brak WebGL, testy DOM). |
| Dane podkładu | `basemap/planner-compact.json` 28,7 MB: 322 452 odcinki OSM, polyline5, kategorie, nazwy, bbox | Wystarczy do kafli wektorowych generowanych lokalnie; nie trzeba nowego pobierania OSM. |
| Trasy | `data/local-routes.json` 40,6 MB: 9 702 pary (`routes` 37,0 MB) + segmenty grafu (8,5 MB); `routes.mjs` `assessBasket` / `decodeRouteGeometry` | Mapa rysuje wyłącznie nogi `OK` z zapisanej geometrii; braki tylko jako lista/oznaczenie, bez linii. Silnik Python bez zmian. |
| Stan | Jeden `plan` w `planner.mjs`, akcje przez `applyAction` + walidacje; `renderPlanner()` po każdej zmianie | Mapa = czysta projekcja `(scenario, plan, date, filtry) → GeoJSON` wywoływana z `renderPlanner()`. Brak drugiej bazy przydziałów. |
| Widok koszyka | Jeden koszyk naraz („Mapa”), bez numeracji wizyt i kolorów ekip | MAP-06: wszystkie koszyki dnia, kolor ekipy, numer w kolejności, przełączniki. |
| CSP/offline | Plik offline: `connect-src 'none'`, skrypty po hashach, `img-src data:`; serwer: `connect-src 'self'` | MapLibre potrzebuje workera (`worker-src blob:` offline, `'self'` w serwerze). Rastry online wymagają jawnie dopisanego originu dostawcy. |
| Testy | npm 86, Python 80 + 24; scenariusze Chrome w `evidence/2026-11-17-browser` | Nowe testy czystej projekcji mapy + scenariusze Chrome MAP-06; istniejące muszą pozostać zielone. |

## 2. Decyzja: MapLibre GL JS 6.19.0

| Kryterium | MapLibre GL JS 6.19 | Leaflet 1.9 | OpenLayers 10 |
| --- | --- | --- | --- |
| Płynny zoom/obrót, WebGL | tak | animacja rastrowa, wektory DOM/canvas | tak (canvas/WebGL) |
| Etykiety ulic wzdłuż linii | tak, **lokalnie rysowane fontem systemowym** (zweryfikowane spike'iem: „Władysława Łokietka — Żółć” bez serwera glifów) | brak natywnie | tak |
| Kafle wektorowe z własnego protokołu | `addProtocol` | wtyczki | tak |
| Rastry satelitarne | tak | tak | tak |
| Licencja / rozmiar | BSD-3; 1,1 MB + worker 0,55 MB + CSS 70 KB | BSD-2; ~150 KB | BSD-2; ~1 MB |

Wybór: MapLibre — spełnia wymaganie „jak Mapy Google” (płynność, etykiety, obrót), działa z `file://` po ustawieniu workera z `blob:` i rysuje polskie znaki bez zewnętrznych fontów. Pakiet wersjonowany dokładnie (`--save-exact`) i **vendorowany** do `map05/vendor/maplibre-gl/` z licencją, aby planer działał bez `npm`.

## 3. Architektura

```
planner.mjs (stan, akcje, renderPlanner)
   └─ operational-map.mjs        czysta projekcja: buildOperationalLayers(scenario, plan, date, options)
   │      → visits (GeoJSON, kolor ekipy, typ, numer, status), routes (tylko nogi OK),
   │        unassigned, gaps (brak drogi/nieocenione/nieustalone pozycje), legend
   └─ maplibre-view.mjs          adapter MapLibre: źródła/warstwy, kontrolki, popup, przełączniki,
   │                             podkład drogowa/satelita/hybryda, fallback do SVG
   └─ road-tiles.mjs             protokół mmsroads://z/x/y → MVT z planner-compact.json
                                 (indeks siatki, klasa wg zoomu, przycinanie, enkoder MVT)
```

- **Synchronizacja**: `renderPlanner()` → `operationalMap.update()`; mapa nie modyfikuje planu. Kliknięcie punktu → popup → „Edytuj w planerze” wywołuje istniejące `selectMapOrder()` i przewija do formularza; zmiany idą przez `applyAction`.
- **Kolejność wizyt**: sortowanie jak w `assessBasket` (po `start`), numer 1..n; ta sama kolejność co trasa.
- **Brak geometrii**: noga bez `OK` nie jest rysowana; w panelu warstw lista „brak drogi A→B / nieocenione”; 7 nieustalonych pozycji jako lista, nie punkty.
- **Fallback**: brak WebGL lub błąd ładowania MapLibre → dotychczasowa mapa SVG (testy DOM pozostają na tej ścieżce).

## 4. Podkłady i dostawcy

| Tryb | Źródło | Sieć | Domyślnie |
| --- | --- | --- | --- |
| Drogowa | lokalne kafle wektorowe z `planner-compact.json` (OSM, ODbL) | brak | **tak** |
| Satelita | raster dostawcy skonfigurowanego przez użytkownika | tak — widoczny obszar trafia do dostawcy | wyłączone |
| Hybryda | raster dostawcy + lokalne drogi i etykiety | jw. | wyłączone |

Włączenie satelity wymaga: (1) wyboru/konfiguracji dostawcy w UI (URL szablonu, atrybucja, ewentualny klucz trzymany **tylko** w `localStorage` przeglądarki), (2) potwierdzenia ostrzeżenia o wysyłaniu widocznego obszaru, (3) uruchomienia serwera z jawnie dopuszczonym originem: `python -X utf8 map05/serve.py --allow-tile-origin https://mapy.geoportal.gov.pl`. Plik offline ma CSP blokujący sieć i **nie obsługuje** satelity — UI to komunikuje. Brak sekretów w repozytorium.

| Dostawca | Koszt / warunki (do potwierdzenia przed użyciem produkcyjnym) | Ocena |
| --- | --- | --- |
| GUGiK Geoportal ORTO (WMS `PZGIK/ORTO/WMS/StandardResolution`) | Bezpłatna, „możliwa do dowolnego wykorzystania”; bez klucza; zasięg PL. EPSG:3857 w WMS wg starszych źródeł — sprawdzić GetCapabilities | **rekomendowany preset** |
| MapTiler Satellite | Klucz API; Free tylko niekomercyjnie (~100 tys. żądań/mies. wg zestawień), Flex ok. 25 USD/mies. | alternatywa z umową |
| Esri World Imagery | Wymaga licencji ArcGIS / Location Platform; publiczny endpoint nie jest darmowy do zastosowań komercyjnych wg Esri | tylko z licencją |
| Google Map Tiles API | Billing i warunki Google | nie w prototypie |

## 5. Rozmiar artefaktu offline

| Składnik | Teraz | gzip -9 |
| --- | --- | --- |
| `local-routes.json` (`routes` 37,0 MB + `segments` 8,5 MB) | 40,6 MB | 9,4 MB |
| `planner-compact.json` | 28,7 MB | 13,4 MB |
| Adresy, pozycje, kod | ~0,3 MB | — |
| MapLibre (JS + worker + CSS) | +1,7 MB | ~0,5 MB |

Propozycje (rosnąco wg ingerencji): (A) osadzić duże JSON jako gzip+base64 i rozpakować `DecompressionStream` — ok. **31 MB** zamiast 71 MB, bez zmiany danych; (B) kodowanie delta indeksów segmentów tras i współrzędnych podkładu; (C) dwa artefakty: lekki planer + osobny plik danych regionu; (D) pre-generowane kafle MVT/PMTiles z uproszczeniem dla niskich zoomów. Wyznaczanie tras w przeglądarce zamiast zapisanych par zmieniłoby silnik — poza zakresem bez zgody. W prototypie MAP-06 rekomendacja (A) jako następny krok.

## 6. Ochrona projektu

Bez zmian: `datasetId`, ID zleceń, fixture MAP-04, schemat planu v1, silnik routingu i jego zasady, reguły generatora i ochrony potwierdzeń, ustalenia prywatności (domyślnie zero żądań zewnętrznych).

## 7. Testy akceptacyjne (prawdziwy Chrome, GPU)

Generowanie wszystkich koszyków i zgodność kolor/ekipa; przeniesienie → markery i trasy bez przeładowania; zmiana daty bez wizyt poprzedniego dnia; cofnięcie i import; przełączanie podkładów (satelita testowany **lokalnym atrapowym dostawcą** na loopback, bez wysyłania danych); tryb offline (`file://` + blokada sieci); odświeżenie; spójność punktów z przydziałami (porównanie features mapy z planem); desktop/mobile; brak regresji npm/Python.

## 8. Podział pracy

Claude Code: implementacja (`operational-map.mjs`, `maplibre-view.mjs`, `road-tiles.mjs`, integracja w `planner.mjs`/`planner.html`/`planner.css`, builder, `serve.py`, vendor), scenariusze Chrome, dokumentacja. Codex: niezależny przegląd planu, code review, niezależne testy projekcji (osobny plik testów), weryfikacja prywatności/CSP.

## 9. Stan implementacji prototypu (17.11.2026)

Zrealizowano na gałęzi `map06-interactive-map`; szczegóły i dowody: `evidence/2026-11-17-map06/README.md`.

| Element | Plik | Uwagi |
| --- | --- | --- |
| Projekcja planu na warstwy | `map05/operational-map.mjs` | czysta funkcja; kanon kolejności = `assessBasket().orders`; ukrycie nie renumeruje; nogi bez geometrii tylko jako `gaps`; licznik kolejki bez pozycji globalny |
| Lokalne kafle MVT | `map05/road-tiles.mjs` | protokół `mmsroads://`; siatka 0,05° przed dekodowaniem; klasy dróg wg zoomu; przycinanie Liang–Barsky; FIFO 25 000 zdekodowanych odcinków |
| Adapter MapLibre | `map05/maplibre-view.mjs` | kontrolki zoom/kompas/pełny ekran/skala; popup z DOM (bez HTML); satelita/hybryda; atrybucja escapowana; maskowanie kluczy; fallback po utracie WebGL |
| Integracja | `map05/planner.mjs`, `planner.html`, `planner.css` | aktualizacja z `renderPlanner()`; numerowana lista wizyt jako alternatywa klawiaturowa; dialog dostawcy zdjęć |
| Vendor | `map05/vendor/maplibre-gl/` + `vendor_maplibre.py` | MapLibre 6.19.0 bez modyfikacji, manifest SHA256, LICENSE, noty stron trzecich |
| Offline | `map05/build_planner.py` | MapLibre jako moduł inline; worker jako `text/plain`. CSP: `connect-src blob:` (MapLibre w `file://` czyta źródło workera przez `fetch(blob:)`), `worker-src blob: data:`; żaden schemat sieciowy nie jest dopuszczony |
| Serwer | `map05/serve.py` | nowe pliki na liście dozwolonych; `--allow-tile-origin` (wiele razy) dopisuje ścisły origin do nagłówka **i** meta CSP oraz `<meta name="mms-tile-origins">` |

Ryzyka zgłoszone przez Codexa (T4) i ich obsługa: P1 worker/CSP w `file://` — zreprodukowany i naprawiony, test kontraktu CSP; P2 spójność CSP, filtry/numeracja, asynchroniczny adapter, bezpieczny popup, koszt MVT, fallback/klawiatura — zaadresowane w kodzie i testach; P3 noty licencyjne — `THIRD-PARTY-NOTICES.md`.

## 10. MAP-06.1 — optymalizacja i stabilizacja (18.11.2026)

Zrealizowano rekomendację (A) z §5 oraz przeniesienie kafli dróg do Web Workera; pełne wyniki PRZED/PO, testy Chrome/Firefox i ograniczenia: `evidence/2026-11-18-map061/README.md`.

| Element | Wynik |
| --- | --- |
| Rozmiar `planner-offline.html` | 71 343 809 B → **32 403 512 B** (gzip 9 + base64 bloków `basemap-data`, `routing-data`; dekoder `embedded-data.mjs`) |
| Kafle dróg | `road-tile-worker.mjs` (usługa), `road-tile-client.mjs` (klient: worker lub inline), kolejka LIFO, anulowanie, transfer buforów; offline: klasyczny worker z `blob:` (CSP `worker-src blob: data:`), serwer: worker modułowy |
| Wątek główny | wycieczka po widokach: 0 długich zadań (było ~1,1 s), mediana najgorszej klatki ~440 → ~51 ms; szczyt sterty JS 494 → 270 MB; pamięć całego Chrome na starcie +~100 MB |
| Awarie | brak Worker / zablokowany plik workera / awaria workera po starcie → mapa SVG z komunikatem, planer działa |
| Testy | 140 JS + 82 Py map05 + 24 Py map04 = 246 PASS; Chrome 14 + 13 + 10 + 10 + 4 + dotyk 5 + 5; Firefox 9/9 |
| Satelita / hybryda | niewdrożone, niezweryfikowane (brak licencjonowanego dostawcy); mechanizm opt-in sprawdzony atrapą |
| Licencje i źródła | `docs/ZRODLA-DANYCH-I-LICENCJE.md` (UUG, Geoapify, ODbL, ORTO — spraw do potwierdzenia przez właściciela) |

Przegląd Codexa: T10 (CHANGES REQUESTED: 2 × P2, 1 × P3 — naprawione), T11 (APPROVE). Publikacja gałęzi na GitHub i Pull Request do `main` — bez scalenia.
