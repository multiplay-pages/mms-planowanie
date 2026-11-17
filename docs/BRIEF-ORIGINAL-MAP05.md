# MAP-05 — lokalna makieta UX mapy i tras

## Cel

Przygotuj działającą, lokalną makietę UX MAP-05 dla projektu MMS Planowanie 2.0. Ma pokazać, jak koordynator może przeglądać syntetyczny terminarz ekip i zleceń wraz z widokiem mapy oraz ostrzeżeniami o kompletności danych i wykonalności.

To demonstrator interfejsu i przepływu pracy. Nie jest produkcyjnym planerem ani dowodem, że rzeczywiste trasy są wykonalne.

## Źródła projektu

Przed implementacją sprawdź, czy są dostępne i przeczytaj:

- MAP-04 — raport i status ograniczeń: https://app.notion.com/p/419daa43f568817abf42d08e20fdb89f
- MAP-03a — robocze odpowiedzi i kwestie nierozstrzygnięte: https://app.notion.com/p/419daa43f56881b8b37cc341f6b24d72
- Baza wiedzy MMS Planowanie 2.0: https://app.notion.com/p/40fdaa43f568815195d9d1b959bda246

Głównym wejściem danych jest `map04/fixtures.json`. W razie potrzeby sprawdź także `map04/rules.py`, `map04/routing.py` i `map04/test-results.txt`. Najpierw sprawdź ich rzeczywistą zawartość i strukturę. Nie zakładaj, że istnieje już aplikacja frontendowa ani repozytorium Git.

Odczyt Notion jest źródłem kontekstu. Nie modyfikuj stron ani baz Notion.

## Ważne fakty i ograniczenia

- MAP-04 ma status PARTIAL: 24/24 testy reguł i fixture przeszły, ale nie wykonano rzeczywistego benchmarku ORS–OSRM.
- Fixture zawiera 5 fikcyjnych ekip i 19 syntetycznych zleceń: OPO — 3 ekipy / 12 zleceń; KNU — 2 ekipy / 7 zleceń.
- Nie ma danych klientów. Współrzędne, czasy obsługi i wyniki routingu z fixture są syntetyczne.
- Godziny i zasady KNU w fixture są parametrami testowymi, nie potwierdzonymi zasadami operacyjnymi.
- MapLibre GL JS może renderować mapę, lecz sam nie oblicza tras. OpenFreeMap może służyć jako demonstracyjne tło, jeśli środowisko i istniejący projekt na to pozwalają.
- Nie wywołuj ORS, OSRM ani innych usług routingu/geokodowania. Nie używaj kluczy API ani prawdziwych adresów.
- Nie rysuj syntetycznych odcinków jako rzeczywistych dróg. Dystans, czas i geometria drogi mają wyświetlać „Brak obliczeń” / „Niezweryfikowane”, nigdy zmyślone wartości ani `0 km`.
- U01, U02 i U04 są roboczymi wariantami do demonstracji, nie zatwierdzonymi regułami produkcyjnymi. D10 pozostaje nierozstrzygnięte. Nie przedstawiaj żadnej z tych decyzji jako zatwierdzonej.
- Nie zmieniaj produkcyjnego MMS, nie pobieraj danych klientów, nie publikuj i nie wdrażaj makiety.

## Sposób pracy

1. Zacznij od `git status --short` i `git diff --stat`. Jeśli katalog nie jest repozytorium, odnotuj to i kontynuuj bez inicjowania Git.
2. Użyj wyszukiwania przed czytaniem. Sprawdź strukturę katalogu, dostępny framework, skrypty, istniejące konwencje i fixture MAP-04. Nie przeglądaj niezwiązanych plików.
3. Wykryj narzędzia rzeczywiście dostępne w tej sesji. Jeśli jest dostępny specjalistyczny skill do projektowania UI/UX, zastosuj go przed kodowaniem. Context7 wykorzystaj do aktualnej dokumentacji bibliotek tylko wtedy, gdy jest dostępny i potrzebny. Figma/MagicPath są opcjonalne; nie blokuj pracy, jeśli ich nie ma.
4. Dopasuj makietę do istniejącego projektu. Jeśli nie ma aplikacji ani właściwego scaffoldingu, utwórz samodzielny prototyp w nowym katalogu `map05/`, nie przebudowując projektu.
5. Utrzymuj mały, tematyczny zakres zmian. Nie rób refaktoru przy okazji. Nie dodawaj zależności bez uzasadnienia.
6. Zbuduj interfejs i uruchom dostępne, zawężone sprawdzenia. Jeśli nie ma testów lub przeglądarki, zweryfikuj co najmniej uruchamianie aplikacji i jasno opisz brak wizualnej weryfikacji.
7. Na końcu sprawdź `git diff --stat` i `git status --short`, jeśli repozytorium istnieje.

