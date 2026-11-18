# T22 — Ponowny przegląd poprawek MAP-08

**Werdykt dla `1e93999`: do poprawy przed odbiorem.** Dwa P2 i jeden P3. Brak potwierdzonych P1 w badanym zakresie. Numery linii odnoszą się do `1e93999`. Poprawki rozpoczęte w trakcie przeglądu są poza tym wynikiem.

## P2 — Fallback odtwarza domyślny widok, a kontrolki i status zachowują poprzedni stan

`map05/planner.mjs:357–368, 404–410, 516–520, 543–544`, `map05/maplibre-view.mjs:89, 216–235`.

W teście DOM wybierz „Hybryda” z zaakceptowanym dostawcą testowym, wyłącz „Drogi” i „Numery wizyt”, a następnie wywołaj sygnał trwałej awarii pakietu. Zastępczy adapter ma tryb `road` i obie warstwy widoczne. Zaznaczone pozostaje radio „Hybryda”, status nadal opisuje wysyłanie obszaru, a oba przełączniki pozostają odznaczone. Rozbieżność przełączników dotyczy także trybu drogowego i nie wymaga skonfigurowanego dostawcy.

Przy przebudowie zastosować aktywne flagi. Zsynchronizować tryb renderera, radio i status według jawnej decyzji o zachowaniu lub wyłączeniu rastra.

## P2 — Zdarzenie ze zniszczonego widoku może wyłączyć widok zastępczy

`map05/maplibre-view.mjs:22, 47, 57–66, 191, 240`, `map05/planner.mjs:360–369, 404–425`.

Dwie próby w pamięci odtworzyły skutek. Po `view.destroy()` wywołanie handlera `mmspack` nadal czytało stary pakiet. Syntetyczne `webglcontextlost` skierowane do jego starego canvasa nadal wywołało `onFatal`. Gdy callback starego widoku dostarczono po uruchomieniu zastępczego adaptera, planer zniszczył nowy widok, ukrył mapę operacyjną i zachował uchwyt DOM do zniszczonego adaptera. Bundlowany `Map.remove()` wywołuje `WEBGL_lose_context.loseContext()`. Moment dostarczenia tego zdarzenia w przeglądarce nie był testowany.

Usunąć własny listener przed `map.remove()`. Związać zdarzenia, odczyty protokołu i zakończenie `ready` z konkretną instancją. Przy jej zamykaniu odłączyć należące do niej referencje oraz wyczyścić uchwyt DOM także przy przejściu na SVG. W nieudanej inicjalizacji zastępczej samo `destroy()` nie czyści globalnego `opPack` ani callbacków.

## P3 — „Miejscowości” obiecuje warstwę, której pakiet samych dróg nie wyświetla

`map05/planner.mjs:468–472`, `map05/maplibre-view.mjs:47–48, 74–84`, `map05/map-style.mjs:71–81`.

Próba z `pack.layers = new Set(['roads'])` potwierdziła poprawny komunikat o braku miejscowości i wyszarzenie budynków oraz przyrody. „Miejscowości” pozostaje aktywne. Adapter instaluje jedynie warstwy czytające brakujące `source-layer: places`, choć udostępnia lokalne źródło `towns`. Użyć `town-labels` z lokalnego źródła lub wyszarzyć kontrolkę przy braku etykiet.

## Potwierdzone elementy T21

| Zakres | Wynik |
| --- | --- |
| Edycja i rzeczywista awaria bieżącej mapy | Znikają `op-workspace` i `op-ws-open`. Próba DOM z aktywnym fullscreen potwierdziła wywołanie `exitFullscreen` w obu ścieżkach. |
| Dane i status pakietu samych dróg | Odtworzenie wyłącznie z syntetycznymi wejściami potwierdziło metadane `['roads']`, komunikat o niepełnym pakiecie, wyłączone budynki i przyrodę oraz dostępne nazwy ulic. |
| Ucięte sekcje PMTiles | Na syntetycznym archiwum z liściem zweryfikowano pozycje obu odczytów końcowego bajtu. Osobne ucięcia wewnątrz sekcji liści i danych zostały odrzucone już przy `openPack`. |
| Próg odczytu i ponowna inicjalizacja | Trzy próby z anulowanym sygnałem nie liczyły się. Callback wystąpił raz po trzecim rzeczywistym błędzie. Ponowne zgłoszenie nie tworzyło trzeciej instancji. Późne zdarzenie starego widoku pozostaje otwartym P2. |
| Obwiednia, HEAD i dymki | Syntetyczny builder zachowuje oba odcinki kolei z T21. HEAD zwraca 200 i metadane całego pliku niezależnie od Range. Oba tytuły zmieniają się po skonfigurowaniu dostawcy i wracają po usunięciu konfiguracji. |

## Polecenia i zakres

- `node --test tests/pmtiles-reader.test.mjs tests/maplibre-view.test.mjs tests/map-style.test.mjs tests/planner-ui.test.mjs` z katalogu `map05` — 72/72.
- `python -X utf8 -m unittest map05.tests.test_delivery.RangeTests` — 4/4.
- `python -X utf8 -m unittest map05.tests.test_map_pack.MapPackBuilderTests` — 5/5.
- Dodatkowe próby użyły DOM i syntetycznych źródeł w pamięci. Istniejące testy użyły własnych małych plików w katalogu tymczasowym. Nie czytałem `map05/basemap/map-pack.pmtiles`, nie uruchamiałem serwerów ani przeglądarki i nie wykonywałem prób sieciowych. Jedyny mój zapis w worktree to niniejszy raport.
