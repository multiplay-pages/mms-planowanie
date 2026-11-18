# Źródła danych i licencje — mapa operacyjna MAP-06 / MAP-06.1

Stan: 18.11.2026. Dokument odpowiada na ustalenia A1 i A3 audytu przedpublikacyjnego (`evidence/2026-11-18-map061-codex/T9-AUDIT.md`).
**Nie jest opinią prawną.** Rozdziela to, co repozytorium dokumentuje, od tego, co zostało potwierdzone w publicznych źródłach, i od tego, co nadal wymaga potwierdzenia właściciela danych.
Czytano wyłącznie publiczne strony dostawców (18.11.2026); do żadnej usługi nie wysłano adresów ani współrzędnych. Dokument nie zamyka bramki A1 z audytu: wskazuje, czego strony dostawców **nie** mówią, i co musi potwierdzić właściciel.

## 1. Co jest publikowane i skąd pochodzi

| Plik / artefakt | Zawartość | Źródło | Status praw |
| --- | --- | --- | --- |
| `map05/data/*.xlsx`, `addresses.json` | 109 unikalnych adresów budynków (kolumny adresowe, część z numerami lokali), syntetyczne zlecenia `TEST-xxx` | lista użytkownika | Zgoda właściciela na publikację: `docs/DECYZJE-I-ZAKRES.md:32` („Także adresy, współrzędne i planer z tymi danymi — publicznie”), ograniczona do tego repozytorium GitHub (`:34`). **Uprawnienie do źródłowych list pozostaje deklaracją właściciela.** |
| `map05/data/uug-geocoding.json`, `UUG-SCOPE.md` | Utrwalone odpowiedzi GUGiK UUG: współrzędne, nazwy, kody, identyfikatory TERYT/SIMC/ULIC | `https://services.gugik.gov.pl/uug/` | Patrz sekcja 2. |
| `map05/data/geocoding.json`, CSV Geoapify | Wyniki Geoapify (współrzędne, dopasowanie) | Geoapify (narzędzie online, jednorazowo, 16.11.2026) | Patrz sekcja 3. |
| `map05/basemap/planner-compact.json`, `regional-roads.json.gz`, `planner-data.json.gz` | Geometria i nazwy dróg | OpenStreetMap (pliki województw Geofabrik) | ODbL 1.0, sekcja 4. |
| `map05/data/local-routes.json` | Lokalnie obliczone odległości, czasy i geometria dróg między adresami | pochodna OSM, silnik `map05/local_routing.py` | ODbL 1.0 (baza pochodna), sekcja 4. |
| Kafle wektorowe (MVT) | Generowane w przeglądarce z `planner-compact.json`; nie są zapisywane w repozytorium | pochodna OSM | ODbL 1.0, sekcja 4. |
| `map05/vendor/maplibre-gl/` | MapLibre GL JS 6.19.0 i 19 zależności | npm | BSD-3-Clause i licencje zależności; pełne teksty: `THIRD-PARTY-LICENSES.txt`, osadzone też w `planner-offline.html`. |
| Zdjęcia satelitarne | **Brak w repozytorium i w aplikacji.** Funkcja opt-in, wyłączona; testowana wyłącznie lokalną atrapą dostawcy | — | Sekcja 5. |

## 2. GUGiK UUG (geokodowanie, identyfikatory TERYT/SIMC/ULIC)

Co przeczytano (strony publiczne, 18.11.2026; tekst przeczytany, nie streszczenie z wyszukiwarki):

- Strona usługi `https://services.gugik.gov.pl/uug/` i opis `https://services.gugik.gov.pl/uug/opis.html`: **nie zawierają** licencji, warunków ponownego wykorzystania, wymogu atrybucji ani reguły o zapisywaniu i publikacji wyników. Opis podaje tylko kontakt: uslugi.iip@gugik.gov.pl.
- Regulamin Geoportalu (obowiązuje od 8.07.2024, `https://www.geoportal.gov.pl/pl/o-geoportalu/regulamin/`), § 3 pkt 2: „Publikacja materiałów z Serwisu jest dozwolona pod warunkiem umieszczenia informacji o źródle pochodzenia.” Regulamin nie wymienia UUG, geokodowania ani PRG, nie mówi o zapisie wyników i nie zawiera warunków licencyjnych. Nie wiadomo więc, czy odpowiedzi UUG są „materiałami z Serwisu”.
- Opis usługi OpenLS (`https://www.geoportal.gov.pl/pl/usluga/usluga-openls/`): bez warunków wykorzystania.

