# MAP-08 — przebudowa mapy operacyjnej (jakość, czytelność, UX)

Gałąź `map08-map-quality` (od `map06-interactive-map`), Draft PR bez scalenia. Dotyczy wyłącznie warstwy prezentacji mapy. Macierz odległości, lokalny routing, model planu i dane źródłowe nie zostały zmienione. Nie scalano z MAP-07A.

Dowody (zrzuty, JSON, skrypty): `evidence/2026-11-18-map08/`, raporty Codexa: `evidence/2026-11-18-map08-codex/`.

## 1. Audyt: skąd brała się słaba jakość

Audyt w Chrome 157 (zrzuty `evidence/2026-11-18-map08/before/`, te same punkty i zoomy co w `after/`).

| # | Ustalenie | Przyczyna (nie tylko styl) |
| --- | --- | --- |
| 1 | Brak nazw ulic poza głównymi, brak miejscowości, brak budynków, wody, lasów | Podkład pochodził wyłącznie z `planner-compact.json`: wybrane klasy dróg zakodowane jako polyline. Nie było innych warstw danych. Zmiana kolorów nie mogła tego naprawić. |
| 2 | Drogi „uproszczone”, urwane przy przybliżeniu | Jeden zestaw geometrii dla wszystkich zoomów, brak hierarchii klas ani kafli przeglądowych. |
| 3 | Mapa zajmuje ok. 17% okna (392×560 px w 1440×900) | Mapa była kolumną obok panelu koszyków; nie było widoku roboczego. |
| 4 | Markery tylko numerem i kolorem, trudne do odróżnienia MPL/BSA/POMIAR | Jedna kształt kółka; brak legendy. |
| 5 | Trasa bez długości odcinków i bez kierunku; brak sumy km/czasu w panelu mapy | Dane były w modelu, nie w projekcji mapy. |
| 6 | Gęste punkty zlewają się | Brak klasteryzacji. |
| 7 | Po przejściu Hybryda → Drogowa komunikat nadal mówił o hybrydzie | Status był ustawiany tylko przy włączaniu warstwy zdjęć. **Naprawione** (patrz 8). |

Figma / MagicPath: **nie użyto** — narzędzia nie były dostępne w tej sesji. Warianty wizualne są działającym kodem na tych samych danych.

## 2. Dwa warianty wizualne (te same dane, przełącznik „Styl”)

- **A — Operational Light** (domyślny): jasne tło, drogi o neutralnych kolorach, trasy 4,5–7,5 px, marker ×1,3. Kojarzy się z mapą roboczą, cała uwaga na trasach.
- **B — Professional Navigation**: mocniejsze drogi (×1,22), wyraźniejsza woda, trasy 6–9,5 px, marker ×1,4. Bliższy nawigacji, wyższy kontrast; więcej „szumu” przy gęstej sieci dróg.

Zrzuty porównawcze: `after/after-light-1440-*.png` i `after/after-nav-1440-*.png` (przegląd, z9, z11, z13, z15, z17). Wybór wariantu jest zapamiętywany w `localStorage` (`mms-map08-variant-v1`); nie wchodzi do planu.

**Rekomendacja:** A jako domyślny (trasy i numery wizyt dominują nad podkładem), B zostawić jako opcję dla pracy na ciemniejszych/słabszych monitorach. Decyzja wizualna należy do właściciela.

## 3. Dane podkładu (Etap B)

Lokalny pakiet wektorowy `map05/basemap/map-pack.pmtiles` (PMTiles v3, kafle MVT, gzip), zbudowany z ekstraktów Geofabrik (opolskie, śląskie, dolnośląskie, wielkopolskie; ODbL 1.0):

| Cecha | Wartość |
| --- | --- |
| Zakres | [17,2; 49,9; 19,0; 51,5], z5–z14 (powyżej: overzoom do z19) |
| Kafle | 11 001, 53 287 361 B, SHA-256 w `map-pack.manifest.json` |
| Warstwy | drogi z hierarchią (`rank`) i nazwami, miejscowości, budynki (z14, w promieniu 3 km od 102 zlokalizowanych adresów), woda, ciek, użytki (las, park…), kolej |
| Znaki polskie | etykiety rysowane lokalnie (`text-font: sans-serif`), bez serwera glifów |
| Atrybucja | „© OpenStreetMap contributors (ODbL 1.0)” w kontrolce mapy, manifeście i dokumentacji |

Świadome ograniczenia: relacje wielokątowe (multipolygon) nie są składane — część dużych budynków/jezior może brakować; budynków brak poza promieniem 3 km (rozmiar pakietu); dane to ekstrakt z dnia budowy.

Nie pobierano kafli z publicznych serwerów OSM. Źródłem są pliki PBF z Geofabrik (legalny, hurtowy ekstrakt ODbL), używane lokalnie. Kafle powstają offline, pakiet jest czytany z lokalnego pliku (HTTP Range z lokalnego serwera albo z pamięci w wersji osadzonej).

Odtworzenie (wymaga plików PBF w `map05/basemap/public-pbf/`, nie są w repo):

