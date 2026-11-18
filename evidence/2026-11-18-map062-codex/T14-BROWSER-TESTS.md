# T14 — niezależne testy przeglądarkowe MAP-06.2

18.11.2026, Codex CLI. Commit **6c829e76daa0246c9aed36beb5b356625b592201**, gałąź map06-interactive-map. **GO dla wypchnięcia tego commitu do PR, bez merge, w zakresie zmian adresów i mechanizmu satelita/hybryda.** Nie znaleziono P1/P2/P3 w badanych ścieżkach. Nie jest to zamknięcie otwartego A1 dotyczącego praw do źródeł danych ani odbiór produkcyjnego MMS.

## Środowisko i izolacja

Rzeczywisty Chrome **157.0.8103.79**, headless, sprzętowy WebGL: **ANGLE / Intel UHD Graphics 630 / D3D11** (odczyt WEBGL_debug_renderer_info). Playwright-core z istniejącej instalacji mms-e2e, bez instalowania pakietów/pobierania przeglądarek. Firefox **160.0.1**, headless, WebDriver BiDi; jego przebieg jest regresją ogólną, szczegółowe nowe kontrole adresów wykonano w Chrome.

Lokalne serwery: 8771 bez flagi originu, 8772 z dopuszczonym wyłącznie **http://127.0.0.1:8791**, mock na 8791. Nie uruchamiano plików BAT ani rzeczywistego dostawcy. Chrome miał przed nawigacją blokadę wszystkich żądań poza file/data/blob/about i trzema portami loopback. Firefox miał blokadę BiDi oraz proxy zaporowe dla hostów poza loopback. Nie łączono się z GUGiK/Geoapify ani innym zewnętrznym hostem. Listy external/blocked w zapisach są puste.

Po testach wszystkie własne serwery zatrzymano; niezależny odczyt portów **8771/8772/8791: 0 nasłuchów**. Zamknięto konteksty/przeglądarki. Codex nie zmieniał kodu map05, plików BAT ani historii Git; HEAD nadal 6c829e7. Po zakończeniu przebiegów odczyt map05 był czysty; w ostatnim odczycie przy wysyłaniu raportu pojawiły się równoległe, niezacommitowane zmiany lidera w planner.mjs i tests/planner-ui.test.mjs — nie są objęte tym GO. Jedyne pliki utworzone/zmienione przez Codexa są w tym katalogu evidence. Bez buildu, commit/push. Usunięto lokalny prefiks ścieżki z jednego wyniku file://; skan tekstowych dowodów nie wykazał konkretnej nazwy konta ani prywatnej ścieżki.

Artefakt offline: **32 405 384 B**, SHA256 **7172e45003d3498befc82d4b5b637cebca0c4f5ca565e5d83844bf90899bf48f**.

## Wyniki względem baseline MAP-06.1

| Zestaw | Baseline | T14 |
| --- | --- | --- |
| npm test | 140 | **141/141 PASS** |
| unittest MAP05 | 82 | **82/82 PASS** |
| unittest MAP04 | 24 | **24/24 PASS** |
| Automatyczne razem | 246 | **247/247 PASS**, 0 FAIL |
| Chrome M, serwer / offline | 14 / 13 | **14/14 / 13/13 PASS** |
| Chrome SVG, serwer / offline | 10 / 10 | **10/10 / 10/10 PASS** |
| Chrome W1–W4 | 4 | **4/4 PASS** |
| Chrome touch, serwer / offline | 5 / 5 | **5/5 / 5/5 PASS** |
| Firefox BiDi | 9 | **9/9 PASS**, 0 FAIL/BLOCKED |
| Dodatkowe kontrole adresów/układu/ochrony satelity | — | **66 PASS**, 0 FAIL/BLOCKED |

Logi testów: [logs/](logs/). Czas npm 19,71 s, MAP05 Python 11,34 s, MAP04 0,001 s. Zbiorczy indeks wyników: [summary.json](summary.json); przebiegi głównego runnera: [runs.json](runs.json). Liczba 66 to liczba kontroli/asercji (część sprawdza tę samą kartę po kolejnych działaniach), nie 66 różnych funkcji produktu. Nie sumowano tego z unit testami jako jednego zbioru testów.

Skrypty regresji skopiowano do [scripts/](scripts/), zmieniono porty 8765/8766 na 8771/8772, dodano blokadę żądań zewnętrznych i sanitizację ścieżek w wynikach; nie zmieniano warunków biznesowych PASS. Dwa niezależne skrypty address.mjs/followup.mjs porównują treść z labels oryginalnego addresses.json, bez używania produkcyjnego addressParts. W SVG użyto wymaganych flag --disable-gpu --disable-3d-apis --disable-webgl.

## A — adresy i układ: PASS

[address-results.json](address-results.json) — 47 PASS; [followup-results.json](followup-results.json) — 19 PASS.

