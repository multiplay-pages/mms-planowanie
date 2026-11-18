# T13 — re-check po T12

18.11.2026. Snapshot **02fc5bba3197a843f5ad0e76773d48c19b57027a**, main **0c2a0a8**. Trzy commity w zakresie; kod i artefakty map05 bez zmian względem 0600a17. Tylko odczyt Git, bez sieci, testów, benchmarków, buildu, zmian kodu i operacji publikacyjnych. Jedyny zapis: ten raport.

**APPROVE dla re-checku P2-2 i P3-1..5 — zamknięte. Nie znaleziono nowego P1/P2 dotyczącego sekretów, nowych danych klientów lub nowej ekspozycji. A1 pozostaje OTWARTE; nie jest tu potwierdzone prawo do redystrybucji danych.**

## Sanitizacja i historia

Sprawdzono **wszystkie 92 nowe unikalne bloby osiągalne z main..HEAD**, również historyczne wersje w publikowanym zakresie. Konkretna lokalna ścieżka profilu Firefoksa i identyfikujący ją fragment nazwy konta nie występują. Trafienia nazw pola moz:profile i ogólnego wzorca katalogu Users są wyłącznie w raporcie T12 jako opis z placeholderami, bez rzeczywistego konta/profilu — to nie jest pozostały wyciek.

Wynik Firefoksa ma tylko browserName, browserVersion, platformName, headless i buildID. Producent zapisuje tę samą allowlistę zamiast całych capabilities. **P2-2 zamknięte także w historii main..HEAD**, nie tylko w aktualnym JSON. Lokalny backup sprzed sanitizacji nie jest objęty zgodą na publikację; nie wysyłać go przez push --all/--mirror.

## P3 z T12

- README opisuje zgodność **semantyczną JSON**, z różnicą 1–2 bajtów formatowania; nie przypisuje testowi obiektów dowodu identyczności bajtowej.
- Rozdziela rzeczywiste adresy/podkład/trasy od syntetycznych TEST-xxx, ekip i dostępności.
- Wprost podaje, że perf nie przełączał przeglądarki w tryb offline; CSP i osobne testy M/W to odrębne dowody.
- Dołączone logi w evidence/2026-11-18-map061/tests potwierdzają **140 JS PASS, 0 FAIL; 82 Python MAP05 OK; 24 MAP04 OK — 246/246**. To weryfikacja zapisanych logów, nie nowy przebieg Codexa.
- Klatka 407 ms ma przyczynę nieustaloną; nie wyklucza się workerów/renderowania/GPU. Zastrzeżenia do próbkowania pamięci i logicznej latencji pozostają.

**P3-1..5 zamknięte.** Tabela i surowe wyniki nie uległy zmianie względem przeliczonego T12.

## A1 — ocena dokumentu i granice wniosku

Nowa redakcja ZRODLA-DANYCH-I-LICENCJE jest ostrożniejsza: wskazuje konkretne strony/sekcje, rozdziela ogólny regulamin Geoportalu od nieustalonego zastosowania do UUG oraz atrybucję Geoapify od niepotwierdzonych warunków trwałego zapisu/publicznej redystrybucji. Nie przenosi reguł innych API na Geocoding. Nie wyciąga już wcześniejszego ogólnego wniosku „dozwolone wg FAQ”. Zadania właściciela i brak atrybucji są jawne.

Oceniam spójność i ostrożność **tekstu repozytorium**. Nie odczytywałem stron dostawców w T13, więc nie poświadczam niezależnie zgodności cytatów ani aktualności regulaminów. A1 nie zostało zamknięte samym przepisaniem dokumentacji i nie należy tak opisywać tego review.

Lider wskazał decyzję o publikacji gałęzi i PR bez merge z jawnie otwartym A1. **Nie znalazłem nowego argumentu w postaci nowych danych, nowego odbiorcy danych lub nowego ujawnienia, który zmieniałby tę decyzję w zakresie bezpieczeństwa.** Pozostają te same, wcześniej publiczne dane i uznana zgoda właściciela listy. To nie jest nowe ustalenie licencyjne ani cofnięcie historycznego braku dowodu z T9/T12; dalsze rozstrzygnięcie A1 należy do właściciela/dostawców. Nie wykonywałem publikacji ani merge.
