# MAP-05 — korekta zakresu funkcjonalnego, 16.11.2026

## Cel po uwadze użytkownika

Działający lokalny prototyp procesu: kolejka zleceń do umówienia → dostępność ekip i slotów → wygenerowane koszyki na wybrany dzień → ręczna korekta → uzgodnienie i ochrona terminu. Interaktywna mapa wspiera ten proces. Docelowy test obejmuje około 120 różnych adresów potwierdzonych jako znajdujące się w zasięgu sieci.

Ten dokument opisuje docelowy zakres; tabela pierwotnych luk pozostaje historią. Po otrzymaniu danych dodano osobny `planner.mjs` / `planner-model.mjs` / `planner.html` i gotowy `planner-offline.html`. Starszy `app.mjs` zachowano. Aktualny stan wdrożenia i pozostałe braki opisano na końcu; same testy nie potwierdzają kompletności geograficznej planera.

## Zweryfikowane luki

| Wymaganie | Stan obecny | Potrzebne zachowanie |
| --- | --- | --- |
| Kolejka do umówienia | Filtr QUEUE w liście wybranego dnia; dzień jest już zakodowany w fixture | Osobna lista nieumówionych zleceń, niezależna od dnia planowania, z wiekiem wpisu, gotowością, regionem i typem |
| Generowanie koszyków | Brak generatora i przycisku | Wybranie dnia, zakresu zleceń i dostępności; przycisk „Generuj koszyki”; wynik wraz z powodami nieprzydzielenia pozostałych |
| Zarządzanie slotami | Dostępność tylko odczytywana z fixture | Dodawanie/zmiana/blokowanie okien konkretnej ekipy na konkretny dzień; widok sumy regionalnej jako wynik, nie zastępstwo zasobów |
| Korekta automatycznych przydziałów | Brak modelu koszyka i operacji przenoszenia | Przeniesienie do innego koszyka/slotu, usunięcie do kolejki, zmiana kolejności; ponowna walidacja i możliwość cofnięcia zmiany |
| Interaktywna mapa | Wybór znaczników i przełącznik współrzędnych; brak pan/zoom | Przesuwanie, przybliżanie/oddalanie, dopasowanie do wszystkich punktów lub wybranego koszyka, synchronizacja z listą i zaznaczenie koszyka |
| Test na 120 adresach w sieci | 19 syntetycznych zleceń, bez potwierdzenia pokrycia | Około 120 odrębnych punktów z autorytatywnej listy użytkownika; dane zleceń mogą być syntetyczne i jawnie opisane |

## Model danych i spójność

Rozdzielić katalog adresów, kolejkę zleceń, dostępność ekip, propozycje koszyków i potwierdzone wizyty. Adres nie powinien zawierać terminu ani ekipy jako nieodłącznej właściwości. `slot_id` z MAP-04 pozostaje szczegółem starego adaptera testowego, nie podstawą nowego procesu.

- **Adres:** stabilne ID, region, miejscowość, ulica, numer budynku, opcjonalnie kod pocztowy i współrzędne, źródło oraz status pokrycia siecią.
- **Zlecenie:** ID, adres, MPL/BSA/pomiar, czas wejścia do kolejki, gotowość, kompetencje, testowy czas obsługi, liczba potrzebnych slotów, stan kontaktu, ewentualny zweryfikowany termin BSA.
- **Dostępność:** ID ekipy, dzień, godziny od–do, kwalifikacje, blokada i przyczyna; instalacje i pomiary współdzielą rzeczywisty zasób.
- **Koszyk:** dzień, proponowany zasób/pula, uporządkowane zlecenia, zajęte okna, stan walidacji, pochodzenie automatyczne/ręczne, lokalna historia zmian.
- **Potwierdzenie:** uzgodniony dzień i okno osobno od finalnej obsady D−1. Automat nie zmienia potwierdzonego terminu.

Pozostać w `map05/`, korzystając z istniejących modeli/testów tam, gdzie pasują. `map04/` pozostaje niezmienionym źródłem eksperymentu. Nie przenosić sztucznych dat i pozycji obecnego fixture na rzeczywiste adresy.

