# Szczegółowa historia prac do 17.11.2026

Ten dokument rekonstruuje pracę z rozmowy, zachowanych źródeł i plików projektu. Nie udaje serii historycznych commitów: przed wskazaniem GitHub katalog nie był repozytorium. Kolejność etapów jest znana; tam, gdzie brak niezależnej daty, podano fazę zamiast wymyślonego czasu.

## 1. Punkt wyjścia: MAP-04 i pierwotny brief MAP-05

Użytkownik przekazał załącznik „MAP-05 — lokalna makieta UX mapy i tras”. Wersja oryginalna jest w `docs/BRIEF-ORIGINAL-MAP05.md`. Wymagała lokalnego demonstratora, nie produkcyjnego planera. Należało najpierw sprawdzić pliki i źródła Notion, a dopiero potem dobrać implementację. Nie zakładano istniejącego frontendu ani Git.

Kontekst projektu odczytywano z Notion, bez zmian stron:

- MAP-04: `https://app.notion.com/p/419daa43f568817abf42d08e20fdb89f`.
- MAP-03a: `https://app.notion.com/p/419daa43f56881b8b37cc341f6b24d72`.
- Baza wiedzy: `https://app.notion.com/p/40fdaa43f568815195d9d1b959bda246`.

MAP-04 miał status PARTIAL: 24/24 testy reguł i fixture przechodziły, ale nie wykonano rzeczywistego benchmarku ORS–OSRM. Fixture zawierał 5 fikcyjnych ekip i 19 syntetycznych zleceń: OPO 3 ekipy/12 zleceń, KNU 2 ekipy/7 zleceń. Współrzędne, czasy i wyniki adaptera były syntetyczne. KNU miał oznaczenie TEST ONLY.

Pierwotny brief zabraniał zewnętrznego routingu/geokodowania, prawdziwych adresów, kluczy API, produkcyjnego MMS, publikacji i wdrożeń. Późniejsze bezpośrednie decyzje użytkownika rozszerzyły część tego zakresu; pełna tabela obowiązujących decyzji jest w `DECYZJE-I-ZAKRES.md`. Zakazu zewnętrznego routingu nie zniesiono — użytkownik później wyraźnie wybrał metodę lokalną.

Sprawdzono `git status --short` i `git diff --stat`; początkowo nie było `.git`, więc kontynuowano bez inicjalizacji. Wykorzystano istniejące `map04/fixtures.json`, `rules.py`, `routing.py` i testy, pozostawiając je źródłem eksperymentu.

## 2. Pierwszy demonstrator MAP-05

Utworzono osobny `map05/`, bez przebudowy całego projektu i bez frameworka. Powstały `index.html`, `styles.css`, `app.mjs`, `model.mjs`, wspólne rzutowanie `map.mjs`, favicon, serwer i builder offline.

Pierwszy ekran obejmował dzień demonstracyjny, region OPO/KNU, typ/status, listę zleceń, wybór synchronizowany z mapą i terminarzem, kwalifikacje ekip, zajętość, szczegóły oraz ostrzeżenia. Rozróżniał potwierdzenie okna i finalną obsadę D−1. Wskazywał brak routingu, niezweryfikowane terminy BSA, problemy lokalizacji i niezatwierdzone decyzje. Nie tworzył fikcyjnych odległości ani dróg z połączonych punktów.

`serve.py` otrzymał nasłuch tylko na loopback i whitelistę zasobów. `build_offline.py` stworzył samowystarczalny HTML z dokładnym fixture. Dane JSON i inline CSS/JS mają hashe CSP, a połączenia w wersji offline są zabronione.

## 3. Przeglądarka i dowód ze zrzutu użytkownika

Użytkownik kilkakrotnie prosił o przeprowadzenie testów i otworzył plik w udostępnionej przeglądarce. Narzędzie Browser Use odmówiło protokołu `file://`: dozwolone miało http/https. Odmowa zawierała również zakaz osiągania tego samego efektu obejściem, przez inny interfejs przeglądarki, pośrednie wykonanie czy raw CDP.

Próba odczytu istniejącej karty po ręcznym otwarciu również została odrzucona. Nie zmieniano zabezpieczeń i nie próbowano alternatywnego renderera. Nie powstał wiarygodny screenshot wykonany przez agenta ani dowód przejścia scenariuszy w prawdziwej przeglądarce. To ograniczenie narzędzia tej sesji, a nie diagnoza błędu samego pliku.

