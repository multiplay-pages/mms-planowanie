# MMS Planowanie 2.0 — entry point for Claude Code

Read `AGENTS.md`, `docs/PRZEKAZANIE-AION-UI.md`, `docs/DECYZJE-I-ZAKRES.md` and the latest `map05/VERIFICATION.md` before work. Full history: `docs/HISTORIA-PRAC.md`; implementation contracts: `docs/ARCHITEKTURA.md`.

The active app is `map05/planner-offline.html` / `planner.html`, not the legacy `offline.html` / `index.html`. Existing customer-day plans use stable dataset/order IDs and must survive enrichment.

No external routing calls, no renewed QGIS address verification, no invented coordinates for the seven intentionally unlocated points. Runtime is local/offline. Preserve original XLSX/CSV and MAP-04 fixture. Read current user decisions before interpreting historical brief restrictions.

For Aion UI collaboration, assign one writer per file/branch and one coordinator for integration. Do not run simultaneous edits of planner/model/build artifacts. Verify current tools instead of assuming another agent's integrations exist.

Commands and test distinctions are in `docs/URUCHOMIENIE-I-TESTY.md`. Restore tracked public gzip assets with `python -X utf8 map05/prepare_assets.py` after clone; do not download source maps or geocode again as a routine setup step.
