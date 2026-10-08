# Night System • Discord Management Tool

Das offizielle Discord-Automatisierungs- und Management-Tool im Silver-Gray Glassmorphism Design. Entwickelt für maximale Geschwindigkeit, absolute Transparenz und nahtlose Synchronisation.

---

## Projekt-Struktur

| Datei / Ordner | Beschreibung | Typ |
|---|---|---|
| `ff.py` | Hauptquellcode (GUI, CustomTkinter, Discord v10 API, Multi-Threading) | Python Source |
| `Nightheid.exe` | Windows Standalone-Anwendung (Sofort startbar mit interaktiver CMD) | Binary Release |
| `Nightheid.spec` | Build-Konfigurationsdatei für PyInstaller | Build Spec |
| `discord_settings.json`| Lokale Konfiguration | JSON Konfiguration |
| `assets/icon.ico` | Anwendungs-Icon (Hochauflösend) | Asset |
| `assets/logo.png` | Banner / Logo | Asset |
| `LICENSE` | Open-Source Lizenz | Lizenz |

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
   * Live-Abruf aller Freunde, Anfragen und DM-Gruppen.
   * Multi-Select Freundes-Entfernung.
   * Automatisches Schließen von DM-Kanälen.

4. **Server beitreten:**
   * Sofort-Beitritt über Einladungscodes.

5. **Profil & Bio Customizer (Tab: Extra):**
   * Dynamische Änderung von Bio, Global Display Name, Username und Server-Tags.

6. **Exklusiver Bot-Modus & Automatisierung:**
   * Isoliert das Tool: Blendet alle anderen Navigations-Tabs aus für fokussiertes Arbeiten.
   * Integrierter Rate-Limit-Monitor für maximale Accountsicherheit.
   * Multi-Message Sender mit konfigurierbarer Anzahl und Geschwindigkeits-Regler.
   * Universal Target Resolver: Erkennt automatisch Textkanal-IDs, DM-Kanal-IDs und Benutzer-IDs.
   * Webhook Commander: Anonyme Multi-Send Nachrichten über Discord-Webhooks ohne Ban-Risiko.
   * Mass-Reaction Tool: Reagiert automatisch mit Emoji-Listen oder entfernt eigene Reaktionen.
   * Auto-Responder / Chat-Trigger: Erkennt Stichwörter in Direktnachrichten und antwortet vollautomatisch.
   * Server Structure Cloner: Analysiert und exportiert Server-Strukturen (Kanäle, Kategorien, Rollen).

7. **CMD Konsole & Auto-Update:**
   * Interaktive CMD Konsole bleibt dauerhaft geöffnet.
   * Befehle direkt über CMD: `status`, `token`, `webhook`, `react`, `responder`, `backup`, `update`, `logout`, `cls`, `exit`.
   * Automatischer Download und Neustart bei neuen Versionen.

---

## Lizenz
MIT-Lizenz. Freie Nutzung, Modifikation und Weiterverbreitung erlaubt.
