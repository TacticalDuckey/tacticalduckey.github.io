@echo off
title Discord Bot Control Panel
echo ============================================
echo   Discord Bot Control Panel
echo ============================================
echo.

:: Sluit eventueel al draaiend panel op poort 3000
echo Controleren of poort 3000 al in gebruik is...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Bestaand panel gevonden (PID %%a), afsluiten...
    taskkill /PID %%a /F >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo Opstarten...
echo.
cd /d "C:\Discord DIngen\discord-bot"
node panel.js
echo.
echo Panel gestopt.
pause
