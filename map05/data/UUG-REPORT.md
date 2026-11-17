# GUGiK — porównanie lokalizacji potwierdzonych adresów

Adresy użytkownika były już sprawdzone w QGIS. Nie prowadzono tam dalszej weryfikacji i nie zmieniano adresów pod odpowiedzi geokoderów.

Rozliczono **109/109** rekordów: **96 pełnych zgodności**, **6 jednoznacznych punktów budynków z różnym kodem pocztowym**, **7 lokalizacji nadal nieustalonych jednoznacznie**.
Brak wyniku, nieobsłużony numer lub błąd odpowiedzi nie oznacza błędnego adresu w bazie użytkownika.

Źródło: https://services.gugik.gov.pl/uug/ ; metoda GetAddress, exact_number=1, srid=4326. Weryfikacja pól: pełny numer z literą, miejscowość/część miejscowości, kod, zarejestrowana ulica i jeden zgodny punkt. UUG może rozpoznać część nazwy ulicy z identyfikatorem ULIC; jego ogólny wskaźnik accuracy nie jest confidence Geoapify.

Różny kod pocztowy nie zmienia źródłowego adresu. Punkt z taką uwagą jest dopuszczony wyłącznie wtedy, gdy usługa zwróciła dokładnie jednego kandydata, numer/miejscowość/ulica i identyfikatory są zgodne, a oba poprawne kody mają ten sam dwucyfrowy prefiks. Wieloznaczny Maciejów pozostaje poza mapą. Na mapie takie punkty mają osobne oznaczenie i uwagę.

SHA256 surowego wyniku: `3c02bdf9304a165bcaa263172b6f4102330a5e5c317f30301364cebf79675462`; datasetId `f7037869ea5bed2d5c0b05416198feda9619b79351f2056501e3b64a79d3d08c`. Surowe odpowiedzi i metadane prób zachowano w `uug-responses.json`. Oryginalne XLSX i CSV pozostają bez zmian.