Użytkownik przesłał zrzut ekranu. Potwierdził on, że pierwsza makieta miała siatkę punktów bez rzeczywistego podkładu geograficznego. Nie dowodził działania filtrów, klawiatury czy dialogów. Uwaga „na tej makiecie nie widać mapy” doprowadziła do dodania publicznej geometrii OSM.

## 4. Mały lokalny podkład OPO/KNU i testy zdarzeń

Dodano `basemap/download_osm.py`, który jednorazowo pobrał osiem małych publicznych wycinków API OSM. Zachowano geometrię dróg, wody, zieleni i kolei; odrzucono zbędne metadane i informacje kontaktowe. W `basemap/data.json` zapisano źródła, granice, czas, atrybucję i licencję ODbL.

Dla OPO zachowano 2 515 obiektów drogowych, 101 wodnych, 1 176 zieleni i 316 kolejowych. Dla KNU: 82 drogowe, 27 wodnych, 2 zieleni i 1 kolejowy. KNU obejmował realne położenie syntetycznych punktów fixture, głównie drogi leśne; punktów nie przesuwano na centrum miasta.

Tło i markery używały tego samego Web Mercator. Dodanie ulic nie oznaczało obliczenia tras. Nigdzie nie zamieniono syntetycznych odcinków w rzekome rzeczywiste przejazdy.

Do testów integracji zdarzeń użyto wyłącznie deweloperskiego `happy-dom`. Uruchamia kod aplikacji w pamięci bez nawigacji, sieci i graficznego renderera. Testy sprawdzały wybór, Enter/spację, filtry, region/daty, pusty wynik, lokalną notatkę, anulowanie i błędy danych. Testy HTTP wykonywały prawdziwy handler w pamięci bez otwierania gniazda. Nie były przedstawiane jako Chrome E2E.

## 5. Krytyka kompletności i zmiana celu funkcjonalnego

Użytkownik uznał pierwszą makietę za niewystarczającą. Wskazał brak niezależnej listy zamówień do umówienia, przycisku generowania koszyków na dzień, zarządzania liczbą slotów, ręcznej korekty automatycznego przydziału i pełnej interakcji mapy. Chciał pracować na około 120 prawdziwych adresach w swojej sieci.

Powstał `PLANNER-SCOPE.md`, rozdzielający katalog adresów, kolejkę, dostępność, propozycję koszyka i potwierdzenie. Nie próbowano naciągnąć starego `slot_id` z fixture do roli nowego modelu planowania. Zachowano starszy demonstrator do porównania i dodano nowy zestaw plików `planner-*`.

Była to istotna zmiana zakresu: z przeglądania syntetycznego terminarza na działający lokalny proces budowania i korygowania planu.

## 6. Dostarczony XLSX i oddzielenie danych od symulacji — 16.11.2026

Użytkownik przekazał `dane_adresowe-v2.xlsx`. Odczytano go bez zapisu przez openpyxl w trybie odczytu. Stwierdzono 110 wierszy danych, 109 unikalnych adresów/budynków i 80 miejscowości. Wiersz 107 powtarzał 100. Zachowano oba odwołania do źródła i raport duplikatu. Wszystkie unikalne adresy włączono; nie dopisywano brakujących 11 do równej liczby 120.

38 adresów nie zawierało ulicy; nie uznano tego automatycznie za błąd. Miejscowości i numery były dostępne. Arkusz nie miał współrzędnych ani jednoznacznych regionów OPO/KNU. `adresy.xlsx` pozostał pomocniczym oryginalnym plikiem; aktywnym wejściem nowego planera jest wersja v2.

`import_addresses.py` utworzył katalog `addresses.json`, raport importu oraz minimalny manifest geokodowania i lokalne powiązanie ID. Source hash XLSX stał się `datasetId`. ID zleceń są osobną warstwą `TEST-001`…`TEST-109`.

Testowe typy, gotowość, wiek kolejki, liczba slotów i kwalifikacje ekip nie pochodziły z arkusza. Zostały jawnie nazwane syntetycznymi. Zasięg sieci jest potwierdzony przez użytkownika/listę, nie niezależną analizę agenta.

## 7. Nowy planer zasobowy

Dodano niezależną od daty kolejkę z wyszukiwaniem i filtrami. Zmiana dnia nie usuwa zleceń z kolejki. Koszyki pokazują cały plan dnia, a filtry kolejki określają zakres generatora.