## Zachowanie generatora i edycji

1. Najpierw uwzględnić potwierdzenia i zablokowane zasoby. Kolejka zawiera pozostałe gotowe zlecenia, także te bez wybranej daty.
2. Generator używa rzeczywistych okien i kompetencji testowej konfiguracji. Nie tworzy pojemności na podstawie samego licznika. Roboczy koszyk: maksymalnie 3 instalacje, z jawną obsługą zapotrzebowania na 2 sąsiednie sloty jednej kwalifikowanej ekipy.
3. Wynik pozostaje propozycją. Nie oznacza kontaktu z klientem, potwierdzenia, zgody na wyjątek ani finalnego przydziału D−1.
4. Każde nieprzydzielone zlecenie zachowuje pozycję w kolejce i otrzymuje przyczynę, np. brak kwalifikacji, brak slotu, brak gotowości lub brak danych do oceny.
5. Ręczne przeniesienie ponownie sprawdza zajętość, kompetencje, wymagane sloty i ochronę potwierdzeń. Zmniejszenie dostępności nie może po cichu usuwać istniejących rezerwacji.
6. Ponowne generowanie chroni potwierdzenia i jawnie zachowane zmiany ręczne. Nie zmienia planu bez pokazania skutku.
7. Zapis/odczyt lokalnego planu oraz reset do danych testowych muszą być dostępne bez zapisu do MMS lub innego systemu zewnętrznego.

## Geografia i nierozstrzygnięte zasady

Współrzędne adresów umożliwiają umieszczenie ich na mapie, ale nie dowodzą pokrycia siecią ani przejezdności. Potwierdzenie pokrycia pochodzi z listy/źródła wskazanego przez użytkownika. W rekordzie trzeba zachować to źródło; nie oznaczać adresu jako niezależnie zweryfikowanego, jeśli jedynym dowodem jest przekazana lista.

Do oceny 30 km drogami, łącznego +10 km pomiarów i czasu pracy z dojazdem potrzebne są rzeczywiste wyniki routingu. Dotychczasowy etap ich nie dostarczył. Dopóki ich nie ma, generator może proponować przydziały zasobowe, ale nie może przedstawiać ich jako geograficznie wykonalnych. Nie stosować odległości w linii prostej jako substytutu limitu drogowego. Nie tworzyć fikcyjnych tras na interaktywnej mapie.

U01/U02/U04, D10, pomiar po ostatniej instalacji, normy czasu oraz regionalne wyjątki pozostają robocze. W konfiguracji prototypu trzeba je nazywać wariantami testowymi. Rzeczywistych adresów nie przekazywać usługom geokodowania/routingu bez ustalenia dostawcy i uzgodnionego zakresu takiego przekazania.

## Lista adresów potrzebna od użytkownika

Preferowany CSV lub XLSX; można przekazać istniejący plik, bez dopasowywania go do nowego szablonu. Minimalny komplet:

- miejscowość,
- ulica (jeśli jest częścią adresu),
- numer budynku,
- potwierdzenie, że przekazane punkty są w zasięgu sieci.

Pomocne dodatkowo: ID punktu/adresu, region OPO/KNU, kod pocztowy, długość i szerokość geograficzna, technologia i status dostępności. Jeżeli wszystkie punkty są potwierdzone przez użytkownika jako dostępne, nie potrzeba osobnej flagi w każdym wierszu; źródło zostanie zapisane na poziomie importu.

Bez nazwisk, telefonów, numerów umów i innych danych klientów. Sama lista adresów wystarczy jako punkt wyjścia — parametry zleceń i daty można przygotować jako jawnie syntetyczny scenariusz, bez twierdzeń o realnych zamówieniach. Brak współrzędnych oznacza otwartą kwestię geolokalizacji, nie zgodę na automatyczne wysłanie adresów poza środowisko lokalne.

## Kryteria odbioru przyszłej wersji

