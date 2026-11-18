# T12 — końcowy re-audyt publikacyjny

18.11.2026, Codex CLI. **Werdykt: NO-GO dla push gałęzi i PR z ocenionego snapshotu 0600a17.** A2 zamknięte; A3 zasadniczo zamknięte dokumentacyjnie. A1 pozostaje otwarte, a nowy wynik Firefoksa ujawnia lokalną ścieżkę profilu. Nie znaleziono rzeczywistego sekretu ani nowej listy klientów. Techniczne APPROVE z T11 nie jest zmieniane przez ten werdykt publikacyjny.

## Snapshot i zakres

- HEAD: **0600a179c706423e46a83c962f9fe7132838f025**, main: **0c2a0a839d98d9c6ebeafa79276e10acec420627**. Zakres ma trzy commity: b312fa4, 0d25a5d, 0600a17. HEAD pozostał taki sam podczas kontroli.
- Drzewo HEAD i lokalnej gałęzi map06-backup-prepush jest identyczne: **c0d544e32178db123dd574997f0b156bb10c6b49**. Squash zachował finalną treść.
- Odczyt wyłącznie z Git. Świeży skan objął wszystkie nowe unikalne bloby osiągalne z main..HEAD, także wersje historyczne w tych trzech commitach: **88 blobów, w tym 74 tekstowe**. Sprawdzono wzorce sekretów, poświadczeń w URL, e-maili i lokalnych ścieżek, metadane commitów, nowe JSON, dokumenty, skrypty i PNG. To skan wzorców i ocena kontekstowa, nie gwarancja wykrycia dowolnie zakodowanego sekretu.
- Siedem PNG w nowym katalogu screenshots: sprawdzono brak tEXt/zTXt/iTXt/eXIf; obejrzano wprost bajty Git plików FF4-offline-popup.png i FF7-offline-390.png. Pozostałe obrazy nie były ponownie oceniane wizualnie. Nie wykonywano OCR wszystkich zrzutów.
- Bez sieci, testów/benchmarków, buildu, zmian kodu, commit/push ani modyfikacji historii. Jedyny zapis to ten raport. Wyniki testów/przeglądarek poniżej oznaczają kontrolę zapisanych dowodów, nie nowy przebieg.

## P2 — otwarte bramki

### P2-1: A1 nadal nie jest zamknięte przez uczciwe opisanie braku potwierdzenia

`docs/ZRODLA-DANYCH-I-LICENCJE.md:27`–`:30`, `:35`–`:38`.

Dokument poprawnie odróżnia „niepotwierdzone” od „zabronione”, wskazuje publiczne źródła i zachowuje ograniczenia ustaleń. Uczciwie przyznaje, że nie sprawdzono pełnego regulaminu i brak potwierdzenia warunków trwałego zapisu/publicznej redystrybucji UUG/TERYT/SIMC/ULIC. Lista działań właściciela jest jasna. Nie jest to jednak nowy dowód zamykający właśnie tę bramkę z T9.

Dodatkowo sekcja Geoapify podaje zgodę na pobieranie/przechowywanie i wymóg atrybucji, lecz sama potwierdza, że atrybucji w interfejsie obecnie nie ma i pozostawia wybór dodać/usunąć do decyzji właściciela. Ogólne „dozwolone wg FAQ” nie powinno być odczytywane jako potwierdzona zgoda na każdy zakres publicznej redystrybucji surowych wyników; dokument opisuje przede wszystkim przechowywanie. Dostawcy i pełnych warunków nie sprawdzałem online zgodnie z zakazem sieci.

Wniosek: **nie stwierdzam naruszenia**, lecz nie ma podstaw do zmiany A1 na zamknięte. Fakt wcześniejszej publikacji w main i zgoda właściciela listy nie rozstrzygają praw dostawców. Przed GO trzeba udokumentować właściwy zakres redystrybucji UUG oraz rozstrzygnąć i wykonać wymagane atrybucje dla zachowanych wyników Geoapify. Nie żądam ponownej ogólnej zgody na publiczne adresy: zapis `docs/DECYZJE-I-ZAKRES.md:32` pozostaje uznany.