Generator wykorzystuje rzeczywiste wpisy dostępności i kwalifikacji umownych ekip. Nie tworzy pojemności z licznika. Respektuje wspólny zasób pomiarów i instalacji, maksymalnie 3 instalacje i dwa sąsiednie sloty jednej ekipy. Zlecenia niegotowe pozostają w kolejce z powodem.

Dodano ręczne przypisanie/przeniesienie do ekipy, dnia i początku okna, usunięcie do kolejki, cofanie, ochronę potwierdzenia i zwolnienie z powodem. Wyłączenie zajętego slotu jest odrzucane w całości. Ręczny powrót do kolejki tworzy wykluczenie automatu dla danego dnia, możliwe do jawnego zwolnienia.

Ponowne generowanie zastępuje tylko automatyczne niepotwierdzone propozycje w zakresie. Nie zmienia ręcznych korekt, innych dni i potwierdzonych okien. Powstał lokalny plan JSON v1, walidowany import, pamięć przeglądarki i do 50 cofnięć sesji. Stare plany mają pozostać zgodne po wzbogaceniu lokalizacji.

Mapa zyskała przesuwanie, zoom, klawiaturę, dopasowanie, wybór punktu i zakres koszyka. Bez współrzędnych adres nie stawał się punktem `(0,0)` ani środkiem miejscowości. Na tym etapie nadal nie było oceny dróg.

## 8. Geoapify: zgoda, geokodowanie i import CSV — 16.11.2026

Ponieważ XLSX nie miał współrzędnych, użytkownik poprosił o dobór usługi i przedstawienie zakresu. Przygotowano minimalne dane 109 budynków, bez lokali i danych zleceń. Użytkownik zaakceptował Geoapify. Operację wykonano jednorazowo w narzędziu dostawcy; UI pokazał 109/109 przetworzonych.

Narzędzie przeglądarkowe nie odebrało pliku pobrania. Użytkownik sam zapisał wynik i podał `geocoded_by_geoapify-16.11.2026, 16_49_56.csv`. Nie wysyłano listy ponownie tylko z powodu problemu z pobraniem.

Lokalny parser wymagał kompletnej partii, prawdziwych nagłówków i połączenia przez `original_address`, nie kolejność. Kontrolował kraj, współrzędne, pełny numer wraz z literą, miejscowość, kod, ulicę oraz confidence wymaganych pól. Brak pewności budynku lub niezgodność nie stawały się markerem.

Wynik: 46 dopasowań, 63 odpowiedzi do weryfikacji poza mapą. Przykładowo źródłowe Leśna 32A nie zostało zaakceptowane jako Leśna 32 mimo ogólnego confidence 0,95. Kandydat i powody pozostały w osobnej warstwie i panelu.

W tym etapie potwierdzono 88/88 testów całego ówczesnego zestawu. Nie był to dowód pełnego ukończenia geograficznego planera.

## 9. Adresy użytkownika są poprawne; problemem jest dopasowanie geokodera

Użytkownik wyjaśnił, że baza pochodzi z jego QGIS i była już sprawdzona. Nie należało traktować 63 niezgodnych odpowiedzi jako 63 błędnych adresów. Początkowy odczyt interfejsu QGIS został zakończony po jego korekcie; nie kontynuowano ponownej walidacji bazy i nie zapisywano projektu QGIS.

Rozdzielono dwa zagadnienia: poprawność źródłowego adresu oraz jakość współrzędnych odpowiedzi usługi. Celem kolejnego etapu stało się znalezienie lepszej warstwy lokalizacji, bez zmiany numerów czy nazw pod dostawcę.

## 10. GUGiK UUG — 17.11.2026

Wybrano oficjalną Uniwersalną Usługę Geokodowania GUGiK. Najpierw odczytano dokumentację i klienta, a działanie sprawdzono publicznym przykładem Marki/Andersa 1. To nie był adres użytkownika. Jawnie ustawiono `srid=4326`; domyślny wynik w metrach nie może trafić bez przeliczenia do długości/szerokości geograficznej.

Publiczny przykład pokazał poprawną rozbudowaną nazwę ulicy mimo ogólnego accuracy około 0,444. Dlatego nie skopiowano progów 0,95 Geoapify do GUGiK. Parser oparto na pełnym numerze, miejscowości/części miejscowości, kodzie, ulicy i identyfikatorach TERYT/SIMC/ULIC.

