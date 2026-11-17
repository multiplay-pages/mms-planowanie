# T3 — niezależny przegląd przed publikacją, 17.11.2026

**Werdykt: APPROVE.** Brak wykrytych usterek P1/P2 w końcowej zmianie aplikacji. Wszystkie trzy uwagi P3 lider zamknął podczas review (czułość browser R3, scalenie logów drugiego profilu, precyzja opisu RED). Akceptacja dotyczy lokalnego prototypu w zleconym zakresie, bez deklaracji gotowości produkcyjnej.

Przegląd: Codex CLI. Baza `8ce430af8dd3e8c20fd775c66d78a2b422785004` + working tree lidera. Artefakt: `map05/planner-offline.html`, **69 522 757 B**, SHA256 **`694d833853c7db48b2844e1192bb5ad59d079efd2cfa15132204607420e648fe`** — zgodny z przekazanym identyfikatorem.

W T3 nie edytowano źródeł, testów projektu, dokumentacji lidera ani jego katalogu browser. Zapisy wyłącznie do własnego evidence i kopii testowej w katalogu systemowym temp. Nie używano stash/build/commit/push ani sieci. Dodatkowo zgodnie z wiadomością lidera zanonimizowano lokalne prefiksy w swoim evidence.

## Niezależne testy

| Komenda | Wynik | Log |
| --- | --- | --- |
| `npm test` w `map05` | **86 PASS, 0 FAIL**, exit 0 | [t3-javascript-tests.txt](t3-javascript-tests.txt) |
| `python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v` w root | **80 PASS, 0 FAIL**, exit 0 | [t3-python-map05.txt](t3-python-map05.txt) |
| `python -X utf8 -m unittest discover -s map04/tests -v` w root | **24 PASS, 0 FAIL**, exit 0 | [t3-python-map04.txt](t3-python-map04.txt) |
| `git diff --check` | Bez błędów whitespace; Git informuje o istniejącej normalizacji CRLF→LF README | terminal |

**190/190 PASS**, bez doliczania podzbiorów. Python uruchomiono z `PYTHONDONTWRITEBYTECODE=1`. Typecheck/lint nie są skonfigurowane. Build wykonał lider; reviewer nie powtarzał go. Zielone testy dostarczania sprawdzają aktualny osadzony HTML/CSP/dane.

## Czy regresje rzeczywiście są czułe

`node evidence/2026-11-17-codex/t3-mutation-check.mjs` tworzy kopię minimalnego zestawu modułów, danych i testów w systemowym temp. Working tree pozostaje nienaruszone.

- Aktualne `planner-map.test.mjs` + `planner-ui.test.mjs` oraz dodatkowy kontrolny test review: **29/29 PASS**.
- Ten sam zestaw, z podmienionymi w temp WYŁĄCZNIE `planner.mjs`, `planner-map.mjs`, `planner.css` na wersje z `8ce430a`: **25 PASS, 4 FAIL**. Dokładnie nowe regresje: czytelne długie drogi, obwódki etykiet/skali, fokus w szczegółach i dzień koszyka.
- Dodatkowy kontrolny test sprawdza, że render nie przenosi fokusu z daty, rodzaju, wyszukiwania, generatora, przycisku mapy koszyka ani checkboxa dostępności do szczegółów. Jest zielony także na bazie — poprawka nie tworzy globalnego przechwytywania fokusu.
- Model F1/R1 ma osobny rzeczywisty RED→GREEN z T2: 6 FAIL w RED (5 nowych regresji i uaktualnione stare oczekiwanie), potem 29/29 model/routing PASS. Nowy test kontrolny wolnych okien przeszedł już przed poprawką.

Dowody: [t3-mutation-results.json](t3-mutation-results.json), [t3-current-controls.txt](t3-current-controls.txt), [t3-baseline-mutations.txt](t3-baseline-mutations.txt), [T2-REPORT.md](T2-REPORT.md).

## Przegląd zmian i miejsc użycia

