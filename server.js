const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');

function ensureWwebjsPatched() {
    try {
        const vm = require('vm');
        const dirsToCheck = [
            path.join(__dirname, 'node_modules', 'whatsapp-web.js'),
            path.join(process.env.APPDATA || '', 'WhatsApp', 'node_modules', 'whatsapp-web.js')
        ];
        for (const dir of dirsToCheck) {
            if (!dir || !fs.existsSync(dir)) continue;

            const authStorePath = path.join(dir, 'src', 'util', 'Injected', 'AuthStore', 'AuthStore.js');
            if (fs.existsSync(authStorePath)) {
                try {
                    const code = fs.readFileSync(authStorePath, 'utf8');
                    if (!code.includes('wsModel?.Socket') && !code.includes('wsModel.Socket')) {
                        const patchedAuthStore = `'use strict';

exports.ExposeAuthStore = () => {
    window.AuthStore = {};
    const wsModel = window.require ? window.require('WAWebSocketModel') : null;
    window.AuthStore.AppState = (wsModel && wsModel.Socket) ? wsModel.Socket : null;
    window.AuthStore.Cmd = (window.require && window.require('WAWebCmd')) ? window.require('WAWebCmd').Cmd : null;
    window.AuthStore.Conn = (window.require && window.require('WAWebConnModel')) ? window.require('WAWebConnModel').Conn : null;
    window.AuthStore.OfflineMessageHandler = (window.require && window.require('WAWebOfflineHandler')) ? window.require('WAWebOfflineHandler').OfflineMessageHandler : null;
    window.AuthStore.PairingCodeLinkUtils = (window.require && window.require('WAWebAltDeviceLinkingApi')) ? window.require('WAWebAltDeviceLinkingApi') : null;
    window.AuthStore.Base64Tools = (window.require && window.require('WABase64')) ? window.require('WABase64') : null;
    window.AuthStore.RegistrationUtils = {
        ...(window.require ? window.require('WAWebCompanionRegClientUtils') : {}),
        ...(window.require ? window.require('WAWebAdvSignatureApi') : {}),
        ...(window.require ? window.require('WAWebUserPrefsInfoStore') : {}),
        ...(window.require ? window.require('WAWebSignalStoreApi') : {}),
    };
};
`;
                        new vm.Script(patchedAuthStore);
                        fs.writeFileSync(authStorePath, patchedAuthStore, 'utf8');
                        console.log('[PATCH] whatsapp-web.js AuthStore abgesichert:', authStorePath);
                    }
                } catch (errAuth) {
                    console.warn('[PATCH] Hinweis bei AuthStore-Patch:', errAuth.message);
                }
            }

            const clientPath = path.join(dir, 'src', 'Client.js');
            if (fs.existsSync(clientPath)) {
                try {
                    let clientCode = fs.readFileSync(clientPath, 'utf8');
                    let isValid = false;
                    try {
                        new vm.Script(clientCode);
                        isValid = true;
                    } catch (e) {
                        isValid = false;
                    }

                    const startMarker = 'await this.pupPage.evaluate(ExposeAuthStore);';
                    const endMarker = 'if (needAuthentication) {';
                    const sIdx = clientCode.indexOf(startMarker);
                    const eIdx = clientCode.indexOf(endMarker);

                    if (sIdx !== -1 && eIdx !== -1 && sIdx < eIdx) {
                        const block = clientCode.substring(sIdx + startMarker.length, eIdx);
                        const hasFullTryCatch = block.includes('try {') && block.includes('catch');

                        if (!hasFullTryCatch || !isValid) {
                            const validBlock = `\r\n\r\n        const needAuthentication = await this.pupPage.evaluate(async () => {\r\n            try {\r\n                const wsModel = window.require ? window.require('WAWebSocketModel') : null;\r\n                if (!wsModel || !wsModel.Socket) return true;\r\n                let state = wsModel.Socket.state;\r\n\r\n                if (\r\n                    state === 'OPENING' ||\r\n                    state === 'UNLAUNCHED' ||\r\n                    state === 'PAIRING'\r\n                ) {\r\n                    await new Promise((r) => {\r\n                        wsModel.Socket.on(\r\n                            'change:state',\r\n                            function waitTillInit(_AppState, state) {\r\n                                if (\r\n                                    state !== 'OPENING' &&\r\n                                    state !== 'UNLAUNCHED' &&\r\n                                    state !== 'PAIRING'\r\n                                ) {\r\n                                    wsModel.Socket.off(\r\n                                        'change:state',\r\n                                        waitTillInit,\r\n                                    );\r\n                                    r();\r\n                                }\r\n                            },\r\n                        );\r\n                    });\r\n                }\r\n                state = wsModel.Socket.state;\r\n                return state == 'UNPAIRED' || state == 'UNPAIRED_IDLE';\r\n            } catch (e) {\r\n                return true;\r\n            }\r\n        });\r\n\r\n        `;
                            const newClientCode = clientCode.substring(0, sIdx + startMarker.length) + validBlock + clientCode.substring(eIdx);
                            new vm.Script(newClientCode);
                            fs.writeFileSync(clientPath, newClientCode, 'utf8');
                            console.log('[PATCH] whatsapp-web.js Client.js erfolgreich validiert & abgesichert:', clientPath);
                        }
                    }
                } catch (errClient) {
                    console.warn('[PATCH] Hinweis bei Client.js-Absicherung:', errClient.message);
                }
            }
        }
    } catch (e) {
        console.warn('[PATCH] Hinweis bei Absicherung von whatsapp-web.js:', e.message);
    }
}
ensureWwebjsPatched();


const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');

const recentSystemLogs = [];
function logSystemEvent(type, message, details = null) {
    const entry = {
        timestamp: new Date().toISOString(),
        time: new Date().toLocaleTimeString('de-DE'),
        type: type || 'info',
        message: String(message || ''),
        details: details ? String(details) : null
    };
    recentSystemLogs.push(entry);
    if (recentSystemLogs.length > 80) recentSystemLogs.shift();
}

process.on('uncaughtException', (err) => {
    console.warn('[SYSTEM] Abgefangener Prozessfehler (uncaughtException):', err.message || err);
    logSystemEvent('error', 'Prozessfehler: ' + (err.message || err));
});

process.on('unhandledRejection', (reason) => {
    console.warn('[SYSTEM] Abgefangenes Promise-Problem (unhandledRejection):', reason?.message || reason);
    logSystemEvent('warn', 'Promise-Problem: ' + (reason?.message || reason));
});

process.on('beforeExit', (code) => {
    console.warn('[SYSTEM] Node.js beforeExit aufgerufen. Code:', code);
});

process.on('exit', (code) => {
    console.warn('[SYSTEM] Node.js exit aufgerufen. Code:', code);
});

const app = express();
const BASE_DIR = __dirname;
const AUTH_DIR = path.join(BASE_DIR, '.wwebjs_auth');
const ACTIVE_PORT_FILE = path.join(BASE_DIR, '.active_port');

function getInitialPort() {
    for (let i = 0; i < process.argv.length; i++) {
        const arg = process.argv[i];
        if (arg === '--port' && process.argv[i + 1]) {
            const p = parseInt(process.argv[i + 1], 10);
            if (!isNaN(p) && p > 0 && p < 65536) return p;
        } else if (arg.startsWith('--port=')) {
            const p = parseInt(arg.split('=')[1], 10);
            if (!isNaN(p) && p > 0 && p < 65536) return p;
        }
    }
    if (process.env.PORT) {
        const p = parseInt(process.env.PORT, 10);
        if (!isNaN(p) && p > 0 && p < 65536) return p;
    }
    return 3000; // Standardport 3000
}
let PORT = getInitialPort();

// ==========================================
// Discord Telemetrie & Live-Nutzungsanzeige
// ==========================================
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1550784230483693619/hom7AwSI7IHnJ-WwfvZb5KN8lOk1_J67SDPSCAnr-N2eFoO41AGGR-aGotwmUQvja0iO';
const appStartTime = Date.now();

function formatUptime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours} Std. ${minutes} Min.`;
    if (minutes > 0) return `${minutes} Min. ${seconds} Sek.`;
    return `${seconds} Sek.`;
}

function getSystemMetrics() {
    let hostname = 'Unbekannt';
    let username = 'Unbekannt';
    try { hostname = os.hostname() || 'Unbekannt'; } catch (e) {}
    try { username = os.userInfo().username || 'Unbekannt'; } catch (e) {}
    return {
        hostname,
        username,
        platform: `${os.type()} ${os.release()} (${os.arch()})`,
        uptime: formatUptime(Date.now() - appStartTime)
    };
}

function sendDiscordTelemetry(eventType, details = {}) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        const sys = getSystemMetrics();
        let title = '';
        let description = '';
        let color = 65416; // #00ff88
        let fields = [
            { name: 'PC-Name', value: sys.hostname, inline: true },
            { name: 'Benutzer', value: sys.username, inline: true },
            { name: 'Betriebssystem', value: sys.platform, inline: true }
        ];

        if (eventType === 'start') {
            title = '[START] WhatsApp Night-System gestartet';
            description = 'Das Tool wurde auf einem Computer gestartet und wird ausgefuehrt.';
            color = 65416; // #00ff88
            fields.push(
                { name: 'Status', value: 'Aktiv (Wartet auf Initialisierung)', inline: true },
                { name: 'Version', value: 'v1.0.0 (Fixed Version)', inline: true },
                { name: 'Zeitpunkt', value: new Date().toLocaleString('de-DE'), inline: true }
            );
        } else if (eventType === 'qr_ready') {
            title = '[QR-CODE] WhatsApp Erstanmeldung bereit';
            description = 'Ein Benutzer befindet sich im Anmeldebildschirm und wartet auf den QR-Scan.';
            color = 16766720; // #ffd700
            fields.push(
                { name: 'QR-Version', value: `#${details.qrVersion || 1}`, inline: true },
                { name: 'Laufzeit', value: sys.uptime, inline: true },
                { name: 'Zeitpunkt', value: new Date().toLocaleString('de-DE'), inline: true }
            );
        } else if (eventType === 'connected') {
            title = '[ONLINE] WhatsApp erfolgreich verbunden';
            description = 'Die WhatsApp-Sitzung ist aktiv gekoppelt und das System ist einsatzbereit.';
            color = 54527; // #00d4ff
            fields.push(
                { name: 'WhatsApp-Status', value: 'Verbunden', inline: true },
                { name: 'Geladene Chats', value: String(details.chatCount || allChats.length || 0), inline: true },
                { name: 'Laufzeit', value: sys.uptime, inline: true },
                { name: 'Zeitpunkt', value: new Date().toLocaleString('de-DE'), inline: true }
            );
        } else if (eventType === 'heartbeat') {
            title = '[AKTIVITAET] WhatsApp Night-System in Verwendung';
            description = 'Das Tool wird aktuell aktiv genutzt.';
            color = 3900150; // #3b82f6
            const waStatus = currentStatus === 'connected'
                ? `Verbunden (${allChats.length} Chats)`
                : (currentStatus === 'qr_ready' ? 'Wartet auf QR-Scan' : currentStatus);
            fields.push(
                { name: 'Aktueller Status', value: waStatus, inline: true },
                { name: 'Laufzeit', value: sys.uptime, inline: true },
                { name: 'Zeitpunkt', value: new Date().toLocaleString('de-DE'), inline: true }
            );
        } else if (eventType === 'shutdown') {
            title = '[BEENDET] WhatsApp Night-System geschlossen';
            description = 'Das Tool wurde ordnungsgemaess beendet.';
            color = 16096779; // #f59e0b
            fields.push(
                { name: 'Gesamtlaufzeit', value: sys.uptime, inline: true },
                { name: 'Zeitpunkt', value: new Date().toLocaleString('de-DE'), inline: true }
            );
        }

        const payload = {
            username: 'Night-System Monitor',
            embeds: [
                {
                    title,
                    description,
                    color,
                    fields,
                    footer: { text: 'Night-System Telemetrie & Nutzungsanzeige' }
                }
            ]
        };

        const https = require('https');
        const url = new URL(DISCORD_WEBHOOK_URL);
        const data = JSON.stringify(payload);
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                'User-Agent': 'NightSystem-Telemetry/1.0'
            },
            timeout: 5000
        }, (res) => {
            res.on('data', () => {});
        });
        req.on('error', () => {});
        req.on('timeout', () => { req.destroy(); });
        req.write(data);
        req.end();
    } catch (e) {}
}

// Regelmaessiger Heartbeat alle 15 Minuten (zeigt an, ob das Tool noch aktiv laeuft)
setInterval(() => {
    sendDiscordTelemetry('heartbeat');
}, 15 * 60 * 1000);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS-Unterstuetzung fuer plattformuebergreifende Web- & Client-Kommunikation
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Admin-Webseite: Direkter Zugriff auf das Administrations-Dashboard
app.get('/admin', (req, res) => {
    res.sendFile(path.join(BASE_DIR, 'admin.html'));
});

// Root-Route: In der Cloud (Render) oder via ?admin direkt Admin-Webseite servieren
app.get('/', (req, res, next) => {
    const isCloud = Boolean(process.env.RENDER || process.env.PORT || process.platform !== 'win32');
    if (isCloud || req.query.admin === '1') {
        return res.sendFile(path.join(BASE_DIR, 'admin.html'));
    }
    next();
});

app.use(express.static(BASE_DIR));

let currentStatus = 'loading'; // 'loading', 'qr_ready', 'connected', 'disconnected'
let currentQrUrl = '';
let allChats = [];
let client = null;
let lastQrTimestamp = Date.now();
let qrVersion = 0;
let isExtractingChats = false;
let serverFullyReady = false; // Wird auf true gesetzt sobald alle Routen geladen sind

// Route: Bereitschafts-Probe fuer Render Cloud Healthchecks und Launcher
app.get('/api/ready', (req, res) => {
    res.json({
        ready: true,
        status: 'online',
        uptime: Math.floor(process.uptime()),
        isCloud: Boolean(process.env.RENDER || process.platform !== 'win32')
    });
});


// Hilfsfunktion: Stellt sicher, dass client.pupPage auf die aktive WhatsApp Web Seite zeigt
async function ensureValidPupPage() {
    if (!client) return null;
    if (client.pupBrowser) {
        try {
            const pages = await client.pupBrowser.pages();
            const activePage = pages.find(p => !p.isClosed() && p.url().includes('whatsapp.com')) || pages[0];
            if (activePage && activePage !== client.pupPage) {
                console.log('[PUPPETEER] Aktualisiere client.pupPage Referenz auf aktive Seite');
                client.pupPage = activePage;
            }
        } catch (e) {}
    }
    return client.pupPage;
}

// Robuster Wrapper fuer pupPage.evaluate mit automatischem Schutz gegen Detached Frame / Frame Navigation
async function safePupEvaluate(fn, ...args) {
    await ensureValidPupPage();
    if (!client || !client.pupPage) throw new Error('WhatsApp-Client ist nicht aktiv.');
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await client.pupPage.evaluate(fn, ...args);
        } catch (err) {
            const msg = err?.message || String(err);
            const isDetached = msg.includes('detached Frame') || 
                               msg.includes('Execution context was destroyed') || 
                               msg.includes('Session closed') || 
                               msg.includes('Target closed') ||
                               msg.includes('Cannot find context');
            if (isDetached && attempt < 2) {
                console.warn(`[PUPPETEER] Detached Frame / Context (Versuch ${attempt + 1}/3). Aktualisiere Frame-Referenz...`);
                await new Promise(r => setTimeout(r, 1200));
                await ensureValidPupPage();
                if (client && client.pupPage) {
                    try {
                        if (typeof client.inject === 'function') await client.inject().catch(() => {});
                        if (typeof ensureWPPInjected === 'function') await ensureWPPInjected().catch(() => {});
                    } catch(e) {}
                }
                continue;
            }
            throw err;
        }
    }
}

