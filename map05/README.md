# MAP-05 — lokalna makieta UX

## Aktualny stan — regionalna mapa i lokalne drogi, 17.11.2026

Aktualny plik to **`planner-offline.html`**. Zawiera 109 zleceń testowych na adresach użytkownika, 102 pozycje, pełniejszy regionalny podkład 322 452 dróg i obliczenia przejazdów wykonane wyłącznie lokalnie. Użytkownik wybrał pozostawienie 7 adresów bez pozycji oraz odrzucił wysyłanie współrzędnych do OSRM.

Koszyki i ręczna zmiana sprawdzają znane robocze limity 30 km, wspólnego +10 km i pracy z szacowanym dojazdem. Sprawdzane są oba koszyki po przeniesieniu/usunięciu/regeneracji. Stare plany pozostają odczytywalne; ryzyka są pokazywane, a nie usuwane wraz z rezerwacjami. Regionalny zoom odsłania lokalne ulice, a widok koszyka rysuje tylko znane geometrie dróg. Czasy są szacunkowe, pierwszy dojazd/powrót/manewry pozostają niepotwierdzone. W profilu są 3 niepewne dostępy/połączenia, opisane w `data/LOCAL-ROUTING-REPORT.md`.

Pełny obecny zakres, uruchomienie i dokumentacja do Aion UI: [główny README](../README.md), [przekazanie](../docs/PRZEKAZANIE-AION-UI.md), [architektura](../docs/ARCHITEKTURA.md). Aktualny komplet: **190/190 testów PASS**, build/składnia/CSP/hashe PASS oraz 10/10 scenariuszy w prawdziwym Chrome (moduły i offline); szczegóły `VERIFICATION.md` i `../evidence/2026-11-17-browser/`.

Repozytorium GitHub jest publiczne; użytkownik wyraźnie zaakceptował publikację także danych adresowych i współrzędnych. Duże publiczne wejścia grafu są zapisane w gzip i odtwarzane lokalnie przez `prepare_assets.py`, bez pobrań. Źródłowe XLSX/CSV i MAP-04 zachowane.

## Wcześniejszy etap GUGiK przed lokalnym routingiem — opis historyczny

Poniższa sekcja zachowuje stan etapu geokodowania dla ciągłości dokumentacji. Opisy podkładu ograniczonego do Opola oraz braku routingu odnoszą się do tamtej wersji, nie do aktualnego artefaktu opisanego powyżej.

Otwórz **`planner-offline.html` dwuklikiem w przeglądarce**. To nowy, samodzielny planer, zawierający 109 rzeczywistych adresów z `dane_adresowe-v2.xlsx` oraz oddzielne, syntetyczne zlecenia i ekipy. Nie wymaga instalacji ani połączenia z siecią. Stare `offline.html` zachowano jako demonstrator fixture; ma odsyłacz do nowej wersji. Nie pomyl tych plików.

Arkusz ma 110 wierszy danych, 109 unikalnych adresów/budynków i 80 miejscowości. Wiersz 107 powtarza wiersz 100. Wszystkie unikalne punkty włączono; nie dopisywano brakujących 11 punktów do 120. W samym XLSX brak współrzędnych i regionów OPO/KNU. Miejscowość i numer budynku są kompletne; 38 adresów nie zawiera ulicy i zostało zachowane. Po zatwierdzonym użyciu GUGiK aktywna warstwa ma **96 pełnych zgodności**, **6 punktów budynków z osobno oznaczoną różnicą kodu pocztowego** oraz **7 nieustalonych lokalizacji poza mapą**. Razem mapa zawiera 102 punkty. Baza adresów była wcześniej sprawdzona przez użytkownika w QGIS; brak odpowiedzi geokodera nie oznacza błędu tej bazy. Szczegóły: `data/IMPORT-REPORT.md` i `data/UUG-REPORT.md`. Poprzedni wynik Geoapify (46/63) zachowano do porównań.

### Przepływ do sprawdzenia