Uwagi do precyzji źródeł, bez osobnej blokady: wzmianka o publikacji naukowej w sekcji 2 nie podaje tej konkretnej publikacji; „niezależne zestawienie” w sekcji 3 też nie ma jednoznacznego odnośnika. Usunąć te poboczne argumenty albo wskazać źródła, zamiast traktować je jako potwierdzoną podstawę prawną. Link do publicznej strony nie zastępuje odczytu właściwego regulaminu.

### P2-2: nowa lokalna ścieżka profilu Firefoksa w publicznym evidence

`evidence/2026-11-18-map061/firefox/map061-firefox-results.json:13`; producent: `scripts/firefox-bidi.mjs:140` w tym katalogu.

Pole firefox["moz:profile"] zawiera rzeczywistą ścieżkę **C:\Users\<local-user>\AppData\Local\Temp\<profile>** — w Git jest konkretna skrócona nazwa konta Windows i nazwa profilu tymczasowego. To nowe ujawnienie informacji lokalnej poza zakresem zgody na adresy sieci. W raporcie nie powielam jej literalnej wartości.

Przyczyna: skrypt zapisuje cały obiekt capabilities. Zastosować allowlistę przydatnych pól (browserName/browserVersion/platformName/headless itp.), usunąć ścieżkę profilu; opcjonalnie pominąć nieprzydatny processID. Poprawić zarówno producenta, jak i wynik. Usunąć starą wersję z **nieopublikowanej** historii zakresu, np. przez poprawienie/squash commitu evidence. Dodanie kolejnego commitu usuwającego pole nie usunie wcześniejszego bloba z pushowanego zakresu.

Nie ma potrzeby przepisywać publicznego main ani usuwać danych źródłowych. Ponowny skan publikowanego range powinien potwierdzić, że ścieżka nie jest już osiągalna.

## A2 — zamknięte: historia i rozmiary

`git rev-list --objects main..HEAD` oraz cat-file potwierdzają jeden nowy blob planner-offline.html: **32 403 512 B** (około 30,9 MiB). SHA256: **01714d630773a6065c805b21d07348b373a3a5d62ba6d434b0c8f126c4f1010f**. Nie ma trzech wcześniejszych kopii po 71 MB w tym zakresie.

Wszystkie 88 nowych blobów: **36 894 701 B** logicznie, nie rozmiar transferu po kompresji/deltach. Następne największe: vendor MapLibre JS **1 106 041 B**, worker **550 754 B**, największy nowy PNG **226 730 B** (FF4). Nie ma innej dużej ani nieoczekiwanej binarnej nowości. Ani jeden nowy blob nie przekracza progów 50/100 MiB podanych w zleceniu. Stare duże bloby pozostają osiągalne z lokalnej kopii backup, lecz nie z zakresu publikowanej gałęzi.

Publikować wyłącznie konkretną gałąź; nie używać push --all/--mirror ani nie wysyłać map06-backup-prepush. To zastrzeżenie nie zmienia pozytywnej oceny squasha.

## A3 — zasadniczo zamknięte dokumentacyjnie

Nowa sekcja 4 jawnie mapuje planner-compact, regional-roads/planner-data, local-routes, MVT i offline HTML na ODbL dla danych oraz odrębne licencje kodu. Zachowuje atrybucję i wskazuje publiczne dane modyfikowalne/pipeline. Brak własnego pola license w local-routes jest uczciwie zaznaczony jako zadanie metadanych, nie ukryty.