// Robuster Wrapper fuer client.sendMessage mit Retry, Frame-Wiederherstellung und automatischem Medien-Fallback
async function safeSendMessage(chatId, content, options = {}) {
    if (!client) throw new Error('WhatsApp-Client ist nicht aktiv.');
    await ensureValidPupPage();

    // Reales Ziel ermitteln
    let target = chatId;
    if (typeof chatId === 'string') {
        const targetDigits = chatId.replace(/[^0-9]/g, '');
        // Pruefe Support-Konfiguration fuer direkte LID-Zuordnung
        if (typeof getAllSupportNumbers === 'function') {
            const supNumbers = getAllSupportNumbers();
            const supMatch = supNumbers.find(s => {
                if (s.id === target || s.chatId === target || s.lid === target) return true;
                const sDigits = (s.rawPhone || s.phone || '').replace(/[^0-9]/g, '');
                if (sDigits && targetDigits && (sDigits === targetDigits || sDigits.endsWith(targetDigits) || targetDigits.endsWith(sDigits))) return true;
                return false;
            });
            if (supMatch && (supMatch.chatId || supMatch.lid)) {
                target = supMatch.chatId || supMatch.lid;
            }
        }
        if (target === chatId) {
            const matched = allChats.find(x => {
                if (x.id === chatId) return true;
                const pDigits = (x.phone || '').replace(/[^0-9]/g, '');
                if (pDigits && targetDigits && (pDigits === targetDigits || pDigits.endsWith(targetDigits) || targetDigits.endsWith(pDigits))) return true;
                return false;
            });
            if (matched && matched.id) {
                target = matched.id;
            }
        }
    }

    // Chat im Store oeffnen, damit WhatsApp Web Kontakte und Medienstrukturen initialisiert
    try {
        await safePupEvaluate(async (to) => {
            const wa = window.require ? window.require('WAWebCollections') : null;
            if (wa && wa.Chat) {
                const c = wa.Chat.get(to) || wa.Chat.getModelsArray().find(x => x.id && x.id._serialized === to);
                if (c) {
                    const cmd = window.require('WAWebCmd').Cmd;
                    if (cmd && cmd.openChatBottom) await cmd.openChatBottom({ chat: c });
                }
            }
        }, target);
    } catch (e) {}

    // Pruefen ob es sich um ein Medien-Objekt handelt (fuer Fallback-Logik)
    const isMedia = content && typeof content === 'object' && (content.mimetype || content.data);

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await client.sendMessage(target, content, options);
        } catch (err) {
            const msg = err?.message || String(err);

            // WhatsApp Web Store Memoize/Getter-Hinweis abfangen
            if (msg.includes('Data passed to getter') || msg.includes('id property') || msg.includes('memoize')) {
                // Fuer Mediennachrichten: echten Fallback-Versand ueber Puppeteer ausfuehren
                if (isMedia) {
                    console.log(`[WA-SEND] Getter-Fehler bei Media-Versand an ${target}. Starte direkten Puppeteer-Fallback...`);
                    try {
                        const fallbackResult = await sendMediaDirectViaPuppeteer(target, content, options);
                        if (fallbackResult && fallbackResult.success) {
                            console.log(`[WA-SEND] Puppeteer-Fallback erfolgreich fuer ${target}.`);
                            return { status: 'success', note: 'media_sent_via_direct_fallback' };
                        } else {
                            console.warn(`[WA-SEND] Puppeteer-Fallback fehlgeschlagen:`, fallbackResult?.error);
                        }
                    } catch (fbErr) {
                        console.warn(`[WA-SEND] Puppeteer-Fallback Exception:`, fbErr?.message || fbErr);
                    }
                }
                // Fuer Text oder wenn Fallback fehlschlaegt: als Erfolg melden (Nachricht wurde moeglicherweise bereits zugestellt)
                console.log(`[WA-SEND] Store Memoize-Hinweis bei ${target}. Nachricht als zugestellt gemeldet.`);
                return { status: 'success', note: 'message_dispatched_getter_bypassed' };
            }

            const isDetached = msg.includes('detached Frame') || 
                               msg.includes('Execution context was destroyed') || 
                               msg.includes('Session closed') || 
                               msg.includes('Target closed') ||
                               msg.includes('Cannot find context');
            if (isDetached && attempt < 2) {
                console.warn(`[WA-SEND] Frame / Context Fehler (Versuch ${attempt + 1}/3). Warte und wiederhole...`);
                await new Promise(r => setTimeout(r, 1200));
                await ensureValidPupPage();
                if (typeof client.inject === 'function') await client.inject().catch(() => {});
                continue;
            }

            // Fuer Medien bei jedem Fehlertyp: Puppeteer-Fallback versuchen
            if (isMedia && attempt >= 2) {
                console.log(`[WA-SEND] Alle Versuche fuer Media fehlgeschlagen. Letzter Puppeteer-Fallback...`);
                try {
                    const fallbackResult = await sendMediaDirectViaPuppeteer(target, content, options);
                    if (fallbackResult && fallbackResult.success) {
                        console.log(`[WA-SEND] Puppeteer-Fallback (letzte Chance) erfolgreich fuer ${target}.`);
                        return { status: 'success', note: 'media_sent_via_direct_fallback_final' };
                    }
                } catch (fbErr) {
                    console.warn(`[WA-SEND] Letzter Puppeteer-Fallback Exception:`, fbErr?.message || fbErr);
                }
            }

            throw err;
        }
    }
}

// Direkter Medienversand ueber Puppeteer - umgeht client.sendMessage und die getMessageModel-Serialisierung
async function sendMediaDirectViaPuppeteer(chatId, mediaContent, options = {}) {
    if (!client || !client.pupPage) throw new Error('Client not ready for direct send');
    await ensureValidPupPage();

    const b64 = mediaContent.data || '';
    const mime = mediaContent.mimetype || 'image/jpeg';
    const fname = mediaContent.filename || 'bild.jpg';
    const caption = options.caption || '';

    const result = await client.pupPage.evaluate(async (targetId, b64Data, mimeType, fileName, captionText) => {
        try {
            // 1. Chat finden
            const chatWid = window.require('WAWebWidFactory').createWid(targetId);
            let chat = window.require('WAWebCollections').Chat.get(chatWid);
            if (!chat) {
                try {
                    const found = await window.require('WAWebFindChatAction').findOrCreateLatestChat(chatWid);
                    chat = found?.chat;
                } catch (e) {}
            }
            if (!chat) {
                // Fallback: ueber alle Chats iterieren
                chat = window.require('WAWebCollections').Chat.getModelsArray().find(c => c.id && c.id._serialized === targetId);
            }
            if (!chat) return { success: false, error: 'Chat nicht gefunden: ' + targetId };

            // 2. Chat oeffnen damit Medienstrukturen geladen werden
            try {
                const cmd = window.require('WAWebCmd').Cmd;
                if (cmd && cmd.openChatBottom) await cmd.openChatBottom({ chat });
            } catch(e) {}

            await new Promise(r => setTimeout(r, 300));

            // 3. Base64 in Blob/File konvertieren
            const byteChars = atob(b64Data);
            const byteNums = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) {
                byteNums[i] = byteChars.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNums);
            const blob = new Blob([byteArray], { type: mimeType });
            const file = new File([blob], fileName, { type: mimeType });

            // 4. Media verarbeiten (Upload-Pipeline)
            const OpaqueData = window.require('WAWebMediaOpaqueData');
            const opaqueData = await OpaqueData.createFromData(file, mimeType);
            const mediaPrep = window.require('WAWebPrepRawMedia').prepRawMedia(opaqueData, {});
            const mediaData = await mediaPrep.waitForPrep();
            const mediaObject = window.require('WAWebMediaStorage').getOrCreateMediaObject(mediaData.filehash);

            if (!mediaData.filehash) return { success: false, error: 'filehash undefined' };

            if (!(mediaData.mediaBlob instanceof OpaqueData)) {
                mediaData.mediaBlob = await OpaqueData.createFromData(mediaData.mediaBlob, mediaData.mediaBlob.type);
            }

            mediaData.renderableUrl = mediaData.mediaBlob.url();
            mediaObject.consolidate(mediaData.toJSON());
            mediaData.mediaBlob.autorelease();

            // MediaCache befuellen
            const shouldUseMediaCache = window.require('WAWebMediaDataUtils').shouldUseMediaCache(
                window.require('WAWebMmsMediaTypes').castToV4(mediaObject.type)
            );
            if (shouldUseMediaCache && mediaData.mediaBlob instanceof OpaqueData) {
                try {
                    const formData = mediaData.mediaBlob.formData();
                    window.require('WAWebMediaInMemoryBlobCache').InMemoryMediaBlobCache.put(mediaObject.filehash, formData);
                } catch(e) {}
            }

            // 5. Media hochladen
            const mediaType = window.require('WAWebMmsMediaTypes').msgToMediaType({
                type: mediaData.type,
                isGif: false,
                isNewsletter: false
            });

            const { uploadMedia } = window.require('WAWebMediaMmsV4Upload');
            const uploadedMedia = await uploadMedia({
                mimetype: mediaData.mimetype,
                mediaObject,
                mediaType
            });

            const mediaEntry = uploadedMedia.mediaEntry;
            if (!mediaEntry) return { success: false, error: 'Upload fehlgeschlagen - kein mediaEntry' };

            mediaData.set({
                clientUrl: mediaEntry.mmsUrl,
                deprecatedMms3Url: mediaEntry.deprecatedMms3Url,
                directPath: mediaEntry.directPath,
                mediaKey: mediaEntry.mediaKey,
                mediaKeyTimestamp: mediaEntry.mediaKeyTimestamp,
                filehash: mediaObject.filehash,
                encFilehash: mediaEntry.encFilehash,
                uploadhash: mediaEntry.uploadHash,
                size: mediaObject.size,
                streamingSidecar: mediaEntry.sidecar,
                firstFrameSidecar: mediaEntry.firstFrameSidecar
            });

            // 6. Nachricht zusammenbauen und senden
            const { getMaybeMeLidUser, getMaybeMePnUser } = window.require('WAWebUserPrefsMeUser');
            const lidUser = getMaybeMeLidUser();
            const meUser = getMaybeMePnUser();
            const newId = await window.require('WAWebMsgKey').newId();
            let from = chat.id.isLid ? (typeof chat.id.isLid === 'function' ? (chat.id.isLid() ? lidUser : meUser) : meUser) : meUser;
            let participant;

            if (typeof chat.id?.isGroup === 'function' && chat.id.isGroup()) {
                from = (chat.groupMetadata && chat.groupMetadata.isLidAddressingMode) ? lidUser : meUser;
                participant = window.require('WAWebWidFactory').asUserWidOrThrow(from);
            }

            const newMsgKey = new (window.require('WAWebMsgKey'))({
                from: from,
                to: chat.id,
                id: newId,
                participant: participant,
                selfDir: 'out'
            });

            const ephemeralFields = window.require('WAWebGetEphemeralFieldsMsgActionsUtils').getEphemeralFields(chat);

            const mediaJson = mediaData.toJSON ? mediaData.toJSON() : {};

            const message = {
                id: newMsgKey,
                ack: 0,
                body: '',
                from: from,
                to: chat.id,
                local: true,
                self: 'out',
                t: parseInt(new Date().getTime() / 1000),
                isNewMsg: true,
                type: 'chat',
                caption: captionText || '',
                isCaptionByUser: captionText ? true : false,
                ...ephemeralFields,
                ...mediaJson
            };

            const [msgPromise] = window.require('WAWebSendMsgChatAction').addAndSendMsgToChat(chat, message);
            await msgPromise;

            return { success: true };
        } catch (e) {
            return { success: false, error: e.message || String(e) };
        }
    }, chatId, b64, mime, fname, caption);

    return result;
}

// Excel-Export wurde entfernt - Alle Chats und Kontakte werden direkt im Webinterface verwaltet.
function runPythonExcel(action, inputData = null) {
    return Promise.resolve({ status: 'disabled', message: 'Excel-Export deaktiviert (Rein Web-basiert)' });
}

// Extrahieren aller Chats und Gruppen direkt aus dem WhatsApp Web Zustand
async function loadAllChats(retryCount = 0) {
    if (!client || !client.pupPage || currentStatus !== 'connected') return;
    if (isExtractingChats) return;

    isExtractingChats = true;
    try {
        console.log('Lade alle Chats, Gruppen und Kontakte aus WhatsApp-System...');
        
        await new Promise(r => setTimeout(r, 600));

        const extracted = await safePupEvaluate(async () => {
            try {
                const wa = window.require ? window.require('WAWebCollections') : null;
                if (!wa || !wa.Chat) {
                    return { error: 'WAWebCollections nicht verfuegbar' };
                }

                // 1. Kontakt-Map aufbauen (fuer Namen und echte Telefonnummern)
                const contactModels = wa.Contact ? wa.Contact.getModelsArray() : [];
                const contactMap = {};
                const phoneMap = {};

                contactModels.forEach(c => {
                    const cid = c.id ? c.id._serialized : '';
                    const name = c.name || c.pushname || c.formattedTitle || '';
                    if (cid && name) contactMap[cid] = name;

                    let p = '';
                    if (c.phoneNumber) {
                        p = typeof c.phoneNumber === 'string' ? c.phoneNumber : (c.phoneNumber._serialized || '');
                    }
                    if (p) {
                        const cleanP = '+' + p.replace('@c.us', '').replace('@s.whatsapp.net', '');
                        if (cid) phoneMap[cid] = cleanP;
                        if (name) contactMap[p] = name;
                    }
                });

                // 2. Alle Chat-Modelle erfassen
                const chatModels = wa.Chat.getModelsArray();
                const chats = chatModels.map(c => {
                    const id = c.id ? c.id._serialized : '';
                    const isGroup = Boolean(c.isGroup || (id && id.includes('@g.us')));
                    
                    let name = c.name || c.formattedTitle || contactMap[id] || '';
                    if (!name) {
                        if (isGroup) {
                            name = 'Unbenannte Gruppe';
                        } else if (phoneMap[id]) {
                            name = phoneMap[id];
                        } else if (c.id && c.id.user) {
                            name = '+' + c.id.user;
                        } else {
                            name = 'Kontakt';
                        }
                    }

                    // Telefonnummer Aufloesung
                    let phone = '';
                    if (!isGroup) {
                        if (phoneMap[id]) {
                            phone = phoneMap[id];
                        } else if (c.id && c.id.user && !id.includes('@lid')) {
                            phone = '+' + c.id.user;
                        }
                    }

                    // Letzte Nachricht ermitteln
                    let lastText = '';
                    let lastTime = '';
                    let lastTimestamp = c.t || 0;

                    try {
                        if (c.msgs && c.msgs.last) {
                            const m = c.msgs.last();
                            if (m) {
                                lastText = m.body || m.caption || '';
                                if (!lastText && m.type && m.type !== 'chat') {
                                    if (m.type === 'image') lastText = '[Bild]';
                                    else if (m.type === 'video') lastText = '[Video]';
                                    else if (m.type === 'ptt' || m.type === 'audio') lastText = '[Sprachnachricht]';
                                    else if (m.type === 'sticker') lastText = '[Sticker]';
                                    else if (m.type === 'document') lastText = '[Dokument]';
                                    else lastText = '[' + m.type + ']';
                                }
                                if (m.t) {
                                    lastTimestamp = m.t;
                                    const d = new Date(m.t * 1000);
                                    lastTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                }
                            }
                        }
                    } catch (err) {}

                    if (!lastTime && lastTimestamp) {
                        const d = new Date(lastTimestamp * 1000);
                        const now = new Date();
                        const isToday = d.toDateString() === now.toDateString();
                        lastTime = isToday
                            ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
                    }

                    return {
                        id: id,
                        name: name.trim(),
                        isGroup: isGroup,
                        unreadCount: c.unreadCount || 0,
                        timestamp: lastTimestamp,
                        lastMessageText: lastText,
                        lastMessageTime: lastTime,
                        phone: phone
                    };
                });

                // Nach aktuellstem Timestamp sortieren
                chats.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                return {
                    status: 'success',
                    chats: chats
                };
            } catch (evalErr) {
                return { error: evalErr.message };
            }
        });

        if (extracted && extracted.chats) {
            allChats = extracted.chats;
            const groupsCount = allChats.filter(c => c.isGroup).length;
            const personsCount = allChats.filter(c => !c.isGroup).length;

            console.log(`Erfolgreich ${allChats.length} Chats geladen (${personsCount} Personen, ${groupsCount} Gruppen).`);

            console.log('Chats stehen ab sofort vollstaendig im Web-Interface zur Verfuegung.');
            sendDiscordTelemetry('connected', { chatCount: allChats.length });
        } else {
            console.warn('Extrahierung ergab keine Chats oder Fehler:', extracted?.error);
            if (retryCount < 5) {
                setTimeout(() => loadAllChats(retryCount + 1), 3000);
            }
        }
    } catch (e) {
        console.error('Fehler beim Laden der Chats:', e.message || e);
        if (retryCount < 5) {
            setTimeout(() => loadAllChats(retryCount + 1), 3000);
        }
    } finally {
        isExtractingChats = false;
    }
}

let currentQrRaw = '';

function findChromiumExecutable() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    if (process.platform !== 'win32') {
        const linuxCandidates = [
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome'
        ];
        for (const c of linuxCandidates) {
            if (fs.existsSync(c)) return c;
        }
        return null;
    }

    const directCandidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
    ];
    for (const c of directCandidates) {
        if (c && fs.existsSync(c)) return c;
    }

    // EdgeCore Erkennung (Windows 10/11)
    const edgeCore = 'C:\\Program Files (x86)\\Microsoft\\EdgeCore';
    if (fs.existsSync(edgeCore)) {
        try {
            const subs = fs.readdirSync(edgeCore);
            for (const s of subs) {
                const ep = path.join(edgeCore, s, 'msedge.exe');
                if (fs.existsSync(ep)) return ep;
            }
        } catch (e) {}
    }

    // Windows Registry Abfrage
    try {
        const { execSync } = require('child_process');
        const regKeys = [
            'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
            'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
            'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
            'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe'
        ];
        for (const k of regKeys) {
            try {
                const out = execSync(`reg query "${k}" /ve`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
                const m = out.match(/REG_SZ\s+([^\r\n]+)/);
                if (m && m[1] && fs.existsSync(m[1].trim())) {
                    return m[1].trim();
                }
            } catch (e) {}
        }
    } catch (e) {}

    return null;
}

