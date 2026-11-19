# MAP-09 T30 — niezależny przegląd demonstratora

**Werdykt dla `8c8d9e5`: poprawić obsługę przełączeń przed odbiorem i zawęzić deklaracje QA.** Brak potwierdzonych P1. Trzy P2 i trzy P3. Ustalenia o zachowaniu aplikacji wynikają z odczytu kodu demonstratora oraz przypiętego MapLibre. Scenariusze przeglądarkowe poniżej to warunki do odtworzenia. W T30 ich nie uruchamiano.

## P2

### 1. Awaria kolejnego stylu nie kończy oczekiwania i może opisać nieaktywny styl jako działający

`map09-poc/poc.mjs:68–85, 88–110`.

Scenariusz: Positron załadowany, następnie wybór Liberty przy błędzie HTTP, niepoprawnym JSON albo błędzie walidacji stylu. `applyStyle` ustawia `pending=true` i zmienia nazwę żądanego stylu, a `styleLoaded` zachowuje poprzednie `true`. W bundlu MapLibre błąd pobrania w `_diffStyle` trafia do ogólnego `error`, bez `sourceId` i `tile`. Handler aplikacji pomija ten przypadek. `pending` pozostaje aktywne i przycisk „Spróbuj ponownie” ukryty. Po późniejszym `idle` możliwy jest zielony komunikat „działa · styl Liberty” nad ostatnim poprawnym Positronem. Odrębnie, `unavailable` zmienia status i kontrolki bez jawnego przywrócenia lokalnego stylu. Przy awarii w trakcie przebudowy nie ma gwarancji, że warstwy syntetyczne pozostaną dostępne.

Rekomendacja: rozdzielić zamówiony i rzeczywiście zastosowany styl. Po nieudanym pobraniu albo walidacji zakończyć transakcję, pokazać możliwość ponowienia i zachować poprzedni poprawny styl. Gdy go brak, jawnie przywrócić lokalny styl z nakładką. Ustawić ograniczenie czasu oczekiwania. Status „działa” powinien opisywać aktywny styl i stan jego źródła. **NIE SPRAWDZONO** w przeglądarce z kontrolowaną odpowiedzią drugiego stylu.

### 2. Szybkie przełączenia i diff bez zmian mogą rozjechać radio, styl i stan `pending`

`map09-poc/poc.mjs:68–71, 97–103, 118–123`, `map09-poc/qa/online.mjs:25, 102–114`. Zależność: `map05/vendor/maplibre-gl/maplibre-gl.mjs`, metody `_diffStyle` i `setState`.

Scenariusz: po załadowaniu Positrona użytkownik wybiera Liberty, po czym przed odpowiedzią wraca do Positrona. Jeżeli porównanie zwróci pusty diff, `setState` kończy się przed emisją `style.load`. Aplikacja kończy `pending` wyłącznie przy tym zdarzeniu. Osobny wyścig jest możliwy przy trzech żądaniach. Odrzucona starsza operacja w `_diffStyle` zeruje wspólne pole kontrolera, nawet jeśli nowsze żądanie już je zastąpiło. Następne przełączenie może nie anulować nowszej operacji, a `_updateDiff` nie sprawdza już jej tożsamości. Aplikacja uznaje każde `style.load` przy `pending` za powodzenie ostatniego wyboru. Test sekwencyjny czeka po każdym przełączeniu, więc nie pokrywa żadnego z tych przebiegów.

Rekomendacja: jeden właściciel transakcji zmiany stylu. Serializować zmiany albo pobrać i walidować JSON z własnym anulowaniem oraz numerem żądania i zastosować wynik wyłącznie dla aktualnego wyboru. Jawnie domknąć no-op i testować opóźnione odpowiedzi, przełączenie tam i z powrotem oraz nieaktualny błąd. **NIE SPRAWDZONO** kolejności zdarzeń przy rzeczywistych odpowiedziach sieciowych.

### 3. QA prywatności nie uzasadnia pełnego wniosku o danych przesyłanych do dostawcy

