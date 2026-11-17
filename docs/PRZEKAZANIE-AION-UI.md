# Przekazanie do Aion UI: Claude Code i Codex

Stan: 17.11.2026. To plik startowy następnego etapu. Nie odtwarzaj projektu od zera i nie powtarzaj geokodowania ani pobierania map, jeśli zapisany stan jest zgodny.

## Najpierw przeczytaj

`AGENTS.md`, ten plik, `docs/DECYZJE-I-ZAKRES.md`, `docs/ARCHITEKTURA.md` oraz najnowszą sekcję `map05/VERIFICATION.md`. Dłuższa historia jest w `docs/HISTORIA-PRAC.md`; pierwotny brief jest historyczny i ma późniejsze rozszerzenia/odmowy.

Sprawdź `git status --short`, `git log -5 --oneline` i `git remote -v`. Właściwy projekt to `multiplay-pages/mms-planowanie`, domyślnie `main`. Repozytorium jest publiczne; użytkownik wyraźnie zaakceptował także publikację dostarczonych adresów, współrzędnych i planera. Nie traktuj tej zgody jako upoważnienia do nowych usług zewnętrznego routingu lub produkcyjnego MMS.

## Co już istnieje

- Lokalny proces: niezależna kolejka, filtrowanie, dostępność ekip/slotów, generowanie na dzień, ręczne przeniesienie/usunięcie, ochrona ręcznych zmian i potwierdzeń, powód zwolnienia, cofanie i JSON.
- 110 wierszy źródłowych → 109 unikalnych adresów / 80 miejscowości; duplikat zachowany w raporcie i źródłowych odwołaniach.
- 102 pozycje GUGiK: 96 pełnych zgodności i 6 osobnych uwag kodu pocztowego. 7 punktów pozostaje bez pozycji na wyraźne polecenie użytkownika.
- Regionalny podkład 322 452 rzeczywistych dróg, z kompaktowym źródłem i poziomem szczegółu zależnym od widoku; wybór adresu przechodzi do skali ulic.
- Lokalny graf i komplet rozliczonych par. 101 snapów w progu, 9 702 dostępne skierowane pary między różnymi punktami. Braki nie są 0 km i nie są rysowane jako proste.
- Generator/ręczna korekta sprawdzają znane 30 km, wspólne +10 km oraz czas pracy z dojazdem. Transakcja uwzględnia również stary koszyk po przeniesieniu/usunięciu/regeneracji.
- Stare plany v1 zachowują ID/datasetId. Nie są usuwane po dodaniu nowej warstwy; wykryte ryzyka są widoczne.
- Aktualny `map05/planner-offline.html` i opcjonalny modułowy serwer loopback. Starszy `map05/offline.html` pozostaje demonstratorem 19 syntetycznych zleceń.
- Testy parserów, danych, zasobów, grafu, reguł, UI w pamięci, rzeczywistych ścieżek, handlera i CSP. Aktualne liczby bierz z raportu weryfikacji, nie ze starych wpisów w historii.

## Tego nie wolno zgubić

1. Nie zmieniaj źródłowych XLSX/CSV ani fixture MAP-04 przy okazji poprawki UI.
2. `datasetId` to hash XLSX; `TEST-*` są stabilne. Zmiana ID wymaga świadomej migracji, inaczej niszczy istniejące plany.
3. Użytkownik potwierdził poprawność adresów w QGIS. Nie sprawdzaj ich tam ponownie i nie pobieraj pozycji pozostałych 7 — wybrał pozostawienie bez pozycji.
4. Nie wysyłaj współrzędnych do OSRM/ORS ani innego dostawcy. Nie wykonano takiego routingu; działa lokalny snapshot.
5. Nie używaj prostej odległości jako wyniku drogowego. Nie nazywaj syntetycznych norm/reguł zatwierdzonymi operacyjnie.
6. Nie poprawiaj kodu źródłowego adresu pod odpowiedź geokodera. Zachowaj pochodzenie i uwagi.
7. Import legacy planu ma pozostać możliwy; nowe ryzyko nie upoważnia do cichego usunięcia rezerwacji.
8. Ręczna korekta i generator muszą sprawdzać wszystkie dotknięte koszyki. Test regresji A→B 20 km, B→C 20 km, A→C 40 km nie może wrócić na czerwono.
9. Bez MMS API, kontaktu z klientami, publikacji w nowym serwisie i zmian uprawnień bez właściwego polecenia.
10. Nie przekazuj agentom sekretów ani pełnych zrzutów konfiguracji. Narzędzia wykrywaj w bieżącym Aion UI; dostępność z poprzedniej sesji Codexa nie jest dowodem aktualnej dostępności.

## Pierwszy przebieg w nowym środowisku