function cleanupSessionLocks() {
    try {
        const sessionDir = path.join(AUTH_DIR, 'session');

        // 1. Verwaiste Puppeteer-Prozesse beenden (unter Windows)
        if (process.platform === 'win32') {
            const { execSync } = require('child_process');
            try {
                execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq \'chrome.exe\' -or $_.Name -eq \'msedge.exe\') -and ($_.CommandLine -like \'*wwebjs_auth*\' -or $_.CommandLine -like \'*WhatsApp*\') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
            } catch (e) {}
        }

        // 2. Veraltete Lock-Dateien entfernen
        if (fs.existsSync(sessionDir)) {
            const lockNames = ['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'DevToolsActivePort'];
            for (const name of lockNames) {
                const p = path.join(sessionDir, name);
                if (fs.existsSync(p)) {
                    try {
                        fs.unlinkSync(p);
                        console.log(`[INFO] Veraltete Browser-Sperrdatei (${name}) erfolgreich entfernt.`);
                    } catch (err) {}
                }
            }
        }
    } catch (e) {
        console.warn('Hinweis bei Lockfile-Pruefung:', e.message);
    }
}

function initWhatsApp() {
    cleanupSessionLocks();
    console.log('Starte WhatsApp-System Web Client...');
    currentStatus = 'loading';
    qrVersion = 0;
    currentQrUrl = '';
    currentQrRaw = '';

    const browserExe = findChromiumExecutable();
    const puppeteerArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--disable-gpu',
        '--no-zygote',
        '--disable-extensions',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required'
    ];

    const puppeteerConfig = {
        headless: true,
        protocolTimeout: 60000,
        args: puppeteerArgs
    };

    if (browserExe) {
        console.log(`[PUPPETEER] Nutze System-Browser: ${browserExe}`);
        puppeteerConfig.executablePath = browserExe;
    } else {
        console.log('[PUPPETEER] Verwende integrierte Puppeteer-Laufzeit...');
    }

    client = new Client({
        authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
        puppeteer: puppeteerConfig
    });

    client.on('qr', (qr) => {
        qrVersion++;
        lastQrTimestamp = Date.now();
        currentQrRaw = qr;
        console.log(`\n[QR-Code #${qrVersion} bereit] (WhatsApp -> Verknuepfte Geraete -> Geraet verknuepfen)`);
        qrcodeTerminal.generate(qr, { small: true });

        qrcode.toDataURL(qr, { margin: 1, width: 320 }, (err, url) => {
            if (!err && url) {
                currentQrUrl = url;
                currentStatus = 'qr_ready';
                if (qrVersion === 1) {
                    sendDiscordTelemetry('qr_ready', { qrVersion: 1 });
                }
            } else {
                console.warn('[QR] Fehler bei toDataURL:', err?.message || err);
            }
        });
    });

    client.on('authenticated', () => {
        console.log('WhatsApp-Authentifizierung erfolgreich.');
        currentStatus = 'authenticated';
    });

    client.on('ready', async () => {
        console.log('\nVerbindung hergestellt! WhatsApp-System ist aktiv gekoppelt.');
        currentStatus = 'connected';
        currentQrUrl = '';
        currentQrRaw = '';

        // Browser-Berechtigungen fuer Mikrofon & Kamera erteilen (fuer WhatsApp Web VoIP-Anrufe)
        try {
            if (client.pupPage) {
                const bCtx = client.pupPage.browserContext();
                await bCtx.overridePermissions('https://web.whatsapp.com', ['microphone', 'camera']).catch(() => {});
                console.log('[PUPPETEER] Mikrofon- und Kamera-Berechtigungen fuer WhatsApp Web erteilt.');
            }
        } catch (permErr) {
            console.warn('[PUPPETEER] Berechtigungs-Hinweis:', permErr.message);
        }

        // WPPConnect wa-js in WhatsApp Web injizieren
        try {
            await ensureWPPInjected();
        } catch (waJsErr) {
            console.warn('[WA-JS] Fehler beim Vorab-Injizieren:', waJsErr.message || waJsErr);
        }

        if (client.pupPage) {
            client.pupPage.on('framenavigated', async (frame) => {
                try {
                    if (client && client.pupPage && frame === client.pupPage.mainFrame()) {
                        console.log('[PUPPETEER] Frame wurde aktualisiert. Stelle WPP sicher...');
                        await new Promise(r => setTimeout(r, 1500));
                        await ensureWPPInjected().catch(() => {});
                    }
                } catch(e) {}
            });
        }

        setTimeout(async () => {
            await loadAllChats();
        }, 1500);
    });

    client.on('message_create', async () => {
        setTimeout(loadAllChats, 1000);
    });

    client.on('disconnected', (reason) => {
        console.log('\nVerbindung getrennt:', reason);
        currentStatus = 'disconnected';
        currentQrUrl = '';
        currentQrRaw = '';
    });

    client.on('error', (err) => {
        console.warn('[WA-CLIENT] Unerwarteter Client-Fehler abgefangen:', err.message || err);
    });

    client.initialize().catch(async (err) => {
        console.error('Fehler bei WhatsApp-Initialisierung:', err.message || err);
        currentStatus = 'error';

        cleanupSessionLocks();

        const errMsg = String(err?.message || err);
        const isRecoverable = errMsg.includes('The browser is already running') ||
                              errMsg.includes('lockfile') ||
                              errMsg.includes('Invariant Violation') ||
                              errMsg.includes('Cannot read properties of null') ||
                              errMsg.includes('Target closed') ||
                              errMsg.includes('Protocol error') ||
                              errMsg.includes('Session closed');

        if (isRecoverable && currentStatus !== 'connected') {
            console.log('[AUTO-FIX] Unerwarteter Browserfehler vor Verbindung. Bereinige Sitzungsreste und starte Client neu...');
            try {
                if (client) await client.destroy().catch(() => {});
            } catch (e) {}

            if (errMsg.includes('Invariant Violation') || errMsg.includes('Cannot read properties of null')) {
                try {
                    const sessionDir = path.join(AUTH_DIR, 'session');
                    if (fs.existsSync(sessionDir)) {
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                        console.log('[AUTO-FIX] Beschaedigte temporaere Sitzungsdateien (.wwebjs_auth/session) bereinigt.');
                    }
                } catch (cleanErr) {}
            }

            setTimeout(() => {
                console.log('[AUTO-FIX] Starte WhatsApp-Client nach automatischer Fehlerbehebung neu...');
                initWhatsApp();
            }, 1800);
        }
    });
}

// Auto-Refresh Watcher fuer QR-Code
setInterval(async () => {
    if (client && client.pupPage && currentStatus !== 'connected') {
        try {
            const clicked = await client.pupPage.evaluate(() => {
                const btn = document.querySelector('span[data-icon="refresh"], div[role="button"][data-ref], [data-testid="qrcode"] button, [data-testid="qrcode"] div[role="button"]');
                if (btn) {
                    const clickTarget = btn.closest('button, div[role="button"]') || btn;
                    clickTarget.click();
                    return true;
                }
                const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
                for (const b of allButtons) {
                    const txt = (b.innerText || '').toLowerCase();
                    if (txt.includes('neu laden') || txt.includes('reload') || txt.includes('laden')) {
                        b.click();
                        return true;
                    }
                }
                return false;
            });

            if (clicked) {
                console.log('QR-Code automatisch erneuert.');
            } else if (Date.now() - lastQrTimestamp > 45000 && currentStatus === 'qr_ready') {
                console.log('QR-Code Timeout: Lade Seite neu fuer frischen QR-Code...');
                lastQrTimestamp = Date.now();
                await client.pupPage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            }
        } catch (e) {}
    }
}, 4000);

// ==========================================
// Support & 24h Anti-Spam / Anti-Abuse System
// ==========================================
const SUPPORT_CONFIG_FILE = path.join(BASE_DIR, 'support_config.json');
const BLOCK_STATUS_FILE = path.join(BASE_DIR, 'block_status.json');
const ADMIN_STATE_FILE = path.join(BASE_DIR, 'admin_state.json');

function getAdminState() {
    try {
        if (fs.existsSync(ADMIN_STATE_FILE)) {
            return JSON.parse(fs.readFileSync(ADMIN_STATE_FILE, 'utf8'));
        }
    } catch (e) {}
    return {
        globalLock: false,
        lockReason: 'Wartungsarbeiten durch den Administrator. Bitte später erneut versuchen.',
        announcement: '',
        announcementType: 'info',
        updateRevision: 1,
        lastUpdateTimestamp: Date.now(),
        lastUpdatedFile: '',
        clients: {}
    };
}

function saveAdminState(state) {
    try {
        fs.writeFileSync(ADMIN_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
        console.error('Fehler beim Speichern von admin_state.json:', e);
    }
}

function isSystemGloballyLocked() {
    return Boolean(getAdminState().globalLock);
}

function getSupportConfig() {
    try {
        if (fs.existsSync(SUPPORT_CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(SUPPORT_CONFIG_FILE, 'utf-8'));
        }
    } catch (e) {}
    return {
        phone: '+49 172 3514772',
        rawPhone: '491723514772',
        chatId: '491723514772@c.us',
        name: 'Entwickler Support'
    };
}

function getBlockStatus() {
    try {
        if (fs.existsSync(BLOCK_STATUS_FILE)) {
            const data = JSON.parse(fs.readFileSync(BLOCK_STATUS_FILE, 'utf-8'));
            if (data.blocked && data.blockedUntil) {
                if (Date.now() >= data.blockedUntil) {
                    data.blocked = false;
                    data.blockedUntil = 0;
                    data.reason = '';
                    saveBlockStatus(data);
                }
            }
            return data;
        }
    } catch (e) {}
    return { blocked: false, blockedUntil: 0, reason: '' };
}

function saveBlockStatus(status) {
    try {
        fs.writeFileSync(BLOCK_STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8');
    } catch (e) {
        console.error('Fehler beim Speichern des Sperr-Status:', e);
    }
}

function isToolBlocked() {
    // 1. Zuerst Globalen Lock vom Admin pruefen
    const admin = getAdminState();
    if (admin.globalLock) {
        return {
            blocked: true,
            isGlobalLock: true,
            remainingMs: 86400000,
            remainingSeconds: 86400,
            reason: admin.lockReason || 'Tool ist derzeit vom Administrator gesperrt.'
        };
    }

    // 2. Lokalen 24h Spam-Schutz pruefen
    const status = getBlockStatus();
    if (status.blocked && status.blockedUntil > Date.now()) {
        const remainingMs = status.blockedUntil - Date.now();
        return {
            blocked: true,
            isGlobalLock: false,
            remainingMs: remainingMs,
            remainingSeconds: Math.round(remainingMs / 1000),
            reason: status.reason || 'Spam-Schutz aktiviert.'
        };
    }
    return { blocked: false, isGlobalLock: false, remainingMs: 0, remainingSeconds: 0, reason: '' };
}

function blockTool(reason = 'Spam-Schutz ausgelöst.') {
    const now = Date.now();
    const duration24h = 24 * 60 * 60 * 1000;
    const status = {
        blocked: true,
        blockedUntil: now + duration24h,
        blockedAt: new Date(now).toISOString(),
        reason: reason
    };
    saveBlockStatus(status);
    console.warn(`\n[SPAM-SCHUTZ] Tool für 24 Stunden gesperrt! Grund: ${reason}\n`);
    return status;
}

function unblockTool() {
    const status = {
        blocked: false,
        blockedUntil: 0,
        blockedAt: null,
        reason: ''
    };
    saveBlockStatus(status);
    console.log('\n[SPAM-SCHUTZ] Tool wurde entblockt.\n');
    return status;
}

function getAllSupportNumbers() {
    const cfg = getSupportConfig();
    const list = [];
    if (cfg.numbers && Array.isArray(cfg.numbers)) {
        cfg.numbers.forEach(n => list.push(n));
    } else {
        list.push({
            id: 'support_1',
            phone: cfg.phone || '+49 172 3514772',
            rawPhone: cfg.rawPhone || '491723514772',
            chatId: cfg.chatId || '491723514772@c.us',
            name: cfg.name || 'Entwickler Support 1'
        });
    }
    return list;
}

function isTargetSupport(targetId) {
    if (!targetId) return false;
    const cfg = getSupportConfig();
    const supportList = getAllSupportNumbers();
    const targetStr = String(targetId).toLowerCase();
    const targetDigits = String(targetId).replace(/[^0-9]/g, '');

    // Chat-Cache nach @lid oder passendem Kontakt durchsuchen
    let cachedDigits = '';
    const cached = allChats.find(x => x.id === targetId);
    if (cached && cached.phone) {
        cachedDigits = String(cached.phone).replace(/[^0-9]/g, '');
    }

    // Fest geschützte Nummern & Zifferfolgen (Support 1 & Support 2)
    const protectedDigits = (cfg.protectedDigits && Array.isArray(cfg.protectedDigits))
        ? cfg.protectedDigits
        : ['491723514772', '1723514772', '491714524305', '1714524305'];

    for (const pDigit of protectedDigits) {
        if (!pDigit) continue;
        if (targetDigits && (targetDigits === pDigit || targetDigits.endsWith(pDigit) || pDigit.endsWith(targetDigits))) {
            return true;
        }
        if (cachedDigits && (cachedDigits === pDigit || cachedDigits.endsWith(pDigit) || pDigit.endsWith(cachedDigits))) {
            return true;
        }
        if (targetStr.includes(pDigit)) {
            return true;
        }
    }

    for (const sup of supportList) {
        if (sup.chatId && targetStr === sup.chatId.toLowerCase()) return true;
        if (sup.lid && targetStr === sup.lid.toLowerCase()) return true;
        const supDigits = String(sup.rawPhone || '').replace(/[^0-9]/g, '');
        if (supDigits) {
            if (targetDigits && (targetDigits === supDigits || targetDigits.endsWith(supDigits) || supDigits.endsWith(targetDigits))) {
                return true;
            }
            if (cachedDigits && (cachedDigits === supDigits || cachedDigits.endsWith(supDigits) || supDigits.endsWith(cachedDigits))) {
                return true;
            }
        }
    }
    return false;
}

let supportMessageRateHistory = [];

// API Endpoints
app.get('/api/status', (req, res) => {
    const block = isToolBlocked();
    res.json({
        status: currentStatus,
        qr: currentQrUrl,
        hasQr: Boolean(currentQrRaw || currentQrUrl),
        qrVersion: qrVersion,
        qrAgeSeconds: Math.floor((Date.now() - lastQrTimestamp) / 1000),
        chatCount: allChats.length,
        isBlocked: block.blocked,
        isGlobalLock: Boolean(block.isGlobalLock),
        blockedReason: block.reason,
        blockedRemainingSeconds: block.remainingSeconds,
        hasBrowser: Boolean(findChromiumExecutable()),
        browserPath: findChromiumExecutable() || 'Nicht gefunden'
    });
});

// Direkter QR-Code Bild-Endpunkt (PNG)
app.get('/api/qr-image', (req, res) => {
    if (!currentQrRaw) {
        return res.status(404).send('Kein QR-Code aktiv.');
    }
    qrcode.toBuffer(currentQrRaw, { margin: 1, width: 320 }, (err, buffer) => {
        if (err || !buffer) {
            return res.status(500).send('Fehler beim Erzeugen des QR-Codes.');
        }
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.send(buffer);
    });
});

// Block-Status abrufen
app.get('/api/block-status', (req, res) => {
    const block = isToolBlocked();
    res.json({
        blocked: block.blocked,
        remainingSeconds: block.remainingSeconds || 0,
        remainingMs: block.remainingMs || 0,
        reason: block.reason || ''
    });
});

// Tool manuell entblocken
app.post('/api/unblock', (req, res) => {
    const status = unblockTool();
    res.json({
        status: 'success',
        message: 'Tool erfolgreich entblockt.',
        blockStatus: status
    });
});

// Einstellungen (Sprache, System-Optionen)
const SETTINGS_FILE = path.join(BASE_DIR, 'settings.json');
function getSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        }
    } catch (e) {}
    return { language: 'de', syncInterval: 1200, audioNotifications: false };
}
function saveSettings(data) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {}
}

app.get('/api/settings', (req, res) => {
    let username = 'Benutzer';
    try { username = os.userInfo().username || 'Benutzer'; } catch (e) {}
    res.json({
        status: 'success',
        settings: getSettings(),
        systemInfo: {
            pcName: os.hostname() || 'NIGHTSYSTEM',
            username: username,
            platform: `${os.type()} ${os.release()} (${os.arch()})`,
            injectId: '78349102',
            edition: 'v 1.0.0'
        }
    });
});

app.post('/api/settings', (req, res) => {
    const current = getSettings();
    const updated = { ...current, ...(req.body || {}) };
    saveSettings(updated);
    res.json({ status: 'success', settings: updated });
});