1. Zobacz niezależną od dnia kolejkę „Do umówienia”. Filtruj miejscowość, typ i wyszukiwanie. Są to jednocześnie filtry zakresu generatora; koszyki pokazują całą zajętość wybranego dnia.
2. W tabeli dostępności włącz/wyłącz slot konkretnej ekipy. Dni 18–20 listopada mają po 3 testowe okna dla 5 umownych ekip; inny dzień zaczyna się bez dostępności. „Dodaj testową dostępność” tworzy brakujące wpisy, nie nadpisuje już ustawionych okien.
3. Kliknij „Generuj koszyki na ten dzień”. Propozycje respektują gotowość, kwalifikacje, wspólny zasób instalacji i pomiarów, unikalność zlecenia i dwa sąsiednie sloty tej samej ekipy. Pozostałe zlecenia zachowują powód w kolejce.
4. Wybierz zlecenie z koszyka. Zmień ekipę, dzień albo początek okna i zapisz. Możesz też wrócić do kolejki. Ręczne korekty są chronione przy ponownym generowaniu; ręczne usunięcie wyklucza automat dla tego konkretnego dnia. „Włącz ponownie do generatora” jawnie zwalnia to wykluczenie. Zmiana kolejności odbywa się przez zmianę slotu; przy zajętym celu najpierw zwolnij go/przenieś dotychczasowe zlecenie. Nie ma przeciągania zleceń.
5. „Potwierdź okno w teście” chroni datę/okno. Automat i zwykłe przeniesienie nie zmienią potwierdzenia. Zwolnienie wymaga osobnego powodu. To symulacja, nie rzeczywisty kontakt z klientem ani finalna obsada D−1.
6. Spróbuj wyłączyć zajęty slot albo przenieść zlecenie na niekwalifikowaną ekipę. Operacja zostanie odrzucona w całości, z wyjaśnieniem. „Cofnij zmianę” przywraca poprzedni spójny stan (do 50 zmian sesji).
7. Zapisuj/wczytuj lokalny plan JSON. Import jest walidowany przed zastąpieniem stanu; błędny plik nie usuwa planu. Adresy nie są zawarte w eksporcie planu — jedynie identyfikator zbioru, ID zleceń, przydziały, dostępność i wykluczenia. Automatyczny zapis korzysta z pamięci tej przeglądarki; dla `file:` jej zachowanie zależy od ustawień. JSON jest przenośną kopią. Nie pracuj jednocześnie w kilku kartach na tym samym planie — nie ma synchronizacji ani scalania zmian.
8. Mapa pokazuje **102 punkty z GUGiK**. Sześć z innym kodem pocztowym w odpowiedzi usługi ma przerywany obrys oraz uwagę w szczegółach. Panel „Uwagi do lokalizacji” zawiera te 6 różnic i 7 nieustalonych lokalizacji. Wybierz wpis, aby porównać oryginał i odpowiedź dostawcy; oryginalnego kodu nie zmieniono. GUGiK rozpoznaje np. Wawelno, Leśna 32A jako 32a, zachowując literę — poprzednie Geoapify wskazywało 32. UUG jest oceniane po polach adresu i identyfikatorach TERYT/SIMC/ULIC; nie przeniesiono progów confidence innego dostawcy. Podkład ulic nadal obejmuje wyłącznie lokalny wycinek Opola; etykiety miejscowości opisują grupy zleceń, nie środki miast. Działa pan/zoom, Home/dopasowanie, „Wybrany adres” i „Cały zakres”. Przycisk „Mapa” na koszyku pokazuje punkty tego koszyka/dnia, niezależnie od filtrów kolejki; „Cały zakres” wraca do filtrów miejscowości, typu i wyszukiwania. Wybór znacznika jest wspólny ze szczegółami i przydziałami. Nie narysowano fikcyjnych tras.

### Granice modelu

Typy, gotowość i wiek kolejki, dwa sloty oraz kwalifikacje/dostępność ekip są **parametrami testowymi**, nie danymi z XLSX ani potwierdzonymi regułami regionalnymi. Nie nadpisują podziału MPL/BSA, dostępności T−2 ani zasad OPO/KNU. Brak terminu umownego BSA wymaga rzeczywistej weryfikacji przed umówieniem; lokalna symulacja nie stanowi zgody na wyjątek. U04 i pozostałe decyzje pozostają robocze.

