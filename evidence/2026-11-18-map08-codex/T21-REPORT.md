# T21 — Niezależny przegląd MAP-08

**Werdykt dla `79779f6`: do poprawy przed odbiorem.** Brak potwierdzonych P1 w badanym zakresie. Potwierdziłem 3 P2 i 3 P3. Numery linii odnoszą się do `79779f6`. Przegląd dotyczy tej rewizji, także tam, gdzie po reprodukcji rozpoczęły się poprawki w worktree.

## P2

### 1. Duża mapa zasłania edycję i może pozostać otwarta po awarii

`map05/planner.mjs:397–405, 472–475, 648–656`, `map05/planner.css:73–77`.

Odtworzenie w DOM z atrapą adaptera. Otwórz „Duża mapa”, wybierz wizytę na liście i kliknij „Edytuj w planerze”. Kod wywołuje przewinięcie do `#order-details`, który jest poza `#map-card`, a karta pozostaje w `op-workspace`. W pełnym ekranie cel dodatkowo leży poza elementem fullscreen. W osobnym przebiegu wywołanie `onFatal` w otwartej dużej mapie ustawiło `op-map-shell.hidden=true`, zachowując `op-workspace` i `body.op-ws-open`. Widoczny przycisk zamknięcia znika, a przewijanie pozostaje zablokowane.

Przy przejściu do edycji i renderera SVG należy wyjść ze wspólnego trybu powiększonego, uwzględnić fullscreen i przenieść fokus na widoczny cel.

### 2. Pakiet zawierający tylko drogi jest zgłaszany jako pełny podkład

`map05/basemap/build_map_pack.py:245–248, 302–304`, `map05/maplibre-view.mjs:45–48`, `map05/planner.mjs:448–451, 484–486`.

Builder dopuszcza brak PBF i raportuje wtedy pakiet zawierający tylko drogi. Metadane mimo to wyliczają wszystkie warstwy. Widok uznaje każdy dający się otworzyć pakiet za pełny. W teście w pamięci podstawiłem poprawny wynik otwarcia pakietu wyłącznie z metadanymi warstwy `roads`. Status reklamował budynki, a przełącznik „Budynki” pozostawał aktywny.

Powiązać komunikat i przełączniki z faktycznie zbudowanymi warstwami. Zachować nazwy ulic, jeżeli są dostępne w uproszczonym pakiecie.

### 3. Ucięty PMTiles może wyłączyć drogi i pozostawić tryb pełnego podkładu

`map05/pmtiles-reader.mjs:83–100`, `map05/planner.mjs:352–355, 360–369, 372–382`, `map05/maplibre-view.mjs:87–92, 183`.

Odtworzenie bez zapisu. Przekaż do `openPack(memorySource(...))` kopię poprawnego lokalnego archiwum przyciętą do `header.dataOffset`. Nagłówek i katalog pozostają kompletne, a `openPack` zwraca otwarty pakiet. Odczyt pierwszego istniejącego kafla działa na oryginale, lecz na kopii kończy się błędem dekompresji. Planer uruchamia generator dróg tylko przy braku obiektu pakietu. Błąd kafla jest wyświetlany w statusie bez przełączenia źródła. Przegląd źródła potwierdza tę ścieżkę po starcie, a test Node potwierdza zachowanie czytnika.

Przed wyborem pakietu potwierdzić, że deklarowane sekcje mieszczą się w źródle. Zapewnić przejście na drogi w razie trwałego błędu pakietu po otwarciu, z aktualizacją statusu i bez traktowania poprawnie brakującego kafla jako awarii.

## P3

### 4. Filtr obwiedni pomija obiekty przecinające zasięg mapy

`map05/basemap/build_map_pack.py:268–273`.

Uruchomiłem `build` z atrapami wejść i zapisu. Dla zasięgu `(0,0,10,10)` linia kolei `[(5,3),(-20,3)]` przecina zachodnią krawędź, a `[(4,4),(5,4)]` leży w całości wewnątrz. Na z9 manifest raportuje tylko jedną linię. Filtr sprawdza środek obwiedni pierwszej linii, `(-7.5,3)`, i odrzuca również część widoczną na mapie. Dla kolei, wód i terenów rozważyć przecięcie obwiedni z zasięgiem. Ograniczenie szczegółu budynków przez `Coverage` jest osobną regułą.

