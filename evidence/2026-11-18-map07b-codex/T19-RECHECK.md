# T19 — re-check MAP-07B na `8e2afb2`

**GO dla Draft PR bez merge na `8e2afb2`.** Reprodukcje blokujące z T15–T18 przeszły. Nie stwierdziłem nowych problemów blokujących w rozszerzonych próbach modelu i Chrome.

## Ocena modelu

Brak potwierdzonych P1/P2 i nowych P3 w sprawdzonym zakresie. Zastane zastrzeżenia P3 z T16 dotyczą miękkiego budżetu i liczenia wyłącznie jednoslotowych możliwości w benchmarku.

`map05/optimizer.mjs:58–85` odrzuca nowy brak skierowanej nogi, odcinka odniesienia i utratę konkretnej granicy pomiaru. Ranga przejazdu między instalacjami oraz roboczego limitu pomiarów jest porównywana osobno w każdej ekipie. Znane przekroczenia są porównywane według tożsamości i nasilenia. Główna ocena, wyjaśnienia i kontrola końcowa korzystają z tej samej bazy wejściowej. Wspólny zestaw problemów emitowany bezpośrednio przez `assessBasket` mógłby uprościć przyszłe rozszerzanie reguł. W sprawdzonych przypadkach obecne porównanie zachowuje wymagane rozróżnienia.

| Próba | Wynik |
| --- | --- |
| T18 — dwa ręczne pomiary tracą jedyną poprzedzającą instalację, mimo identycznego komunikatu | **3/3 PASS**. Łącznik AUTO pozostaje w koszyku. |
| T18 — utrata pierwszej lub ostatniej granicznej instalacji przy zastanej luce odniesienia | **6/6 PASS**, wraz z kontrpróbą znanego odniesienia **3/3 PASS**. |
| T17 — nowy skierowany brak przejazdu, podmiana brakującego odcinka odniesienia, brak alternatywy w zastanym koszyku | Wszystkie warianty **PASS**. Plan chroniony przed nowym brakiem, poprawne podsumowanie 1 wykonalny + 4 niewykonalne. |
| T16/T17 — dwa i trzy niezamienne łączniki przy 0 oraz 1000 ms | **12/12 PASS**. Brak nowych przekroczeń i usunięcia potrzebnych łączników. |
| T15 — pojedynczy łącznik, źródłowy limit 30 km | **3/3 PASS**. Stan źródłowy PASS, chronione wizyty na miejscu. |
| T16 — zamiana, dodatkowa wstawka, znane +10 km, skrócone okno i pojedynczy brak drogi | Wszystkie trzy warianty zachowały ocenę przy dopuszczalnych zmianach. |
| T17 — dwuslotowy łącznik i przekroczenie okna po jego usunięciu | **6/6 PASS** przy 0 i 1000 ms w czterech syntetycznych oknach. |
| Nowe T19 — dwuslotowy łącznik, zastane przekroczenie okna o 400 s | **6/6 PASS**. Ruch zwiększający przekroczenie do 900 s odrzucony w trzech wariantach. Ruch redukujący to samo przekroczenie do 100 s wykonany w trzech wariantach. |
| Nowe T19 — naprawa zastanych przekroczeń 30 km i +10 km | **6/6 PASS**. Trzy warianty naprawiają przekroczenie 30 km bez przestawiania chronionych wizyt. Każdy wariant usuwa znane przekroczenie +10 km i przenosi pomiar wyłącznie między instalacje w koszyku docelowym, gdzie ocena to PASS. |

Nowe przypadki zawierają pozycje chronione po obu stronach zmienianego zlecenia. Sprawdzają także brak mutacji wejścia i brak zmian chronionych rekordów. Dane planu są wczytywane przez `restorePlan` po zmianie syntetycznej macierzy dróg, aby odtworzyć zastane naruszenia. Dowody `T19-model.jsonl` i `T19-T15-model-replay.jsonl` do `T19-T18-model-replay.jsonl`.

```powershell
$env:MMS_AUDIT_COMMIT='8e2afb2'
node --import ./evidence/2026-11-18-map07b-codex/pinned.mjs evidence/2026-11-18-map07b-codex/T19-model.mjs
```

## Regresje automatyczne

| Polecenie | Wynik |
| --- | --- |
| `npm test` w `map05` | **167/167 PASS** |
| `python -B -X utf8 -m unittest discover -s map05/tests -p 'test_*.py' -v` | **82/82 PASS** |
| `python -B -X utf8 -m unittest discover -s map04/tests -v` | **24/24 PASS** |

Logi `T19-javascript.txt`, `T19-python-map05.txt` i `T19-python-map04.txt`.

## Chrome

Chrome 157.0.8103.79 headless z ANGLE Intel UHD 630. Końcowy przebieg na loopbackie 8783 oraz na `file://` po **21/21 PASS**. Każdy obejmuje macierz trzech dni i trzech wariantów, niezmienność planu do akceptacji, blokady wyścigów i starego wariantu, cofnięcie, odrzucenie, podgląd, import i odświeżenie, klawiaturę, cztery szerokości oraz niedostępny localStorage. Brak błędów strony i prób połączeń zewnętrznych.

Pierwszy główny przebieg na 8782 miał zablokowany start served. Chrome zgłosił cztery `ERR_CONNECTION_REFUSED`. Główny przebieg offline i próby uzupełniające na 8782 przeszły. Świeży pełny test na 8783 przeszedł w obu trybach. Pierwotna przyczyna odmowy połączeń pozostaje nieustalona. Serwery zostały zatrzymane. Dowody końcowe `T19-retry-*-results.json` i `T19-retry-*-supplement.json`; pierwotna próba jest w `T19-served-results.json`.

```powershell
$env:MMS_AUDIT_PREFIX='T19-retry-'
node evidence/2026-11-18-map07b-codex/T19-retry-browser.mjs
node evidence/2026-11-18-map07b-codex/T19-retry-browser.mjs --supplement
```

**NOT TESTED** — Firefox, uzyskanie i akceptacja syntetycznych przypadków drogowych w UI, równoległy zapis w wielu kartach oraz większy zbiór danych. Werdykt dotyczy wersji demonstracyjnej na sprawdzonym commicie.
