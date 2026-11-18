# T15 — niezależny przegląd MAP-07B

**NO-GO dla Draft PR z implementacją `7b5427b` jako gotową do wypróbowania.** Najpierw zablokować nowe naruszenia w koszyku źródłowym i powiązać potwierdzenie z propozycją widoczną w dialogu. Wynik dotyczy sprawdzonej wersji. Równoległe poprawki lidera wymagają osobnego sprawdzenia.

## Ustalenia

| Waga | Miejsce | Odtworzenie, wynik i poprawka |
| --- | --- | --- |
| **P1** | `map05/optimizer.mjs:123,129–132,152,168–196,208–217`; `map05/planner-model.mjs:102–136,233–234`; `map05/planner.mjs:84–87,654–661` | `model.mjs` odtwarza trzy gotowe instalacje w TEST-02, A→B 20 km, B→C 20 km, A→C 40 km. A jest potwierdzona, C ręczna, B (TEST-006) automatyczna i jedyna w zakresie. Oczekiwane jest zachowanie B lub taka zmiana, po której koszyk źródłowy nadal spełnia limit. Standardowe przeniesienie i generator odrzucają rozbicie łańcucha. Każdy z trzech wariantów optymalizatora przenosi B do TEST-04, a TEST-02 przechodzi z PASS na LIMIT. `validatePlan` przyjmuje ten wynik, podobnie jak ścieżka walidacji przy akceptacji w UI. Wstępne usunięcie daje startowi B już pogorszony punkt odniesienia. `placementError` sprawdza docelowy koszyk, więc analogiczne ryzyko istnieje przy relokacji lub odrzuceniu wizyty w wyszukiwaniu. Porównywać problemy drogowe wszystkich dotkniętych koszyków na pełnym kandydacie z odpowiednim stanem przed operacją. Zachować poprawny plan wejściowy jako wynik awaryjny i powtórzyć kontrolę względem niego przed zwróceniem oraz zapisaniem propozycji. Dodać tę regresję dla wszystkich wariantów. |
| **P2** | `map05/planner.mjs:625–637,647–661` | Chrome na serwerze i offline. Dla 19.11 obliczyć COVERAGE_FIRST, wybrać AGE_FIRST, nacisnąć „Oblicz” i otworzyć akceptację poprzedniej propozycji przed callbackiem. Skrypt powtarzalnie wykonuje dwa kliknięcia DOM w tym samym zadaniu przeglądarki. Dialog nadal opisuje **14 wizyt i 106,4 km**, tabela za nim pokazuje **13 wizyt i 116,4 km**. „Zastosuj do planu” zapisuje 13 wizyt. Oczekiwane zastosowanie dokładnie opisanej propozycji albo zamknięcie dialogu po zmianie wyniku. Zablokować starszy wynik podczas liczenia i zweryfikować tożsamość propozycji zapamiętanej przy otwarciu dialogu. Dowód w `*-dialog-race.png` i `race` w JSON. |
| **P2** | `map05/planner.mjs:575–584,624–637` | Chrome w obu trybach. Kliknięcie „Oblicz” 18.11, następnie zmiana na 19.11 przed callbackiem, liczy propozycję dla 19.11. Plan pozostaje bez zmian. Dodatkowo po obliczeniu COVERAGE_FIRST wybranie AGE_FIRST zmienia widoczną hierarchię, lecz zachowuje poprzednią propozycję oraz przycisk jej akceptacji. Status nadal nazywa starszy wariant. Zapamiętać dzień, plan i wariant w chwili uruchomienia, unieważnić oczekującą pracę po zmianie kontekstu i uzależnić od niej stan przycisku. Zmiana wyszukiwania w kolejce sama w sobie dała ten sam wynik całego dnia. |
| **P3** | `map05/optimizer.mjs:44–56,261–286` | Identyczne przydziały i kolejność drogi, zamiana dwóch rekordów w tablicy JSON. W `model.mjs` wynik remisu `sameTown` zmienia się z 0 na 1. Przeliczać sąsiedztwo po `assessment.orders`. Dodatkowo odległość lub czas o wartości `null` składają się na sumę jako 0, a `unassessedBaskets` nie wpływa na hierarchię. Oznaczać sumę jako niepełną, a brak nowego odcinka oceniać jako problem, nie oszczędność. Sprawdzanie wykonalności alternatyw powinno stosować także kontrolę koszyka źródłowego z P1 i liczyć unikalne ekipy. |
| **P3** | `map05/optimizer.mjs:288–323`; `map05/planner.mjs:619` | Przy `budgetMs:1` w scenariuszu z repo TEST-027 jest dziewiątym pominiętym zleceniem. Notatka twierdzi, że próba wymiany nie dała miejsca, choć ten fragment oblicza ją tylko dla pierwszych ośmiu, a budżet wyciął lokalne przeszukiwanie. Ponadto przy zbieraniu błędów dla pominiętych miejsc kod odrzuca informację o udanych próbach i UI przypisuje wszystkim dalszym wpisom te same powody. Wyświetlać faktycznie przeprowadzone próby i neutralną informację o ograniczeniu wyszukiwania. |
| **P3** | `map05/optimizer.mjs:117–118,136–154,160–208,214–217` | Budżet jest miękki. Start A, start B, większość pełnych przebiegów sąsiedztwa oraz wyjaśnienia mogą pracować poza nim. Na danych repo 0 i 1 ms zwróciło wynik odpowiednio po 191 i 117 ms, z `truncated:true`. Pomiar raportowany przez model (125 i 74 ms) nie obejmuje wyjaśnień. Przy 3000 ms udało się skończyć w 1342 ms, przy dwóch przebiegach z 20 s wynik planu był identyczny. Gdy rośnie liczba elastycznych wizyt F, oczekujących W i możliwych pozycji P, jedna runda rozważa do F×P relokacji, F² zamian, W×P wstawek oraz min(W,12)×F×P² wstawek z ponowną relokacją. Każda skuteczna próba ponownie ocenia plan. Przenieść pracę z głównego wątku lub przerywać ją wewnątrz pętli, a pomiar pokazać dla całej operacji. |
| **P3** | `map05/benchmark-optimizer.mjs:51–68,78–85` | „Nieuzasadnione puste sloty” sprawdzają pojedyncze zlecenia jednoslotowe. `model.mjs` pozostawia dwa sąsiednie okna i tylko gotowy TEST-002 wymagający dwóch slotów. `placementError` dopuszcza przydział, `measure` zwraca `emptySlots=2, unjustifiedEmptySlots=0`. Kod tej miary pomija też ręczne wykluczenia dla danego dnia. Sprawdzać dowolny wykonalny ciąg slotów po kwalifikacji dla dnia albo jawnie nazwać tę miarę wskaźnikiem wolnych okien dla jednoslotowych wstawek. |

