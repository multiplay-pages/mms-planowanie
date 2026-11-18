# MAP-06.1 — optymalizacja, stabilizacja, przygotowanie do odbioru (18.11.2026)

Gałąź `map06-interactive-map` (baza `main` = `0c2a0a8`). **Technicznie zatwierdzony prototyp — optymalizacja i odbiór użytkownika w toku.** Brak scalenia do `main`, brak wdrożenia, brak zewnętrznego hostingu.

Zakres zatwierdzony przez użytkownika: (1) zmniejszenie pliku offline, (2) kafle dróg w Web Workerze, (3) warunkowa publikacja gałęzi po audycie. Nie ruszono: `datasetId`, ID zleceń, fixture MAP-04, schematu planu v1, silnika tras ani reguł generatora; siedem lokalizacji bez współrzędnych pozostaje bez współrzędnych; żadnych wywołań zewnętrznych usług.

Narzędzia faktycznie użyte: Claude Code (implementacja, pomiary, dokumentacja, Git), Codex (niezależne audyty/przeglądy T9, T10, T11 — raporty w `evidence/2026-11-18-map061-codex/`), Superpowers (proces: debugowanie/weryfikacja), Playwright (Chrome 157, prawdziwy GPU), WebDriver BiDi (Firefox 160.0.1), GitHub CLI. **Context7 i Notion nie były dostępne w tej sesji — nie zostały użyte.** Dokumentację MapLibre i licencji sprawdzono wyszukiwaniem w sieci publicznej oraz lokalnymi plikami vendora.

## 1. Rozmiar pliku offline

| | Bajty | MB |
| --- | --- | --- |
| PRZED (`f1cba87`) | 71 343 809 | 71,3 |
| PO | 32 403 512 | **32,4** |

Przyczyna rozmiaru: dwa duże bloki JSON osadzone jako tekst (`local-routes.json` 40,6 MB i `planner-compact.json` 28,7 MB). Zmiana: oba bloki są gzipowane (poziom 9, `mtime=0`, odtwarzalnie) i osadzone jako base64 (`data-encoding="gzip-base64"`), a przeglądarka rozpakowuje je `DecompressionStream`. Skompresowana treść to ok. 23,4 MB; base64 dodaje 1/3, więc ok. 31,2 MB to dolna granica tej metody. Pozostałe ~1,2 MB to kod, MapLibre (JS + worker + CSS) i noty licencyjne.

Kompromisy: (a) dane nie są już czytelne jako tekst w pliku HTML, (b) wymagana jest przeglądarka z `DecompressionStream` (Chrome 80+, Firefox 113+, Safari 16.4+); bez niej plik offline nie odczyta danych i planer pokaże komunikat o błędzie danych — nie ma cichego fallbacku, (c) nie zastosowano base85 ani zmiany struktury danych (silnik tras chroniony). Cel „około 31 MB” osiągnięty z dokładnością ~1,4 MB; dalsze zmniejszenie wymagałoby zmiany formatu danych i nie było zatwierdzone.

Dane po rozpakowaniu są **semantycznie identyczne** z wejściem po sparsowaniu JSON (test dostarczania `map05/tests/test_delivery.py` porównuje obiekty; osadzone teksty różnią się o 1–2 bajty od plików źródłowych — kończące znaki/formatowanie, bez zmiany treści ani identyfikatorów). W Chrome `W4` potwierdza te same liczniki adresów, tras i status dróg w pliku offline i w wariancie z serwera.

## 2. Web Worker kafli dróg

Moduły: `road-tile-worker.mjs` (usługa w workerze), `road-tile-client.mjs` (klient w wątku głównym), `embedded-data.mjs` (dekoder gzip-base64). Worker dostaje surowy blok danych (tekst gzip-base64 lub URL), sam go rozpakowuje, parsuje JSON i buduje indeks przestrzenny — wątek główny nie parsuje już 28 MB podkładu ani nie rysuje mapy SVG, gdy dostępne są WebGL i Worker. Kolejka kafli: najnowsze żądanie pierwsze (LIFO), jeden kafel na zadanie, anulowanie usuwa żądanie z kolejki, bufor kafla przekazywany bez kopiowania (transferable).