**Nie potwierdzono:** identyfikatora licencji, warunków trwałego zapisu i publicznej redystrybucji surowych odpowiedzi UUG ani pól rejestrowych TERYT/SIMC/ULIC. Jedyny odnaleziony warunek ogólny to podanie źródła. Stan: **niepotwierdzone, nie „zabronione” i nie „dozwolone”.**

Dla właściciela: (1) zapytać GUGiK (uslugi.iip@gugik.gov.pl) o warunki zapisu i publikacji odpowiedzi UUG i pól TERYT/SIMC/ULIC, odpowiedź zapisać tu z datą; (2) do czasu odpowiedzi stosować zasadę z regulaminu: informacja o źródle („Źródło: Główny Urząd Geodezji i Kartografii, usługa UUG”) jest w dokumentacji repozytorium (ten plik, `map05/data/UUG-SCOPE.md`), ale **nie w interfejsie planera** — dodać ją albo zdecydować, że dokumentacja wystarcza. Pliki są w publicznym `main` za zgodą właściciela; ta gałąź ich nie zmienia i nie dodaje nowych źródeł tego typu.

## 3. Geoapify

- Wyniki pobrał użytkownik jednorazowo przez publiczne narzędzie online (16.11.2026, bez konta i klucza); który plan/regulamin obejmuje to narzędzie — nie ustalono.
- Regulamin Geoapify (wersja 5 z 2.02.2024, `https://www.geoapify.com/term-and-conditions/`), sekcja „Attribution”: „When using the Services, you must always provide OpenStreetMap attribution.” oraz „Geoapify attribution is mandatory when using Free subscription plan.” Sekcja „Plans and usage limits”: „The commercial use of the Free-package is allowed in the development and, with some limitations, in the production phase.”
- Regulamin, FAQ cennika (`https://www.geoapify.com/pricing`) i dokumentacja Geocoding API (`https://apidocs.geoapify.com/docs/geocoding/`) **nie zawierają reguły o przechowywaniu, buforowaniu ani publikacji wyników geokodowania** (zapis „cache/store results with no limits” dotyczy innych interfejsów — Places i Batch — i nie jest tu stosowany).

Stan: **niepotwierdzone**. Pewne jest tylko to, że przy użyciu usług Geoapify wymagana jest atrybucja OpenStreetMap (a w planie Free także Geoapify). **W interfejsie planera ani w opisie mapy nie ma atrybucji Geoapify.** Do decyzji właściciela: (1) dodać atrybucję „© OpenStreetMap contributors, Geoapify” albo (2) usunąć wyniki Geoapify z publikacji, albo (3) potwierdzić warunki u dostawcy. Uwaga: `build_planner.py` wymaga, aby aktywnym źródłem współrzędnych planera był `GUGIK_UUG` (102 z 109 adresów dopasowanych); wyniki Geoapify pozostają w repozytorium jako wcześniejsza, alternatywna warstwa lokalizacji (interfejs potrafi ją pokazać). Ich usunięcie z publikacji wymagałoby osobnej, zatwierdzonej zmiany danych, której ten etap nie obejmuje.

## 4. OpenStreetMap i pochodne bazy danych (ODbL 1.0)

Mapa „plik → źródło → licencja”:

