# Prawdziwa przeglądarka — MAP-05 planer, 17.11.2026

Autor przebiegu: Claude Code (lider). Niezależny przegląd: Codex CLI (`../2026-11-17-codex/`).

## Środowisko i metoda

| Element | Wartość |
| --- | --- |
| Commit bazowy | `8ce430af8dd3e8c20fd775c66d78a2b422785004` (`main`) + poprawki tego etapu (commit opisany w `map05/VERIFICATION.md`) |
| System | Windows 11 Pro 10.0.26300 |
| Przeglądarka | **Google Chrome 157.0.8103.79**, prawdziwy silnik renderujący (headless), zainstalowany lokalnie |
| Sterowanie | `playwright-core` 1.65.1 zainstalowany **poza repozytorium** (bez pobierania przeglądarek; `executablePath` = lokalny Chrome). Nie dodano zależności do `package.json`. |
| Profil | Każdy przebieg i drugi „czysty widok” importu używa nowego tymczasowego profilu. Plan użytkownika w jego przeglądarce nie był dotykany. |
| Warianty | `served`: `python -X utf8 map05/serve.py` → `http://127.0.0.1:8765/` (moduły); `offline`: zbudowany `map05/planner-offline.html` przez `file://` |
| Artefakt offline | 69 522 757 B, SHA256 `694d833853c7db48b2844e1192bb5ad59d079efd2cfa15132204607420e648fe` |
| Okna | 1440×900 (desktop), 390×844 i 768×1024 (wąsko) |
| Ruch sieciowy | Rejestrowane każde żądanie, błąd żądania, komunikat konsoli i błąd strony |

Agent Codex w Aion UI nie mógł użyć swojego narzędzia przeglądarki: `createBrowserTab` zwróciło „The browser access host is unavailable”. Nie próbował obejść. Wszystkie dowody wizualne poniżej pochodzą z przebiegu lidera.

Odtworzenie (poza repo, katalog roboczy z `npm install playwright-core@1.65.1`):

```text
EVID=<katalog wyników> node scripts/scenarios.mjs http://127.0.0.1:8765/ served
EVID=<katalog wyników> node scripts/scenarios.mjs file:///<repo>/map05/planner-offline.html offline
EVID=<katalog wyników> node scripts/perf.mjs <url> <tag>
```

## Wyniki końcowe — 10/10 PASS w obu wariantach

