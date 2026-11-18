# T10 — niezależny review MAP-06.1

18.11.2026, Codex CLI. Oceniony commit **864b5e41a4f0a49da93b9950b76ea1b2d3c17aaf**, gałąź map06-interactive-map. **Werdykt: CHANGES REQUESTED.** Dwa potwierdzone P2 dotyczą cyklu życia workera i anulowań. Nie stwierdzono P1. Wynik nie zastępuje odrębnej bramki publikacyjnej T9.

Tylko odczyt kodu/testów; jedyny zapis to ten raport. Bez sieci, buildu, commit/push i własnego Chrome. Kod czytano z Git; reprodukcje modułów wykonano, gdy śledzone pliki odpowiadały temu commitowi. Równoległy nieśledzony dokument licencyjny lidera nie był częścią review. Skrypty pomiarowe przeczytano w dozwolonym katalogu mms-e2e; nie uruchamiano ich.

## Niezależna weryfikacja

| Polecenie | Wynik |
| --- | --- |
| npm test w map05 | **137/137 PASS**, 0 FAIL, 0 skipped, exit 0; 29,43 s |
| python -X utf8 -m unittest discover -s map05/tests -p test_*.py -v | **82/82 PASS**, exit 0; 19,91 s |
| python -X utf8 -m unittest discover -s map04/tests -v | **24/24 PASS**, exit 0; 0,002 s |

Razem **243/243 PASS**. Python z PYTHONDONTWRITEBYTECODE=1. Zielone testy nie obejmują poniższych wyścigów.

Osobno odczytano artefakt commitu, bez budowania: **32 402 754 B**. Po gzip/base64 oba bloki są semantycznie identyczne z odpowiednimi JSON źródłowymi. basemap-data ma **17 834 728 znaków base64**, routing-data **12 508 188**. Hashe obu bloków i road-tile-worker-source zgadzają się z CSP. Inline worker nie ma składni import/export. Powtórzenie gzip z mtime=0 dla identycznego UTF-8 daje identyczne bajty w tym środowisku; nie deklaruję identyczności między dowolnymi wersjami zlib/Python/platformami.

## Potwierdzone ustalenia

### W1 — P2: awaria workera po ready nie przełącza na SVG i dopuszcza nierozstrzygane nowe żądania

`map05/road-tile-client.mjs:16`–`:24`, `:31`–`:38`; `map05/planner.mjs:342`.

onerror i komunikat error odrzucają ready oraz aktualne pending, ale nie zachowują stanu terminalnej awarii i nie blokują kolejnych tile(). Po wcześniejszym ready Promise jest już spełnione, więc jego reject niczego nie zmienia; planner słucha wyłącznie tiles.ready.catch. Późniejsza awaria nie jest zatem sygnałem do disableOperationalMap. Jeśli worker po awarii nie odpowiada, następne żądania pozostają w pending, zamiast odrzucić się i uruchomić fallback.

Minimalna reprodukcja rzeczywistego klienta z kontrolowanym transportem workera, bez sieci:

```js
const worker={sent:[],postMessage(m){this.sent.push(m);}};
const client=createWorkerRoadTiles(worker,{kind:'url',url:'local'});
worker.onmessage({data:{type:'ready',roads:0}});
await client.ready;
worker.onerror({message:'worker crashed after ready'});
const p=client.tile(5,1,1);
```

Po przejściu mikrozadań/20 ms: **state=pending, client.pending=1, ostatni wysłany komunikat=tile**. Atrapa reprezentuje terminalną awarię, po której brak odpowiedzi; nie twierdzę, że każdy wyjątek w każdej przeglądarce zawsze zabija worker. Potwierdzony jest brak trwałego stanu awarii i brak powiadomienia plannera po ready. Reprodukcję zakończono destroy(), aby posprzątać oczekujące Promise.

Oczekiwane: po terminalnym błędzie wszystkie aktualne i przyszłe tile są odrzucane; planner raz niszczy view/worker i ładuje SVG, pozostawiając plan bez zmian. Poprawka: osobny kanał fatal/error obejmujący cały czas życia, terminalny błąd klienta, cleanup listeners/pending. Odrzucenie ready wystarcza tylko przy inicjalizacji. Testy: ready → error → nowy tile, pending podczas błędu, przejście na SVG po już działającej mapie. Dodatkowo warto rozstrzygać ready przy destroy przed zakończeniem init.

### W2 — P2: spóźnione cancel zostają w Set na zawsze

