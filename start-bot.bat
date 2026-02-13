@echo off
echo ========================================
echo   Discord Blacklist Bot Starter
echo ========================================
echo.
echo Bot start nu...
echo Druk Ctrl+C om te stoppen
echo.

REM Check of Node.js geinstalleerd is
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is niet geinstalleerd!
    echo Download Node.js van: https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM Check of npm modules geinstalleerd zijn
if not exist "node_modules\discord.js" (
    echo.
    echo Discord.js wordt geinstalleerd...
    echo Dit kan even duren bij eerste keer...
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ERROR: Kon dependencies niet installeren!
        echo.
        pause
        exit /b 1
    )
    echo.
    echo Installatie voltooid!
    echo.
)

REM Zorg dat dotenv ook geinstalleerd is
if not exist "node_modules\dotenv" (
    echo Installeer dotenv...
    call npm install dotenv
)

REM Start de bot vanaf de root directory (niet discord-bot folder)
echo Bot is actief! Type server namen in Discord kanaal.
echo.
node discord-bot/bot.js

pause
