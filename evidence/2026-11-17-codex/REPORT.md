# T1 — niezależny baseline i przegląd planera, 17.11.2026

Autor: Codex CLI, teammate. Koordynator i jedyny właściciel ewentualnych poprawek/publikacji: Claude Code.

Badany HEAD: `8ce430af8dd3e8c20fd775c66d78a2b422785004`, gałąź `main`.
Na początku czysty Git; po badaniu tylko nowy własny katalog `evidence/2026-11-17-codex/`.
Nie zmieniono plików śledzonych. Nie uruchamiano builda, prepare_assets, przeliczania dróg, downloaderów, geokodowania, OSRM/ORS, commita ani pusha.

## Narzędzia i granice dowodów

| Zakres | Faktyczny wynik |
| --- | --- |
| Pliki | Odczyt repo przez PowerShell/rg. Zapis wyłącznie w tym katalogu evidence. |
| Terminal | `functions.exec` → `exec_command`, PowerShell w Windows; dostępny i użyty. |
| Git | `2.54.0.windows.1`; odczyt statusu, HEAD, historii i origin; bez operacji zdalnych/mutacji Git. |
| Python | `3.12.10`; oba zlecone zestawy wykonane z `-X utf8`, `PYTHONDONTWRITEBYTECODE=1`. |
| Node/npm | Node `v26.13.0`, npm `11.20.0`; istniejący happy-dom `21.0.3`; bez instalacji zależności. |
| Przeglądarka/Computer Use | Narzędzie `mcp__cua_repl.js` dostępne w kontrakcie sesji, lecz próba `cua.createBrowserTab("iab", "http://127.0.0.1:8765", {visible:false})` zwróciła dokładnie **`The browser access host is unavailable`**. Nie otrzymano zawartości strony ani zrzutu. |
| Dalsze próby UI | Brak obejść i innych interfejsów po powyższym wyniku. Nie obsługiwano Chrome lidera. |
| Dowód wizualny | **0 scenariuszy przeglądarkowych, 0 screenshotów.** Nie ustalono, czy polityka narzędzia zezwala na localhost: host nie był dostępny przed załadowaniem strony. |
| Reprodukcje UI | Happy DOM/Node VM, bez sieci, nawigacji i renderera; nie są dowodem wyglądu ani natywnego Tab/Shift+Tab. |

Odczytano AGENTS.md, CLAUDE.md, docs/PRZEKAZANIE-AION-UI.md, docs/DECYZJE-I-ZAKRES.md, docs/URUCHOMIENIE-I-TESTY.md, docs/ARCHITEKTURA.md, najnowszą sekcję map05/VERIFICATION.md, README i wskazane moduły/HTML/CSS. Użyto umiejętności repo-orientation. Instrukcje computer-use odczytano przed próbą CUA.

## Baseline — 180/180 PASS, 0 FAIL

| Komenda | Wynik | Log |
| --- | --- | --- |
| `npm test` w `map05` | 76 PASS, 0 FAIL, exit 0; około 18,59 s | [javascript-tests.txt](javascript-tests.txt) |
| `python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v` w root | 80 PASS, 0 FAIL, exit 0; 13,518 s | [python-map05.txt](python-map05.txt) |
| `python -X utf8 -m unittest discover -s map04/tests -v` w root | 24 PASS, 0 FAIL, exit 0; 0,003 s | [python-map04.txt](python-map04.txt) |

Nie liczono podzbiorów ani reprodukcji jako dodatkowych testów baseline. Brak rozbieżności z historycznym 76+80+24. Nie skonfigurowano typecheck/lint; build był wyłączony zakresem zadania.

## POTWIERDZONE — odtworzone zachowania

