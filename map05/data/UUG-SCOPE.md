# Alternatywa dla Geoapify — GUGiK UUG

Stan 17.11.2026: użytkownik zaakceptował zakres słowami **„Tak, użyj GUGiK dla 109 adresów”**. Przekazano 109 adresów bezpośrednio do zatwierdzonej usługi. Dwa zapytania z nieprawidłową odpowiedzią JSON ponowiono po jednym razie; wynik pozostał nieprawidłowy. Rozliczono wszystkie 109 wejść: 107 odpowiedzi JSON i 2 błędy odpowiedzi. W QGIS nie prowadzono dalszej weryfikacji — użytkownik potwierdził, że jego baza była już sprawdzona.

## Cel i źródło

Traktujemy adresy użytkownika jako potwierdzone w jego bazie. Badamy poprawne współrzędne i zgodność odpowiedzi zewnętrznego geokodera, a nie zmieniamy tych adresów pod jego odpowiedzi. 63 wyniki do sprawdzenia oznaczają ograniczenie lub niezgodność Geoapify; nie dowodzą błędów bazy.

Wybrana alternatywa: **Uniwersalna Usługa Geokodowania Głównego Urzędu Geodezji i Kartografii**, `https://services.gugik.gov.pl/uug/`.

Oficjalna dokumentacja: https://services.gugik.gov.pl/uug/opis.html . Usługa udostępnia GetAddress, pola miejscowości, numeru, kodu, geometrii i identyfikatory TERYT/SIMC/ULIC. Parametr `exact_number=1` chroni zgodność numeru budynku. Nie korzystamy z kolejnego geokodera opartego wyłącznie na domyślnym wyniku Geoapify.

## Sprawdzony odczyt próbny

Sprawdzono bezpośrednie zapytanie HTTPS na **publicznym przykładzie z dokumentacji**, `Marki, Andersa 1` — nie na adresie użytkownika. Otrzymano HTTP 200 i punkt adresowy z numerem 1, pełną nazwą ulicy, kodem oraz identyfikatorami rejestrowymi. Surowy wynik: `uug-public-example.json`.

W przykładzie pełna nazwa ulicy jest dłuższa od wejściowej, a ogólny współczynnik dopasowania wynosi około 0,444 pomimo zgodnego przykładu dokumentacyjnego. Dlatego progów confidence Geoapify nie należy kopiować do GUGiK. Ocenę trzeba oprzeć na polach adresu, jednoznaczności wyniku i identyfikatorach, przy zachowaniu surowej odpowiedzi. Oficjalny klient `https://services.gugik.gov.pl/uug/js.js` wysyła `srid=4326` i interpretuje odpowiedź jako `[y, x]` dla mapy. Zapytania będą jawnie żądały tego układu; wynik w metrach nie może trafić bez przeliczenia do pól długości/szerokości geograficznej.

## Zaakceptowany i wykonany zakres

- Odbiorca: wyłącznie GUGiK, host `services.gugik.gov.pl`.
- Lista: wszystkie **109 unikalnych adresów budynków** z bieżącego katalogu. Lokalny, konkretny manifest: `uug-input.json`.
- Przekazywane dane: miejscowość, ulica, jeśli występuje, oraz numer budynku dokładnie z listy. Bez numerów lokali, klientów, telefonów, umów, pokrycia siecią, ekip i harmonogramu. Lokalne ID służą wyłącznie połączeniu odpowiedzi i nie są wysyłane.
- Sposób: pojedyncze zapytania GetAddress, z dopasowaniem numeru `exact_number=1` i układem `srid=4326`, kolejno w umiarkowanym tempie. Bez zakładania konta, sekretów, płatnego planu, publikacji i routingu. Bez przesyłania adresów przez Firecrawl lub inne pośrednie usługi badawcze.
- Wyniki: zapis lokalny, porównanie ze źródłowym adresem oraz Geoapify, zachowanie rozbieżności i pochodzenia. Brak wyniku rejestru nie oznacza błędnego adresu użytkownika. Nie zastępujemy adresu sąsiednim numerem lub środkiem miejscowości.

Był to nowy odbiorca danych, odrębny od Geoapify. Uzyskana akceptacja obejmowała powyższy zakres. Pliki źródłowe i obecny plan pozostają bez zmian.

## Rezultat

Aktywna warstwa `uug-geocoding.json` zawiera 96 pełnych zgodności, 6 punktów budynków z odrębnie oznaczoną różnicą kodu pocztowego oraz 7 nieustalonych lokalizacji poza mapą. Nie zmieniono kodów ani nazw z listy użytkownika. Szczegóły wszystkich wejść: `UUG-REPORT.md`; surowe odpowiedzi i metadane prób: `uug-responses.json`. Aplikacja działa na lokalnej kopii i nie geokoduje ponownie przy uruchomieniu.
