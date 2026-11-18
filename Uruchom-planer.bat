@echo off
rem MMS Planowanie 2.0 - uruchomienie lokalnego planera jednym klikiem.
rem Startuje lokalny serwer (tylko 127.0.0.1) i otwiera planer w przegladarce.
rem Zdjecia satelitarne (przyciski Satelita/Hybryda): ten plik dopuszcza polaczenie z serwerem ortofotomapy
rem GUGiK (mapy.geoportal.gov.pl), ale zdjecia sa pobierane dopiero po wybraniu Satelity/Hybrydy i zaznaczeniu
rem zgody w oknie Dostawca zdjec (wysylany jest widoczny obszar mapy). Bez tej zgody nic nie wychodzi z komputera.
rem Wersja calkowicie bez polaczen zewnetrznych: Uruchom-planer-bez-satelity.bat
rem Zamkniecie tego okna zatrzymuje serwer.
cd /d "%~dp0"
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY goto :nopython

if not exist "map05\basemap\planner-compact.json" (
  echo Przywracam lokalne zasoby publiczne - bez pobierania z internetu...
  %PY% -X utf8 map05\prepare_assets.py
)

if not exist "map05\basemap\map-pack.pmtiles" (
  echo.
  echo UWAGA: brak pliku map05\basemap\map-pack.pmtiles - mapa dziala w trybie uproszczonym ^(tylko drogi, bez nazw ulic i budynkow^).
  echo Pelny podklad: skopiuj map-pack.pmtiles do map05\basemap\ ^(patrz docs\MAP08-MAPA-OPERACYJNA.md^) i odswiez strone.
)
echo.
echo Planer: http://127.0.0.1:8765/   (zamknij to okno, aby zatrzymac serwer)
echo Satelita/Hybryda: wybierz przycisk na mapie i zaznacz zgode w oknie Dostawca zdjec.
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul & start "" http://127.0.0.1:8765/"
%PY% -X utf8 map05\serve.py --allow-tile-origin https://mapy.geoportal.gov.pl
goto :eof

:nopython
echo Nie znaleziono Pythona - otwieram wersje samodzielna (plik offline, bez serwera).
start "" "%~dp0map05\planner-offline.html"
pause
