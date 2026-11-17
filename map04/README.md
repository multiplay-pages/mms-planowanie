# MAP-04 — benchmark routingu i symulacja wykonalności

Powtarzalny, odizolowany eksperyment dla MMS Planowanie 2.0. Nie jest częścią produkcyjnego MMS ani projektu `mms-grafik-plus`.

## Zawartość

- `fixtures.json` — fikcyjne scenariusze OPO (12 zleceń, 3 ekipy) i KNU (7 zleceń, 2 ekipy); seed `20261115`.
- `rules.py` — niezależne reguły matematyczne, harmonogramu, limitów oraz dopasowania zasobów.
- `routing.py` — wymienny kontrakt routingu i deterministyczny adapter fixture. Oznacza pochodzenie wyniku jako `synthetic_fixture`; nie udaje odpowiedzi dostawcy drogowego.
- `tests/` — testy graniczne i fixture.
- `report.md` — raport MAP-04, statusy i źródła dokumentacji.
- `test-results.txt` — wynik ostatniego uruchomienia testów.

## Uruchomienie

Wymaga wyłącznie Python 3.12 i biblioteki standardowej:

```powershell
python -m unittest discover -s map04/tests -v
```

Żaden test nie łączy się z MMS, ORS, OSRM ani usługą kafelków.
