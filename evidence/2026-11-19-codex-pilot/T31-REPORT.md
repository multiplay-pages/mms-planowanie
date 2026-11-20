# T31 — pilot współpracy Claude Code + Codex CLI (skill `codex-delegate`)

**Werdykt: PASS** dla zakresu E0–E8, z ograniczeniami izolacji opisanymi niżej. T31 (testy `locationReasonText`) przyjęte po pierwszej rundzie (APPROVE, bez poprawek). Mechanizm REWORK (negatywny review → poprawka → ponowny review) potwierdzono na odizolowanym repozytorium syntetycznym. Bez pusha i merge (lokalne commity: sekcja „Stan po finalizacji”). Logika MMS, dane MAP-05, planer i lokalny `main` bez zmian.

Baza: `96d9437b809f7c389c7778f573f74e5c44305ffe` (`origin/main`, zgodna z `git ls-remote`). Codex CLI 0.170.0 (logowanie ChatGPT), model `gpt-6.2-sol`, Windows 11, Node 26.13.0, Python 3.12.10. Ścieżki profilu zastąpiono `%USERPROFILE%`. Surowe logi (`events.jsonl`, `stderr.txt`, `prompt.md`, `checks.json`, manifesty) leżą poza repozytorium w `%USERPROFILE%\work\codex-runs\`.

## Status etapów

| Etap | Status | Dowód |
| --- | --- | --- |
| E0 preflight | PASS | `codex-cli 0.170.0`, „Logged in using ChatGPT”. `origin/main` = `ls-remote` = `96d9437`. `main` @ `1fb5f9e` z nieśledzonymi tylko `.claude/` i JPG. |
| E1 samotest skryptu | PASS | `Test-CodexTask.ps1` 17/17 (glob, walidator schematu, wykrywanie zmian w allowliście, poza nią, w plikach chronionych, nowe pliki, junction, commit, timeout z zabiciem drzewa procesów, brak sekretów w env). Ponowiony po poprawkach: 17/17. `-Round 4` → kod 30. `-WhatIf` nic nie tworzy. Rundy poza kolejnością → 31. Powtórny Bootstrap reużywa worktree. |
| E1b bramka sandboxa | PASS (po poprawce konfiguracji) | SYN1: przy `--ignore-user-config` bez `windows.sandbox` Codex odrzucił **każde** polecenie („blocked by policy”). Codex zgłosił `blocked`, a skrypt wtedy błędnie przyjął rundę; to naprawione. Diagnoza A/B potwierdziła przyczynę, a skrypt podaje teraz `-c windows.sandbox="unelevated"`. SYN2 (3 rundy, także `resume`): zapis poza worktree odrzucony za każdym razem; brak plików na dysku potwierdzony niezależnie przez Claude. |
| E2 test REWORK (syntetyczny) | PASS | Kontrolowany test mechanizmu, **nie** ocena jakości Codexa. Runda 1: spec v1, testy Codexa 5/5. Ukryty zestaw v2 Claude 3 FAIL (`'za-g-l-ja'` zamiast `'zazolc-gesla-jazn'`, brak limitu 30 znaków), więc CHANGES. Runda 2: Claude 9/9 + v2 4/4, więc APPROVE. Runda 3 przez `exec resume`: ten sam wątek, właściwy katalog, próby zapisu odrzucone, 0 zmian. |
| E3 bootstrap T31 | PASS | Worktree `mms-codex-T31` na gałęzi `codex/T31-location-reason-tests` @ `96d9437`. Manifest: 735 plików, 0 dowiązań. Bez `node_modules` i bez `prepare_assets`. Natywne `node --test --test-isolation=none tests/locations.test.mjs`: 6/6. |
| E4 runda 1 T31 | PASS | Wątek `01a1f603-270d-7d93-81f0-74084b579638`, 83,6 s, kod 0, tokeny 246 883 / 3 041, `gpt-6.2-sol`/`high`. |
| E5 zakres i raport | PASS | Zmieniony wyłącznie `map05/tests/locations.test.mjs`. 0 naruszeń, 0 nowych plików, 0 dowiązań, HEAD bez zmian. `map05/locations.mjs` bez zmian. SHA256 `planner-offline.html` = `EB757997…E627F4` (jak w `main`). `last.json` poprawny wg schematu, deklarowane pliki = faktyczny diff. |
| E6 review Claude (kopia QA) | PASS | Osobny worktree `mms-codex-T31-qa` (detached, zmiana skopiowana i porównana hashem). Worktree Codexa zamrożony; po review potwierdzono 0 zmian. Wyniki niżej. |
| E7 rundy poprawek | NOT RUN (niepotrzebne) | Brak P1/P2. |
| E8 raport | PASS | Ten plik. |

## Wyniki testów T31 (uruchomione przez Claude, nie deklaracje Codexa)

| Polecenie (kopia QA) | Wynik |
| --- | --- |
| `node --test tests/locations.test.mjs` (domyślna izolacja) | 9/9 PASS (6 istniejących + 3 nowe) |
| `npm test` (map05, `node_modules` skopiowane do kopii QA) | **214/214 PASS**; baza z oryginalnym plikiem testu w tej samej kopii: 211/211, czyli +3 bez regresji |
| `python -X utf8 -m unittest discover -s map05/tests -p test_*.py` | pierwszy przebieg 1 ERROR (brak `map05/basemap/planner-data.json`, zasób odtwarzany lokalnie). Po `prepare_assets.py` w kopii QA („no downloads”): **105/105 OK (1 skipped)** |
| `python -X utf8 -m unittest discover -s map04/tests` | 24/24 OK |
| Mutacja 1: zmiana tekstu `POSTCODE_DIFFERENCE` | RED (1 fail), przywrócone |
| Mutacja 2: usunięcie opisu `BUILDING_MISMATCH` | RED (1 fail), przywrócone |
| `npm run build`, Chrome | NOT RUN: zmiana dotyczy tylko testu, artefakt i UI bez zmian |

Review T31: **APPROVE**. Trzy testy pokrywają kryteria briefu. Zbiór kodów jest wyznaczany z danych obu warstw, testowany jest tekst zastępczy dla nieznanego kodu i `undefined` oraz dokładny tekst `POSTCODE_DIFFERENCE`. Istniejące testy są identyczne z bazą.

## Ochrona: co zapobiega, a co tylko wykrywa

- **Zapobiega (potwierdzone):**
  - sandbox Windows `unelevated` (restricted token) odrzuca zapis poza worktree: katalog obok, profil użytkownika, główna kopia MMS (`UnauthorizedAccessException`);
  - `git commit` jest odrzucany (brak zapisu do `.git` głównego repo);
  - limit 3 rund;
  - blokada równoległych rund tego samego zadania (w pilocie tylko akcja Round; od audytu końcowego także Bootstrap, Qa i Unhalt).
- **Sieć:** w środowisku poleceń Codex ustawia `SBX_NONET_ACTIVE`, `CODEX_SANDBOX_NETWORK_DISABLED` i martwe `HTTP(S)_PROXY`/`ALL_PROXY`. To blokada przez politykę i proxy, a nie zapora systemowa. Nie sprawdzałem jej próbą połączenia zewnętrznego.
- **Środowisko:** proces Codexa dostaje 29 zmiennych z allowlisty (bez tokenów, kluczy i proxy użytkownika). Polecenia Codexa: `shell_environment_policy.inherit="core"`.
- **Nie zapobiega:**
  - odczyt plików poza worktree (próba D: odczyt `AGENTS.md` głównej kopii był dozwolony). **Nie deklaruję izolacji sekretów:** pliki profilu, także `auth.json` Codexa, pozostają czytelne;
  - zmiana dowolnego pliku wewnątrz worktree. Wykrywa ją manifest SHA256 po rundzie (przetestowane w E1).
- **Niewyjaśnione:** przy każdym uruchomieniu (także z `--ignore-user-config` i `--disable apps`) stderr zawiera `rmcp::transport::streamable_http_client … DELETE 501`. Codex otwiera więc zdalną sesję MCP przez HTTP. Jej celu nie ustaliłem bez inspekcji ruchu. W zdarzeniach brak wywołań narzędzi MCP.
- `--ignore-user-config` nie wyłącza skilli z `%USERPROFILE%\.codex\skills\`: Codex czytał `repo-orientation`, `change-safety-check` i `pr-readiness-review`.
- `node --test` z domyślną izolacją w sandboxie kończy się `spawn EPERM`. W briefach używamy `--test-isolation=none`, a pełny zestaw uruchamia Claude.

## Błędy mechanizmu wykryte i naprawione w trakcie pilota

1. Brak `windows.sandbox` przy `--ignore-user-config` sprawiał, że Codex nie mógł nic uruchomić. Naprawione jawnym `-c windows.sandbox="unelevated"`.
2. Raport Codexa ze `status: blocked/partial` był przyjmowany jako COMPLETED. Teraz daje kod 13 i zatrzymanie. Kontynuacja wymaga jawnej, logowanej decyzji koordynatora (`-Action Unhalt -Reason`). W SYN2 użyto jej raz: `partial` wynikał wyłącznie ze `spawn EPERM`, a Claude potwierdził testy poza sandboxem.
3. `codex exec resume` nie przyjmuje `--color`. Flaga usunięta; runda ponowiona przez `-Retry`, bez zwiększania licznika.
4. Dodano wybór modelu: domyślny w `task.json` (`model`, `effort`), nadpisanie w rundzie przez `-Model`/`-Effort`, zapis w `checks.json` i `state.json`.

## Audyt końcowy skilla (20.11) i utwardzenie

Niezależny przegląd bezpieczeństwa (osobny recenzent, tylko odczyt) i przegląd Claude: **brak blokady bezpieczeństwa** (wszystkie ścieżki kończą się fail-closed), 7 istotnych i 16 drobnych uwag. Naprawione przed commitem:

| Uwaga | Poprawka |
| --- | --- |
| Ctrl+C / zamknięta konsola nie zapisywały przerwania, a ponowna runda nadpisywała logi | wpis `RUNNING` przed startem Codexa, zamieniany na `INTERRUPTED` przy następnym wywołaniu; katalog rundy i logi nigdy nie są nadpisywane |
| Procesy osierocone przez Codexa | Windows Job Object z `KILL_ON_JOB_CLOSE`; proces żyjący po wyjściu Codexa jest zabijany, a runda kończy się zatrzymaniem `PROCESS_SURVIVORS` |
| `worktreeName` bez walidacji (wyjście poza `%USERPROFILE%\work`) | wzorzec nazwy folderu + kontrola pełnej ścieżki; brief musi leżeć pod `codex-runs` |
| Brak ochrony `.claude/`, `.codex/`, `.github/` | dodane do domyślnej listy chronionej; allowlista odrzuca `**`, `..` i ścieżki absolutne |
| Systemowy `%TEMP%` mógł być zapisywalny | `exclude_tmpdir_env_var`, `exclude_slash_tmp`; `TEMP`/`TMP` wskazują katalog rundy poza repo |
| Qa bez blokady i bez kontroli zakresu | blokada, wymóg rundy COMPLETED, naruszenia na diffie skumulowanym, hash z zamrożonego manifestu |
| QA uruchamia kod Codexa poza sandboxem | opisane w SKILL.md (najpierw przegląd `diff.patch`) |
| drobne | nieznany kod wyjścia → 31; `haltKind` zamiast dopasowania tekstu; zmiana wielkości liter i usunięcie dowiązań wykrywane; walidacja `model`/`effort`/`timeoutMin`/`mode` z `task.json`; raport musi dotyczyć tego zadania i rundy; limit 3 prób na rundę; `-Retry` wymagany po błędzie; `decisions` zawsze tablicą; `argv` i hashe skryptu, schematu, briefu i review w `checks.json`; patch zapisywany bajtowo |

Weryfikacja po zmianach:
- samotest 30/30 (było 17);
- odrzucanie złych specyfikacji w `-WhatIf`;
- **SYN3**, prawdziwy Codex na repozytorium syntetycznym, model `gpt-6.2-sol`:

| Runda | Przebieg | Wynik |
| --- | --- | --- |
| 1 | 89,1 s, effort `medium` | zapis obok worktree, w profilu i w systemowym `%TEMP%` odrzucony, plików brak na dysku; zapis w katalogu tymczasowym rundy dozwolony; Job Object przypięty, 0 procesów pozostawionych, 0 wywołań MCP |
| 1, wynik | `partial`, zatrzymanie (kod 13) | Codex odmówił próby `git commit`, bo zabrania jej preambuła. To konflikt w briefie, nie błąd Codexa. Claude potwierdził testy 5/5 i zdjął zatrzymanie logowaną decyzją `Unhalt -AcceptPartial` |
| 2 | `resume`, ten sam wątek, nadpisanie `-Effort low` | systemowy `%TEMP%` nadal odrzucony; 0 zmian; COMPLETED |
| Qa | | kopia zgodna z hashami; powtórne Qa i runda po zamrożeniu kończą się kodem 31; `diff.patch` nakłada się czysto |

Ponowny przegląd recenzenta potwierdził naprawę wszystkich 7 istotnych uwag i nie wykazał blokady. Zgłosił jedną nową istotną uwagę i trzy drobne; wszystkie naprawione:
- **N1:** zapis manifestu przed zapisem zatrzymania mógł po awarii „zgubić” naruszenie zakresu. Teraz stan zapisuje się przed manifestem.
- stash w głównym checkoutcie między rundami nie kończy już zadania;
- katalog tymczasowy przeniesiony poza katalog stanu;
- ponowienie rundy po `PROCESS_SURVIVORS` opisane w SKILL.md.

Wersję końcową sprawdzono:
- samotest 30/30;
- **SYN4** (prawdziwy Codex, effort `low`): COMPLETED w 56,6 s, 0 naruszeń, 0 procesów pozostawionych;
  - zapis do systemowego `%TEMP%` odrzucony, a w nowym katalogu tymczasowym (`codex-runs\SYN4-tmp\…`) dozwolony;
  - w katalogu stanu nie ma plików Codexa;
  - Qa, a w kopii QA testy Claude 5/5.

## Stan po finalizacji (20.11)

- Lokalne commity bez publikacji: zmiana T31 na gałęzi `codex/T31-location-reason-tests`, skill i ten raport na gałęzi `feature/claude-codex-delegate`. Obie gałęzie wychodzą od `origin/main` `96d9437`.
- Worktree, repozytoria syntetyczne i katalogi diagnostyczne zostają bez usuwania.