Wspólna komenda: `node evidence/2026-11-17-codex/review-repro.mjs` z root repo, exit 0.
Źródło: [review-repro.mjs](review-repro.mjs), wynik maszynowy: [review-repro-results.json](review-repro-results.json), log: [review-repro.txt](review-repro.txt).
Skrypt asercjami potwierdza opisane zachowania aktualnego kodu; nie jest testem, który uważa te usterki za oczekiwane zachowanie produktu.

### R1 — P2: ręczne przeniesienie usuwa powód zwolnienia potwierdzenia

- Lokalizacja: `map05/planner-model.mjs:169` (nowy `proposal` bez pól `previous`); zapis powodu w `:185`.
- Minimalne kroki modelu: ASSIGN TEST-005/TEST-02/18.11/slot0 → CONFIRM → UNCONFIRM z powodem `Klient zmienił uzgodniony dzień` → ASSIGN tego samego zlecenia na 19.11/slot0.
- Oczekiwane: wymagany i zapisany powód zwolnienia pozostaje przy zleceniu po wykonaniu właściwej korekty; eksport/odczyt zachowuje go.
- Faktyczne: po UNCONFIRM `releaseReason` ma podaną treść; po ASSIGN jest `undefined`. JSON po przeniesieniu nie zawiera tego powodu. To utrata informacji w modelu, nie tylko brak jej wyświetlenia.
- Propozycja małej poprawki: podczas przeniesienia przekazać istniejący `previous.releaseReason` do nowego przydziału i dodać regresję CONFIRM→UNCONFIRM→ASSIGN→JSON roundtrip.
- Granica zakresu: po REMOVE cały przydział także znika. Pełna historia zwolnień po usunięciu wymaga ustalenia miejsca zapisu niezależnego od przydziałów; nie sugeruję samowolnej zmiany schematu w tej poprawce. P2 dotyczy prostej utraty już istniejącego pola podczas przeniesienia.

### R2 — P2: fokus ginie po potwierdzeniu, zwolnieniu i powrocie do kolejki

- Lokalizacja: `map05/planner.mjs:113`–`:116`; wymiana szczegółów w `renderOrderDetails` usuwa aktywny przycisk, a przywrócenie próbuje wyłącznie poprzedniego ID.
- Minimalne kroki DOM: wybrać gotowe zlecenie, przydzielić; ustawić fokus na `#confirm-order` i aktywować; następnie analogicznie `#release-order` z poprawnym powodem oraz `#remove-order`.
- Oczekiwane: po zmianie zestawu kontrolek fokus przechodzi na powiązaną dostępną kontrolkę albo nagłówek szczegółów, zachowując miejsce pracy klawiaturą.
- Faktyczne: po każdej z trzech operacji `document.activeElement` to `BODY`, bez ID. Poprzednie przyciski nie istnieją po renderze; fallbacku brak.
- Propozycja: jeśli odtworzenie `focusId` jest niemożliwe, wybrać sensowny cel w szczegółach (np. pole powodu po potwierdzeniu, przycisk przeniesienia po zwolnieniu, formularz po usunięciu) lub stabilny fokusowalny nagłówek. Kontrolki nadal istniejące powinny zachowywać obecny mechanizm.
- Dowód ograniczony do rzeczywistego kodu w Happy DOM; natywny przebieg klawiatury pozostaje do sprawdzenia przez lidera w Chrome.

### R3 — P3: zmiana dnia w widoku koszyka pozostawia mapę na poprzednim dniu