## Reguły i bezpieczeństwo danych

- Walidacja strukturalna sprawdza kwalifikacje, dostępność, brak nakładania, ciągłość dwuslotowych wizyt i limit trzech instalacji. Start A i ruchy wyszukiwania operują na puli z zakresu `orderIds`. Start B przekazuje ten sam zakres i używa wspólnego generatora. Chronione i pozazakresowe przydziały są kopiowane. Twarde warunki drogowe w koszyku docelowym przechodzą przez ocenę 30 km, +10 km i okien. Dla koszyka opuszczanego obowiązuje P1.
- Pełne testy obejmują siedem celowo nieustalonych lokalizacji, brak gotowości, ręczne wykluczenia i przydziały innych dni. Chrome zachował bez zmian potwierdzony przydział TEST-013 i ręczny TEST-025, razem z ich polami. `reorderBaskets` w MAP-07A permutuje automatyczne niepotwierdzone przydziały wewnątrz ich dotychczasowej sumy zajętych okien i kontroluje ciągłość. Odtworzenie zachowało zajęcie wszystkich pozycji dla 13 wizyt, w tym dwóch dwuslotowych. Memoizacja dodatnich wyników walidacji daty ma limit 4096 wpisów.
- W panelu pola tekstowe opisów oraz nazwy miejscowości trafiają przez `escapeText` do znaczników, a liczby i etykiety zleceń pochodzą z modelu i jego walidacji. Tekst dialogu i status używają `textContent`. Moduł optymalizatora korzysta ze statycznych importów i nie wykonuje operacji sieciowych, `eval` ani dynamicznego importu. Nie stwierdziłem nowych problemów CSP w badanym przepływie. Próby używały świeżych lokalnych kontekstów Chrome z blokadą żądań poza loopbackiem. Nie odnotowano prób połączenia zewnętrznego ani błędów konsoli lub strony. Zapis dowodowy zawiera metryki, identyfikatory syntetyczne i nazwy miejscowości na zrzucie układu. Skan tekstowych dowodów nie wykrył lokalnych ścieżek profilu ani typowych wzorców kluczy.

## Interpretacja benchmarku

