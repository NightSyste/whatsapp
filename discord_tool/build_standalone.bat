@echo off
title Night System - Build Standalone EXE
color 0A
echo ============================================================
echo   NIGHT SYSTEM - BAUE NIGHTHEID.EXE (STANDALONE)
echo ============================================================
echo [1/3] Installiere Build-Tools...
python -m pip install pyinstaller customtkinter pillow requests --quiet
echo [2/3] Kompiliere Nightheid.exe mit PyInstaller...
pyinstaller --clean -y Nightheid.spec
echo [3/3] Fertig! Die ausfuehrbare Datei befindet sich in dist\Nightheid.exe
pause
