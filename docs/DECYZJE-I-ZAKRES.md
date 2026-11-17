# Decyzje użytkownika i obowiązujący zakres

Stan: 17.11.2026. W razie rozbieżności pierwszeństwo ma najnowsza bezpośrednia decyzja użytkownika, a nie historyczny opis niedokończonego etapu.

## Cel produktu

Lokalny prototyp stanowiska koordynatora: nieumówiona kolejka → dostępność ekip i slotów → koszyki na wybrany dzień → ręczna korekta → ochrona uzgodnionego terminu → mapa i ocena przejazdów. Prototyp ma umożliwić testowanie procesu na rzeczywistych adresach sieci użytkownika. Zlecenia, ekipy, gotowość, wiek kolejki i czasy obsługi pozostają syntetyczne.

Nie jest to wdrożenie produkcyjnego MMS ani potwierdzenie rzeczywistego wykonania instalacji. Nie wykonujemy kontaktu z klientami, zmian MMS ani finalnej obsady D−1.

## Dane adresowe

| Ustalenie | Obowiązujące znaczenie |
| --- | --- |
| Użytkownik oczekiwał około 120 adresów w swojej sieci | W dostarczonym XLSX jest 110 wierszy, 109 unikalnych adresów i 80 miejscowości. Użyto całej listy; nie dopisano fikcyjnych 11 punktów. |
| Adresy były już sprawdzone w QGIS | Traktujemy ich poprawność jako potwierdzoną przez użytkownika. Geokoder nie jest nadrzędnym źródłem nazw czy numerów. |
| „nie ma potrzeby sprawdzac drugi raz te adresy w moim qgis” | Nie kontynuować ponownej kontroli poprawności adresów w QGIS. |
| Późniejsze pytanie o wyłączny odczyt pozycji pozostałych 7 punktów | Użytkownik odpowiedział: **„Pozostaw te 7 punktów bez pozycji”**. Nie odczytywać ich dalej w QGIS, nie wymyślać współrzędnych. |
| Brak regionów operacyjnych w arkuszu | Nie przypisywać OPO/KNU na podstawie domysłu. Stary demonstrator zachowuje swoje regiony; nowa lista ich nie udaje. |
| Różnice kodu pocztowego geokodera | Zachować źródłowy kod. Sześć jednoznacznych punktów GUGiK ma odrębny status i uwagę, bez zmiany adresu. |

Wiersz 107 jest powtórzeniem wiersza 100. Oryginalne XLSX i CSV nie były nadpisywane. Numery lokali pozostają w katalogu źródłowym, ale nie były wysyłane do geokoderów.

## Zgody na przekazanie danych

| Odbiorca / czynność | Decyzja | Zakres |
| --- | --- | --- |
| Geoapify | **Zaakceptowano** | 109 adresów budynków: kod, miejscowość, ulica, numer, kraj; bez lokali i danych zleceń. Wynik pobrał użytkownik i wskazał CSV. |
| GUGiK UUG | **Zaakceptowano:** „Tak, użyj GUGiK dla 109 adresów” | Miejscowość, ulica, numer budynku. Bez lokali, klientów, dat, umów i ekip. Bez pośrednika Firecrawl dla prywatnych zapytań. |
| Publiczny serwer OSRM | **Odrzucono** | Użytkownik wybrał **„Pozostań przy rozwiązaniu lokalnym bez wysyłania współrzędnych”**. Nie wysłano żadnego punktu do OSRM. Manifest `routing-input.json` jest tylko nieaktywną, lokalną propozycją. |
| Publiczne mapy OSM/Geofabrik | Lokalna metoda wykonania | Pobierano stałe publiczne pliki województw; zapytania nie zawierały adresów, ID ani współrzędnych zleceń. Obliczenia dróg są lokalne. |
| GitHub `multiplay-pages/mms-planowanie` | **Wyraźnie zlecono publikację** | Użytkownik podał konkretne repozytorium. Po ustaleniu, że jest publiczne, wybrał: **„Także adresy, współrzędne i planer z tymi danymi — publicznie”**. |

Zgoda na publikację w tym GitHub nie jest zgodą na ponowne geokodowanie, wysyłanie tras do innych usług, publikowanie w innych serwisach lub wdrożenie produkcyjnego MMS. Bieżąca aplikacja nie wykonuje żadnych zewnętrznych żądań podczas używania.

## Reguły planowania

- Instalacje i pomiary dzielą te same zasoby ekip.
- Dostępność jest konkretną listą okien ekipy na dzień, a nie samym licznikiem.
- Testowo użyto 5 umownych ekip i okien 08–11 / 11–14 / 14–17 na dni 18–20.11.2026. Nowe dni nie mają domyślnej dostępności.
- Maksymalnie 3 instalacje w koszyku; część zleceń wymaga 2 sąsiednich slotów jednej ekipy.
- Ręczne przydziały i potwierdzenia są chronione przy ponownym generowaniu.
- Ręczne usunięcie zostawia wykluczenie automatu na ten konkretny dzień, do jawnego zwolnienia.
- Potwierdzenie dnia/okna jest odrębne od finalnej obsady D−1. Zwolnienie potwierdzenia wymaga powodu.
- Roboczy limit 30 km dotyczy całego przejechanego łańcucha między kolejnymi instalacjami, także z pomiarami po drodze.
- Roboczy wspólny limit +10 km jest różnicą drogi ze wszystkimi pomiarami i tej samej kolejności instalacji bez pomiarów.
- Praca i szacowany dojazd muszą mieścić się w przydzielonym oknie. Normy są parametrami testowymi.

U01/U02/U04, D10, wyjątki koordynatora, pomiar poza pierwszą/ostatnią instalacją, regionalne normy czasu i terminy BSA nie zostały zatwierdzone jako reguły produkcyjne. Brak punktu startu/końca ekipy nie oznacza dystansu 0.

## Przeglądarka i narzędzia

W dotychczasowej sesji konkretne narzędzie Browser Use odrzuciło lokalny `file://` oraz zakazało obchodzenia tej odmowy innym interfejsem, pośrednim wykonaniem lub raw CDP. Nie zmieniano zabezpieczeń. Testy DOM nie są testami wizualnymi Chrome.

To zapis ograniczenia tej sesji, nie dowód, że aplikacja nie działa u użytkownika, i nie ogólny zakaz testów w przyszłym środowisku. Aion UI musi sam rozpoznać swoje aktualne narzędzia i polityki. Jeśli jego własne środowisko dopuszcza zwykłe lokalne testy przeglądarkowe, należy je wykonać; jeśli odmawia, nie obchodzić odmowy i raportować konkretny brak dowodu.
