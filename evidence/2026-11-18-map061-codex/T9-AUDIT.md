# T9 — audyt przed publikacją MAP-06

18.11.2026, Codex CLI, niezależny audyt tylko do odczytu.

**Werdykt: NO-GO dla publikacji ocenianego stanu do czasu udokumentowania praw redystrybucji wyników geokodowania (A1).** Nie znaleziono rzeczywistego sekretu ani nowego zestawu danych klientów. Techniczna ocena implementacji MAP-06 z T6–T8 pozostaje APPROVE; audyt publikacyjny ma szerszy zakres i odrębną bramkę dotyczącą źródeł danych. Brak dokumentu warunków nie jest stwierdzeniem naruszenia prawa.

## Stan i metoda

- HEAD przypięty do **f1cba87cd42173c3f2e2357db8262d361a21611c**; main **0c2a0a839d98d9c6ebeafa79276e10acec420627**. Pięć commitów nieobecnych w main. HEAD nie zmienił się do końca odczytu.
- 267 śledzonych plików w HEAD, 78 ścieżek w diffie main..HEAD. Odczyt przez git show/ls-tree/rev-list/cat-file, nie z równolegle edytowanego working tree.
- Skan wzorców wykonał przegląd **215 unikalnych tekstowych blobów** obejmujących drzewo HEAD i historyczne wersje plików z main..HEAD. Obejmował również duże HTML, vendor i rozpakowane w pamięci JSON.gz. Dodatkowo odczytano XML i metadane obu XLSX, źródła/proweniencję danych, nowy JSON planu, kod granic wejścia i licencje. Skan wzorców nie dowodzi matematycznie braku dowolnie zakodowanego sekretu.
- 28 nowych PNG: sprawdzono strukturę metadanych wszystkich; nie znaleziono tEXt/zTXt/iTXt/eXIf. Obejrzano **bajty wprost z Git**: served/M2-served-popup.png oraz map05-regression/S1-svg-fallback-desktop-full.png. Nie był to nowy test przeglądarkowy ani pełny OCR wszystkich obrazów.
- Bez sieci, buildu, zmian kodu, commit/push i modyfikacji historii. Jedyny zapis to ten raport. Nie powtarzano testów; wcześniejszy wynik 231/231 jest z T8, nie z T9.
- Odczytano procedurę security-diff-scan i jej kontrakt przechowywania. Jej formalny pipeline workbench tworzy dodatkowe artefakty poza jedynym dozwolonym plikiem, więc go nie uruchomiono. Ten raport jest ręcznym audytem Git, nie raportem ukończonego skanu wtyczki. Nie utworzono zastępczych plików kanonicznych ani fikcyjnego scanId.

## Ustalenia P1–P3

### A1 — P2, bramka NO-GO: brak udokumentowanej podstawy redystrybucji wyników usług

Lokalizacje: `map05/data/UUG-SCOPE.md:9`, `:11`; `map05/data/uug-geocoding.json:5`; `map05/data/GEOCODING-SCOPE.md:5`; `map05/data/geocoding.json:5`; źródłowy CSV Geoapify; `docs/DECYZJE-I-ZAKRES.md:27`–`:34`.

Repo dokumentuje zgodę użytkownika na wysłanie danych do UUG i Geoapify oraz późniejszą publikację adresów/współrzędnych. Nie zawiera jednak utrwalonych warunków licencyjnych albo wskazania konkretnej podstawy redystrybucji surowych odpowiedzi UUG, pól rejestrowych TERYT/SIMC/ULIC i wyników Geoapify/ich źródeł. `source.provider` i URL dokumentacji nie określają same przez się praw do redystrybucji i wymaganych atrybucji. Pliki już są w main; gałąź ich nie wprowadza, lecz zlecenie wymagało audytu całego publicznego zestawu.

Nie stwierdzam, że publikacja tych danych jest zabroniona. **Nie mogę potwierdzić, że jest dozwolona na odpowiednich warunkach, na podstawie samych materiałów repo.** Zakaz sieci uniemożliwia aktualną kontrolę dokumentów dostawców. Zgoda właściciela listy nie zastępuje praw do wyników innych podmiotów.