ORTO jest opisane jako nieaktywne, niezweryfikowane i wymagające sprawdzenia przed rzeczywistym włączeniem; testy dotyczyły atrapy. Nie ma podstaw do twierdzenia o zaakceptowanej produkcyjnej licencji dostawcy. Ta odroczona kwestia nie jest osobną blokadą publikacji nieaktywnego mechanizmu. Ustalenie A1 dotyczy innych, już utrwalonych wyników i pozostaje odrębne.

## Świeży skan sekretów/PII/metadanych

- Brak wykrytych realnych tokenów dostawców, nagłówków kluczy prywatnych lub rzeczywistych poświadczeń w URL. SECRET123 to nadal lokalny mock 127.0.0.1:8791; abc oraz review-user/review-password/u:pw dotyczą testów odrzucania na domenach .example. Nie są sekretami produkcyjnymi.
- Trafienia „OneDrive” w dawnych dokumentach i raportach są ogólnym opisem ścieżek/skanu, bez konkretnego konta. Jedyny nowy konkretny profil lokalny jest opisany w P2-2.
- Autor i committer wszystkich trzech commitów są tacy sami jak main, wraz z tym samym jawnym adresem Gmail. To istniejące metadane publiczne, nie nowy e-mail klienta ani sekret. Kopia tego adresu w raporcie T9 nie zmienia pochodzenia.
- Obejrzane FF4/FF7 pokazują te same rzeczywiste adresy, także numery lokali, oraz syntetyczne TEST-xxx, daty, ekipy i gotowość. Nie zaobserwowano nowych nazwisk/telefonów/e-maili klientów ani autentycznych numerów zamówień. To kolejne kopie zbioru już publicznego za zgodą właściciela, a nie anonimowe albo w całości sztuczne dane.
- Źródłowe adresy, geokodowanie i dane tras nie dostały nowego zestawu wpisów w tej gałęzi. Wcześniejszy audyt całego main pozostaje punktem odniesienia; nowy skan dotyczył świeżego zakresu po squashu i jego historii, nie wszystkich dowolnych lokalnych refs.

## Zgodność evidence z README

### Wyniki liczbowe potwierdzone

