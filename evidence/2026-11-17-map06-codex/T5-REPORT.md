# T5 — niezależne testy projekcji operational-map

17.11.2026, Codex CLI. Gałąź `map06-interactive-map`, working tree lidera.

**Wynik końcowy: 29 PASS, 0 FAIL, exit 0.**

Komenda z katalogu głównego:

```text
node --test map05/tests/operational-map.review.test.mjs
```

Log: [t5-projection-tests.txt](t5-projection-tests.txt), końcowy czas test runnera około 0,65 s. Jest to wykonanie czystej projekcji w Node, bez przeglądarki, sieci, WebGL ani renderera. Nie uruchamiano pełnego npm test/build, nie wykonywano commita/pusha. Nie deklaruję wyniku testów integracyjnych MAP-06.

## Zapisane pliki i własność

- Nowy `map05/tests/operational-map.review.test.mjs` — jedyny plik kodu napisany w T5.
- Ten raport i log — wyłącznie `evidence/2026-11-17-map06-codex/`.

Nie edytowano `operational-map.mjs`, danych, modelu, testów lidera ani package.json. W working tree istnieją równoległe zmiany lidera; pozostawiono je nietknięte. Dołączenie nowego pliku do jawnych list `npm test` / `test:planner` należy do lidera.

## Pokrycie O01–O23 i dodatkowe kontrole

| Przypadki | Sprawdzone zachowanie |
| --- | --- |
| O01 | Rzeczywisty pusty plan: 102 punkty kolejki, 7 braków pozycji, żadnych fikcyjnych punktów ani tras. |
| O02–O04 | Wszystkie koszyki dnia, kolory ekip, jawny kontrakt indeksu palety, stabilność po dniu/ukryciu, numeracja i nogi 0/1/2 przy wejściu w kolejności 2/0/1. |
| O05 | Dwa sloty = jedna wizyta z oknem 08–14; kolejna wizyta ma numer 2, nie 3. |
| O06–O08 | Zmiana/pusty dzień, ukrycie koszyka bez powrotu do kolejki, niezależność przełączników tras i kolejki od planu i wizyt. |
| O09–O11 | POMIAR ma inny kind przy tym samym kolorze ekipy; brak pozycji środkowej wizyty daje numery 1/3 i brak skrótu A→C; literalna wieloodcinkowa geometria zachowuje wierzchołki i ujemny kierunek segmentu. |
| O12 (3 testy) | NO_PATH→NO_ROAD, SNAP_UNCERTAIN, LOCATION_UNKNOWN: brak linii, właściwe pary/typy gaps i nieustalone sumy null. |
| O13 | Cztery wizyty, brak środkowej nogi: dwie oddzielne linie, numery nóg 1 i 3, bez mostka przez lukę. |
| O14 (2 testy) | Rozłączna geometria i urwane polyline przy statusie OK: INVALID_GEOMETRY, brak linii, nadal obecne wizyty. |
| O15–O18 | Brak fikcyjnych startów/powrotów/zer, pierwszy dojazd nieoceniony, 7 braków rozliczonych także po przypisaniu jednego do ukrytej ekipy, 6 uwag PNA zachowuje używalne pozycje i źródłowe etykiety, inne dni nie są globalną kolejką. |
| O19–O21 | Move/remove/undo jako poprzedni snapshot/import JSON, aktualny stan bez drugiej bazy, AUTO/confirmed/MANUAL, zachowanie geometrii przy potwierdzaniu/zwolnieniu, deterministyczność i brak mutacji deep-frozen wejść. |
| O22–O23 | Brak routingu daje NO_ROUTING i punkty bez prostych; filtr kolejki nie zmienia wizyt, numeracji, tras, koszyków ani globalnej diagnostyki. |
| O24–O26 (dodatkowe) | Bounds uwzględnia również pośredni wierzchołek linii i wiele kolekcji; pusty zakres daje null; selectedId oznacza właściwy punkt przypisany albo z kolejki. |

O01–O23 dają 26 testów przez parametryzację trzech statusów O12 i dwóch uszkodzeń O14. Trzy dodatkowe kontrole dają łącznie 29. Użyto rzeczywistych `addresses.json` i `uug-geocoding.json`, modelu createScenario/createPlan/applyAction/restorePlan oraz kontrolowanej sieci `roadFixture`.

Koszty i geometria tras w fixture są syntetyczne i służą wyłącznie testom. Dodatkowe czwarte okno w O13 istnieje tylko w pamięci tej kontrolowanej sceny: pozwala sprawdzić cztery wizyty (trzy instalacje i jeden pomiar), bez zmiany danych/reguł projektu.

## Niezależność oczekiwań

Test nie importuje `assessBasket` ani `decodeRouteGeometry` do konstruowania expected. Kolejność zleceń i par, numery, okna, liczby 102/7/6, statusy i punkty kontrolowanej geometrii są podane niezależnie/literalnie. Helpery tworzą wejścia, nie odtwarzają algorytmu projekcji. O11 używa zapisanych polyline i literalnych czterech współrzędnych wyniku; nie porównuje dekodera z samym sobą.

## Doprecyzowania wobec wstępnej listy T4

- **O03:** wiążące API przypisuje kolor przez indeks `scenario.teams`. Nie wymagano niezmienności koloru po przestawieniu tej listy; sprawdzono stabilność względem dnia i ukrycia. Lider zaakceptował tę adaptację.
- **O08/O10:** nie wymyślano opcji ukrywania przypisanych typów ani `showVisits`, których nie ma w publicznym API. Przełączniki sprawdzono dla showRoutes/showUnassigned/hiddenTeams, a zachowanie numeracji przez brak pozycji dla O10.
- **O17:** publiczny kontrakt features nie zawiera flagi uwagi PNA. Sprawdzono obecność wszystkich sześciu punktów, dokładne pozycje i źródłowe etykiety; wizualne oznaczenie uwagi należy do adaptera/oddzielnej integracji.
- **NO_LOCATION_QUEUE:** zgłoszono początkową niejasność „includeUnassigned dotyczy tylko unassigned” vs filtrowany licznik braków. Lider wyraźnie ustalił, że licznik jest **globalny**, niezależny od filtra i ukrycia kolejki, oraz sam poprawił kod. O23 porównuje teraz wszystkie gaps z pełnym wynikiem i wymaga count=7 także przy filtrze pozostawiającym wyłącznie TEST-001. O08 wymaga zachowania gaps po showUnassigned=false. Końcowe 29/29 wykonano już z tymi silniejszymi asercjami i aktualnym modułem.

## FAIL / ryzyka

**Brak końcowych FAIL i brak zreprodukowanego błędu produkcyjnego w sprawdzonym kontrakcie.** Nie pozostawiono pominiętych testów ani asercji akceptujących jednocześnie poprawny i błędny wynik. To niezależne testy istniejącego modułu — nie twierdzę, że każde z nich wcześniej dało RED. Nie edytowano produkcji w celu wymuszenia wyniku.

Nie testowano tu: wyglądu/klawiatury MapLibre, satelity, CSP/workera/offline HTML, asynchronicznej integracji adaptera ani wydajności renderowania. Te punkty pozostają zadaniem lidera i osobnych scenariuszy z T4. Kolor według indeksu zakłada stabilną listę ekip; przy przyszłej migracji kolejności ekip trzeba świadomie ocenić zmianę kolorów.