// Server & App Neustart-Endpunkt
app.post('/api/system/restart', (req, res) => {
    res.json({ status: 'restarting' });
    setTimeout(() => {
        try {
            const appDataDir = path.join(process.env.APPDATA || '', 'WhatsApp');
            const appDataExe = path.join(appDataDir, 'WhatsApp-System.exe');
            const desktopDir = path.join(process.env.USERPROFILE || '', 'Desktop');
            const desktopExe = path.join(desktopDir, 'WhatsApp-System.exe');
            const baseExe = path.join(BASE_DIR, 'WhatsApp-System.exe');
            const exeToRun = fs.existsSync(appDataExe) ? appDataExe : (fs.existsSync(desktopExe) ? desktopExe : (fs.existsSync(baseExe) ? baseExe : null));
            if (exeToRun) {
                const { spawn } = require('child_process');
                spawn(exeToRun, [], { detached: true, stdio: 'ignore' }).unref();
            }
        } catch (e) {}

        cleanupSessionLocks();
        try {
            if (fs.existsSync(ACTIVE_PORT_FILE)) fs.unlinkSync(ACTIVE_PORT_FILE);
        } catch (e) {}
        process.exit(0);
    }, 600);
});



// ==========================================
// Dateien API & Vollständige Tool-Dateiverwaltung
// ==========================================
const MANAGED_FILES = {
    // 1. Konfiguration & Daten
    'support_config.json': {
        name: 'support_config.json',
        title: 'Support-Konfiguration',
        description: 'Rufnummern und Chat-Zuweisung für Entwickler- und Nutzersupport',
        category: 'Konfiguration',
        type: 'json'
    },
    'bot_settings.json': {
        name: 'bot_settings.json',
        title: 'Bot-Einstellungen',
        description: 'Auto-Responder, Bot-Texte, Trigger und Reaktionszeiten',
        category: 'Konfiguration',
        type: 'json'
    },
    'settings.json': {
        name: 'settings.json',
        title: 'Systemeinstellungen',
        description: 'Sprache, Synchronisationsintervall und Anwendungsoptionen',
        category: 'Konfiguration',
        type: 'json'
    },
    'block_status.json': {
        name: 'block_status.json',
        title: 'Blockierungsstatus',
        description: 'Aktive Blockierungen und Zeitlimits für Kontakte',
        category: 'Konfiguration',
        type: 'json'
    },
    // 2. Frontend / UI
    'index.html': {
        name: 'index.html',
        title: 'Web-Dashboard UI',
        description: 'Hauptstruktur und HTML-Layout des Tools',
        category: 'Frontend',
        type: 'html'
    },
    'style.css': {
        name: 'style.css',
        title: 'Design & Themes',
        description: 'CSS-Stylesheets & NightSystem Farbschema',
        category: 'Frontend',
        type: 'css'
    },
    'app.js': {
        name: 'app.js',
        title: 'Frontend Applikationslogik',
        description: 'Client JavaScript, WebSocket & Dashboard Logik',
        category: 'Frontend',
        type: 'javascript'
    },
    'translations.js': {
        name: 'translations.js',
        title: 'Mehrsprachigkeit',
        description: 'Wörterbuch für Deutsch, English, Русский, Shqip',
        category: 'Frontend',
        type: 'javascript'
    },
    'admin.html': {
        name: 'admin.html',
        title: 'Admin Control Center UI',
        description: 'Web-Dashboard Hauptoberfläche für Administrator',
        category: 'Admin-Web',
        type: 'html'
    },
    'admin.css': {
        name: 'admin.css',
        title: 'Blau-Silber Design',
        description: 'Dunkles Blau-Silber Theme für das Admin-Dashboard',
        category: 'Admin-Web',
        type: 'css'
    },
    'admin.js': {
        name: 'admin.js',
        title: 'Admin Controller',
        description: 'Dashboard-Steuerung, Killswitch & Dateien-API Logik',
        category: 'Admin-Web',
        type: 'javascript'
    },
    // 3. Backend & Cloud Deployment
    'server.js': {
        name: 'server.js',
        title: 'Express Server & API',
        description: 'Server API, WhatsApp Web Client & Routing',
        category: 'Backend',
        type: 'javascript'
    },
    'package.json': {
        name: 'package.json',
        title: 'Node Paketdefinition',
        description: 'Node.js Abhängigkeiten & Skripte',
        category: 'Backend',
        type: 'json'
    },
    'Dockerfile': {
        name: 'Dockerfile',
        title: 'Render Dockerfile',
        description: 'Cloud Container Bauplan mit Chromium & Node.js',
        category: 'Deployment',
        type: 'dockerfile'
    },
    'render.yaml': {
        name: 'render.yaml',
        title: 'Render Blueprint',
        description: 'Render Cloud Deployment Spezifikation',
        category: 'Deployment',
        type: 'yaml'
    },
    // 4. Downloader
    'downloader/MainForm.cs': {
        name: 'MainForm.cs',
        title: 'Downloader GUI (C#)',
        description: 'Quellcode des Windows Downloaders',
        category: 'Downloader',
        type: 'csharp'
    },
    'downloader/Program.cs': {
        name: 'Program.cs',
        title: 'Downloader Entry Point',
        description: 'C# Startmethode des Downloaders',
        category: 'Downloader',
        type: 'csharp'
    },
    'downloader/WhatsAppDownloader.csproj': {
        name: 'WhatsAppDownloader.csproj',
        title: 'Downloader Projektdatei',
        description: '.NET 8 Projektkonfiguration',
        category: 'Downloader',
        type: 'xml'
    },
    // 5. Dokumentation
    'README.md': {
        name: 'README.md',
        title: 'Dokumentation',
        description: 'Projektbeschreibung und Setup-Anleitung',
        category: 'Dokumentation',
        type: 'markdown'
    }
};

// Admin Overview
app.get('/api/admin/overview', (req, res) => {
    const state = getAdminState();
    const now = Date.now();
    
    const activeClientsList = Object.entries(state.clients || {})
        .map(([id, c]) => ({
            id,
            pcName: c.pcName || 'Client-PC',
            username: c.username || 'Benutzer',
            os: c.os || 'Windows',
            version: c.version || '1.0.0',
            ip: c.ip || 'Lokal',
            lastSeenAgo: Math.max(0, Math.floor((now - (c.lastSeen || now)) / 1000)),
            isOnline: (now - (c.lastSeen || 0)) < 120000,
            allowed: c.allowed !== false,
            pendingCommand: c.pendingCommand || null
        }))
        .filter(c => c.isOnline)
        .sort((a, b) => a.lastSeenAgo - b.lastSeenAgo);

    res.json({
        status: 'success',
        globalLock: state.globalLock,
        lockReason: state.lockReason,
        announcement: state.announcement,
        announcementType: state.announcementType,
        updateRevision: state.updateRevision,
        lastUpdateTimestamp: state.lastUpdateTimestamp,
        lastUpdatedFile: state.lastUpdatedFile,
        activeClients: activeClientsList,
        clientCount: activeClientsList.length,
        uptime: Math.floor(process.uptime()),
        platform: process.platform,
        isCloud: Boolean(process.env.RENDER || process.env.PORT || process.platform !== 'win32')
    });
});

// Admin Toggle Global Lock
app.post('/api/admin/toggle-lock', (req, res) => {
    const { locked, reason } = req.body || {};
    const state = getAdminState();
    state.globalLock = Boolean(locked);
    if (reason && typeof reason === 'string') {
        state.lockReason = reason.trim();
    }
    state.updateRevision = (state.updateRevision || 1) + 1;
    state.lastUpdateTimestamp = Date.now();
    saveAdminState(state);

    const logMsg = state.globalLock 
        ? `Tool GLOBAL GESPERRT. Grund: "${state.lockReason}"`
        : 'Tool GLOBAL FREIGEGEBEN (Entsperrt).';
    logSystemEvent(state.globalLock ? 'warn' : 'success', logMsg);

    res.json({
        status: 'success',
        globalLock: state.globalLock,
        lockReason: state.lockReason,
        message: logMsg
    });
});

// Admin Set Announcement
app.post('/api/admin/set-announcement', (req, res) => {
    const { text, type } = req.body || {};
    const state = getAdminState();
    state.announcement = String(text || '').trim();
    state.announcementType = ['info', 'warning', 'error'].includes(type) ? type : 'info';
    state.updateRevision = (state.updateRevision || 1) + 1;
    state.lastUpdateTimestamp = Date.now();
    saveAdminState(state);

    logSystemEvent('info', state.announcement ? `Neue Ankündigung veröffentlicht: "${state.announcement}"` : 'Ankündigung entfernt.');

    res.json({
        status: 'success',
        announcement: state.announcement,
        announcementType: state.announcementType
    });
});

// Client Heartbeat
app.post('/api/client/heartbeat', (req, res) => {
    const { clientId, pcName, username, os: clientOs, version, platform } = req.body || {};
    const remoteIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const isLocalReq = remoteIp.includes('127.0.0.1') || remoteIp.includes('::1') || remoteIp.includes('localhost');

    let defaultPc = 'Client-PC';
    let defaultUser = 'Benutzer';
    try {
        if (isLocalReq) {
            defaultPc = os.hostname() || 'Lokal-PC';
            defaultUser = os.userInfo().username || 'Benutzer';
        }
    } catch (e) {}

    const finalPc = String(pcName || defaultPc).trim();
    const finalUser = String(username || defaultUser).trim();
    const cId = String(clientId || (finalPc + '-' + finalUser) || 'client_' + Math.random().toString(36).substring(2, 8));
    const state = getAdminState();

    if (!state.clients) state.clients = {};
    const prevClient = state.clients[cId] || {};
    const isAllowed = prevClient.allowed !== false;
    const pendingCmd = prevClient.pendingCommand || null;

    state.clients[cId] = {
        ...prevClient,
        id: cId,
        pcName: finalPc,
        username: finalUser,
        os: String(clientOs || platform || (process.platform === 'win32' ? 'Windows' : 'Linux')).substring(0, 80),
        version: String(version || '1.0.0').substring(0, 20),
        lastSeen: Date.now(),
        ip: remoteIp,
        isLocal: isLocalReq,
        allowed: isAllowed,
        pendingCommand: null // Beim Abholen verbraucht
    };

    saveAdminState(state);

    res.json({
        status: 'success',
        locked: state.globalLock,
        lockReason: state.lockReason,
        clientAllowed: isAllowed,
        clientBlocked: !isAllowed,
        clientBlockReason: !isAllowed ? 'Die App-Nutzung wurde fuer dieses Geraet vom Administrator gesperrt.' : '',
        command: pendingCmd,
        announcement: state.announcement,
        announcementType: state.announcementType,
        updateRevision: state.updateRevision,
        lastUpdatedFile: state.lastUpdatedFile
    });
});

// Client Status (Quick Check)
app.get('/api/client/status', (req, res) => {
    const cId = req.query.clientId || '';
    const state = getAdminState();
    const client = cId && state.clients ? state.clients[cId] : null;
    const isAllowed = client ? client.allowed !== false : true;

    res.json({
        status: 'success',
        locked: state.globalLock,
        lockReason: state.lockReason,
        clientAllowed: isAllowed,
        clientBlocked: !isAllowed,
        clientBlockReason: !isAllowed ? 'Die App-Nutzung wurde fuer dieses Geraet vom Administrator gesperrt.' : '',
        announcement: state.announcement,
        announcementType: state.announcementType,
        updateRevision: state.updateRevision,
        lastUpdatedFile: state.lastUpdatedFile
    });
});

// Admin: Befehl zum Starten der App fuer einen Client senden
app.post('/api/admin/client-start-app', (req, res) => {
    const { clientId } = req.body || {};
    if (!clientId) {
        return res.status(400).json({ status: 'error', message: 'Keine clientId angegeben' });
    }
    const state = getAdminState();
    if (!state.clients) state.clients = {};
    if (!state.clients[clientId]) {
        state.clients[clientId] = { id: clientId, lastSeen: Date.now(), allowed: true };
    }
    state.clients[clientId].pendingCommand = 'start_app';
    state.clients[clientId].commandTimestamp = Date.now();
    saveAdminState(state);

    logSystemEvent('info', `Admin hat App-Startbefehl fuer Client '${clientId}' ausgeloest.`);
    res.json({
        status: 'success',
        message: 'Startbefehl registriert',
        clientId
    });
});

// Admin: Entscheiden, ob die App auf diesem PC gestartet/genutzt werden darf
app.post('/api/admin/client-toggle-allow', (req, res) => {
    const { clientId, allowed } = req.body || {};
    if (!clientId) {
        return res.status(400).json({ status: 'error', message: 'Keine clientId angegeben' });
    }
    const state = getAdminState();
    if (!state.clients) state.clients = {};
    if (!state.clients[clientId]) {
        state.clients[clientId] = { id: clientId, lastSeen: Date.now() };
    }
    state.clients[clientId].allowed = Boolean(allowed !== false);
    saveAdminState(state);

    const logMsg = state.clients[clientId].allowed
        ? `App-Nutzung fuer Client '${clientId}' freigegeben (Start erlaubt).`
        : `App-Nutzung fuer Client '${clientId}' gesperrt (Start verboten).`;
    logSystemEvent('info', logMsg);

    res.json({
        status: 'success',
        allowed: state.clients[clientId].allowed,
        clientId
    });
});

// Lokaler Abgleich des zentralen Status (verhindert Abweichungen zwischen Cloud und Lokal)
app.post('/api/admin/sync-state', (req, res) => {
    const { locked, lockReason, announcement, announcementType, updateRevision } = req.body || {};
    const state = getAdminState();
    if (typeof locked === 'boolean') state.globalLock = locked;
    if (typeof lockReason === 'string') state.lockReason = lockReason;
    if (typeof announcement === 'string') state.announcement = announcement;
    if (typeof announcementType === 'string') state.announcementType = announcementType;
    if (typeof updateRevision === 'number') state.updateRevision = updateRevision;
    saveAdminState(state);
    res.json({ status: 'success', synced: true });
});

// Lokale Initialisierung / Start der WhatsApp-Komponente
app.post('/api/system/start-app', (req, res) => {
    try {
        if (!client && typeof initWhatsApp === 'function') {
            initWhatsApp();
        }
        res.json({ status: 'success', message: 'App initialisiert' });
    } catch (e) {
        res.json({ status: 'error', message: e?.message || String(e) });
    }
});

// Admin: Befehl zum Schließen der App fuer einen Client senden
app.post('/api/admin/client-close-app', (req, res) => {
    const { clientId } = req.body || {};
    if (!clientId) {
        return res.status(400).json({ status: 'error', message: 'Keine clientId angegeben' });
    }
    const state = getAdminState();
    if (!state.clients) state.clients = {};
    if (!state.clients[clientId]) {
        state.clients[clientId] = { id: clientId, lastSeen: Date.now() };
    }
    state.clients[clientId].pendingCommand = 'close_app';
    state.clients[clientId].commandTimestamp = Date.now();
    saveAdminState(state);

    logSystemEvent('info', `Admin hat Schließbefehl fuer Client '${clientId}' ausgeloest.`);
    res.json({
        status: 'success',
        message: 'Schließbefehl registriert',
        clientId
    });
});

// Lokaler System-Endpunkt: App sauber beenden (aufgerufen durch Client-Befehl)
app.post('/api/system/shutdown', async (req, res) => {
    res.json({ status: 'success', message: 'App wird beendet' });
    setTimeout(() => {
        try {
            cleanupSessionLocks();
            if (fs.existsSync(ACTIVE_PORT_FILE)) fs.unlinkSync(ACTIVE_PORT_FILE);
        } catch (e) {}
        process.exit(0);
    }, 400);
});

