# Local map and road assessment Implementation Plan

> **For agentic workers:** execute inline with superpowers:executing-plans, tests first; independent read-only review at the end. The directory initially had no Git; the later explicit publication request authorized initialization on the existing remote main history.

**Goal:** complete the coordinator prototype's map and add locally computed road assessment while preserving source addresses and saved plans.

**Architecture:** public uniform regional OSM extract → sanitized road/background data → local Python directed graph and precomputed pair results → existing JS planner. Nothing sends order coordinates externally. Both modular and offline artifacts use local snapshots.

**Tech Stack:** existing Python standard library and JavaScript modules; no production dependency or external runtime API.

**Spec:** `PLANNER-SCOPE.md`, original user attachment, latest user direction to continue, and explicit selection of local routing without coordinate transfer.

## Global constraints

- Keep source XLSX/CSV, MAP-04 fixture, datasetId, order IDs and saved plan v1 unchanged.
- Use all 109 supplied addresses; 102 currently located. Do not invent the missing coordinates or 11 additional addresses.
- No repeated QGIS address verification, OSRM/other external route calls, MMS/Notion writes, publication or secrets.
- Respect recorded browser-policy denial; no alternate renderer/browser/CDP to circumvent it.
- 30 km between installations, combined +10 km for measurements and service+travel windows are working model checks, not approved operational policy.
- No straight-line distance substituted for unknown road distance. No navigation/traffic guarantee; service and speed assumptions are synthetic and visible.

## Review focus

- One-way streets, disallowed car access, gates and turns must not become legal edges by ignoring tags.
- Unsupported conditional/via-way restrictions must be conservative and reported.
- Failed/partial extracts, unsnappable points and disconnected roads must remain unknown, never 0 km.
- Adding road assessment must not invalidate or erase existing manually edited/confirmed plans.
- Full regional data must remain responsive at wide view and show actual local streets on zoom.

### Task 1: Public regional map and road input

Files: new `basemap/download_regional.py`, `tests/test_regional_basemap.py`, generated `basemap/planner-data.json` and sanitized road input. Interface: `convert(elements)` retains only road geometry/topology, relevant car tags, barrier nodes and turn restrictions; fixed public bounds (17.2,49.9,19.0,51.5), no address catalog reads or queries.

- [x] RED: road conversion preserves shared node IDs, strips contact/authorship/buildings, rejects partial/malformed geometry.
- [x] GREEN: implement converter and explicit `--execute` public download with bounded response, checkpoint, attribution and date/hash.
- [x] Verify source coverage for all 102 points locally; no private data in outbound query.

### Task 2: Local route computation

Files: new `local_routing.py`, `build_local_routes.py`, `tests/test_local_routing.py`, generated `data/local-routes.json`.
Interface: `RoadGraph(data).route(points)` returns road distance, estimated duration, snapped endpoints, geometry and provenance or explicit unavailable reason. Precompute all currently located pairs locally, never by network.

- [x] RED: directed reachability, access precedence, barrier, no/only turns, disconnection, snapping thresholds, inclusive exact distance boundaries.
- [x] GREEN: nonnegative shortest road paths with incoming-edge state; conservatively remove unsupported restricted roads. Estimated speeds documented, no fabricated traffic.
- [x] Generate route snapshot with source/dataset identities and a local coverage report.

### Task 3: Planner integration

Files: new `routes.mjs`; change `planner-model.mjs`, `planner.mjs/html/css`, builder/server and matching tests.
Interfaces: `mergeRoutes(datasetId, layer)`, `assessBasket(scenario, plan, teamId, date)`, optional third route-layer argument to `createScenario`.

- [x] RED: 30 km actual chain via measurements, shared +10 km delta, missing first/last anchors, service+travel windows, manual edits, preserved saved v1 plans, source layer mismatch.
- [x] GREEN: generation rejects known road/time violations; manual proposals show explicit results. Legacy/imported plans remain inspectable and editable, with warnings instead of destructive migration.
- [x] Show road geometry for selected basket, sequence and meaningful distances/estimated times. Unknown remains unknown.
- [x] Render regional map at viewport-appropriate detail; keep mouse/keyboard selection and pan/zoom in sync.

### Task 4: Delivery and evidence

- [x] Run targeted RED→GREEN checks, full JS and Python suites, build both artifacts, syntax/CSP/source integrity.
- [x] Independent read-only review and fix important issues with regression tests.
- [x] Update README/VERIFICATION with actual behavior, file list, exact commands and remaining data/browser evidence gaps. Do not call the entire task complete while required evidence remains missing.

## Ledger

- 17.11: source state restored; 102/102 prior tests PASS already recorded; no unchanged work repeated.
- 17.11: external OSRM proposal rejected by user; local-only approach selected. No coordinate transfer.
- 17.11: local graph and public regional background chosen to preserve privacy and existing no-API runtime. Times remain estimates.
- 17.11: user explicitly chose to leave the 7 unlocated points without positions. No QGIS read or new location transfer; these remain in the catalog with no marker/road proof.
- 17.11: Overpass large requests failed (502/timeout), smaller GET also502; changed method to published, checksummed Geofabrik province PBF files rather than further endpoint retries. Parser is an isolated parallel module; main planner implementation remains here.

## Publication handoff

- [x] User explicitly authorized public GitHub including addresses, coordinates and complete planner.
- [x] Source/build/data tests: 180/180 PASS; source/CSP/syntax checks PASS.
- [x] Independent review P2 fixed with RED→GREEN regressions for source baskets and legacy repair.
- [x] Detailed history, architecture, decisions, runbook and Aion UI handoff written.
- [ ] Publish and independently verify remote commit/files; record the result.

Browser visual gate remains unexecuted in this session due the recorded tool policy. It is a next-environment task, not a claimed PASS.