Zamknięcie bramki: udokumentować źródło/licencję/warunki i obowiązki atrybucji osobno dla UUG/GUGiK, pól rejestrowych i Geoapify, z datą i zakresem obejmującym publiczną redystrybucję utrwalonych wyników. Użytkownik powinien potwierdzić uprawnienie do źródłowych list; nie potrzeba ponownie ogólnej zgody na już zaakceptowane publiczne adresy. Jeśli potrzebna jest aktualna weryfikacja online, musi ją wykonać uprawniony etap poza obecnym zakazem sieci. Nie usuwać ani nie zmieniać zaakceptowanych źródeł automatycznie.

### A2 — P3: powielone duże artefakty w nieopublikowanej historii

Lokalizacja: `map05/planner-offline.html:1`, wersje w commitach 9af3f3f/a1fead2/7f825b8.

Trzy nowe unikalne bloby HTML mają **71 342 164**, **71 342 844** i **71 343 809 B** — razem **214 028 817 B** surowo. Cały zakres main..HEAD zawiera 78 nowych blobów o łącznym rozmiarze **218 431 935 B**. To rozmiary logiczne, nie przewidywana wielkość transferu: Git może zastosować delty/kompresję.

`git count-objects -vH`: 58 loose objects / **52,04 MiB**, 322 in-pack, 2 packi / **102,50 MiB**, garbage 0. Liczby dotyczą całego lokalnego repo, nie tylko gałęzi. Największy pozostały nowy blob: vendor MapLibre JS **1 106 041 B**, worker **550 754 B**; PNG są znacznie mniejsze. Brak nowego bloba powyżej 100 MiB. Każdy HTML przekracza próg ostrzeżenia 50 MiB podany w zleceniu, pozostając poniżej podanego limitu 100 MiB; progów nie weryfikowano online.

Propozycja przed pierwszym push: przygotować lokalną gałąź publikacyjną od main, złożyć finalne drzewo MAP-06 w jednym commicie implementacji, zawierającym tylko jedną finalną wersję dużego HTML. Po przygotowaniu porównać pełne drzewo z zaakceptowanym snapshotem, zweryfikować hashe danych i artefaktu oraz powtórzyć wymagane testy. Można zachować lokalną gałąź roboczą jako kopię; nie przepisywać publicznego main i nie robić force push. Sam squash PR przy merge nie zapobiega wcześniejszemu wysłaniu dużych blobów na publiczną gałąź.

Nie proponuję LFS dla samodzielnego HTML używanego bez instalacji. `.gitattributes`: zachować LF, ewentualnie dodać `map05/planner-offline.html text eol=lf -diff` dla czytelnego PR i `*.png -text`; nie wyłączać delta compression. `-diff` nie zmniejsza historii i nie zastępuje squash/kompresji artefaktu. Nie wykonywałem tych zmian.

### A3 — P3: jawnie opisać zakres ODbL dla wszystkich pochodnych baz i preset ORTO

Lokalizacje: `map05/basemap/README.md:5`, `:17`; `map05/data/local-routes.json:5`; `map05/maplibre-view.mjs:14`, `:52`; `docs/MAP06-PLAN.md:59`.

Podkłady planner-compact i regional-roads mają metadane ODbL-1.0 oraz © OpenStreetMap contributors. README jawnie udostępnia dane pochodne na ODbL i linkuje licencję/prawa OSM; UI i obejrzane PNG pokazują atrybucję. Kod MVT przekształca te same lokalne drogi; nie pobiera nowego, prywatnego źródła. `local-routes.json` zawiera pochodne segmenty/geometrię OSM i proweniencję, lecz bez własnego pola license/attribution. Warto dopisać jednoznaczną mapę plik → źródło → ODbL, obejmującą także local-routes i generowane MVT, oraz wskazanie sposobu uzyskania modyfikowalnej bazy/odtwarzającego pipeline'u. Nie mylić licencji danych z BSD kodu ani automatycznie nie obejmować nią wszystkich własnych planów/adresów.

Stan repo daje pozytywny dowód atrybucji i dostępnego lokalnego pipeline'u; nie jest pełną opinią o spełnieniu każdej klauzuli ODbL. Pochodna baza pozostaje objęta właściwymi warunkami share-alike także wtedy, gdy kafle są generowane dopiero w przeglądarce.

