# N2 (light run, 558 żądań do dostawcy) — rekwalifikacja po fakcie

Przebieg `MAP09_LIGHT=1` zakończył N2 jako **FAIL**: lista dozwolonych ścieżek audytu nie znała ścieżki `natural_earth/ne2sr/{z}/{x}/{y}.png`.
Inspekcja `light-1366x768/provider-audit.json`: 15 odchyleń, wszystkie tej samej klasy (rastrowe kafle cieniowanego reliefu Natural Earth, używane przez Liberty na niskich zoomach). Pozostałe kryteria (metoda GET, brak ciała, brak Referer/cookie/Authorization, brak query-stringa, brak nazw punktów w ścieżce) — 0 odchyleń w 558 żądaniach.
Lista dozwolonych ścieżek w `qa/common.mjs` została rozszerzona **po zaobserwowaniu** tej klasy; przebieg nie był powtarzany (oszczędność żądań do dostawcy). Wynik zapisany w `online-results.json` pozostaje „FAIL” zgodnie z faktycznym przebiegiem.
