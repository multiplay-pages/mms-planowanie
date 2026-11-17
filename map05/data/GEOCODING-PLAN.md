# Włączenie wyniku Geoapify — plan kontynuacji

Cel: wykorzystać zaakceptowane jednorazowe geokodowanie 109 budynków w lokalnym planerze, bez zmiany XLSX, identyfikatorów adresów i istniejącego planu użytkownika.

Źródło zgody i zakres: `GEOCODING-SCOPE.md`. Model i UI pozostają modułami bez nowych zależności. Wszystkie dalsze operacje na wynikach są lokalne; bez drugiego wysyłania adresów i bez routingu.

- [x] Przygotować minimalny CSV z tych samych 109 tekstów co zaakceptowany JSON; bez lokali, ID, pokrycia siecią i zleceń.
- [x] Wykonać geokodowanie w Geoapify z krajem Polska i językiem polskim. Wynik UI: 109/109 przetworzonych.
- [x] Odebrać rzeczywisty CSV i odczytać nagłówki: 109 wierszy, pole `original_address` i komplet wymaganych kolumn.
- [x] Dodać testy parsera: niepełna partia, podmieniony lub powtórzony adres wejściowy, nieprawidłowe liczby, punkt poza Polską, niski poziom dopasowania, różny budynek/kod/miejscowość. Nie dopasowywać po samej kolejności.
- [x] Dodać importer lokalny z atomowym zapisem: zachować pełne pochodzenie i wynik kandydujący; tylko zgodne dopasowania budynku umieścić na mapie. Pozostałe pozostawić w raporcie do weryfikacji, bez zastępowania środkiem miejscowości.
- [x] Zachować `datasetId` i ID zleceń; potwierdzono zgodność poprzednich planów z warstwą współrzędnych. Ponowny odczyt XLSX zachowuje `geocoding.json` bitowo.
- [x] Zastąpić stałe teksty statusem konkretnego adresu. Markery, filtry i zakres wybranego koszyka są zsynchronizowane. Podkład lokalny nadal ograniczony do Opola i jawnie opisany.
- [x] Testy, regresja i build: 88/88 PASS; kontrola CSP/składni i niezmienności źródła PASS. Wynik: 46 dopasowanych budynków / 63 do weryfikacji; 0 brakujących rekordów wejścia.

Ryzyka: nazwy miejscowości mogą być niejednoznaczne, 38 adresów nie ma ulicy, wysoki confidence nie stanowi niezależnej weryfikacji budynku ani pokrycia siecią. Nie oceniamy dróg, 30 km/+10 km ani czasu przejazdu.
