# MAP-05 — weryfikacja, aktualizacja 17.11.2026

**STATUS HISTORYCZNY etapu „prawdziwa przeglądarka” (aktualny stan MAP-06 jest w sekcji poniżej): 10/10 scenariuszy runbooka PASS w prawdziwym Chrome 157 — zarówno modułowy widok przez `serve.py`, jak i zbudowany `planner-offline.html` przez `file://`. Wykryto i naprawiono 7 usterek, w tym P1 wizualne zasłonięcie ulic przy zbliżeniu. Testy: npm 86/86, Python map05 80/80, map04 24/24 — łącznie 190/190 PASS; build PASS. 0 żądań poza loopback/`file:`, 0 błędów konsoli. Nie testowano innych przeglądarek, trybu z oknem/GPU, urządzeń dotykowych ani czytnika ekranu. Prototyp nie jest gotowy produkcyjnie. Sekcje poniżej nowej są historyczne.**

## 18.11.2026 — MAP-07B (symulacja optymalizacji między koszykami)

Gałąź `map07b-cross-basket-optimization`. `npm test` 157/157, `unittest map05` 82/82, `unittest map04` 24/24. Chrome 157 (GPU): audyt `evidence/2026-11-18-map07b/chrome/` — 26/26 w trybie serwera i 26/26 z pliku offline (symulacja, brak zapisu przed akceptacją, akceptacja i cofnięcie, odrzucenie, podgląd mapy, układ 1440–390 px, brak błędów i żądań zewnętrznych). Benchmark i otwarte decyzje: `docs/MAP07B-OPTYMALIZACJA.md`. Niezależny przegląd Codex: zob. `evidence/2026-11-18-map07b-codex/`, jeśli dołączony. NOT TESTED: fizyczny dotyk, Safari/Edge, czytnik ekranu, Firefox dla nowego panelu.

## 18.11.2026 — MAP-06.1 (optymalizacja, worker kafli, Firefox)

**Status: technicznie zatwierdzony prototyp — optymalizacja i odbiór użytkownika w toku.** Nie scalono z `main`. Pełny opis, tabela PRZED/PO i ograniczenia: `evidence/2026-11-18-map061/README.md`.

| Sprawdzenie | Wynik |
| --- | --- |
| `npm test` (map05) | **140/140 PASS** |
| `unittest map05` / `unittest map04` | **82/82** / **24/24 PASS** (razem 246; punkt odniesienia 231) |
| Rozmiar `planner-offline.html` | 71 343 809 → **32 403 512 B** |
| Chrome 157 GPU: M0–M13 serwer / offline | **14/14** / **13/13 PASS** |
| Chrome: regresja MAP-05 na ścieżce SVG, serwer / offline | **10/10** / **10/10 PASS** |
| Chrome: W1–W4 (worker, brak Worker, zablokowany worker, identyczność danych) | **4/4 PASS** |
| Chrome: dotyk (zdarzenia CDP) serwer / offline | **5/5** / **5/5 PASS** |
| Firefox 160.0.1 (BiDi, headless): offline + serwer | **9/9 PASS** |
| Wydajność wątku głównego (3 + 3 przebiegi naprzemiennie) | wycieczka: 0 długich zadań (było ~1,1 s), mediana najgorszej klatki ~440 → ~51 ms (jeden odstający przebieg PO: 407 ms bez długiego zadania JS); interakcje planera bez poprawy (170–350 ms przy „generuj wszystkie”); pamięć całego Chrome +~100 MB na starcie, −~400 MB na końcu |
| Codex T10 / T11 | CHANGES REQUESTED (2 × P2, 1 × P3, naprawione) / APPROVE |
| NOT TESTED | fizyczny ekran dotykowy, Safari, Edge, czytnik ekranu, wydajność w Firefoksie |
| Satelita / hybryda | **niewdrożone, niezweryfikowane** (brak licencjonowanego dostawcy); mechanizm opt-in sprawdzony tylko atrapą na loopback |

## 17.11.2026 — MAP-06 interaktywna mapa operacyjna (prototyp na gałęzi `map06-interactive-map`)

**Status: prototyp gotowy do oceny, NIE scalony z `main` (uzupełnienie: MAP-06.1 powyżej).** Mapa MapLibre GL JS 6.19.0 z lokalnymi kaflami dróg, wszystkimi koszykami dnia, kolorami ekip, numeracją wizyt, przełącznikami warstw, popupem z przejściem do edycji, synchronizacją z planem oraz podkładem satelita/hybryda (opt-in) i fallbackiem SVG. Plan, dowody i ograniczenia: `docs/MAP06-PLAN.md`, `evidence/2026-11-17-map06/README.md`. Przegląd Codexa: `evidence/2026-11-17-map06-codex/` (T4 plan i ryzyka, T5 niezależne testy projekcji 29/29).

| Polecenie | Wynik |
| --- | --- |
| `npm test` (map05) | **125/125 PASS** (86 + 5 kafli MVT + 1 integracja mapy w DOM + 29 niezależnych testów projekcji Codexa + 4 testy adaptera po review: odświeżanie popupu bez kradzieży fokusu, walidacja adresu dostawcy, fallback przy błędzie startu) |
| `python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v` | **82/82 PASS** (kontrakt CSP offline, opt-in originów, vendor) |
| `python -X utf8 -m unittest discover -s map04/tests -v` | **24/24 PASS** |
| `npm run build` | PASS; `planner-offline.html` 71 343 809 B (+1,82 MB MapLibre i pełne noty licencji), `offline.html` bez zmian |
| Chrome 157 (GPU): akceptacja MAP-06 | served **14/14**, offline (sieć wyłączona) **13/13**; satelita testowany atrapą na loopback |
| Chrome: regresja MAP-05 na ścieżce SVG | **10/10 PASS** |

Zmiany kontraktów świadome i przetestowane: CSP artefaktu offline `connect-src blob:` zamiast `'none'` (wymagane przez worker MapLibre w `file://`, bez schematów sieciowych; test parsuje dyrektywy), `worker-src blob: data:`, `img-src data: blob:`. Bez zmian: `datasetId`, ID zleceń, fixture MAP-04, schemat planu v1, silnik routingu, reguły generatora i ochrony potwierdzeń.

## 17.11.2026 — Aion UI: weryfikacja w prawdziwej przeglądarce i poprawki

Zespół: Claude Code (lider, integracja, przebieg przeglądarkowy, dokumentacja, Git) i Codex CLI (niezależny baseline, reprodukcje, poprawki modelu w wydzielonych plikach, review). Baza: `8ce430af8dd3e8c20fd775c66d78a2b422785004`. Commit i potwierdzenie zdalne tego etapu są odnotowane w `docs/HISTORIA-PRAC.md` oraz w Git.

**Narzędzia.** Claude Code: pliki, PowerShell/Bash, Git 2.54, Python 3.12.10, Node 26.13.0/npm 11.20.0 i lokalny Chrome 157.0.8103.79. Brak narzędzia MCP przeglądarki, więc Chrome sterowano przez `playwright-core` 1.65.1 zainstalowany poza repo, bez pobierania przeglądarek. Nie była to próba obejścia odmowy, bo żadne narzędzie nie odmówiło. Codex: pliki, terminal, Git, Python, Node; jego narzędzie przeglądarki zwróciło „The browser access host is unavailable” i zgodnie z zasadami nie było obchodzone. Codex wykonał więc 0 testów wizualnych.

**Baseline przed zmianami (Codex, `8ce430a`):** npm 76/76, map05 80/80, map04 24/24 — 180/180 PASS. Logi: `evidence/2026-11-17-codex/`.

### Scenariusze przeglądarkowe