| # | Scenariusz | Oczekiwane | Rzeczywiste (offline; served identycznie poza liczbą żądań) | Status | Dowód |
| --- | --- | --- | --- | --- | --- |
| S1 | Desktop: kolejka, koszyki, punkty | 109 w kolejce, 102 markery, 6 przerywanych, panel uwag 13 (7 bez pozycji + 6 PNA) | 109; 102; 6; 13; ładowanie 1,8 s (served 2,4 s) | PASS | `offline/S1-offline-desktop-full.png`, `S1-…-map-overview.png` |
| S2 | Adres poza Opolem (TEST-003, Knurów), zoom/pan, powrót | Lokalne ulice i nazwy, przeciąganie zmienia widok, „Cały zakres” = `0 0 680 380`, obwódki tekstów o stałej szerokości | 392 odcinki, 32 nazwy ulic; drag zmienia viewBox; 102 punkty po powrocie; kółko nie przewija strony; obwódki `non-scaling-stroke` | PASS | `offline/S2-offline-selected-knurow.png`, `S2-…-zoomed-out-panned.png` |
| S3 | Dzień 19.11, wyłączony slot, filtry, generowanie | Wyłączony slot nieużyty, kolejka niezależna od dnia, powody widoczne | MPL 55/109; szukaj „TEST-01” 10/109; 80 miejscowości; 12 przydziałów (0,27 s); kolejka 97 również na 18.11; TEST-01 14–17 nieużyty; 4 rodzaje powodów | PASS | `offline/S3-offline-after-generate.png`, `S3-…-reasons.json` |
| S4 | „Mapa” koszyka TEST-02 + zmiana dnia | Trasa tylko ze znanych odcinków, kolejność, kontrole 30 km/+10 km/okna; bez „0 km” | TEST-025 → TEST-062 → TEST-039, 25,6 km, 39 min (szacunek), 2 odcinki drogi; „30 km: w limicie”. Widok przybliżono i przesunięto, aż w kadrze było 0 markerów; po zmianie dnia 19→18→19 wszystkie 3 markery wróciły do widoku | PASS | `offline/S4-offline-basket-TEST-02.png`, `…-card.png` |
| S5 | Otwarcie slotu, przeniesienie, cofnij, wróć do kolejki, cofnij, zajęty slot, błędny przydział | Ruch zapisuje MANUAL, cofnięcie przywraca, zajęty slot odrzucony z czytelnym powodem, plan bez częściowych zmian | Próba w ten sam dzień odrzucona (30 km, zajęty slot), przeniesienie TEST-025 na 20.11 → MANUAL; cofnięcie przywraca; usunięcie → kolejka + przycisk ponownego włączenia; zajęty slot: „Nie można wyłączyć okna 08:00–11:00 ekipy TEST-01 (2026-11-19): zajmuje je TEST-013…”, plan bez zmian | PASS | `offline/S5-offline-after-move.png` |
| S6 | Potwierdzenie, regeneracja, ochrona, zwolnienie | Potwierdzone przetrwa regenerację; przenieś/usuń zablokowane; bez powodu odmowa | TEST-013 zostaje TEST-01/08–11; przyciski wyłączone; bez powodu: komunikat 3–400 znaków; z powodem zapisany `releaseReason`, origin MANUAL | PASS | `offline/S6-offline-released.png` |
| S7 | Pobranie JSON, import w czystym profilu, odświeżenie | Plik = stan; odświeżenie zachowuje; import odtwarza; obcy `datasetId` odrzucony | Pobrany plik 4 236 B identyczny z planem; po odświeżeniu identyczny; czysty profil 0 → 13 przydziałów; obcy zbiór odrzucony bez zmian | PASS | `offline/S7-offline-mms-plan-2026-11-19.json`, `S7-…-imported-clean-profile.png` |
| S8 | 390×844 i 768×1024 | Brak poziomego przewijania strony, panele pionowo, tabela przewija się w kontenerze | `scrollWidth` = szerokość okna; nic nie wystaje; tabela 620/327 px przewijana; najmniejszy tekst 10 px | PASS | `offline/S8-offline-390x844-full.png`, `narrow-offline-*.png` |
| S9 | Klawiatura | Skip link, Tab/Shift+Tab, Enter/spacja, +/−/strzałki/Home, fokus po zmianach, Esc w dialogu | Wszystko działa; po potwierdzeniu fokus → pole powodu, po zwolnieniu → „Potwierdź”; próba usunięcia środkowej wizyty odrzucona regułą 30 km i fokus zostaje na przycisku; Esc zamyka dialog i wraca na „Wyczyść”; obrys fokusu 3 px | PASS | `offline/S9-offline-focus-generate.png`, `results-offline.json` |
| S10 | Konsola i sieć | 0 błędów, 0 nieudanych, 0 zewnętrznych | oba profile (główny i czysty profil importu): offline 4 żądania (`file:`), served 51 żądań do `127.0.0.1`; 0 błędów konsoli, 0 błędów strony, 0 nieudanych, 0 zewnętrznych | PASS | `results-*.json` (`log`) |

Pełne teksty „rzeczywiste” każdego kroku: `served/results-served.json`, `offline/results-offline.json`.

## Kontrola, czy scenariusze odróżniają stan przed poprawkami

Ten sam `scripts/scenarios.mjs` uruchomiono na bajtowo odtworzonym artefakcie bazowym `8ce430a` (`planner-offline.html`, SHA256 `5693b0fb…be67`). Wynik: S2 **FAIL** (obwódki `vector-effect:none`), S4 **FAIL** (po zmianie dnia 0/3 markerów w widoku), S5 **FAIL** (stary komunikat zajętego okna), S9 **FAIL** (fokus po potwierdzeniu nie trafia do szczegółów). Pozostałe 6 scenariuszy PASS. Zapis: `before-fix/results-base-8ce430a.json`. Kontrolę S4 przebudowano po uwadze niezależnego reviewera: wcześniejsza wersja (19→18→19 bez przesunięcia widoku) przeszłaby również przed poprawką.