- „Najstarsze w planie” to przecięcie z listą wspólną dla wariantów, uporządkowaną po dacie i ID, z licznością ustaloną przez MAP-06 z odjęciem chronionych i z kwalifikacją puli na pierwszy dzień. Miara jest porównywalna w danym eksperymencie. Nie mierzy starszeństwa wśród przypisań możliwych dla każdego z dni i nie jest tym samym, co liniowa suma dni oczekiwania.
- Odchylenie standardowe liczy udział wykorzystanych slotów dla wszystkich par ekipa–dzień z dodatnią dostępnością, z równą wagą każdej pary. To poprawna definicja dla porównania wykorzystania. Cel BALANCE_FIRST posługuje się sumą kwadratów **liczby wizyt** w ekipach, przez co wynik odchylenia slotów może zachowywać się inaczej przy dwóch slotach lub ograniczonej dostępności.
- COVERAGE_FIRST liczy instalacje i pomiary łącznie. W PROTECTED utrzymuje 39 wizyt przy zmianie z 38+1 na 37+2. Najstarsze spadają z 27/36 do 26/36, dystans z 362,5 do 326,4 km. Ponowne obliczenie na przypiętym kodzie dało tylko 30 wspólnych zleceń. MAP-06 ma dziewięć wyłącznych instalacji, COVERAGE_FIRST osiem wyłącznych instalacji i jeden wyłączny pomiar. REDUCED utrzymuje 36 wizyt przy zmianie 36+0 → 35+1, wspólne jest 30. EMPTY ma 31 wspólnych, mimo równej liczby instalacji (40). Spadek km opisuje cały zmieniony plan, więc same liczby nie rozstrzygają, ile zmiany wynika z kolejności trasy, a ile z doboru zleceń. Do porównania samej efektywności tras potrzebne są wyniki na tej samej liście zleceń lub oddzielnie na koszykach o tym samym składzie. MAP-07A daje w tabeli porównanie z zachowanym składem.

## Wyniki Chrome

Chrome **157.0.8103.79** headless, MapLibre i WebGL 2, ANGLE Intel UHD 630 / D3D11. Użyto lokalnego serwera `serve.py` na 8782 i istniejącego `planner-offline.html` z `file://`. Serwer testowy został zatrzymany.

| Próba | Serwer | Plik |
| --- | ---: | ---: |
| Macierz 18, 19, 20.11.2026 × COVERAGE_FIRST, AGE_FIRST, BALANCE_FIRST | 9/9 | 9/9 |
| Całość wraz z próbami uzupełniającymi | 18 PASS / 3 FAIL | 18 PASS / 3 FAIL |
| Ścienny czas kliknięcie → widoczny wynik dla macierzy | 762–1063 ms | 802–927 ms |
| Najdłuższe zarejestrowane zadanie głównego wątku podczas scenariuszy | 1034 ms | 851 ms |

PASS obejmuje ścisłe porównanie zapisu przed akceptacją, podgląd mapy z banerem (0 → 14 wizyt) i powrót do obecnego planu, odrzucenie, akceptację i cofnięcie, Tab/Enter/Esc w dialogu, eksport bieżącego planu podczas podglądu, import unieważniający podgląd, odświeżenie, zmianę filtra wyszukiwania, blokadę trzech kliknięć w tym samym zadaniu i obsługę zablokowanego localStorage (działanie i cofnięcie w pamięci, komunikat o braku zapisu, pusty plan po przeładowaniu). Wszystkie trzy FAIL to przypadki opóźnionego callbacku, zmiany dnia lub wariantu opisane przy P2. Na każdym z 1440/1150/700/390 px brak przepełnienia dokumentu i panelu. Tabela ma własne przewijanie przy 700 i 390 px (odpowiednio 8 i 293 px zakresu).

NOT TESTED: opcjonalny Firefox/BiDi, fizyczny dotyk i czytnik ekranu, skala powyżej dostarczonego datasetu, wiele aktywnych kart zapisujących równolegle i odrębny przebieg P1 w interfejsie z podmienionymi drogami. P1 ma odtworzenie modelowe oraz wskazaną ścieżkę walidacji w UI.

## Wyniki regresji i pliki

| Polecenie | Wynik |
| --- | --- |
| `npm test` w `map05` | 157/157 PASS |
| `python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v` | 82/82 PASS |
| `python -X utf8 -m unittest discover -s map04/tests -v` | 24/24 PASS |

Dowody: `javascript.txt`, `python-map05.txt`, `python-map04.txt`, `served-results.json`, `offline-results.json`, `*-supplement.json`, `*-dialog-race.png`, `*-390.png`, `model-results.jsonl`. Skrypty uruchamiane z katalogu repo:

```powershell
node evidence/2026-11-18-map07b-codex/browser.mjs
node evidence/2026-11-18-map07b-codex/browser.mjs --supplement
node --import ./evidence/2026-11-18-map07b-codex/pinned.mjs evidence/2026-11-18-map07b-codex/model.mjs
```

Główny przebieg Chrome i pełne regresje wykonano przed edycjami lidera. W uzupełnieniu serwer korzystał z drzewa roboczego podczas pierwszych edycji optymalizatora. Ustalenie o zmianie wariantu i pozostałe wyniki uzupełniające potwierdził też plik offline z `7b5427b`. Powtórzenie odtworzeń modelowych i porównań benchmarku czytało moduły prosto z commitu. Zapis ograniczył się do tego katalogu.
