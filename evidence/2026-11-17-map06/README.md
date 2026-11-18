# MAP-06 — interaktywna mapa operacyjna: dowody z prawdziwej przeglądarki (17.11.2026)

Gałąź `map06-interactive-map` (baza `main` = `0c2a0a8`). Prototyp **niescalony z `main`**; merge/push na `main` wymaga akceptacji użytkownika.

## Środowisko

| Element | Wartość |
| --- | --- |
| Przeglądarka | Google Chrome 157.0.8103.79, headless, **sprzętowy WebGL** (ANGLE D3D11, Intel UHD 630) |
| Sterowanie | `playwright-core` 1.65.1 spoza repo; nowy tymczasowy profil na każdy przebieg |
| Warianty | `served`: `serve.py` (8765) i drugi serwer `--allow-tile-origin http://127.0.0.1:8791` (8766) do testu satelity; `offline`: `planner-offline.html` przez `file://` z **wyłączoną siecią** przeglądarki (`navigator.onLine=false`) |
| Dostawca satelity w teście | **atrapa na loopback** (`scripts/mock_tiles.py`, jednolity zielony PNG). Żaden prawdziwy dostawca nie otrzymał żądania. |
| Artefakt offline | 71 343 809 B, SHA256 `b0b37f91ddf2814245331f8988e000c07a725c518d8d47bd1af91884fbf14b9f` |

## Testy akceptacyjne użytkownika

| # | Wymaganie | served | offline | Dowód |
| --- | --- | --- | --- | --- |
| M0 | Start mapy MapLibre z lokalnych kafli, 0 żądań zewnętrznych | PASS | PASS | `*/M0-*-initial.png` |
| M1 | Wszystkie koszyki dnia; ekipa, kolor i numer każdej wizyty zgodne z planem (porównanie niezależne od modułu mapy) | PASS — 13/13 wizyt, 5 ekip, 8 nóg tras | PASS | `*/M1-*-all-baskets.png` |
| M2 | Kliknięcie punktu → popup → „Edytuj w planerze” wybiera zlecenie, fokus w formularzu | PASS | PASS | `*/M2-*-popup.png` |
| M3 | Przeniesienie instalacji przez formularz → markery i trasy bez przeładowania strony | PASS (TEST-013 → TEST-02/20.11; trasy 8→7; plan = mapa) | PASS | `*/M3-*-after-move.png` |
| M4 | Cofnięcie i „Wróć do kolejki” aktualizują mapę | PASS | PASS | `results` |
| M5 | Zmiana daty bez wizyt poprzedniego dnia | PASS (18.11: 0 pozostałości) | PASS | `results` |
| M6 | Ukrywanie koszyka (bez renumeracji innych), nieprzydzielonych, tras, podkładu | PASS | PASS | `*/M6-*-layers-off.png` |
| M7 | „Satelita” bez konfiguracji: zostaje drogowa, komunikat, 0 żądań | PASS | PASS | `results` |
| M8 | Plan i mapa po odświeżeniu | PASS | PASS | `results` |
| M9 | Import planu JSON aktualizuje mapę | PASS | PASS | `results` |
| M10 | Klawiatura (numerowana lista wizyt) i widok 390 px | PASS | PASS | `*/M10-*-mobile.png` |
| M11 | Satelita/hybryda dopiero po konfiguracji + zgodzie + originie dopuszczonym przy starcie serwera; atrybucja jako tekst; po powrocie do drogowej źródło usunięte i 0 nowych żądań; klucz nie wyświetlany | PASS (4 kafle atrapy) | n/d — plik offline nie pobiera rastrów | `served/M11-served-satellite.png`, `M11-served-hybrid.png` |
| M12 | Brak WebGL → mapa uproszczona SVG, planer działa | PASS | PASS | `results` |
| M13 | Konsola/sieć: 0 błędów, 0 żądań poza loopback/`file:` | PASS | PASS | `results` |

Pełne dane: `served/map06-results-served.json`, `offline/map06-results-offline.json`.

## Regresja MAP-05 w przeglądarce (`map05-regression/`)