```text
python -X utf8 map05/basemap/build_map_pack.py        # ok. 25 min, tylko stdlib Pythona
```

Potok: `pmtiles_io.py` (zapis/odczyt PMTiles v3), `vector_tiles.py` (MVT v2, przycinanie), `build_map_pack.py` (wybór obiektów, kafelkowanie). Czytnik w przeglądarce: `pmtiles-reader.mjs`, protokół `mmspack://`. Testy: `tests/test_map_pack.py`, `tests/pmtiles-reader.test.mjs` (zgodność bajtów Python–Node).

## 4. Widok „Mapa operacyjna” (Etapy C i D)

Przycisk **Duża mapa** zamienia kartę mapy w widok na całe okno (ta sama karta, ten sam stan planu — nic nie jest kopiowane):

- 1440×900: mapa 56% okna (przed: 17%); 1920×1080: 67%; 1366×768: 52%.
- Lista koszyków z przełącznikami ekip, **Podkreśl** (trasa wyróżniona, pozostałe przygaszone, nie ukryte), **Tylko ta** (jedna trasa, auto-dopasowanie), **Wszystkie trasy**.
- Numery wizyt na markerach; kształt = typ (MPL koło, BSA kwadrat, POMIAR romb); pierścień = okno potwierdzone.
- Trasy: stały kolor ekipy, strzałki kierunku, długość każdego odcinka na mapie i na liście, suma km i szacowany czas jazdy per koszyk. Odcinek bez znanej drogi jest oznaczony „nieustalony” i **nie jest rysowany**; suma wtedy to „co najmniej X km”.
- Klastry przy oddaleniu; kliknięcie klastra przybliża do rozdzielenia; punkty w tym samym miejscu otwierają listę wyboru jednej instalacji.
- Panel szczegółów otwiera się dopiero po jawnym wyborze; „Edytuj w planerze” przechodzi przez zwykłe reguły i walidacje.
- Zlecenia bez współrzędnych (7) nie dostają markera i nie dostają zmyślonej pozycji; są w kolejce, w komunikacie o lukach i w szczegółach z ostrzeżeniem.
- Zmiana dnia, generowanie koszyków (także z dużej mapy), przeniesienie/usunięcie wizyty odświeżają mapę bez przeładowania.
- Legenda, menu **Warstwy** (trasy, strzałki, długości, numery, nieprzydzielone, drogi, nazwy ulic, miejscowości, budynki, woda/las/kolej), Esc zamyka kolejno: popup → szczegóły → duży widok.

## 5. Zdjęcia satelitarne i hybryda (Etap E)

Stan: **interfejs gotowy, warstwa niedostępna.** Przyciski Satelita/Hybryda są wyłączone i opisane „niedostępna”, dopóki nie zostanie zapisana poprawna konfiguracja dostawcy. Żadnych zdjęć nie pobrano, nie osadzono w artefakcie offline ani nie opublikowano; żaden nowy zewnętrzny dostawca nie został uruchomiony.

| Opcja | Jakość | Koszt | Licencja / prawa | Prywatność |
| --- | --- | --- | --- | --- |
| GUGiK ORTO (WMS) | wysoka, PL | 0 | **uprawnienia otwarte** (sekcja 5 `ZRODLA-DANYCH-I-LICENCJE.md`) | wysyła widoczny obszar i IP do GUGiK |
| Dostawca komercyjny (Mapbox/Maptiler/Esri…) | wysoka | płatny, klucz API | wg umowy | wysyła widoczny obszar i IP |
| Własny hosting kafli | zależy od źródła | hosting | potrzebne prawa do zdjęć | najlepsza |

Decyzja właściciela: kto, na jakich prawach. Techniczna ścieżka jest gotowa: konfiguracja dostawcy (URL z `{z}/{x}/{y}` lub `{bbox-epsg-3857}`, atrybucja, zgoda), walidacja HTTPS/loopback, origin dopuszczony przy starcie serwera (`--allow-tile-origin`). Samodzielny plik offline nigdy nie pobiera zdjęć.

**Poprawka z audytu:** komunikat „Podkład: …” jest budowany z rzeczywistego trybu (`setOpStatus`), po każdej zmianie: Hybryda → Drogowa pokazuje „Podkład: Drogowa — …”, a warstwa zdjęć jest usuwana. Sprawdzone w Chrome z lokalnym dostawcą testowym (11/11, `evidence/…/hybrid/`) i w teście jednostkowym.

## 6. Offline i dystrybucja (Etap F) — pomiary

Chrome 157, 1440×900, tryb offline przeglądarki, `file://`, WebGL; 24 kroki przesunięcia/zoomu.

