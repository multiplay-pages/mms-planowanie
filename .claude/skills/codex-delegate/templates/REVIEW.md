# <TaskId> — review rundy <N> (Claude)

**Werdykt:** APPROVE | CHANGES REQUESTED | STOP (eskalacja do użytkownika)

Podstawa: diff z `checks.json`/`diff.patch`, testy uruchomione przez Claude (nie deklaracje Codexa), kontrola zakresu.

## Ustalenia

### P1/P2/P3 — <tytuł>
`<plik>:<linie>` — co jest źle, jak to odtworzyć (polecenie + wynik), czego oczekujemy.

## Sprawdzenia Claude

| Sprawdzenie | Wynik | Dowód |
| --- | --- | --- |
| Zakres zmian (allowlist, chronione, nowe pliki, dowiązania, HEAD) | PASS/FAIL | `checks.json` |
| `last.json` zgodny ze schematem i z diffem | PASS/FAIL | `checks.json.reportClaimVsActual` |
| <test> | PASS/FAIL/NOT RUN (powód) | <log> |