- Wszystkie **13 wygenerowanych wizyt / 15 zajętych kart slotów**: ulica+numer zgodne z częścią label po kodzie/miejscowości, pod spodem właściwe kod+miejscowość. Obie kontynuacje zleceń dwuslotowych zachowują ten sam adres. Wszystkie 13 pozycji op-layers mają prawidłową ulicę.
- Po kliknięciu każdej przydzielonej wizyty panel ma „Adres wizyty”, właściwą ulicę i kod+miejscowość. Pełne linie dzień · ekipa · okno sprawdzono osobno dla każdego przydziału, w tym **11:00–17:00** przy dwóch slotach.
- TEST-013 zachowuje numer lokalu **ul. Rynek 25/2**. Rzeczywisty klik w marker → popup → „Edytuj w planerze” otwiera ten sam adres w panelu. Potwierdzenie okna nie zmienia adresu ani rezerwacji. Po cofnięciu potwierdzenia i ręcznym przeniesieniu do TEST-02 / 20.11 / 08:00 panel pokazuje nową rezerwację; zmiana dnia i klik karty nadal pokazują ją poprawnie. „Wróć do kolejki” usuwa przydział i linię slotu, zachowując adres.
- Najdłuższy adres w źródłowej liście (TEST-107, ul. Kardynała Stefana Wyszyńskiego 7/24) sprawdzono zarówno jako nieprzydzielony, jak i ręcznie przydzielony do pustego koszyka. Szerokości **1600, 1440, 1150, 700 i 390 px**: brak poziomego przewijania dokumentu i przepełnienia ulicy w panelu, kartach slotów i liście warstw. Na 1600 px workspace ma trzy kolumny, na 1150 dwie, na 700/390 układ mobilny w jednej kolumnie.
- Odczyt stylów: główna ulica panelu **22 px / 800**, ulica w slocie **13 px / 700**. Ulica i tło w testowanych kartach dają kontrast około **14,34:1**. Obejrzano zapisane PNG: tekst zawija się i pozostaje w karcie, również przy 390 px. To ocena głównego tekstu adresowego, nie pełny audyt WCAG całej aplikacji.
- Nowa karta panelu działa także przy rzeczywiście wyłączonym WebGL i aktywnym SVG; 102 znaczniki pozostają na mapie, przydzielony adres i okno są prawidłowe.

Wybrane dowody: [przydzielony adres](screenshots/A-selected-assigned.png), [kolejka bez slotu](screenshots/A-queue-card.png), [popup](screenshots/A-popup.png), [długi adres w koszyku 390 px](screenshots/A-long-basket-390.png), [długi przydzielony adres 390 px](screenshots/A-long-assigned-390.png), [panel na SVG](screenshots/A-svg-details.png). Pozostałe szerokości i obie części układu są w screenshots/.

## B — satelita/hybryda bez internetu: PASS

- **8771 bez flagi**, przy zapisanym poprawnym URL mocka i zgodzie: wybór Satelity zwraca nową instrukcję **„Uruchom planer plikiem Uruchom-planer.bat…”**. Radio wraca na Drogową, źródło rastra nie powstaje, **0 żądań kafli**. [Zrzut](screenshots/B-no-flag-blocked.png).
- **8772 z flagą + mock 8791**: zapis bez zgody jest odrzucony; po zgodzie i wyborze Satelity pojawia się raster atrapy, a lokalne drogi są ukryte. Hybryda pokazuje **raster + drogi + etykiety**. W M11 pobrano 4 lokalne kafle; powrót do Drogowej usuwa źródło, a następny zoom daje **0 nowych żądań**. Atrybucja z testowym HTML wyświetla się jako tekst, klucz testowy nie pojawia się w statusie. Obejrzano oba PNG, nie wnioskowano wyłącznie z istnienia źródła: [Satelita](m06-served/M11-served-satellite.png), [Hybryda](m06-served/M11-served-hybrid.png).
- **file://** z zapisanym URL mocka i zgodą: Satelita nadal zablokowana, 0 żądań, brak źródła rastra, pozostaje Drogowa. [Zrzut](screenshots/B-file-blocked.png). Osobny M-offline pracował także z wyłączoną siecią kontekstu.
- Odczyt BAT: Uruchom-planer.bat ma --allow-tile-origin https://mapy.geoportal.gov.pl; Uruchom-planer-bez-satelity.bat nie ma tej flagi. Plików nie uruchamiano. Żaden test nie kontaktował rzeczywistego endpointu.

Zielony jednolity raster jest celową **atrapą**, nie zdjęciem satelitarnym. Wynik potwierdza mechanizm warstw, zgody i blokad, nie jakość/warunki/licencję rzeczywistego dostawcy.

## C — regresja: PASS

Zapisane wyniki są w m06-served/, m06-offline/, svg-served/, svg-offline/, m061/, touch-served/, touch-offline/ oraz firefox/. Firefox obejmuje start offline/served z WebGL i workerem, rysowanie lokalnych dróg, generowanie i filtr ekipy, klik → popup → edycję, kółko/przeciąganie, tap BiDi, 390 px i błędy/sieć. Przebieg 9/9 był świeżo wykonany w T14, nie przepisany z baseline. Firefox wynik zapisuje tylko dozwolone capabilities, bez ścieżki profilu.

Nie było FAIL ani BLOCKED. **NOT TESTED**: fizyczny ekran dotykowy, Safari/Edge, czytnik ekranu, wydajność Firefoksa i rzeczywisty dostawca zdjęć. Testy dotyku Chrome/CDP i Firefox/BiDi są symulowanymi wejściami, nie oceną fizycznego urządzenia. Nie prowadzono nowego benchmarku wydajności.

## Ustalenia i werdykt

Brak zgłoszeń P1/P2/P3 z odtworzeniem — nie wykryto usterki aplikacji w zadanym zakresie. **GO do PR bez merge** dla 6c829e7. Zakres zgody na istniejące publiczne adresy i wcześniejsze otwarte A1 pozostają odrębnymi ustaleniami; T14 nie rozszerza zgody na nowych dostawców i nie zamyka praw do źródeł danych.
