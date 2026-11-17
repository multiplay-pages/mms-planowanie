# Proponowane ustalenie lokalizacji 109 budynków

Stan na 16.11.2026: **odebrano i sprawdzono CSV obejmujący 109 wyników**. Użytkownik zapisał go jako `geocoded_by_geoapify-16.11.2026, 16_49_56.csv`. Automatyczna kontrola zgodności budynku, miejscowości, kodu, ulicy i confidence zakwalifikowała **46 dopasowań** do mapy, a **63 wyniki** pozostawiła do weryfikacji. Źródło i kandydatów zachowano, bez ponownego wysyłania listy.

Wykonano jednorazowo przez własny interfejs Geoapify: https://www.geoapify.com/tools/geocoding-online/ . Narzędzie obsługuje do 500 wierszy bez zakładania konta; ustalono kraj Poland i język Polish. Wgrano wyłącznie `geocoding-input.csv`, jednokolumnowy odpowiednik zaakceptowanego JSON z identycznymi 109 adresami budynków. Źródłowy XLSX i wewnętrzne mapowanie pozostały lokalnie. Narzędzie wykonuje zapytania kolejno, zamiast proponowanego wcześniej pojedynczego wywołania Batch API. Nie tworzono konta, klucza ani płatnego planu; nie odczytywano sekretów. Nie uruchamiano drugiej partii ani innego dostawcy.

## Pierwotna propozycja — Batch API (nieużyta)

Geoapify, jednorazowe geokodowanie listy przez Batch Geocoding API. Oficjalna dokumentacja obsługuje do 1000 adresów w jednym zadaniu, wynik ze współrzędnymi i informacją o dopasowaniu. Potrzebne jest konto i klucz API dostawcy; nie zakładano konta i nie uruchamiano płatności.

Dokumentacja: https://apidocs.geoapify.com/docs/geocoding/batch/
Ocena dopasowania: https://apidocs.geoapify.com/docs/geocoding/#about-confidence
Prywatność: https://www.geoapify.com/privacy-policy/
Sprawdzono: 16.11.2026.

## Dokładny zakres

Plik `geocoding-input.json` zawiera 109 tekstowych adresów budynków. Każdy wpis obejmuje wyłącznie kod pocztowy, miejscowość, ulicę (jeżeli podano), numer budynku oraz kraj Polska. Numer lokalu jest pominięty — celem jest lokalizacja budynku. Duplikat z XLSX nie jest wysyłany drugi raz.

Nie przekazujemy pliku XLSX, nazwisk, telefonów, numerów umów, identyfikatorów wewnętrznych, statusu pokrycia siecią, typów zleceń, ekip ani harmonogramu. Lokalny `geocoding-correspondence.json` pozwala połączyć kolejność wyników z naszymi ID; nie jest częścią proponowanego żądania. Nie publikujemy wyniku ani listy.

Proponowane wywołanie: pojedynczy POST do `https://api.geoapify.com/v1/batch/geocode/search`, z parametrami języka `pl`, ograniczeniem kraju `countrycode:pl` oraz kluczem API przekazanym bez zapisywania go w plikach projektu. Następnie pobranie wyniku tego samego zadania. Bez automatycznej wysyłki do innych dostawców i bez dodatkowego routingu.

## Co dzieje się u dostawcy

Według polityki Geoapify serwery usługi są w centrach danych UE. Dostawca zapisuje m.in. treść żądania, nagłówki, adres IP i czas; dla udanych żądań podaje ogólną retencję zwykle nie dłuższą niż 24 godziny. Korzysta także z zewnętrznych usług infrastruktury, m.in. Cloudflare i Hetzner. Nie należy utożsamiać tego z brakiem zapisu adresów. Osobnego czasu przechowywania artefaktów zadania batch nie potwierdzono w dokumentacji; przy wymaganiu gwarantowanego usunięcia trzeba to uzgodnić z dostawcą.

## Kontrola wyników

Zachować źródło, dopasowany adres, poziom i confidence oraz pierwotną treść wejściową lokalnie. Sprawdzić miejscowość, kod i numer budynku. Wynik na poziomie miejscowości lub ulicy nie jest zweryfikowaną lokalizacją budynku. Wyniki niejednoznaczne pozostawić do ręcznej weryfikacji; nie zastępować ich środkiem miasta. Geokodowanie nie dowodzi pokrycia siecią ani spełnienia limitów drogowych.

## Akceptacja i dalszy stan

Użytkownik odpowiedział „Akceptuję zakres Geoapify” na pytanie o jednorazowe przekazanie 109 adresów budynków bez lokali i danych zleceń. Przekazanie wykonano przez narzędzie online tej samej usługi, bez potrzeby dostępu do konta/API. Strona potwierdziła zakończenie przetwarzania. Następnie odebrano rzeczywisty CSV i sprawdzono wszystkie wejścia po `original_address` — 109 unikalnych wyników, bez braków i obcych adresów.

Próba odbioru eksportu przez standardowe zdarzenie pobierania zakończyła się timeoutem; użytkownik zapisał CSV i wskazał jego ścieżkę. Nie zmieniano ustawień pobierania ani zabezpieczeń. SHA256 CSV: `06b5df049f5aaf2b058cbc6686d503ac64a569b1c6930f9731950aa97b288ae0`; plik pozostał bez zmian. Wyniki, reguły i pełna lista do weryfikacji: `GEOCODING-REPORT.md`. Licznik 109/109 nie był traktowany jako dowód 109 prawidłowych lokalizacji.
