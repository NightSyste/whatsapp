@echo off
title Night System - Discord Engine (Open Source)
color 0B
echo ============================================================
echo   NIGHT SYSTEM - OPEN SOURCE DISCORD TOOL
echo ============================================================
echo [INFO] Pruefe Python-Abhaengigkeiten...
python -m pip install -r requirements.txt --quiet
echo [INFO] Starte Benutzeroberflaeche...
python ff.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [FEHLER] Tool konnte nicht gestartet werden. Bitte Python 3.10+ installieren.
    pause
)