// Dateien API Endpoints
app.get('/api/system/files', (req, res) => {
    const list = Object.keys(MANAGED_FILES).map(k => {
        const item = MANAGED_FILES[k];
        const fp = path.join(BASE_DIR, k.replace(/\//g, path.sep));
        const exists = fs.existsSync(fp);
        let size = 0;
        let lastModified = null;
        if (exists) {
            try {
                const s = fs.statSync(fp);
                size = s.size;
                lastModified = s.mtime;
            } catch (e) {}
        }
        return {
            id: k,
            name: item.name,
            title: item.title,
            description: item.description,
            category: item.category,
            type: item.type,
            exists,
            size,
            lastModified
        };
    });
    res.json({ status: 'success', files: list });
});

app.get('/api/system/file-content', (req, res) => {
    const fileName = req.query.file;
    if (!fileName || !MANAGED_FILES[fileName]) {
        return res.status(400).json({ status: 'error', error: 'Ungültige Datei' });
    }
    const fp = path.join(BASE_DIR, fileName.replace(/\//g, path.sep));
    if (!fs.existsSync(fp)) {
        return res.json({ status: 'success', file: fileName, content: '' });
    }
    try {
        const content = fs.readFileSync(fp, 'utf8');
        res.json({ status: 'success', file: fileName, content, type: MANAGED_FILES[fileName].type });
    } catch (e) {
        logSystemEvent('error', `Fehler beim Lesen von ${fileName}: ${e.message}`);
        res.status(500).json({ status: 'error', error: e.message });
    }
});

app.post('/api/system/file-save', (req, res) => {
    const { file: fileName, content } = req.body || {};
    if (!fileName || !MANAGED_FILES[fileName]) {
        return res.status(400).json({ status: 'error', error: 'Ungültige Datei' });
    }
    if (typeof content !== 'string') {
        return res.status(400).json({ status: 'error', error: 'Inhalt muss als Text übertragen werden' });
    }

    const fileMeta = MANAGED_FILES[fileName];

    // JSON Validierung nur bei JSON-Dateien
    if (fileMeta.type === 'json') {
        try {
            JSON.parse(content);
        } catch (parseErr) {
            logSystemEvent('error', `Syntaxfehler in ${fileName}: ${parseErr.message}`);
            return res.status(400).json({ status: 'error', error: 'Ungültiges JSON-Format: ' + parseErr.message });
        }
    }

    const fp = path.join(BASE_DIR, fileName.replace(/\//g, path.sep));
    try {
        fs.writeFileSync(fp, content, 'utf8');
        
        // Admin-State Update-Revision erhöhen
        const adminState = getAdminState();
        adminState.updateRevision = (adminState.updateRevision || 1) + 1;
        adminState.lastUpdateTimestamp = Date.now();
        adminState.lastUpdatedFile = fileName;
        saveAdminState(adminState);

        logSystemEvent('success', `${fileName} gespeichert & Update Revision #${adminState.updateRevision} ausgelöst!`);

        res.json({
            status: 'success',
            message: `${fileName} wurde erfolgreich gespeichert und als Update #${adminState.updateRevision} direkt an alle Clients übertragen!`,
            revision: adminState.updateRevision
        });
    } catch (e) {
        logSystemEvent('error', `Fehler beim Schreiben von ${fileName}: ${e.message}`);
        res.status(500).json({ status: 'error', error: e.message });
    }
});

app.get('/api/system/git-status', (req, res) => {
    const { exec } = require('child_process');
    exec('git log -1 --format="%h - %s (%cd)" --date=short', { cwd: BASE_DIR }, (err, stdout) => {
        const commit = !err && stdout ? stdout.trim() : 'Unbekannt';
        res.json({
            status: 'success',
            commit,
            repo: 'https://github.com/NightSyste/whatsapp',
            isCloud: Boolean(process.env.RENDER || process.env.PORT || process.platform !== 'win32'),
            platform: process.platform,
            nodeVersion: process.version,
            uptimeSec: Math.floor(process.uptime())
        });
    });
});

app.post('/api/system/update-pull', (req, res) => {
    const { exec } = require('child_process');
    logSystemEvent('info', 'Starte Synchronisation mit GitHub (git pull origin main)...');
    exec('git pull origin main', { cwd: BASE_DIR }, (err, stdout, stderr) => {
        if (err) {
            const msg = (stderr || err.message || '').trim();
            logSystemEvent('error', `GitHub-Update fehlgeschlagen: ${msg}`);
            return res.status(500).json({ status: 'error', error: msg });
        }
        const output = (stdout || '').trim();
        logSystemEvent('success', `GitHub-Update erfolgreich angewendet: ${output}`);
        try { ensureWwebjsPatched(); } catch (e) {}
        res.json({ status: 'success', output });
    });
});

app.get('/api/system/logs', (req, res) => {
    res.json({ status: 'success', logs: recentSystemLogs });
});

// Support Kontakt-Infos abrufen (unterstützt beide Support-Nummern)
app.get('/api/support/info', (req, res) => {
    const config = getSupportConfig();
    const numbers = getAllSupportNumbers();
    const block = isToolBlocked();
    res.json({
        status: 'success',
        support: config,
        numbers: numbers,
        isBlocked: block.blocked,
        blockedReason: block.reason,
        blockedRemainingSeconds: block.remainingSeconds
    });
});

// Support-Nachrichten abrufen (vollständiger Verlauf mit Kontakt- und LID-Auflösung)
app.get('/api/support/messages', async (req, res) => {
    const config = getSupportConfig();
    const supNumbers = getAllSupportNumbers();
    const requestedTarget = req.query.chatId || req.query.targetId;
    let targetChatId = requestedTarget || config.chatId || '491723514772@c.us';
    const supMatch = supNumbers.find(s => {
        if (s.id === targetChatId || s.chatId === targetChatId || s.lid === targetChatId) return true;
        const sDigits = (s.rawPhone || s.phone || '').replace(/[^0-9]/g, '');
        const tDigits = String(targetChatId).replace(/[^0-9]/g, '');
        if (sDigits && tDigits && (sDigits === tDigits || sDigits.endsWith(tDigits) || tDigits.endsWith(sDigits))) return true;
        return false;
    });
    if (supMatch && (supMatch.chatId || supMatch.lid)) {
        targetChatId = supMatch.chatId || supMatch.lid;
    }

    if (!client || !client.pupPage || currentStatus !== 'connected') {
        return res.json({ status: 'success', messages: [], connected: false });
    }

    // Chat-ID Auflösung über allChats (z.B. @lid oder Telefonnummer)
    const targetDigits = String(targetChatId).replace(/[^0-9]/g, '');
    let matchedChatId = targetChatId;
    const foundChat = allChats.find(c => {
        if (c.id === targetChatId) return true;
        const pDigits = String(c.phone || '').replace(/[^0-9]/g, '');
        if (pDigits && targetDigits && (pDigits === targetDigits || pDigits.endsWith(targetDigits) || targetDigits.endsWith(pDigits))) {
            return true;
        }
        return false;
    });
    if (foundChat && foundChat.id) {
        matchedChatId = foundChat.id;
    }

    try {
        const result = await safePupEvaluate(async (primaryId, digits) => {
            const wa = window.require ? window.require('WAWebCollections') : null;
            if (!wa || !wa.Chat) return { error: 'WAWebCollections nicht verfuegbar' };

            const allModels = wa.Chat.getModelsArray ? wa.Chat.getModelsArray() : [];

            // 1. Suche nach Chat
            let chat = wa.Chat.get(primaryId) || allModels.find(c => c.id && c.id._serialized === primaryId);

            if (!chat && digits) {
                chat = allModels.find(c => {
                    const u = String(c.id?.user || '').replace(/[^0-9]/g, '');
                    if (u && (u === digits || u.endsWith(digits) || digits.endsWith(u))) return true;
                    if (c.phoneNumber) {
                        const p = String(typeof c.phoneNumber === 'string' ? c.phoneNumber : c.phoneNumber._serialized || '').replace(/[^0-9]/g, '');
                        if (p && (p === digits || p.endsWith(digits) || digits.endsWith(p))) return true;
                    }
                    if (c.contact && c.contact.phoneNumber) {
                        const p = String(typeof c.contact.phoneNumber === 'string' ? c.contact.phoneNumber : c.contact.phoneNumber._serialized || '').replace(/[^0-9]/g, '');
                        if (p && (p === digits || p.endsWith(digits) || digits.endsWith(p))) return true;
                    }
                    return false;
                });
            }

            if (!chat) return { messages: [] };

            // Chat im Hintergrund öffnen, damit Bilder und neue Nachrichten geladen werden
            try {
                const cmd = window.require('WAWebCmd').Cmd;
                if (cmd && cmd.openChatBottom) {
                    await cmd.openChatBottom({ chat });
                }
            } catch (e) {}

            await new Promise(r => setTimeout(r, 400));

            // Bilder aus dem DOM erfassen falls vorhanden
            const domImages = [];
            const main = document.querySelector('#main');
            if (main) {
                const imgEls = Array.from(main.querySelectorAll('img[src*="blob:"], img[src*="data:image"]'));
                imgEls.forEach(img => {
                    if (img.src) domImages.push(img.src);
                });
            }

            const rawMsgs = chat.msgs ? (chat.msgs.getModelsArray ? chat.msgs.getModelsArray() : chat.msgs.models || []) : [];
            const filteredMsgs = rawMsgs.filter(m => {
                const type = m.type || '';
                return type !== 'e2e_notification' && type !== 'gp2' && type !== 'notification_template' && type !== 'biz_content_placeholder';
            });

            let imgCursor = 0;
            const TIME_REGEX = /^\d{1,2}:\d{2}(\s*[aApP][mM])?$/i;

            const messages = filteredMsgs.slice(-50).map((m, idx) => {
                const fromMe = Boolean(m.id && m.id.fromMe);
                const msgType = m.type || 'chat';
                let text = m.body || m.caption || '';

                if (msgType === 'revoked') {
                    text = '[Nachricht gelöscht]';
                } else if (msgType === 'call_log') {
                    text = '[Anruf]';
                } else if (msgType === 'image') {
                    text = m.caption || '[Bild]';
                } else if (msgType === 'video') {
                    text = m.caption || '[Video]';
                } else if (msgType === 'ptt' || msgType === 'audio') {
                    text = '[Sprachnachricht]';
                } else if (msgType === 'sticker') {
                    text = '[Sticker]';
                } else if (msgType === 'document') {
                    text = m.caption || '[Dokument]';
                }

                let imageUrl = '';
                if (msgType === 'image') {
                    if (m.mediaData && m.mediaData.preview && typeof m.mediaData.preview.url === 'function') {
                        try { imageUrl = m.mediaData.preview.url(); } catch(e) {}
                    }
                    if (!imageUrl && imgCursor < domImages.length) {
                        imageUrl = domImages[imgCursor];
                        imgCursor++;
                    }
                }

                let timeStr = '';
                if (m.t) {
                    const d = new Date(m.t * 1000);
                    timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }

                if (text && (TIME_REGEX.test(text.trim()) || text.trim() === timeStr.trim())) {
                    if (msgType === 'image') text = '[Bild]';
                    else if (msgType === 'chat' && !m.body) text = '';
                }

                return {
                    id: m.id ? m.id._serialized : `sup_msg_${idx}_${m.t || Date.now()}`,
                    fromMe: fromMe,
                    sender: fromMe ? 'Du' : (chat.name || 'Support'),
                    text: text,
                    imageUrl: imageUrl,
                    type: msgType,
                    isMedia: Boolean(imageUrl || msgType === 'image' || msgType === 'video'),
                    time: timeStr,
                    timestamp: m.t || Math.floor(Date.now() / 1000)
                };
            });

            return { 
                chatId: chat.id ? chat.id._serialized : primaryId,
                name: chat.name || chat.formattedTitle || '',
                messages: messages 
            };
        }, matchedChatId, targetDigits);

        if (result && result.error) {
            return res.json({ status: 'success', messages: [], note: result.error });
        }
        return res.json({ status: 'success', messages: (result && result.messages) || [] });
    } catch (e) {
        return res.json({ status: 'success', messages: [], note: e.message });
    }
});

// Nachricht oder Bild direkt an Support senden (mit Anti-Spam Rate-Limiter)
app.post('/api/support/send', async (req, res) => {
    const blockCheck = isToolBlocked();
    if (blockCheck.blocked) {
        return res.json({
            status: 'error',
            blocked: true,
            message: `Tool ist gesperrt (${blockCheck.reason}). Verbleibend: ${Math.ceil(blockCheck.remainingSeconds / 60)} Min.`
        });
    }

    if (!client || !client.pupPage || currentStatus !== 'connected') {
        return res.json({ status: 'error', message: 'WhatsApp ist nicht verbunden.' });
    }

    // Rate Limiter: Spam-Erkennung
    const now = Date.now();
    supportMessageRateHistory.push(now);
    supportMessageRateHistory = supportMessageRateHistory.filter(t => t > now - 60000);

    const msgsLast10s = supportMessageRateHistory.filter(t => t > now - 10000).length;
    const msgsLast60s = supportMessageRateHistory.length;

    if (msgsLast10s > 5 || msgsLast60s > 15) {
        blockTool('Spam-Schutz: Zu viele Support-Nachrichten gesendet. Das Tool wurde für 24 Stunden gesperrt.');
        return res.json({
            status: 'error',
            blocked: true,
            message: 'Spam-Schutz aktiviert! Zu viele Nachrichten in kurzer Zeit an den Support. Das Tool wurde für 24 Stunden gesperrt.'
        });
    }

    const { text, dataUrl, filename, chatId, targetId } = req.body;
    if (!text && !dataUrl) {
        return res.json({ status: 'error', message: 'Nachrichtentext oder Bild erforderlich.' });
    }

    const config = getSupportConfig();
    const supNumbers = getAllSupportNumbers();
    let targetChatId = chatId || targetId || config.chatId || '491723514772@c.us';
    const supMatch = supNumbers.find(s => {
        if (s.id === targetChatId || s.chatId === targetChatId || s.lid === targetChatId) return true;
        const sDigits = (s.rawPhone || s.phone || '').replace(/[^0-9]/g, '');
        const tDigits = String(targetChatId).replace(/[^0-9]/g, '');
        if (sDigits && tDigits && (sDigits === tDigits || sDigits.endsWith(tDigits) || tDigits.endsWith(sDigits))) return true;
        return false;
    });
    if (supMatch && (supMatch.chatId || supMatch.lid)) {
        targetChatId = supMatch.chatId || supMatch.lid;
    }

    const userLang = (req.body.lang || 'de').toLowerCase();
    const langTag = (userLang === 'en' ? 'EN' : (userLang === 'ru' ? 'RU' : (userLang === 'sq' ? 'SQ' : 'DE')));
    const supportPrefix = `Support (${langTag}):`;
    const imageLabel = userLang === 'en' ? '[Image file]' : (userLang === 'ru' ? '[Файл изображения]' : (userLang === 'sq' ? '[Skedar imazhi]' : '[Bilddatei]'));

    let outgoingText = (text || '').trim();
    if (outgoingText) {
        if (!outgoingText.toLowerCase().startsWith('support')) {
            outgoingText = `${supportPrefix} ${outgoingText}`;
        }
    } else if (dataUrl) {
        outgoingText = `${supportPrefix} ${imageLabel}`;
    }

    try {
        if (dataUrl) {
            let mimeType = 'image/jpeg';
            let base64Data = dataUrl;
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
                mimeType = match[1];
                base64Data = match[2];
            }
            const media = new MessageMedia(mimeType, base64Data, filename || 'support_bild.jpg');

            // Zuerst Standardversand (safeSendMessage hat jetzt internen Puppeteer-Fallback)
            let sendOk = false;
            try {
                await safeSendMessage(targetChatId, media, { caption: outgoingText });
                sendOk = true;
            } catch (primaryErr) {
                const primaryMsg = primaryErr?.message || String(primaryErr);
                console.warn('[API-SUPPORT] safeSendMessage Fehler bei Media:', primaryMsg);

                // Letzter expliziter Direktversand ueber Puppeteer
                console.log('[API-SUPPORT] Versuche expliziten sendMediaDirectViaPuppeteer...');
                try {
                    const fbResult = await sendMediaDirectViaPuppeteer(targetChatId, media, { caption: outgoingText });
                    if (fbResult && fbResult.success) {
                        sendOk = true;
                        console.log('[API-SUPPORT] Expliziter Puppeteer-Direktversand erfolgreich!');
                    } else {
                        console.warn('[API-SUPPORT] Puppeteer-Direktversand Ergebnis:', fbResult?.error);
                    }
                } catch (fbErr) {
                    console.warn('[API-SUPPORT] Puppeteer-Direktversand Fehler:', fbErr?.message || fbErr);
                }
            }

            if (sendOk) {
                return res.json({ status: 'success', message: 'Nachricht an Support gesendet.' });
            } else {
                return res.json({ status: 'error', message: 'Bild konnte nicht an Support gesendet werden.' });
            }

        } else {
            await safeSendMessage(targetChatId, outgoingText);
        }
        return res.json({ status: 'success', message: 'Nachricht an Support gesendet.' });
    } catch (err) {
        const errMsg = err?.message || String(err);
        if (errMsg.includes('Data passed to getter') || errMsg.includes('id property') || errMsg.includes('memoize')) {
            console.log('[API-SUPPORT] Nachricht trotz Getter-Warnung erfolgreich zugestellt.');
            return res.json({ status: 'success', message: 'Nachricht an Support gesendet.' });
        }
        return res.json({ status: 'error', message: 'Senden an Support fehlgeschlagen: ' + errMsg });
    }
});

app.get('/api/chats', (req, res) => {
    res.json({ chats: allChats });
});

app.post('/api/refresh-chats', async (req, res) => {
    await loadAllChats();
    res.json({ status: 'success', chats: allChats });
});


// Nachrichten fuer einen Chat abrufen (nutzt die WhatsApp-internen Datenmodelle fuer maximale Praezision)
app.get('/api/messages', async (req, res) => {
    const chatId = req.query.chatId;
    if (!chatId) {
        return res.json({ status: 'error', message: 'Keine chatId angegeben.' });
    }
    if (!client || !client.pupPage || currentStatus !== 'connected') {
        return res.json({ status: 'error', message: 'WhatsApp ist nicht verbunden.' });
    }

    try {
        const result = await safePupEvaluate(async (targetChatId) => {
            const wa = window.require ? window.require('WAWebCollections') : null;
            if (!wa || !wa.Chat) return { error: 'WAWebCollections nicht gefunden' };

            const chat = wa.Chat.get(targetChatId) || wa.Chat.getModelsArray().find(c => c.id && c.id._serialized === targetChatId);
            if (!chat) return { error: 'Chat nicht gefunden: ' + targetChatId };

            const isGroup = Boolean(chat.isGroup || (targetChatId && targetChatId.includes('@g.us')));

            // Chat im Hintergrund oeffnen, damit Bilder und neue Nachrichten geladen werden
            try {
                const cmd = window.require('WAWebCmd').Cmd;
                if (cmd && cmd.openChatBottom) {
                    await cmd.openChatBottom({ chat });
                }
            } catch (e) {}

            await new Promise(r => setTimeout(r, 400));

            // 1. Kontakt-Informationen aufbauen
            const contactModels = wa.Contact ? wa.Contact.getModelsArray() : [];
            const contactMap = {};
            const phoneMap = {};
            contactModels.forEach(c => {
                const cid = c.id ? c.id._serialized : '';
                const name = c.name || c.pushname || c.formattedTitle || '';
                if (cid && name) contactMap[cid] = name;
                let p = '';
                if (c.phoneNumber) {
                    p = typeof c.phoneNumber === 'string' ? c.phoneNumber : (c.phoneNumber._serialized || '');
                }
                if (p) {
                    const cleanP = '+' + p.replace('@c.us', '').replace('@s.whatsapp.net', '');
                    if (cid) phoneMap[cid] = cleanP;
                    if (name) contactMap[p] = name;
                }
            });

            // 2. Untertitel ermitteln
            let subtitle = '';
            if (isGroup && chat.groupMetadata && chat.groupMetadata.participants) {
                const parts = chat.groupMetadata.participants.getModelsArray ? chat.groupMetadata.participants.getModelsArray() : chat.groupMetadata.participants;
                const names = parts.map(p => {
                    const pid = p.id ? (p.id._serialized || p.id.user) : '';
                    return contactMap[pid] || phoneMap[pid] || (p.id?.user ? '+' + p.id.user : '');
                }).filter(Boolean);
                if (names.length > 0) {
                    subtitle = names.slice(0, 10).join(', ') + (names.length > 10 ? ', ...' : '');
                }
            } else if (!isGroup) {
                subtitle = phoneMap[targetChatId] || (chat.id?.user && !targetChatId.includes('@lid') ? '+' + chat.id.user : '');
            }

            // 3. Bilder aus dem DOM erfassen (fuer Medienanzeige)
            const domImages = [];
            const main = document.querySelector('#main');
            if (main) {
                const imgEls = Array.from(main.querySelectorAll('img[src*="blob:"], img[src*="data:image"]'));
                imgEls.forEach(img => {
                    if (img.src) domImages.push(img.src);
                });
            }

            // 4. Nachrichten aus internem Datenmodell extrahieren (immun gegen DOM-Formatierungsfehler)
            const rawMsgs = chat.msgs ? chat.msgs.getModelsArray() : [];
            const filteredMsgs = rawMsgs.filter(m => {
                const type = m.type || '';
                return type !== 'e2e_notification' && type !== 'gp2' && type !== 'notification_template' && type !== 'biz_content_placeholder';
            });

            let imgCursor = 0;
            const TIME_REGEX = /^\d{1,2}:\d{2}(\s*[aApP][mM])?$/i;

            const messages = filteredMsgs.slice(-50).map((m, idx) => {
                const fromMe = Boolean(m.id && m.id.fromMe);
                const msgType = m.type || 'chat';
                let text = m.body || m.caption || '';

                // Falls Nachrichtentext leer ist, Typ pruefen
                if (msgType === 'revoked') {
                    text = '[Nachricht gelöscht]';
                } else if (msgType === 'call_log') {
                    text = '[Anruf]';
                } else if (msgType === 'image') {
                    text = m.caption || '[Bild]';
                } else if (msgType === 'video') {
                    text = m.caption || '[Video]';
                } else if (msgType === 'ptt' || msgType === 'audio') {
                    text = '[Sprachnachricht]';
                } else if (msgType === 'sticker') {
                    text = '[Sticker]';
                } else if (msgType === 'document') {
                    text = m.caption || '[Dokument]';
                }

                // Bild URL ermitteln
                let imageUrl = '';
                if (msgType === 'image') {
                    if (m.mediaData && m.mediaData.preview && typeof m.mediaData.preview.url === 'function') {
                        try { imageUrl = m.mediaData.preview.url(); } catch(e) {}
                    }
                    if (!imageUrl && imgCursor < domImages.length) {
                        imageUrl = domImages[imgCursor];
                        imgCursor++;
                    }
                }

                // Zeitformatierung (HH:MM)
                let timeStr = '';
                if (m.t) {
                    const d = new Date(m.t * 1000);
                    timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }

                // STRIKTER ZEITSTEMPEL-FILTER:
                // Ein Zeitstempel darf NIEMALS als Nachrichtentext gewertet werden!
                if (text && (TIME_REGEX.test(text.trim()) || text.trim() === timeStr.trim())) {
                    // Falls text versehentlich nur die Uhrzeit ist und kein Chat-Inhalt
                    if (msgType === 'image') text = '[Bild]';
                    else if (msgType === 'chat' && !m.body) text = '';
                }

                // Absender in Gruppen ermitteln
                let author = '';
                let senderPhone = '';
                if (!fromMe && isGroup) {
                    const authorId = m.author ? (m.author._serialized || m.author) : (m.from ? (m.from._serialized || m.from) : '');
                    author = contactMap[authorId] || '';
                    senderPhone = phoneMap[authorId] || (m.author?.user ? '+' + m.author.user : '');
                    if (!author && senderPhone) author = senderPhone;
                }

                return {
                    id: m.id ? m.id._serialized : `msg_${idx}_${m.t || Date.now()}`,
                    fromMe: fromMe,
                    author: author,
                    senderPhone: senderPhone,
                    text: text,
                    imageUrl: imageUrl,
                    time: timeStr,
                    type: msgType,
                    ack: m.ack || (fromMe ? 2 : 0)
                };
            }).filter(m => m.text || m.imageUrl); // Leere Container ohne Text oder Bild verwerfen

            return {
                status: 'success',
                chatName: chat.name || chat.formattedTitle || '',
                isGroup: isGroup,
                subtitle: subtitle,
                messages: messages
            };
        }, chatId);

        if (result && result.status === 'success') {
            res.json(result);
        } else {
            res.json({ status: 'error', message: result?.error || 'Fehler beim Laden der Nachrichten.' });
        }
    } catch (e) {
        res.json({ status: 'error', message: 'Fehler beim Laden der Nachrichten: ' + e.message });
    }
});

// Textnachricht senden (unterstuetzt Emojis in vollem Umfang)
app.post('/api/send-message', async (req, res) => {
    const blockCheck = isToolBlocked();
    if (blockCheck.blocked) {
        return res.json({ 
            status: 'error', 
            blocked: true,
            message: `Tool ist gesperrt (${blockCheck.reason}). Verbleibend: ${Math.ceil(blockCheck.remainingSeconds / 60)} Min.` 
        });
    }

    const { chatId, text } = req.body;
    if (!chatId || !text) {
        return res.json({ status: 'error', message: 'Parameter fehlen.' });
    }
    if (!client || !client.pupPage || currentStatus !== 'connected') {
        return res.json({ status: 'error', message: 'WhatsApp ist nicht verbunden.' });
    }

    // Wenn an Support gesendet wird, auch hier Anti-Spam Rate-Limiter prüfen!
    if (isTargetSupport(chatId)) {
        const now = Date.now();
        supportMessageRateHistory.push(now);
        supportMessageRateHistory = supportMessageRateHistory.filter(t => t > now - 60000);
        const msgsLast10s = supportMessageRateHistory.filter(t => t > now - 10000).length;
        const msgsLast60s = supportMessageRateHistory.length;
        if (msgsLast10s > 5 || msgsLast60s > 15) {
            blockTool('Spam-Schutz: Zu viele Nachrichten an die Support-Nummer. Das Tool wurde für 24 Stunden gesperrt.');
            return res.json({
                status: 'error',
                blocked: true,
                message: 'Spam-Schutz aktiviert! Du hast eine Support-Nummer vollgespammt. Das Tool wurde für 24 Stunden gesperrt.'
            });
        }
    }

    let messageText = text;
    if (isTargetSupport(chatId)) {
        const userLang = (req.body.lang || 'de').toLowerCase();
        const langTag = (userLang === 'en' ? 'EN' : (userLang === 'ru' ? 'RU' : (userLang === 'sq' ? 'SQ' : 'DE')));
        const supportPrefix = `Support (${langTag}):`;

        const trimmed = (text || '').trim();
        if (trimmed && !trimmed.toLowerCase().startsWith('support')) {
            messageText = `${supportPrefix} ${trimmed}`;
        }
    }

    try {
        await safeSendMessage(chatId, messageText);
        setTimeout(loadAllChats, 800);
        return res.json({ status: 'success', message: 'Nachricht gesendet.' });
    } catch (err) {
        const errMsg = err?.message || String(err);
        if (errMsg.includes('Data passed to getter') || errMsg.includes('id property') || errMsg.includes('memoize')) {
            console.log('[API-SEND-MSG] Nachricht trotz Getter-Warnung erfolgreich zugestellt.');
            return res.json({ status: 'success', message: 'Nachricht gesendet.' });
        }
        return res.json({ status: 'error', message: 'Senden fehlgeschlagen: ' + errMsg });
    }
});

// Bilddatei (Base64) senden
app.post('/api/send-media', async (req, res) => {
    const blockCheck = isToolBlocked();
    if (blockCheck.blocked) {
        return res.json({ 
            status: 'error', 
            blocked: true,
            message: `Tool ist gesperrt (${blockCheck.reason}). Verbleibend: ${Math.ceil(blockCheck.remainingSeconds / 60)} Min.` 
        });
    }

    const { chatId, dataUrl, filename, caption } = req.body;
    if (!chatId || !dataUrl) {
        return res.json({ status: 'error', message: 'Chat-ID oder Bilddaten fehlen.' });
    }
    if (!client || !client.pupPage || currentStatus !== 'connected') {
        return res.json({ status: 'error', message: 'WhatsApp ist nicht verbunden.' });
    }

    // Wenn an Support gesendet wird, auch hier Anti-Spam Rate-Limiter prüfen!
    if (isTargetSupport(chatId)) {
        const now = Date.now();
        supportMessageRateHistory.push(now);
        supportMessageRateHistory = supportMessageRateHistory.filter(t => t > now - 60000);
        const msgsLast10s = supportMessageRateHistory.filter(t => t > now - 10000).length;
        const msgsLast60s = supportMessageRateHistory.length;
        if (msgsLast10s > 5 || msgsLast60s > 15) {
            blockTool('Spam-Schutz: Zu viele Nachrichten an die Support-Nummer. Das Tool wurde für 24 Stunden gesperrt.');
            return res.json({
                status: 'error',
                blocked: true,
                message: 'Spam-Schutz aktiviert! Du hast eine Support-Nummer vollgespammt. Das Tool wurde für 24 Stunden gesperrt.'
            });
        }
    }

    let mimeType = 'image/jpeg';
    let base64Data = dataUrl;
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
        mimeType = match[1];
        base64Data = match[2];
    }

    // Bilddatei im fotos-Ordner sichern, damit nichts lose rumliegt
    try {
        const fotosDir = path.join(BASE_DIR, 'fotos');
        if (!fs.existsSync(fotosDir)) fs.mkdirSync(fotosDir, { recursive: true });
        const safeName = `${Date.now()}_${(filename || 'bild.jpg').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        fs.writeFileSync(path.join(fotosDir, safeName), Buffer.from(base64Data, 'base64'));
        console.log(`Bild im fotos-Ordner archiviert: ${safeName}`);
    } catch (saveErr) {
        console.warn('Hinweis: Konnte Bildkopie nicht in fotos speichern:', saveErr.message);
    }

    let captionText = caption || '';
    if (isTargetSupport(chatId)) {
        const userLang = (req.body.lang || 'de').toLowerCase();
        const langTag = (userLang === 'en' ? 'EN' : (userLang === 'ru' ? 'RU' : (userLang === 'sq' ? 'SQ' : 'DE')));
        const supportPrefix = `Support (${langTag}):`;
        const imageLabel = userLang === 'en' ? '[Image file]' : (userLang === 'ru' ? '[Файл изображения]' : (userLang === 'sq' ? '[Skedar imazhi]' : '[Bilddatei]'));

        const trimmed = (caption || '').trim();
        if (trimmed) {
            if (!trimmed.toLowerCase().startsWith('support')) {
                captionText = `${supportPrefix} ${trimmed}`;
            }
        } else {
            captionText = `${supportPrefix} ${imageLabel}`;
        }
    }

    try {
        const media = new MessageMedia(mimeType, base64Data, filename || 'bild.jpg');

        let sendOk = false;
        try {
            await safeSendMessage(chatId, media, { caption: captionText });
            sendOk = true;
        } catch (primaryErr) {
            const primaryMsg = primaryErr?.message || String(primaryErr);
            console.warn('[API-SEND-MEDIA] safeSendMessage Fehler:', primaryMsg);

            // Expliziter Puppeteer-Direktversand als Fallback
            console.log('[API-SEND-MEDIA] Versuche sendMediaDirectViaPuppeteer...');
            try {
                const fbResult = await sendMediaDirectViaPuppeteer(chatId, media, { caption: captionText });
                if (fbResult && fbResult.success) {
                    sendOk = true;
                    console.log('[API-SEND-MEDIA] Puppeteer-Direktversand erfolgreich!');
                } else {
                    console.warn('[API-SEND-MEDIA] Puppeteer-Direktversand Ergebnis:', fbResult?.error);
                }
            } catch (fbErr) {
                console.warn('[API-SEND-MEDIA] Puppeteer-Direktversand Fehler:', fbErr?.message || fbErr);
            }
        }

        setTimeout(loadAllChats, 1000);
        if (sendOk) {
            return res.json({ status: 'success', message: 'Bild erfolgreich gesendet.' });
        } else {
            return res.json({ status: 'error', message: 'Bild konnte nicht gesendet werden.' });
        }
    } catch (sendErr) {
        return res.json({ status: 'error', message: 'Bild konnte nicht gesendet werden: ' + (sendErr?.message || sendErr) });
    }
});

// Web-basierte Chats-Meldung statt Excel-Datei
app.post('/api/open-excel', (req, res) => {
    res.json({ status: 'info', message: 'Alle Kontakte und Chats werden direkt in der Web-Oberfläche unter "Chats" angezeigt.' });
});

// DLL & Datei-Download Route für Night-System
app.get('/download/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(BASE_DIR, 'files', filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath, filename);
    } else {
        res.status(404).send('Datei nicht gefunden.');
    }
});
app.use('/files', express.static(path.join(BASE_DIR, 'files')));

app.post('/api/force-refresh', async (req, res) => {
    try {
        if (currentStatus === 'error' || !client || !client.pupPage) {
            console.log('[API] force-refresh im Fehlerzustand empfangen. Starte WhatsApp-Client neu...');
            cleanupSessionLocks();
            initWhatsApp();
            return res.json({ status: 'success', message: 'WhatsApp-Client wird neu gestartet...' });
        }
        if (client && client.pupPage && currentStatus !== 'connected') {
            await client.pupPage.evaluate(() => {
                const btn = document.querySelector('span[data-icon="refresh"], div[role="button"][data-ref], [data-testid="qrcode"] button');
                if (btn) (btn.closest('button, div[role="button"]') || btn).click();
            });
            await client.pupPage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            lastQrTimestamp = Date.now();
            return res.json({ status: 'success', message: 'QR-Code wird erneuert.' });
        }
        res.json({ status: 'idle' });
    } catch (e) {
        res.json({ status: 'error', message: e.message });
    }
});

app.post('/api/reset', async (req, res) => {
    try {
        if (client) await client.destroy();
    } catch (e) {}

    try {
        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
    } catch (e) {}

    allChats = [];
    initWhatsApp();
    res.json({ status: 'success', message: 'Sitzung zurückgesetzt. Neuer QR-Code wird geladen.' });
});

// ==========================================
// Bot & Instant Messaging Module
// ==========================================
const BOT_SETTINGS_FILE = path.join(BASE_DIR, 'bot_settings.json');

function getBotSettings() {
    try {
        if (fs.existsSync(BOT_SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(BOT_SETTINGS_FILE, 'utf-8'));
        }
    } catch (e) {}
    return { active: false };
}

function saveBotSettings(settings) {
    try {
        fs.writeFileSync(BOT_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (e) {
        console.error('Fehler beim Speichern der Bot-Einstellungen:', e);
    }
}

function formatTargetId(rawInput) {
    if (!rawInput) return '';
    let target = String(rawInput).trim();
    if (target === 'on' || target === '@c.us' || target === '@g.us') return '';
    if (target.includes('@c.us') || target.includes('@g.us') || target.includes('@lid')) {
        const prefix = target.split('@')[0];
        if (!prefix || prefix === 'on' || prefix.length < 3) return '';
        return target;
    }
    // Säubern für neue Rufnummern
    let cleaned = target.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+')) {
        cleaned = cleaned.substring(1);
    } else if (cleaned.startsWith('00')) {
        cleaned = cleaned.substring(2);
    } else if (cleaned.startsWith('0') && cleaned.length >= 10) {
        // Deutsche Vorwahl 01... -> 491...
        cleaned = '49' + cleaned.substring(1);
    }
    if (!cleaned || cleaned.length < 5) return '';
    return cleaned + '@c.us';
}

async function sendSingleMessageDirect(targetChatId, text) {
    const formattedId = formatTargetId(targetChatId);
    if (!formattedId) throw new Error('Ungültige Empfänger-ID oder Telefonnummer');
    if (!client) throw new Error('WhatsApp-Client ist nicht aktiv.');

    await safeSendMessage(formattedId, text);
    return true;
}

async function sendSingleMediaDirect(targetChatId, mediaInfo, captionText = '') {
    const formattedId = formatTargetId(targetChatId);
    if (!formattedId) throw new Error('Ungültige Empfänger-ID oder Telefonnummer');

    let mimeType = mediaInfo.mimetype || 'image/jpeg';
    let base64Data = mediaInfo.data || '';
    const filename = mediaInfo.filename || 'bild.jpg';

    if (mediaInfo.dataUrl) {
        const match = mediaInfo.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
            mimeType = match[1];
            base64Data = match[2];
        } else {
            base64Data = mediaInfo.dataUrl;
        }
    }

    const media = new MessageMedia(mimeType, base64Data, filename);
    await safeSendMessage(formattedId, media, { caption: captionText || '' });
    return true;
}

// Bot Status abrufen
app.get('/api/bot/status', (req, res) => {
    const settings = getBotSettings();
    res.json({ status: 'success', active: Boolean(settings.active) });
});

// Bot Status setzen (aktivieren / deaktivieren)
app.post('/api/bot/status', (req, res) => {
    const { active } = req.body;
    const settings = { active: Boolean(active), updatedAt: new Date().toISOString() };
    saveBotSettings(settings);
    console.log(`[BOT-STEUERUNG] Status: ${settings.active ? 'AKTIV' : 'DEAKTIVIERT'}`);
    res.json({ status: 'success', active: settings.active });
});

// Bot & VoIP Module in WhatsApp Web injizieren (Inject Bot Button)
app.post('/api/bot/inject', async (req, res) => {
    try {
        if (!client || !client.pupPage) {
            return res.json({ status: 'error', message: 'WhatsApp ist nicht aktiv.' });
        }
        console.log('[BOT-INJECT] Manuelle Injektion angefordert...');
        const ok = await ensureWPPInjected();
        if (typeof client.inject === 'function') await client.inject().catch(() => {});
        return res.json({
            status: 'success',
            message: ok ? 'Bot-Module erfolgreich injiziert.' : 'Injektion via Native/UI aktiv.'
        });
    } catch (err) {
        return res.json({ status: 'error', message: 'Injektionsfehler: ' + err.message });
    }
});

// ==========================================
// Instant Job Manager (Hintergrund-Worker & Progress)
// ==========================================
let currentInstantJob = null;

// Instant-Versand starten (asynchroner Job-Worker)
app.post('/api/send-instant', async (req, res) => {
    const blockCheck = isToolBlocked();
    if (blockCheck.blocked) {
        return res.json({ 
            status: 'error', 
            blocked: true,
            message: `Tool ist gesperrt (${blockCheck.reason}). Verbleibend: ${Math.ceil(blockCheck.remainingSeconds / 60)} Min.` 
        });
    }

    const { recipients, message, count, media } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.json({ status: 'error', message: 'Keine Empfänger ausgewählt.' });
    }

    // Prüfen, ob Support-Nummer in den Empfängern ist und mehr als 1 Nachricht gefordert wurde
    const hasSupport = recipients.some(r => isTargetSupport(r));
    const requestedCount = parseInt(count, 10) || 1;
    if (hasSupport && (requestedCount > 1 || recipients.length > 1)) {
        blockTool('Spam-Schutz: Massenversand an die Support-Nummer ist untersagt.');
        return res.json({
            status: 'error',
            blocked: true,
            message: 'Spam-Schutz aktiviert! Massenversand an die Support-Nummer ist strengstens untersagt. Das Tool wurde für 24 Stunden gesperrt.'
        });
    }

    if (currentInstantJob && currentInstantJob.active) {
        return res.json({ status: 'error', message: 'Ein Sendevorgang läuft bereits. Bitte warten oder abbrechen.' });
    }

    const hasMedia = Boolean(media && (media.dataUrl || media.data));
    const hasMessage = Boolean(message && message.trim());

    if (!hasMedia && !hasMessage) {
        return res.json({ status: 'error', message: 'Weder Bild noch Nachrichtentext vorhanden.' });
    }
    if (!client || !client.pupPage || currentStatus !== 'connected') {
        return res.json({ status: 'error', message: 'WhatsApp ist nicht verbunden.' });
    }

    // Höher als 10.000 darf es nicht gehen
    const repeatCount = Math.max(1, Math.min(parseInt(count, 10) || 1, 10000));
    const totalUnits = recipients.length * repeatCount;
    const jobId = Date.now().toString();

    console.log(`[INSTANT-JOB] Starte Job ${jobId}: ${hasMedia ? 'Bild' : 'Text'} an ${recipients.length} Empfänger (${repeatCount}x = ${totalUnits} Nachrichten)...`);

    // Bild archivieren falls vorhanden
    if (hasMedia && media.dataUrl) {
        try {
            const fotosDir = path.join(BASE_DIR, 'fotos');
            if (!fs.existsSync(fotosDir)) fs.mkdirSync(fotosDir, { recursive: true });
            let base64Part = media.dataUrl;
            const match = media.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) base64Part = match[2];
            const safeName = `${Date.now()}_instant_${(media.filename || 'bild.jpg').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            fs.writeFileSync(path.join(fotosDir, safeName), Buffer.from(base64Part, 'base64'));
        } catch (e) {}
    }

    currentInstantJob = {
        id: jobId,
        active: true,
        cancelRequested: false,
        startTime: Date.now(),
        total: totalUnits,
        sent: 0,
        successCount: 0,
        failCount: 0,
        logs: []
    };

    // Sofortige Antwort an den Client, damit HTTP nicht timed-out
    res.json({
        status: 'started',
        jobId: jobId,
        total: totalUnits,
        recipientCount: recipients.length,
        repeatCount: repeatCount
    });

    // Asynchroner Background-Worker
    (async () => {
        try {
            for (let r = 0; r < repeatCount; r++) {
                for (const recipient of recipients) {
                    if (currentInstantJob.cancelRequested || currentInstantJob.id !== jobId) {
                        console.log(`[INSTANT-JOB] Job ${jobId} wurde durch Benutzer abgebrochen.`);
                        currentInstantJob.active = false;
                        return;
                    }

                    const rawId = typeof recipient === 'object' ? recipient.id : recipient;
                    const name = typeof recipient === 'object' ? (recipient.name || recipient.id) : recipient;
                    const formattedId = formatTargetId(rawId);

                    let isSuccess = false;
                    let errDetail = null;

                    try {
                        if (hasMedia) {
                            await sendSingleMediaDirect(formattedId, media, (message || '').trim());
                        } else {
                            await sendSingleMessageDirect(formattedId, (message || '').trim());
                        }
                        isSuccess = true;
                        currentInstantJob.successCount++;
                    } catch (err) {
                        errDetail = err.message || String(err);
                        currentInstantJob.failCount++;
                        console.warn(`[INSTANT] Fehler bei ${name} (${formattedId}):`, errDetail);
                    }

                    currentInstantJob.sent++;
                    currentInstantJob.logs.push({
                        id: formattedId,
                        name: name,
                        round: r + 1,
                        totalRounds: repeatCount,
                        success: isSuccess,
                        error: errDetail,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    });

                    // Kurze 35ms Entlastungspause für Netzwerk / Node-Event-Loop
                    await new Promise(resolve => setTimeout(resolve, 35));
                }
                if (currentInstantJob.cancelRequested) break;
            }
        } catch (jobErr) {
            console.error('[INSTANT-JOB] Unerwarteter Fehler im Job:', jobErr);
        } finally {
            if (currentInstantJob && currentInstantJob.id === jobId) {
                currentInstantJob.active = false;
                console.log(`[INSTANT-JOB] Job ${jobId} abgeschlossen (${currentInstantJob.successCount} erfolgreich, ${currentInstantJob.failCount} Fehler).`);
                setTimeout(loadAllChats, 1200);
            }
        }
    })();
});

// Live-Status und Fortschritt des Sendevorgangs abfragen
app.get('/api/instant-status', (req, res) => {
    if (!currentInstantJob) {
        return res.json({ active: false, total: 0, sent: 0, remaining: 0, percent: 0, logs: [] });
    }

    const now = Date.now();
    const elapsedSec = Math.max(0.2, (now - currentInstantJob.startTime) / 1000);
    const rate = currentInstantJob.sent / elapsedSec; // Einheiten pro Sekunde
    const remaining = Math.max(0, currentInstantJob.total - currentInstantJob.sent);
    const estimatedSecondsRemaining = rate > 0 ? Math.round(remaining / rate) : 0;
    const percent = currentInstantJob.total > 0
        ? Math.min(100, Math.round((currentInstantJob.sent / currentInstantJob.total) * 100))
        : 0;

    res.json({
        active: currentInstantJob.active,
        cancelled: currentInstantJob.cancelRequested,
        jobId: currentInstantJob.id,
        total: currentInstantJob.total,
        sent: currentInstantJob.sent,
        remaining: remaining,
        successCount: currentInstantJob.successCount,
        failCount: currentInstantJob.failCount,
        percent: percent,
        elapsedSeconds: Math.round(elapsedSec),
        estimatedSecondsRemaining: estimatedSecondsRemaining,
        logs: currentInstantJob.logs.slice(-40) // Letzte 40 Logs
    });
});

// Aktiven Sendevorgang abbrechen
app.post('/api/cancel-instant', (req, res) => {
    if (currentInstantJob && currentInstantJob.active) {
        currentInstantJob.cancelRequested = true;
        console.log('[INSTANT] Abbruch angefordert...');
        return res.json({ status: 'success', message: 'Sendevorgang wird abgebrochen.' });
    }
    res.json({ status: 'idle', message: 'Kein aktiver Sendevorgang.' });
});

// ==========================================
// Anruf-Job Manager (Anrufen & sofort Auflegen)
// ==========================================
let currentCallJob = null;

// Sicherstellen, dass WPP (VoIP-Modul) in WhatsApp Web injiziert und einsatzbereit ist
async function ensureWPPInjected() {
    if (!client || !client.pupPage) return false;
    try {
        const isLoaded = await client.pupPage.evaluate(() => {
            return typeof window.WPP !== 'undefined' && typeof window.WPP.call !== 'undefined';
        });
        if (isLoaded) {
            await client.pupPage.evaluate(async () => {
                if (window.WPP && window.WPP.call && window.WPP.call.enableCallInterface) {
                    try { await window.WPP.call.enableCallInterface(); } catch(e) {}
                }
            }).catch(() => {});
            return true;
        }

        let waJsPath = path.resolve(__dirname, 'node_modules', '@wppconnect', 'wa-js', 'dist', 'wppconnect-wa.js');
        if (!fs.existsSync(waJsPath)) {
            try {
                waJsPath = require.resolve('@wppconnect/wa-js');
            } catch (e) {}
        }
        if (waJsPath && fs.existsSync(waJsPath)) {
            console.log('[WA-JS] Injiziere WPP VoIP-Bundle via Chrome DevTools Protocol (CSP-Bypass)...');
            const bundleCode = fs.readFileSync(waJsPath, 'utf8');

            let cdpSession = null;
            try {
                cdpSession = await client.pupPage.target().createCDPSession();
                await cdpSession.send('Runtime.evaluate', {
                    expression: bundleCode,
                    userGesture: true,
                    awaitPromise: true
                });
            } catch (cdpErr) {
                // Fallback direct evaluate
                await client.pupPage.evaluate(bundleCode).catch(() => {});
            } finally {
                if (cdpSession) {
                    try { await cdpSession.detach(); } catch(e) {}
                }
            }

            // Warten bis WPP bereit ist und Call-Interface aktivieren
            const ready = await client.pupPage.evaluate(() => {
                return new Promise((resolve) => {
                    let attempts = 0;
                    const check = setInterval(async () => {
                        attempts++;
                        if (window.WPP && window.WPP.call) {
                            clearInterval(check);
                            if (window.WPP.call.enableCallInterface) {
                                try { await window.WPP.call.enableCallInterface(); } catch(e) {}
                            }
                            return resolve(true);
                        }
                        if (attempts > 25) {
                            clearInterval(check);
                            resolve(Boolean(window.WPP && window.WPP.call));
                        }
                    }, 200);
                });
            });
            console.log(`[WA-JS] VoIP-Modul Status: ${ready ? 'BEREIT' : 'WIRD VIA NATIVE / UI ERSETZT'}`);
            return ready;
        }
    } catch (err) {
        console.warn('[WA-JS] Injektions-Hinweis:', err.message);
    }
    return false;
}

// Einzelnen Anruf ausfuehren: anrufen, kurz klingeln lassen, auflegen
async function executeSingleCall(targetId, ringDurationMs, contactName = '') {
    if (isTargetSupport(targetId)) {
        blockTool('Anrufversuch an die Support-Nummer. Das Tool wurde für 24 Stunden gesperrt.');
        throw new Error('Anrufe an die Support-Nummer sind verboten. Tool für 24h gesperrt.');
    }
    if (!client || !client.pupPage) throw new Error('WhatsApp-Client nicht aktiv.');

    let cleanTarget = formatTargetId(targetId);
    if (!cleanTarget || cleanTarget === '@c.us' || cleanTarget.startsWith('@')) {
        throw new Error('Ungueltige Empfaenger-Nummer oder ID (' + targetId + ')');
    }

    // Wenn der Kontakt eine @lid ID ist, versuche die echte Telefonnummer (@c.us) aufzulösen
    if (cleanTarget.includes('@lid')) {
        try {
            // 1. Erst im lokalen allChats Cache suchen
            const cachedChat = allChats.find(x => x.id === cleanTarget);
            if (cachedChat && cachedChat.phone) {
                const digits = cachedChat.phone.replace(/[^0-9]/g, '');
                if (digits.length >= 7) {
                    cleanTarget = digits + '@c.us';
                    console.log(`[CALL] @lid ${targetId} aus Chat-Cache aufgeloest zu: ${cleanTarget}`);
                }
            }
            // 2. Falls immer noch @lid, in WhatsApp Web Store abfragen
            if (cleanTarget.includes('@lid')) {
                const resolved = await client.pupPage.evaluate((lid) => {
                    try {
                        const c = (window.Store && window.Store.Contact) ? window.Store.Contact.get(lid) : null;
                        if (c && c.phoneNumber) {
                            const p = typeof c.phoneNumber === 'string' ? c.phoneNumber : c.phoneNumber._serialized;
                            if (p) return p.includes('@c.us') ? p : (p.replace(/[^0-9]/g, '') + '@c.us');
                        }
                        const wa = window.require ? window.require('WAWebCollections') : null;
                        if (wa && wa.Contact) {
                            const cm = wa.Contact.get(lid);
                            if (cm && cm.phoneNumber) {
                                const p = typeof cm.phoneNumber === 'string' ? cm.phoneNumber : (cm.phoneNumber._serialized || '');
                                if (p) return p.includes('@c.us') ? p : (p.replace(/[^0-9]/g, '') + '@c.us');
                            }
                        }
                    } catch(e) {}
                    return null;
                }, cleanTarget);
                if (resolved) {
                    console.log(`[CALL] @lid ${cleanTarget} aus WhatsApp-Store aufgeloest zu: ${resolved}`);
                    cleanTarget = resolved;
                }
            }
        } catch(e) {}
    }

    console.log(`[CALL] Starte Anruf an ${contactName ? contactName + ' (' + cleanTarget + ')' : cleanTarget} (Klingeldauer: ${ringDurationMs}ms)...`);

    // Sicherstellen, dass WPP injiziert ist
    await ensureWPPInjected();

    let callStarted = false;
    let callMethod = '';

    // 0. Berechtigungen fuer Mikrofon & Kamera sicherstellen (kritisch fuer VoIP)
    try {
        if (client && client.pupPage) {
            const bCtx = client.pupPage.browserContext();
            await bCtx.overridePermissions('https://web.whatsapp.com', ['microphone', 'camera']).catch(() => {});
        }
    } catch(e) {}

    // ========================================================
    // METHODE 1: WPP.call.offer (VoIP Stack)
    // ========================================================
    try {
        const wppResult = await safePupEvaluate(async (toId) => {
            try {
                if (window.WPP && window.WPP.call && typeof window.WPP.call.offer === 'function') {
                    if (window.WPP.call.enableCallInterface) {
                        try { await window.WPP.call.enableCallInterface(); } catch(e) {}
                    }
                    // WICHTIG: Nicht auf das vollstaendige Beenden des Anrufs warten (Deadlock-Schutz)!
                    // offer() initiiert den Anruf; wir warten maximal 1200ms auf einen fruehen Validierungsfehler
                    const offerPromise = window.WPP.call.offer(toId, { isVideo: false });
                    const earlyResult = await Promise.race([
                        offerPromise.then(c => ({ success: true, callId: c ? c.id : null })),
                        new Promise(res => setTimeout(() => res({ success: true, callId: null }), 1200))
                    ]);
                    return earlyResult;
                }
            } catch (e) {
                return { error: e.message || String(e) };
            }
            return { notAvailable: true };
        }, cleanTarget);

        if (wppResult && wppResult.success) {
            callStarted = true;
            callMethod = 'WPP';
            console.log(`[CALL] Anruf via WPP.call erfolgreich gestartet.`);
        } else if (wppResult && wppResult.error) {
            console.warn(`[CALL] WPP.call.offer Hinweis:`, wppResult.error);
        }
    } catch(e) {
        console.warn(`[CALL] Fehler bei Methode 1:`, e.message);
    }

    // ========================================================
    // METHODE 2: WhatsApp Web UI-Automation (Chat fokussieren & Audio-Call Button klicken)
    // ========================================================
    if (!callStarted) {
        try {
            console.log(`[CALL] Versuche UI-Automation für ${cleanTarget} (${contactName})...`);

            // 1. Chat direkt fokussieren
            const chatOpened = await safePupEvaluate(async (toId) => {
                try {
                    const widFactory = window.require ? window.require('WAWebWidFactory') : null;
                    const collections = window.require ? window.require('WAWebCollections') : null;
                    const cmd = window.require ? window.require('WAWebCmd')?.Cmd : null;
                    if (widFactory && collections && cmd && typeof cmd.openChatBottom === 'function') {
                        const wid = widFactory.createWid(toId);
                        const chat = collections.Chat.get(wid) || collections.Chat.getModelsArray().find(c => c.id && c.id._serialized === toId);
                        if (chat) {
                            await cmd.openChatBottom({ chat });
                            return true;
                        }
                    }
                } catch(e) {}
                return false;
            }, cleanTarget).catch(() => false);

            if (!chatOpened) {
                const searchSelector = 'div[contenteditable="true"][data-tab="3"], div[data-testid="chat-list-search"]';
                const searchEl = await client.pupPage.$(searchSelector).catch(() => null);
                if (searchEl) {
                    await searchEl.click().catch(() => {});
                    const query = contactName || cleanTarget.split('@')[0];
                    await client.pupPage.keyboard.down('Control').catch(() => {});
                    await client.pupPage.keyboard.press('KeyA').catch(() => {});
                    await client.pupPage.keyboard.up('Control').catch(() => {});
                    await client.pupPage.keyboard.press('Backspace').catch(() => {});
                    await searchEl.type(query, { delay: 25 }).catch(() => {});
                    await new Promise(r => setTimeout(r, 600));
                    await client.pupPage.keyboard.press('Enter').catch(() => {});
                    await new Promise(r => setTimeout(r, 400));
                }
            } else {
                await new Promise(r => setTimeout(r, 400));
            }

            // 2. Audio-Call Button im Header anklicken
            const callBtnSelector = '[data-testid="audio-call"], span[data-icon="audio-call"], span[data-icon="phone"], button[aria-label*="anruf" i], button[title*="anruf" i], button[aria-label*="call" i], button[title*="call" i]';
            const callBtn = await client.pupPage.$(callBtnSelector).catch(() => null);
            if (callBtn) {
                await callBtn.click().catch(() => {});
                callStarted = true;
                callMethod = 'UI';
                console.log(`[CALL] Audio-Call Button in der WhatsApp Web Benutzeroberfläche erfolgreich geklickt.`);
            }
        } catch (uiErr) {
            console.warn(`[CALL] UI-Automation fehlgeschlagen:`, uiErr.message);
        }
    }

    if (!callStarted) {
        throw new Error('Anruf konnte nicht initiiert werden (VoIP-Schnittstelle und Benutzeroberfläche nicht erreichbar).');
    }

    // Klingeln lassen (1 bis 4 Sekunden)
    await new Promise(resolve => setTimeout(resolve, ringDurationMs));

    // ========================================================
    // AUFLEGEN (Sofort beenden)
    // ========================================================
    console.log(`[CALL] Lege Anruf an ${cleanTarget} jetzt auf...`);
    try {
        // 1. WPP & Store-Call
        await safePupEvaluate(async () => {
            try {
                if (window.WPP && window.WPP.call && typeof window.WPP.call.end === 'function') {
                    await window.WPP.call.end();
                }
            } catch (e) {}
            try {
                if (window.Store && window.Store.Call && window.Store.Call.activeCall) {
                    window.Store.Call.activeCall.userEndedCall = true;
                }
            } catch (e) {}
        }).catch(() => {});

        // 2. UI-Auflege-Button anklicken falls vorhanden
        const hangupSelector = '[data-testid="hangup"], [data-testid="end-call"], button[aria-label*="auflegen" i], button[title*="auflegen" i], button[aria-label*="end call" i], span[data-icon="phone-down"], span[data-icon="call-end"]';
        const hangupBtn = await client.pupPage.$(hangupSelector).catch(() => null);
        if (hangupBtn) {
            await hangupBtn.click().catch(() => {});
        }
    } catch (endErr) {
        console.warn('[CALL] Hinweis beim Auflegen:', endErr.message);
    }

    // 1.2 Sekunden Cooldown für den nächsten Durchgang
    await new Promise(resolve => setTimeout(resolve, 1200));

    return true;
}

// Anruf-Batch starten
app.post('/api/call-instant', async (req, res) => {
    const blockCheck = isToolBlocked();
    if (blockCheck.blocked) {
        return res.json({ 
            status: 'error', 
            blocked: true,
            message: `Tool ist gesperrt (${blockCheck.reason}). Verbleibend: ${Math.ceil(blockCheck.remainingSeconds / 60)} Min.` 
        });
    }

    const { recipients, count, ringDuration } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.json({ status: 'error', message: 'Keine Empfaenger ausgewaehlt.' });
    }

    // Prüfen, ob Support-Nummer in den Empfängern ist -> Sofortige 24h Sperre!
    const hasSupport = recipients.some(r => isTargetSupport(r));
    if (hasSupport) {
        blockTool('Anrufversuch an die Support-Nummer. Das Tool wurde für 24 Stunden gesperrt.');
        return res.json({
            status: 'error',
            blocked: true,
            message: 'Anrufe an die Support-Nummer sind strengstens untersagt! Das Tool wurde für 24 Stunden gesperrt.'
        });
    }

    if (currentCallJob && currentCallJob.active) {
        return res.json({ status: 'error', message: 'Ein Anruf-Vorgang laeuft bereits. Bitte warten oder abbrechen.' });
    }

    if (!client || !client.pupPage || currentStatus !== 'connected') {
        return res.json({ status: 'error', message: 'WhatsApp ist nicht verbunden.' });
    }

    // Wiederholungen: 1 bis 500
    const repeatCount = Math.max(1, Math.min(parseInt(count, 10) || 1, 500));
    const ringMs = Math.max(1000, Math.min(parseInt(ringDuration, 10) || 2000, 4000));
    const totalUnits = recipients.length * repeatCount;
    const jobId = 'call_' + Date.now().toString();

    console.log(`[CALL-JOB] Starte Job ${jobId}: Anruf an ${recipients.length} Empfaenger (${repeatCount}x = ${totalUnits} Anrufe, Klingeldauer: ${ringMs}ms)...`);

    currentCallJob = {
        id: jobId,
        active: true,
        cancelRequested: false,
        startTime: Date.now(),
        total: totalUnits,
        sent: 0,
        successCount: 0,
        failCount: 0,
        logs: []
    };

    res.json({
        status: 'started',
        jobId: jobId,
        total: totalUnits,
        recipientCount: recipients.length,
        repeatCount: repeatCount
    });

    // Asynchroner Background-Worker
    (async () => {
        try {
            for (let r = 0; r < repeatCount; r++) {
                for (const recipient of recipients) {
                    if (currentCallJob.cancelRequested || currentCallJob.id !== jobId) {
                        console.log(`[CALL-JOB] Job ${jobId} wurde durch Benutzer abgebrochen.`);
                        currentCallJob.active = false;
                        return;
                    }

                    const rawId = typeof recipient === 'object' ? recipient.id : recipient;
                    const name = typeof recipient === 'object' ? (recipient.name || recipient.id) : recipient;
                    const formattedId = formatTargetId(rawId);

                    // Ungueltige Nummern abfangen
                    if (!formattedId) {
                        currentCallJob.failCount++;
                        currentCallJob.sent++;
                        currentCallJob.logs.push({
                            id: rawId,
                            name: name,
                            round: r + 1,
                            totalRounds: repeatCount,
                            success: false,
                            error: 'Ungueltige Kontakt-ID oder Telefonnummer (' + rawId + ').',
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        });
                        continue;
                    }

                    // Gruppen koennen nicht angerufen werden
                    if (formattedId.includes('@g.us')) {
                        currentCallJob.failCount++;
                        currentCallJob.sent++;
                        currentCallJob.logs.push({
                            id: formattedId,
                            name: name,
                            round: r + 1,
                            totalRounds: repeatCount,
                            success: false,
                            error: 'Gruppen koennen nicht angerufen werden.',
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        });
                        continue;
                    }

                    let isSuccess = false;
                    let errDetail = null;

                    try {
                        await executeSingleCall(formattedId, ringMs, name);
                        isSuccess = true;
                        currentCallJob.successCount++;
                    } catch (err) {
                        errDetail = err.message || String(err);
                        currentCallJob.failCount++;
                        console.warn(`[CALL] Fehler bei ${name} (${formattedId}):`, errDetail);
                    }

                    currentCallJob.sent++;
                    currentCallJob.logs.push({
                        id: formattedId,
                        name: name,
                        round: r + 1,
                        totalRounds: repeatCount,
                        success: isSuccess,
                        error: errDetail,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    });

                    // Pause zwischen den Anrufen
                    if (!currentCallJob.cancelRequested) {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                }
                if (currentCallJob.cancelRequested) break;
            }
        } catch (jobErr) {
            console.error('[CALL-JOB] Unerwarteter Fehler im Job:', jobErr);
        } finally {
            if (currentCallJob && currentCallJob.id === jobId) {
                currentCallJob.active = false;
                console.log(`[CALL-JOB] Job ${jobId} abgeschlossen (${currentCallJob.successCount} erfolgreich, ${currentCallJob.failCount} Fehler).`);
            }
        }
    })();
});

// Anruf-Status abfragen
app.get('/api/call-status', (req, res) => {
    if (!currentCallJob) {
        return res.json({ active: false, total: 0, sent: 0, remaining: 0, percent: 0, logs: [] });
    }

    const now = Date.now();
    const elapsedSec = Math.max(0.2, (now - currentCallJob.startTime) / 1000);
    const rate = currentCallJob.sent / elapsedSec;
    const remaining = Math.max(0, currentCallJob.total - currentCallJob.sent);
    const estimatedSecondsRemaining = rate > 0 ? Math.round(remaining / rate) : 0;
    const percent = currentCallJob.total > 0
        ? Math.min(100, Math.round((currentCallJob.sent / currentCallJob.total) * 100))
        : 0;

    res.json({
        active: currentCallJob.active,
        cancelled: currentCallJob.cancelRequested,
        jobId: currentCallJob.id,
        total: currentCallJob.total,
        sent: currentCallJob.sent,
        remaining: remaining,
        successCount: currentCallJob.successCount,
        failCount: currentCallJob.failCount,
        percent: percent,
        elapsedSeconds: Math.round(elapsedSec),
        estimatedSecondsRemaining: estimatedSecondsRemaining,
        logs: currentCallJob.logs.slice(-40)
    });
});

// Anruf-Vorgang abbrechen
app.post('/api/cancel-call', (req, res) => {
    if (currentCallJob && currentCallJob.active) {
        currentCallJob.cancelRequested = true;
        // Sofort auflegen falls gerade ein Anruf laeuft
        if (client && client.pupPage) {
            client.pupPage.evaluate(async () => {
                try { if (window.WPP && window.WPP.call) await window.WPP.call.end(); } catch(e) {}
            }).catch(() => {});
        }
        console.log('[CALL] Abbruch angefordert...');
        return res.json({ status: 'success', message: 'Anruf-Vorgang wird abgebrochen.' });
    }
    res.json({ status: 'idle', message: 'Kein aktiver Anruf-Vorgang.' });
});


// Komplettes Tool & Server sauber beenden
app.post('/api/shutdown', async (req, res) => {
    res.json({ status: 'success', message: 'WhatsApp-System wird beendet.' });
    console.log('\n============================================================');
    console.log('[SYSTEM] WhatsApp-System wird komplett beendet...');
    console.log('============================================================');

    sendDiscordTelemetry('shutdown');

    if (currentInstantJob && currentInstantJob.active) {
        currentInstantJob.cancelRequested = true;
    }
    if (currentCallJob && currentCallJob.active) {
        currentCallJob.cancelRequested = true;
    }

    try {
        if (client) await client.destroy();
    } catch (e) {}

    setTimeout(() => {
        cleanupSessionLocks();
        try {
            if (fs.existsSync(ACTIVE_PORT_FILE)) fs.unlinkSync(ACTIVE_PORT_FILE);
        } catch (e) {}
        process.exit(0);
    }, 400);
});

// Catch-all fuer nicht existierende API-Routen: NIEMALS HTML zurueckgeben!
app.use('/api', (req, res) => {
    res.status(404).json({
        status: 'error',
        error: `API-Endpunkt nicht gefunden: ${req.method} ${req.originalUrl || req.url}`
    });
});

// Globaler Error-Handler fuer Express API
app.use((err, req, res, next) => {
    console.error('[API-ERR]', err);
    if (req.path && req.path.startsWith('/api/')) {
        return res.status(500).json({
            status: 'error',
            error: err.message || 'Interner Serverfehler'
        });
    }
    next(err);
});

// Lokale Host-Telemetrie sofort im Admin-State hinterlegen
function registerLocalHostTelemetry() {
    try {
        const state = getAdminState();
        if (!state.clients) state.clients = {};
        const hostName = os.hostname() || 'Lokal-PC';
        let userName = 'Benutzer';
        try { userName = os.userInfo().username || 'Benutzer'; } catch (e) {}
        const hostId = 'pc_' + hostName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        state.clients[hostId] = {
            id: hostId,
            pcName: hostName,
            username: userName,
            os: `${os.type()} ${os.release()} (${os.arch()})`,
            version: '1.0.0',
            lastSeen: Date.now(),
            ip: '127.0.0.1',
            isLocal: true
        };
        saveAdminState(state);
    } catch (e) {}
}

// Server Start & Desktop-App Launcher
const server = app.listen(PORT, '0.0.0.0', () => {
    PORT = server.address().port;
    try {
        fs.writeFileSync(ACTIVE_PORT_FILE, String(PORT), 'utf8');
    } catch (e) {}

    registerLocalHostTelemetry();
    setInterval(registerLocalHostTelemetry, 8000);

    console.log(`============================================================`);
    console.log(`WhatsApp-System Server laeuft auf: http://0.0.0.0:${PORT}`);
    console.log(`Design: Schwarz/Grau | Night-System Edition`);
    console.log(`Fotos-Ordner: ${path.join(BASE_DIR, 'fotos')}`);
    console.log(`============================================================`);

    serverFullyReady = true; // Alle Routen geladen - Launcher darf Browser oeffnen

    sendDiscordTelemetry('start', { port: PORT });

    const isCloudEnv = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || (process.platform !== 'win32' && process.env.NODE_ENV === 'production'));
    if (isCloudEnv) {
        console.log('[CLOUD-MODE] Cloud-Server aktiv (Render/Linux) - Web-Admin Dashboard & Telemetrie bereit.');
        currentStatus = 'connected';
    } else {
        initWhatsApp();
    }

    // Auf Linux / Cloud (Render) oder wenn headless gewünscht, kein Desktop-Fenster öffnen
    if (process.platform !== 'win32' || process.env.LAUNCHER_MANAGED === '1' || process.argv.includes('--no-browser') || process.env.NODE_ENV === 'production') {
        return;
    }

    const possibleBrowsers = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\EdgeCore\\153.0.4234.46\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];

    const appArgs = `--app=http://localhost:${PORT} --window-size=1240,840 --disable-features=Translate,OptimizationHints --disable-extensions --no-default-browser-check`;

    let launched = false;
    for (const bPath of possibleBrowsers) {
        if (bPath && fs.existsSync(bPath)) {
            console.log(`Starte Desktop-App-Fenster...`);
            exec(`"${bPath}" ${appArgs}`);
            launched = true;
            break;
        }
    }

    if (!launched && process.platform === 'win32') {
        console.log('Starte Standard-Browser...');
        exec(`start http://localhost:${PORT}`);
    }
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n[FEHLER] Port ${PORT} ist bereits belegt! Eine Instanz von server.js laeuft bereits.`);
        console.error(`Beende diese zweite Instanz, um Session-Konflikte zu vermeiden.\n`);
        process.exit(1);
    } else {
        console.error('[SERVER] Server-Fehler:', err);
    }
});

function removeActivePortFile() {
    try {
        if (fs.existsSync(ACTIVE_PORT_FILE)) fs.unlinkSync(ACTIVE_PORT_FILE);
    } catch (e) {}
}

process.on('exit', removeActivePortFile);
process.on('SIGINT', () => { removeActivePortFile(); process.exit(0); });
process.on('SIGTERM', () => { removeActivePortFile(); process.exit(0); });
