# T18 — re-check MAP-07B na `3695326`

**NO-GO dla Draft PR.** Nie odtworzyłem P1. Poprawki dla brakujących odcinków przejazdu i odniesienia działają, ale model nadal pozwala utracić granicę ręcznego pomiaru w koszyku z zastanym brakiem oceny. Dotyczy to trzech standardowych okien.

## P2 — nowe braki oceny granic pomiaru

`map05/routes.mjs:79–86` ocenia położenie pomiarów pomiędzy instalacjami. W `map05/optimizer.mjs:59–74` odcinki przejazdu i drogi odniesienia mają klucze skierowanych par, a utrata granic pomiaru nadal sprowadza się do `TEST-02/measurementExtra`. Ten sam komparator działa w kontroli końcowej (`optimizer.mjs:238–240`).

- **Nowe odtworzenie** `lose-remaining-installation-same-legacy-gap-text`. Wczytać przez `restorePlan` TEST-02 z wizytą TEST-005 AUTO, ręcznym pomiarem TEST-004 i ręcznym pomiarem TEST-008. Wszystkie nogi przejazdu są znane. Przed zmianą oba pomiary mają instalację przed sobą i żadnej po sobie. Każdy wariant przenosi jedyną instalację do TEST-01. Po zmianie oba pomiary mają brak granicy także od strony startu. Tekst powodu się nie zmienia. Cały zbiór kluczy przed i po to `["TEST-02/measurementExtra"]`. Wynik jest proponowany jako `invalid:false` (3/3). Oczekiwane jest odrzucenie nowego braku granicy i dopuszczenie zachowania lub naprawienia zastanego braku.
- **Utrata pierwszej lub ostatniej instalacji wokół pomiaru** `lose-start-boundary-with-legacy-reference-gap` i `lose-end-boundary-with-legacy-reference-gap`. Z planu A→pomiar→B z brakującą drogą odniesienia A→B każda próba przenosi elastyczną graniczną instalację. Stary brak odcinka odniesienia znika, lecz pomiar wypada poza łańcuch instalacji. Brak granicy nie dostaje własnej tożsamości. Wynik `invalid:false` (6/6). Kontrpróba ze znaną drogą odniesienia chroni oceniony pomiar (3/3).

**Rozwiązanie ogólne.** Niech `assessBasket` zwraca jeden pełny zbiór problemów oceny z ustrukturyzowaną przyczyną, wskazaniem dotkniętych zleceń i nasileniem, jeśli jest mierzalne. Porównanie powinno obejmować koszyki źródłowe i docelowe na pełnym kandydacie oraz na planie sprzed zmiany. Dopuścić tylko zachowanie lub zmniejszenie problemów o tej samej tożsamości. Porównanie używane w wyszukiwaniu, wyjaśnieniach i końcowej kontroli powinno czytać ten sam zbiór z modelu zamiast odtwarzać część znaczenia z zagregowanych statusów. Dla pomiaru model rozróżnia brak przejeżdżanej nogi, brak skierowanej drogi odniesienia i brak instalacji przed lub po każdym konkretnym pomiarze. Dla okna odróżnia nieznaną rzeczywistą nogę dojazdu od pierwszego okna bez poprzednika. Dodać regresję, która dopuszcza zachowanie lub naprawę zastanego braku i odrzuca pogorszenie nawet przy identycznym podsumowaniu. W razie braku pewnych danych do rozróżnienia przyczyn bezpiecznym stanem rezerwowym jest pozostawienie zmienianego koszyka w planie wejściowym.

**P3.** Brak nowych ustaleń w zakresie T18. Sprawdzone liczniki — 1 wykonalny i 4 niewykonalne z 5. Miękki budżet i jednoslotowy zakres benchmarkowej miary pustych okien pozostają opisane w T16.

## Powtórzone przypadki