Preset GUGiK ORTO nie jest pobierany w testach ani publikowany jako cache zdjęć; dodanie konfiguracji wymaga opt-in i originu serwera. Jednak nazwa „bezpłatna” i rekomendacja w planie nie są dowodem aktualnych praw do używania endpointu, zakresu wykorzystania i poprawnej atrybucji. Potwierdzić przed aktywacją rzeczywistego dostawcy, zgodnie z już zapisanym w planie zastrzeżeniem. To nie jest osobna blokada publikacji nieaktywnego presetu, lecz otwarty warunek jego użycia.

## Dane osobowe: main a nowe pliki

Kanoniczna zgoda, **`docs/DECYZJE-I-ZAKRES.md:32`**, już obecna w main:

> „Także adresy, współrzędne i planer z tymi danymi — publicznie”.

Zapis `:34` ogranicza zgodę do tego GitHub i nie rozszerza jej na inne usługi. Oba XLSX, CSV, addresses.json, geokodowanie, lokalne trasy i źródłowe podkłady są już w main; nie zmieniły się w badanym zakresie. XLSX mają kolumny adresowe, w tym **numery lokali**; nie są listami samych anonimowych miejscowości. Metadane obu XLSX nie wykazały nazwiska ani e-maila autora (puste/openpyxl). Rejestr wskazuje 109 unikalnych adresów, 102 pozycje i 7 braków; brak nowej listy klientów w gałęzi.

Nowe PNG i JSON wyników powtarzają rzeczywiste adresy z tego zbioru, czasem z lokalem. Przykład M2 zawiera adres z lokalem przy TEST-013; pełny S1 pokazuje analogiczne wiersze kolejki. Są to nowe **kopie już publicznych danych**, nie fikcyjne adresy. Nie zaobserwowano nazwisk klientów, telefonów, e-maili klientów ani autentycznych numerów zamówień w oglądanych obrazach. Nazwy ulic upamiętniające osoby nie są polami klienta.

Nowy eksport S7 ma 13 assignments i **0 orderId poza wzorcem TEST-xxx**. Pozostałe nowe JSON to wyniki, statystyki, manifest i pliki npm. Fixture OPO/KNU używa także historycznych ID SYN; były już w main i nie są zamówieniami produkcyjnymi. Statusy, gotowość, ekipy i okna są testowe. Brak dowodu, że źródłowe adresy nie mogą identyfikować gospodarstw; traktuję je jako rzeczywiste dane lokalizacyjne objęte istniejącą zgodą, nie jako dane anonimowe.

## Sekrety i tożsamość

- Brak śledzonych `.env`, prywatnych kluczy lub plików pem/p12/pfx/key. Skan HEAD i historycznych blobów main..HEAD nie znalazł nagłówków kluczy prywatnych ani charakterystycznych tokenów GitHub/AWS/OpenAI.
- `evidence/2026-11-17-map06/scripts/map06.mjs:186`: `?key=SECRET123` występuje wyłącznie w adresie lokalnej atrapy **127.0.0.1:8791**. Skrypt mock_tiles.py zwraca jednolity PNG i nie wymaga klucza; to jawna wartość testowa. `?key=abc`, `review-user:review-password`, `u:pw` i `u:p` w testach/raporcie odnoszą się do domen `.example` i testują odrzucenie/maskowanie. Nie zakwalifikowano ich jako rzeczywistych poświadczeń.
- Nie znaleziono konkretnej nazwy użytkownika Windows ani prywatnych ścieżek profili w śledzonych tekstach. Trafienia „OneDrive” w `docs/URUCHOMIENIE-I-TESTY.md:3` oraz raporcie T6 to ogólne słowo w opisie niezależności ścieżek/skanu, nie ścieżka. Generyczna ścieżka Chrome w lib.mjs nie identyfikuje osoby.
- Wszystkie pięć commitów gałęzi: author i committer **multiplay-pages**, e-mail **trolopiszek@gmail.com**. Ten sam e-mail jest już w metadanych main (np. 0c2a0a8). Jest publiczną informacją identyfikującą autora, **nie sekretem i nie nowym ujawnieniem tej gałęzi**. Nowa publikacja zachowa te metadane. Jeśli użytkownik chce przyszłe commity z GitHub noreply, można skonfigurować je na przyszłość; nie przepisywać istniejącego main bez osobnego zlecenia.
- E-maile/nazwiska autorów licencji należy zachować jako noty copyright; nie usuwać ich mechanicznie jako PII. Brak rzeczywistego klucza nie dowodzi uprawnienia do redystrybucji wyników usług — to odrębne A1.

## Licencje kodu