Pełna tabela oczekiwane/rzeczywiste/status/dowód: [`evidence/2026-11-17-browser/README.md`](../evidence/2026-11-17-browser/README.md). Dane maszynowe: `results-served.json`, `results-offline.json`.

| # | Zakres | served | offline |
| --- | --- | --- | --- |
| S1 | Desktop: kolejka 109, 102 punkty, 6 uwag PNA, panel 13 | PASS | PASS |
| S2 | Knurów: wybrany adres, zoom, drag, kółko, cały zakres | PASS | PASS |
| S3 | Dzień, wyłączony slot, filtry, wyszukiwanie, generowanie, powody | PASS | PASS |
| S4 | Mapa koszyka: droga 25,6 km, kolejność, kontrole; zmiana dnia | PASS | PASS |
| S5 | Pojemność, przeniesienie, cofnij, wróć do kolejki, zajęty slot, atomowość | PASS | PASS |
| S6 | Potwierdzenie, regeneracja, ochrona, zwolnienie z powodem | PASS | PASS |
| S7 | Rzeczywiste pobranie JSON, import w czystym profilu, odświeżenie, obcy plik | PASS | PASS |
| S8 | 390×844 i 768×1024 | PASS | PASS |
| S9 | Klawiatura i fokus, dialog | PASS | PASS |
| S10 | Konsola/sieć w obu profilach: 0 błędów, 0 zewnętrznych | PASS (51 żądań loopback) | PASS (4 żądania `file:`) |

W S9 przeglądarka pokazała też w praktyce ochronę regresji A→B→C. Usunięcie środkowej wizyty TEST-013 z koszyka TEST-01 zostało odrzucone komunikatem „Zmiana tworzy lub zwiększa naruszenie… Przekroczono 30 km”, a plan pozostał bez zmian.

### Usterki i poprawki

| ID | Waga | Usterka | Poprawka | Pliki | Test regresji |
| --- | --- | --- | --- | --- | --- |
| B1 | P1 | Przy zbliżeniu biała obwódka etykiet ulic i skali (3px bez `non-scaling-stroke`) rosła ~240× i zasłaniała ulice | `vector-effect:non-scaling-stroke` | `planner.css` | `planner-map.test.mjs`: halos stałej szerokości |
| B2 | P2 | Widok całego zakresu rysował ~672 losowe odcinki o medianie 0,4 px („okruchy”) | Przy limicie: pomija < ~1 px ekranu, sortuje klasa → długość | `planner-map.mjs` | `planner-map.test.mjs`: długie drogi zamiast fragmentów |
| B3 | P2 | Odmowa wyłączenia zajętego okna z mylącym „slot jest wyłączony…” | Komunikat z oknem, ekipą, dniem i zleceniem | `planner-model.mjs` (Codex) | `planner-model.test.mjs`, `planner-ui.test.mjs` |
| B4 | P2 | Fokus spadał na BODY po Potwierdź/Zwolnij/Wróć do kolejki | Fokus wraca do kontrolki w szczegółach | `planner.mjs` | `planner-ui.test.mjs` |
| B5 | P3 | Zmiana dnia w trybie „Mapa” koszyka zostawiała stary widok | Dopasowanie po zmianie dnia | `planner.mjs` | `planner-ui.test.mjs` |
| B6 | P2 | Przeniesienie po zwolnieniu potwierdzenia gubiło `releaseReason` | Powód przenoszony do nowego przydziału | `planner-model.mjs` (Codex) | `planner-model.test.mjs` |
| B7 | P3 | Przycisk „Mapa” 20 px, podsumowanie dróg 8,3 px | min. 24×44 px, teksty 10–11 px | `planner.css` | `planner-map.test.mjs` (24 px), S8 |

Każdy test regresyjny odtwarzający usterkę był najpierw RED na starym kodzie (B3/B6: `evidence/2026-11-17-codex/t2-red.txt`; B1/B2/B4/B5/B7: przebieg lidera przed poprawką), potem GREEN. Dodatkowy test kontrolny wolnych okien był celowo PASS przed i po zmianie. Niezależnie Codex podstawił wyłącznie bazowe `planner.mjs`/`planner-map.mjs`/`planner.css`: 4 nowe testy UI/mapy FAIL, reszta PASS. Ten sam skrypt Chrome na artefakcie bazowym daje FAIL w S2/S4/S5/S9. Nie zmieniono schematu planu (`schemaVersion` 1), `datasetId`, ID zleceń, danych źródłowych, fixture MAP-04, silnika dróg ani reguł 30 km/+10 km. `offline.html` (starszy demonstrator) nie zmienił się w buildzie.

### Polecenia i wyniki końcowe

| Polecenie | Wynik |
| --- | --- |
| `npm test` (w `map05`) | **86/86 PASS** (76 + 10 nowych) |
| `npm run build` (w `map05`) | PASS; `offline.html` bez zmian; `planner-offline.html` 69 522 757 B, SHA256 `694d833853c7db48b2844e1192bb5ad59d079efd2cfa15132204607420e648fe` |
| `python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v` | **80/80 PASS** (w tym CSP/hashe osadzonego HTML) |
| `python -X utf8 -m unittest discover -s map04/tests -v` | **24/24 PASS** |
| Scenariusze Chrome (served + offline) | **10/10 + 10/10 PASS** |

Logi końcowe: `evidence/2026-11-17-browser/tests/`.

### Publikacja

Commit `1359cdeedc7590262e7066891b5ce6b183f9f12f` wysłano na `main` repozytorium `multiplay-pages/mms-planowanie` jako fast-forward `8ce430a..1359cde`, bez force-push. `git ls-remote` i GitHub API potwierdzają zdalny HEAD `1359cde`, drzewo `0b5c59aded1d8c71601394ca9668132bbe1b2ae0` zgodne z lokalnym, 94 zmienione pliki oraz identyczny blob `planner-offline.html` (`011fba1e…`). GitHub ponownie ostrzegł o pliku 66,30 MB (powyżej zalecanych 50 MB, poniżej limitu). Nie użyto LFS, Pages ani wdrożenia.

### Otwarte i ograniczenia

- REMOVE nadal usuwa cały przydział wraz z `releaseReason`; pełna historia korekt wymaga decyzji o miejscu zapisu (bez zmiany schematu w tym etapie).
- Widok całego zakresu pokazuje główne drogi z przerwami, bo kompaktowy podkład składa się z krótkich odcinków OSM, a limit to 1 600 ścieżek. Szczegóły pojawiają się po zbliżeniu; generalizacja dróg wymagałaby nowego przetworzenia podkładu.
- Po odświeżeniu strony dzień planowania wraca do 18.11.2026; plan pozostaje zachowany.
- Wynik „Dojazd + praca: nieocenione” przy koszykach wynika z braku startu ekip i zatwierdzonych norm. To świadome ograniczenie, nie usterka UI.
- NOT TESTED: Firefox/Safari/Edge, Chrome z oknem/GPU, dotyk, czytnik ekranu, słabszy sprzęt.

---

## 17.11.2026 — regionalna mapa, lokalny routing i przekazanie do Aion UI

Użytkownik polecił kontynuować zamiast kończyć na raporcie geokodowania. Odrzucił propozycję wysłania współrzędnych do publicznego OSRM i wybrał rozwiązanie lokalne. Osobno polecił pozostawić 7 punktów bez pozycji — nie kontynuowano odczytu QGIS.