| Przypadek | Wynik |
| --- | --- |
| Jeden łącznik i dwa niezamienne łączniki (0 i 1000 ms) | Wszystkie warianty zachowały niezbędne łączniki bez nowych przekroczeń. |
| Trzy niezamienne łączniki (0 i 1000 ms) | 6/6 PASS. Powrót do `CURRENT_PLAN`, identyczne przydziały. |
| Dopuszczalna zamiana i dodatkowa wstawka | 6/6 PASS. Poprawne plany bez nowych przekroczeń. |
| Wizyta dwuslotowa i zbyt długi dojazd po jej wyjęciu | 6/6 PASS przy 0 i 1000 ms. Wizyta zachowała oba sloty oraz kontrolę okna w syntetycznym czterookiennym układzie. |
| Pojedynczy brak nogi, znany limit okna, znane +10 km | 9/9 PASS. |
| `new-leg-within-already-unassessed-basket` | 3/3 PASS. Nowy skierowany brak nie jest akceptowany. |
| `new-reference-leg-within-unassessed-measurement` | 3/3 PASS. Nowa brakująca droga odniesienia nie jest akceptowana. |
| `legacy-no-alternative` | 3/3 PASS. Plan zachowany, 1 + 4 = 5. |
| `sameTown`, weryfikacja niedozwolonej zamiany w wyjaśnieniu | PASS. Powtórzone odtworzenia T16 bez rozbieżności. |

Do odtworzenia na modułach wczytanych wprost z Git:

```powershell
$env:MMS_AUDIT_COMMIT='3695326'
node --import ./evidence/2026-11-18-map07b-codex/pinned.mjs evidence/2026-11-18-map07b-codex/T18-model.mjs
node --import ./evidence/2026-11-18-map07b-codex/pinned.mjs evidence/2026-11-18-map07b-codex/T16-model.mjs
node --import ./evidence/2026-11-18-map07b-codex/pinned.mjs evidence/2026-11-18-map07b-codex/T17-model.mjs
```

Dowody modelowe znajdują się w `T18-model.jsonl` oraz `T18-model-t16-replay.jsonl` i `T18-model-t17-replay.jsonl`.

## Pełne regresje i Chrome

| Polecenie | Wynik |
| --- | --- |
| `npm test` w `map05` | **164/164 PASS** |
| `python -B -X utf8 -m unittest discover -s map05/tests -p 'test_*.py' -v` | **82/82 PASS** |
| `python -B -X utf8 -m unittest discover -s map04/tests -v` | **24/24 PASS** |

Chrome 157.0.8103.79 headless z GPU. Główna macierz i regresje 18/18 w każdym trybie. Próby obejmują trzy dni i trzy warianty oraz kontrolę podglądu, akceptacji, cofnięcia i wyścigów. Uzupełnienie na drzewie roboczym dało 3/3 w obu trybach, lecz lider w tym czasie wykonywał kolejne poprawki. Logi `T18-*.txt`, `T18-served-results.json`, `T18-offline-results.json` i pliki `*-supplement.json`.

Powtórzenie trzech przypadków na modułach z `3695326` i bajtowo identycznym pliku offline również dało **3/3 w każdym trybie**. Poprzednia propozycja znika po zmianie wariantu, próba akceptacji starego wyniku podczas ponownego obliczania pozostawia plan bez zmian, a zmiana dnia anuluje oczekujące obliczenie. Brak błędów i prób połączeń zewnętrznych. Dowód `T18-3695326-chrome-pinned.json`, odtworzenie `node evidence/2026-11-18-map07b-codex/T18-browser-pinned.mjs 3695326`. Serwer 8782 zatrzymany i tymczasowy plik usunięty.

**NOT TESTED** — Firefox, akceptacja w UI z niestandardową macierzą dróg i większy zbiór. Przypadki granic pomiaru sprawdzono przez symulację po wczytaniu zachowanego planu, a wariant dwuslotowy z syntetycznym czwartym oknem.
