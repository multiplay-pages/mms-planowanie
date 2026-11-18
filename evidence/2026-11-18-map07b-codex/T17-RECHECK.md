# T17 — końcowy re-check MAP-07B na `950f4de`

**NO-GO dla Draft PR na sprawdzonym commicie.** Poprawki T16 działają w odtworzeniach, a nowe próby nie wykazały naruszenia znanego limitu (P1). Pozostaje P2 z trzema standardowymi oknami. Optymalizator może wprowadzić inny brakujący odcinek między chronionymi wizytami w koszyku, który miał już brak tej samej kategorii.

## Ustalenia

| Waga | Miejsce | Odtworzenie i oczekiwany wynik |
| --- | --- | --- |
| **P2** | `map05/optimizer.mjs:59–67,228–235`; `map05/routes.mjs:65–86` | `new-leg-within-already-unassessed-basket` w `T17-model.mjs`. Otworzyć przez `restorePlan` uprzednio ułożony TEST-02 z potwierdzoną TEST-005, AUTO TEST-006 i ręczną TEST-009. Aktualny routing ma znany odcinek TEST-005→TEST-006 oraz `NO_PATH` dla TEST-006→TEST-009 i TEST-005→TEST-009. Obliczyć dla zakresu obejmującego wyłącznie TEST-006. We wszystkich wariantach AUTO trafia do TEST-01, a w źródle powstaje **nowe** `NO_PATH` TEST-005→TEST-009 między chronionymi wizytami. `invalid=false` i strukturalna walidacja przechodzi. Stary i nowy brak mają identyczne klucze `TEST-02/legs` i `TEST-02/installationDistance`. Oczekiwane dopuszczenie odziedziczonego braku i odrzucenie nowego. Wprowadzić klucz z kierunkowymi `from/to` dla faktycznej nogi oraz tożsamość nieocenionego łańcucha, jeżeli sam status nie wskazuje przyczyny. |
| **P2, ten sam mechanizm** | `map05/optimizer.mjs:62–67`; `map05/routes.mjs:79–86` | `new-reference-leg-within-unassessed-measurement`, syntetyczne cztery okna. Chronione TEST-005 → pomiar TEST-004 → AUTO TEST-006 → chronione TEST-009. Wszystkie przejeżdżane nogi znane. Przed ruchem brak bazowej drogi TEST-005→TEST-006 dla +10 km, po przeniesieniu AUTO brak bazowej TEST-005→TEST-009. W obu stanach `measurementExtra=UNASSESSED`, `invalid=false` i 3/3 wariantów proponują ruch. Sama naprawa kluczy przejeżdżanych nóg nie załatwi tego przypadku. Ująć też tożsamość brakującego odcinka odniesienia lub powód nieocenialności pomiaru. |
| **P3** | `map05/optimizer.mjs:286–311` | `legacy-no-alternative`: zamknąć inne ekipy w pierwszym scenariuszu. Plan poprawnie pozostaje na miejscu. Wciąż widać „Rozważono 5 koszyków: 1 wykonalnych, 5 niewykonalnych.” Bieżąca ekipa występuje w obu zbiorach, ponieważ zachowanie zastanego przydziału jest dozwolone, a ponowne wstawienie zlecenia do koszyka z nieocenioną drogą jest odrzucane. Oddzielić bieżący zachowany przydział od zbiorów ocenianych alternatyw albo zadbać o rozłączność obu zbiorów. |

Miękki budżet i jednoslotowa definicja benchmarkowej miary pustych slotów pozostają zastrzeżeniami z T16. Przy budżecie 1 ms model prawidłowo oznaczył przerwanie i raportował pełny czas, ale obowiązkowe konstruowanie oraz wyjaśnienia nadal przekraczają ten budżet. Pomiar obejmował równoległe testy, więc potwierdza semantykę budżetu. Brak podstaw do porównania szybkości commitów na podstawie tego pomiaru.

## Potwierdzone poprawki i próby dodatkowe

