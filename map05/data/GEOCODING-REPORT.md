# Wyniki Geoapify — ocena lokalna

Źródło CSV: `geocoded_by_geoapify-16.11.2026, 16_49_56.csv`; SHA256 `06b5df049f5aaf2b058cbc6686d503ac64a569b1c6930f9731950aa97b288ae0`.
Katalog adresowy / datasetId: `f7037869ea5bed2d5c0b05416198feda9619b79351f2056501e3b64a79d3d08c`. XLSX i CSV pozostawiono bez zmian.

- Rozliczono: **109 / 109** wejść, po `original_address`, nie po kolejności.
- Zgodne dopasowania budynków: **46** — te punkty trafiają na mapę.
- Do weryfikacji: **63** — współrzędne kandydata zachowano, ale nie użyto jako pewnego punktu.

Warunki: zgodny kraj, numer budynku (łącznie z literą), miejscowość, kod pocztowy i nazwa ulicy po usunięciu prefiksu ul./ulica; confidence ogólny, miejscowości, budynku i wymaganej ulicy ≥ 0,95. Brak confidence budynku nie jest zastępowany confidence ogólnym. Rozwinięcia patronów ulic pozostają do sprawdzenia, bez niejawnych aliasów.

To automatyczna kontrola zgodności odpowiedzi dostawcy, nie niezależne potwierdzenie fizycznej lokalizacji, zasięgu sieci ani wykonalności trasy. Nie wykonano ponownego geokodowania, routingu i zewnętrznych zapytań.

Pochodzenie danych: Geoapify; © OpenStreetMap contributors, Open Database License. Atrybucję każdego rekordu zachowano w warstwie JSON. https://www.openstreetmap.org/copyright

## Rekordy do sprawdzenia