Generator rozdziela zasoby; nie wylicza dróg, 30 km, +10 km pomiarów ani czasu dojazdu. Preferencja tej samej miejscowości jest tylko wskazówką grupowania. **Koszyki nie są zatwierdzonymi trasami ani dowodem, że pracę z dojazdem da się wykonać w oknie 3 h.** Brak MMS API, kontaktu z klientami, publikacji i finalnej obsady D−1. Geokodowanie wykonano po odrębnych akceptacjach użytkownika w Geoapify, a następnie bezpośrednio w GUGiK; teraz aplikacja używa wyłącznie lokalnej warstwy GUGiK. Nie wykonuje nowych zapytań. Dopasowanie budynku to zgodność pól odpowiedzi, nie niezależny pomiar fizycznej lokalizacji lub zasięgu sieci.

### Uruchomienie i sprawdzenia

Wersja modułowa: `python map05/serve.py` i http://127.0.0.1:8765 — domyślnie otwiera nowy planer. Stary demonstrator jest pod `/index.html`. Serwer udostępnia wyłącznie wskazane pliki, nasłuchuje na 127.0.0.1 i nie przyjmuje zapisów. Pliki planów czytane są przez UI lokalnie; nie trafiają do serwera. Sam XLSX i plik do geokodowania nie są serwowane.

Z katalogu `map05`: `npm test` (54 testy JS), `npm run test:planner` (33 testy planera/lokalizacji), `npm run build` (oba pliki offline). Z katalogu projektu: `python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v` (24 testy) i `python -X utf8 -m unittest discover -s map04/tests -v` (24 testy). Wynik bieżący: **102/102 PASS**. Pełne `npm test` obejmuje podzbiór planera, bez powtórnego liczenia. Nie skonfigurowano TypeScript ani lint; składnię połączonych skryptów offline i Pythona sprawdzono osobno.

Źródłowe XLSX i CSV pozostają bez zmian. Importer `data/import_addresses.py` korzysta wyłącznie z odczytu openpyxl. Stara warstwa `data/geocoding.json` i importer Geoapify pozostają dostępne do regresji. Aktualny lokalny import GUGiK: `python -X utf8 map05/data/import_uug.py`; odtwarza `data/uug-geocoding.json` oraz raport z zapisanych odpowiedzi, bez sieci. Import wymaga pełnej partii i zgodności lokalnych ID/zapytań z manifestem. Builder sprawdza SHA256 XLSX i surowych odpowiedzi GUGiK. Współrzędne nie zmieniają datasetId/ID zleceń, więc istniejące koszyki i zapis lokalny pozostają zgodne. `data/fetch_uug.py` domyślnie tylko sprawdza manifest; nie jest uruchamiany przez aplikację, testy ani build. Przekazanie zatwierdzonego manifestu wymaga jawnej flagi `--execute`; checkpoint chroni przed ponowną wysyłką zakończonych rekordów.

Testy DOM uruchamiają zaufany kod w pamięci bez sieci, nawigacji i graficznego renderera. Nie potwierdzają wyglądu desktop/mobile, działania natywnych pobrań ani faktycznego egzekwowania CSP w przeglądarce. Te punkty pozostają niezweryfikowane wskutek wcześniej zgłoszonej polityki narzędzia; nie zmieniano zabezpieczeń i nie obchodzono blokady.

---

## Starszy demonstrator — instrukcja historyczna

Samodzielny demonstrator MMS Planowanie 2.0. Dane: 5 fikcyjnych ekip i 19 syntetycznych zleceń z `map04/fixtures.json`. Poniższe sekcje dotyczą wyłącznie starego widoku. Domyślna strona serwera wskazuje teraz nowy planer.

## Najprostsze uruchomienie

Otwórz **`offline.html` dwuklikiem w przeglądarce**. Jeśli plik jest już otwarty, odśwież kartę (Ctrl+R). To gotowy, samodzielny plik z lokalną kopią fixture, rzeczywistym podkładem OpenStreetMap, CSS i JavaScript. Mapa zawiera ulice, wodę, tereny zielone i linie kolejowe; nie wymaga serwera, kafelków ani sieci. Polityka CSP nadal zabrania połączeń. Po zmianie fixture lub źródeł odśwież go z katalogu projektu:

```powershell
python map05/build_offline.py
```