**Dostarczono:** kompletny regionalny podkład 322 452 dróg i lokalny skierowany graf z publicznych PBF czterech województw. W pobraniu nie było adresów ani współrzędnych zleceń. Nie wykonano zewnętrznego routingu. Geometria i metry pochodzą z lokalnego grafu; czasy są oszacowaniem na jawnych parametrach. 101/102 punktów mieści się w progu przyciągnięcia; 9 702/10 302 skierowanych par między różnymi punktami ma drogę. Rzędowice/Wolna 1 przekracza próg przyciągnięcia, dwa punkty Ostrowiny nie mają połączenia z pozostałymi w tym profilu. Braki pozostają jawne, bez przesuwania adresu lub podawania 0 km.

UI ma lokalne ulice po przybliżeniu, nazwy, legendę i skalę; widok koszyka rysuje znane geometrie i pokazuje kolejność wizyt. Generator/ręczna zmiana kontrolują robocze 30 km, wspólne +10 km i testową pracę z dojazdem w oknie. Brak startu/powrotu, manewrów, wjazdu na posesję, ruchu i zatwierdzonych norm nie jest maskowany jako wykonalność.

### Wykonane sprawdzenia

| Polecenie / kontrola | Rzeczywisty wynik |
| --- | --- |
| `npm test` w `map05` | **76/76 PASS**, w tym 55 planera/lokalizacji/dróg/DOM; [pełny log](../evidence/2026-11-17/javascript-tests.txt) |
| `python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v` | **80/80 PASS**; [pełny log](../evidence/2026-11-17/python-map05.txt) |
| `python -X utf8 -m unittest discover -s map04/tests -v` | **24/24 PASS**; [pełny log](../evidence/2026-11-17/python-map04.txt) |
| `npm run build` w `map05` | PASS: starszy HTML 1 595 911 B; aktualny HTML **69 521 671 B** |
| `node --check` ośmiu modułów i obu połączonych skryptów | PASS |
| `ast.parse` 35 źródeł Python | PASS |
| Wszystkie hashe skryptów/stylów inline i brak zasobów zewnętrznych offline | PASS; `connect-src 'none'` |
| Każda z 9 702 rzeczywistych dostępnych ścieżek | PASS: ciągłość odcinków i końce przy właściwych punktach dostępu |
| Wszystkie 322 452 rekordy kompaktowej mapy | PASS: pełny zestaw ID, nazwy, klasy, granice obejmują oryginalną geometrię, pochodzenie/hash |
| Suma kontrolna XLSX, oryginalnego CSV, fixture MAP-04 | PASS — bez zmian |
| Odtworzenie publicznych wejść z gzip | PASS: dokładne bajty, kontrola rozmiaru/hashu, brak nadpisania zmienionego pliku, bez sieci |
| Wyszukanie wybranych wzorców sekretów w plikach projektu | Brak trafień; nie skanowano prywatnych magazynów/configów i nie odczytywano tokenów |

**Łącznie 180/180 PASS**, bez liczenia podzbioru planera i powtórzeń niezależnego review jako nowych testów. [Zapis kontroli integralności](../evidence/2026-11-17/integrity.json) zawiera dokładne hashe i liczby źródeł. SHA256 aktualnego planera: `5693b0fbf0b516aa4cfc61e1abb1dbc94ece938120d4b73c1475eb1fd794be67`.

### Niezależny przegląd i poprawka

Przegląd tylko do odczytu potwierdził hashe wejść/silnika/buildera i wyniki par. Wykonał niezależnie 11 testów Python i 15 JS. Znalazł jeden istotny P2: ASSIGN i GENERATE mogły opuścić nowy limit w źródłowym koszyku po przeniesieniu środkowej wizyty (A→B=20 km, B→C=20 km, A→C=40 km).

Dodano odtwarzające testy, zaobserwowano RED, następnie naprawiono kontrolę nowych/zwiększonych naruszeń we wszystkich dotkniętych koszykach. Obejmuje również REMOVE. Dodano potwierdzenie, że stary zły plan może nadal zostać naprawiony usunięciem szkodliwego końca. Po poprawce targeted oraz pełne powyższe zestawy są zielone. Innych istotnych ustaleń reviewer nie zgłosił. Nie deklarujemy powtórnego niezależnego review po poprawce; jego dowodem są testy regresji i pełna kontrola.

### Zakres publikacji i dokumentacja

Użytkownik wskazał `https://github.com/multiplay-pages/mms-planowanie.git`. Konektor potwierdził publiczne repo, `main`, początkowy README i commit `3fee2d56bca2d3a057befe818087b3504697e2e8`. Po wyjaśnieniu jawności użytkownik wyraźnie zaakceptował publikację również adresów, współrzędnych i planera. Zachowano początkową historię i powiązano z nią lokalne repo; nie używa się force-push.

Przygotowano `docs/HISTORIA-PRAC.md`, `ARCHITEKTURA.md`, `DECYZJE-I-ZAKRES.md`, `URUCHOMIENIE-I-TESTY.md`, `PRZEKAZANIE-AION-UI.md`, oryginalny brief, indeks, główny README i `CLAUDE.md`. Uporządkowano wejścia dla obu agentów. Publiczne duże wejścia zapisano w bezstratnych archiwach z manifestem; cache PBF i obliczeń oraz zależności nie są publikowane jako pliki źródłowe. Faktyczny commit/potwierdzenie zdalnego zapisu jest rejestrowany osobno po wykonaniu push; sam etap przygotowania nie jest dowodem publikacji.

### Potwierdzona publikacja — 17.11.2026

Pełny projekt wysłano do publicznego `multiplay-pages/mms-planowanie`, gałąź `main`, commit implementacji `016347792204fc13d9ea980eb6cb667b3df79dde`. Zdalny HEAD i pełne drzewo `01d159ecbea4ba604a1f7acd50461d68890c180f` porównano niezależnie przez GitHub API z zapisem lokalnym: **PASS, 123 pliki**, bez ucięcia drzewa. Potwierdzono obecność planera, danych adresowych i współrzędnych, lokalnych tras, archiwów wejść, dokumentacji i dowodów testów. [Potwierdzenie publikacji](../evidence/2026-11-17/publication.json) zawiera identyfikatory plików i rozmiary. Późniejszy commit dokumentacyjny zapisuje ten dowód; identyfikatory w nim odnoszą się do powyższego commitu implementacji.

Zachowano początkowy commit repozytorium; push bez wymuszania. GitHub przyjął planer offline (66,30 MiB), zgłaszając ostrzeżenie o przekroczeniu zalecanych 50 MB; plik jest poniżej limitu 100 MiB. Nie użyto Git LFS. Nie uruchomiono Pages ani wdrożenia aplikacji. Cache pobrań PBF i obliczeń oraz zależności pozostają poza Git; bezstratne archiwa przetworzonych wejść i narzędzie odtworzenia są opublikowane.

### Pozostające granice dowodów

- W tej sesji nie uruchomiono prawdziwych testów wizualnych/interakcyjnych przeglądarki — obowiązuje historyczna konkretna odmowa Browser Use i zakaz jej obejścia. DOM w pamięci i kontrola HTML nie są rendererem.
- W następnym dozwolonym środowisku należy sprawdzić desktop/wąsko, wydajność regionalnych danych, pobranie/import JSON i klawiaturę. Szczegółowa checklista i zapis ograniczeń są w runbooku/handoffie.
- Siedem punktów bez pozycji to wyraźny wybór użytkownika. Trzy niepewne dostępy/połączenia pozostają wynikiem profilu danych, nie dowodem niepoprawności adresów.
- Model nie zawiera bieżącego ruchu, profilu wymiarów/masy pojazdu, potwierdzenia dojazdu/manewrów i baz ekip. D10 i normy produkcyjne pozostają otwarte.
- Nie wykonano zmian produkcyjnego MMS, zapisów Notion, kontaktu z klientami, GitHub Pages ani benchmarku zewnętrznego ORS–OSRM.

---

