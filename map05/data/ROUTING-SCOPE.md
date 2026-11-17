# Propozycja routingu drogowego — 17.11.2026

Status: **użytkownik odrzucił wysyłanie współrzędnych i wybrał rozwiązanie lokalne**. Manifest 102 punktów pozostaje wyłącznie lokalny; żadnego punktu nie wysłano do OSRM. Poniższa propozycja jest nieaktywna i nie upoważnia do wywołań. Trasy będą obliczane lokalnie na publicznej geometrii OSM pobranej jako jednakowy prostokątny wycinek regionu, bez adresów, ID i współrzędnych zleceń w zapytaniu.

- Proponowany odbiorca: publiczny serwer demonstracyjny OSRM, `https://router.project-osrm.org`.
- Dane: wyłącznie długość i szerokość geograficzna 102 punktów budynków z lokalnej warstwy GUGiK. Konkretny manifest: `routing-input.json`. ID pozostają lokalne; adresy tekstowe, lokale, dane klientów, ID zleceń, daty i ekipy nie są przekazywane.
- Cel: odległości i czasy dróg dla samochodu (`driving`) oraz geometria aktualnie ocenianych koszyków. Zapytanie geometryczne ujawnia dostawcy również kolejność przekazanych współrzędnych.
- Zakres wykonania po akceptacji: jednorazowa macierz między punktami w małych partiach oraz obliczanie/odświeżanie tras koszyków podczas lokalnych testów. Wyniki zapisywane lokalnie i ponownie używane; bez niepotrzebnego odpytywania. Nie przewiduje się tysięcy zapytań o wszystkie geometrie.
- Bez konta, klucza API i płatności. Jest to usługa publiczna do demonstracji, bez gwarancji dostępności. Dostawca otrzymuje współrzędne w URL i dane techniczne połączenia; nie zakładamy braku logów ani szczególnej retencji.
- Dokumentacja: https://project-osrm.org/docs/v5.24.0/api/ . Table zwraca dystanse tras najszybszych, nie najkrótszych; jednostki to metry i sekundy. Nie używać `fallback_speed` do zastępowania nieznanych dróg odległością prostą. Brak trasy/błąd/nieustalony punkt pozostają jawnym brakiem danych.
- Wynik będzie symulacją na danych drogowych i syntetycznych normach obsługi, nie potwierdzeniem wykonania zlecenia, bieżącej sytuacji drogowej, warunków dojazdu czy zatwierdzonych reguł regionalnych.

Prace niezależne od tej decyzji — pełniejszy lokalny podkład, interakcje mapy, testy i spójność planera — są kontynuowane. Nie wracamy do ponownego sprawdzania adresów w QGIS.