Kopia danych jest oznaczona w stopce, a hash źródłowego fixture jest w komentarzu na początku pliku. To kopia tego samego fixture, bez dopisywania zleceń, adresów czy pozycji ekip.

## Wersja serwerowa — aktualny fixture

Z katalogu `MMS Planowanie 2.0`:

```powershell
python map05/serve.py
```

Otwórz [lokalną makietę](http://127.0.0.1:8765). Zatrzymanie: Ctrl+C. Inny port: `python map05/serve.py --port 8767`. Serwer nasłuchuje tylko na `127.0.0.1` i udostępnia jawnie wskazane pliki. Nie otwieraj bezpośrednio `index.html`: importy modułów/fetch wymagają serwera. W środowisku blokującym lokalne gniazda korzystaj z `offline.html`.

## Co sprawdzić na ekranie

1. OPO / 18 listopada: 9 zleceń, 3 potwierdzone okna, 3 ekipy. W panelu „Mapa i zlecenia” widoczny rzeczywisty podkład OSM i syntetyczne znaczniki. Wybierz wpis z listy, mapy albo terminarza — wybór jest wspólny. Współrzędne to alternatywny widok lokalizacji.
2. Filtr BSA / Do umówienia: OPO-SYN-005 i 008. Dla 008 zobacz wymaganie dwóch slotów, brak kompletnej rezerwacji i niezgodne kwalifikacje wskazanej ekipy.
3. OPO / 19 listopada: 3 wpisy. 010 nie ma lokalizacji; 011 ma niezweryfikowany termin BSA; 012 ryzyko wspólnego personelu. Dostępność ekip nie jest podana na ten dzień.
4. KNU / 18 listopada: 6 zleceń i 2 ekipy; KNU / 19 listopada: 1 pomiar z niejednoznaczną lokalizacją. KNU ma etykietę TEST ONLY.
5. Ustaw filtr dający pusty wynik: szczegóły i punkty mają się wyczyścić. Wyczyść filtry, aby wrócić.
6. „Przygotuj ręczną weryfikację” otwiera dialog notatki. Zapis nie zmienia statusów ani ostrzeżeń. Po odświeżeniu notatka znika. Escape zamyka dialog; Tab/Shift+Tab prowadzą po kontrolkach. Na punktach działa Enter i spacja.
7. W węższym oknie panele układają się pionowo, a terminarz przewija się w swoim obszarze. Link pod listą przenosi do szczegółów.

## Znaczenie danych

- Współrzędne zleceń są syntetyczne. Podkład SVG przedstawia rzeczywistą geometrię OpenStreetMap, zapisaną w `basemap/data.json` i włączoną do pliku offline; nie łączy zleceń w wyznaczone trasy. Ulice tła nie oznaczają wyników routingu. Ekipy nie mają współrzędnych w fixture, więc pokazujemy je w osobnym pasie „bez lokalizacji”. Nie wymyślamy ich pozycji.
- Tło i punkty korzystają ze wspólnego rzutowania Web Mercator bez rozciągania osi. Mapa KNU odzwierciedla dokładne współrzędne fixture — ten wycinek obejmuje głównie drogi leśne. Nie przesuwamy fikcyjnych zleceń na centrum miasta ani nie traktujemy ich jako prawdziwych adresów. Szczegóły pochodzenia i licencji: `basemap/README.md`.
- Daty 18/19 listopada wynikają z identyfikatorów slotów, miesiąc i rok z dat dostępności. Slot 19 listopada nie tworzy dostępności, której brak w fixture.
- `slot_id` wskazuje testowy wiersz terminarza; nie oznacza finalnej ekipy. `occupied=false` to kolejka bez rezerwacji. Kwalifikacje nie są dowodem wolnej pojemności ani niekolidującego dopasowania.
- Flaga `BSA_DEADLINE_VERIFIED` jest informacją fixture. Nie ma konkretnej daty ani dowodu umownego; makieta nie oblicza terminu BSA.
- D−1: przydział końcowy niewykonany. Ochrona dnia/okna i kwalifikowana pula to osobne etapy roboczego modelu U02=A; D10 pozostaje otwarte.
- 30 km i +10 km łącznie dla pomiarów: reguły robocze, zawsze „Nieocenione — brak routingu”. Czas przejazdu i dystans: „Brak obliczeń”, geometria niezweryfikowana. Czasy obsługi są tylko parametrami testu.
- U01=B, U02=A, U04=A nie są zatwierdzone produkcyjnie. Wyjątki, pomiar po ostatniej instalacji i normy czasu pozostają nierozstrzygnięte. MAP-04 pozostaje PARTIAL.

## Sprawdzenia

Do uruchomienia makiety nie trzeba instalować pakietów. Pełny zestaw testów wymaga Python 3.12+, Node.js 20+ i npm. Jedyna bezpośrednia zależność deweloperska to przypięty `happy-dom@21.0.3`, używany wyłącznie jako implementacja DOM w pamięci. Nie jest dołączany do makiety ani serwera.

Jednorazowa instalacja narzędzia testowego i uruchomienie wszystkich testów JavaScript:

```powershell
Set-Location map05
npm ci --ignore-scripts
npm test
Set-Location ..
```

Sprawdzenia bez zależności DOM i build offline, z katalogu projektu:

```powershell
node --test map05/tests/model.test.mjs map05/tests/map.test.mjs
node --check map05/model.mjs
node --check map05/map.mjs
node --check map05/app.mjs
python map05/build_offline.py
python -m unittest discover -s map05/tests -p test_*.py -v
python -m unittest discover -s map04/tests -v
```

Testy dostarczania wykonują prawdziwy handler HTTP w pamięci (bez gniazd sieciowych), sprawdzają zasoby, dokładne bajty fixture i podkładu, odrzucanie obcych ścieżek i zapisów oraz zgodność kopii offline i hashy CSP. Testy mapy obejmują wspólne rzutowanie, zakres punktów OPO/KNU i rzeczywistą geometrię źródłową. To nie zastępuje testów przeglądarki. Stan faktycznej weryfikacji: `VERIFICATION.md`.

`tests/ui.test.mjs` uruchamia zaufany kod `app.mjs` na strukturze `index.html` w pamięci Node. Nie używa nawigacji Browser API, adresów `file://`, istniejącej karty przeglądarki ani renderera graficznego. Ładowanie skryptów/CSS/obrazów/ramek jest wyłączone, a próba `fetch` powoduje błąd testu. Dziesięć scenariuszy sprawdza faktyczne handlery zdarzeń aplikacji: wybór, Enter/spację, filtry, regiony/daty, pusty wynik, notatki, anulowanie i błędy danych. Nie potwierdza wyglądu, natywnego Tab/Escape, pułapki fokusu dialogu ani egzekwowania CSP przez Chrome.

Brak frameworka, bundlera, konfiguracji TypeScript i komend lint/typecheck w projekcie. Sprawdzamy składnię JavaScript; build stanowi generator offline. Nie inicjalizowano Git.

## Pliki

- `index.html`, `styles.css`, `app.mjs`, `model.mjs`, `map.mjs`, `favicon.svg` — interfejs, model prezentacji i wspólne rzutowanie mapy.
- `basemap/data.json`, `basemap/README.md`, `basemap/download_osm.py` — rzeczywista geometria OSM, źródła/licencja i ręczne narzędzie odtwarzania podkładu. Nie jest wywoływane podczas korzystania z makiety ani testów.
- `serve.py` — serwer lokalny; `build_offline.py` — powtarzalne generowanie `offline.html`.
- `tests/` — testy modelu i dostarczania; `DESIGN.md` — decyzje UX/plan; `VERIFICATION.md` — wyniki i ograniczenia.
- `package.json`, `package-lock.json`, `.gitignore` — powtarzalne uruchamianie testów komponentowych; aplikacja produkcyjnie nie korzysta z tych zależności.

## Źródła projektu — tylko odczyt

- [MAP-04 — raport, PARTIAL](https://app.notion.com/p/419daa43f568817abf42d08e20fdb89f)
- [MAP-03a — robocze odpowiedzi i otwarte decyzje](https://app.notion.com/p/419daa43f56881b8b37cc341f6b24d72)
- [MMS Planowanie 2.0 — baza wiedzy](https://app.notion.com/p/40fdaa43f568815195d9d1b959bda246)

Nie wykonywano zapisów w Notion, MMS ani innym systemie zewnętrznym. Nie opublikowano makiety.