## 17.11.2026 — potwierdzone adresy i alternatywne współrzędne GUGiK

Użytkownik potwierdził, że jego adresy były już sprawdzone w QGIS, i polecił nie powtarzać tej kontroli. Po odrębnej akceptacji „Tak, użyj GUGiK dla 109 adresów” przekazano wyłącznie miejscowość, ulicę i numer budynku, bez lokali i danych zleceń. Odbiorca: bezpośrednio `https://services.gugik.gov.pl/uug/`, bez pośredników. Parametry: `GetAddress`, `exact_number=1`, `srid=4326`.

Rozliczono wszystkie 109 wejść. Otrzymano 107 poprawnych odpowiedzi JSON; Paniówki/Gliwicka BN3 i Zębowice/Leśna BN1 dały `JSONDecodeError` także po jednym ponowieniu. Zachowano metadane obu prób. To błąd odpowiedzi usługi, nie dowód błędu adresu. Cztery inne adresy nie otrzymały punktu; dla Maciejowa 39 odpowiedź zawiera kilka miejscowości bez zgodnego kodu źródłowego. Pełna tabela: `data/UUG-REPORT.md`.

96 wyników ma zgodny pełny numer (z literą), miejscowość/część miejscowości, kod i ulicę oraz identyfikatory rejestrowe. Sześć dodatkowych, pojedynczych punktów ma zgodny budynek/miejscowość/ulicę i identyfikatory, ale inny PNA w tym samym dwucyfrowym prefiksie. Zachowano oba kody i odrębny status `MATCHED_BUILDING_POSTCODE_NOTE`, przerywany obrys, etykietę dla czytnika i wpis w panelu uwag. Nie zastosowano tego wyjątku dla kilku kandydatów. Pozostałe 7 punktów nie jest rysowane; planer zasobowy nadal obejmuje wszystkie 109 zleceń.

Wawelno/Leśna 32A jest teraz dopasowane do 32a, bez zamiany na sąsiedni numer 32. UUG ma inne znaczenie wskaźnika accuracy niż Geoapify; test dokumentacyjnego Marki/Andersa 1 pokazuje poprawne dopasowanie z wynikiem około 0,444. Nie kopiowano progu 0,95 innego dostawcy. Walidacja lokalna sprawdza pola, rejestry, układ współrzędnych i jednoznaczność.

Lokalne porównanie 46 budynków wcześniej zaakceptowanych w Geoapify z punktami GUGiK wykazało maksymalną różnicę około 30 m (odległość geograficzna między odpowiedziami, nie przejazd). Żaden z tych 46 budynków nie stracił punktu w nowej warstwie. To dodatkowa zgodność dostawców, nie pomiar terenowy ani weryfikacja zasięgu sieci.

### Uruchomione polecenia i wyniki

| Polecenie / kontrola | Wynik |
| --- | --- |
| `python -X utf8 map05/data/fetch_uug.py --execute` | 109 wejść rozliczonych, 2 błędne odpowiedzi JSON |
| `python -X utf8 map05/data/fetch_uug.py --execute --retry-errors` | Ponowiono tylko te 2; nadal błędny JSON; pozostałych 107 nie wysyłano ponownie |
| `python -X utf8 map05/data/import_uug.py` | 96 pełnych dopasowań +6 uwag PNA +7 nierozstrzygniętych |
| `npm test` z `map05` | **54/54 PASS**, w tym 33 planera/lokalizacji/DOM |
| `python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v` | **24/24 PASS**, w tym 10 nowych testów UUG |
| `python -X utf8 -m unittest discover -s map04/tests -v` | **24/24 PASS** |
| `npm run build` z `map05` | PASS, oba samodzielne pliki offline |
| `node --check` sześciu modułów i obu połączonych skryptów offline | PASS |
| Kontrola składni 14 źródeł Python przez `ast.parse` | PASS |
| Porównanie danych offline, hashy inline/CSP i handler HTTP w pamięci | PASS; surowe odpowiedzi i manifest nie są serwowane |
| SHA256 XLSX, oryginalnego CSV i fixture MAP-04 | PASS — bez zmian |

**Łącznie 102/102 PASS**, bez dublowania podzbiorów i niezależnego powtórzenia testów. Nowe scenariusze obejmują literę numeru, wieloznaczność, błędny układ/metre/NaN, obce i niepełne partie, różnice kodu, zachowanie starego planu i wykluczeń, 102/6/7 w DOM oraz źródło/atrybucję. Niezależny przegląd tylko do odczytu nie wykazał istotnych problemów; dodatkowo potwierdził 10/10 Python UUG i 6/6 testów lokalizacji, aktualność artefaktu i CSP.

Nie ma konfiguracji TypeScript ani lint. DOM działa w pamięci bez sieci, nawigacji i renderera graficznego. Układ desktop/mobile, natywne pobranie JSON oraz faktyczne egzekwowanie CSP przez przeglądarkę pozostają niezweryfikowane z powodu wcześniejszej blokady narzędzia. Nie zmieniano zabezpieczeń ani nie obchodzono blokady. Pełniejszy podkład ulic i routing pozostają osobnymi pracami.

### Pliki tego etapu

- Dane i odtwarzanie: `data/fetch_uug.py`, `data/import_uug.py`, `data/probe_uug.py`, `data/uug-input.json`, `data/uug-public-example.json`, `data/uug-responses.json`, `data/uug-geocoding.json`, `data/UUG-SCOPE.md`, `data/UUG-REPORT.md`.
- Integracja: `locations.mjs`, `planner.mjs`, `planner.html`, `planner.css`, `build_planner.py`, `serve.py`, przebudowany `planner-offline.html` i ponownie wygenerowany starszy `offline.html`.
- Testy: `tests/test_uug_fetch.py`, `tests/test_uug_import.py`, `tests/locations.test.mjs`, `tests/planner-ui.test.mjs`, `tests/test_delivery.py`.
- Dokumentacja: ten raport, `README.md`, `PLANNER-SCOPE.md`. Bez zmian plików źródłowych XLSX/CSV, danych MAP-04 i dokumentacji w Notion.

---

## 16.11.2026 — odebrany CSV Geoapify i punkty adresowe

**Wynik:** 109 rekordów wejściowych rozliczonych bez braków/duplikatów i bez dopasowywania po kolejności. 46 wyników spełnia ścisłe warunki zgodności budynku, miasta, kodu, ulicy oraz confidence ≥ 0,95; 63 są do weryfikacji. Przykład Leśna 32A → Leśna 32 pozostaje kandydatem, nie markerem. Brak confidence budynku, różny kod/miejscowość lub rozszerzona nazwa patrona ulicy nie są automatycznie akceptowane. To zgodność pól dostawcy, nie niezależny dowód lokalizacji lub zasięgu.

CSV użytkownika `geocoded_by_geoapify-16.11.2026, 16_49_56.csv` pozostawiono bez zmian, SHA256 `06b5df049f5aaf2b058cbc6686d503ac64a569b1c6930f9731950aa97b288ae0`. XLSX nadal `f7037869ea5bed2d5c0b05416198feda9619b79351f2056501e3b64a79d3d08c`, fixture MAP-04 nadal `1d7cdbb8e6f75a4cd0a2204ca7e5431a487b45c2b7a185d24d91aaf30a2647cd`. Na tym etapie wszystkie operacje były lokalne, bez kolejnej wysyłki do Geoapify lub innego dostawcy.

