# Zasady pracy agentów — MMS Planowanie 2.0

## Kontynuacja i wspólna praca

Przed zmianami przeczytaj `docs/PRZEKAZANIE-AION-UI.md`, `docs/DECYZJE-I-ZAKRES.md` i najnowsze `map05/VERIFICATION.md`. Historia i architektura są w `docs/`. Aktywny planer to `planner-offline.html` / `planner.html`; `offline.html` / `index.html` są starszym demonstratorem.

Zachowaj źródłowe XLSX/CSV, fixture MAP-04, datasetId i ID planów. Użytkownik wybrał obliczenia dróg lokalnie, bez OSRM/ORS i bez ponownego odczytu 7 nieustalonych pozycji z QGIS. Później wyraźnie zaakceptował publikację adresów i współrzędnych w publicznym repozytorium `multiplay-pages/mms-planowanie`; ta zgoda nie obejmuje nowych usług ani produkcyjnego MMS.

W Aion UI Claude Code i Codex nie powinni jednocześnie edytować tych samych plików. Ustal właściciela zadania i jednego koordynatora scalenia/publikacji; niezależny przegląd może być tylko do odczytu. Wykrywaj aktualne narzędzia środowiska zamiast zakładać dostępność z historii tej sesji.

## Obsługa przeglądarki i interfejsu użytkownika

Codex/GPT może i powinien samodzielnie korzystać z udostępnionych w bieżącej sesji narzędzi przeglądarki lub obsługi komputera, jeżeli jest to potrzebne do wykonania zadania użytkownika.

1. Agent może bez dodatkowego pytania otwierać strony, przechodzić między widokami, klikać elementy, wyszukiwać, przewijać, odczytywać zawartość, pobierać pliki, wybierać filtry oraz uzupełniać formularze w zakresie zleconego zadania.
2. Agent może korzystać z istniejącej, zalogowanej sesji użytkownika. Nie może obchodzić logowania, CAPTCHA, uwierzytelniania wieloskładnikowego ani zabezpieczeń serwisu. Gdy wymagane jest działanie użytkownika, przekazuje mu kontrolę i po zakończeniu kontynuuje zadanie.
3. Jeżeli użytkownik zlecił czynność powodującą zmianę w systemie, np. zapis danych, utworzenie rekordu, wysłanie formularza lub zmianę ustawienia, zlecenie stanowi zgodę na wykonanie tej czynności w opisanym zakresie. Nie należy ponownie prosić o potwierdzenie zwykłych, odwracalnych kroków potrzebnych do realizacji zadania.
4. Przed wykonaniem skutku, który nie wynika jasno z polecenia, agent zatrzymuje się na etapie gotowym do zatwierdzenia. Dotyczy to w szczególności wysłania wiadomości do innych osób, publikacji publicznej, zakupu lub płatności, zawarcia umowy, trwałego usunięcia danych, zmiany uprawnień oraz ustawień bezpieczeństwa.
5. Agent preferuje bezpośredni konektor lub API, gdy zapewnia pełne i wiarygodne wykonanie zadania. Gdy konektor nie obsługuje wymaganej operacji albo praca dotyczy interfejsu strony, agent używa przeglądarki bez traktowania jej jako niedozwolonego obejścia.
6. Agent nie odczytuje ani nie ujawnia haseł, tokenów, kluczy API i innych sekretów. Nie zapisuje ich w logach, plikach projektu ani odpowiedzi.
7. Po operacji agent sprawdza widoczny rezultat w aplikacji i raportuje faktyczny stan. Nie deklaruje wykonania na podstawie samego kliknięcia, jeżeli rezultat można zweryfikować.
8. Jeżeli narzędzie przeglądarki lub obsługi komputera nie jest dostępne w danej sesji, agent mówi o tym wprost i korzysta z najlepszego dostępnego sposobu albo podaje konkretny krok wymagany w innym środowisku.

## Zakres

Te zasady obowiązują w całym projekcie i jego podkatalogach. Nie przyznają narzędzi ani uprawnień, których bieżąca sesja faktycznie nie udostępnia, i nie zastępują nadrzędnych zasad bezpieczeństwa platformy.
