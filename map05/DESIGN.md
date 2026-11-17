# MAP-05 — lokalny demonstrator koordynatora

Zakres: jeden ekran OPERATIONS dla koordynatora, wyłącznie `map04/fixtures.json`.
Źródła odczytane 15.11.2026: MAP-04, MAP-03a i baza wiedzy MMS Planowanie 2.0 w Notion.
Założenie wykonawcy: samodzielne HTML/CSS/JavaScript + serwer Python ze standardowej biblioteki; brak scaffoldingu i Git.

## Kierunek

Rozważono: (1) terminarz jako pełnoekranowa tabela, (2) mapa jako główny ekran z szufladą zleceń, (3) stanowisko koordynatora z listą, widokiem punktów, szczegółami i terminarzem. Wybór wykonawcy: wariant 3, ponieważ pozwala porównać okno, lokalizację i ostrzeżenia bez zmiany ekranu. Wariant 1 utrudnia powiązanie geograficzne; wariant 2 nadaje zbyt dużą wagę mapie bez routingu.

## Wygląd i układ

- Atrament `#172e2a`: nagłówki i nawigacja; zieleń `#17634e`: akcje/wybór.
- Tło `#f4f5ef`, papier `#ffffff`, tekst pomocniczy `#53635b`, bursztyn `#8b4b0b`: ostrzeżenia.
- MPL zielony, BSA niebieski, pomiar fioletowy; zawsze także etykieta tekstowa i kształt.
- Font Segoe UI / system sans; tytuł 28 px, sekcje 17 px, treść 14 px, minimum 12 px.
- Odstępy 4/8/12/16/24/32 px, promienie 6/10/14 px, cienkie obramowania, ograniczone cienie.
- Desktop: lista 280 px | punkty + terminarz elastyczne | szczegóły 310 px. Do 1200 px szczegóły pod widokiem punktów; do 800 px jedna kolumna, terminarz przewijany we własnym obszarze.
- Wyraźny focus, natywne przyciski/select, skip link, dialog obsługiwany Escape, reduced motion.

## Flow i semantyka

Region + dzień + typ + status filtrują wspólnie listę, punkty i wpisy terminarza. Wybór w dowolnym widoku synchronizuje pozostałe. Po filtrze wybór pozostaje tylko jeśli jest widoczny; pusty wynik czyści szczegóły. Data wpisu wyprowadzana z `slot_id`, miesiąc i rok z dostępności; nie nadpisujemy fixture.

Pierwsza wersja pokazywała punkty WGS84 na lokalnej siatce. Po uwadze użytkownika i screenshotcie dodano rzeczywisty podkład OSM zapisany lokalnie: ulice, woda, tereny zielone i kolej. To tło geograficzne, bez wyznaczania tras. Wspólne rzutowanie Web Mercator tła i znaczników zachowuje proporcje. Ekipy nie mają współrzędnych w fixture: osobny pas zasobów bez lokalizacji. Brak punktu zlecenia nie jest zastępowany współrzędnymi regionu. Brak zewnętrznych żądań podczas korzystania z makiety.

`slot_id` to robocze wskazanie fixture, nigdy finalna ekipa. `occupied=false` oznacza kolejkę bez rezerwacji. Kwalifikacje nie dowodzą pojemności. D−1 jest osobnym, niewykonanym etapem. 19 listopada brak dostępności ekip w fixture. OPO-SYN-008: dwa sloty bez kompletnej rezerwacji i wskazanie ekipy bez TWO_PERSON — jawne ostrzeżenia.

30 km / +10 km: ROBOCZE, zawsze „Nieocenione — brak routingu”. Odległość, czas i geometria: „Brak obliczeń”. U01/U02/U04: warianty robocze. D10, wyjątki, pomiar po ostatniej instalacji, normy czasu: otwarte. KNU: TEST ONLY.

Notatka weryfikacyjna istnieje tylko w pamięci karty i nie zmienia potwierdzenia, ostrzeżeń, zgody, przydziału ani fixture. Błąd danych pokazuje ekran błędu z ponowieniem; brak ukrytego fallbacku. Wszystkie zmiany wyłącznie w `map05/`, bez zapisu w Notion i bez wdrożenia.

## Plan i dowody