Nowy `data/import_geocoding.py` czyta rzeczywiste nagłówki CSV, wymaga pełnej partii i identyfikuje wynik przez `original_address`. Sprawdza liczby/NaN/Infinity, kraj i orientacyjny bbox, dokładny numer (z literą), miejscowość, kod, ulicę po prefiksie ul./ulica oraz pewność ogólną, miasta, budynku i wymaganej ulicy. Nieznana/powtórzona tożsamość przerywa cały import. Zapis JSON atomowy; kandydaci, powody i atrybucja pozostają w `data/geocoding.json`, pełna tabela spraw w `data/GEOCODING-REPORT.md`.

`locations.mjs` scala wyłącznie dopuszczone pola; kandydaci nie otrzymują aktywnych współrzędnych. Warstwa jest osobna od katalogu XLSX, z tym samym datasetId. Testy potwierdzają odczyt wcześniejszych koszyków i ręcznych wykluczeń oraz bitowe zachowanie warstwy po ponownym odczycie XLSX.

Mapa pokazuje aktywne punkty według filtrów, potrafi dopasować wybrany adres lub koszyk konkretnej ekipy/dnia i synchronizuje wybór klikiem oraz Enter/spacją. Panel do weryfikacji porównuje adres źródłowy z tekstem odpowiedzi. Zewnętrzna treść jest escapowana; nie uruchamia HTML. Etykiety miejscowości odnoszą się do grup dopasowanych adresów, nie są zastępczymi punktami zleceń. Nie dodano fikcyjnych tras, nie zmieniono zasad generatora i nie wywnioskowano czasu przejazdu z samych slotów.

| Polecenie / kontrola | Wynik |
| --- | --- |
| `python -X utf8 map05/data/import_geocoding.py "geocoded_by_geoapify-16.11.2026, 16_49_56.csv"` | PASS, 109 → 46 dopasowań / 63 review |
| `npm test` w `map05` | **50/50 PASS**: poprzednie 41 + 4 lokalizacji + 5 nowych DOM |
| `python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v` | **14/14 PASS**, w tym 7 parsera Geoapify |
| `python -X utf8 -m unittest discover -s map04/tests -v` | **24/24 PASS** |
| `npm run build` | PASS; `planner-offline.html`: **1 691 964 bajtów**, 3 dokładne warstwy JSON, poprawne hashe CSP, `connect-src 'none'` |
| Kompilacja skryptu z obu plików offline przez Node `vm.Script` | PASS, bez wykonania/nawigacji/renderera |
| `ast.parse` plików Python i zgodność SHA256 źródeł | PASS |
| Ponowne uruchomienie importera XLSX w dostarczonym Python/openpyxl | PASS; `geocoding.json` bitowo identyczny, datasetId/ID zachowane |
| Read-only review niezależny | Parser i kontrakt zgodne; P2 utraty fokusu nowego przycisku koszyka naprawiony stabilnym id i testem RED→GREEN, bez otwartych istotnych uwag |
| TypeScript/lint | Nie skonfigurowano |
| Render desktop/mobile, natywne pobrania planu, faktyczne CSP i gesty w prawdziwej przeglądarce lokalnej | **NIEZWERYFIKOWANE**. Nie ponawiano zablokowanej nawigacji lokalnej ani nie zmieniano zabezpieczeń |

**Łącznie 88/88 PASS.** Testy DOM są pamięciowe, bez sieci i graficznego renderera; nie są browser E2E. Mapę należy ocenić wizualnie w dopuszczonym środowisku. Podkład ulic nie obejmuje całego obszaru danych; geokodowanie nie zastępuje routingu ani weryfikacji sieci.

Pliki dodane: `data/import_geocoding.py`, `data/geocoding.json`, `data/GEOCODING-REPORT.md`, `locations.mjs`, `tests/test_geocoding.py`, `tests/locations.test.mjs`. Zmienione: `planner-model.mjs`, `planner.mjs`, `planner.html`, `planner.css`, `build_planner.py`, `planner-offline.html`, `serve.py`, `package.json`, `tests/planner-ui.test.mjs`, `tests/test_delivery.py`, `data/import_addresses.py`, wygenerowane `data/geocoding-correspondence.json` i `data/IMPORT-REPORT.md`, `data/GEOCODING-SCOPE.md`, `data/GEOCODING-PLAN.md`, `README.md`, `PLANNER-SCOPE.md`, `VERIFICATION.md`. Starszy `offline.html` zbudowany ponownie bez zmiany zawartości. Bez nowych zależności, zmian źródłowego XLSX/CSV i MAP-04, zapisów w Notion/GitHub, wdrożenia lub ponownego geokodowania.

---

## Poprzedni etap — planer przed otrzymaniem wyników Geoapify

- XLSX odczytany w trybie read-only w dostarczonym Python/openpyxl. 110 wierszy, 109 unikalnych adresów/budynków, 80 miejscowości. Wiersze 100/107 powtarzają adres. Zachowano mapowanie obu do jednego punktu. Wszystkie wiersze 2–111 są ujęte w pochodzeniu danych; brak odrzuconych niekompletnych wierszy. 38 wpisów bez ulicy zachowano.
- SHA256 źródła przed i po: `f7037869ea5bed2d5c0b05416198feda9619b79351f2056501e3b64a79d3d08c`. Fixture MAP-04 bez zmian: `1d7cdbb8e6f75a4cd0a2204ca7e5431a487b45c2b7a185d24d91aaf30a2647cd`.
- Brak współrzędnych 109/109 i przypisania regionów w XLSX. Nie wyprowadzano z nich fikcyjnej geometrii ani operacyjnego podziału OPO/KNU. Parametry wszystkich 109 zleceń i 5 ekip jawnie syntetyczne; brak twierdzeń o rzeczywistych zamówieniach.
- Nowy model transakcyjny sprawdza całość planu przed zatwierdzeniem: brak powtórnego przydziału także między dniami, kwalifikacje, gotowość, wspólny zasób, sąsiednie sloty jednej ekipy, maks. 3 instalacje, ochronę potwierdzeń. Nieudana operacja nie zmienia poprzedniego stanu. Generator zastępuje tylko automatyczne niepotwierdzone wpisy w wybranym zakresie; zmiany ręczne i wykluczenia na dzień są zachowane.
- Potwierdzenie testowe chroni dzień/okno, a nie przydziela finalnej ekipy D−1. Ręczne zwolnienie wymaga powodu. Żaden przycisk nie kontaktuje się z klientem ani MMS.
- Import JSON sprawdza wersję, zgodność zbioru i wszystkie powyższe niezmienniki. Zatwierdzony import można cofnąć. Autozapis pozostaje w pamięci przeglądarki; JSON jest alternatywą przy niedostępnej pamięci. Brak obsługi współbieżnej edycji wielu kart.
- Mapa: lokalny podkład OPO jako referencja, wyraźne 0/109 punktów; kontrolki skali/przesunięcia/Home oraz handlery wheel/pointer. Testy DOM potwierdzają przyciski i Home, nie fizyczne przeciąganie, gesty dotykowe ani wygląd.
- Przygotowano `geocoding-input.json` (109 adresów budynków bez numerów lokali) i lokalne mapowanie ID. **Żadnego adresu nie wysłano.** Użytkownik poprosił o dobór usługi i przedstawienie zakresu; Geoapify i zakres z opisem logowania/retencji przedstawiono w `data/GEOCODING-SCOPE.md`. Klucza/konta nie tworzono.