## Zakres makiety

Pokaż jeden główny ekran koordynatora, z czytelnym podziałem na:

- **Panel terminarza i ekip:** dzień demonstracyjny, pule ekip, sloty, zajętość, rodzaj pracy i kwalifikacje. Oddziel MPL, BSA i pomiary.
- **Panel zleceń:** filtrowanie regionu OPO/KNU, typu pracy i statusu; wybranie zlecenia powinno synchronizować szczegóły z mapą.
- **Mapę lub czytelny widok zastępczy:** syntetyczne punkty ekip i zleceń, legenda oraz wyraźne oznaczenie, że to dane demonstracyjne. Nie pokazuj fikcyjnych dróg. Jeśli mapa zewnętrzna nie działa, użyj lokalnego widoku zastępczego i opisz ograniczenie.
- **Szczegóły zlecenia:** typ, region, okno, status potwierdzenia, wymagane kwalifikacje i źródło wpisu jako fixture.
- **Wskaźniki reguł:** limit 30 km między instalacjami i łączny limit +10 km dla pomiarów przedstaw jako reguły robocze. Ponieważ nie ma obliczeń drogowych, ich wynik ma być „Nieocenione — brak routingu”, a nie PASS/FAIL.
- **Ostrzeżenia i ręczna weryfikacja:** pokaż brak lub niejednoznaczność lokalizacji, niezweryfikowany termin BSA i ryzyko wymagające decyzji koordynatora. Nie oznaczaj ostrzeżenia jako zgody ani potwierdzenia.
- **D−1 i kwalifikowana pula:** wizualnie rozróżnij potwierdzenie dnia/okna od końcowego przydziału konkretnej ekipy. Oznacz model puli jako demonstrację roboczą.
- **Nierozstrzygnięte decyzje:** widoczna informacja o D10, wyjątkach koordynatora, pomiarze po ostatniej instalacji i niepotwierdzonych normach czasu.
- **Statusy danych:** na ekranie widoczne etykiety „MAKIETA”, „DANE SYNTETYCZNE”, „TRASY NIEOBLICZONE”; przy KNU dodaj „TEST ONLY”.

Interakcje mogą działać lokalnie i tymczasowo: wybór zlecenia, filtrowanie, otwieranie szczegółów, zmiana widoku oraz prezentacja przykładowego ostrzeżenia lub decyzji. Nie zapisuj ich do systemu zewnętrznego.

Zadbaj o czytelność na ekranie desktopowym i węższym widoku, obsługę klawiaturą oraz statusy rozróżnialne również tekstem, nie tylko kolorem.

## Multi-agent

Najpierw oceń, czy delegowanie realnie przyspieszy pracę. Dla tej makiety preferuj jednego wykonawcę. Użyj drugiego agenta tylko wtedy, gdy bieżące środowisko faktycznie wspiera delegowanie i można wydzielić niezależne zadanie, np. read-only przegląd wymagań lub końcowy audyt UI. Nie pozwalaj agentom równolegle edytować tych samych plików. Jeśli delegowanie jest niedostępne albo nie wnosi korzyści, kontynuuj samodzielnie.

## Kryteria akceptacji

- Makieta uruchamia się lokalnie zgodnie z istniejącym projektem albo zawiera krótką instrukcję uruchomienia.
- Widoki terminarza, listy zleceń i mapy są połączone wyborem zlecenia i filtrami.
- Interfejs korzysta z fixture MAP-04 lub jawnie informuje o lokalnym, syntetycznym fallbacku, jeśli fixture jest niedostępny.
- Żadna fikcyjna trasa ani wynik routingu nie wygląda na rzeczywisty.
- OPO i KNU są rozróżnione, a KNU ma etykietę TEST ONLY.
- Robocze reguły i nierozstrzygnięte kwestie nie są przedstawione jako zatwierdzone.
- Nie ma żądań do routingu, geokodowania, produkcyjnego MMS ani zapisu zewnętrznego.
- Raport końcowy podaje status, zmienione pliki, sposób uruchomienia, wykonane sprawdzenia, ograniczenia oraz następny krok. Zrzut ekranu dołącz, jeśli środowisko pozwala go wiarygodnie wykonać.

Zacznij od sprawdzenia stanu katalogu i dostępności fixture. Potem zrealizuj makietę w tym zakresie; nie zatrzymuj pracy z powodu opcjonalnych konektorów.