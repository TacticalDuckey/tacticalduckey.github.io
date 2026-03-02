@echo off
title Lage Landen RP — Control Panel
echo ============================================
echo   Lage Landen RP ^| Control Panel
echo ============================================
echo.

:: Sluit bestaand panel-proces op poort 3000 als dat draait
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr "0.0.0.0:3000" ^| findstr "LISTENING"') do (
    echo Bestaand panel gevonden ^(PID %%a^), afsluiten...
    taskkill /PID %%a /F >nul 2>&1
)

:: Wacht tot poort 3000 echt vrij is (max 10 sec)
set /a teller=0
:wacht
netstat -ano 2>nul | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    set /a teller=%teller%+1
    if %teller% geq 10 (
        echo.
        echo [!] Poort 3000 blijft bezet. Start handmatig:
        echo     - Sluit alle andere panel-vensters
        echo     - Probeer opnieuw
        pause
        exit /b 1
    )
    timeout /t 1 /nobreak >nul
    goto wacht
)

echo Opstarten...
echo.
cd /d "C:\Discord DIngen\discord-bot"
node panel.js
echo.
echo Panel gestopt.
pause