Użytkownik odrębnie zaakceptował przekazanie 109 miejscowości/ulic/numerów GUGiK. `fetch_uug.py` wysłał je bezpośrednio do zatwierdzonego hosta, bez lokali, zleceń i pośrednika badawczego. Checkpoint zachował każdy rozliczony rekord i nie wymagał powtarzania zakończonych zapytań.

Otrzymano 107 poprawnych odpowiedzi JSON. Paniówki/Gliwicka BN3 i Zębowice/Leśna BN1 zwróciły nieprawidłowy JSON również po jednym ponowieniu. Zachowano typ błędu i metadane prób. Nie kontynuowano ślepych ponowień.

Wynik lokalnej oceny:

- 96 pełnych zgodności.
- 6 jednoznacznych punktów budynków z innym kodem pocztowym usługi. Oryginalny kod zachowano; dopuszczenie dotyczyło tylko pojedynczego kandydata z pozostałymi polami i rejestrami zgodnymi oraz tym samym dwucyfrowym prefiksem kodu.
- 7 nadal nieustalonych lokalizacji: 4 bez wyniku, 1 wieloznaczna pod względem miejscowości/kodu, 2 błędne odpowiedzi.

Sześć uwag kodu to Osowiec/Dworcowa 7B, Kamień Śląski/Wapienna 1, Rybnik/Arki Bożka 51I, Rybnik/Jodłowa 68, Zawadzkie/Miarki 7 i Malnia/Sosnowa 7. Pełne źródłowe kody/lokale są w raporcie, nie zostały nadpisane.

Siedem pozostałych: Maciejów 39, Boguszyce 22E, Brzęczkowice 15A, Sołtysy BN, Paniówki/Gliwicka BN3, Namysłów/Kazimierza Pułaskiego 18 i Zębowice/Leśna BN1. Brak odpowiedzi nie oznacza nieważności tych adresów.

Leśna 32A w Wawelnie została odnaleziona jako 32a. Lokalnie porównano też 46 dawniej dopasowanych budynków obu dostawców: największa różnica wyniosła około 30 m. Żaden z tych 46 nie stracił punktu. To zgodność dostawców, nie pomiar terenowy.

Frontend i builder przełączono na warstwę GUGiK. 102 punkty trafiały na mapę, 6 różnic miało odrębny obrys, a panel zawierał uwagi i 7 nieustalonych pozycji. Zachowano Geoapify, źródła, datasetId i plany. Cały ówczesny zestaw przeszedł 102/102 testy, build, hashe i niezależny przegląd.

## 11. Użytkownik odrzucił zakończenie na tym etapie

Użytkownik wskazał, że opis pozostawionych braków oznacza dalszą pracę, nie ukończenie całości. Kontynuowano pełny podkład, lokalne drogi i ocenę koszyków zamiast ponownie oddawać sam raport geokodowania.

Ponieważ pierwotny załącznik zabraniał usług routingu, przygotowano konkretny zakres publicznego OSRM: tylko współrzędne 102 punktów, bez adresów tekstowych, dat i ekip. Nie wykonano zapytań z tymi danymi. Użytkownik wybrał rozwiązanie lokalne bez wysyłania współrzędnych. Manifest propozycji oznaczono `REJECTED_LOCAL_ONLY`.

Osobno zapytano o możliwość wyłącznego odczytu gotowych współrzędnych pozostałych 7 punktów, bez powtarzania kontroli adresów. Użytkownik polecił pozostawić je bez pozycji. To jest aktualna decyzja; nie należy próbować ponownie ich pozyskiwać z QGIS bez nowego polecenia.

## 12. Publiczny regionalny zbiór map

Pierwsza próba dużego publicznego zapytania Overpass zwróciła 502, drugi endpoint przekroczył czas; mniejsze zapytanie GET również zwróciło 502. Nie uznano częściowych danych za kompletny region i nie mnożono identycznych ponowień. Zmieniono metodę na gotowe publiczne pliki Geofabrik.

Pobrano stałe pliki województw: Opolskie, Śląskie, Dolnośląskie i Wielkopolskie, łącznie około 555 MB. W URL były wyłącznie nazwy publicznych plików, bez adresów czy pozycji zleceń. Każdy plik sprawdzono opublikowanym MD5 i zapisano SHA256, rozmiar, URL i datę. Nie instalowano silnika chmurowego ani usługi routingu.

W niezależnym module opracowano strumieniowy parser PBF w standardowej bibliotece Python. Ma testy małych kontrolowanych danych binarnych: rozmiary bloków, raw/zlib, StringTable, DenseNodes, granularity/offsety, delta/zigzag, zwykłe węzły, drogi, relacje, selektywny odczyt i błędy/truncation. Pierwszy przebieg może całkowicie pominąć dekodowanie węzłów, drugi tworzy obiekty tylko dla potrzebnych ID.