`map05/road-tile-worker.mjs:13`, `:19`–`:20`, `:40`; współdziałanie z `road-tile-client.mjs:37`.

Usługa bezwarunkowo dodaje id do cancelled. Usuwa je tylko podczas pobrania tego samego id z kolejki. Jeżeli kafel został już obliczony, a odpowiedź jest jeszcze w drodze do wątku głównego, klient może prawidłowo anulować pending. Worker dostaje cancel po wysłaniu wyniku i nigdy więcej nie pobierze tego id z kolejki. Kolejne opóźnione anulowania rosną przez całe życie usługi.

Reprodukcja: prawdziwa createRoadTileService, mały poprawny region PLANNER, sterowany schedule. Dla id=1..1000: handle(tile) → wykonanie zadania/odesłanie odpowiedzi → handle(cancel). Set został odczytany przez krótkotrwałą atrapę konstruktora globalnego Set podczas tworzenia usługi; kod produkcyjny i logika kolejki nie były zmieniane. Wynik:

```json
{"completedTiles":1000,"queuedJobs":0,"retainedLateCancellationIds":1000}
```

Oczekiwane po opróżnieniu kolejki: brak przechowywanych anulowań zakończonych zadań. Poprawka: utrzymywać mapę aktywnie oczekujących id, usuwać anulowane wpisy z kolejki albo dodawać cancel wyłącznie dla nadal oczekujących zadań; nie zatrzymywać historii wszystkich ukończonych id. Przypadki testowe: cancel przed init/drain, cancel przed kodowaniem, cancel po odpowiedzi oraz spóźniona odpowiedź po abort klienta. Istniejący test sprawdza jedynie cancel jeszcze oczekującego kafla i dlatego nie wykrywa wycieku.

### W3 — P3: błędny komunikat zakresu przy odroczonym regionalnym podkładzie

`map05/planner.mjs:236`; porównanie z `:66`.

Przy mapDeferred=true mapData celowo nie jest wczytywane w głównym wątku. renderMapSummary sprawdza jednak tylko mapData?.regions?.PLANNER i wybiera tekst „Podkład ulic obejmuje wyłącznie wycinek Opola.”, mimo że worker rysuje pełny regionalny podkład. map-desc uwzględnia już mapDeferred. To deterministyczny wynik tej gałęzi kodu; test odroczenia sprawdza licznik, lecz nie tekst map-note. Uwzględnić odroczenie/stan rzeczywistego podkładu i dodać asercję tekstu. Sam licznik 102/109 i lista uwag zostały prawidłowo odłączone od istnienia SVG.

## Ocena pozostałych granic

- Init vs tile: kolejka może przyjmować żądania przed init; pump nie rusza bez index/failure, a zakończenie init uruchamia drain. Jeden kafel na zadanie pozwala obsługiwać cancel między kaflami. Pojedynczy kafel wciąż nie jest przerywany w połowie kodowania, co jest normalną granicą tego mechanizmu.
- LIFO: po ustaniu nowych żądań stara kolejka zostanie opróżniona. Ciągły napływ może jednak głodzić starsze nadal ważne żądanie; brak limitu wieku/fairness. To jawny kompromis „najnowszy widok pierwszy”, nie odrębny potwierdzony blocker. Warto ograniczyć rozmiar kolejki, usuwać anulowane wpisy i zagwarantować obsługę starego ważnego kafla w stress teście.
- Dane do workera są przesyłane raz przy init jako tekst 17,83 mln znaków, a nie jako cały obiekt 322 tys. dróg. Wynik MVT jest przekazywany przez transfer ArrayBuffer. Tekst init podlega jednak structured clone; nie jest transferowalnym buforem. DOM z base64 i przejściowe kopie/inflacja nadal zużywają pamięć. To nie jest „zero copy” ani dowód zerowego kosztu startu na głównym wątku. Nie wykazano tu błędu semantycznego.
- Worker nie utrzymuje drugiego planu/zleceń. Otrzymuje regionalny lokalny podkład, a nie customer plan. SVG jest ładowane leniwie; ensureSvgMap współdzieli Promise, a operationalDisabled chroni przed kaskadą ponownych destroy. Błąd podczas inicjalizacji jest obsłużony; późniejszy wymaga W1.
- Brak Worker API pozostawia SVG i nie inicjuje MapLibre. Konstruktor workera rzucający synchronicznie może przejść na inline road client; asynchroniczny błąd startu idzie na SVG. Są odpowiednie testy tych ścieżek.
- Brak DecompressionStream: decodeEmbeddedText rzuca czytelny błąd. W pliku offline routing i basemap nie mogą zostać odtworzone; loadPlanner zachowuje planer zasobowy, a nie pełną ocenę drogową/mapę. To ograniczenie zgodności, nie pełnowartościowy fallback starych Safari/Firefox. Brak testu całej aplikacji z DecompressionStream=undefined; dodać taką kontrolę lub jawny komunikat wymagań. Nie deklarować obsługi dawnych wersji na podstawie Chrome/Node.
- CSP offline pozostaje ścisłe: memory-only blob/data dla właściwych dyrektyw, bez schematów sieciowych, unsafe-eval ani serwera proxy. Klasyczny road worker z blob jest poprawnym kierunkiem dla file://; hash bloku jest ujęty. Served ma jawne wpisy modułów na FILES; względne importy workera działają jako moduł, a URL danych jest absolutny lokalny.
- strip_modules usuwa aktualny jednoliniowy format import/export, z kolejnością dostarczającą decodePolyline i pozostałe potrzebne funkcje. Jest to bundler zależny od konwencji źródeł, nie ogólny parser ESM. Test braku import/export w workerze i zgodność finalnego artefaktu są adekwatne dla tego zakresu. gzip ma stały mtime, a dane po odtworzeniu i identyfikatory są zachowane.

