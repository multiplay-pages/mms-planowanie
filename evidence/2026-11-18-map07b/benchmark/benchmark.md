### EMPTY: Pusty plan, 3 dni, pełna dostępność

| Wariant | Zaplanowane (inst.+pom.) | Najstarsze w planie | Dni oczekiwania | km | min dojazdu | Puste sloty / nieuzasadnione | Odch. std. obciążenia | Naruszenia | Chronione bez zmian | Czas [ms] |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MAP-06 (obecny generator) | 40 (40+0) | 30/40 | 585 | 388 | 597 | 1 / 0 | 0.083 | 0 | tak | 97 |
| MAP-07A (tylko kolejność w koszykach) | 40 (40+0) | 30/40 | 585 | 353.3 | 538 | 1 / 0 | 0.083 | 0 | tak | 102 |
| MAP-07B · Starszeństwo najpierw | 39 (37+2) | 33/40 | 583 | 254.1 | 408 | 2 / 0 | 0.113 | 0 | tak | 3855 |
| MAP-07B · Liczba i czas oczekiwania, potem km | 41 (40+1) | 31/40 | 612 | 304.5 | 474 | 0 / 0 | 0 | 0 | tak | 3804 |
| MAP-07B · Równomierność przed kilometrami | 41 (40+1) | 31/40 | 612 | 304.5 | 474 | 0 / 0 | 0 | 0 | tak | 3761 |

### PROTECTED: Z chronionymi przydziałami (1 potwierdzony, 2 ręczne)

| Wariant | Zaplanowane (inst.+pom.) | Najstarsze w planie | Dni oczekiwania | km | min dojazdu | Puste sloty / nieuzasadnione | Odch. std. obciążenia | Naruszenia | Chronione bez zmian | Czas [ms] |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MAP-06 (obecny generator) | 39 (38+1) | 27/36 | 576 | 362.5 | 559 | 2 / 0 | 0.166 | 0 | tak | 153 |
| MAP-07A (tylko kolejność w koszykach) | 39 (38+1) | 27/36 | 576 | 349.9 | 551 | 2 / 0 | 0.166 | 0 | tak | 253 |
| MAP-07B · Starszeństwo najpierw | 39 (37+2) | 28/36 | 590 | 259.9 | 406 | 2 / 0 | 0.166 | 0 | tak | 3577 |
| MAP-07B · Liczba i czas oczekiwania, potem km | 39 (37+2) | 26/36 | 581 | 326.4 | 522 | 2 / 0 | 0.166 | 0 | tak | 2645 |
| MAP-07B · Równomierność przed kilometrami | 39 (37+2) | 26/36 | 581 | 326.4 | 522 | 2 / 0 | 0.166 | 0 | tak | 2603 |

### REDUCED: Ograniczona dostępność (19.11: ekipy 2 i 4 bez okna 3, ekipa 5 wyłączona)

| Wariant | Zaplanowane (inst.+pom.) | Najstarsze w planie | Dni oczekiwania | km | min dojazdu | Puste sloty / nieuzasadnione | Odch. std. obciążenia | Naruszenia | Chronione bez zmian | Czas [ms] |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MAP-06 (obecny generator) | 36 (36+0) | 27/36 | 535 | 315.7 | 491 | 0 / 0 | 0 | 0 | tak | 102 |
| MAP-07A (tylko kolejność w koszykach) | 36 (36+0) | 27/36 | 535 | 290.1 | 445 | 0 / 0 | 0 | 0 | tak | 98 |
| MAP-07B · Starszeństwo najpierw | 36 (34+2) | 28/36 | 553 | 275.8 | 424 | 0 / 0 | 0 | 0 | tak | 3142 |
| MAP-07B · Liczba i czas oczekiwania, potem km | 36 (35+1) | 28/36 | 556 | 258.6 | 416 | 0 / 0 | 0 | 0 | tak | 3699 |
| MAP-07B · Równomierność przed kilometrami | 36 (35+1) | 28/36 | 556 | 258.6 | 416 | 0 / 0 | 0 | 0 | tak | 3265 |


Najdłuższy odcinek w koszykach (EMPTY): MAP-06 vs MAP-07B AGE_FIRST
{"date":"2026-11-18","teamId":"TEST-01","before":{"orders":["TEST-013","TEST-049","TEST-017"],"m":32839.233,"longest":26359.206},"after":{"orders":["TEST-013","TEST-049","TEST-017"],"m":32839.233,"longest":26359.206}}
{"date":"2026-11-18","teamId":"TEST-02","before":{"orders":["TEST-025","TEST-062","TEST-039"],"m":25647.578999999998,"longest":22035.192},"after":{"orders":["TEST-062","TEST-039","TEST-025"],"m":23423.226,"longest":19810.839}}
{"date":"2026-11-18","teamId":"TEST-04","before":{"orders":["TEST-037","TEST-085","TEST-074"],"m":39717.225,"longest":24099.434},"after":{"orders":["TEST-037","TEST-085","TEST-074"],"m":39717.225,"longest":24099.434}}
{"date":"2026-11-19","teamId":"TEST-01","before":{"orders":["TEST-014","TEST-034","TEST-070"],"m":35832.41,"longest":28625.29},"after":{"orders":["TEST-014","TEST-004","TEST-070"],"m":29905.573,"longest":22106.45}}
{"date":"2026-11-19","teamId":"TEST-02","before":{"orders":["TEST-026","TEST-038","TEST-050"],"m":21818.668999999998,"longest":21493.334},"after":{"orders":["TEST-099","TEST-006","TEST-026"],"m":17254.099000000002,"longest":10152.549}}
{"date":"2026-11-19","teamId":"TEST-04","before":{"orders":["TEST-098","TEST-029","TEST-101"],"m":54408.100999999995,"longest":27752.656},"after":{"orders":["TEST-051","TEST-029","TEST-027"],"m":22029.23,"longest":11086.734}}
{"date":"2026-11-19","teamId":"TEST-05","before":{"orders":["TEST-005","TEST-041"],"m":26118.82,"longest":26118.82},"after":{"orders":["TEST-098","TEST-050","TEST-038"],"m":1809.267,"longest":1483.932}}
{"date":"2026-11-20","teamId":"TEST-02","before":{"orders":["TEST-027","TEST-051","TEST-090"],"m":42199.162,"longest":22716.346},"after":{"orders":["TEST-015","TEST-005"],"m":21318.786,"longest":21318.786}}
