# MMS Planowanie 2.0

Lokalny prototyp pracy koordynatora: kolejka zleceń do umówienia, dostępność ekip i slotów, generowanie koszyków na dzień, ręczna korekta, ochrona terminu oraz interaktywna mapa z lokalnymi obliczeniami dróg.

Aktualny planer korzysta ze 109 rzeczywistych adresów przekazanych przez użytkownika. Zlecenia, ekipy, gotowość i normy obsługi są syntetyczne. To narzędzie do testowania procesu, bez połączenia z produkcyjnym MMS.

## Uruchomienie

Otwórz **[map05/planner-offline.html](map05/planner-offline.html)** w zwykłej przeglądarce. To samowystarczalny plik z danymi i kodem, około 69,5 MB, działający bez sieci. **`map05/offline.html` jest starszym demonstratorem 19 syntetycznych zleceń.**

Wersja modułowa:

```text
python -X utf8 map05/serve.py
```

Następnie `http://127.0.0.1:8765`. Serwer działa tylko lokalnie, ma whitelistę plików i nie przyjmuje zapisów.

## Obecny zakres

- Niezależna od dnia kolejka, filtry, generowanie propozycji i powody pozostawienia zleceń.
- Zmiana dostępności konkretnej ekipy; wspólny zasób instalacji/pomiarów i sąsiednie sloty.
- Ręczne przeniesienie/usunięcie, ochrona korekt i potwierdzeń, cofanie oraz zapis/import JSON.
- 102 pozycje: 96 pełnych dopasowań GUGiK i 6 oznaczonych różnic kodu pocztowego. 7 punktów pozostawiono bez pozycji na polecenie użytkownika.
- Regionalny podkład 322 452 dróg, pan/zoom, skala ulic, wybór punktu i widok koszyka.
- Drogi obliczane wyłącznie lokalnie. Znane robocze limity 30 km, wspólnego +10 km i pracy z dojazdem w oknie są sprawdzane przy nowych propozycjach; kontrolowany jest także koszyk źródłowy po przeniesieniu.

Czasy są szacunkowe, bez bieżącego ruchu. Pierwszy dojazd, powrót, wjazd na posesję i manewry nie są potwierdzone. W konserwatywnym grafie 3 punkty mają niepewność dostępu/połączenia; brak nie staje się 0 km. To nie jest silnik nawigacyjny ani zatwierdzony planer operacyjny.

## Dokumentacja dla Aion UI, Claude Code i Codexa

Zacznij od **[przekazania do Aion UI](docs/PRZEKAZANIE-AION-UI.md)**. Dalej:

- [Szczegółowa historia wszystkich etapów](docs/HISTORIA-PRAC.md).
- [Obowiązujące decyzje i zgody użytkownika](docs/DECYZJE-I-ZAKRES.md).
- [Architektura, modele i algorytm](docs/ARCHITEKTURA.md).
- [Uruchomienie, testy i odtwarzanie danych](docs/URUCHOMIENIE-I-TESTY.md).
- [Aktualne wyniki weryfikacji i ograniczenia dowodów](map05/VERIFICATION.md).
- [Pełny indeks dokumentacji](docs/README.md).

## Sprawdzenia

Po przygotowaniu środowiska według runbooka:

```text
python -X utf8 map05/prepare_assets.py
cd map05
npm test
npm run build
cd ..
python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v
python -X utf8 -m unittest discover -s map04/tests -v
```

Stan 17.11.2026 (etap Aion UI): **190/190 testów PASS** (86 JavaScript, 80 Python MAP-05, 24 Python MAP-04), build oraz kontrola składni/CSP/hashy poprawne. **10/10 scenariuszy runbooka PASS w prawdziwym Chrome 157** dla widoku modułowego i `planner-offline.html`; dowody, zrzuty i usterki naprawione w tym etapie: [evidence/2026-11-17-browser](evidence/2026-11-17-browser/README.md). Inne przeglądarki, dotyk i czytnik ekranu nie były testowane.

## Dane i publikacja

Repozytorium jest publiczne. Użytkownik wyraźnie zaakceptował publikację adresów, współrzędnych i planera wraz z kodem oraz szczegółową dokumentacją. Zgoda ta nie obejmuje nowych usług zewnętrznego routingu; użytkownik wybrał metodę lokalną.

Duże przetworzone publiczne wejścia OSM są zapisane bezstratnie jako gzip z manifestem hashy. `prepare_assets.py` odtwarza je lokalnie bez pobierania. PBF i checkpointy są pomijanymi plikami roboczymi, a nie wymaganiami uruchomienia aplikacji. Dane OSM mają atrybucję i licencję ODbL; dla pozostałego kodu nie dodawano arbitralnie nowej licencji.

Oryginalne źródła XLSX/CSV i fixture MAP-04 zachowano. Nie zmieniano Notion, produkcyjnego MMS, uprawnień, nie uruchamiano GitHub Pages ani wdrożenia produkcyjnego.