### 5. HEAD stosuje Range jak GET

`map05/serve.py:76–77, 107–135`.

W handlerze uruchomionym w pamięci dla 10-bajtowego pliku `HEAD` z `Range: bytes=2-3` zwraca 206, `Content-Range: bytes 2-3/10` i metadane dwubajtowego fragmentu. Zakres powinien być rozpatrywany dla GET. Zwykły GET, przycięty zakres, sufiks oraz 416 dla zakresu poza plikiem działały w tej samej próbie.

### 6. Dymek satelity informuje o niedostępności po włączeniu warstwy

`map05/planner.html:52`, `map05/planner.mjs:495–502`.

Źródłowy `title` przy Satelicie i Hybrydzie jest stały i mówi o niedostępności. Po zapisaniu poprawnego dostawcy na dozwolonym originie `syncSatelliteAvailability` odblokowuje kontrolkę i zmienia widoczną etykietę, lecz pozostawia stary dymek. Scenariusz włączenia jest już pokryty testem DOM. Rozbieżność dymka wynika z odczytu kodu.

## Pozostałe wnioski

- **Bezpieczeństwo i prywatność.** Ścieżki serwera są wybierane z dokładnej listy `FILES`, a testy handlera odrzuciły niedozwolone ścieżki. Nowe pola adresowe w HTML przechodzą przez `escapeText`, a popup używa `textContent`. Oba lokalne artefakty offline mają `connect-src blob:`, brak zewnętrznych assetów i zgodne hashe wszystkich inline bloków. Przegląd zgody na zdjęcia wykazał warunki walidacji originu i zgody oraz usunięcie źródła raster po powrocie do „Drogowa”. Żądanie zdjęć po włączeniu przekazuje obszar (XYZ/BBOX) wybranemu dostawcy. W analizowanym potoku nie znalazłem nowej bezpośredniej wysyłki adresów ani współrzędnych wizyt. Weryfikacja sieciowa ograniczała się do kodu, testów w pamięci i odczytu istniejących dowodów.
- **Trasy i regresje.** Testy potwierdzają brak sztucznych linii przy `NO_PATH`, niepewnej lokalizacji, uszkodzonej geometrii i braku routingu. Względem bazy MAP-06 `69aed04` diff modelu, silnika oraz snapshotu tras jest pusty. MAP-07B `6c937a7` jest odrębną gałęzią i nie jest przodkiem MAP-08. Optymalizator i jego UI są tylko na MAP-07B. To granica tej gałęzi, istotna przy scaleniu i dla opisu tras w `docs/MAP08-MAPA-OPERACYJNA.md:128`.
- **Zakres dowodów.** Statyczny przegląd objął adapter i style MapLibre, moduły planera i projekcji, obydwa czytniki PMTiles, generator pakietu, geometrię MVT, serwer i builder HTML. Próby nie uruchamiały serwera, geokodowania ani przeliczania prawdziwego PBF. Nie wykonano niezależnego testu wizualnego ani odbioru z zewnętrznym dostawcą zdjęć.

## Weryfikacja

| Polecenie lub próba | Wynik |
| --- | --- |
| `node --test tests/planner-ui.test.mjs tests/maplibre-view.test.mjs tests/map-style.test.mjs tests/operational-map.review.test.mjs tests/routes.test.mjs tests/planner-routing.test.mjs` z `map05` | 102/102 |
| `python -X utf8 -m unittest map05/tests/test_delivery.py` | 10/10. Własne tymczasowe pliki testów Range poza worktree |
| `validateStyleMin` z zainstalowanego pakietu specyfikacji MapLibre | 4/4 wariantów bez błędów |
| Ponowne obliczenie hashy CSP istniejących plików offline | standardowy 10/10, rich 11/11 |
| Odtworzenia w pamięci | duża mapa i awaria WebGL, pakiet tylko z drogami, ucięty pakiet, odcinek przecinający zasięg, HTTP Range |

Jedyny dodany plik w worktree to ten raport.
