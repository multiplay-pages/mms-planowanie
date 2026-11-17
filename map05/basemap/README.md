# Lokalny podkład OpenStreetMap

## Aktualny planer — regionalny OSM/Geofabrik

Nowy planer korzysta z `planner-compact.json`: 322 452 dróg z publicznych plików Opolskiego, Śląskiego, Dolnośląskiego i Wielkopolskiego, przyciętych do stałego prostokąta `[17.2,49.9,19.0,51.5]`. Pobranie publicznych plików nie zawierało punktów zleceń. Manifest plików i SHA256: `public-pbf/sources.json`; źródło/licencja są też osadzone w danych.

`download_pbf.py` pobiera tylko po jawnej fladze, `osm_pbf.py` strumieniowo dekoduje, `extract_pbf.py` zachowuje topologię i kontrole dla grafu, a `compact_map.py` kompresuje wyłącznie prezentację. `planner-data.json` ma pełną geometrię około 83,5 MB; wariant kompaktowy około 28,7 MB i wszystkie nazwy/ID. Nie jest to zmiana punktów adresowych ani geometria trasy. Wyniki przejazdów powstają osobno w lokalnym grafie.

Duże przetworzone wejścia `regional-roads.json` i `planner-data.json` są w repo jako `.json.gz` z `assets-manifest.json`. `python -X utf8 map05/prepare_assets.py` odtwarza dokładne bajty bez sieci. Publiczne PBF są cache i nie są potrzebne do używania gotowego planera. Szczegóły pipeline'u, założeń samochodowych i ograniczeń: `../../docs/ARCHITEKTURA.md`.

## Historyczny podkład starszego demonstratora OPO/KNU

`data.json` to niewielki, statyczny wycinek geometrii OSM: ulice i drogi leśne, woda, tereny zielone, linie kolejowe. Nie zawiera tras pomiędzy zleceniami ani wyników routingu. Do makiety włączany jest w całości, więc podczas używania aplikacji nie ma żądań o mapę ani przekazywania współrzędnych zleceń.

Źródło: osiem zapytań `GET /api/0.6/map?bbox=…` do `api.openstreetmap.org`. Dokładne URL-e, granice i czas pobrania są zapisane w `data.json`. Zachowano identyfikatory obiektów mapy, ich nazwę, klasę oraz współrzędne. Metadane autorów, dane kontaktowe, budynki i niepotrzebne tagi są odrzucane. Podkład jest uproszczony i nie służy nawigacji.

**© OpenStreetMap contributors. Dane pochodne udostępnione na [Open Database License 1.0 (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/). [Informacja o prawach OSM](https://www.openstreetmap.org/copyright).** Atrybucja i odnośnik do licencji są również stale widoczne przy mapie.

OPO: 2 515 obiektów drogowych, 101 wodnych, 1 176 terenów zielonych i 316 kolejowych. KNU: 82 obiekty drogowe (głównie drogi leśne), 27 wodnych, 2 tereny zielone, 1 kolejowy. Widok pokazuje obszar rzeczywistych współrzędnych syntetycznego fixture, a nie gwarantowane granice administracyjne Opola lub Knurowa. Nie przesuwano punktów fixture.

Rzutowanie Web Mercator jest wspólne dla tła i znaczników; skala pozostaje jednakowa w obu osiach. Widok zawsze obejmuje wszystkie zlokalizowane punkty danego regionu, także gdy filtr lub dzień ukrywa część zleceń. Brak współrzędnych nie tworzy zastępczego markera.

`download_osm.py` dokumentuje i odtwarza pobranie. To narzędzie dla wykonawcy, uruchamiane wyłącznie ręcznie, nie przez aplikację ani testy. Zapisuje małe wycinki pośrednie jako checkpoint, a następnie scala je do `data.json`. Ponowienie nie jest potrzebne do używania makiety. OSM może odmówić zbyt dużego pobrania albo być niedostępny. Pierwotne próby Overpass były niedostępne; aplikacja nie korzysta z tego endpointu.
