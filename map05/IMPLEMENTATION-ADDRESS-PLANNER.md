# Plan wdrożenia danych adresowych — 16.11.2026

Źródło: `../dane_adresowe-v2.xlsx`, odczyt bez zmian. Zakres: wyłącznie lokalny prototyp, bez wysyłania adresów do usług zewnętrznych.

1. Odczytać wartości, znormalizować adresy, zachować wiersze źródłowe i raport duplikatów. Nie wymyślać regionu ani współrzędnych. Lista użytkownika jest źródłem testowym, nie niezależnym dowodem pokrycia.
2. Dodać oddzielny moduł planera przy zachowaniu starego demonstratora. Oddzielić adresy od syntetycznych zleceń i zasobów. Dostępność na dzień stanowi jawny parametr scenariusza.
3. Najpierw testy: unikalność przydziałów, kwalifikacje, wspólny zasób, sąsiednie sloty, ochrona potwierdzeń i ręcznych korekt, brak cichego usuwania rezerwacji, walidacja zapisu.
4. Dodać kolejkę niezależną od dnia, generowanie koszyków, edycję slotów konkretnej ekipy i ręczne przesunięcia/usunięcia. Cofanie i zapis/odczyt lokalnego JSON.
5. Zbudować osobny samowystarczalny `planner-offline.html`. Dostępność współrzędnych jest warunkiem umieszczenia punktów. Nie pokazywać fikcyjnych lokalizacji, tras ani oceny wykonalności drogowej.
6. Uruchomić testy modelu, integrację DOM bez sieci, istniejące testy regresji i budowanie. Oddzielnie odnotować brak wizualnego testu przeglądarkowego.

Przyjęte parametry testowe: 5 umownych ekip, 3 okna 08–11 / 11–14 / 14–17, maksymalnie 3 instalacje w koszyku. Typy zleceń, gotowość, wiek kolejki i wymagania 2 slotów są syntetyczne, nie pochodzą z arkusza. Nie zastępują regionalnych reguł operacyjnych. Automatyczny wynik to propozycja zasobowa bez oceny dojazdu.