Ekstrakcja obejmuje stały prostokąt `[17.2,49.9,19.0,51.5]`, nie dopasowane do pojedynczych klientów zapytania. Zachowano topologię ID, istotne tagi dostępu/barier/kierunku i członków ograniczeń skrętu. Niepełne drogi na granicy pominięto zamiast sklejać luki. Po deduplikacji powstało 322 452 dróg, 2 007 799 węzłów, 18 277 kontroli i 6 081 relacji.

Surowy lokalny graf ma około 130 MB, pełny podkład 83,5 MB. Dla interfejsu utworzono wariant słownikowy/polyline około 28,7 MB, zachowujący wszystkie ID, klasy i nazwy. Pełna kontrola potwierdziła pokrycie oryginalnej geometrii przez zaokrąglone granice każdego rekordu. Nie uproszczono przy tym topologii używanej do obliczeń.

## 13. Lokalny silnik dróg i wyniki dla punktów

`local_routing.py` buduje skierowany graf samochodowy. Wyszukiwanie pamięta krawędź wejściową, dlatego może kontrolować zakazy/nakazy skrętu zależne od podejścia. Nie łączy geometrycznych przecięć bez wspólnego ID OSM. Kompresuje tylko bezpieczne łańcuchy między węzłami istotnymi, zachowując długość pełnej geometrii.

Respektuje kierunki, hierarchię dostępu, bariery, wspierane relacje no/only, no_u_turn i wyjątki samochodowe. Warunki, via-way i nierozpoznane przypadki powodują konserwatywne wyłączenia. Nie udaje pełnego OSRM, nawigacji lub wiedzy o konkretnym pojeździe. Dokładny zakres jest w architekturze.

Wynik wybiera najkrótszą długość w dopuszczonym grafie. Czas wylicza z jawnych testowych prędkości, bez bieżącego ruchu. Przyciągnięcie do drogi nie przesuwa adresowego markera i ma próg 150 m; bezpośrednie motorway/trunk nie są używane jako punkt obsługi budynku.

Obliczono wszystkie pary lokalnie: 102 wyszukiwania od źródła, nie tysiące zewnętrznych wywołań. Wiersze zapisywano jako checkpointy z hashami. Geometrie odcinków są współdzielone, z osobną orientacją ścieżek. Kompletny snapshot ma około 40,6 MB.

101/102 punktów przyciągnięto w progu. Rzędowice/Wolna 1 ma około 228,63 m do najbliższego dopuszczonego odcinka, więc pozostaje niepewne. Ostrowina 105H i 106L nie mają połączenia z resztą w przyjętym konserwatywnym grafie. Dostępnych jest 9 702/10 302 skierowanych par między różnymi punktami. Nie zastąpiono pozostałych przez proste linie czy 0 km.

Test pełnego rzeczywistego snapshotu sprawdza ciągłość wszystkich dostępnych ścieżek i zgodność ich końców z właściwymi punktami przyciągnięcia. Osobny test generuje koszyki na tej rzeczywistej warstwie i kontroluje zachowanie dawnego planu.

## 14. Ocena dróg w generatorze i UI

Dodano `routes.mjs` i opcjonalną warstwę dróg scenariusza. `assessBasket` rozlicza rzeczywiste sekwencje między wizytami, 30 km między instalacjami z uwzględnieniem pomiarów, wspólny przyrost +10 km oraz szacowany dojazd z testową pracą w oknie.

Brak startu ekipy, końca po ostatnim pomiarze albo odcinka drogi pozostaje nieoceniony. Stare plany nie są usuwane na wejściu, jeśli nowa warstwa ujawni ryzyko. Znane przekroczenia blokują nowe propozycje. Niegotowe i nieustalone punkty zachowują powód w kolejce.

W koszykach pojawiły się tekstowe wyniki reguł i droga/czas między wizytami. „Mapa” przy koszyku rysuje tylko znane, zapisane geometrie dróg. Widok dopasowuje objazd, a nie sam prostokąt adresów. Po powrocie do „Całego zakresu” trasa koszyka znika.