| Przypadek | Wynik |
| --- | --- |
| Jeden łącznik T15 oraz dwa niezamienne łączniki T16 (0 i 1000 ms) | 3/3 wariantów w każdej próbie. Łączniki i chronione wizyty zachowane, zero nowych przekroczeń. Dla dwóch łączników wybrano `CURRENT_PLAN`. |
| Trzy niezamienne łączniki w TEST-02, TEST-04 i TEST-05 (0 i 1000 ms) | 6/6. `CURRENT_PLAN`, identyczny JSON wejścia i wyjścia, brak zmian i nowych braków. |
| Dwuslotowy TEST-002 pomiędzy chronionymi instalacjami w czterech oknach (0 i 1000 ms) | 6/6. Skrót po wyjęciu TEST-002 trwałby 3700 s i wraz z pracą trwającą 120 min przekroczyłby trzygodzinne okno następnej instalacji. Wizyta zachowała oba sloty. |
| Dozwolona zamiana dwóch łączników i wariant z oczekującą wizytą | 6/6. Propozycja znalazła odpowiednio poprawną zamianę i poprawne wstawienie, bez nowych przekroczeń. |
| Przeniesienie braku między ekipami | Kontrpróba ma `invalid=true` przy niezmienionej liczbie koszyków z brakiem. 3/3 wyniki wyszukiwania wybierają drogę bez nowego braku TEST-02. |
| +10 km, okno, pojedynczy nowy brak, PASS→UNASSESSED przy znanych nogach | 12/12. Brak pogorszenia. Dla PASS→UNASSESSED bezpośredni kandydat ma `invalid=true` nawet przy liczniku braków 0→0. |
| `sameTown`, alternatywy i `swapTried` | Zmiana kolejności obiektów bez zmiany trasy nie zmienia wyniku. Zastąpienie łącznika oczekującym TEST-010 jest niewykonalne, `swapTried=null`. Od dziewiątego pominiętego zlecenia opis informuje, że wymiany nie sprawdzono. |

Bieżący plan pozostaje poprawnym kandydatem, a końcowa walidacja obejmuje wybrany wynik. Odtworzenia P2 przechodzą dlatego, że ten sam komparator zrównuje różne braki w tej samej ekipie także przy kontroli końcowej.

## Chrome i testy automatyczne

Chrome 157.0.8103.79 headless z ANGLE Intel UHD 630. Każdy tryb uruchomiono w osobnych kontekstach z blokadą połączeń zewnętrznych. Lokalny serwer 8782 zamknięto po próbach.

| Próba | Loopback | `file://` |
| --- | ---: | ---: |
| Główna macierz i regresje | 18 PASS | 18 PASS |
| Uzupełnienie | 3 PASS | 3 PASS |
| Błędy strony i konsoli oraz zewnętrzne próby połączeń | 0 / 0 | 0 / 0 |

Ponowne obliczenie zabezpiecza przed akceptacją starszej propozycji, zmiana dnia wycofuje rozpoczętą próbę, a wybór innego wariantu po obliczeniu usuwa poprzedni wynik. Stan planu pozostaje niezmieniony w tych trzech próbach. Formułę „Jeszcze N kolejnych” sprawdzono w źródle.

| Polecenie | Wynik |
| --- | --- |
| `npm test` w `map05` | **162/162 PASS** |
| `python -B -X utf8 -m unittest discover -s map05/tests -p 'test_*.py' -v` | **82/82 PASS** |
| `python -B -X utf8 -m unittest discover -s map04/tests -v` | **24/24 PASS** |

**NOT TESTED** — Firefox, przeglądarkowa akceptacja scenariuszy z syntetyczną macierzą dróg, większe zbiory i równoległe zapisy kart.

Dowody znajdują się w `T17-model.jsonl`, `T17-model-t16-replay.jsonl`, `T17-*-results.json`, `T17-*-supplement.json` i logach `T17-*.txt`. Polecenia odtworzeniowe z katalogu repo:

```powershell
$env:MMS_AUDIT_COMMIT='950f4de'
node --import ./evidence/2026-11-18-map07b-codex/pinned.mjs evidence/2026-11-18-map07b-codex/T16-model.mjs
node --import ./evidence/2026-11-18-map07b-codex/pinned.mjs evidence/2026-11-18-map07b-codex/T17-model.mjs
$env:MMS_AUDIT_PREFIX='T17-'
node evidence/2026-11-18-map07b-codex/browser.mjs
node evidence/2026-11-18-map07b-codex/browser.mjs --supplement
```
