# Night System • Open Source Discord Management Tool

Das offizielle, vollständig quelloffene Discord-Automatisierungs- und Management-Tool im Silver-Gray Glassmorphism Design. Entwickelt für maximale Geschwindigkeit, absolute Transparenz und nahtlose Cloud-Anbindung.

---

## Projekt-Struktur & Open-Source-Dateien

| Datei / Ordner | Beschreibung | Typ |
|---|---|---|
| `ff.py` | Hauptquellcode (GUI, CustomTkinter, Discord v10 API, Multi-Threading) | Python Source |
| `Nightheid.exe` | Vorkompilierte Windows Standalone-Anwendung (Sofort startbar) | Binary Release |
| `start_tool.bat` | Windows Schnellstarter (Prüft Bibliotheken und startet direkt) | Batch Script |
| `build_standalone.bat` | Vollautomatisches Erstellen der EXE mit PyInstaller | Build Script |
| `Nightheid.spec` | Build-Konfigurationsdatei für PyInstaller | Build Spec |
| `requirements.txt` | Erforderliche Python-Pakete (`customtkinter`, `pillow`, `requests`) | Konfiguration |
| `discord_settings.json`| Tool-Konfiguration & Cloud-Endpunkte | JSON Konfiguration |
| `assets/icon.ico` | Anwendungs-Icon (Hochauflösend) | Asset |
| `assets/logo.png` | Night System Banner / Logo | Asset |
| `LICENSE` | MIT Open-Source Lizenz | Lizenz |

---

## Schnellstart

### 1. Aus Quellcode starten (Python 3.10+)
```bash
pip install -r requirements.txt
python ff.py
```
Oder einfach doppelt auf `start_tool.bat` klicken.

### 2. Als Standalone-EXE kompilieren
```bash
build_standalone.bat
```
Die fertige, portable `.exe` wird im Ordner `dist` erzeugt.

---

## Kernfunktionen

1. **Account-Sitzung & Übersicht:**
   * Abruf aller Profil-Details (Benutzername, ID, Badges, Nitro-Status, Telefonnummer, 2FA, Verifizierungsstatus).
   * Verknüpfte Konten (Spotify, Steam, GitHub, YouTube, Twitch, Xbox, PlayStation etc.).
   * Zahlungsquellen & Billing-Verknüpfung.

2. **Server-Management:**
   * Vollständige Server-Liste mit Icons und Berechtigungs-Badges.
   * Multi-Select Auswahl zum gezielten Verlassen mehrerer Server gleichzeitig.
   * "Alle Server verlassen" Modus mit Notfall-Abbruch-Button (Stop-Funktion).

3. **Freunde, Gruppen & DM-Bereinigung:**
   * Live-Abruf aller Freunde, eingehender/ausgehender Anfragen und DM-Gruppen.
   * Multi-Select Freundes-Entfernung.
   * Schließt automatisch alle zugehörigen DM-Kanäle (`DELETE /channels/{id}`).

4. **Server beitreten:**
   * Automatischer Sofort-Beitritt über Einladungslinks (z.B. `discord.gg/xyz`).
   * Deutliche Sicherheitswarnung ("Hohe Ban-Gefahr") vor Missbrauch.

5. **Profil & Bio Customizer (Tab: Extra):**
   * Dynamische Änderung von Bio / About Me, Global Display Name, Username und Server-Tags.

6. **Exklusiver Bot-Modus:**
   * Isoliert das Tool: Blendet alle anderen Navigations-Tabs aus für fokussiertes Arbeiten.
   * Integrierter Rate-Limit-Monitor für maximale Accountsicherheit.
   * Multi-Message Sender mit konfigurierbarer Anzahl und Geschwindigkeits-Regler.
   * Universal Target Resolver: Erkennt automatisch Textkanal-IDs, DM-Kanal-IDs und Benutzer-IDs.

7. **Cloud Administration & Remote Killswitch:**
   * Nahtlose Synchronisation mit dem Web-Dashboard: `https://whatsapp-kadi.onrender.com`.
   * Remote-Sperre: Ermöglicht das sofortige Deaktivieren des Tools über die Website.
   * Remote-Versionsprüfung beim Start: Zeigt im CMD-Terminal Live-Updates und Changelogs an.
   * Live-Telemetrie: Zeigt aktive Instanzen im Browser an.

---

## Lizenz
Dieses Projekt ist lizenziert unter der MIT-Lizenz. Freie Nutzung, Modifikation und Weiterverbreitung erlaubt.

