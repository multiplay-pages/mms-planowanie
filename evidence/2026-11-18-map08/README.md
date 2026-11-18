# MAP-08 — dowody (18.11.2026)

- `before/` i `after/` — te same zoomy (przegląd, z9, z11, z13, z15, z17), 1440×900, Chrome 157. `after/` zawiera oba warianty: `after-light-*` (Operational Light) i `after-nav-*` (Professional Navigation). Środek kadru BEFORE i AFTER nie jest identyczny (BEFORE = mapa wbudowana, AFTER = duża mapa); zoomy i wiodący punkt trasy są zgodne.
- `chrome/`, `chrome-1920/`, `chrome-1366/` — audyt 20 scenariuszy (40 sprawdzeń), `served-results.json`.
- `firefox/` — Firefox 160.0.1 (BiDi): `map061-firefox-results.json` (9/9), `map08-firefox-results.json` (15/15) i zrzuty.
- `offline/` — pomiary plików offline (`*-measure-1440.json`) i zrzuty z `file://`.
- `hybrid/` — regresja Hybryda → Drogowa z lokalnym dostawcą testowym (11/11).
- `fallback/` — brak pakietu / pakiet uszkodzony (10/10).
- `scripts/` — skrypty Playwright-core/BiDi użyte do pomiarów. Wymagają lokalnego `lib.mjs` (ścieżka Chrome), nie są częścią `npm test`.

Zrzuty zawierają adresy testowe z planera (te same dane są już w repozytorium). Zrzut użytkownika `MAP-07_TEST-02_24-8-km.jpg` nie jest dodany.