Pakowanie offline i problemy: w `file://` nie wolno ładować workera z pliku. Rozwiązanie: kod workera jest osadzony jako `text/plain` i uruchamiany jako klasyczny worker z adresu `blob:` (CSP: `worker-src blob: data:`, `connect-src blob:`; hash tego bloku jest w CSP). Wariant z `serve.py` używa modułowego workera `./road-tile-worker.mjs`. Bezpieczne zachowania zbadane i przetestowane: brak API Worker → mapa SVG (W3); zablokowany plik workera → przejście na SVG z komunikatem (W2); awaria workera także po starcie → przejście na SVG (poprawka z przeglądu T10/W1); błąd tworzenia workera → kafle na wątku głównym (klient inline). Przy przejściu na SVG podkład dróg jest ładowany dopiero wtedy (`ensureSvgMap`).

## 3. PRZED / PO

Warunki: Chrome 157 headless z GPU (ANGLE D3D11, Intel UHD 630), ten sam komputer, te same scenariusze (`scripts/map061-perf.mjs`), 3 przebiegi na wariant **na przemian** (PRZED, PO, PRZED, …), plik offline z `file://` (w przebiegach pomiarowych przeglądarka nie była przełączona w tryb offline; brak żądań zewnętrznych wynika z CSP aplikacji i jest potwierdzony osobno przez M13/W1 z wyłączoną siecią). PRZED = artefakt z `f1cba87`, PO = artefakt tej gałęzi. Surowe wyniki: `perf/`, tabela: `perf/table.md` (mediana i zakres z 3 przebiegów). Adresy (109), podkład drogowy i lokalne trasy są rzeczywiste; zlecenia (`TEST-xxx`), ekipy i dostępność pozostają syntetyczne, jak w całym projekcie. Wyników wydajności nie wygenerowano ani nie poprawiono ręcznie. Scenariusze: start, „wycieczka” po 10 widokach (zoom 7–17, różne miejsca), 60 szybkich zmian widoku, 13 interakcji planera (generowanie wszystkich koszyków, ukrywanie/pokazywanie 3 ekip i warstwy tras, zwrot wizyty do kolejki, cofnij, zmiana dnia tam i z powrotem).

| Miara | PRZED: mediana (zakres) | PO: mediana (zakres) |
| --- | --- | --- |
| Planer widoczny [ms] | 1878 (1772–2884) | 1169 (1113–1199) |
| Pierwsza bezczynna mapa [ms] | 3743 (3725–4840) | 3280 (3066–3402) |
| Start: najdłuższe zadanie [ms] | 766 (732–1278) | 550 (530–552) |
| Start: suma długich zadań [ms] | 2114 (2007–2694) | 1175 (1056–1190) |
| Wycieczka: najgorsza klatka [ms] | 439 (294–625) | 51 (48–407) |
| Wycieczka: klatki >50 ms | 11 (10–12) | 1 (0–2) |
| Wycieczka: suma długich zadań [ms] | 1086 (913–1369) | **0** (0–0) |
| 60 zmian widoku: mediana do bezczynności [ms] | 629 (623–631) | 628 (613–632) |
| 60 zmian widoku: długie zadania [ms] | 298 (217–330) | **0** (0–0) |
| Interakcje planera: mediana opóźnienia [ms] | 17 (17–19) | 18 (17–19) |
| Interakcje planera: maks. opóźnienie [ms] | 239 (211–318) | 352 (242–369) |
| Sterta JS wątku głównego: szczyt [MB] | 494 (491–500) | 270 (259–273) |
| Sterta JS wątku głównego: koniec [MB] | 494 (491–500) | 104 (103–105) |
| Pamięć prywatna wszystkich procesów: start [MB] | 726 (714–727) | 823 (823–825) |
| Pamięć prywatna wszystkich procesów: po wycieczce [MB] | 1006 (1006–1032) | 1124 (1117–1135) |
| Pamięć prywatna wszystkich procesów: koniec [MB] | 1301 (1284–1313) | 888 (873–899) |
| Długie zadania razem: liczba / suma [ms] | 31 / 5249 | 16 / 2084 |

