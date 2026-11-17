# T2 — F1 i R1, 17.11.2026

Zmiana gotowa do integracji przez lidera. Właściciel zmian: Codex CLI. Baza: `8ce430af8dd3e8c20fd775c66d78a2b422785004`; równoległych plików lidera nie edytowano.

Zmieniono wyłącznie:

- `map05/planner-model.mjs`: przed zmianą dostępności wykrywa zajęte usuwane okna dla konkretnej ekipy/dnia, także drugi slot i potwierdzone wizyty. Błąd podaje okno, ekipę, datę, zlecenie i wskazówkę korekty. `ASSIGN` zachowuje istniejący `releaseReason`.
- `map05/tests/planner-model.test.mjs`: cztery przypadki zajętego okna z asercją braku mutacji, kontrola wyłączania/włączania wolnych okien i niezależności ekip/dni, regresja CONFIRM→UNCONFIRM→ASSIGN→JSON→restorePlan. Uaktualniono dotychczasowe oczekiwanie generycznego błędu dostępności.

Pełny diff polecenia `git diff -- map05/planner-model.mjs map05/tests/planner-model.test.mjs`: [t2.diff](t2.diff).

## TDD i weryfikacja

1. Najpierw zmieniono/dodano testy bez edycji modelu.
2. `node --test map05/tests/planner-model.test.mjs`: **RED — 15 testów, 9 PASS, 6 FAIL, exit 1**. Pięć nowych regresji oraz zaktualizowany stary test nie przeszły z oczekiwanych przyczyn: generyczny komunikat dostępności / `releaseReason === undefined`. Nowy test kontrolny wolnych okien przeszedł już przed poprawką. [Log RED](t2-red.txt).
3. Dopiero po odczycie tych błędów dodano 7 linii modelu.
4. `node --test map05/tests/planner-model.test.mjs map05/tests/planner-routing.test.mjs map05/tests/routes.test.mjs`: **GREEN — 29 PASS, 0 FAIL, exit 0**, w tym 15 modelu + 8 planner-routing + 6 routes. Zielone są regresje 20/20/40 km dla ASSIGN, REMOVE i scoped GENERATE oraz granice 30 km, +10 km i okna. [Log GREEN](t2-green.txt).
5. `git diff --check -- map05/planner-model.mjs map05/tests/planner-model.test.mjs`: bez uwag. Ręczny przegląd ograniczonego diffu: bez nowych zależności, refaktoru i zmian kontraktu zapisu.

F1 zachowuje niezmienność wejściowego planu; wolne okna nadal można zamykać/otwierać. Dotychczasowa walidacja zasobów/importu pozostaje aktywna. Dla R1 pole już istniało w schemacie v1 i whiteliście importu, więc nie jest potrzebna migracja ani zmiana serializatora.

## Otwarte punkty / integracja

- `REMOVE` nadal usuwa cały przydział wraz z jego `releaseReason`, zgodnie z zakresem T2. Trwała historia zwolnień poza przydziałem pozostaje oddzielną decyzją modelu.
- Pełne `npm test` i build offline wykona lider po zakończeniu równoległych edycji, zgodnie z przydziałem. Nie deklaruję ich wyniku po integracji ani testu przeglądarkowego T2.
- Test UI oczekujący starego `Brak dostępności` jest własnością lidera; poinformowano go o potrzebie dopasowania do nowego błędu. Nie zmieniono testów UI.
- Nie zmieniono `schemaVersion`, `datasetId`, ID, reguł drogowych ani danych. Nie wykonano builda, połączeń sieciowych, commita ani pusha.
- Raport i reprodukcje T1 są historycznym dowodem starego zachowania; T2 naprawia opisane tam R1, więc starego skryptu potwierdzającego brak pola nie należy traktować jako zielonego testu poprawionej wersji.

Dowody T2 zapisano wyłącznie w `evidence/2026-11-17-codex/`: ten raport, `t2.diff`, `t2-red.txt`, `t2-green.txt`.