| Wykonane sprawdzenie | Wynik |
| --- | --- |
| Importer w dostarczonym Python; źródło SHA256 | PASS, niezmienione XLSX |
| `npm test` w `map05` | **41/41 PASS**: poprzednie 21, nowe 9 modelu + 11 DOM |
| `python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v` | **7/7 PASS**: zgodność każdego adresu z XLSX, pochodzenie 110 wierszy, minimalny plik geokodowania, zasoby serwera, odmowa obcych ścieżek/zapisów, dokładne dane i CSP obu plików offline |
| `python -X utf8 -m unittest discover -s map04/tests -v` | **24/24 PASS**, źródła bez zmian |
| `npm run build` | PASS, oba artefakty samowystarczalne; nowy `planner-offline.html` 1 620 835 bajtów |
| `node --check planner-model.mjs`, `node --check planner.mjs` | PASS |
| Kompilacja składni skryptów wyodrębnionych z obu plików offline przez `vm.Script` | PASS, bez wykonania/nawigacji/renderera |
| `ast.parse` zmienionych/dodanych plików Python | PASS |
| TypeScript / lint | Nie skonfigurowano |
| Przegląd niezależny read-only | 2 P2 naprawione i potwierdzone przez reviewera: powrót ręcznie usuniętego zlecenia po regeneracji oraz utrata fokusu po wyborze. Oba testy RED→GREEN. Brak dalszych uwag w rechecku |
| Rzeczywista przeglądarka, desktop/mobile, natywne pobranie pliku, Tab/Escape, egzekwowanie CSP | **NIEZWERYFIKOWANE**. Nie ponawiano wcześniej zabronionej nawigacji i nie obchodzono polityki narzędzia |

Łącznie **72/72 PASS**. Testy DOM to wykonanie zaufanych modułów w Node z pamięciowym DOM, wyłączoną nawigacją/zasobami i odrzucającym każde żądanie `fetch`. Nie są browser E2E ani dowodem wyglądu.

Nowe pliki: `planner.html`, `planner.css`, `planner.mjs`, `planner-model.mjs`, `build_planner.py`, `planner-offline.html`, `data/import_addresses.py`, `data/addresses.json`, `data/IMPORT-REPORT.md`, `data/geocoding-input.json`, `data/geocoding-correspondence.json`, `data/GEOCODING-SCOPE.md`, `tests/planner-model.test.mjs`, `tests/planner-ui.test.mjs`, `tests/test_address_data.py`, `IMPLEMENTATION-ADDRESS-PLANNER.md`. Zmienione: `serve.py`, `index.html`, `build_offline.py`, wygenerowany `offline.html`, `package.json`, `tests/test_delivery.py`, `README.md`, `PLANNER-SCOPE.md`, `VERIFICATION.md`. Bez nowych zależności, zmian źródłowego XLSX/MAP-04, zapisu w Notion/GitHub i publikacji.

Pozostałe punkty: zgoda i dostęp do Geoapify, sprawdzenie dopasowania budynków, uzupełnienie współrzędnych i podkładu dla pełnego obszaru, routing z regułami drogowymi, rzeczywiste reguły regionalne i kwalifikacje, 11 dalszych unikalnych adresów do dokładnie 120 oraz wizualna weryfikacja dopuszczonym narzędziem. Przygotowany planer służy już do testowania procesu zasobowego; nie jest narzędziem do produkcyjnego umawiania.

---

## Historia wcześniejszych etapów

## Rezultat i zakres

Makieta w `map05/`, dwa sposoby uruchomienia: gotowy `offline.html` (dwuklik, bez sieci) i `python map05/serve.py` (bieżący fixture po localhost). Zastosowano fixture MAP-04 v1.0.0, seed 20261115, 19 syntetycznych zleceń / 5 ekip. Bez nowych zależności, zmian w źródłach MAP-04, zapisów w Notion, integracji MMS, routingu, geokodowania i wdrożenia.

