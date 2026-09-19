import os
import sys
import io
import base64
import json
import urllib.parse
import shutil
import subprocess
import time
import threading
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
import qrcode
import webview
from playwright.sync_api import sync_playwright

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXCEL_PATH = os.path.join(BASE_DIR, "WhatsApp_Kontakte.xlsx")
TEMP_IMG_DIR = os.path.join(BASE_DIR, "qr_temp")
SESSION_DIR = os.path.join(BASE_DIR, "session_data")
CDP_PORT = 9222

os.makedirs(TEMP_IMG_DIR, exist_ok=True)
os.makedirs(SESSION_DIR, exist_ok=True)

def find_chrome_or_edge():
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\ms-playwright\chromium-1223\chrome-win64\chrome.exe")
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return "chrome.exe"

class WhatsAppApi:
    def __init__(self):
        self.browser_proc = None

    def start_whatsapp_connection(self):
        """Launches the genuine Chrome / Edge application window for WhatsApp Web with persistent profile."""
        browser_exe = find_chrome_or_edge()
        cmd = [
            browser_exe,
            f"--user-data-dir={SESSION_DIR}",
            f"--remote-debugging-port={CDP_PORT}",
            "--app=https://web.whatsapp.com",
            "--window-size=1020,780",
            "--no-first-run",
            "--no-default-browser-check"
        ]

        try:
            # If already running on port, just return
            try:
                with sync_playwright() as p:
                    b = p.chromium.connect_over_cdp(f"http://localhost:{CDP_PORT}", timeout=2000)
                    b.close()
                    return {"status": "success", "message": "WhatsApp-Fenster ist bereits aktiv. Bitte QR-Code scannen."}
            except Exception:
                pass

            subprocess.Popen(cmd)
            return {
                "status": "success",
                "message": "WhatsApp-Kopplungsfenster geoeffnet. Bitte scannen Sie den QR-Code mit Ihrem Smartphone."
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Konnte Browser nicht starten: {str(e)}"
            }

    def check_connection_status(self):
        """Connects over CDP to inspect if WhatsApp is authenticated."""
        try:
            with sync_playwright() as p:
                browser = p.chromium.connect_over_cdp(f"http://localhost:{CDP_PORT}", timeout=4000)
                contexts = browser.contexts
                if not contexts or not contexts[0].pages:
                    browser.close()
                    return {"connected": False, "message": "WhatsApp-Fenster nicht geoeffnet."}

                page = contexts[0].pages[0]
                html = page.content()
                has_canvas = "canvas" in html
                has_chats = "pane-side" in html or "chat-list" in html or "cell-frame-container" in html or "role=\"textbox\"" in html
                browser.close()

                if not has_canvas and has_chats:
                    return {"connected": True, "message": "WhatsApp-Konto ist aktiv verbunden."}
                else:
                    return {"connected": False, "message": "Kopplung noch nicht abgeschlossen. Bitte QR-Code im Fenster scannen."}
        except Exception as e:
            return {"connected": False, "message": "WhatsApp-Fenster ist aktuell nicht geoeffnet."}

    def import_whatsapp_contacts(self):
        """Extracts the user's real contacts and chats from the active WhatsApp Web session."""
        try:
            with sync_playwright() as p:
                browser = p.chromium.connect_over_cdp(f"http://localhost:{CDP_PORT}", timeout=5000)
                contexts = browser.contexts
                if not contexts or not contexts[0].pages:
                    browser.close()
                    return {
                        "status": "error",
                        "message": "WhatsApp Web ist nicht geoeffnet. Bitte zuerst auf 'WhatsApp verbinden' klicken.",
                        "contacts": []
                    }

                page = contexts[0].pages[0]

                # JavaScript to extract contacts from chat list and internal store
                js_extract = """
                async () => {
                    const contacts = [];
                    const seen = new Set();

                    // 1. Extract from DOM chat list items
                    const items = document.querySelectorAll('div[role="listitem"], div[data-testid="cell-frame-container"]');
                    items.forEach((item) => {
                        const titleEl = item.querySelector('span[title]');
                        const rawTitle = titleEl ? titleEl.getAttribute('title').trim() : '';
                        if (rawTitle && !seen.has(rawTitle)) {
                            seen.add(rawTitle);
                            const isPhone = /^[+0-9\\s-]+$/.test(rawTitle);
                            contacts.push({
                                id: contacts.length + 1,
                                name: isPhone ? 'Kontakt ' + (contacts.length + 1) : rawTitle,
                                phone: isPhone ? rawTitle : '',
                                message: 'Guten Tag'
                            });
                        }
                    });

                    // 2. Query IndexedDB if DOM had fewer items
                    try {
                        const openReq = indexedDB.open('model-storage');
                        await new Promise((resolve) => {
                            openReq.onsuccess = (e) => {
                                const db = e.target.result;
                                if (db.objectStoreNames.contains('contact')) {
                                    const tx = db.transaction('contact', 'readonly');
                                    const store = tx.objectStore('contact');
                                    const req = store.getAll();
                                    req.onsuccess = () => {
                                        const resList = req.result || [];
                                        resList.forEach((c) => {
                                            const cName = (c.name || c.pushname || c.formattedName || '').trim();
                                            const cPhone = c.phoneNumber ? '+' + c.phoneNumber : (c.id && c.id.user ? '+' + c.id.user : '');
                                            const key = cPhone || cName;
                                            if (key && !seen.has(key)) {
                                                seen.add(key);
                                                contacts.push({
                                                    id: contacts.length + 1,
                                                    name: cName || ('Kontakt ' + (contacts.length + 1)),
                                                    phone: cPhone,
                                                    message: 'Guten Tag'
                                                });
                                            }
                                        });
                                        resolve();
                                    };
                                    req.onerror = () => resolve();
                                } else {
                                    resolve();
                                }
                            };
                            openReq.onerror = () => resolve();
                        });
                    } catch (err) {}

                    return contacts;
                }
                """

                extracted = page.evaluate(js_extract)
                browser.close()

                if not extracted or len(extracted) == 0:
                    return {
                        "status": "warning",
                        "message": "Es wurden noch keine Chats in WhatsApp Web geladen. Bitte sicherstellen, dass Sie angemeldet sind.",
                        "contacts": []
                    }

                # Save contacts into Excel
                self.save_contacts(extracted)
                return {
                    "status": "success",
                    "message": f"{len(extracted)} eigene Kontakte erfolgreich aus WhatsApp importiert.",
                    "contacts": extracted
                }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Konnte Kontakte nicht importieren: {str(e)}. Bitte zuerst 'WhatsApp verbinden' ausfuehren.",
                "contacts": []
            }

    def reset_session(self):
        """Clears stored session cookies/cache."""
        try:
            if os.path.exists(SESSION_DIR):
                shutil.rmtree(SESSION_DIR)
                os.makedirs(SESSION_DIR, exist_ok=True)
            return {"status": "success", "message": "Sitzungsdaten wurden zurueckgesetzt."}
        except Exception as e:
            return {"status": "error", "message": f"Fehler beim Zuruecksetzen: {str(e)}"}

    def load_contacts(self):
        """Loads contacts from WhatsApp_Kontakte.xlsx."""
        if not os.path.exists(EXCEL_PATH):
            return []
        try:
            wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
            ws = wb.active
            contacts = []
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row or not any(row):
                    continue
                cid = row[0] if len(row) > 0 and row[0] is not None else len(contacts) + 1
                name = str(row[1]) if len(row) > 1 and row[1] is not None else ""
                phone = str(row[2]) if len(row) > 2 and row[2] is not None else ""
                message = str(row[3]) if len(row) > 3 and row[3] is not None else ""
                contacts.append({
                    "id": cid,
                    "name": name,
                    "phone": phone,
                    "message": message
                })
            wb.close()
            return contacts
        except Exception as e:
            print(f"Error reading Excel: {e}")
            return []

    def save_contacts(self, contacts):
        """Saves contacts to WhatsApp_Kontakte.xlsx."""
        try:
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "WhatsApp Kontakte"
            ws.views.sheetView[0].showGridLines = True

            headers = ["ID", "Name", "Telefonnummer", "Nachricht", "WhatsApp-Link", "QR-Code Web-Link", "QR-Code Bild"]
            ws.append(headers)

            header_font = Font(name="Segoe UI", size=10, bold=True, color="E0E0E0")
            header_fill = PatternFill(start_color="2A2A2A", end_color="2A2A2A", fill_type="solid")
            thin_border = Border(
                left=Side(style="thin", color="404040"),
                right=Side(style="thin", color="404040"),
                top=Side(style="thin", color="404040"),
                bottom=Side(style="thin", color="404040")
            )

            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=1, column=col_idx)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.border = thin_border
            ws.row_dimensions[1].height = 28

            data_font = Font(name="Segoe UI", size=10, color="202020")
            link_font = Font(name="Segoe UI", size=10, color="1B65A4", underline="single")

            for idx, c in enumerate(contacts, 2):
                ws.row_dimensions[idx].height = 70
                cid = c.get("id", idx - 1)
                name = c.get("name", "")
                phone = str(c.get("phone", ""))
                msg = c.get("message", "")

                ws.cell(row=idx, column=1, value=cid).alignment = Alignment(horizontal="center", vertical="center")
                ws.cell(row=idx, column=2, value=name).alignment = Alignment(horizontal="left", vertical="center")
                ws.cell(row=idx, column=3, value=phone).alignment = Alignment(horizontal="left", vertical="center")
                ws.cell(row=idx, column=4, value=msg).alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

                clean_digits = "".join(ch for ch in phone if ch.isdigit())
                encoded_msg = urllib.parse.quote(msg)
                wa_url = f"https://wa.me/{clean_digits}?text={encoded_msg}" if clean_digits else ""

                c_link = ws.cell(row=idx, column=5, value=wa_url)
                c_link.font = link_font
                c_link.alignment = Alignment(horizontal="left", vertical="center")

                if wa_url:
                    qr_api_url = f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={urllib.parse.quote(wa_url)}"
                    c_qr = ws.cell(row=idx, column=6)
                    c_qr.value = f'=HYPERLINK("{qr_api_url}", "QR-Code oeffnen")'
                    c_qr.font = link_font
                    c_qr.alignment = Alignment(horizontal="center", vertical="center")

                for col in range(1, 8):
                    ws.cell(row=idx, column=col).border = thin_border

            widths = {"A": 8, "B": 24, "C": 20, "D": 40, "E": 40, "F": 22, "G": 18}
            for col, w in widths.items():
                ws.column_dimensions[col].width = w

            wb.save(EXCEL_PATH)
            return {"status": "success", "message": f"{len(contacts)} Kontakte in Excel gespeichert."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def embed_qr_codes(self, contacts):
        """Generates QR codes and embeds them into column G of WhatsApp_Kontakte.xlsx."""
        try:
            self.save_contacts(contacts)
            wb = openpyxl.load_workbook(EXCEL_PATH)
            ws = wb.active

            for idx, c in enumerate(contacts, 2):
                phone = str(c.get("phone", ""))
                msg = c.get("message", "")
                clean_digits = "".join(ch for ch in phone if ch.isdigit())
                if not clean_digits:
                    continue

                encoded_msg = urllib.parse.quote(msg)
                wa_url = f"https://wa.me/{clean_digits}?text={encoded_msg}"

                qr = qrcode.QRCode(version=1, box_size=3, border=1)
                qr.add_data(wa_url)
                qr.make(fit=True)
                img = qr.make_image(fill_color="black", back_color="white")

                temp_path = os.path.join(TEMP_IMG_DIR, f"qr_{idx}_{clean_digits}.png")
                img.save(temp_path)

                xl_img = openpyxl.drawing.image.Image(temp_path)
                xl_img.width = 75
                xl_img.height = 75
                ws.row_dimensions[idx].height = 70
                ws.add_image(xl_img, f"G{idx}")
                ws.cell(row=idx, column=7).alignment = Alignment(horizontal="center", vertical="center")

            wb.save(EXCEL_PATH)
            wb.close()
            return {"status": "success", "message": f"{len(contacts)} QR-Codes wurden in die Excel-Tabelle eingebettet."}
        except Exception as e:
            return {"status": "error", "message": f"Fehler bei QR-Einbettung: {str(e)}"}

    def open_excel(self):
        if os.path.exists(EXCEL_PATH):
            os.startfile(EXCEL_PATH)
            return True
        return False

def main():
    api = WhatsAppApi()
    index_file = os.path.join(BASE_DIR, "index.html")

    window = webview.create_window(
        title="WhatsApp Manager",
        url=index_file,
        js_api=api,
        width=1100,
        height=740,
        resizable=True,
        min_size=(850, 550),
        background_color="#121212"
    )
    webview.start(debug=False)

if __name__ == "__main__":
    main()
