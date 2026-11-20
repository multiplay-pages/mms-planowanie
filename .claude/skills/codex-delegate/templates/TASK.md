# <TaskId> — <krótki tytuł>

Kontrakt zadania dla Codexa. Format wynika z `docs/PRZEKAZANIE-AION-UI.md` („Każde przekazanie zawiera…”). Pisz zwięźle, bez kopiowania transcriptu.

- **Cel:** <jedno zdanie: co ma być prawdą po zadaniu>
- **Baza:** `<40-znakowy SHA>` (worktree tworzy skrypt; nie przełączaj gałęzi)
- **Dozwolone pliki (allowlist):** `<ścieżka>` [, …] — zmiana czegokolwiek innego zatrzymuje pętlę
- **Zakazy:** pliki chronione z `task.json`/skryptu (planer, dane MAP-05, XLSX/CSV, fixture MAP-04, algorytmy, `.claude/`, `.codex/`), commit/push/stash, sieć, instalacja pakietów, procesy w tle, `npm run build`, downloadery `--execute`. Pliki robocze wyłącznie w katalogu `TEMP`.
- **Kontekst / kontrakty wejścia-wyjścia:** <funkcje, pliki, oczekiwane zachowanie; odwołania `plik:linia`>
- **Kryteria akceptacji (mierzalne):**
  1. <…>
- **Polecenia testów, które uruchomisz:** `<polecenie>` (z katalogu `<…>`; dla Node: `node --test --test-isolation=none <pliki>`)
- **Próby sandboxa:** <brak> | <lista prób do wpisania w `sandbox_probes`>
- **Otwarte kwestie:** <…>

Raport końcowy: pojedynczy obiekt JSON zgodny ze schematem (pola `files_changed`, `commands_run` z rzeczywistymi kodami wyjścia, `acceptance`, `open_issues`).
