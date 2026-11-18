# T16 — re-check MAP-07B na `6a9bd57`

**NO-GO dla Draft PR w tym stanie.** Pojedynczy scenariusz T15 oraz dwa wyścigi są zamknięte. Dwa jednocześnie uwolnione łączniki nadal mogą doprowadzić do propozycji z nowymi przekroczeniami 30 km. Reprodukcja korzysta z trzech standardowych okien w każdej ekipie.

## Ustalenia

| Waga | Miejsce | Dowód i oczekiwany wynik |
| --- | --- | --- |
| **P1** | `map05/optimizer.mjs:69–70,127–133,149,215–221`; `map05/planner.mjs:84–87,659–666` | W `two-irreplaceable-bridges` TEST-02 i TEST-04 mają po trzy instalacje. W obu środkowa jest AUTO, skrajne są potwierdzone lub ręczne. Każdy pierwotny łańcuch ma dwa odcinki po 20 km, a jego skrót bez łącznika ma 40 km. Krzyżowe zastąpienie łączników również przekracza limit. Pula obejmuje tylko TEST-006 i TEST-013. Wejście ma 0 przekroczeń. Wszystkie warianty przy budżecie 1000 ms oraz 0 ms zwracają obie wizyty do kolejki i tworzą 2 przekroczenia. Odtworzenie pokazuje `invalid:true` przy ponownej ocenie zwróconego planu z prawidłową bazą, `startedFrom:CONSTRUCTION` i `validatePlan:true`. Gdy oba starty są niepoprawne, `better` nie wybiera drugiego i `reduce` zwraca pierwszy. Jednoczesne regenerowanie dwóch koszyków uniemożliwia przyjęcie naprawy, która w jednym kroku uzupełnia tylko jeden łącznik. Oczekiwany jest co najmniej niezmieniony poprawny plan. Dodać wejście jako gwarantowany dopuszczalny kandydat przy braku poprawnego startu, a kontrolę względem wejścia zastosować również jako warunek zwrócenia i akceptacji propozycji. |
| **P2** | `map05/optimizer.mjs:50–52,61–65,133,278,323`; `map05/routes.mjs:77–102` | `unassessed-transfer-search` na standardowych trzech oknach startuje z brakującą drogą w TEST-04 i ocenionym TEST-02. Wszystkie warianty przenoszą dwa elastyczne zlecenia, usuwają brak z TEST-04 i tworzą nowy brak między chronionymi wizytami TEST-02. Licznik braków pozostaje 1 i kandydat ma `invalid:false`. W `unassessed-measurement-search` (cztery okna syntetyczne) wszystkie warianty przenoszą TEST-006 i zmieniają ocenę pozostawionego pomiaru z PASS na UNASSESSED. Nogi A→pomiar→C są znane, lecz bazowy odcinek A→C jest niedostępny. Licznik pozostaje 0, `invalid:false`. Oczekiwane zachowanie braku **nowego** problemu dla konkretnego koszyka i odcinka. Rozróżnić nowe braki od zastanych i porównać kompletność oceny +10 km. Ta sama luka dotyczy obliczeń wykonalności w wyjaśnieniach. |
| **P2** | `map05/planner.mjs:574–584,624,652–661` | W Chrome served i offline po wyliczeniu COVERAGE_FIRST wybrać AGE_FIRST bez „Oblicz”. Hierarchia pokazuje nowy wariant, tabela pozostaje wynikiem starego, a przycisk akceptacji jest widoczny. Status nadal uczciwie nazywa poprzedni wariant i dialog używa danych starego wyniku, więc pierwotna podmiana propozycji podczas potwierdzania jest zamknięta. Pozostaje niespójny kontekst. Unieważnić poprzedni wynik po zmianie wariantu albo wyraźnie odróżnić ustawienie kolejnej próby od aktywnej propozycji i nazwać aktywny wariant w dialogu. |
| **P3** | `map05/optimizer.mjs:284–295,298–311,333` | `feasibleBaskets` nadal może doliczyć ekipę drugi raz, jeżeli jej najlepsze okno różni się od aktualnego. Wyjaśnienie pominięcia nadal zbiera tylko odrzucone pozycje, a przy pustej liście błędów przypisuje brak poprawy hierarchii mimo pierwszeństwa liczby lub starszeństwa w każdym wariancie. To ustalenia z inspekcji kodu. Przypadek z zamianą, która faktycznie łamie warunek, daje poprawne `swapTried:null` w odtworzeniu. |
| **P3** | `map05/optimizer.mjs:136–158,168–206,225`; `map05/benchmark-optimizer.mjs:51–68` | Pomiar czasu obejmuje wyjaśnienia, ale budżet nadal jest miękki. Próba z 1 ms zwróciła `truncated:true`, raportowane 173 ms i ścienne 173 ms. Skrypt T15 uruchomiony ponownie na tym commicie wykazuje nadal 2 wolne sloty i 0 „nieuzasadnionych”, chociaż TEST-002 można umieścić w obu oknach. Zastrzeżenie dotyczące jednoslotowej definicji pozostaje aktualne. |