Źródła kontekstu odczytane: [MAP-04](https://app.notion.com/p/419daa43f568817abf42d08e20fdb89f), [MAP-03a](https://app.notion.com/p/419daa43f56881b8b37cc341f6b24d72), [baza wiedzy](https://app.notion.com/p/40fdaa43f568815195d9d1b959bda246). Nie zmieniano ich treści.

## Wykonane sprawdzenia pierwszej wersji — historia

| Sprawdzenie / komenda | Wynik |
| --- | --- |
| `git status --short`, `git diff --stat` | Katalog nie jest repozytorium. Nie inicjalizowano Git. Końcowy diff/status nie dotyczy. |
| `rg --files` i odczyt fixture, README, rules.py, routing.py, test-results.txt MAP-04 | PASS; brak scaffoldingu frontendu, użyto osobnego katalogu |
| `node --test map05/tests/model.test.mjs` | **8/8 PASS**; najpierw RED 7/7 przy braku modelu, potem GREEN. Dodatkowy test regresji zajętości również RED→GREEN. |
| `node --check map05/model.mjs` | PASS |
| `node --check map05/app.mjs` | PASS |
| Parsowanie plików Python przez `ast.parse` | PASS |
| `python map05/build_offline.py` | PASS; powtarzalny, samodzielny artefakt z dokładną kopią danych |
| Skrypt wyodrębniony z offline.html przekazany UTF-8 do `node --check --input-type=commonjs` | PASS. Pierwsza próba kontrolna zatrzymała się na kodowaniu cp1250 w skrypcie sprawdzającym; ponowiona z bajtami UTF-8. Nie był to błąd makiety. |
| `python -m unittest discover -s map05/tests -p test_delivery.py -v` | **3/3 PASS**: prawdziwy handler HTTP w pamięci, dokładne bajty fixture, typy zasobów, HEAD bez body, 404 dla obcych ścieżek, 501 dla POST; kopia danych i hashe CSP offline zgodne |
| `python -m unittest discover -s map04/tests -v` | **24/24 PASS**, zero błędów. To testy fixture/reguł, nie tras drogowych. |
| `python map05/serve.py` | Start potwierdzony logiem; `netstat` wykazał LISTENING 127.0.0.1:8765. Procesy testowe zatrzymane po badaniu. |
| Połączenie HTTP i Browser Use do localhost | **BLOCKED**: curl odmowa/timeout; Python `urllib` WinError 10013, dostęp do gniazda zabroniony. Próba uruchomienia serwera poza izolacją również nie umożliwiła połączenia. Nie zmieniano zapory ani zabezpieczeń. |
| Przeglądarka desktopowa przez Computer Use | Dostęp do aplikacji nieudzielony: „app approval timed out”. Nie wykonywano interakcji w Chrome. |
| Realna przeglądarka desktop/mobile, interakcje, console/network, screenshot | **NIEZWERYFIKOWANE**. Nie ma zrzutu ekranu ani deklaracji browser PASS. |
| Lint / TypeScript / framework build | Brak takiej konfiguracji w projekcie; składnia JS/Python i generator offline sprawdzone powyżej. |

Node.js v26.13.0, Python 3.12.10. Pierwsza wersja: **35/35 testów automatycznych PASS** (8 + 3 + 24). Aktualna weryfikacja po dodaniu mapy: sekcja poniżej. Testy dostarczania nie są testem realnego połączenia HTTP ani wykonania DOM.

## Pokrycie wymagań i granice dowodów

- Region/dzień/typ/status/wyszukiwanie wspólnie wybierają wpisy listy, punktów i terminarza. Wybór oraz pusty wynik sprawdzono na modelu, a połączenie kontrolek poddano przeglądowi statycznemu. Obsługa DOM w przeglądarce pozostaje do sprawdzenia.
- Daty 18/19 listopada, OPO/KNU, brak dostępności 19 listopada, niezgodne kwalifikacje OPO-SYN-008, niepełna rezerwacja dwóch slotów, terminy BSA i brakujące lokalizacje są jawne.
- Potwierdzenie dnia/okna nie jest finalnym przydziałem D−1. Pula kwalifikacji nie jest dowodem pojemności. Filtry nie ukrywają faktu zajętości slotu — komórki wskazują także wpisy poza filtrami.
- Aktualny widok SVG zawiera rzeczywisty podkład OSM zapisany lokalnie, z ulicami, wodą, terenami zielonymi i koleją. Nie łączy zleceń w trasy. Punkty ekip nie są wymyślane: fixture nie zawiera ich współrzędnych, więc ekipy są w osobnym pasie zasobów bez pozycji geograficznych.
- Dystans/czas: brak obliczeń. Geometria: niezweryfikowana. Obie reguły drogowe: nieocenione — brak routingu. Bez PASS/FAIL i fikcyjnych zer.
- KNU TEST ONLY; U01/U02/U04 robocze; D10, wyjątki, pomiar po ostatniej instalacji i normy czasu pozostają otwarte. MAP-04 nadal PARTIAL.
- Notatka jest wyłącznie w pamięci karty i nie daje zgody. Brak zapisów do plików/usług z UI. CSP wersji serwerowej dopuszcza połączenia tylko z tym samym źródłem, offline ma `connect-src 'none'`.

## Niezależny przegląd

Drugi agent wykonał wyłącznie read-only kontrolę kodu i wymagań; nie edytował plików ani nie używał UI/sieci. Jedna uwaga P2: etykieta zajętości po filtrze. Naprawiono przez `getSlotState`; test regresji przeszedł RED→GREEN. Bez innych istotnych uwag statycznych. Przegląd nie zastępuje uruchomienia w przeglądarce.

## Pliki dodane

`index.html`, `styles.css`, `app.mjs`, `model.mjs`, `favicon.svg`, `serve.py`, `build_offline.py`, `offline.html`, `tests/model.test.mjs`, `tests/test_delivery.py`, `DESIGN.md`, `README.md`, `VERIFICATION.md` — wszystkie w `map05/`.

## Następny krok

Użytkownik może ręcznie otworzyć `offline.html` w swojej przeglądarce i przekazać zrzuty desktop/węższy widok do analizy wizualnej oraz wyniki siedmiu scenariuszy z README. Sam screenshot nie dowodzi poprawności interakcji. Dopiero po tej kontroli można zamknąć wizualną bramkę MAP-05. Wdrożenie, zmiana zasad produkcyjnych i benchmark routingu są poza zakresem tego etapu.

## Ponowna próba kontroli UI — na prośbę użytkownika

- Odczytano aktualny README i raport; nie powtarzano zakończonej implementacji ani testów automatycznych.
- Ponownie uruchomiono `git status --short` i `git diff --stat`: nadal brak repozytorium Git.
- Po przywróceniu dokumentacji Computer/Browser Use spróbowano otworzyć istniejący `map05/offline.html` przez `cua.createBrowserTab` w przeglądarce narzędziowej.
- Wynik: **odmowa polityki bezpieczeństwa Browser Use**, a nie błąd makiety. Narzędzie zgłosiło: „The requested URL protocol is not allowed. Allowed protocols: http:, https:”. Dodatkowo zakazało osiągania tego samego wyniku obejściem, pośrednim wykonaniem, innym interfejsem przeglądarki lub raw CDP.
- Z tego powodu nie próbowano otwierać tego pliku inną przeglądarką ani podawać go pośrednio do renderera. Nie zmieniano zabezpieczeń. Lokalnych połączeń HTTP zablokowanych w poprzednim etapie nie ponawiano jako obejścia tej odmowy.
- **0/7 scenariuszy przeglądarkowych wykonanych w tej próbie.** Nie powstał screenshot, nie zmieniono kodu, fixture ani artefaktu offline. Historyczne 35/35 PASS pozostaje wynikiem poprzedniej kontroli, nie nowym uruchomieniem testów.
- Zmieniony w tym etapie plik: tylko `map05/VERIFICATION.md`. Kontynuacja możliwa przez ręczne sprawdzenie u użytkownika i analizę przekazanych dowodów, bez obchodzenia polityki narzędzia.

### Próba odczytu po ręcznym otwarciu przez użytkownika

Użytkownik następnie otworzył dokładny plik `offline.html` w przeglądarce in-app i wyraźnie polecił sprawdzenie istniejącej karty. Wykonano standardowe `cua.getTab({url: ...}, {browser: 'iab'})`, bez próby ponownego otwarcia lub zmiany przeglądarki. Narzędzie ponownie odmówiło: „Blocked browser navigation by Browser Use URL policy: file:///…/map05/offline.html”. Ręczne otwarcie pliku nie umożliwiło odczytu przez narzędzie. Nie pobrano drzewa UI ani screenshotu; nadal 0/7 scenariuszy przeglądarkowych wykonanych. Nie próbowano obejść odmowy. Zmieniono wyłącznie ten raport; testów kodu nie powtarzano, ponieważ kod nie uległ zmianie. Do analizy wizualnej potrzebne są obrazy przekazane przez użytkownika bezpośrednio do rozmowy.

## Aktualizacja po screenshotcie — rzeczywisty podkład mapowy

**Dowód od użytkownika:** screenshot dostarczony w rozmowie pokazuje załadowaną pierwszą wersję makiety: OPO, 18.11.2026, 9 zleceń, 3 potwierdzone okna, 3 ekipy, 1 wpis do weryfikacji. W panelu przestrzeni faktycznie była siatka punktów bez ulic. Screenshot potwierdza ten stan wyjściowy; nie dowodzi działania filtrów, dialogu, klawiatury ani nowego renderu.

**Zmiana:** dodano lokalny podkład ze źródłowej geometrii OpenStreetMap, bez bibliotek zewnętrznych, kafelków i żądań podczas działania makiety. `map.mjs` rzutuje tło i znaczniki w Web Mercator bez rozciągania osi. Dla OPO zachowano 2 515 obiektów drogowych, dla KNU 82 (głównie drogi leśne w obszarze fixture). Punkty zleceń nie zostały przesunięte ani połączone w trasy. Źródła odczytu, zakresy i licencja ODbL są w `basemap/data.json` i `basemap/README.md`; atrybucja jest widoczna przy mapie. Brak wyniku routingu pozostaje bez zmian.

**Pozyskanie danych:** Overpass zwrócił przeciążenie/timeout. Bezpośredni publiczny OSM Map API odmówił szerszego wycinka z limitem 50 000 węzłów. Pobrano osiem mniejszych obszarów, potem zachowano wyłącznie geometrię i wybrane etykiety. Metadane autorów i tagi kontaktowe odrzucono. Gotowy wycinek OPO użyto ponownie z checkpointu, gdy dla KNU konieczne było uwzględnienie istniejących dróg typu `track`. Nie pobierano danych klientów, nie wywoływano routingu/geokodowania. Są to odczyty danych tła, niezależne od zablokowanej akcji przeglądarkowej.

| Aktualna komenda / sprawdzenie | Wynik |
| --- | --- |
| `node --test map05/tests/map.test.mjs map05/tests/model.test.mjs` | **11/11 PASS**. Nowe testy mapy: najpierw 3 FAIL, po implementacji i otrzymaniu prawdziwych danych 3 PASS. |
| `python -m unittest discover -s map05/tests -p test_*.py -v` | **4/4 PASS**. Konwersja dróg leśnych i odrzucanie metadanych: RED→GREEN. Serwer i offline zawierają dokładnie ten sam podkład i fixture; hashe CSP poprawne. |
| `python -m unittest discover -s map04/tests -v` | **24/24 PASS** — bez zmiany źródeł MAP-04 |
| `node --check map05/app.mjs`, `node --check map05/map.mjs` | PASS |
| `python map05/build_offline.py` | PASS; samodzielny plik około 1,6 MB z fixture i podkładem |
| Niezależny przegląd statyczny aktualnej mapy/buildera/serwera | Bez nowych istotnych błędów. Bez użycia UI lub sieci przez reviewera. |
| Nowy render desktop/mobile, klikanie, focus/dialog w prawdziwej przeglądarce | **NIEZWERYFIKOWANE**. Zabezpieczeń narzędzia nie zmieniano ani nie obchodzono. |

W tym etapie **39/39 testów automatycznych PASS**. Nowszy wynik z 16.11.2026 jest poniżej. Nie jest to browser E2E PASS.

**Pliki tego uzupełnienia:** zmieniono `app.mjs`, `index.html`, `styles.css`, `build_offline.py`, `serve.py`, `offline.html`, `tests/test_delivery.py`, `README.md`, `DESIGN.md`, `VERIFICATION.md`. Dodano `map.mjs`, `basemap/data.json`, `basemap/download_osm.py`, `basemap/README.md`, `tests/map.test.mjs`, `tests/test_basemap.py`. Usunięto wyłącznie tymczasowe pliki własnych nieudanych pobrań i checkpointów. Bez Git — nie ma diffu ani commita.

**Następna obserwacja:** odświeżyć otwartą kartę `offline.html` (Ctrl+R). W panelu ma być „Mapa i zlecenia”, lokalny podkład OSM i atrybucja. Pełne potwierdzenie nowego wyglądu i siedmiu scenariuszy wymaga dopuszczonego dostępu do przeglądarki albo dowodów przekazanych przez użytkownika.

## 16.11.2026 — testy komponentowe zdarzeń interfejsu

Odczytano aktualne `AGENTS.md` oraz źródła makiety. Katalog nadal nie jest repozytorium Git. Nowe instrukcje projektu nie usuwają nadrzędnej blokady narzędzia przeglądarkowego; nie ponawiano znanej, zablokowanej nawigacji i nie zmieniano zabezpieczeń.

**Zakres:** zamiast kolejnej próby dostępu do karty dodano standardowe testy komponentowe kodu projektu. `Window` z Happy DOM dostarcza jedynie DOM w pamięci Node; kod aplikacji uruchamia testowy Node VM. Nie ma Browser API, nawigacji, adresów plikowych, istniejącej karty, screenshotu ani renderera graficznego. Wykonywany jest wyłącznie zaufany kod projektu. Ładowanie zewnętrznych skryptów/CSS/obrazów/iframe i nawigacja są wyłączone, `fetch` jest blokowany i liczony; każde wywołanie sieci powoduje błąd testu. To nie jest obejście dostępu do otwartej karty i nie jest testem E2E przeglądarki.

**Zależność:** `happy-dom@21.0.3`, przypięty jako devDependency w `package.json` oraz `package-lock.json`, zainstalowany przez `npm install --ignore-scripts --no-audit --no-fund`. Nie zmienia makiety ani wymagań jej uruchomienia. API sprawdzono w Context7 i w kodzie/typach przypiętego pakietu.

### Potwierdzone zachowania rzeczywistego kodu aplikacji w DOM testowym

1. Start: 9 zleceń OPO, 3 potwierdzone okna, 3 ekipy, 1 ostrzeżenie; 2 515 ścieżek drogowych OPO, etykiety i atrybucja, aktywne szczegóły.
2. Zdarzenia wyboru z listy, SVG, współrzędnych i terminarza aktualizują wspólne zaznaczenie. Handler Enter/spacji na SVG działa, a kod odtwarza focus na znaczniku.
3. Filtry BSA / QUEUE zostawiają dokładnie OPO-SYN-005 i 008. Faktyczna zajętość ukrytych wpisów pozostaje jawna. Dla 008 pokazane są ostrzeżenia o dwóch slotach i kwalifikacjach.
4. OPO 19 listopada: 3 wpisy, 2 markery; 010 nie dostaje sztucznej pozycji. 011 pokazuje niezweryfikowany termin BSA, 012 ryzyko wspólnego personelu, a 9 komórek terminarza brak dostępności fixture.
5. KNU: 6 wpisów dnia 18, 82 ścieżki rzeczywistego podkładu, 2 ekipy i TEST ONLY. Dnia 19 zostaje KNU-SYN-007 bez markera, z ostrzeżeniem niejednoznacznej lokalizacji.
6. Puste wyniki czyszczą markery i szczegóły, a reset przywraca zlecenia i focus w wyszukiwaniu.
7. Notatka: dialog otwiera się, whitespace nie jest zapisywany, treść HTML jest tekstem, potwierdzenie i ostrzeżenia nie zmieniają się, a nowa sesja nie ma notatki.
8. Anulowanie zamyka dialog bez zapisu i odtwarza focus przycisku.
9. Brak danych podkładu daje jawną informację o schemacie, bez pozornej mapy i atrybucji nieobecnych danych.
10. Niesyntetyczne dane pokazują błąd i nie tworzą domyślnych zleceń.

**Wyniki i wykonane komendy:**

| Komenda | Wynik |
| --- | --- |
| `node --test tests/ui.test.mjs` w `map05` | **10/10 PASS** |
| `npm test` w `map05` | **21/21 PASS**: 8 modelu, 3 mapy, 10 komponentowych UI |
| `python -m unittest discover -s map05/tests -p test_*.py -v` | **4/4 PASS** |
| `python -m unittest discover -s map04/tests -v` | **24/24 PASS** |
| `node --check map05/tests/ui.test.mjs` | PASS |
| Ponowny `python map05/build_offline.py` i porównanie SHA256 | PASS, plik bitowo identyczny: `4bd2da449f6e23de002e8a920482e80ff7c9552101621e8e822fada4e19a4f6e` |
| Liczba obiektów w rzeczywistym zasobie wbudowanym w offline | OPO: 4 108, KNU: 112; nagłówek „Mapa i zlecenia” obecny |

**Łącznie: 49/49 aktualnych testów PASS. Brak błędów handlerów i brak żądań sieciowych w testach komponentowych. Nie wykryto błędu wymagającego zmiany kodu aplikacji.**

**Pliki zmienione w tym etapie:** dodano `tests/ui.test.mjs`, `package.json`, `package-lock.json`, `.gitignore`; uzupełniono `README.md`, `DESIGN.md` i ten raport. Ponownie wygenerowano bitowo identyczny `offline.html`. Nie zmieniono `app.mjs`, danych ani ustawień przeglądarki/platformy.

**Pozostałe granice:** testy DOM nie oceniają pikseli, szerokości i overflow, czytelności, natywnego Tab/Escape, pułapki fokusu ani faktycznego egzekwowania CSP. Dla tych elementów nadal brak realnego browser PASS. Testy potwierdzają obecność i położenie geometrii oraz zachowanie obsługiwanych przez kod zdarzeń, ale nie nowy screenshot.

## Korekta po ocenie kompletności przez użytkownika

Potwierdzono w kodzie: QUEUE jest filtrem listy konkretnego dnia, nie samodzielną kolejką do planowania. Nie ma generatora koszyków, edycji dostępności ekip i slotów, modelu ręcznych zmian koszyka ani obsługi pan/zoom. Testy dotychczasowego zakresu pozostają historycznym dowodem jego zachowania, ale nie są kryterium odbioru całego planera. Poprzedni nacisk na liczbę przechodzących testów nie wykazywał kompletności procesu.

Na podstawie uwagi użytkownika, lokalnego kodu i ponownie odczytanych stron projektu przygotowano `PLANNER-SCOPE.md`: brakujące funkcje, spójny model danych, granice routingu, wymagany import około 120 adresów w potwierdzonym zasięgu oraz testowalne kryteria odbioru. Lista adresów nie została dostarczona; nie zgadywano adresów ani pokrycia siecią. Kod i dane aplikacji bez zmian, testów nie powtarzano. Zmieniono wyłącznie zakres funkcjonalny i ten raport.