- `visibleMapFeatures` jest wywoływane produkcyjnie w `renderBasemapViewport`. Nowy wybór działa tylko ponad limitem, filtruje rzutowane rozmiary i sortuje kopię wyników; nie zmienia przygotowanych danych, geometrii tras, rzutowania ani źródłowych ID. Poniżej limitu zachowanie pozostaje dotychczasowe. Kryterium ~1 px jest przybliżeniem dla bazowej szerokości SVG 680, zgodnie z opisem.
- CSS `non-scaling-stroke` odpowiada przyczynie plamy przy zoomie; nie zmienia rozmiaru tekstu, hit targetów markerów ani geometrii dróg. Podniesienie celów i czcionek jest lokalne. Na obejrzanych zrzutach po poprawce ulice Knurowa i skala są widoczne; przed poprawką rzeczywiście zasłaniała je duża biała plama.
- Fallback fokusu jest ograniczony do przypadku, gdy przed renderem fokus znajdował się w `#order-details`, a po renderze już go tam nie ma. Przyciski/filtry innych paneli zachowują dotychczasowy mechanizm. Nie znaleziono regresji przechwytywania fokusu.
- Dopasowanie po zmianie dnia jest ograniczone do `mapMode === 'basket'`. `fitCurrentMap` odczytuje nowy dzień, obejmuje wizyty i znaną geometrię; zwykły zoom/pan w trybie zakresu nie jest resetowany nowym warunkiem.
- F1 kontroluje właściwą ekipę/dzień i cały zakres zajętych slotów przed zmianą dostępności; walidacja planu i niezmienność wejścia pozostają zachowane. R1 kopiuje tylko istniejące, już walidowane `releaseReason`; format v1 i whitelist importu pozostają zgodne.
- Testy regresji źródłowego koszyka ASSIGN/REMOVE/GENERATE, granic 30 km/+10 km i okien nadal zielone. Nie zmieniono silnika routingu ani reguł odległości.

## Przegląd dowodów Chrome

Odczytano skrypty i oba `results-*.json`, eksportowane plany, dane narrow/perf i raport browser. **To przegląd dowodów lidera, nie własny przebieg przeglądarkowy Codexa.** Własne CUA było niedostępne w T1; nie podejmowano prób obejścia ani ponownego uruchomienia Chrome.

- Oba raporty: Chrome `157.0.8103.79`, **10 statusów PASS z 10**, wszystkie wskazane w nich pliki dowodowe istnieją.
- W odczytanych logach jest 0 wpisów external/failed/console/pageErrors. Początkowe 38 żądań served i 3 offline obejmowały główny kontekst; po poprawce scalenia logów served zawiera 51 żądań obu profili. Dokładny ostatni odczyt zapisano w `t3-evidence-audit.json`.
- Eksporty S7: wyłącznie schemaVersion, datasetId, dostępność, przydziały, wykluczenia. Przydziały mają ID `TEST-*`, jeden syntetyczny powód `Test przeglądarki S6`; nie ma katalogu adresowego, danych osobowych klientów, kluczy ani haseł. Brak przycisków koszyków bezpośrednio po reload wynika z powrotu daty do 18.11 przy planie dnia 19.11 — stan planu pozostaje zachowany; czysty profil po imporcie i wyborze 19.11 pokazuje 13 przydziałów na zrzucie.
- Własnoręcznie obejrzano zapisane PNG: przed halo / po halo w Knurów, przed / po overview, trasę koszyka, wąskie koszyki i mapę oraz czysty profil po imporcie. Obrazy wspierają opis rzeczywistych poprawek. Overview nadal ma przerwy w podkładzie; dokumentacja jawnie zachowuje to ograniczenie.
- Pomiary perf są spójne: 1,487 s load, 43–107 ms dla kroków zoomu, 30 ruchów drag w 1,14 s. To zmierzony przebieg jednej stacji, bez dowodu płynności na słabszym sprzęcie.
- 10/10 oznacza PASS zapisanych warunków scenariuszy. S8 nie jest audytem WCAG, S9 wykorzystuje również programatyczne ustawianie fokusu, a S4 nie testuje wszystkich brakujących odcinków. Te obszary wspierają testy modelu/DOM/geometrii; nie należy deklarować wyczerpującego E2E wszystkich kombinacji.

## Nieblokujące uwagi P3

### P3-1 — ZAMKNIĘTE: przeglądarkowy krok R3 nie odróżniał wersji sprzed poprawki