## Potwierdzone poprawki

- Oryginalny skrypt `model.mjs` uruchomiony z modułami `6a9bd57` zachował TEST-006 między chronionymi wizytami i ocenę PASS dla trzech wariantów. Kontrolowane odtworzenia z limitem +10 km, wydłużeniem dojazdu poza okno i pojedynczym brakującym odcinkiem również zachowały poprawność we wszystkich wariantach. Dwie wymienialne wizyty mogły poprawnie zamienić koszyki. Przy dodatkowym oczekującym zleceniu poprawna propozycja wymieniła łącznik i umieściła pozostałe zlecenie poza koszykiem.
- W `bridge` alternatywy wymagające wyjęcia jedynego łącznika są blokowane. W `explain-swap-checked` z jednym dostępnym koszykiem TEST-010 pozostaje w kolejce, a zamiana za łącznik daje `swapTried:null`. Obie ścieżki używają bazowej kontroli odnotowanych przekroczeń. Braki danych opisane przy P2 nie są odnotowywane z taką samą szczegółowością.
- `sameTown` jest identyczne po zmianie kolejności rekordów przy niezmienionej kolejności trasy. Starsze pominięte zlecenia od dziewiątego mają w sprawdzonym przebiegu `swapTried:null` i informację, że ich wymiany nie sprawdzono. Wiersz „Jeszcze N” określa w kodzie zakres pokazanych szczegółów i przestał przypisywać pozostałym identyczną przyczynę. Przy równym dniu oczekiwania dalsze zlecenie może mieć tyle samo dni, więc dokładniejsze byłoby „kolejnych” zamiast „młodszych”.
- Wobec wcześniejszego MAP-06.2 jedyne zmiany `planner-model.mjs` to eksport istniejącej kontroli `candidateError` i bufor maksymalnie 4096 poprawnych dat, z tą samą walidacją dla dat niebuforowanych. Testy regresji MAP-06 w pełnym `npm test` przeszły, w tym kontrola źródłowego koszyka przy ręcznym przeniesieniu i generowaniu w zadanym zakresie.

## Chrome i pełne testy

Chrome 157.0.8103.79, headless, ANGLE Intel UHD 630. Osobne konteksty dla loopback i pliku offline, z blokadą żądań zewnętrznych. Serwer na porcie 8782 zatrzymany po próbach.

| Próba | Serwer | Plik offline |
| --- | ---: | ---: |
| Główny przebieg Chrome, w tym macierz 3 dni × 3 warianty | 18/18 | 18/18 |
| Uzupełnienie Chrome | 2 PASS / 1 FAIL | 2 PASS / 1 FAIL |
| Błędy konsoli lub strony / próby połączeń zewnętrznych | 0 / 0 | 0 / 0 |

Powtórzenie starszego dialogu podczas nowego liczenia nie otworzyło dialogu i nie zapisało planu, mimo że wynik później zmienił się z 14 do 13 wizyt. Zmiana dnia przed callbackiem odrzuciła rozpoczętą próbę. Jedyny FAIL w obu trybach dotyczy samej zmiany selektora wariantu po obliczeniu. Pozostałe scenariusze obejmowały akceptację i cofnięcie, import, eksport, odrzucenie, podgląd, chronione przydziały, klawiaturę, cztery szerokości i niedostępny localStorage.

| Polecenie | Wynik |
| --- | --- |
| `npm test` w `map05` | 159/159 PASS |
| `python -B -X utf8 -m unittest discover -s map05/tests -p 'test_*.py' -v` | 82/82 PASS |
| `python -B -X utf8 -m unittest discover -s map04/tests -v` | 24/24 PASS |

**NOT TESTED** — Firefox, model P1 w przeglądarce z podmienioną macierzą dróg, osobne liczniki odwiedzin każdej gałęzi wyszukiwania i stres na większym zbiorze. Wymiana i wstawienie są sprawdzone przez stan końcowy propozycji, niezależnie od drogi wybranej przez heurystykę. Tekst „Jeszcze N” sprawdzono w źródle.

Dowody znajdują się w `T16-model.jsonl`, `T16-model-t15-replay.jsonl`, `T16-*-results.json`, `T16-*-supplement.json` i logach trzech pakietów testów. Skrypty uruchomione z katalogu repo:

```powershell
$env:MMS_AUDIT_COMMIT='6a9bd57'
node --import ./evidence/2026-11-18-map07b-codex/pinned.mjs evidence/2026-11-18-map07b-codex/T16-model.mjs
node --import ./evidence/2026-11-18-map07b-codex/pinned.mjs evidence/2026-11-18-map07b-codex/model.mjs
$env:MMS_AUDIT_PREFIX='T16-'
node evidence/2026-11-18-map07b-codex/browser.mjs
node evidence/2026-11-18-map07b-codex/browser.mjs --supplement
```