Granica skryptu: proces `scenarios.mjs` kończy się kodem 0 także przy statusie FAIL. Odbiór wyników odbywa się przez `results-<tag>.json` i wypisane wiersze `[PASS]/[FAIL]`. Granica: S8 i S9 sprawdzają wymienione kryteria (przepełnienie, cele, fokus, klawisze), a nie pełny audyt WCAG.

## Wydajność regionalnej mapy (offline, headless Chrome)

`offline/perf-offline.json`: ładowanie 1,5 s. 16 kolejnych przybliżeń z widoku całego zakresu kończy render w 43–107 ms, przy maks. 1 600 odcinkach. Przeciąganie przy średnim zbliżeniu: 30 ruchów w 1,14 s (ok. 38 ms na ruch). Pomiary są orientacyjne dla tej maszyny, nie gwarancją dla słabszych urządzeń.

## Usterki wykryte w prawdziwej przeglądarce i poprawione

| ID | Waga | Objaw (przed) | Przyczyna | Poprawka | Dowód przed / po |
| --- | --- | --- | --- | --- | --- |
| B1 | P1 | W „Wybrany adres” połowę mapy zakrywała biała plama, ulice niewidoczne; biała łata wokół podpisu skali | `.map-road-label` i `.map-scale text` miały obwódkę 3px bez `vector-effect:non-scaling-stroke`; przy zbliżeniu viewBox ~240× rosła do setek pikseli. Testy DOM tego nie widzą. | CSS: `non-scaling-stroke` dla etykiet ulic i skali | `before-fix/before-S2-selected-knurow-halo.png`, `before-S4-basket-scale-halo.png` → `offline/S2-…`, `S4-…` |
| B2 | P2 | „Cały zakres”: zamiast dróg ok. 672 losowe „okruchy” (mediana 0,4 px) | Po przekroczeniu limitu 1 600 wybierano po 11 pierwszych odcinków na komórkę siatki, bez względu na długość | Pomijanie fragmentów < ~1 px ekranu, sortowanie: klasa drogi → długość | `before-fix/before-S1-overview-specks.png` → `offline/S1-offline-map-overview.png` |
| B3 | P2 | Odznaczenie zajętego okna odrzucone komunikatem „Brak dostępności: slot jest wyłączony lub nie został podany.” | Generyczny błąd walidacji | Model (Codex T2): komunikat wskazuje okno, ekipę, dzień i zlecenie | S5 |
| B4 | P2 | (Codex R2) fokus spadał na `BODY` po Potwierdź/Zwolnij/Wróć do kolejki | Render usuwał aktywny przycisk | Fokus wraca do najbliższej dostępnej kontrolki w szczegółach | S9 |
| B5 | P3 | (Codex R3) zmiana dnia w trybie „Mapa” koszyka zostawiała widok poprzedniego dnia | Brak dopasowania widoku | `fitCurrentMap()` po zmianie dnia w trybie koszyka | S4 |
| B6 | P2 | (Codex R1) przeniesienie po zwolnieniu potwierdzenia gubiło `releaseReason` | Nowy przydział bez pola | Model (Codex T2): powód przenoszony | test modelu |
| B7 | P3 | Przyciski „Mapa” 20 px wys., podsumowanie dróg 8,3 px | CSS | min. 24×44 px; teksty 10–11 px | S8 |

## Czego nie testowano (NOT TESTED)

- Firefox, Safari, Edge oraz tryb z oknem (headed) i GPU — tylko headless Chrome 157.
- Fizyczne urządzenie dotykowe i gesty szczypania; czytnik ekranu (NVDA/JAWS) — sprawdzono tylko atrybuty i fokus.
- Słabszy sprzęt; pomiary wydajności dotyczą tej stacji.
- Natywne okno „Zapisz jako” przeglądarki — pobranie przechwycono przez zdarzenie pobierania Chrome, plik zapisano i porównano bajtowo.
