@echo off
title WhatsApp-System
cd /d "%~dp0"

:: Automatische Administrator-Rechte anfordern
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [UAC] Starte mit Administrator-Rechten...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb runas"
    exit /b
)

echo ============================================================
echo   WhatsApp-System - Desktop Edition
echo   Design: Schwarz / Grau - Night-System Edition
echo ============================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [FEHLER] Node.js wurde nicht im System-Pfad gefunden.
    echo Bitte stellen Sie sicher, dass Node.js installiert ist.
    echo.
    pause
    exit /b 1
)

echo [1/3] Bereinige alte Hintergrundprozesse...
:: Verwaiste Puppeteer-Chrome Prozesse beenden
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'chrome.exe'\" | Where-Object { $_.CommandLine -like '*wwebjs_auth*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul

:: Port 3000 freigeben falls belegt
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>nul

echo [2/3] Bereinige Browser-Sperrdateien...
:: Veraltetes lockfile entfernen
if exist "%~dp0.wwebjs_auth\session\lockfile" (
    del /f /q "%~dp0.wwebjs_auth\session\lockfile" >nul 2>nul
)

echo [3/3] Starte WhatsApp-System Server und App-Fenster...
echo.

node server.js

if %errorlevel% neq 0 (
    echo.
    echo [HINWEIS] Der Server wurde beendet.
    pause
)
