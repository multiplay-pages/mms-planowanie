# MAP-04 — Benchmark routingu i symulacja wykonalności — raport

**Data:** 15.11.2026  
**Status:** **PARTIAL** — testy modelu reguł i fixture zakończone; rzeczywiste porównanie ORS–OSRM zablokowane przez brak autoryzowanego dostępu sieciowego/usługowego.

## 1. Zakres i źródła prawdy

Odczytano stronę główną MMS Planowanie 2.0, Discovery 1–3, MAP-01, MAP-02, MAP-03 i MAP-03a. Żadne historyczne źródło nie zostało zmienione. Wartości poniżej są roboczymi odpowiedziami projektowymi, a nie zatwierdzeniem produkcyjnym.

### Reguły użyte w eksperymencie

| ID | Reguła / odpowiedź | Status w teście |
| --- | --- | --- |
| GEO-30 | 30 km między instalacjami; D01=B wskazuje rzeczywistą drogę także przez punkt pomiarowy | Testowane na niezaokrąglonych metrach; bez live routingu nie ma pomiarów drogowych |
| GEO-10 | Maks. +10 km łącznie dla pomiarów, nie limit na każdy pomiar | Testowane względem trasy bazowej; pomiar przed pierwszą instalacją ma jawny start zespołu |
| GEO-END | D03=C pomija powrót po ostatniej instalacji; uwaga U03 pozostawia ekipie decyzję o wykonaniu pomiaru po instalacji | Nie wliczam powrotu do bazowej trasy. Pomiar po ostatniej instalacji nie jest automatycznie kwalifikowany, jeżeli brak punktu końcowego |
| TIME-180 | F11: trzygodzinne okno obejmuje przejazd i pracę; D05=C: jedna ciągła oś czasu | Testowane jako sumowanie czasu dojazdu i obsługi oraz wykrywanie nakładania aktywności |
| TEAM-SHARED | U02=A: sprawdzenie pełnego, niekolidującego dopasowania do kwalifikowanej puli; ta sama rzeczywista obsada dla instalacji i pomiarów | Testowane na małej puli ekip i kolizjach czasu |
| SLOT-2 | U04=A: dwa sąsiadujące sloty jednej kwalifikowanej ekipy, za zgodą koordynatora | Testowane; fixture zawiera takie zlecenie |
| D-1 | G04/G05 i U02: potwierdzenie chroni dzień/okno i pojemność kwalifikowanej puli; końcowa ekipa może zostać wskazana D−1 | Testowane zachowanie przypisania, które nie narusza kwalifikacji ani terminu |
| BSA-DUE | G01–G03: ryzyko terminu zweryfikowanego ostrzega i wymaga decyzji koordynatora; niezweryfikowany termin wymaga ręcznej akceptacji braku terminu | Fixture oddziela BSA z terminem potwierdzonym i niezweryfikowanym; brak testu reguł konkretnego operatora bez rzeczywistych danych umownych |
| MANUAL | U01=B: ryzyko/niewykonalność ma ostrzec koordynatora. Zakres odstępstw nadal nieustalony | Test wariantu domyślnego: audytowana decyzja może potwierdzić ryzyko czasu; twarde konflikty są blokowane, dopóki biznes nie określi wyjątków |
| GEO-QUALITY | D08=A: brak/niejednoznaczny adres albo brak trasy kieruje do weryfikacji ręcznej; bez linii prostej jako substytutu | Testowane jako `ROUTE_UNKNOWN` / `MANUAL_REVIEW` |
| PRIORITY | Discovery 1–3: MPL/BSA/pomiar, potwierdzone okna, wyjątki i limity to osobne wymiary | Oba regiony zawierają osobne przypadki MPL, BSA i pomiarów; nie wprowadzono automatycznej punktacji priorytetów |
| REGION | Standardowe okna 08–11, 11–14, 14–17 tam, gdzie potwierdzone | OPO używa ich jako konfiguracji testu; dla KNU te same godziny są wyraźnie oznaczone jako parametr testowy, nie fakt operacyjny |

U01–U04 odczytano z rzeczywistych zaznaczeń/pola uwagi w MAP-03a, a nie z pustej końcowej tabeli: U01=B, U02=A, U03=uwaga własna autora, U04=A. D10 pozostaje nierozstrzygnięte; test dopasowania jest demonstracją wariantu U02=A, nie zatwierdzeniem.

## 2. Zweryfikowana dostępność narzędzi