Regionalny renderer używa poziomów szczegółu, odrzuca obiekty poza viewportem, dekoduje je leniwie i ogranicza liczbę aktywnych elementów SVG. Nazwy ulic są widoczne po przybliżeniu. „Wybrany adres” przechodzi do skali ulic, dodano legendę i skalę mapy. Zwiększono precyzję ścieżek, aby małe odcinki nie znikały przez zaokrąglenie w skali całego regionu.

## 15. Niezależny przegląd i poprawka transakcji

Przegląd tylko do odczytu potwierdził hashe wejść i znalazł jeden istotny błąd: przy przeniesieniu lub regeneracji sprawdzany był koszyk docelowy, ale źródłowy mógł po usunięciu środkowej instalacji dostać nowy limit 40 km zamiast dwóch odcinków po 20 km.

Najpierw dodano testy odtwarzające błąd. Oba scenariusze rzeczywiście zawiodły. Następnie dodano kontrolę nowych/zwiększonych naruszeń we wszystkich dotkniętych koszykach. Obejmuje ASSIGN, REMOVE i GENERATE. Cała operacja jest transakcyjna. Stary problem legacy może nadal być naprawiany; nie blokuje samego odczytu ani usunięcia szkodliwego końca trasy.

Przy ocenie zachowywane są klucze łańcuchów instalacji, okien i wspólnego limitu pomiarów oraz wielkości przekroczeń. Zapobiega to uznaniu nowego problemu za ten sam tylko dlatego, że komunikat tekstowy brzmi podobnie. Testy regresji obejmują też naprawę istniejącego złego planu.

Podczas wdrażania rozdzielono także błędy zasobów i dróg na typy. Wcześniejsze wyszukiwanie słowa „pomiarów” w komunikacie mogło wybrać zajęty slot zamiast właściwego powodu drogowego. Naprawiono klasyfikację, a test sprawdza widoczny powód, nie samą obecność komunikatu.

## 16. Publikacja i przygotowanie do Aion UI

Użytkownik zlecił kontynuację, publikację całego projektu w `https://github.com/multiplay-pages/mms-planowanie.git` oraz bardzo szczegółowy zapis dotychczasowych prac dla dalszej współpracy Claude Code i Codexa w Aion UI.

Konektor potwierdził: repozytorium jest publiczne, domyślna gałąź to `main`, istnieje jedynie początkowy README i commit `3fee2d56bca2d3a057befe818087b3504697e2e8`. Po wyjaśnieniu jawności użytkownik osobno zaakceptował publikację adresów, współrzędnych i planera zawierającego te dane.

Zainicjalizowano lokalny Git dopiero po tym zleceniu, dodano wskazany remote, pobrano historię i oparto lokalną gałąź o istniejący commit. Nie nadpisano zdalnej historii. Pełny import projektu następuje po testach, przeglądzie i kontroli plików.

Duże publiczne wejścia przetworzone przechowuje się bezstratnie jako `.json.gz`, z dokładnymi hashami i narzędziem lokalnego odtworzenia. PBF i checkpointy obliczeń są cache, a nie plikami potrzebnymi do uruchomienia aplikacji. Zależności, sekrety i katalogi konfiguracyjne nie trafiają do Git. Nie uruchamiano GitHub Pages ani wdrożenia MMS.

Powstały dokumenty decyzji, architektury, historii, uruchomienia/testów i przekazania do Aion UI. Zachowano pierwotny brief oraz raporty etapów. Aktualne wyniki końcowego zestawu i dowody publikacji należy odczytywać z `map05/VERIFICATION.md` i Git; nie z historycznych liczb 88/102 testów.

Publikacja została wykonana: commit implementacji `016347792204fc13d9ea980eb6cb667b3df79dde` trafił na `main`. Niezależny odczyt przez GitHub API potwierdził zgodność HEAD, pełnego drzewa i 123 plików z lokalnym zapisem. Szczegóły są w `evidence/2026-11-17/publication.json`; późniejszy commit dokumentacyjny dopisuje ten dowód. Nie wymuszano historii. GitHub przyjął duży samodzielny plik planera z ostrzeżeniem o zalecanym rozmiarze. Nie wykonano publikacji GitHub Pages.

## 17.11.2026 — Aion UI: prawdziwa przeglądarka i poprawki

Użytkownik polecił kontynuację w zespole Aion UI (Claude Code + Codex): sprawdzić planer w prawdziwej przeglądarce, naprawić wykryte problemy i zostawić zweryfikowaną, udokumentowaną wersję. Start od `8ce430a`, czysty `main`.

