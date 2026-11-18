@echo off
rem MMS Planowanie 2.0 - uruchomienie lokalnego planera jednym klikiem.
rem Startuje lokalny serwer (tylko 127.0.0.1) i otwiera planer w przegladarce.
rem Wersja calkowicie bez polaczen zewnetrznych: przyciski Satelita/Hybryda nie dzialaja.
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

echo.
echo Planer: http://127.0.0.1:8765/   (zamknij to okno, aby zatrzymac serwer)
echo Tryb bez polaczen zewnetrznych: Satelita/Hybryda wylaczone.
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul & start "" http://127.0.0.1:8765/"
%PY% -X utf8 map05\serve.py
goto :eof

:nopython
echo Nie znaleziono Pythona - otwieram wersje samodzielna (plik offline, bez serwera).
start "" "%~dp0map05\planner-offline.html"
pause