| Wiersz XLSX | Adres wejściowy | Wynik Geoapify | Powody |
| --- | --- | --- | --- |
| 2 | 46-070 Wawelno, ul. Leśna 32A | Leśna 32, 46-070 Wawelno, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony |
| 4 | 44-194 Knurów, ul. Mieszka I 23A/9 | Mieszka I 23, 44-194 Knurów, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony |
| 5 | 48-155 Mokre, 9 | 48-155 Radynia, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 9 | 44-178 Przyszowice, ul. Powstańców Śląskich 91B | Powstańców Śląskich 91, 44-178 Przyszowice, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony |
| 10 | 46-081 Dobrzeń Wielki, ul. Żeromskiego 48 | Stefana Żeromskiego 48, 46-081 Dobrzeń Wielki, Polska | Nazwa ulicy nie jest identyczna po usunięciu prefiksu ul./ulica; Ogólna pewność wyniku jest mniejsza niż 0,95 lub nie została podana; Pewność budynku jest mniejsza niż 0,95 lub nie została podana; Pewność ulicy jest mniejsza niż 0,95 lub nie została podana |
| 12 | 56-400 Zimnica, 17C | 56-400 Oleśnica, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 15 | 48-118 Ściborzyce Małe, 40 | 48-118 Kietlice, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 16 | 56-400 Gręboszyce, 12B | 56-400 Oleśnica, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 17 | 46-380 Dobrodzień, ul. Powstańców Śląskich 2B | Powstańców Śląskich 2, 46-380 Dobrodzień, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony |
| 19 | 46-040 Ozimek, ul. 8 Marca 3B/9 | 8 Marca, 46-040 Ozimek, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 20 | 46-023 Osowiec, ul. Dworcowa 7B/2 | Dworcowa 7, Osowiec-Osiedle, 46-045 Osowiec, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Kod pocztowy jest inny lub nie został zwrócony |
| 25 | 48-118 Lisięcice, ul. Słowackiego 32 | Juliusza Słowackiego 32, 48-118 Lisięcice, Polska | Nazwa ulicy nie jest identyczna po usunięciu prefiksu ul./ulica; Ogólna pewność wyniku jest mniejsza niż 0,95 lub nie została podana; Pewność budynku jest mniejsza niż 0,95 lub nie została podana; Pewność ulicy jest mniejsza niż 0,95 lub nie została podana |
| 26 | 56-410 Białe Błoto, 17D | 56-410 Strzelce, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 29 | 48-140 Niekazanice, 64 | 48-140 Posucice, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 30 | 45-920 Opole, ul. Studzienna 19E | Studzienna 19, 46-020 Opole, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Kod pocztowy jest inny lub nie został zwrócony |
| 33 | 56-410 Białe Błoto, 35 | 56-410 Strzelce, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 34 | 56-400 Smolna, 131 | 56-400 Oleśnica, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 35 | 48-155 Opawica, 7 | 48-155 Radynia, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 37 | 44-213 Książenice, ul. Księdza Pojdy 100C | Szkoła Podstawowa imienia Stanisława Ligonia, Księdza Jana Pojdy 100, 44-213 Książenice, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Nazwa ulicy nie jest identyczna po usunięciu prefiksu ul./ulica; Ogólna pewność wyniku jest mniejsza niż 0,95 lub nie została podana; Pewność budynku jest mniejsza niż 0,95 lub nie została podana; Pewność ulicy jest mniejsza niż 0,95 lub nie została podana |
| 38 | 46-333 Ligota Oleska, 5 | 46-333 Ligota Oleska, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 39 | 46-050 Tarnów Opolski, ul. 1 Maja 29G/4 | 1 Maja, 46-050 Tarnów Opolski, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 40 | 56-400 Sokołowice, 100PB | 56-400 Oleśnica, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 41 | 56-400 Zimnica, 17B | 56-400 Oleśnica, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 42 | 56-400 Cieśle, 39CB | 56-400 Oleśnica, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 44 | 46-233 Bogdańczowice, 26B | 46-233 Bogdańczowice, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 45 | 46-220 Kochłowice, 3A | 46-220 Byczyna, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 47 | 46-300 Borki Wielkie, ul. Kolonia Kuźnica Borecka 27A | Kolonia Kuźnica Borecka 27, 46-300 Borki Wielkie, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony |
| 49 | 46-080 Chróścice, ul. Orzeszkowej 4 | Elizy Orzeszkowej 4, 46-080 Chróścice, Polska | Nazwa ulicy nie jest identyczna po usunięciu prefiksu ul./ulica; Ogólna pewność wyniku jest mniejsza niż 0,95 lub nie została podana; Pewność budynku jest mniejsza niż 0,95 lub nie została podana; Pewność ulicy jest mniejsza niż 0,95 lub nie została podana |
| 52 | 46-024 Brynica, ul. Stawowa 1A | Stawowa 1, 46-024 Brynica, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony |
| 54 | 56-400 Krzeczyn, 3B | 56-400 Oleśnica, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 56 | 46-045 Turawa, ul. Kościuszki 12 | Tadeusza Kościuszki 12, 46-045 Turawa, Polska | Nazwa ulicy nie jest identyczna po usunięciu prefiksu ul./ulica; Ogólna pewność wyniku jest mniejsza niż 0,95 lub nie została podana; Pewność budynku jest mniejsza niż 0,95 lub nie została podana; Pewność ulicy jest mniejsza niż 0,95 lub nie została podana |
| 60 | 56-410 Dobra, 66F | Dobra, powiat turecki, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Kod pocztowy jest inny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 61 | 46-310 Szyszków, 35 | 46-310 Gorzów Śląski, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 62 | 46-250 Szum, 101 | 46-250 Szum, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 63 | 56-400 Cieśle, 36G | 56-400 Oleśnica, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 64 | 56-400 Poniatowice, 187F | Poniatowice-Kolonia, 56-400 Poniatowice, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 65 | 56-400 Smolna, 22C | Smolna 56, 44-300 Wodzisław Śląski, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Kod pocztowy jest inny lub nie został zwrócony; Ogólna pewność wyniku jest mniejsza niż 0,95 lub nie została podana; Pewność miejscowości jest mniejsza niż 0,95 lub nie została podana |
| 66 | 56-400 Sokołowice, 100O | 56-400 Oleśnica, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 68 | 44-213 Rybnik, ul. Arki Bożka 51I | Arki Bożka, 44-213 Rybnik, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 69 | 48-120 Sułków, 9A | Sułków, powiat włoszczowski, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Kod pocztowy jest inny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 70 | 46-211 Maciejów, 39/2 | 46-211 Maciejów, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 71 | 48-155 Chomiąża, 37 | 48-155 Radynia, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 72 | 49-340 Nowa Wieś Mała, 8C | 49-340 Lewin Brzeski, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 73 | 46-083 Stare Siołkowice, ul. Klapacz 127A | Klapacz 127, 46-083 Stare Siołkowice, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony |
| 74 | 56-400 Boguszyce, 22E/2 | 56-400 Oleśnica, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 75 | 46-275 Chudoba, 169 | 46-275 Chudoba, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 76 | 56-400 Boguszyce, 23S | 56-400 Oleśnica, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 78 | 49-100 Brzęczkowice, 15A | 49-100 Niemodlin, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 79 | 56-400 Ostrowina, 105H | 56-400 Oleśnica, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 80 | 56-400 Ostrowina, 106L | 56-400 Oleśnica, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 83 | 47-120 Zawadzkie, ul. Miarki 7/7 | Karola Miarki 7, 47-120 Zawadzkie, Polska | Nazwa ulicy nie jest identyczna po usunięciu prefiksu ul./ulica; Ogólna pewność wyniku jest mniejsza niż 0,95 lub nie została podana; Pewność budynku jest mniejsza niż 0,95 lub nie została podana; Pewność ulicy jest mniejsza niż 0,95 lub nie została podana |
| 87 | 46-045 Kotórz Wielki, ul. Polna 23B | Polna 23, 46-045 Kotórz Wielki, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony |
| 88 | 46-300 Borki Małe, ul. Oleska 2A | Oleska 2, 46-300 Borki Małe, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony |
| 89 | 56-400 Piszkawa, 8I | Piszkawa, powiat oleśnicki, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Kod pocztowy jest inny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 94 | 46-324 Kościeliska, 53A | Kościeliska 46, 46-324 gmina Radłów, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Ogólna pewność wyniku jest mniejsza niż 0,95 lub nie została podana; Pewność miejscowości jest mniejsza niż 0,95 lub nie została podana |
| 96 | 56-410 Białe Błoto, 31 | 56-410 Strzelce, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Miejscowość wyniku różni się od wejściowej; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 98 | 46-320 Sołtysy, BN | Sołtysy, powiat oleski, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Kod pocztowy jest inny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 102 | 49-130 Szydłów, ul. Opolska 24 | Opolska 24, 49-130 Tułowice, Polska | Miejscowość wyniku różni się od wejściowej |
| 104 | 56-410 Miodary, 15A | 56-410 Miodary, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 105 | 47-208 Dębowa, ul. Główna 8A | Główna 8, 47-208 Dębowa, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony |
| 106 | 44-177 Paniówki, ul. Gliwicka BN3 | Gliwicka, 44-177 Paniówki, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
| 110 | 46-100 Namysłów, ul. Kazimierza Pułaskiego 18/2 | Kazimierza Pułaskiego 18a, 46-100 Namysłów, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony |
| 111 | 46-048 Zębowice, ul. Leśna BN1 | Leśna, 46-048 Zębowice, Polska | Numer budynku jest niepełny, różny lub nie został zwrócony; Pewność budynku jest mniejsza niż 0,95 lub nie została podana |