Codex niezależnie potwierdził baseline 180/180 i zreprodukował 3 usterki w modelu/DOM (R1–R3). Jego narzędzie przeglądarki w Aion UI było niedostępne; nie obchodził tego. Claude Code uruchomił 10 scenariuszy runbooka w lokalnym Chrome 157 (headless, tymczasowe profile, `playwright-core` spoza repo). Pierwsze przebiegi ujawniły problemy, których testy pamięciowe nie mogły pokazać: białą plamę zasłaniającą ulice przy zbliżeniu (P1) i „okruchy” dróg w widoku całego zakresu. Ujawniły też mylący komunikat przy próbie wyłączenia zajętego okna. Dwa wczesne FAIL okazały się błędami skryptu testowego (przeciąganie od markera, przeniesienie przy pełnych slotach), a nie aplikacji. Opisano to w raporcie, zamiast liczyć je jako usterki.

Pracę podzielono na rozłączne pliki. Codex poprawił model i jego testy (komunikat zajętego okna, zachowanie `releaseReason` przy przeniesieniu). Claude Code poprawił CSS, wybór dróg i fokus/mapę w `planner.mjs` oraz testy UI/mapy, a potem zintegrował zmiany i przebudował artefakt. Każdy test regresyjny odtwarzający usterkę był najpierw RED; dodatkowy test kontrolny wolnych okien był celowo zielony przed i po zmianie. Po integracji: 190/190 testów PASS, build PASS oraz 10/10 scenariuszy w Chrome dla widoku modułowego i offline. Codex wykonał niezależny review końcowego diffu przed publikacją (`evidence/2026-11-17-codex/`). Dowody i tabela scenariuszy: `evidence/2026-11-17-browser/README.md`. Opublikowano commit `1359cdeedc7590262e7066891b5ce6b183f9f12f` na `main` (fast-forward, bez force); zdalny HEAD i drzewo potwierdzono przez `git ls-remote` i GitHub API.

## 17.11.2026 — MAP-06: interaktywna mapa operacyjna (gałąź)

Użytkownik zlecił przebudowę mapy na mapę operacyjną „wygodną jak Mapy Google” (MapLibre lub uzasadniony wariant), z wszystkimi koszykami dnia, kolorami ekip, numeracją, warstwami, popupem i edycją, synchronizacją z planem, trasami tylko z lokalnych wyników, satelitą jako opcją wymagającą jawnej konfiguracji oraz pracą offline. Prototyp miał powstać na osobnej gałęzi, bez merge/push na `main` bez akceptacji.

Claude Code wykonał audyt i plan (`docs/MAP06-PLAN.md`), a spike'iem potwierdził, że MapLibre 6.19 rysuje polskie etykiety lokalnie, bez serwera glifów. Następnie zaimplementował projekcję, lokalne kafle MVT, adapter i integrację. Codex niezależnie ocenił plan (T4): wykrył ryzyko P1 workera MapLibre w `file://`, które zreprodukowano w Chrome i naprawiono w CSP, oraz ryzyka P2 zaadresowane w kodzie. Codex napisał też 29 niezależnych testów projekcji (T5). Akceptacja w prawdziwym Chrome z GPU: served 14/14, offline 13/13 przy wyłączonej sieci. Satelitę sprawdzono wyłącznie atrapą na loopback. Testy: 121 JS + 82 Python + 24 MAP-04.

Końcowy przegląd Codexa (T6) zgłosił 5 × P2 i 1 × P3 (popup z nieaktualnym przydziałem, URL dostawcy z poświadczeniami, zbyt luźny `valid_origin`, brak fallbacku SVG po błędzie startu mapy, niepełne noty licencyjne, słabe asercje M4/M6). Wszystkie poprawiono i potwierdzono testami (125 JS, 82 + 24 Python) oraz ponownym przebiegiem w Chrome (14/14, 13/13, 10/10). Szczegóły: `evidence/2026-11-17-map06/README.md`.

## 18.11.2026 — MAP-06.1: optymalizacja i przygotowanie do odbioru