- Lokalizacja: `map05/planner.mjs:295` — handler dnia wywołuje render, ale nie `fitCurrentMap()` dla `mapMode === 'basket'`.
- Minimalne kroki: w TEST-02 przydzielić TEST-005 na 18.11 oraz TEST-058 na 19.11; kliknąć „Mapa” koszyka 18.11; zmienić dzień na 19.11.
- Oczekiwane: mapa aktywnego koszyka obejmuje wizyty wybranego dnia, analogicznie do kliknięcia przycisku „Mapa”.
- Faktyczne: punkt/etykieta dnia się zmienia, lecz viewport pozostaje `281.948 82.766 3.579 2`. Marker TEST-058 ma pozycję `[454.65479834407694, 318.30855015882935]`, poza tym viewportem; nowy koszyk wygląda na pusty w aktualnym wycinku.
- Propozycja: po renderze zmiany dnia dopasować widok, jeśli aktywny jest tryb koszyka. Ręczny zoom/pan dla zwykłego zakresu może zachować dotychczasowe zachowanie.
- Reprodukcja ma prawdziwe pozycje GUGiK, dwa poprawne przydziały i wspieraną wersję zasobową bez warstwy routingu. Nie wymaga zewnętrznych żądań ani grafiki.

## PODEJRZENIA i nieweryfikowane obszary

Nie zgłaszam dalszej konkretnej usterki bez reprodukcji. Realna responsywność, rozmiary/overflow, czytelność ulic/etykiet, szybkość regionalnej mapy, natywne pobranie/import pliku, Tab/Shift+Tab/Escape, scroll/fokus w przeglądarce oraz egzekwowanie CSP są **nieweryfikowane przez tego agenta**. Statyczny odczyt CSS nie daje podstaw do deklaracji PASS dla tych obszarów; testy Chrome prowadzi lider.

## Pozostałe sprawdzone kontrakty

| Wymaganie | Ocena dowodu |
| --- | --- |
| Kolejka niezależna od dnia, filtry i wyszukiwanie | Przejrzany kod `matches`, `queueOrders`, handlery oraz istniejące testy UI/modelu PASS. Generator bierze ID całego pasującego zakresu, aby objąć ponowne generowanie istniejących automatycznych przydziałów. |
| Powody nieprzydzielenia, kwalifikacje, gotowość, dwa sąsiednie sloty | Model/DOM baseline PASS; geograficzne braki pozostają jawne. |
| Liczba otwartych okien i wyłączenie zajętego slotu | Model/DOM baseline PASS; błąd nie mutuje planu. UI odtwarza zaznaczenie i fokus checkboxa. |
| Atomowość wszystkich dotkniętych koszyków | Baseline zawiera ASSIGN/REMOVE/GENERATE regresji 20/20/40 km. Dodatkowy niezależny skrypt potwierdził ASSIGN i REMOVE: operacja odrzucona z 30 km, oryginalny JSON bitowo niezmieniony. |
| Ręczne propozycje, wykluczenia po usunięciu, potwierdzone okna | Baseline PASS dla ochrony przy regeneracji, zwykłym przeniesieniu/usunięciu i wymagania powodu. Utrata powodu po dozwolonym przeniesieniu opisana jako R1. |
| Cofnięcie, import walidowany przed zamianą, localStorage | Baseline DOM/modelu PASS; kod historii i whitelisty importu przejrzany. Nie wykonano prawdziwego odświeżenia ani plikowego importu/pobrania w przeglądarce. |
| Mapa: pan/zoom/wybór/trasa | Baseline DOM i testy geometrii PASS. Dekoder odrzuca nieciągłą geometrię; renderer rysuje tylko nogi OK; brak danych ma `null`/„Nieustalone”, nie fikcyjne 0 km. R3 dotyczy dopasowania przy zmianie dnia. |
| Wszystkie rzeczywiste znane ścieżki i dane źródłowe | Włączone w zielone baseline testy `real-routes` i Python snapshot/delivery. Nie przeliczano routingu. |
| Klawiatura i fokus | Mechanizm wyboru punktów/sterowania mapą przejrzany i istniejące testy DOM PASS; R2 reprodukuje pozostałą utratę fokusu. Brak testu natywnych klawiszy. |
| Responsywność | Reguły breakpointów/table-scroll przejrzane tylko statycznie; brak browser PASS. |

Repozytorium pozostawione bez zmian źródeł. Własne artefakty: trzy logi baseline, ten raport, skrypt reprodukcji i jego log/JSON.