| Narzędzie | Stan | Dowód / zakres |
| --- | --- | --- |
| Notion | CONNECTED / VERIFIED | Odczytano wskazane strony projektu i MAP-03a; na końcu utworzono i ponownie odczytano raport MAP-04 |
| Superpowers TDD | DISCOVERED / VERIFIED | Załadowano regułę RED–GREEN; testy najpierw nie przechodziły z powodu brakującej implementacji, następnie przeszły |
| Context7 | CONNECTED / VERIFIED | Pobrano aktualne dokumenty MapLibre GL JS, ORS i OSRM |
| Firecrawl | CONNECTED / VERIFIED | Odczytano bezpośrednio aktualne strony planów/ograniczeń ORS, warunki OpenFreeMap, publiczną politykę demo OSRM i politykę kafelków OSM |
| Python 3.12 | DISCOVERED / VERIFIED | Uruchomiono testy w odizolowanym katalogu `map04`; bez zewnętrznych zależności |
| GitHub | CONNECTED / VERIFIED | Przejrzano 13 dostępnych repozytoriów. Jest `multiplay-pages/mms-grafik-plus`, lecz Notion opisuje go jako osobny projekt; nie zmieniano go. Nie znaleziono repozytorium MAP-04/MMS Planowanie w dostępnej liście |
| OSRM public demo | BLOCKED | Jedno żądanie z fikcyjnymi punktami OPO nie doszło do hosta: środowisko zwróciło błąd DNS „Nieznany host”. Nie powstał wynik routingu |
| ORS hosted API | BLOCKED | Nie przekazano klucza API/autoryzacji; nie pobierano ani nie odczytywano sekretów i nie wysłano żądania |
| Wolfram | DISCOVERED, UNUSED | Niepotrzebny do kontroli prostych progów całkowitoliczbowych, które są pokryte testami Python |
| Figma / MagicPath / Playwright | DISCOVERED, NOT NEEDED | MAP-04 nie wymaga makiety; interfejs należy do MAP-05 |

## 3. Eksperyment i syntetyczne dane

Projekt testowy jest w `map04/`. Fixture ma stały seed `20261115`, 5 fikcyjnych ekip i 19 zleceń: OPO — 3 ekipy / 12 zleceń; KNU — 2 ekipy / 7 zleceń. Zawiera MPL, BSA, pomiary, kwalifikacje, okna klienta, identyfikatory zajętości slotów, czasy obsługi, potwierdzenia, zlecenie dwuslotowe, dwa niezweryfikowane terminy BSA oraz brakujące/niejednoznaczne lokalizacje.

Nie ma pól adresu klienta ani danych z MMS. Współrzędne są syntetyczne. Czas 08–11 dla KNU to wyłącznie parametr testu. Czasy obsługi są parametrami fixture, a nie normami operacyjnymi. `routing.py` używa wymiennych wyników fixture oznaczonych `synthetic_fixture`; nie nazywa ich trasami drogowymi.

## 4. Wyniki testów reguł

Wykonano `python -m unittest discover -s map04/tests -v` — **24/24 PASS, 0 FAIL**. Testy dotyczą modelu reguł oraz integralności fixture, nie wyników dostawców tras.

| Testowane zachowanie | Wynik |
| --- | --- |
| 30 000 m akceptowane; 30 001 m przekracza limit; brak trasy nie równa się 0 | PASS |
| Limit 30 km liczony na rzeczywistym przebiegu przez pomiar | PASS |
| +10 000 m akceptowane; +10 001 m odrzucone; kilka pomiarów współdzieli jeden limit | PASS |
| Pomiar przed pierwszą instalacją porównywany od jawnego punktu startu | PASS |
| Pomiar po ostatniej instalacji bez punktu końcowego kierowany do ręcznej weryfikacji | PASS |
| Przejazd + praca mieszczą się / nie mieszczą w 180-minutowym oknie | PASS |
| Kolizja instalacji i pomiaru wspólnego pracownika wykrywana; dozwolone stykanie się aktywności | PASS |
| Powrót po ostatniej instalacji wyłączony z domyślnej sumy | PASS |
| Rezerwacja dwóch slotów wymaga sąsiedztwa i jednego zespołu | PASS |
| Kwalifikowana pula: dopasowanie przechodzi, brak zasobu/kwalifikacji nie przechodzi; jeden zespół może obsłużyć niekolidujące okna | PASS |
| Przydział D−1 przechodzi tylko przy zachowaniu kwalifikacji i terminu | PASS |
| Ręczne potwierdzenie ryzyka czasu wymaga pełnego śladu; twarde naruszenia są blokowane w bazowym wariancie | PASS |
| Fixture: 12 OPO + 7 KNU; MPL/BSA/pomiary osobno; niezweryfikowane BSA oznaczone ręczną akceptacją; KNU opisane jako test-only | PASS |
| Adapter fixture zwraca powtarzalne wyniki i jawnie oznacza ich syntetyczne pochodzenie | PASS |