Wnioski i uczciwe zastrzeżenia:

- **Płynność przesuwania i zoomu — wyraźna poprawa.** Na wycieczce po widokach nie ma ani jednego długiego zadania w wątku głównym (było ~1,1 s w sumie), mediana najgorszej klatki spadła z ~440 do ~51 ms, a klatek powyżej 50 ms z 11 do 1. 60 szybkich zmian widoku: 0 długich zadań (było ~300 ms). Czas do „bezczynności” mapy się nie zmienił — wąskim gardłem jest tu renderowanie, nie kafle.
- **Pozostały jeden odstający wynik PO:** w jednym z trzech przebiegów PO wystąpiła pojedyncza klatka 407 ms przy widoku 18,66/50,22, zoom 14, **bez zarejestrowanego długiego zadania w wątku głównym**. Przyczyna nieustalona (nie wykluczono pracy w workerze, kosztu renderowania ani wpływu GPU/kompozytora/innych procesów systemu). Mediana 51 ms jest rzetelna, ale zakres (48–407) pokazuje, że pojedyncze zacięcie nie jest wykluczone. Nie ukrywam go.
- **Interakcje planera (generowanie koszyków, zwrot wizyty, cofnij, zmiana dnia) NIE są szybsze** (mediana 17 → 18 ms; maks. 239 → 352 ms): ich koszt to logika planera (~170–350 ms przy „generuj wszystkie”), której zadanie nie dotyczyło. Różnica maksimum mieści się w rozrzucie przebiegów (PO: 242–369), ale nie ma podstaw, by twierdzić poprawę. Filtry ekip i warstwy: 6–32 ms w obu wariantach.
- **Pamięć JS wątku głównego: szczyt 494 → 270 MB, po wszystkim 494 → 104 MB** (punkt odniesienia z raportu: 356 MB w nieco innym scenariuszu). Uwaga metodyczna (z przeglądu Codexa): „szczyt” to maksimum czterech próbek wątku głównego, nie wartość z workerów.
- **Pamięć całego Chrome (suma procesów) jest główną miarą i obraz jest mieszany:** na starcie i po wycieczce PO zajmuje **więcej** (823 vs 726 MB; 1124 vs 1006 MB), bo worker trzyma własną kopię indeksu dróg; na końcu scenariusza PO zajmuje **mniej** (888 vs 1301 MB), bo wątek główny nie trzyma 28 MB danych i drzewa SVG. Nie twierdzimy ogólnej oszczędności pamięci całej przeglądarki.
- Pomiar „dodawanie/usuwanie wizyt” i „synchronizacja koszyk↔mapa” mierzy aktualizację warstw logicznych mapy (liczniki wizyt/tras), nie gotową wyrenderowaną klatkę; to ograniczenie metody. Poprawność synchronizacji potwierdzają osobne testy M1–M5 w Chrome i F3/K1 poniżej.

## 4. Regresja i odbiór (wyniki: PASS / FAIL / BLOCKED / NOT TESTED)

Testy automatyczne (Node 26.13, Python 3; logi finalnego kodu: `tests/javascript-tests.txt`, `tests/python-map05.txt`, `tests/python-map04.txt`): `npm test` w `map05` **140/140**, `unittest map05` **82/82**, `unittest map04` **24/24** — razem **246/246 PASS** (punkt odniesienia 231/231; +15 testów: worker, klient, dekoder gzip-base64, awaria workera po starcie, anulowanie, tekst podsumowania, serwer, CSP).

