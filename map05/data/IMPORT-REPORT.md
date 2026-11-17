# Import listy adresowej

Źródło: `dane_adresowe-v2.xlsx`, arkusz `Dane adresowe`, `A1:G111`.
SHA256: `f7037869ea5bed2d5c0b05416198feda9619b79351f2056501e3b64a79d3d08c`. Plik źródłowy pozostawiono bez zmian.

- Wiersze danych: 110.
- Unikalne adresy / budynki: 109 / 109.
- Miejscowości: 80.
- Powtórzone wiersze: [{"row": 107, "sameAsRow": 100, "addressId": "ADR-bbed70da216b"}].
- Niekompletne (bez miejscowości lub numeru budynku): [].
- Bez ulicy: 38 — zachowane; numeracja miejscowości może nie wymagać ulicy.
- Bez współrzędnych: 109.

Wszystkie unikalne adresy włączono, bez dopisywania fikcyjnych punktów do 120.
Nie przypisano regionów OPO/KNU na podstawie zgadywania. Pokrycie siecią opisano jako pochodzące z listy testowej użytkownika; brak niezależnej weryfikacji.
To raport samego odczytu XLSX. Aktualny stan zaakceptowanego geokodowania i osobnej warstwy współrzędnych: `GEOCODING-SCOPE.md` oraz `GEOCODING-REPORT.md`. Ponowne uruchomienie tego importera nie zmienia `geocoding.json`. Parametry zleceń i ekip są syntetyczne i oddzielone od katalogu adresów.