## 5. Routing: ORS i OSRM

Nie ma rzeczywistych wyników liczbowych od żadnego silnika. Żądanie do hosta demo OSRM zostało zablokowane przez DNS; ORS nie wywołano bez klucza API. Dlatego porównanie jakości tras, kierunkowości, czasów i geometrii pozostaje **BLOCKED**, a nie PASS. Adapter i format fixture pozwalają odtworzyć testy po uzyskaniu uprawnionego endpointu.

| Kryterium | ORS hosted | OSRM | Ocena dla MMS |
| --- | --- | --- | --- |
| Odległość i czas | Directions zwraca geometrię trasy; Matrix zwraca metry oraz sekundy. Preferencje `fastest` i `shortest` są dostępne | Route znajduje trasę najszybszą; Table zwraca metry i sekundy na trasach najszybszych, nie kilometrowe minimum | Zestawiać tylko ten sam profil/punkty. Pokazać osobno najkrótszą i najszybszą, gdy provider je obsługuje |
| Kierunkowość | API przyjmuje uporządkowane współrzędne; test kierunkowy nieuruchomiony | Macierz tabeli jest kierunkowa; brak danych z live API | W produkcie zachować osobne A→B i B→A |
| Alternatywy | API Directions obsługuje preferencje i do 3 tras alternatywnych w aktualnych ograniczeniach hosted | Parametr `alternatives` może szukać alternatyw, ale ich zwrot nie jest gwarantowany; nie jest to tryb „shortest” | ORS lepiej odpowiada roboczemu T03; rzeczywiste porównanie nadal wymagane |
| Limity hosted | Standard: 2 000 żądań Directions/dzień i 40/min; Matrix 500/dzień i 40/min. Dla Matrix dokumentowane ograniczenie zapytania: 3 500 par źródło×cel, przy argumentach dynamicznych 25 lokalizacji | Demo: najwyżej 1 żądanie/s, rozsądne niekomercyjne użycie, bez gwarancji uptime/opóźnienia/aktualizacji danych | Żaden publiczny endpoint nie jest zaakceptowany do pracy produkcyjnej |
| Profile | Dostępne profile jazdy, m.in. driving-car; szczegóły profilu muszą odpowiadać pojazdom ekip | Profil zależy od instancji/konfiguracji; demo różni się od domyślnych profili repozytorium | Wymaga potwierdzenia pojazdów i profilu przed oceną 30 km |
| Licencja | Backend ORS repozytorium: GPL-3.0; użycie hosted podlega osobnym warunkom usługi | Repozytorium OSRM: licencja BSD (LICENSE.TXT); hostowane demo ma odrębną politykę | Sprawdzić obowiązki licencyjne przy self-host, w szczególności dystrybucję/zmiany backendu ORS |
| Koszt | Plan Standard w dniu odczytu: 0 € w podanych limitach; quota i warunki trzeba ponownie potwierdzić przed wdrożeniem | Publiczne demo nie pobiera opłat, ale jest wyłącznie do ograniczonych testów; self-host wymaga infrastruktury i obsługi | Na prototyp danych syntetycznych możliwy ORS po uzyskaniu klucza; produkcja wymaga analizy kosztu, SLA i prywatności |
| Prywatność | Hosted routing otrzymuje współrzędne w żądaniu | Publiczne demo otrzymuje współrzędne w żądaniu | Rzeczywiste adresy klientów dopiero po ocenie RODO, umowie i zgodzie na zakres danych; w MAP-04 ich nie wysyłano |

**Ograniczenie ważne dla reguły 30 km:** OSRM Table podaje odległość trasy najszybszej. Nie należy interpretować jej jako najkrótszej drogi. Robocza odpowiedź T03=C słusznie wymaga prezentacji obu miar, jeśli są dostępne, oraz osobnej oceny czasu.

## 6. Mapa i kafelki

MapLibre GL JS jest warstwą renderowania mapy: potrafi wyświetlić GeoJSON, punkty i linie, ale nie oblicza tras drogowych. W repozytorium ma licencję BSD-3-Clause. OpenFreeMap wybrano roboczo jako źródło kafelków demonstratora. Jego warunki z 14.10.2026 określają usługę jako „as-is”, bez gwarancji dostępności; nie są SLA. Warunki nie precyzują wprost wymogu atrybucji. Niezależnie trzeba zachować wymaganą atrybucję danych OSM i używać odpowiedniego dostawcy kafelków; publiczne kafelki `tile.openstreetmap.org` mają best-effort/no-SLA, limitują użycie i zabraniają masowego pobierania.