Przeliczono niezależnie mediany i min–max wszystkich miar tabeli README z sześciu perf/*.json. Wartości się zgadzają, w tym:

- planer widoczny: **1878 → 1169 ms**; pierwszy warunek gotowości mapy: **3743 → 3280 ms**;
- najgorsza klatka wycieczki: mediany **439 → 51 ms**, zakres PO **48–407**;
- suma long tasks podczas wycieczki: **1086 → 0 ms**;
- interakcje: mediany **17 → 18 ms**, maksima **239 → 352 ms**;
- najwyższa z czterech próbek main heap: **494 → 270 MB**, końcowa **494 → 104 MB**;
- pamięć procesów: start **726 → 823 MB**, po wycieczce **1006 → 1124 MB**, koniec **1301 → 888 MB**;
- łączne long tasks: mediany **31/5249 → 16/2084** (liczba/suma ms).

We wszystkich sześciu wynikach perf pageErrors i timedOut interakcji są puste. Nie odtwarzałem pomiarów ani nie potwierdzam niezależnie kolejności uruchomień/warunków cache; JSON-y same nie zapisują porządku całej serii.

Zapisane zestawy:

| Dowód | PASS | Inne statusy |
| --- | --- | --- |
| Chrome M — served / offline | 14 / 13 | 0 |
| Chrome SVG — served / offline | 10 / 10 | 0 |
| Chrome W1–W4 | 4 | 0 |
| Chrome touch — served / offline | 5 / 5 | 0 |
| Firefox | 9 | 0 |

Chrome M ma puste external/failed/blobFailed/console/pageErrors; served obejmuje 98 zdarzeń i 4 kafle mocka, offline 7 zdarzeń i 0 kafli. Firefox capabilities potwierdzają wersję 160.0.1 i headless. Ograniczenia „Firefox bez benchmarku”, „dotyk symulowany”, „brak Safari/urządzenia fizycznego/czytnika” i „satelita tylko atrapą” są uczciwie wskazane. Wcześniejszy nieudany przebieg Firefoksa i przypisanie jego przyczyn skryptowi są relacją autora; nie ma tutaj pełnego pierwotnego logu pozwalającego mi to niezależnie odtworzyć.

### P3 — twierdzenia do doprecyzowania

1. **README:19 — „bajt w bajt identyczne” jest fałszywe.** Basemap po dekompresji: 28 677 048 B, plik źródłowy: 28 677 049 B; routes: 40 630 910 B wobec 40 630 912 B. Porównanie sparsowanych JSON jest równe. Test_delivery również porównuje obiekty json.loads, a W4 tylko liczniki/status. Zmienić na „identyczne semantycznie po parsowaniu JSON”; nie ma tu wykazanego uszkodzenia danych ani ID.
2. **README:30 — „zero danych sztucznych” jest mylące.** Adresy i geometria są rzeczywiste; zlecenia, ekipy, gotowość, wiek kolejki i normy pozostają syntetyczne. Zawęzić zdanie do rzeczywistych adresów/podkładu/tras.
3. **README:30 — „sieć wyłączona” nie jest wykazane dla perf.** Commitowany map061-perf.mjs nie wywołuje ctx.setOffline ani równoważnego blokowania sieci. Strict CSP ogranicza sieć aplikacji i plik jest lokalny; to inny dowód niż navigator.onLine=false/tryb offline przeglądarki. Warianty M/W są osobno uruchamiane z setOffline. Poprawić opis perf albo dołączyć dowód odpowiedniej konfiguracji.
4. **README:63 / VERIFICATION:11 — deklaracja 246 PASS nie ma świeżego logu testów w repo.** Arytmetyka 140+82+24 jest poprawna i liczba zgadza się ze zmianami testów, ale w dostępnych *.txt/*.log nie ma wyniku „tests/pass 140”; ostatni zapisany javascript-tests.txt w evidence/2026-11-17-map06/tests ma 125. Moje ostatnie uruchomienie T10 miało 137; T11 był tylko odczytem i wyraźnie nie potwierdzał nowego przebiegu 140. Dołączyć log odpowiadający finalnemu kodowi albo oznaczyć wynik jako deklarowany przez wykonawcę, nie udokumentowany załączonym logiem. T12 nie uruchamiał testów.
5. **README:54 — przyczyna klatki 407 ms pozostaje hipotezą.** Brak long task w obserwowanym głównym wątku nie wyklucza pracy JS w workerze ani innych kosztów renderowania. Wskazane GPU/kompozytor są prawidłowo nazwane podejrzeniem; usunąć kategoryczne wykluczenie całej pracy JS strony i pozostawić „nie zarejestrowano long task głównego wątku; przyczyna nieustalona”.

Pozytywnie: zakres 48–407 jest pokazany; brak poprawy interakcji i wzrost pamięci procesów na starcie/po wycieczce są wyeksponowane. „Szczyt heap” ma zastrzeżenie o czterech próbkach, a latencja interakcji o stanie logicznym zamiast gotowej klatki. Nie ma podstaw zarzucać ukrycia tych konkretnych ograniczeń.

## Co jest potrzebne do GO

1. Zamknąć P2-1/A1 odpowiednim dowodem warunków redystrybucji i rozstrzygnięciem wymaganych atrybucji. Nie przedstawiać samej listy otwartych spraw jako pozytywnego audytu tych praw.
2. Usunąć lokalną ścieżkę Firefoksa z wyniku, producenta i całego nieopublikowanego range (P2-2).
3. Poprawić P3 w README i dołączyć aktualny dowód testów lub uczciwie oznaczyć brak logu. Po poprawkach wskazać nowy immutable commit do krótkiej kontroli.

Nie wykonywałem ani nie autoryzuję publikacji. Ocena dotyczy push konkretnej gałęzi i PR bez merge; nie jest formalną opinią prawną ani oceną gotowości produkcyjnej.