Użytkownik zatwierdził: zmniejszenie pliku offline, przeniesienie kafli do Web Workera i warunkową publikację gałęzi (bez scalenia do `main` i bez wdrożenia). Claude Code zapakował duże bloki danych gzip+base64 (71,3 → 32,4 MB), przeniósł rozpakowanie, parsowanie i kodowanie kafli dróg do workera (offline: worker z `blob:`), dodał bezpieczne przejścia na mapę SVG i zmierzył PRZED/PO (3 + 3 przebiegi naprzemiennie w Chrome z GPU). Codex wykonał audyt przedpublikacyjny (T9: brak sekretów; otwarte sprawy praw do utrwalonych wyników GUGiK UUG/Geoapify i atrybucji — udokumentowane w `docs/ZRODLA-DANYCH-I-LICENCJE.md`), przegląd implementacji (T10: 2 × P2 i 1 × P3 — awaria workera po starcie, nieograniczone anulowania, tekst opisu mapy; naprawione) i re-check (T11: APPROVE). Dodano testy w Firefoksie (WebDriver BiDi) i dotykowe w Chrome. Szczegóły: `evidence/2026-11-18-map061/README.md`. Context7 i Notion nie były dostępne w tej sesji.


## 18.11.2026 — MAP-07B: grupowanie instalacji pomiędzy koszykami (symulacja)

Gałąź `map07b-cross-basket-optimization` od `map06-interactive-map`. Wyniku „MAP-07A” nie było w repozytorium; za zgodą użytkownika zaimplementowano go jako krok 0. Dodano `map05/optimizer.mjs` (propozycja dnia między ekipami i slotami według istniejących reguł twardych, trzy nazwane warianty hierarchii celów — niezatwierdzone, wyjaśnienia dla każdego zlecenia, powody pominięć), panel „Optymalizacja między koszykami” (porównanie „Obecny plan / Propozycja”, podgląd na mapie, jawna akceptacja z cofnięciem, odrzucenie) oraz benchmark MAP-06 / MAP-07A / MAP-07B. Zmiana w `planner-model.mjs` ogranicza się do eksportu `placementError` i memoizacji walidacji dat. Kolizja nazw w skrypcie offline (`proposal`) wykryta w Chrome z pliku `planner-offline.html` i zabezpieczona testem. Szczegóły, tabela wyników i otwarte decyzje: `docs/MAP07B-OPTYMALIZACJA.md`; dowody: `evidence/2026-11-18-map07b/`.

## 18.11.2026 — MAP-08: przebudowa mapy operacyjnej (gałąź `map08-map-quality`)

Użytkownik zlecił audyt i przebudowę samej mapy (jakość podkładu, czytelność, osobny duży widok), bez zmiany macierzy odległości, routingu ani modelu planu i bez łączenia z MAP-07A. Audyt wykazał, że słabość wynika głównie z danych (podkład tylko z wybranych klas dróg), a nie ze stylu; mapa zajmowała ok. 17% okna.

Claude Code zbudował lokalny pakiet PMTiles z ekstraktów Geofabrik (drogi z hierarchią i nazwami, miejscowości, budynki, woda, tereny, kolej), własny czytnik w przeglądarce, dwa warianty stylu (Operational Light, Professional Navigation), widok „Duża mapa” z panelem ekip, klasteryzacją, szczegółami i legendą oraz uczciwy status podkładu (naprawa niespójności po Hybryda → Drogowa). Satelita/Hybryda pozostają niedostępne do decyzji właściciela (ORTO). Codex (T20) napisał testy potoku pakietu i znalazł dwie usterki (zasięg `Coverage.near`, zerowy offset w katalogu PMTiles) — naprawione. Pełny opis i pomiary: `docs/MAP08-MAPA-OPERACYJNA.md`.

## Co świadomie pozostaje ograniczeniem prototypu

- 7 adresów pozostaje bez współrzędnych na wyraźne polecenie użytkownika.
- 3 dodatkowe punkty mają niepewność dostępu/połączenia w lokalnym profilu dróg, bez unieważniania adresów.
- Brak startu/powrotu ekipy, potwierdzenia wjazdu na posesję, manewrów, ruchu drogowego i profilu wymiarów konkretnego pojazdu.
- Syntetyczne zlecenia i normy nie są rzeczywistymi zamówieniami ani zatwierdzonymi regułami regionalnymi.
- Brak globalnej optymalizacji; generator jest deterministyczną heurystyką z walidacją.
- Wizualną weryfikację wykonano 17.11.2026 tylko w Chrome 157 (headless). Inne przeglądarki, tryb z oknem/GPU, dotyk i czytnik ekranu pozostają niesprawdzone.
- MAP-04 nadal nie ma rzeczywistego benchmarku ORS–OSRM. Lokalny graf nie jest jego pozornym zaliczeniem.

Nie wolno zamykać tych punktów zmianą etykiety na PASS. Następne środowisko ma je świadomie przetestować lub rozwinąć w zatwierdzonym zakresie.