Użyto Superpowers writing-plans/TDD; szczegółowy brief użytkownika stanowi zgodę na wykonanie. Dodatkowe bramki akceptacyjne designu nie są potrzebne do tej lokalnej, odwracalnej makiety.

1. [x] Model (`model.mjs`) i testy (`tests/model.test.mjs`): daty, filtry/wybór, brak współrzędnych, kwalifikacje, ostrzeżenia i brak wyników drogowych. Testy najpierw czerwone.
2. [x] Interfejs (`index.html`, `styles.css`, `app.mjs`, `favicon.svg`): implementacja zsynchronizowanych widoków, pustego wyniku/błędu, notatki w sesji, klawiatury i układu responsywnego. Weryfikacja przeglądarkowa otwarta.
3. [x] Serwer `serve.py`: loopback, jawne ścieżki tylko do makiety i fixture; instrukcja `README.md`. Dodano `build_offline.py` i `offline.html`, ponieważ środowisko blokuje lokalne połączenia.
4. [ ] Pełna weryfikacja: 8 testów modelu, 3 dostarczania, 24 MAP-04 i składnia PASS. HTTP sprawdzony handlerem w pamięci. Przeglądarka desktop/mobile oraz screenshot BLOCKED — raport `VERIFICATION.md`. Nie utworzono pozornych dowodów wizualnych.

Ryzyka do sprawdzenia: pomylenie dat 18/19; slot jako finalna ekipa; brak punktu jako (0,0); zgoda jako notatka; stary wybór po pustym filtrze. Interfejs model → UI: `buildModel(fixture)`, `filterJobs(model, filters)`, `reconcileSelection(jobs, selectedId)`, `jobWarnings(model, job)`, `qualifiedTeams(model, job)`, `routeFacts()`. Zależności spójne, bez konfliktów. Brak Git — brak commitów/worktree.

Final review: niezależny agent tylko do odczytu, bez wspólnych edycji. P2: filtr ukrywał zajęty wpis i pozostawiał etykietę „Bez zajętości fixture”. Poprawka `getSlotState(model, team, date, window, visibleJobs)` oddziela zajętość wszystkich wpisów od widoczności. Test regresji RED→GREEN; końcowy model 8/8. Bez pozostałych istotnych uwag statycznych. Układ/CSP/klawiatura w prawdziwej przeglądarce nadal niepotwierdzone.

## Uzupełnienie: rzeczywista mapa na prośbę użytkownika

- [x] Screenshot użytkownika: załadowany stary widok OPO, 9 zleceń / 3 potwierdzenia / 3 ekipy, wyłącznie siatka. Potwierdzony brak podkładu geograficznego.
- [x] `basemap/data.json`: osiem ograniczonych odczytów publicznego API OSM, zredukowanych do geometrii mapy; źródła i ODbL zachowane. To nie geokodowanie ani routing.
- [x] `map.mjs`: wspólne rzutowanie i testy RED→GREEN; `app.mjs`: render rzeczywistych geometrii i syntetycznych markerów. Brak sztucznych połączeń między zleceniami.
- [x] Builder i serwer obejmują podkład; offline zawiera go w całości i zachowuje `connect-src 'none'`.
- [x] 11 testów JS, 4 Python MAP-05 i 24 MAP-04: 39/39 PASS. Niezależny końcowy przegląd statyczny bez istotnych uwag.
- [ ] Nowy render i interakcje w przeglądarce: nadal niepotwierdzone. Nie zmieniano ani nie obchodzono blokady bezpieczeństwa `file://`.

## 16.11.2026 — weryfikacja komponentowa

Dodano 10 testów zdarzeń interfejsu na DOM w pamięci (`tests/ui.test.mjs`, przypięty `happy-dom@21.0.3` wyłącznie do testów). Brak nawigacji, ładowania zasobów zewnętrznych i przeglądarki graficznej. Sprawdzono start z podkładem, wspólny wybór, keydown Enter/spacja, filtry, regiony/daty, brak współrzędnych, pusty wynik, zapis i anulowanie notatki oraz błędy danych. Wszystkie przechodzą. Pełna aktualna suma: 21 JS + 4 Python MAP-05 + 24 MAP-04 = 49/49 PASS. Nie znaleziono przyczyny do zmiany aplikacji; wygenerowany offline jest bitowo identyczny. Wizualna i natywna przeglądarkowa bramka pozostaje otwarta, a szczegółowe granice są w VERIFICATION.md.