| Plik | Pochodzi z | Licencja | Atrybucja | Jak odtworzyć |
| --- | --- | --- | --- | --- |
| `basemap/planner-compact.json` | OSM (Geofabrik, województwa) | ODbL 1.0 | © OpenStreetMap contributors (metadane pliku, `basemap/README.md`, napis na mapie) | skrypty w `map05/` i `basemap/README.md` |
| `basemap/regional-roads.json.gz`, `planner-data.json.gz` | j.w. | ODbL 1.0 | j.w. | j.w. |
| `data/local-routes.json` | segmenty i geometria dróg OSM + obliczenia lokalne | ODbL 1.0 (baza pochodna) | © OpenStreetMap contributors (dodane do dokumentacji, plik nie ma własnego pola `license`) | `map05/local_routing.py`, `docs/ARCHITEKTURA.md` |
| kafle MVT w przeglądarce | j.w. | ODbL 1.0 (wynik pochodny; nie zapisywany) | napis „© OpenStreetMap” w kontrolce atrybucji MapLibre | `map05/road-tiles.mjs`, `road-tile-worker.mjs` |
| `planner-offline.html` | zawiera powyższe dane (gzip + base64) | ODbL dla danych, BSD-3-Clause i inne dla kodu — **licencje danych i kodu są odrębne** | atrybucja widoczna w mapie; pełne teksty licencji kodu osadzone w pliku | `python -X utf8 map05/build_planner.py` |

Baza pochodna pozostaje na ODbL (share-alike) także wtedy, gdy kafle powstają dopiero w przeglądarce. Dane modyfikowalne i skrypty odtwarzające są publicznie w tym repozytorium.
Uwaga: plik `local-routes.json` powinien zawierać własne pole licencji i atrybucji — to drobna zmiana metadanych, którą trzeba wprowadzić przez regenerację tego pliku w ramach osobnego, zatwierdzonego etapu (silnik tras jest chroniony).

## 5. Zdjęcia satelitarne i hybryda

Nie wdrożono żadnego dostawcy. Funkcja jest opt-in (konfiguracja, zgoda, origin dopuszczony przy starcie serwera) i była testowana wyłącznie lokalną atrapą. **Status: niewdrożone, niezweryfikowane.**

Preset „GUGiK ORTO” (WMS `PZGIK/ORTO/WMS/StandardResolution`):

- Strona Geoportalu o ortofotomapie ([Geoportal — ortofotomapa](https://www.geoportal.gov.pl/pl/dane/ortofotomapa)) według wyników wyszukiwania podaje, że dane są dostępne bezpłatnie i mogą być wykorzystywane do dowolnych celów (tej strony nie przeczytano w całości); nie znaleziono identyfikatora licencji ani warunków usługi WMS. Regulamin Geoportalu wymaga tylko informacji o źródle przy publikacji materiałów (§ 3 pkt 2).
- Do potwierdzenia przed pierwszym włączeniem: zakres wykorzystania endpointu, wymagana atrybucja (domyślnie „Ortofotomapa © GUGiK”), parametry `GetCapabilities` (układ EPSG:3857, nazwa warstwy), limity ruchu.
- Włączenie wysyła do dostawcy widoczny obszar mapy, adres IP i zwykłe metadane HTTP; nie wysyła danych planu ani adresów zleceń. Nie jest to pełna anonimowość.

## 6. Lista do potwierdzenia przez właściciela

1. Uprawnienie do publicznej redystrybucji źródłowych list adresowych (XLSX/CSV) — deklaracja właściciela.
2. Warunki GUGiK UUG dla trwałego zapisu i publikacji odpowiedzi oraz identyfikatorów TERYT/SIMC/ULIC (sekcja 2): zapytanie do GUGiK; informacja o źródle w interfejsie.
3. Geoapify: atrybucja i warunki zapisu wyników (sekcja 3) — dodać atrybucję, usunąć wyniki z publikacji albo potwierdzić warunki u dostawcy.
4. Warunki i atrybucja ORTO przed włączeniem zdjęć (sekcja 5).

Pozycje 1–3 dotyczą danych, które od wcześniejszych etapów są w publicznym `main` za zgodą właściciela; nie zostały wprowadzone przez MAP-06. Gałąź MAP-06 dodaje wyłącznie kopie tych samych danych w zrzutach ekranu i artefakcie offline.
