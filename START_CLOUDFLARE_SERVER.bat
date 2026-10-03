@echo off
title Night-System WhatsApp Cloudflare Server
cd /d "C:\Users\maxia\Desktop\WhatsApp"

echo ============================================================
echo   NIGHT-SYSTEM - WHATSAPP CLOUDFLARE HOSTING
echo   100%% Web-basiert (ohne Excel)
echo   Dein PC hostet mit voller Google Chrome Browser-Leistung
echo ============================================================
echo.

:: 1. Starte Cloudflare Tunnel in eigenem Fenster
echo [1/2] Starte Cloudflare Tunnel fuer weltweiten Zugriff...
start "Cloudflare Tunnel - Night-System" cmd /k "title Cloudflare Tunnel (Deine weltweite Adresse) && cd /d C:\Users\maxia\Desktop\WhatsApp && cloudflared.exe tunnel --url http://localhost:3000"

:: 2. Starte WhatsApp Node.js Server direkt
echo [2/2] Starte WhatsApp Node Server auf Port 3000...
echo.
"C:\Program Files\nodejs\node.exe" server.js

pause