`map09-poc/qa/common.mjs:44–50`, `map09-poc/qa/online.mjs:65, 152–159, 173–187`, `map09-poc/qa/offline-smoke.mjs:24–33`.

N2 sprawdza kilka wzorców w zapisanym URL, skracanym do 220 znaków. Nie bada nagłówków, treści ani wszystkich identyfikatorów i nazw z nakładki. N1 przegląda listę originów zamrożoną na końcu `session()`, przed późniejszymi przełączeniami i akcjami dużej sesji. Mniejsza sesja nie powtarza tej bramki. N3 mierzy tylko liczbę zarejestrowanych żądań przed kliknięciem w tym przebiegu. S2 z testu offline również obserwuje zdarzenia przeglądarki, bez zablokowania ruchu. To ograniczenia dowodu. Przegląd kodu nie wykazał automatycznego przekazania kolekcji punktów lub trasy.

Rekomendacja: opisać N2 jako kontrolę badanych wzorców w URL. Jeśli ma być kryterium odbioru prywatności, zebrać w autoryzowanym teście pełne żądania, sprawdzić metodę, dokładny origin, ścieżkę, nagłówki z `Referer` i obecność ciała dla całej sesji oraz obu rozdzielczości. Rejestrować stany przed i po zgodzie, z blokadą połączeń spoza dozwolonego zakresu i bez zapisywania wartości wrażliwych. **NIE SPRAWDZONO** faktycznego ruchu i nagłówków w T30.

## P3

### 4. Progi jakości i filtr błędów sprawdzają węższe warunki niż opisy testów

`map09-poc/qa/online.mjs:9–19, 23, 79–96, 157–159, 184–186, 200–205`, `map09-poc/qa/poland-points.mjs:15–19`.

- C sprawdza liczbę dróg i dowolnych markerów, bez zgodności centrum lub zoomu z wybranym miastem. Błędne przekierowanie do innego dużego miasta z markerami może zaliczyć test.
- Historyczny T2 ma w Knurowie przy z16.2 dokładnie **1 cechę z nazwą i 5 cech budynków** w obu stylach przy 1366×768. Spełnia skalibrowany próg obecności. Liczniki mogą uwzględniać tę samą geometrię z wielu warstw lub kafli i nie mierzą czytelności. Próba punktów w widoku kraju zapisuje wyrażenie `icon-size`, bez pomiaru rzeczywistych pikseli.
- N4 i N5 odrzucają wszystkie `ERR_ABORTED` bez przypisania do konkretnej zmiany widoku. W zapisanych wynikach było odpowiednio **214 i 110** takich zdarzeń. Sam `requestfailed` nie sprawdza statusów HTTP. N4 zapisuje `state.errors`, lecz go nie asertuje. W historycznym logu większego ekranu te błędy wynosiły **0**. O3 zalicza przy dowolnym `styleLoaded=true` i ignoruje niepowodzenie oczekiwania na `waitIdle`.

Rekomendacja: weryfikować centrum i zoom, stosować rozłączne liczniki lub stabilne próbki części miasta oraz opisywać niski próg jako test obecności. Asercje sieciowe rozróżnić na spodziewane anulowania, statusy HTTP i błędy emitowane przez MapLibre. Powrót po offline powinien wymagać poprawnie załadowanego źródła i rzeczywistych cech podkładu. [Historyczne wyniki](stage3b/online-results.json), [log większego ekranu](stage3b/v1920x1080/page-log.json)

### 5. Klikalny punkt i zmiana widoczności zgody nie mają pełnej ścieżki klawiaturowej

`map09-poc/index.html:15–40`, `map09-poc/poc.mjs:88–114, 140–152`, `map09-poc/poc.css:3–9, 15, 28–29`.

Przyciski widoku i wybór stylu mają natywne elementy, a status działa jako obszar live. Dymek wizyty dostępny jest przez kliknięcie cechy w canvasie. Brakuje listy lub kontrolki, która pozwala wybrać tę wizytę klawiaturą. Kliknięty przycisk włączenia zostaje ukryty z panelem, a „Spróbuj ponownie” także znika po użyciu. Kod nie ustawia żadnego następnego celu fokusu. Ponadto przy krótkim oknie po zawinięciu nieskurczalnych sekcji mapa z `min-height:0` może utracić użyteczną wysokość.