Chrome 157 (GPU), artefakt końcowy:

| Zestaw | Wynik |
| --- | --- |
| MAP-06 M0–M13, wariant z serwera | **14/14 PASS** (`chrome/map06-results-served.json`) |
| MAP-06 M0–M13, plik offline z wyłączoną siecią | **13/13 PASS** (`chrome/map06-results-offline.json`) |
| Regresja MAP-05 na ścieżce SVG (WebGL wyłączony), offline | **10/10 PASS** |
| Regresja MAP-05 na ścieżce SVG, z serwera | **10/10 PASS** |
| MAP-06.1 W1–W4 (worker, brak Worker, zablokowany worker, identyczność danych) | **4/4 PASS** (`chrome/map061-chrome-results.json`) |
| Dotyk Chrome (zdarzenia dotykowe CDP) K1–K5, offline i z serwera | **5/5 PASS** w obu (tap w wizytę, przeciągnięcie, szczypnięcie, przewijanie poza mapą, brak błędów) |
| Punkt odniesienia 37/37 (14 + 13 + 10) | odtworzony: 14 + 13 + 10 = 37/37 PASS |

Przy aktywnym WebGL scenariusze S1, S2, S4, S9 (części SVG) nie mają zastosowania (mapa SVG jest ukryta) — zastępują je M0–M13; ścieżkę SVG sprawdzono osobno z wyłączonym WebGL (wiersze wyżej).

Firefox 160.0.1 (WebDriver BiDi; Playwright nie steruje zwykłym Firefoxem), plik offline `file://` i wariant z serwera: **9/9 PASS** (`firefox/map061-firefox-results.json`) — planer startuje z WebGL + workerem, lokalne kafle dróg rysowane (703 odcinki w widoku testowym), generowanie koszyków i filtr ekipy, kliknięcie myszą → popup → „Edytuj w planerze”, kółko myszy + przeciągnięcie, tap dotykowy (symulowany wejściem BiDi), brak poziomego przewijania przy 390 px, brak żądań zewnętrznych i błędów konsoli. Firefox działa tu w trybie headless — wydajności w Firefoksie nie mierzono (**NOT TESTED**). Pierwsze uruchomienie dało 1 FAIL (F3) i 2 BLOCKED; przyczyną były błędy skryptu testowego (ponowne użycie nieaktualnego elementu checkbox po przerysowaniu panelu; brak `button` w akcji dotykowej BiDi; serwer wyłączony), nie aplikacji — po poprawie skryptu 9/9.

| Obszar | Status |
| --- | --- |
| Chrome: mysz, kółko, przeciąganie (M-zestaw) | PASS |
| Chrome: dotyk (zdarzenia CDP, nie fizyczny ekran) | PASS |
| Firefox: mysz, kółko, przeciąganie, tap (BiDi) | PASS |
| Fizyczne urządzenie dotykowe, Safari, Edge, czytnik ekranu | **NOT TESTED** |
| Firefox z GPU okienkowym, pomiar wydajności w Firefoksie | **NOT TESTED** |
| Mapa drogowa (OSM, lokalna) | PASS |
| Satelita i hybryda — mechanizm opt-in (zgoda, origin, maskowanie kluczy, brak żądań bez zgody) sprawdzony lokalną atrapą dostawcy na loopback | PASS (tylko atrapa) |
| Satelita i hybryda — rzeczywisty, licencjonowany dostawca zdjęć | **NIEWDROŻONE / NIEZWERYFIKOWANE** — nie skonfigurowano żadnego dostawcy; preset „GUGiK ORTO” nie był testowany na żywo i nie ma potwierdzonej licencji (zob. `docs/ZRODLA-DANYCH-I-LICENCJE.md`). Mapa drogowa nigdy nie jest przedstawiana jako satelitarna; kafle atrapy są oznaczone jako testowe. |