`evidence/2026-11-17-browser/scripts/scenarios.mjs:146`–`:149`: po mapie dnia 19.11 skrypt zmienia dzień na 18.11, wraca na 19.11 i dopiero wtedy sprawdza widoczność markerów. Stary viewport dnia 19.11 również spełniłby ten warunek po powrocie. To luka dowodu regresji, nie błąd końcowej implementacji: nowy test DOM odróżnia dwie niepuste lokalizacje i niezależnie potwierdzono jego RED na bazie.

Recheck: lider przed zmianą dnia przybliża i przesuwa mapę, wymaga 0 markerów w kadrze, a po zmianie dnia wymaga wszystkich markerów. Odczytano zaktualizowany skrypt i wyniki: bieżące served/offline 10/10 PASS. Zapis przebiegu na bazowym artefakcie `before-fix/results-base-8ce430a.json` ma FAIL dokładnie S2/S4/S5/S9. S4 pozostawia markery poza kadrem na wersji bazowej. Luka czułości została zamknięta bez zmiany kodu aplikacji.

### P3-2 — ZAMKNIĘTE: raport „pełny log” obejmował niepełną część drugiego profilu

`evidence/2026-11-17-browser/scripts/scenarios.mjs:290`–`:291` scala ze S7 drugiego kontekstu tylko external i pageErrors. Console, failed i requests drugiego profilu nie są dodawane do końcowego `log`; stwierdzenie „pełny log” w `docs/URUCHOMIENIE-I-TESTY.md:139` / browser README jest więc zbyt szerokie dla całego dwuprofilowego przebiegu.

Recheck: w `scenarios.mjs:297`–`:301` lider scala teraz również failed, console i requests, oznaczając drugi profil jako `import`. Odczytano kod oraz nowy served: nadal 10/10 PASS, 51 żądań, wszystkie liczniki błędów i zewnętrznych żądań równe 0. Kod aplikacji/CSP nie zmienił się przy tej korekcie harnessu.

### P3-3 — ZAMKNIĘTE: sformułowanie „każdy nowy test był RED” obejmowało kontrolę, która była zielona

`map05/VERIFICATION.md:44` i `docs/HISTORIA-PRAC.md:193`: nowy test kontrolny wolnych okien T2 był PASS przed i po zmianie, zgodnie z jego przeznaczeniem. W RED rzeczywiście upadły wszystkie nowe przypadki odtwarzające usterki.

Recheck: lider doprecyzował oba dokumenty: „Każdy test regresyjny odtwarzający usterkę był RED; dodatkowy test kontrolny wolnych okien był PASS przed i po”. Odczytano zmianę. Nie zmieniano dokumentów lidera w T3.

Dodatkowe ograniczenie odtwarzania: `scenarios.mjs` zapisuje statusy FAIL w JSON, lecz nie ustawia na ich podstawie kodu wyjścia procesu. Przy użyciu automatycznym należy odczytać wyniki JSON; sam exit 0 nie jest dowodem 10/10. Bieżące 10/10 sprawdzono z zawartości, a nie z kodu wyjścia.

## Dane, publikacja i anonimizacja

Przejrzany diff nie zawiera zmian `map04/`, źródłowych XLSX/CSV, danych/geokodowania/grafu, datasetId ani ID. Nie dodaje fetch ani integracji. Eksporty i zrzuty dotyczą danych testowych oraz adresów już zaakceptowanych do publikacji w tym repo.

Audyt [t3-evidence-audit.json](t3-evidence-audit.json) potwierdza zgodność hash/rozmiaru offline, kompletność referencji scenariuszy, dozwolone pola eksportów i brak dopasowań wybranych wzorców poświadczeń oraz prywatnych prefiksów w tekstowym evidence browser. To kontrola zakresowa; nie jest deklaracją formalnego, wyczerpującego security scan.

W swoim evidence zanonimizowano `t2-red.txt`, `t3-baseline-mutations.txt`, `t3-mutation-results.json`: lokalny prefiks repo/URI i temp zastąpiono `<repo>` / `<temp>`, zachowując błędy i wyniki. Weryfikacja całego własnego katalogu żądanym przez lidera wyszukaniem nazwy profilu, katalogu synchronizacji i ścieżki danych aplikacji: **0 trafień**. Skrypt reprodukcji mutation zapisuje teraz anonimizowane logi także przy kolejnym uruchomieniu.

Otwarte ograniczenia modelu (historia powodu po REMOVE, brak baz ekip, norm produkcyjnych i pełnego profilu nawigacyjnego) są jawne i nie uległy zmianie.