Rekomendacja: dodać równoważną klawiaturową listę punktów i przypisać przewidywalny fokus po włączeniu oraz błędzie. Sprawdzić klawiaturę, czytnik ekranu i małe okno z powiększeniem, z minimalną użyteczną wysokością mapy lub naturalnym przewijaniem. **NIE SPRAWDZONO** fokusu ani układu na żywo.

### 6. Identyfikatory ikon syntetycznych współdzielą przestrzeń nazw ze sprite’em dostawcy

`map09-poc/overlay.mjs:24–28, 62–64, 89–91`, `map09-poc/poc.mjs:62–66`.

Scenariusz: przyszły sprite dostawcy wnosi obraz o ID `mpl`, `bsa` lub `pomiar`. Zdarzenie `styleimagemissing` nie wystąpi dla obrazu już istniejącego, więc własny kształt dla tej kategorii może zniknąć mimo poprawnego licznika cech. Przejściowy błąd źródła stylu to odrębny przypadek opisany wyżej.

Rekomendacja: prefiksować identyfikatory ikon demonstratora, a QA sprawdzić zgodność typów i kształtów po zmianie stylu. **NIE SPRAWDZONO** zawartości bieżących spritów dostawcy.

## Izolacja, atrybucja i zakres

- Serwer wiąże się z `127.0.0.1`, ogranicza odczyt do literalnej allowlisty oraz sprawdza Host dla GET i HEAD. Dozwolone pliki są statyczne. Vendor MapLibre to jedyny współdzielony zasób. Nagłówek CSP powtarza politykę z HTML i dodaje `frame-ancestors 'none'`. Odpowiedzi mają `Referrer-Policy: no-referrer`. Testy potwierdziły nagłówki, odrzucenie obcego Host i odrzucenie wskazanych plików spoza listy. **NIE SPRAWDZONO** ochrony w przeglądarce ani przez zewnętrzny proxy. `map09-poc/serve_poc.py:16–32, 38–62, 79–80`, `map09-poc/tests/test_poc.py:36–62`.
- Pierwszy styl ma tylko tło i lokalny GeoJSON. Przed zgodą wybór radia zmienia zapamiętany wybór i nie wywołuje `setStyle` z URL. CSP dopuszcza origin dostawcy od początku, więc zgodę egzekwuje logika aplikacji. Odnośniki atrybucji mogą zainicjować jawną nawigację po kliknięciu jeszcze przed zgodą. Mają `noreferrer noopener`. Warto doprecyzować, że komunikat dotyczy automatycznych żądań mapy. Po zgodzie wybór widoku może ujawnić obszar kafli, także gdy jego centrum wynika z dopasowania syntetycznych punktów. `map09-poc/index.html:6, 33–41`, `map09-poc/poc.mjs:47–58, 97–123, 134–138`, `map09-poc/overlay.mjs:76–80, 108–110`.
- Stopka podaje OpenFreeMap, OpenMapTiles i współtwórców OSM wraz z ODbL i odnośnikami. Jest zgodna znaczeniowo z atrybucją Quick Start cytowaną przez lidera. W dostarczonej analizie ToS nie wskazano dodatkowej formuły. **NIE SPRAWDZONO** aktualnej treści ToS, Privacy Policy ani widoczności atrybucji na żywo. `map09-poc/index.html:39–42`.
- Dopuszczone testy wykonane z katalogu `map09-poc` dały **6/6** dla `node --test tests/overlay.test.mjs` i **8/8** dla `python -X utf8 -m unittest tests.test_poc`. Test Pythona korzysta z własnego efemerycznego serwera loopback, a zapis bytecode był wyłączony. Testy nakładki obejmują dane i kompozycję stylu, nie cykl życia MapLibre. Nie uruchamiano QA Chrome ani żadnego zewnętrznego połączenia. Jedyny mój zapis to raport.