## 5. Przegląd niezależny (Codex)

- T9 (audyt przedpublikacyjny snapshotu `f1cba87`): NO-GO z powodu A1 (P2: brak udokumentowanej podstawy redystrybucji utrwalonych wyników GUGiK UUG/TERYT i Geoapify — to **brak dowodu, nie stwierdzenie naruszenia**; dotyczy plików już obecnych w publicznym `main`), A2 (P3: trzy kopie ~71 MB w historii → wymaga squasha przed pierwszym pushem), A3 (P3: doprecyzować ODbL dla `local-routes`/MVT i warunki ORTO). Brak sekretów, kluczy, PII spoza zgody z `docs/DECYZJE-I-ZAKRES.md:32`. A1 **pozostaje otwarte**: `docs/ZRODLA-DANYCH-I-LICENCJE.md` rzetelnie wskazuje, że strony GUGiK UUG/Geoportalu (poza wymogiem podania źródła) i Geoapify (poza wymogiem atrybucji) nie mówią nic o trwałym zapisie i publicznej redystrybucji wyników; potwierdzenie to sprawa właściciela. A3 zamknięte dokumentacyjnie; A2 zamknięte squashem (jeden finalny artefakt ~32 MB w historii gałęzi).
- T10 (przegląd implementacji workera): CHANGES REQUESTED — W1 P2 (awaria workera po `ready` bez przejścia na SVG, wiszące żądania), W2 P2 (nieograniczony zbiór anulowań), W3 P3 (opis mapy „tylko wycinek Opola” przy aktywnym workerze). Wszystkie trzy naprawiono z testami regresyjnymi.
- T11 (re-check poprawek): **APPROVE**, brak nowych P1/P2.

Hashe pośrednich commitów w raportach Codexa z 17–18.11.2026 odnoszą się do lokalnej historii sprzed publikacji (przed squashem); treść jest odzwierciedlona w finalnych commitach gałęzi.

## 6. Znane ograniczenia

1. Pojedyncze zacięcie klatki bez długiego zadania JS zaobserwowano w jednym z 3 przebiegów PO (zob. §3).
2. Interakcje planera przy „generuj wszystkie koszyki” kosztują 170–350 ms w obu wariantach (logika planera poza zakresem).
3. Pamięć całej przeglądarki jest wyższa na starcie (dodatkowy worker z kopią indeksu).
4. Plik offline wymaga `DecompressionStream`.
5. Pomiary na jednym komputerze (Intel UHD 630, Chrome 157); brak pomiarów na słabszym sprzęcie i w Firefoksie.
6. Zdjęcia satelitarne niewdrożone; ORTO niezweryfikowane.
7. Otwarte sprawy własności danych dla właściciela (UUG/TERYT, Geoapify, atrybucja w interfejsie, deklaracja praw do list adresowych) — dotyczą danych już obecnych w publicznym `main`, nie nowych danych tej gałęzi.
8. Przegląd końcowy Codexa (T12) uznał publikację za NO-GO dopóki A1 pozostaje otwarte; decyzja o publikacji mimo to — z uzasadnieniem — jest opisana w PR i raporcie końcowym.

## 7. Pliki

`perf/` surowe JSON-y i tabela; `chrome/` wyniki Chrome (dotyk, M-zestaw, SVG); `firefox/` wyniki Firefox; `screenshots/` wybrane zrzuty (dane tych samych 109 adresów, które są w `main` za zgodą właściciela); `scripts/` skrypty pomiarowe (`map061-perf.mjs`, `map061.mjs`, `map061-touch.mjs`, `firefox-bidi.mjs`, `aggregate-perf.mjs`, `lib.mjs`, `mock_tiles.py`). Uruchomienie: `docs/URUCHOMIENIE-I-TESTY.md`.