## 7. Nierozstrzygnięte decyzje i ryzyka dla MAP-05

1. **Live benchmark ORS–OSRM:** wymaga uzyskania zatwierdzonego dostępu do ORS oraz środowiska z dostępem do sieci lub kontrolowanego self-host OSRM.
2. **D10 / kwalifikowana pula:** test potwierdza możliwość policzenia dopasowania, ale treść i zakres rezerwacji po potwierdzeniu nadal wymagają wyjaśnienia/akceptacji biznesowej.
3. **U01 / wyjątki:** nie wiadomo, które niepowodzenia mogą być świadomie zaakceptowane przez koordynatora. W teście twarde limity i kolizje blokują; tylko ostrzeżenie czasu ma wariant audytowanego override.
4. **D04 i U03:** pomiar przed pierwszą instalacją testowany od punktu startu. Pomiar po ostatniej instalacji pozostaje decyzją ekipy; nie tworzy automatycznego limitu +10 km bez ustalonego punktu końcowego.
5. **Profile / czasy:** brak potwierdzonych parametrów pojazdu i norm czasu obsługi; wartości fixture służą tylko do testów.
6. **KNU:** godziny w fixture są parametrem, a nie zweryfikowaną regułą regionalną.
7. **Dane osobowe:** włączenie adresów klienta do hosted routing wymaga osobnej decyzji o dostawcy, celu i zakresie przekazania.

## 8. Gotowość do MAP-05 i rekomendacja

**Rekomendacja:** MapLibre GL JS + OpenFreeMap może być makietą prezentacyjną na danych syntetycznych. ORS jest najlepszym pierwszym hosted kandydatem do benchmarku po uzyskaniu klucza; OSRM pozostaje użytecznym silnikiem porównawczym, ale nie daje bezpośredniego przełącznika najkrótsza/najszybsza w tym samym sensie co ORS. Nie wybierać żadnego z nich do produkcji przed rzeczywistymi wynikami, przeglądem prywatności, limitów, profilu pojazdu i SLA.

MAP-05 może rozpocząć makietę niezależnie od zablokowanego testu routingu: lewy panel terminarza i puli ekip, prawa mapa, odrębne widoki MPL/BSA/pomiarów, statusy zajętości i potwierdzeń, długości odcinków, etykiety 30 km/+10 km, kwalifikacje i audytowana decyzja koordynatora. Trasy trzeba oznaczyć „brak obliczeń” w makiecie; nie rysować fikcyjnej geometrii jako drogi.

### Konkretny następny krok

Utworzyć MAP-05 jako makietę UX na danych fixture `map04/fixtures.json`, z KNU oznaczonym jako test-only i bez udawanych wyników drogowych. Równolegle właściciel systemu powinien zapewnić zatwierdzony, niedestrukcyjny dostęp testowy do ORS i OSRM albo samodzielnie wskazać kontrolowane endpointy; po uzyskaniu dostępu wykonać identyczne zapytania na tych samych punktach i dopisać faktyczne wyniki przed decyzją wdrożeniową.

## 9. Dokumentacja pierwotna i techniczna

- [MapLibre GL JS — dokumentacja](https://maplibre.org/maplibre-gl-js/docs/) i [licencja w package.json](https://github.com/maplibre/maplibre-gl-js/blob/main/package.json).
- [ORS Directions — endpoint](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/) oraz [ORS hosted restrictions](https://giscience.github.io/openrouteservice/hosted-api-restrictions), [plany i limity](https://openrouteservice.org/plans/), [licencja backendu](https://github.com/GIScience/openrouteservice/blob/main/LICENSE).
- [OSRM HTTP API](https://github.com/Project-OSRM/osrm-backend/blob/master/docs/http.md), [publiczny serwer demo i polityka 1 req/s](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server), [licencja](https://github.com/Project-OSRM/osrm-backend/blob/master/LICENSE.TXT).
- [OpenFreeMap Terms of Service](https://openfreemap.org/tos/) (ostatnia aktualizacja: 14.10.2026).
- [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/).

## 10. Artefakty i weryfikacja

- Powtarzalny projekt: `map04/`
- Fixture: `map04/fixtures.json`
- Reguły: `map04/rules.py`
- Adapter fixture: `map04/routing.py`
- Testy: `map04/tests/`
- Zapis testów: `map04/test-results.txt`

Testy nie wywołują sieci ani systemów produkcyjnych. Rzeczywisty benchmark dostawców pozostaje BLOCKED.