1. Zaimportowano około 120 odrębnych adresów z udokumentowanym źródłem pokrycia; duplikaty i niekompletne dane są raportowane, nie ukrywane.
2. Przed wyborem daty widać nieumówioną kolejkę. Zmiana dnia nie usuwa jej z widoku.
3. Zmiana dostępności konkretnej ekipy zmienia dostępną pojemność; konflikt z już zajętym slotem jest jawny i nie usuwa rezerwacji.
4. „Generuj koszyki” tworzy propozycje na wybrany dzień, respektując dostępność i kwalifikacje, oraz wyjaśnia niewykorzystane zlecenia. Nie dubluje jednego zlecenia w dwóch koszykach.
5. Użytkownik przenosi automatycznie przydzieloną instalację i widzi wynik walidacji, zmianę slotów oraz stan kolejki. Cofnięcie odtwarza poprzedni spójny stan.
6. Potwierdzona wizyta pozostaje chroniona przy ponownym generowaniu; ewentualna ręczna zmiana jest odrębną świadomą operacją z powodem.
7. Pan/zoom i dopasowanie mapy działają z myszą i klawiaturą; wybór adresu i koszyka jest zsynchronizowany z planem.
8. Plan można zachować i odtworzyć lokalnie. Nie ma skutków w produkcyjnym MMS.
9. Wyniki routingu i nieocenione ograniczenia mają uczciwe etykiety. Sam wygenerowany koszyk nie otrzymuje fałszywego statusu wykonalności.
10. Testy obejmują cały powyższy przepływ na docelowym zbiorze, a realny test przeglądarkowy oddzielnie potwierdza interakcje i widok desktop/mobile.

## Stan tej korekty

Po dostarczeniu `dane_adresowe-v2.xlsx` zaimportowano 110 wierszy → 109 unikalnych adresów w 80 miejscowościach. Źródła nie zmieniono. Do wykonania pełnego testu 120 różnych adresów brakuje 11 dodatkowych punktów; aktualny prototyp używa wszystkich dostarczonych unikalnych adresów.

Wdrożono kolejkę niezależną od dnia, generowanie propozycji, zarządzanie trzema oknami pięciu umownych ekip, walidowane ręczne przenoszenie i powrót do kolejki, ochronę potwierdzeń/ręcznych zmian, cofnięcie oraz lokalny JSON i pamięć przeglądarki. Po zatwierdzonym GUGiK są 96 pełnych dopasowań i 6 punktów z uwagą o kodzie. Użytkownik następnie wybrał pozostawienie 7 punktów bez pozycji i obliczenia dróg lokalnie. Źródłowe adresy/kody pozostały bez zmian; brak dalszej kontroli QGIS. Geoapify 46/63 jest historycznym porównaniem.

Aktualny podkład obejmuje regionalny prostokąt i 322 452 drogi. Są lokalne wyniki dróg oraz ocena roboczych 30 km/+10 km/dojazdu z pracą. Nowy przydział sprawdza również źródłowy koszyk po zmianie; stare plany nie są niszczone przy odczycie. Działa pan/zoom, wybór punktu, skala ulic i znana geometria koszyka. 101/102 punktów mieści się w progu przyciągnięcia, 9 702/10 302 skierowanych par jest dostępnych; 3 punkty mają niepewność dostępu/połączenia. Brak odcinka pozostaje nieoceniony. Czasy/normy są szacunkowe; start/powrót/manewry oraz reguły produkcyjne nie są potwierdzone. Prawdziwy test wizualny nadal nie został wykonany w tej sesji. Szczegóły: `data/LOCAL-ROUTING-REPORT.md` i `../docs/ARCHITEKTURA.md`.

Testy planera/lokalizacji/dróg/DOM: 55/55 PASS w pełnym zestawie 76 JS; cały zestaw regresji i danych: 180/180 PASS. Szczegóły i granice dowodów: `VERIFICATION.md`. Prototyp obejmuje lokalne drogi i proces zasobowy, ale nie jest zatwierdzonym narzędziem produkcyjnym ani zaliczonym testem wizualnym w prawdziwej przeglądarce.