| Wiersz XLSX | Adres źródłowy | Wynik GUGiK | Stan / uwagi | Poprzedni Geoapify |
| --- | --- | --- | --- | --- |
| 2 | 46-070 Wawelno, ul. Leśna 32A | Wawelno, Leśna 32a, 46-070 | Dopasowany punkt | nierozstrzygnięty |
| 3 | 46-250 Wąsice, ul. Główna 20 | Wąsice, Główna 20, 46-250 | Dopasowany punkt | dopasowany |
| 4 | 44-194 Knurów, ul. Mieszka I 23A/9 | Knurów, Mieszka I 23a, 44-194 | Dopasowany punkt | nierozstrzygnięty |
| 5 | 48-155 Mokre, 9 | Mokre 9, 48-155 | Dopasowany punkt | nierozstrzygnięty |
| 6 | 46-113 Wilków, ul. Długa 149/1 | Wilków, Długa 149, 46-113 | Dopasowany punkt | dopasowany |
| 7 | 46-040 Ozimek, ul. Juliusza Słowackiego 3A/5 | Ozimek, Juliusza Słowackiego 3A, 46-040 | Dopasowany punkt | dopasowany |
| 8 | 47-280 Grudynia Wielka, ul. Leśna 1A/5 | Grudynia Wielka, Leśna 1A, 47-280 | Dopasowany punkt | dopasowany |
| 9 | 44-178 Przyszowice, ul. Powstańców Śląskich 91B | Przyszowice, Powstańców Śląskich 91B, 44-178 | Dopasowany punkt | nierozstrzygnięty |
| 10 | 46-081 Dobrzeń Wielki, ul. Żeromskiego 48 | Dobrzeń Wielki, Żeromskiego 48, 46-081 | Dopasowany punkt | nierozstrzygnięty |
| 11 | 46-048 Radawie, ul. Opolska 73 | Radawie, Opolska 73, 46-048 | Dopasowany punkt | dopasowany |
| 12 | 56-400 Zimnica, 17C | Zimnica 17C, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 13 | 46-243 Borkowice, ul. Bogacka 24 | Borkowice, Bogacka 24, 46-243 | Dopasowany punkt | dopasowany |
| 14 | 49-340 Lewin Brzeski, ul. Rynek 25/2 | Lewin Brzeski, Rynek 25, 49-340 | Dopasowany punkt | dopasowany |
| 15 | 48-118 Ściborzyce Małe, 40 | Ściborzyce Małe 40, 48-118 | Dopasowany punkt | nierozstrzygnięty |
| 16 | 56-400 Gręboszyce, 12B | Gręboszyce 12b, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 17 | 46-380 Dobrodzień, ul. Powstańców Śląskich 2B | Dobrodzień, Powstańców Śląskich 2B, 46-380 | Dopasowany punkt | nierozstrzygnięty |
| 18 | 45-403 Opole, ul. Rozmarynowa 6/1 | Opole, Rozmarynowa 6, 45-403 | Dopasowany punkt | dopasowany |
| 19 | 46-040 Ozimek, ul. 8 Marca 3B/9 | Ozimek, 8 Marca 3B, 46-040 | Dopasowany punkt | nierozstrzygnięty |
| 20 | 46-023 Osowiec, ul. Dworcowa 7B/2 | Osowiec, Dworcowa 7b, 46-045 | Jednoznaczny punkt budynku; kod pocztowy usługi różni się od źródłowego (oba zachowano) | nierozstrzygnięty |
| 21 | 45-662 Opole, ul. Kredytowa 19/2 | Opole, Kredytowa 19, 45-662 | Dopasowany punkt | dopasowany |
| 22 | 47-325 Kamień Śląski, ul. Wapienna 1 | Kamień Śląski, Wapienna 1, 47-320 | Jednoznaczny punkt budynku; kod pocztowy usługi różni się od źródłowego (oba zachowano) | dopasowany |
| 23 | 47-180 Izbicko, ul. Powstańców Śląskich 17 | Izbicko, Powstańców Śląskich 17, 47-180 | Dopasowany punkt | dopasowany |
| 24 | 46-300 Wachów, ul. Pawła Kuczki 48 | Wachów, Pawła Kuczki 48, 46-300 | Dopasowany punkt | dopasowany |
| 25 | 48-118 Lisięcice, ul. Słowackiego 32 | Lisięcice, Słowackiego 32, 48-118 | Dopasowany punkt | nierozstrzygnięty |
| 26 | 56-410 Białe Błoto, 17D | Białe Błoto 17D, 56-410 | Dopasowany punkt | nierozstrzygnięty |
| 27 | 46-042 Szczedrzyk, ul. Rybacka 7 | Szczedrzyk, Rybacka 7, 46-042 | Dopasowany punkt | dopasowany |
| 28 | 45-841 Opole, ul. Pisankowa 9/2 | Opole, Pisankowa 9, 45-841 | Dopasowany punkt | dopasowany |
| 29 | 48-140 Niekazanice, 64 | Niekazanice 64, 48-140 | Dopasowany punkt | nierozstrzygnięty |
| 30 | 45-920 Opole, ul. Studzienna 19E | Opole, Studzienna 19E, 45-920 | Dopasowany punkt | nierozstrzygnięty |
| 31 | 46-264 Krzywiczyny, ul. Wołczyńska 54 | Krzywiczyny, Wołczyńska 54, 46-264 | Dopasowany punkt | dopasowany |
| 32 | 47-280 Grudynia Wielka, ul. Leśna 3C/2 | Grudynia Wielka, Leśna 3C, 47-280 | Dopasowany punkt | dopasowany |
| 33 | 56-410 Białe Błoto, 35 | Białe Błoto 35, 56-410 | Dopasowany punkt | nierozstrzygnięty |
| 34 | 56-400 Smolna, 131 | Smolna 131, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 35 | 48-155 Opawica, 7 | Opawica 7, 48-155 | Dopasowany punkt | nierozstrzygnięty |
| 36 | 46-030 Grabice, ul. Wiejska 26 | Grabice, Wiejska 26, 46-030 | Dopasowany punkt | dopasowany |
| 37 | 44-213 Książenice, ul. Księdza Pojdy 100C | Książenice, Księdza Pojdy 100C, 44-213 | Dopasowany punkt | nierozstrzygnięty |
| 38 | 46-333 Ligota Oleska, 5 | Ligota Oleska 5, 46-333 | Dopasowany punkt | nierozstrzygnięty |
| 39 | 46-050 Tarnów Opolski, ul. 1 Maja 29G/4 | Tarnów Opolski, 1 Maja 29G, 46-050 | Dopasowany punkt | nierozstrzygnięty |
| 40 | 56-400 Sokołowice, 100PB | Sokołowice 100PB, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 41 | 56-400 Zimnica, 17B | Zimnica 17b, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 42 | 56-400 Cieśle, 39CB | Cieśle 39CB, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 43 | 46-312 Kucoby, ul. Spacerowa 62 | Kucoby, Spacerowa 62, 46-312 | Dopasowany punkt | dopasowany |
| 44 | 46-233 Bogdańczowice, 26B | Bogdańczowice 26B, 46-233 | Dopasowany punkt | nierozstrzygnięty |
| 45 | 46-220 Kochłowice, 3A | Kochłowice 3A, 46-220 | Dopasowany punkt | nierozstrzygnięty |
| 46 | 46-040 Krasiejów, ul. Rzeczna 10 | Krasiejów, Rzeczna 10, 46-040 | Dopasowany punkt | dopasowany |
| 47 | 46-300 Borki Wielkie, ul. Kolonia Kuźnica Borecka 27A | Borki Wielkie, Kolonia Kuźnica Borecka 27A, 46-300 | Dopasowany punkt | nierozstrzygnięty |
| 48 | 47-175 Kadłub, ul. Krótka 17 | Kadłub, Krótka 17, 47-175 | Dopasowany punkt | dopasowany |
| 49 | 46-080 Chróścice, ul. Orzeszkowej 4 | Chróścice, Orzeszkowej 4, 46-080 | Dopasowany punkt | nierozstrzygnięty |
| 50 | 49-345 Skorogoszcz, ul. Jakuba Kani 5/12 | Skorogoszcz, Jakuba Kani 5, 49-345 | Dopasowany punkt | dopasowany |
| 51 | 46-050 Tarnów Opolski, ul. Osiedle Zakładowe 1A/6 | Tarnów Opolski, Osiedle Zakładowe 1A, 46-050 | Dopasowany punkt | dopasowany |
| 52 | 46-024 Brynica, ul. Stawowa 1A | Brynica, Stawowa 1A, 46-024 | Dopasowany punkt | nierozstrzygnięty |
| 53 | 46-380 Rzędowice, ul. Wolna 1 | Rzędowice, Wolna 1, 46-380 | Dopasowany punkt | dopasowany |
| 54 | 56-400 Krzeczyn, 3B | Krzeczyn 3b, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 55 | 46-081 Dobrzeń Wielki, Osiedle Energetyk 4A/4 | Dobrzeń Wielki, Osiedle Energetyk 4A, 46-081 | Dopasowany punkt | dopasowany |
| 56 | 46-045 Turawa, ul. Kościuszki 12 | Turawa, Kościuszki 12, 46-045 | Dopasowany punkt | nierozstrzygnięty |
| 57 | 46-312 Kucoby, ul. Kiki 27 | Kucoby, Kiki 27, 46-312 | Dopasowany punkt | dopasowany |
| 58 | 56-400 Bystre, ul. Jesienna 3 | Bystre, Jesienna 3, 56-400 | Dopasowany punkt | dopasowany |
| 59 | 43-178 Ornontowice, ul. Akacjowa 20/9 | Ornontowice, Akacjowa 20, 43-178 | Dopasowany punkt | dopasowany |
| 60 | 56-410 Dobra, 66F | Dobra 66F, 56-410 | Dopasowany punkt | nierozstrzygnięty |
| 61 | 46-310 Szyszków, 35 | Szyszków 35, 46-310 | Dopasowany punkt | nierozstrzygnięty |
| 62 | 46-250 Szum, 101 | Szum 101, 46-250 | Dopasowany punkt | nierozstrzygnięty |
| 63 | 56-400 Cieśle, 36G | Cieśle 36G, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 64 | 56-400 Poniatowice, 187F | Poniatowice 187F, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 65 | 56-400 Smolna, 22C | Smolna 22c, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 66 | 56-400 Sokołowice, 100O | Sokołowice 100o, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 67 | 49-200 Grodków, ul. Wiejska 9/6 | Grodków, Wiejska 9, 49-200 | Dopasowany punkt | dopasowany |
| 68 | 44-213 Rybnik, ul. Arki Bożka 51I | Rybnik, Arki Bożka 51I, 44-200 | Jednoznaczny punkt budynku; kod pocztowy usługi różni się od źródłowego (oba zachowano) | nierozstrzygnięty |
| 69 | 48-120 Sułków, 9A | Sułków 9A, 48-120 | Dopasowany punkt | nierozstrzygnięty |
| 70 | 46-211 Maciejów, 39/2 | Maciejów 39, 22-304 | Inny lub brakujący kod pocztowy | nierozstrzygnięty |
| 71 | 48-155 Chomiąża, 37 | Chomiąża 37, 48-155 | Dopasowany punkt | nierozstrzygnięty |
| 72 | 49-340 Nowa Wieś Mała, 8C | Nowa Wieś Mała 8C, 49-340 | Dopasowany punkt | nierozstrzygnięty |
| 73 | 46-083 Stare Siołkowice, ul. Klapacz 127A | Stare Siołkowice, Klapacz 127A, 46-083 | Dopasowany punkt | nierozstrzygnięty |
| 74 | 56-400 Boguszyce, 22E/2 |  | Usługa nie zwróciła dopasowanego punktu | nierozstrzygnięty |
| 75 | 46-275 Chudoba, 169 | Chudoba 169, 46-275 | Dopasowany punkt | nierozstrzygnięty |
| 76 | 56-400 Boguszyce, 23S | Boguszyce 23S, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 77 | 46-312 Kucoby, ul. Leśna 14 | Kucoby, Leśna 14, 46-312 | Dopasowany punkt | dopasowany |
| 78 | 49-100 Brzęczkowice, 15A |  | Usługa nie zwróciła dopasowanego punktu | nierozstrzygnięty |
| 79 | 56-400 Ostrowina, 105H | Ostrowina 105h, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 80 | 56-400 Ostrowina, 106L | Ostrowina 106l, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 81 | 44-213 Rybnik, ul. Jodłowa 68 | Rybnik, Jodłowa 68, 44-200 | Jednoznaczny punkt budynku; kod pocztowy usługi różni się od źródłowego (oba zachowano) | dopasowany |
| 82 | 46-380 Myślina, ul. Parkingowa 6 | Myślina, Parkingowa 6, 46-380 | Dopasowany punkt | dopasowany |
| 83 | 47-120 Zawadzkie, ul. Miarki 7/7 | Zawadzkie, Miarki 7, 47-126 | Jednoznaczny punkt budynku; kod pocztowy usługi różni się od źródłowego (oba zachowano) | nierozstrzygnięty |
| 84 | 46-081 Dobrzeń Wielki, Osiedle Energetyk 9A/4 | Dobrzeń Wielki, Osiedle Energetyk 9A, 46-081 | Dopasowany punkt | dopasowany |
| 85 | 46-250 Gierałcice, ul. Opolska 1 | Gierałcice, Opolska 1, 46-250 | Dopasowany punkt | dopasowany |
| 86 | 46-312 Kucoby, ul. Borecka 6 | Kucoby, Borecka 6, 46-312 | Dopasowany punkt | dopasowany |
| 87 | 46-045 Kotórz Wielki, ul. Polna 23B | Kotórz Wielki, Polna 23B, 46-045 | Dopasowany punkt | nierozstrzygnięty |
| 88 | 46-300 Borki Małe, ul. Oleska 2A | Borki Małe, Oleska 2A, 46-300 | Dopasowany punkt | nierozstrzygnięty |
| 89 | 56-400 Piszkawa, 8I | Piszkawa 8i, 56-400 | Dopasowany punkt | nierozstrzygnięty |
| 90 | 44-178 Przyszowice, ul. Bażantów 13 | Przyszowice, Bażantów 13, 44-178 | Dopasowany punkt | dopasowany |
| 91 | 45-940 Opole, ul. Łączna 10 | Opole, Łączna 10, 45-940 | Dopasowany punkt | dopasowany |
| 92 | 44-213 Książenice, ul. Powstańców 64 | Książenice, Powstańców 64, 44-213 | Dopasowany punkt | dopasowany |
| 93 | 46-045 Turawa, ul. Jagodowa 1/1 | Turawa, Jagodowa 1, 46-045 | Dopasowany punkt | dopasowany |
| 94 | 46-324 Kościeliska, 53A | Kościeliska 53A, 46-324 | Dopasowany punkt | nierozstrzygnięty |
| 95 | 46-243 Bogacica, ul. Wiejska 43 | Bogacica, Wiejska 43, 46-243 | Dopasowany punkt | dopasowany |
| 96 | 56-410 Białe Błoto, 31 | Białe Błoto 31, 56-410 | Dopasowany punkt | nierozstrzygnięty |
| 97 | 47-316 Malnia, ul. Sosnowa 7 | Malnia, Sosnowa 7, 47-320 | Jednoznaczny punkt budynku; kod pocztowy usługi różni się od źródłowego (oba zachowano) | dopasowany |
| 98 | 46-320 Sołtysy, BN |  | Usługa nie zwróciła dopasowanego punktu | nierozstrzygnięty |
| 99 | 46-050 Tarnów Opolski, ul. Słonecznikowa 9 | Tarnów Opolski, Słonecznikowa 9, 46-050 | Dopasowany punkt | dopasowany |
| 100, 107 | 47-175 Kadłub, ul. Zielona 2 | Kadłub, Zielona 2, 47-175 | Dopasowany punkt | dopasowany |
| 101 | 56-400 Bystre, ul. Wiosenna 5 | Bystre, Wiosenna 5, 56-400 | Dopasowany punkt | dopasowany |
| 102 | 49-130 Szydłów, ul. Opolska 24 | Szydłów, Opolska 24, 49-130 | Dopasowany punkt | nierozstrzygnięty |
| 103 | 47-100 Strzelce Opolskie, ul. Władysława Łokietka 3/14 | Strzelce Opolskie, Władysława Łokietka 3, 47-100 | Dopasowany punkt | dopasowany |
| 104 | 56-410 Miodary, 15A | Miodary 15A, 56-410 | Dopasowany punkt | nierozstrzygnięty |
| 105 | 47-208 Dębowa, ul. Główna 8A | Dębowa, Główna 8A, 47-208 | Dopasowany punkt | nierozstrzygnięty |
| 106 | 44-177 Paniówki, ul. Gliwicka BN3 |  | Błąd lub nieprawidłowa odpowiedź usługi, nie błąd adresu | nierozstrzygnięty |
| 108 | 46-080 Chróścice, ul. Babilas 30 | Chróścice, Babilas 30, 46-080 | Dopasowany punkt | dopasowany |
| 109 | 47-100 Strzelce Opolskie, ul. Kardynała Stefana Wyszyńskiego 7/24 | Strzelce Opolskie, Kardynała Stefana Wyszyńskiego 7, 47-100 | Dopasowany punkt | dopasowany |
| 110 | 46-100 Namysłów, ul. Kazimierza Pułaskiego 18/2 |  | Usługa nie zwróciła dopasowanego punktu | nierozstrzygnięty |
| 111 | 46-048 Zębowice, ul. Leśna BN1 |  | Błąd lub nieprawidłowa odpowiedź usługi, nie błąd adresu | nierozstrzygnięty |