```text
git status --short
python -X utf8 map05/prepare_assets.py
```

Jeśli potrzebne, przygotuj środowisko według `URUCHOMIENIE-I-TESTY.md`. Użyj gotowego artefaktu albo `python -X utf8 map05/serve.py`. Nie uruchamiaj downloaderów z `--execute` jako części preflightu. Sprawdź, czy Node/Python są rzeczywiście dostępne i czy używasz właściwego folderu.

Pełne testy i build:

```text
cd map05
npm test
npm run build
cd ..
python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v
python -X utf8 -m unittest discover -s map04/tests -v
```

Jeżeli nie zmieniono kodu/danych i istnieje dowód dokładnie tego commitu, nie powtarzaj kosztownego przeliczania dróg. Jeśli zmienia się silnik Python, hash warstwy wymaga nowego `build_local_routes.py`. Zmiana CSS/JS wymaga builda HTML i adekwatnych testów, nie nowego geokodowania.

## Proponowany podział Claude Code / Codex

To sposób pracy do przyjęcia w Aion UI, nie deklaracja, że oba narzędzia są już połączone lub skonfigurowane.

- Jeden agent prowadzi zadanie, wybiera zakres, utrzymuje plan/ledger i jako jedyny scala/publikuje zmiany.
- Jeden wykonawca jest właścicielem konkretnego zestawu plików oraz odpowiadających im testów. Drugi może niezależnie przeglądać wynik tylko do odczytu.
- Przy dwóch niezależnych implementacjach wydziel rozłączne pliki lub osobne worktree/gałęzie. Nie edytujcie jednocześnie `planner-model.mjs`, buildera i wygenerowanych artefaktów.
- Każde przekazanie zawiera: cel, commit bazowy, dozwolone pliki, kontrakty wejścia/wyjścia, kryteria, polecenia testów i otwarte kwestie. Nie przekazuj całego transcriptu zamiast zwięzłego stanu.
- Odbiór obejmuje rzeczywiste wyniki poleceń, listę plików, ryzyka i niezależny review. Nie nazywaj zielonego testu jednostkowego wizualną weryfikacją.
- Na końcu jedna osoba/agent sprawdza pełny diff, źródła/hashe, build i stan gałęzi. Push bez force i bez równoległych zapisów do tej samej gałęzi.

## Najbliższy właściwy etap

Pierwszym otwartym dowodem jest prawdziwy test wizualny/interakcyjny w dozwolonym środowisku desktop i wąsko. W poprzedniej sesji konkretne Browser Use odrzuciło lokalne pliki i zabroniło obejść. To nie jest stały zakaz testów w nowym Aion UI; sprawdź jego aktualne narzędzia i zasady. Jeśli są dozwolone, użyj ich normalnie. Jeśli odmówią, nie próbuj raw CDP/innego renderera jako obejścia.

Do testu użyj aktualnego `planner-offline.html` albo modułowego widoku, a nie starszego `offline.html`. Przejdź checklistę 10 scenariuszy w runbooku, zapisz screenshoty i błędy konsoli/żądania wraz z SHA. Szczególnie sprawdź wydajność dużej regionalnej mapy, etykiety, mobile, klawiaturę i realne pobranie/import JSON.

Następne możliwe zadania, wymagające świadomego doboru zakresu:

1. Wyjaśnienie trzech niepewnych dojazdów w lokalnym grafie; nie zmieniać adresów i nie rozluźniać zakazów tylko dla pełnej liczby zielonych wyników.
2. Parametry startu/końca ekip, rzeczywiste normy i regiony, jeśli użytkownik je dostarczy. Nie wymyślać baz ekip ani powrotów.
3. Pełniejszy profil pojazdu/warunków/via-way, z nowymi kontrolowanymi testami i nowym snapshotem. Obecny silnik jest planistyczny, nie nawigacyjny.
4. Optymalizacja grupowania dopiero po ustaleniu celu: np. większa liczba zleceń, mniej dojazdu, priorytet wieku. Obecna heurystyka nie obiecuje optimum.
5. Integracja MMS albo wdrożenie wymaga osobnego zlecenia i kontraktów. Sam publiczny GitHub nie oznacza gotowości produkcyjnej.

## Stan, który powinien wrócić po kolejnym etapie

Zaktualizuj `map05/VERIFICATION.md`, ten handoff i odpowiedni dokument architektury/zakresu. Podaj commit, co wykonano, czego nie wykonano, dokładne testy i realny dowód UI. Rozróżniaj rezultat funkcjonalny, ograniczenia danych wybrane przez użytkownika i ograniczenia narzędzi. Nie otwieraj ponownie rozstrzygniętych zgód i nie deklaruj zakończenia całego celu na podstawie samego zamknięcia jednego etapu.