Dawne 10 scenariuszy na nowym artefakcie offline z wyłączonym WebGL, czyli na ścieżce mapy SVG: **10/10 PASS**. Przy aktywnym WebGL scenariusze S1, S2, S4 i S9 (części dotyczące mapy SVG) nie mają zastosowania, bo mapa SVG jest wtedy ukryta. Zastępują je M0–M13. Pozostałe scenariusze (kolejka, generowanie, ręczna korekta, potwierdzenia, JSON, wąski ekran, sieć) przechodzą także z WebGL.

## Wydajność i pamięć (`offline/map06-perf-offline.json`)

Pierwsze `idle` mapy: 3,7 s od nawigacji. 10 przelotów (`flyTo`, 1,2 s) między zoomami 7–17: 51–74 klatek na przelot, `idle` po 1,5–1,9 s. Najgorsza klatka to 401 ms przy wejściu na z13 w nowym obszarze: generowanie kafli MVT na wątku głównym. Sterta JS: 183 MB po wczytaniu (osadzone dane), szczyt 356 MB po objeździe regionu (`usedJSHeapSize`, z nieuzbieranymi obiektami). Pamięć podręczna zdekodowanych dróg ograniczono do 25 000 odcinków.

## Ograniczenia i NOT TESTED

- Prawdziwi dostawcy zdjęć (GUGiK ORTO, MapTiler, Esri) **nie byli wywoływani**. Parametry presetu GUGiK (WMS, EPSG:3857) wymagają potwierdzenia przez GetCapabilities przy pierwszym świadomym włączeniu.
- Firefox/Safari, urządzenia dotykowe (gesty), czytnik ekranu: nie testowano.
- Generowanie kafli na wątku głównym może powodować pojedyncze przycięcia przy pierwszym wejściu w obszar. Zalecany następny krok: dedykowany worker kafli.

## Przegląd Codexa (T6) i poprawki

Werdykt T6 dla stanu sprzed poprawek: CHANGES REQUESTED, 5 × P2 i 1 × P3, bez P1 (`evidence/2026-11-17-map06-codex/T6-REVIEW.md`). Wszystkie ustalenia obsłużone, po poprawkach powtórzono pełne testy i akceptację w Chrome (served 14/14, offline 13/13, regresja SVG 10/10):

| Ustalenie | Poprawka |
| --- | --- |
| F1 popup z nieaktualnym przydziałem | popup odświeża się z bieżącego feature (zmiana ekipy/okna, powrót do kolejki) i zamyka, gdy zlecenie znika z mapy; test w `tests/maplibre-view.test.mjs` |
| F1b (z re-checku) odświeżenie popupu kradło fokus | popup przebudowuje się tylko przy zmianie danych zlecenia (bez flagi `selected`), a fokus spoza popupu jest przywracany; test z atrapą zachowującą się jak vendorowy `Popup` |
| F2 URL z loginem/hasłem | `validateSatelliteConfig` odrzuca `username/password`; `maskSecrets` maskuje userinfo; test |
| F3 `valid_origin` przyjmował `;`, cudzysłów, zły port | ścisły regex originu + kontrola portu; negatywne przypadki w `test_delivery.py` |
| F4 brak fallbacku SVG po błędzie startu workera | `ready` odrzuca się po błędzie przed pierwszym `load` (poza błędami kafli); planner przechodzi na SVG; test |
| F5 niepełne noty licencyjne | `vendor/maplibre-gl/THIRD-PARTY-LICENSES.txt` (pełne teksty 19 zależności, w manifeście z hashem) i osadzenie w `planner-offline.html` (`#third-party-licenses`, objęte CSP hashem); testy treści. `murmurhash-js` nie dostarcza pliku licencji — pełny tekst MIT (Copyright (c) 2011 Gary Court) pochodzi z sekcji License jego README |
| F6 słabe asercje M4/M6 | M4 wymaga skutecznego `REMOVE` i zmiany planu; M6 porównuje plan sprzed pierwszego przełącznika; nieudane żądania `blob:` zapisywane osobno (`blobFailed`, 0) |