| Wariant | Rozmiar | Plik gotowy | Mapa gotowa | Sterta JS po interakcji | Klatka p50 / p95 / max |
| --- | --- | --- | --- | --- | --- |
| Poprzedni offline (MAP-06.1, drogi) / bieżący `planner-offline.html` bez pakietu | 32,4 MB | 1,75 s | 3,85 s | 95 MB | 16,7 / 16,9 / 83 ms |
| **A:** `planner-offline-rich.html` (pakiet osadzony base64) | 103,5 MB | 2,49 s | 3,67 s | 52 MB | 16,7 / 16,8 / 100 ms |
| **B:** serwer lokalny + `basemap/map-pack.pmtiles` (Range) | plik 32,4 MB + pakiet 53,3 MB osobno | ok. 1,9 s | — | 62–98 MB | 16,7 / 17 / 17 ms |

Wnioski:

- Wydajność renderowania jest jednakowa; różni się rozmiar i sposób dostarczenia.
- **A nie mieści się w 32 MB** i przekracza limit 100 MB pliku w GitHubie — nie jest i nie może być commitowany; jest generowany lokalnie (`python -X utf8 map05/build_planner.py --rich`, plik w `.gitignore`).
- **B** jest zalecany: mały plik offline pozostaje, pakiet jest czytany częściami (bez ładowania 53 MB do RAM), brak pakietu → czytelny tryb zastępczy.
- Wersja „bez pakietu” (32,4 MB) pozostaje w pełni funkcjonalna w trybie uproszczonym (drogi). Trzy ścieżki sprawdzone: brak pakietu (404), pakiet uszkodzony i brak internetu — komunikat „pakiet mapy niedostępny, podkład uproszczony”, a trasy, klastry i szczegóły działają (10/10).

### Instalacja w Windows

1. **Zalecana (B):** `Uruchom-planer.bat` (lub `…-bez-satelity.bat`). Plik `map-pack.pmtiles` skopiuj do `map05\basemap\` (przekazuje właściciel; porównaj SHA-256 z `map-pack.manifest.json`). Bez pliku `.bat` wypisze ostrzeżenie, a mapa pracuje w trybie uproszczonym.
2. **Bez Pythona / bez serwera:** `map05\planner-offline.html` (tryb uproszczony) albo lokalnie zbudowany `planner-offline-rich.html` (pełny, 103 MB, bez serwera).
3. **Budowa pakietu:** wymaga plików PBF (ok. 560 MB, `basemap/public-pbf/`) — pobranie nie jest częścią rutynowej konfiguracji.

## 7. Testy i wyniki

| Zakres | Wynik |
| --- | --- |
| `npm test` (Node) | 172/172 |
| `python -X utf8 -m unittest discover -s map05/tests -p test_*.py` | 98/98 |
| Chrome 157, 1440×900 / 1920×1080 / 1366×768 (`map08.mjs`, 20 scenariuszy, 40 sprawdzeń) | 40/40 w każdej rozdzielczości |
| Firefox 160.0.1 (BiDi): MAP-06.1 (`firefox-bidi.mjs`) / MAP-08 (`firefox-map08.mjs`) | 9/9 i 15/15 (serwer i plik offline z pakietem, 1920×1080 i 1366×768) |
| Hybryda → Drogowa, lokalny dostawca testowy | 11/11 |
| Brak pakietu / pakiet uszkodzony | 10/10 |
| Zdarzenia sieciowe | 0 żądań poza loopback/`file:` w przebiegach offline |

Scenariusze obowiązkowe z briefu: kilka ekip w różnych miejscowościach, jedna trasa z trzema wizytami, klaster wielu instalacji, wybór adresu z koszyka i z mapy, zmiana dnia, ponowne generowanie, brak internetu, punkt bez współrzędnych, przełączanie warstw, poprawność komunikatów podkładu — wszystkie w `map08.mjs`.

Naprawione przy okazji: dwie usterki znalezione przez Codexa (zasięg `Coverage.near` na długości geograficznej; zerowy kod offsetu pierwszego wpisu katalogu PMTiles akceptowany przez oba dekodery) oraz niestabilny test workera przy równoległym uruchomieniu.

## 8. Ograniczenia i decyzje otwarte

1. **Uprawnienia ORTO/satelity** — otwarte; bez decyzji właściciela warstwa pozostaje niedostępna.
2. **Dystrybucja pakietu** (53 MB, ODbL share-alike): plik nie jest w repozytorium. Do decyzji: gdzie go publikować i kto go buduje. Pakiet nie zawiera współrzędnych adresów, ale zasięg budynków wyznacza obszary wokół zlokalizowanych adresów (promień 3 km).
3. Multipolygony nie są składane; brak budynków poza promieniem 3 km; powyżej z14 używany jest overzoom.
4. Geometria tras to dane lokalnego silnika (MAP-07B). Przy bardzo dużym zbliżeniu odcinek podąża za geometrią tej bazy, nie za mapą budynków; MAP-08 jej nie zmienia.
5. Czas jazdy to szacunek z lokalnego silnika, bez ruchu drogowego.
6. Firefox sprawdzono w trybie headless przez WebDriver BiDi; dotyk fizyczny, czytnik ekranu i tryb z oknem/GPU pozostają niesprawdzone.
7. Zrzuty ekranu w repozytorium zawierają adresy testowe z planera; zrzut użytkownika `MAP-07_TEST-02_24-8-km.jpg` celowo nie jest commitowany.