MapLibre 6.19.0 jest przypięty, vendorowany i ma główną BSD-3-Clause. THIRD-PARTY-NOTICES wymienia 19 pakietów; każdy ma sekcję w THIRD-PARTY-LICENSES. Wcześniejszy brak murmurhash-js jest zamknięty: pełny MIT/copyright 2011 Gary Court jest zachowany. Manifest wszystkich pięciu vendorowanych plików jest zgodny z SHA256. Pełny główny tekst i noty są osadzone również w samodzielnym HTML; potwierdzenie dokładnych bajtów/CSP jest w T8 na identycznym kodzie artefaktu.

Wśród zależności są ISC, BSD-2, BSD-3, MIT oraz alternatywa MIT/Apache-2.0; nie utożsamiam wszystkich zależności z BSD MapLibre. Ocena kompletności dotyczy wskazanych 19 pakietów i dostarczonych tekstów, nie audytu pochodzenia każdej instrukcji vendora ani aktualnych warunków zewnętrznych usług.

## Bezpieczeństwo publikowanego kodu

- `build_planner.py:88`: offline ma default-src none, connect-src wyłącznie blob:, worker-src blob:/data:, img-src blob:/data: i hashe skryptów/CSS, bez HTTP/HTTPS i unsafe-eval. Pamięciowy worker jest uzasadniony dla file://; nie jest serwerem pośredniczącym do sieci.
- `serve.py:40`, `:53`–`:63`, `:80`–`:83`: domyślnie self, ścisły origin HTTPS lub jawny loopback HTTP, brak userinfo/ścieżek/query/fragmentów/HTML. Rozszerzenie originu trafia do nagłówka i meta CSP. Serwer binduje loopback i udostępnia tylko FILES; nie ma proxy dowolnych URL.
- `planner.mjs:16`, `:364`, `:370`, `:495`–`:497`: konfiguracja mms-map06-satellite-v1 jest oddzielona od planu/eksportu. Sam zapis nie aktywuje rastra; start jest drogowy. Włączenie wymaga zgody i zgodności z allowlistą. localStorage nie jest magazynem prywatnych serwerowych sekretów; nadaje się wyłącznie do kluczy przeznaczonych do publicznego klienta.
- `maplibre-view.mjs:18`–`:28`: userinfo odrzucane, błędy maskowane. Popup używa textContent (`:107`–`:109`), atrybucja dostawcy jest escapowana. Istnieją innerHTML do szablonów UI, z escapeText dla adresów/miast i walidowanymi syntetycznymi ID; nie znaleziono nowego eval ani surowego HTML z adresu, przyczyny zwolnienia lub konfiguracji dostawcy.
- Raster otrzymuje szablon XYZ/WMS i widoczny obszar, nie JSON planu, ID zleceń, ekip, terminów ani adresów klientów. Dostawca po opt-in może poznać obszar/IP i zwykłe metadane HTTP — nie nazywać tego pełną anonimowością. Domyślnie brak źródła rastra, a powrót do drogowej je usuwa.
- Obecny audyt dotyczy snapshotu. Równoległa optymalizacja workera/kompresji wymaga osobnej kontroli finalnego commitu przed wykorzystaniem tego werdyktu do publikacji.

## Do potwierdzenia i warunki kolejnego GO

1. **Zamknąć A1**: udokumentować prawa do publicznej redystrybucji źródłowej listy i wyników UUG/GUGiK, pól TERYT/SIMC/ULIC i Geoapify, w tym obowiązki atrybucji. Istniejąca zgoda na publiczne adresy pozostaje uznana.
2. Doprecyzować mapę ODbL plików pochodnych (A3) i warunki ORTO przed jego rzeczywistym użyciem. Nie pobierać zdjęć ani nie uruchamiać nowych usług w ramach tego audytu.
3. Ustalić finalną historię publikacyjną/artefakt (A2), zachować źródła i hashe, a następnie przekazać nowy immutable commit po optymalizacji do sprawdzenia. Nie publikować starej historii tylko na podstawie późniejszego squash PR.

Nie ma P1 ani potwierdzonego nowego wycieku sekretu/klienta. NO-GO wynika z konkretnego braku dowodów praw do redystrybucji w audytowanym komplecie, a nie z żądania ponownego potwierdzania każdej odwracalnej czynności. Push gałęzi i PR bez merge pozostają po stronie lidera po spełnieniu warunków użytkownika.