## Przegląd pomiarów PRZED/PO

Odczytane zewnętrzne pliki mms-e2e:

- map061-perf.mjs SHA256 **517b785ad0183c397fdc5a9440fc02195290a45785c38914ad5c8b164a6267dd**;
- map061.mjs SHA256 **2f292cad7cc9ec71122d9d7e44cafcfdc0daf9e4118b364e4f9107ebaa21af23**.

Wspólny skrypt używa tego samego Chrome, viewportu, nowego profilu, dziesięciu przelotów i deterministycznych 60 skoków dla obu artefaktów. Mierzy long tasks głównego wątku oraz sumę PrivatePageCount/WorkingSetSize całego drzewa procesów danego profilu. To sensowna podstawa porównania; process tree uwzględnia koszt workerów mieszkających w rendererach. Sam usedJSHeapSize strony nie wystarcza do porównania pamięci po przeniesieniu pracy do workerów.

**P3 — ograniczenia interpretacji, map061-perf.mjs:50–55, :80, :91–99 i końcowe peakHeapMB:**

1. firstIdleMs kończy się także na m.loaded(), bez oczekiwania na zdarzenie idle w tej gałęzi. To czas gotowości załadowanej mapy według warunku skryptu, nie zawsze ścisły pomiar zdarzenia pierwszego idle.
2. S4 czeka na zmianę view.layers (stan logiczny), nie ukończone setData/render/idle. Nie przedstawiać tej liczby jako opóźnienia do gotowej klatki z trasą. Dla percepcyjnej latencji należy osobno czekać na render/idle i mierzyć ostatnią klatkę.
3. peakHeapMB to maksimum czterech próbek **głównego realm**, bez ciągłego próbkowania i bez wymuszonego GC; nie jest rzeczywistym maksimum całej aplikacji. Podawać jako „największa próbka main heap”. Sumy process tree są właściwym uzupełnieniem, ale również próbkowanym, nie ciągłym maksimum.
4. S3 timeout 15 s rozwiązuje Promise tak samo jak idle. Trzeba oznaczać timeouty, a nie ujmować je jako poprawnie ukończony widok. Do uczciwych wniosków podać liczbę przebiegów, kolejność PRZED/PO i warunki cache; nowy profil nie opróżnia systemowego cache plików. Nie potwierdzałem liczbowych wyników tych zewnętrznych przebiegów ani ich kolejności.

Skrypt map061.mjs sensownie sprawdza worker/kompresję, blokadę startu, brak Worker i zgodność liczników offline/served. Nie bada awarii workera **po** ready, spóźnionego cancel ani braku DecompressionStream. W1/W2 wymagają dodatkowych testów niezależnie od jego PASS. W4 równe liczniki są uzupełnieniem, nie dowodem pełnej zgodności routingu; dokładną zgodność źródłowych JSON potwierdza osobny test_delivery i odczyt artefaktu opisany wyżej.

Do zamknięcia review: W1 i W2 z regresjami, poprawka W3 i precyzyjne podpisy metryk. Następnie odczyt niezmiennego commitu po integracji. Nie wykonywać publikacji na podstawie tego werdyktu.
