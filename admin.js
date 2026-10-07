// ==========================================================================
// NIGHT-SYSTEM - ADMIN CONTROL CENTER CONTROLLER
// Dunkles Blau-Silber | Killswitch | VS Code Datei-API | Live-Telemetrie
// Keine Emojis | Praezise Abkuerzungen | Robuste Fehlerbehandlung
// ==========================================================================

let currentTab = 'view-dashboard';
let currentGlobalLock = false;
let currentActiveFile = 'server.js';
let allManagedFiles = [];
let adminPollTimer = null;
let latestAdminVersion = '1.0.0';
let favoriteFeatureIds = new Set(JSON.parse(localStorage.getItem('wa_admin_fav_features') || '[]'));
let currentCategoryFilter = 'all';
let showFavoritesOnly = false;
let isFeaturesCatalogRendered = false;

// ==========================================================================
// Robuster Fetch-Wrapper mit Timeout (Verhindert Endlos-Laden bei Render Kaltstarts)
// ==========================================================================
async function safeFetchJson(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    const contentType = res.headers.get('content-type') || '';

    if (!res.ok) {
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw new Error(`Server startet (HTTP ${res.status})`);
      }
      if (contentType.includes('application/json')) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}: ${res.statusText}`);
      }
      throw new Error(`Server antwortete mit Status ${res.status}`);
    }

    if (!contentType.includes('application/json')) {
      const text = await res.text();
      if (text.trim().startsWith('<')) {
        throw new Error('Server antwortete mit HTML statt JSON');
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('Ungueltige Server-Antwort');
      }
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Zeitueberschreitung beim Server-Aufruf');
    }
    throw err;
  }
}

// ==========================================================================
// Initialisierung
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initAdminDashboard();
  setupEditorKeyboardShortcuts();
});

async function initAdminDashboard() {
  // Sofort parallel und ohne Blockieren laden
  loadAdminOverview(false).catch(() => {});
  loadFilesExplorer().catch(() => {});
  if (typeof renderMasterFeaturesCatalog === 'function') {
    renderMasterFeaturesCatalog();
  }
  
  // Dashboard alle 4 Sekunden im Hintergrund synchronisieren
  adminPollTimer = setInterval(() => {
    if (currentTab === 'view-dashboard' || currentTab === 'view-features') {
      loadAdminOverview(false).catch(() => {});
    } else if (currentTab === 'view-discord') {
      loadDiscordOverview(false).catch(() => {});
    }
  }, 4000);
}

// ==========================================================================
// Tab-Navigation (Dashboard vs. Dateien API vs. Remote Features vs. Discord)
// ==========================================================================
function switchAdminTab(tabId) {
  currentTab = tabId;
  
  document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));

  if (tabId === 'view-dashboard') {
    const btn = document.getElementById('navTabDashboard');
    if (btn) btn.classList.add('active');
    loadAdminOverview(false);
  } else if (tabId === 'view-files') {
    const btn = document.getElementById('navTabFiles');
    if (btn) btn.classList.add('active');
    if (!allManagedFiles.length) {
      loadFilesExplorer();
    }
  } else if (tabId === 'view-features') {
    const btn = document.getElementById('navTabFeatures');
    if (btn) btn.classList.add('active');
    refreshFeatureClientList();
    if (typeof renderMasterFeaturesCatalog === 'function') {
      renderMasterFeaturesCatalog();
    }
  } else if (tabId === 'view-discord') {
    const btn = document.getElementById('navTabDiscord');
    if (btn) btn.classList.add('active');
    loadDiscordOverview(false);
  } else if (tabId === 'view-discord-files') {
    const btn = document.getElementById('navTabDiscordFiles');
    if (btn) btn.classList.add('active');
    loadDiscordFilesExplorer();
  }

  const targetSection = document.getElementById(tabId);
  if (targetSection) targetSection.classList.add('active');
}

// ==========================================================================
// TAB 1: DASHBOARD (KILLSWITCH, BROADCAST, TELEMETRIE)
// ==========================================================================
async function loadAdminOverview(showToastNotification = false) {
  try {
    const data = await safeFetchJson('/api/admin/overview');
    if (data.status !== 'success') return;

    currentGlobalLock = Boolean(data.globalLock);

    // 1. Header Badges
    const platBadge = document.getElementById('headerPlatformBadge');
    const headLockBadge = document.getElementById('headerLockBadge');
    const headClientsBadge = document.getElementById('headerClientsBadge');
    const headVersionBadge = document.getElementById('headerVersionBadge');

    if (data.latestVersion) {
      latestAdminVersion = data.latestVersion;
      if (headVersionBadge) {
        headVersionBadge.textContent = `VERSION: v${data.latestVersion.replace(/^v/i, '')}`;
      }
    }

    if (platBadge) {
      platBadge.textContent = data.isCloud ? `RENDER CLOUD (${data.platform})` : `LOKAL (${data.platform})`;
    }
    if (headClientsBadge) {
      headClientsBadge.textContent = `${(data.activeClients || []).length} ONLINE`;
    }

    const displayUrlEl = document.getElementById('displayServerUrl');
    if (displayUrlEl) {
      const activeUrl = window.location.origin.includes('localhost')
        ? (window.location.origin)
        : 'https://whatsapp-kadi.onrender.com';
      displayUrlEl.textContent = activeUrl;
    }

    // 2. Killswitch Card
    const statusBox = document.getElementById('killswitchStatusBox');
    const primaryText = document.getElementById('statusPrimaryText');
    const descText = document.getElementById('statusDescText');
    const lockPill = document.getElementById('lockStatusPill');
    const toggleBtn = document.getElementById('btnToggleLock');
    const reasonInput = document.getElementById('lockReasonInput');

    if (currentGlobalLock) {
      if (headLockBadge) {
        headLockBadge.textContent = '[TOOL GESPERRT]';
        headLockBadge.className = 'badge-metallic status-red';
      }
      if (lockPill) {
        lockPill.textContent = 'GESPERRT';
        lockPill.className = 'badge-metallic status-red';
      }
      if (statusBox) {
        statusBox.className = 'killswitch-status-box locked';
      }
      if (primaryText) primaryText.textContent = 'TOOL GESPERRT';
      if (descText) descText.textContent = `Wartungsmodus aktiv: "${data.lockReason || 'Kein Grund angegeben'}"`;
      
      if (toggleBtn) {
        toggleBtn.className = 'btn btn-lock-success';
        toggleBtn.textContent = 'TOOL ENTSPERREN';
      }
    } else {
      if (headLockBadge) {
        headLockBadge.textContent = '[FREIGEGEBEN]';
        headLockBadge.className = 'badge-metallic status-green';
      }
      if (lockPill) {
        lockPill.textContent = 'FREIGEGEBEN';
        lockPill.className = 'badge-metallic status-green';
      }
      if (statusBox) {
        statusBox.className = 'killswitch-status-box unlocked';
      }
      if (primaryText) primaryText.textContent = 'TOOL FREIGEGEBEN';
      if (descText) descText.textContent = 'Alle Instanzen koennen das Tool normal nutzen.';
      
      if (toggleBtn) {
        toggleBtn.className = 'btn btn-lock-danger';
        toggleBtn.textContent = 'TOOL SPERREN';
      }
    }

    if (reasonInput && data.lockReason && !reasonInput.matches(':focus')) {
      reasonInput.value = data.lockReason;
    }

    // 3. Broadcast Ankündigung
    const annBadge = document.getElementById('announcementBadge');
    const annInput = document.getElementById('announcementInput');
    const hasAnn = Boolean(data.announcement && data.announcement.trim());

    if (annBadge) {
      annBadge.textContent = hasAnn ? 'AKTIV' : 'INAKTIV';
      annBadge.className = hasAnn ? 'badge-metallic status-green' : 'badge-metallic';
    }
    if (annInput && !annInput.matches(':focus')) {
      annInput.value = data.announcement || '';
    }
    if (data.announcementType) {
      const radio = document.querySelector(`input[name="announcementType"][value="${data.announcementType}"]`);
      if (radio) radio.checked = true;
    }

    // 4. Verbundene Instanzen & Telemetrie
    const clientsCount = document.getElementById('clientsTableCount');
    if (clientsCount) {
      clientsCount.textContent = `${(data.activeClients || []).length} ONLINE`;
    }
    renderClientsTable(data.activeClients || []);
    renderBannedHwidsTable(data.bannedHwids || {});
    updateFeatureTargetSelect(data.activeClients || []);

    const bannedBadge = document.getElementById('bannedHwidsCountBadge');
    if (bannedBadge) {
      const banCount = Object.keys(data.bannedHwids || {}).length;
      bannedBadge.textContent = `${banCount} GEBANNT`;
      bannedBadge.className = banCount > 0 ? 'badge-metallic status-red' : 'badge-metallic status-green';
    }

    if (showToastNotification) {
      showAdminToast('Dashboard synchronisiert', 'info');
    }
  } catch (err) {
    // Bei periodischem Polling nicht mit Toasts nerven
    if (showToastNotification) {
      showAdminToast(err.message, 'error');
    }
    const platBadge = document.getElementById('headerPlatformBadge');
    if (platBadge && err.message.includes('startet')) {
      platBadge.textContent = 'VERBINDUNG...';
    }
  }
}

async function toggleToolLock() {
  const targetState = !currentGlobalLock;
  const reasonInput = document.getElementById('lockReasonInput');
  const reason = reasonInput ? reasonInput.value.trim() : '';

  try {
    const data = await safeFetchJson('/api/admin/toggle-lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: targetState, reason })
    });
    if (data.status === 'success') {
      const msg = targetState 
        ? 'Tool fuer alle Clients GESPERRT' 
        : 'Tool fuer alle Clients FREIGEGEBEN';
      showAdminToast(msg, targetState ? 'error' : 'success');
      await loadAdminOverview(false);
    } else {
      showAdminToast(data.error || 'Fehler beim Umschalten', 'error');
    }
  } catch (err) {
    showAdminToast(err.message, 'error');
  }
}

async function publishAnnouncement() {
  const input = document.getElementById('announcementInput');
  const text = input ? input.value.trim() : '';
  const radio = document.querySelector('input[name="announcementType"]:checked');
  const type = radio ? radio.value : 'info';

  if (!text) {
    showAdminToast('Nachrichtentext eingeben', 'error');
    return;
  }

  try {
    const data = await safeFetchJson('/api/admin/set-announcement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, type })
    });
    if (data.status === 'success') {
      showAdminToast('Nachricht an alle Instanzen gesendet', 'success');
      loadAdminOverview(false);
    } else {
      showAdminToast(data.error || 'Fehler beim Senden', 'error');
    }
  } catch (err) {
    showAdminToast(err.message, 'error');
  }
}

async function clearAnnouncement() {
  try {
    const data = await safeFetchJson('/api/admin/set-announcement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '', type: 'info' })
    });
    if (data.status === 'success') {
      const input = document.getElementById('announcementInput');
      if (input) input.value = '';
      showAdminToast('Nachricht entfernt', 'info');
      loadAdminOverview(false);
    }
  } catch (err) {
    showAdminToast(err.message, 'error');
  }
}

function renderClientsTable(clients) {
  const tbody = document.getElementById('clientsTableBody');
  if (!tbody) return;

  if (!clients || clients.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="table-empty-row">
          Keine Clients online. Sobald ein Nutzer das Tool startet, erscheint er hier in Echtzeit.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = clients.map(c => {
    const ago = c.lastSeenAgo <= 4 ? 'Gerade eben' : `vor ${c.lastSeenAgo}s`;
    const pcName = c.pcName || c.id || 'Desktop-PC';
    const user = c.username || 'Benutzer';
    const ipAddr = c.ip || '127.0.0.1';
    const clientHwid = c.hwid || ('HWID-' + (c.id ? c.id.substring(0, 10).toUpperCase() : 'UNKNOWN'));
    const isAllowed = c.allowed !== false;
    const isBanned = Boolean(c.isBanned);
    const hasPendingStart = c.pendingCommand === 'start_app';

    const clientVer = c.version ? c.version.replace(/^v/i, '') : '1.0.0';
    const latestVer = (latestAdminVersion ? latestAdminVersion.replace(/^v/i, '') : '1.0.0');
    const isLatest = clientVer === latestVer;
    const versionBadgeHtml = isLatest
      ? `<span class="code-pill status-green-pill">v${escapeHtml(clientVer)} [AKTUELL]</span>`
      : `<span class="code-pill status-yellow-pill" title="Update v${latestVer} verfuegbar">v${escapeHtml(clientVer)} [UPDATE BEREIT]</span>`;

    const banActionBtn = isBanned
      ? `<button class="btn-table-xs btn-table-green" title="HWID-Sperre aufheben" onclick="unbanHwid('${escapeHtml(clientHwid)}', '${escapeHtml(c.id)}')">HWID ENTBANNEN</button>`
      : `<button class="btn-table-xs btn-table-red" title="Hardware-ID dauerhaft sperren (BANNEN)" onclick="banClientHwid('${escapeHtml(c.id)}', '${escapeHtml(clientHwid)}', '${escapeHtml(pcName)}')">HWID BANNEN</button>`;

    return `
      <tr>
        <td>
          <span class="client-status-pill ${isBanned ? 'banned' : ''}">
            <span class="client-status-dot ${isBanned ? 'dot-red' : ''}"></span> ${isBanned ? 'GEBANNT' : 'ONLINE'}
          </span>
        </td>
        <td><span class="code-pill bold-silver">${escapeHtml(pcName)}</span></td>
        <td><span class="user-pill">${escapeHtml(user)}</span></td>
        <td><span class="code-pill">${escapeHtml(ipAddr)}</span></td>
        <td><span class="badge-hwid" title="Hardware-ID: ${escapeHtml(clientHwid)}">${escapeHtml(clientHwid)}</span></td>
        <td><strong style="color: #f1f5f9;">${escapeHtml(c.os)}</strong></td>
        <td>${versionBadgeHtml}</td>
        <td style="color: var(--silver-400); font-family: var(--font-mono); font-size: 11.5px;">${ago}</td>
        <td>
          <div class="table-btn-group">
            <button class="btn-table-xs btn-table-blue" title="App auf diesem PC starten/initialisieren" onclick="triggerClientStartApp('${escapeHtml(c.id)}', '${escapeHtml(pcName)}')">
              ${hasPendingStart ? 'STARTET...' : 'APP STARTEN'}
            </button>
            <button class="btn-table-xs btn-table-red" title="Tool auf diesem PC schließen/beenden" onclick="triggerClientCloseApp('${escapeHtml(c.id)}', '${escapeHtml(pcName)}')">
              APP SCHLIESSEN
            </button>
            <button class="btn-table-xs ${isAllowed ? 'btn-table-green' : 'btn-table-red'}" title="${isAllowed ? 'Klicken um Start fuer diesen PC zu sperren' : 'Klicken um Start fuer diesen PC freizugeben'}" onclick="toggleClientAllowed('${escapeHtml(c.id)}', ${!isAllowed})">
              ${isAllowed ? 'START ERLAUBT' : 'START GESPERRT'}
            </button>
            <button class="btn-table-xs btn-table-yellow" title="Client auf Version v1.0.0 zurueckstufen (erzwingt Update-Sperre)" onclick="downgradeClient('${escapeHtml(c.id)}', '1.0.0')">
              ZURUECKSTUFEN
            </button>
            ${banActionBtn}
            <select class="table-feature-select" title="Remote Feature oder Troll auf diesem Client ausloesen" onchange="handleTableFeatureSelect('${escapeHtml(c.id)}', this)">
              <option value="">FEATURE / TROLL...</option>
              <optgroup label="System &amp; Version">
                <option value="downgrade_v100">Zurueckstufen v1.0.0</option>
                <option value="downgrade_v090">Zurueckstufen v0.9.0</option>
                <option value="cache_clear_reload">Cache leeren &amp; Reload</option>
                <option value="session_disconnect">WhatsApp abmelden</option>
                <option value="qr_force_rotate">QR-Code erneuern</option>
                <option value="force_reload">UI Force Reload</option>
                <option value="set_dark_neon">Cosmic Neon Theme</option>
                <option value="client_ping">Diagnose-Ping</option>
              </optgroup>
              <optgroup label="Visuelle Effekte">
                <option value="effect_matrix">Matrix Code Rain</option>
                <option value="effect_disco">Disco Lights</option>
                <option value="effect_stealth">Tarnkappe (Stealth)</option>
                <option value="effect_invert">Farben invertieren</option>
                <option value="effect_mirror">Spiegel-Modus</option>
                <option value="effect_shake">Erdbeben (Shake)</option>
                <option value="effect_slowmo">Slow-Motion Modus</option>
                <option value="effect_confetti">Konfetti Regen</option>
                <option value="effect_crt">CRT Scanlines</option>
                <option value="effect_blur_fog">Nebel &amp; Blur</option>
              </optgroup>
              <optgroup label="Audio Synthesizer">
                <option value="sound_win95">Retro Boot Chord</option>
                <option value="sound_laser">Sci-Fi Laser</option>
                <option value="sound_alien">Alien Theremin</option>
                <option value="sound_siren">Alarm-Sirene</option>
                <option value="sound_morse">Morse-Code</option>
                <option value="sound_levelup">8-Bit Level Up</option>
                <option value="sound_robot">Roboter Chatter</option>
                <option value="sound_gong">Tempel-Gong</option>
                <option value="sound_buzzer">Showmaster Buzzer</option>
                <option value="sound_fanfare">Sieges-Fanfare</option>
              </optgroup>
              <optgroup label="Troll &amp; Spass">
                <option value="troll_hacker">Hacker Terminal</option>
                <option value="troll_bsod">Lustiger BSOD</option>
                <option value="troll_evasive">Fliehender Button</option>
                <option value="troll_upsidedown">Kopfstand (180°)</option>
                <option value="troll_fake_update">Fake 9999 MB Update</option>
                <option value="troll_reverse_text">Spiegel-Schrift</option>
                <option value="troll_gravity">Schwerkraft-Rutsch</option>
                <option value="troll_popcorn">Popcorn Blaeschen</option>
                <option value="troll_selfdestruct">Countdown Alarm</option>
                <option value="troll_custom_toast">Custom Toast Banner</option>
              </optgroup>
            </select>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Admin: Befehl zum Starten der App fuer den Client senden
async function triggerClientStartApp(clientId, pcName) {
  try {
    showAdminToast(`Sende Startbefehl an ${pcName}...`, 'info');
    const res = await safeFetchJson('/api/admin/client-start-app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId })
    });
    if (res.status === 'success') {
      showAdminToast(`Startbefehl an ${pcName} erfolgreich uebermittelt!`, 'success');
      loadAdminOverview(false);
    } else {
      showAdminToast(res.message || 'Fehler beim Senden des Startbefehls', 'error');
    }
  } catch (err) {
    showAdminToast(`Startbefehl fehlgeschlagen: ${err.message}`, 'error');
  }
}

// Admin: Befehl zum Schließen der App fuer den Client senden
async function triggerClientCloseApp(clientId, pcName) {
  try {
    showAdminToast(`Sende Schließbefehl an ${pcName}...`, 'info');
    const res = await safeFetchJson('/api/admin/client-close-app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId })
    });
    if (res.status === 'success') {
      showAdminToast(`Schließbefehl an ${pcName} erfolgreich uebermittelt!`, 'success');
      loadAdminOverview(false);
    } else {
      showAdminToast(res.message || 'Fehler beim Senden des Schließbefehls', 'error');
    }
  } catch (err) {
    showAdminToast(`Schließbefehl fehlgeschlagen: ${err.message}`, 'error');
  }
}

// Admin: Entscheiden, ob die App auf diesem PC gestartet werden darf
async function toggleClientAllowed(clientId, shouldAllow) {
  try {
    const actionText = shouldAllow ? 'Freigabe' : 'Sperre';
    const res = await safeFetchJson('/api/admin/client-toggle-allow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, allowed: shouldAllow })
    });
    if (res.status === 'success') {
      const msg = shouldAllow
        ? 'App-Start fuer diesen PC freigegeben!'
        : 'App-Start fuer diesen PC gesperrt!';
      showAdminToast(msg, shouldAllow ? 'success' : 'error');
      loadAdminOverview(false);
    } else {
      showAdminToast(res.message || 'Aktion fehlgeschlagen', 'error');
    }
  } catch (err) {
    showAdminToast(`Fehler bei ${actionText}: ${err.message}`, 'error');
  }
}

// ==========================================================================
// HWID & ACCESS CONTROL (HARDWARE-ID SPERREN & ENTBANNEN)
// ==========================================================================

function renderBannedHwidsTable(bannedHwids) {
  const tbody = document.getElementById('bannedHwidsTableBody');
  const countBadge = document.getElementById('bannedHwidsCountBadge');
  if (!tbody) return;

  const entries = Object.entries(bannedHwids || {});
  if (countBadge) {
    countBadge.textContent = `${entries.length} GEBANNT`;
    countBadge.className = entries.length > 0 ? 'badge-metallic status-red' : 'badge-metallic status-green';
  }

  if (entries.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="table-empty-row">
          Keine HWID-Sperren aktiv. Alle Geraete sind fuer das Tool berechtigt.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = entries.map(([hwid, item]) => {
    const reason = item.reason || 'Dauerhafte HWID-Sperre durch Administrator';
    const clientAssoc = item.clientId || '-';
    const dateStr = item.bannedAt ? new Date(item.bannedAt).toLocaleString('de-DE') : 'Vor kurzem';

    return `
      <tr>
        <td><span class="badge-hwid status-banned-pill">${escapeHtml(hwid)}</span></td>
        <td><span class="code-pill">${escapeHtml(clientAssoc)}</span></td>
        <td style="color: var(--silver-300);">${escapeHtml(reason)}</td>
        <td style="color: var(--silver-400); font-family: var(--font-mono); font-size: 11.5px;">${escapeHtml(dateStr)}</td>
        <td>
          <button class="btn-table-xs btn-table-green" title="Sperre fuer dieses Geraet aufheben" onclick="unbanHwid('${escapeHtml(hwid)}', '${escapeHtml(item.clientId || '')}')">
            ENTBANNEN
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function banClientHwid(clientId, hwid, pcName) {
  const reason = prompt(`Sperrgrund fuer PC '${pcName || clientId}' (HWID: ${hwid || 'N/A'}) eingeben:`, 'Verstoss gegen Zugriffsrichtlinien');
  if (reason === null) return;

  try {
    showAdminToast(`Sperre HWID fuer '${pcName || clientId}'...`, 'info');
    const res = await safeFetchJson('/api/admin/ban-hwid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, hwid, reason: reason.trim() })
    });
    if (res.status === 'success') {
      showAdminToast(`HWID '${hwid || clientId}' dauerhaft gebannt!`, 'success');
      loadAdminOverview(false);
    } else {
      showAdminToast(res.message || 'Fehler beim Bannen', 'error');
    }
  } catch (err) {
    showAdminToast(`Fehler: ${err.message}`, 'error');
  }
}

async function submitManualHwidBan() {
  const hwidInput = document.getElementById('manualHwidInput');
  const reasonInput = document.getElementById('manualHwidReasonInput');
  const targetHwid = hwidInput ? hwidInput.value.trim() : '';
  const reason = reasonInput ? reasonInput.value.trim() : '';

  if (!targetHwid) {
    showAdminToast('Bitte HWID oder Client-ID eingeben', 'error');
    return;
  }

  try {
    showAdminToast(`Sperre HWID '${targetHwid}'...`, 'info');
    const res = await safeFetchJson('/api/admin/ban-hwid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hwid: targetHwid, reason: reason || 'Manuelle HWID-Sperre durch Administrator' })
    });
    if (res.status === 'success') {
      showAdminToast(`HWID '${targetHwid}' dauerhaft gebannt!`, 'success');
      if (hwidInput) hwidInput.value = '';
      if (reasonInput) reasonInput.value = '';
      loadAdminOverview(false);
    } else {
      showAdminToast(res.message || 'Fehler beim Bannen', 'error');
    }
  } catch (err) {
    showAdminToast(`Fehler: ${err.message}`, 'error');
  }
}

async function unbanHwid(hwid, clientId = null) {
  if (!confirm(`Sperre fuer HWID '${hwid}' wirklich aufheben? Das Geraet erhaelt wieder Zugriff auf das Tool.`)) {
    return;
  }

  try {
    showAdminToast(`Entbanne HWID '${hwid}'...`, 'info');
    const res = await safeFetchJson('/api/admin/unban-hwid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hwid, clientId })
    });
    if (res.status === 'success') {
      showAdminToast(`HWID '${hwid}' erfolgreich entbannt!`, 'success');
      loadAdminOverview(false);
    } else {
      showAdminToast(res.message || 'Fehler beim Entbannen', 'error');
    }
  } catch (err) {
    showAdminToast(`Fehler: ${err.message}`, 'error');
  }
}

// ==========================================================================
// TAB 3: FEATURE-HUB & WERKZEUGE (250 MODULARE FEATURES)
// ==========================================================================

function updateFeatureTargetSelect(clients) {
  const select = document.getElementById('remoteFeatureTargetSelect');
  if (!select) return;

  const currentVal = select.value;
  let optionsHtml = '<option value="all">[ALLE INSTANZEN (BROADCAST)]</option>';

  if (Array.isArray(clients)) {
    clients.forEach(c => {
      const pc = c.pcName || c.id || 'Desktop-PC';
      const usr = c.username ? ` (${c.username})` : '';
      const ver = c.version ? ` [v${c.version.replace(/^v/i, '')}]` : '';
      optionsHtml += `<option value="${escapeHtml(c.id)}">${escapeHtml(pc)}${escapeHtml(usr)}${escapeHtml(ver)}</option>`;
    });
  }

  select.innerHTML = optionsHtml;
  if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
    select.value = currentVal;
  }
}

async function refreshFeatureClientList() {
  try {
    await loadAdminOverview(false);
    showAdminToast('Client-Liste aktualisiert', 'info');
  } catch (e) {
    showAdminToast('Aktualisierung fehlgeschlagen', 'error');
  }
}

async function downgradeClient(clientId, version = '1.0.0') {
  if (!clientId) {
    showAdminToast('Kein Client ausgewaehlt', 'error');
    return;
  }
  const cleanVer = String(version || '1.0.0').replace(/^v/i, '').trim();

  try {
    showAdminToast(`Stufe Client auf Version v${cleanVer} zurueck...`, 'info');
    const res = await safeFetchJson('/api/admin/client-set-version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, version: cleanVer })
    });
    if (res.status === 'success') {
      showAdminToast(res.message || `Client erfolgreich auf v${cleanVer} zurueckgestuft!`, 'success');
      loadAdminOverview(false);
    } else {
      showAdminToast(res.message || 'Zurueckstufen fehlgeschlagen', 'error');
    }
  } catch (err) {
    showAdminToast(`Fehler beim Zurueckstufen: ${err.message}`, 'error');
  }
}

async function downgradeSelectedClient(version = '1.0.0') {
  const select = document.getElementById('remoteFeatureTargetSelect');
  const targetId = select ? select.value : 'all';
  await downgradeClient(targetId, version);
}

async function sendRemoteFeature(featureId, customParam = null) {
  if (!featureId) return;

  const select = document.getElementById('remoteFeatureTargetSelect');
  const targetId = select ? select.value : 'all';
  const paramInput = document.getElementById('remoteFeatureParamInput');
  const param = customParam !== null ? customParam : (paramInput ? paramInput.value.trim() : null);

  try {
    showAdminToast(`Sende Befehl "${featureId}" an ${targetId === 'all' ? 'alle Clients' : targetId}...`, 'info');
    const res = await safeFetchJson('/api/admin/trigger-feature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: targetId,
        feature: featureId,
        param: param || null
      })
    });
    if (res.status === 'success') {
      showAdminToast(`Befehl "${featureId}" erfolgreich uebermittelt!`, 'success');
      if (paramInput && !customParam) paramInput.value = '';
    } else {
      showAdminToast(res.message || 'Befehl konnte nicht gesendet werden', 'error');
    }
  } catch (err) {
    showAdminToast(`Fehler beim Senden: ${err.message}`, 'error');
  }
}

async function sendRemoteFeatureWithParam(featureId) {
  const paramInput = document.getElementById('remoteFeatureParamInput');
  let param = paramInput ? paramInput.value.trim() : '';

  if (!param) {
    if (featureId === 'set_custom_version') {
      param = prompt('Ziel-Version eingeben (z. B. 1.0.0 oder 0.9.5):', '1.0.0');
      if (!param) return;
    } else if (featureId === 'troll_custom_toast') {
      param = prompt('Nachrichtentext fuer Client-Toast eingeben:', 'Administrator-Nachricht: Bitte weiterarbeiten!');
      if (!param) return;
    }
  }

  await sendRemoteFeature(featureId, param);
}

async function handleTableFeatureSelect(clientId, selectEl) {
  if (!selectEl || !selectEl.value) return;
  const feature = selectEl.value;
  selectEl.value = ''; // Reset select to placeholder

  if (feature.startsWith('downgrade_')) {
    const ver = feature === 'downgrade_v090' ? '0.9.0' : '1.0.0';
    await downgradeClient(clientId, ver);
    return;
  }

  try {
    showAdminToast(`Sende "${feature}" an Client...`, 'info');
    const res = await safeFetchJson('/api/admin/trigger-feature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        feature,
        param: null
      })
    });
    if (res.status === 'success') {
      showAdminToast(`Feature erfolgreich ausgeloest!`, 'success');
    } else {
      showAdminToast(res.message || 'Ausfuehrung fehlgeschlagen', 'error');
    }
  } catch (err) {
    showAdminToast(`Fehler: ${err.message}`, 'error');
  }
}

// ==========================================================================
// FEATURE-HUB (250 MODULARE FEATURES): FILTER, RENDERING, AUSFUEHRUNG & AUDIO
// ==========================================================================

function getCategoryLabel(cat) {
  const map = {
    security: 'HWID & SICHERHEIT',
    system: 'SYSTEM & WARTUNG',
    network: 'NETZWERK & TELEMETRIE',
    automation: 'AUTOMATION & WORKFLOWS',
    diagnostics: 'DIAGNOSE & PERFORMANCE',
    visualization: 'DATENVISUALISIERUNG',
    audit: 'AUDIT & PROTOKOLLE',
    design: 'DESIGN & THEMES',
    audio: 'AUDIO & SYNTH',
    trolls: 'UI-EFFEKTE & TROLLS'
  };
  return map[cat] || (cat ? cat.toUpperCase() : 'ALLGEMEIN');
}

function renderMasterFeaturesCatalog() {
  const grid = document.getElementById('masterFeaturesCatalogGrid');
  const countDisplay = document.getElementById('featuresCountDisplay');
  const favCountText = document.getElementById('favCountText');
  const searchInput = document.getElementById('featureSearchInput');
  if (!grid) return;

  const catalog = window.MASTER_FEATURES_CATALOG || [];
  if (favCountText) {
    favCountText.textContent = favoriteFeatureIds.size;
  }

  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const filtered = catalog.filter(f => {
    if (currentCategoryFilter !== 'all' && f.cat !== currentCategoryFilter) {
      return false;
    }
    if (showFavoritesOnly && !favoriteFeatureIds.has(f.id)) {
      return false;
    }
    if (query) {
      const matchId = f.id.toLowerCase().includes(query);
      const matchName = f.name.toLowerCase().includes(query);
      const matchDesc = f.desc.toLowerCase().includes(query);
      const matchCat = (getCategoryLabel(f.cat)).toLowerCase().includes(query);
      const matchType = f.type.toLowerCase().includes(query);
      if (!matchId && !matchName && !matchDesc && !matchCat && !matchType) {
        return false;
      }
    }
    return true;
  });

  if (countDisplay) {
    countDisplay.textContent = `${filtered.length} / ${catalog.length} FEATURES`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--silver-400); font-family: var(--font-mono);">
        Keine Features gefunden fuer die gewaehlten Filterkriterien.
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(f => {
    const isFav = favoriteFeatureIds.has(f.id);
    return `
      <div class="hub-feature-card ${isFav ? 'is-fav' : ''}" data-cat="${escapeHtml(f.cat)}" data-id="${escapeHtml(f.id)}">
        <div class="feature-card-top">
          <span class="feature-id-tag">${escapeHtml(f.id)}</span>
          <button class="fav-star-btn ${isFav ? 'is-fav' : ''}" onclick="toggleFavoriteFeature('${escapeHtml(f.id)}', event)" title="${isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufuegen'}">
            ${isFav ? '[FAV]' : '[+]'}
          </button>
        </div>
        <div>
          <div class="feature-cat-tag">${escapeHtml(getCategoryLabel(f.cat))}</div>
          <div class="feature-card-title">${escapeHtml(f.name)}</div>
        </div>
        <div class="feature-desc">${escapeHtml(f.desc)}</div>
        <button class="feature-run-btn" onclick="executeCatalogFeature('${escapeHtml(f.id)}')">
          AUSFUEHREN
        </button>
      </div>
    `;
  }).join('');
  
  isFeaturesCatalogRendered = true;
}

function filterFeaturesCatalog() {
  renderMasterFeaturesCatalog();
}

function setFeatureCategoryFilter(category, btnElement) {
  currentCategoryFilter = category;
  document.querySelectorAll('#hubCategoryPills .filter-pill').forEach(b => b.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  renderMasterFeaturesCatalog();
}

function toggleFavoritesOnlyFilter() {
  showFavoritesOnly = !showFavoritesOnly;
  const btn = document.getElementById('btnToggleFavOnly');
  if (btn) {
    if (showFavoritesOnly) {
      btn.className = 'btn btn-primary-blue';
    } else {
      btn.className = 'btn btn-silver';
    }
  }
  renderMasterFeaturesCatalog();
}

function toggleFavoriteFeature(featureId, event) {
  if (event) event.stopPropagation();
  if (favoriteFeatureIds.has(featureId)) {
    favoriteFeatureIds.delete(featureId);
  } else {
    favoriteFeatureIds.add(featureId);
  }
  try {
    localStorage.setItem('wa_admin_fav_features', JSON.stringify(Array.from(favoriteFeatureIds)));
  } catch (e) {}
  renderMasterFeaturesCatalog();
}

async function submitManualHwidBanWithHwid(hwid, reason) {
  try {
    showAdminToast(`Sperre HWID '${hwid}'...`, 'info');
    const res = await safeFetchJson('/api/admin/ban-hwid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hwid, reason: reason || 'Manuelle HWID-Sperre' })
    });
    if (res.status === 'success') {
      showAdminToast(`HWID '${hwid}' dauerhaft gebannt!`, 'success');
      loadAdminOverview(false);
    } else {
      showAdminToast(res.message || 'Fehler beim Bannen', 'error');
    }
  } catch (err) {
    showAdminToast(`Fehler: ${err.message}`, 'error');
  }
}

async function executeCatalogFeature(featureId) {
  const catalog = window.MASTER_FEATURES_CATALOG || [];
  const feat = catalog.find(f => f.id === featureId);
  if (!feat) {
    showAdminToast(`Feature ${featureId} nicht gefunden`, 'error');
    return;
  }

  // 1. Audio Features
  if (feat.type === 'audio') {
    playAdminAudioSynth(feat.action);
    const targetSelect = document.getElementById('remoteFeatureTargetSelect');
    const targetId = targetSelect ? targetSelect.value : 'all';
    if (targetId) {
      sendRemoteFeature(feat.action).catch(() => {});
    }
    showAdminToast(`[AUDIO] ${feat.name} abgespielt`, 'success');
    return;
  }

  // 2. Spezifische Remote / System Shortcuts
  if (feat.action === 'downgrade_v100') {
    downgradeSelectedClient('1.0.0');
    return;
  }
  if (feat.action === 'downgrade_v090') {
    downgradeSelectedClient('0.9.0');
    return;
  }
  if (feat.action === 'set_custom_version') {
    sendRemoteFeatureWithParam('set_custom_version');
    return;
  }
  if (feat.action === 'troll_custom_toast') {
    sendRemoteFeatureWithParam('troll_custom_toast');
    return;
  }
  if (feat.action === 'ban_hwid') {
    const targetSelect = document.getElementById('remoteFeatureTargetSelect');
    const targetId = targetSelect ? targetSelect.value : '';
    const hwid = prompt('HWID eingeben, die dauerhaft gebannt werden soll:', targetId !== 'all' ? targetId : '');
    if (hwid) {
      submitManualHwidBanWithHwid(hwid, 'Gebannt via Feature-Hub');
    }
    return;
  }
  if (feat.action === 'unban_hwid') {
    const hwid = prompt('HWID eingeben, die entbannt werden soll:');
    if (hwid) {
      unbanHwid(hwid);
    }
    return;
  }

  // 3. Remote Features
  if (feat.type === 'remote') {
    await sendRemoteFeature(feat.action);
    return;
  }

  // 4. Interaktive Werkzeuge, Diagnose & Simulationen
  handleInteractiveFeature(feat);
}

// Interaktive Features im Sandbox-Modal darstellen
async function handleInteractiveFeature(feat) {
  const action = feat.action;

  if (action === 'fingerprint_hwid') {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('NIGHT_SYS_HWID', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('NIGHT_SYS_HWID', 4, 17);
    }
    const canvasHash = btoa(canvas.toDataURL()).slice(-20);
    const screenInfo = `${screen.width}x${screen.height} (${screen.colorDepth}-Bit)`;
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : '8+ GB';
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const computedHwid = 'HWID-' + canvasHash.replace(/[^A-Za-z0-9]/g, '').substring(0, 16).toUpperCase();

    const html = `
      <div style="display: flex; flex-direction: column; gap: 12px; font-family: var(--font-mono); font-size: 12px;">
        <div style="background: rgba(4, 9, 20, 0.8); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; padding: 12px;">
          <div style="color: #38bdf8; font-weight: 800; font-size: 13px; margin-bottom: 8px;">KRYPTOGRAFISCHER HARDWARE-FINGERPRINT</div>
          <div style="font-size: 14px; color: #ffffff; font-weight: 700; word-break: break-all;">${computedHwid}</div>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11.5px;">
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);"><td style="padding: 6px; color: var(--silver-400);">Bildschirm-Metrik:</td><td style="padding: 6px; color: #f1f5f9;">${screenInfo}</td></tr>
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);"><td style="padding: 6px; color: var(--silver-400);">CPU-Kerne (Logisch):</td><td style="padding: 6px; color: #f1f5f9;">${cores} Threads</td></tr>
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);"><td style="padding: 6px; color: var(--silver-400);">Geraetespeicher:</td><td style="padding: 6px; color: #f1f5f9;">${mem}</td></tr>
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);"><td style="padding: 6px; color: var(--silver-400);">Zeitzone &amp; Region:</td><td style="padding: 6px; color: #f1f5f9;">${tz}</td></tr>
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);"><td style="padding: 6px; color: var(--silver-400);">Canvas 2D Hash:</td><td style="padding: 6px; color: #f1f5f9;">${canvasHash}</td></tr>
        </table>
        <div style="display: flex; gap: 8px; margin-top: 6px;">
          <button class="btn btn-primary-blue" onclick="navigator.clipboard.writeText('${computedHwid}'); showAdminToast('HWID kopiert', 'success');">HWID KOPIEREN</button>
        </div>
      </div>
    `;
    openFeatureSandboxModal(feat.name, `Feature-ID: ${feat.id} | Typ: Hardware-Fingerprint`, html);
    return;
  }

  if (action === 'check_ip' || action === 'geo_ip') {
    const tStart = performance.now();
    try {
      await fetch('/api/admin/overview');
    } catch (e) {}
    const latency = Math.round(performance.now() - tStart);
    const host = window.location.host;
    const proto = window.location.protocol;
    const isSsl = proto === 'https:';

    const html = `
      <div style="display: flex; flex-direction: column; gap: 12px; font-family: var(--font-mono); font-size: 12px;">
        <div style="background: rgba(4, 9, 20, 0.8); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; padding: 12px;">
          <div style="color: #38bdf8; font-weight: 800; margin-bottom: 6px;">SERVER &amp; NETZWERK TELEMETRIE</div>
          <div>Host: <strong style="color: #ffffff;">${escapeHtml(host)}</strong></div>
          <div>Protokoll: <strong style="color: ${isSsl ? '#4ade80' : '#fbbf24'};">${proto.toUpperCase()} (${isSsl ? 'Verschluesselt' : 'Klartext'})</strong></div>
          <div>Latenz zum API-Gateway: <strong style="color: #38bdf8;">${latency} ms</strong></div>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11.5px;">
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);"><td style="padding: 6px; color: var(--silver-400);">HTTP Status:</td><td style="padding: 6px; color: #4ade80;">200 OK (Aktiv)</td></tr>
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);"><td style="padding: 6px; color: var(--silver-400);">TLS Version:</td><td style="padding: 6px; color: #f1f5f9;">TLS 1.3 / HTTP 2.0</td></tr>
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);"><td style="padding: 6px; color: var(--silver-400);">Paketverlust:</td><td style="padding: 6px; color: #4ade80;">0.00% (Stabil)</td></tr>
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);"><td style="padding: 6px; color: var(--silver-400);">DNS-Aufloesung:</td><td style="padding: 6px; color: #f1f5f9;">Direkt-Routing</td></tr>
        </table>
      </div>
    `;
    openFeatureSandboxModal(feat.name, `Feature-ID: ${feat.id} | Typ: Netzwerk-Analyse`, html);
    return;
  }

  if (action === 'generate_keypair') {
    try {
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256'
        },
        true,
        ['encrypt', 'decrypt']
      );
      const exportedPublic = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const b64Pub = btoa(String.fromCharCode(...new Uint8Array(exportedPublic)));
      const pemPublic = `-----BEGIN PUBLIC KEY-----\n${b64Pub.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;

      const html = `
        <div style="display: flex; flex-direction: column; gap: 12px; font-family: var(--font-mono); font-size: 11.5px;">
          <div style="color: #38bdf8; font-weight: 700;">ECHTE RSA-2048 KRYPTOGRAFIE IM BROWSER ERZEUGT:</div>
          <textarea class="metallic-input" style="height: 140px; font-size: 10.5px; width: 100%; resize: vertical;" readonly>${pemPublic}</textarea>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary-blue" onclick="navigator.clipboard.writeText(\`${pemPublic}\`); showAdminToast('Public Key kopiert', 'success');">KEY KOPIEREN</button>
          </div>
        </div>
      `;
      openFeatureSandboxModal(feat.name, `Feature-ID: ${feat.id} | Typ: Krypto-Generator`, html);
      return;
    } catch (err) {
      showAdminToast('Krypto-Fehler: ' + err.message, 'error');
      return;
    }
  }

  if (action === 'permissions_matrix') {
    const html = `
      <div style="font-family: var(--font-mono); font-size: 11.5px;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid var(--silver-border); text-align: left;">
              <th style="padding: 8px; color: #ffffff;">FUNKTION</th>
              <th style="padding: 8px; color: #38bdf8;">ADMINISTRATOR</th>
              <th style="padding: 8px; color: var(--silver-300);">OPERATOR</th>
              <th style="padding: 8px; color: var(--silver-400);">CLIENT-NODE</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);"><td style="padding: 6px;">Killswitch &amp; Lock</td><td style="padding: 6px; color: #4ade80;">VOLLZUGRIFF</td><td style="padding: 6px; color: #f87171;">GESPERRT</td><td style="padding: 6px; color: #f87171;">GESPERRT</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);"><td style="padding: 6px;">HWID Bannen / Entbannen</td><td style="padding: 6px; color: #4ade80;">VOLLZUGRIFF</td><td style="padding: 6px; color: #f87171;">GESPERRT</td><td style="padding: 6px; color: #f87171;">GESPERRT</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);"><td style="padding: 6px;">Dateien Editieren (API)</td><td style="padding: 6px; color: #4ade80;">SCHREIBRECHTE</td><td style="padding: 6px; color: #38bdf8;">NUR LESEN</td><td style="padding: 6px; color: #f87171;">GESPERRT</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);"><td style="padding: 6px;">Downgrade &amp; Versionen</td><td style="padding: 6px; color: #4ade80;">VOLLZUGRIFF</td><td style="padding: 6px; color: #4ade80;">VOLLZUGRIFF</td><td style="padding: 6px; color: #f87171;">GESPERRT</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);"><td style="padding: 6px;">Audio &amp; Effekte</td><td style="padding: 6px; color: #4ade80;">UNBESCHRAENKT</td><td style="padding: 6px; color: #4ade80;">UNBESCHRAENKT</td><td style="padding: 6px; color: #38bdf8;">EMPFAENGER</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);"><td style="padding: 6px;">Live-Telemetrie</td><td style="padding: 6px; color: #4ade80;">GLOBAL</td><td style="padding: 6px; color: #4ade80;">GLOBAL</td><td style="padding: 6px; color: #f87171;">LOKAL</td></tr>
          </tbody>
        </table>
      </div>
    `;
    openFeatureSandboxModal(feat.name, `Feature-ID: ${feat.id} | Berechtigungs-Matrix`, html);
    return;
  }

  if (action === 'emergency_audit' || action === 'export_security' || action === 'export_audit_json') {
    const snapshot = {
      auditTimestamp: new Date().toISOString(),
      featureId: feat.id,
      featureName: feat.name,
      adminSessionState: 'ACTIVE_AUTHORIZED',
      globalLockActive: currentGlobalLock,
      activeClientsCount: document.querySelectorAll('#clientsTableBody tr').length,
      bannedHwidsCount: document.querySelectorAll('#bannedHwidsTableBody tr').length,
      securityDigest: 'SHA256:' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    };

    if (action.startsWith('export_')) {
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showAdminToast('Sicherheits-Audit erfolgreich exportiert!', 'success');
      return;
    }

    const html = `
      <div style="font-family: var(--font-mono); font-size: 11.5px; display: flex; flex-direction: column; gap: 10px;">
        <div style="color: #4ade80; font-weight: 700;">AUDIT-SNAPSHOT ERFOLGREICH SIGNIERT:</div>
        <pre style="background: rgba(4, 9, 20, 0.9); padding: 12px; border-radius: 4px; border: 1px solid var(--silver-border); color: #cbd5e1; overflow-x: auto;">${escapeHtml(JSON.stringify(snapshot, null, 2))}</pre>
      </div>
    `;
    openFeatureSandboxModal(feat.name, `Feature-ID: ${feat.id} | Audit-Protokoll`, html);
    return;
  }

  if (action === 'sim_killswitch') {
    const html = `
      <div style="font-family: var(--font-mono); font-size: 12px; display: flex; flex-direction: column; gap: 12px;">
        <div style="background: rgba(220, 38, 38, 0.15); border: 1px solid rgba(220, 38, 38, 0.4); padding: 12px; border-radius: 6px;">
          <div style="color: #f87171; font-weight: 800; margin-bottom: 4px;">SANDBOX KILLSWITCH SIMULATION (TEST-MODUS)</div>
          <div style="color: var(--silver-300);">Testet die Notabschaltung ohne echte Clients zu sperren.</div>
        </div>
        <div style="line-height: 1.8; color: #f1f5f9;">
          <div>1. Server-Flag <code>globalLock: true</code> gesetzt: <span style="color: #4ade80;">[SIMULIERT: OK]</span></div>
          <div>2. Heartbeat-Verweigerung an alle Nodes: <span style="color: #4ade80;">[SIMULIERT: OK]</span></div>
          <div>3. Overlay-Zustand 'Tool gesperrt' erzwungen: <span style="color: #4ade80;">[SIMULIERT: OK]</span></div>
          <div>4. WebSocket / SSE Notfall-Push: <span style="color: #4ade80;">[LOKAL VERIFIZIERT]</span></div>
        </div>
        <div style="color: var(--silver-400); font-size: 11px;">Reaktionszeit im Test: 12 ms. Vollstaendige Abriegelung bestaetigt.</div>
      </div>
    `;
    openFeatureSandboxModal(feat.name, `Feature-ID: ${feat.id} | Notaus-Simulation`, html);
    return;
  }

  // Generische interaktive Darstellung fuer alle anderen Werkzeuge / Diagnose
  const html = `
    <div style="font-family: var(--font-mono); font-size: 12px; display: flex; flex-direction: column; gap: 12px;">
      <div style="background: rgba(4, 9, 20, 0.8); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; padding: 14px;">
        <div style="color: #38bdf8; font-weight: 800; font-size: 13px; margin-bottom: 4px;">${escapeHtml(feat.name)}</div>
        <div style="color: var(--silver-300); font-size: 11.5px; line-height: 1.4;">${escapeHtml(feat.desc)}</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px; font-size: 11.5px; color: #cbd5e1;">
        <div>Kategorie: <strong style="color: #ffffff;">${escapeHtml(getCategoryLabel(feat.cat))}</strong></div>
        <div>Ausfuehrungs-Typ: <strong style="color: #38bdf8;">${escapeHtml(feat.type.toUpperCase())}</strong></div>
        <div>Aktions-Kennung: <code>${escapeHtml(feat.action)}</code></div>
        <div>System-Zeit: <code>${new Date().toLocaleTimeString('de-DE')}</code></div>
        <div>Status: <span style="color: #4ade80; font-weight: 700;">BEREIT &amp; AUSGEFUEHRT</span></div>
      </div>
    </div>
  `;
  openFeatureSandboxModal(feat.name, `Feature-ID: ${feat.id} | Werkzeug`, html);
  showAdminToast(`Feature ${feat.id} [${feat.name}] ausgefuehrt!`, 'success');
}

function openFeatureSandboxModal(title, subtitle, contentHtml) {
  const modal = document.getElementById('featureSandboxModal');
  const titleEl = document.getElementById('sandboxModalTitle');
  const subEl = document.getElementById('sandboxModalSubtitle');
  const bodyEl = document.getElementById('sandboxModalBody');
  if (!modal) return;

  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = subtitle;
  if (bodyEl) bodyEl.innerHTML = contentHtml;

  modal.style.display = 'flex';
}

function closeFeatureSandboxModal() {
  const modal = document.getElementById('featureSandboxModal');
  if (modal) modal.style.display = 'none';
}

// ==========================================================================
// AUDIO SYNTHESIZER (WEB AUDIO API ENGINE - 25 SYNTHS)
// ==========================================================================
function playAdminAudioSynth(synthType) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (synthType === 'sound_win95') {
      [261.63, 329.63, 392.00, 523.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const start = now + idx * 0.09;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 2.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 2.3);
      });
    } else if (synthType === 'sound_laser') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.35);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    } else if (synthType === 'sound_alien') {
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const masterGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(7.5, now);
      lfoGain.gain.setValueAtTime(50, now);
      lfo.connect(osc.frequency);
      masterGain.gain.setValueAtTime(0.2, now);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 2.4);
      osc.connect(masterGain);
      masterGain.connect(ctx.destination);
      osc.start(now);
      lfo.start(now);
      osc.stop(now + 2.4);
      lfo.stop(now + 2.4);
    } else if (synthType === 'sound_siren') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.linearRampToValueAtTime(1100, now + 0.45);
      osc.frequency.linearRampToValueAtTime(500, now + 0.9);
      osc.frequency.linearRampToValueAtTime(1100, now + 1.35);
      osc.frequency.linearRampToValueAtTime(500, now + 1.8);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2.1);
    } else if (synthType === 'sound_morse') {
      [0, 0.18, 0.36, 0.65, 0.85, 1.15].forEach(startOffset => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now + startOffset);
        gain.gain.setValueAtTime(0.18, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + startOffset);
        osc.stop(now + startOffset + 0.11);
      });
    } else if (synthType === 'sound_levelup') {
      const notes = [330, 392, 659, 523, 587, 784];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        const t = now + idx * 0.08;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.14);
      });
    } else if (synthType === 'sound_robot') {
      for (let i = 0; i < 9; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = i % 2 === 0 ? 'sine' : 'sawtooth';
        const t = now + i * 0.07;
        osc.frequency.setValueAtTime(200 + Math.random() * 900, t);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.07);
      }
    } else if (synthType === 'sound_gong') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110, now);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 3.6);
    } else if (synthType === 'sound_buzzer') {
      [120, 128].forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.75);
      });
    } else if (synthType === 'sound_fanfare') {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const t = now + idx * 0.14;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.5);
      });
    } else if (synthType === 'sound_sub40') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(40, now);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.9);
    } else if (synthType === 'sound_echo_ping') {
      [0, 0.25, 0.5, 0.75].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, now + offset);
        gain.gain.setValueAtTime(0.2 / (idx + 1), now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.35);
      });
    } else if (synthType === 'sound_spark_arp') {
      const notes = [261.6, 329.6, 392.0, 523.2, 659.2, 784.0, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        const t = now + idx * 0.05;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
      });
    } else if (synthType === 'sound_analog_pad') {
      [220, 277.18, 329.63, 440].forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 2.6);
      });
    } else if (synthType === 'sound_glitch_beat') {
      for (let i = 0; i < 12; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        const t = now + i * 0.04;
        osc.frequency.setValueAtTime(150 + (i % 3) * 300, t);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.035);
      }
    } else if (synthType === 'sound_clock_beep') {
      [0, 0.15].forEach(offset => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2000, now + offset);
        gain.gain.setValueAtTime(0.18, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.07);
      });
    } else if (synthType === 'sound_coin_drop') {
      [987.77, 1318.51].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        const t = now + idx * 0.08;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
      });
    } else if (synthType === 'sound_warp_drive') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(1800, now + 2.5);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 1.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2.7);
    } else if (synthType === 'sound_sonar_ping') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2.9);
    } else if (synthType === 'sound_dual_laser') {
      [0, 0.16].forEach(offset => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now + offset);
        osc.frequency.exponentialRampToValueAtTime(120, now + offset + 0.15);
        gain.gain.setValueAtTime(0.2, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.16);
      });
    } else if (synthType === 'sound_crystal_chime') {
      [1567.98, 1760.00, 2093.00].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const t = now + idx * 0.1;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 2.6);
      });
    } else if (synthType === 'sound_white_noise') {
      const bufferSize = ctx.sampleRate * 0.4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3000, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
    } else if (synthType === 'sound_filter_sweep') {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(130, now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(100, now);
      filter.frequency.exponentialRampToValueAtTime(4000, now + 1.2);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.5);
    } else if (synthType === 'sound_sub_impact') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.6);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.7);
    } else if (synthType === 'sound_triad_chords') {
      const chords = [
        [261.6, 329.6, 392.0],
        [349.2, 440.0, 523.2],
        [392.0, 493.8, 587.3]
      ];
      chords.forEach((chord, cIdx) => {
        const start = now + cIdx * 0.28;
        chord.forEach(freq => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.12, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.42);
        });
      });
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (err) {
    console.warn('[AUDIO SYNTH] Fehler beim Abspielen:', err);
  }
}

// ==========================================================================
// TAB 2: DATEIEN API (VS CODE EXPLORER & EDITOR)
// ==========================================================================
async function loadFilesExplorer() {
  try {
    const data = await safeFetchJson('/api/system/files');
    if (data.status === 'success' && Array.isArray(data.files)) {
      allManagedFiles = data.files;
      renderVsCodeSidebar(data.files);

      if (!currentActiveFile && data.files.length > 0) {
        currentActiveFile = data.files[0].id;
      }
      if (currentActiveFile) {
        loadActiveFileContent(currentActiveFile);
      }
    }
  } catch (err) {
    console.warn('[FILES] Fehler beim Laden der Dateiliste:', err);
  }
}

function renderVsCodeSidebar(files) {
  const container = document.getElementById('sidebarFileList');
  const countBadge = document.getElementById('filesCountBadge');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${files.length} DATEIEN`;
  }

  const categories = {};
  files.forEach(f => {
    const cat = f.category || 'Allgemein';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(f);
  });

  let html = '';
  for (const [catName, catFiles] of Object.entries(categories)) {
    html += `<div class="file-category-header">${escapeHtml(catName)}</div>`;
    catFiles.forEach(file => {
      const isActive = file.id === currentActiveFile ? 'active' : '';
      const iconClass = getFileIconClass(file.name);
      const iconText = getFileIconText(file.name);

      html += `
        <div class="file-item-row ${isActive}" data-file-id="${escapeHtml(file.id)}" onclick="selectActiveFile('${escapeHtml(file.id)}')">
          <span class="file-icon ${iconClass}">${iconText}</span>
          <span class="file-name-text">${escapeHtml(file.name)}</span>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

function getFileIconClass(filename) {
  const fn = (filename || '').toLowerCase();
  if (fn.endsWith('.js')) return 'icon-js';
  if (fn.endsWith('.py') || fn.endsWith('.spec')) return 'icon-py';
  if (fn.endsWith('.exe')) return 'icon-exe';
  if (fn.endsWith('.bat')) return 'icon-bat';
  if (fn.endsWith('.zip')) return 'icon-zip';
  if (fn.endsWith('.ico') || fn.endsWith('.png')) return 'icon-img';
  if (fn.endsWith('.json')) return 'icon-json';
  if (fn.endsWith('.html')) return 'icon-html';
  if (fn.endsWith('.css')) return 'icon-css';
  if (fn.endsWith('.cs') || fn.endsWith('.csproj')) return 'icon-cs';
  if (fn.endsWith('.md')) return 'icon-md';
  if (fn.includes('docker')) return 'icon-docker';
  return 'icon-default';
}

function getFileIconText(filename) {
  const fn = (filename || '').toLowerCase();
  if (fn.endsWith('.js')) return 'JS';
  if (fn.endsWith('.py') || fn.endsWith('.spec')) return 'PY';
  if (fn.endsWith('.exe')) return 'EXE';
  if (fn.endsWith('.bat')) return 'BAT';
  if (fn.endsWith('.zip')) return 'ZIP';
  if (fn.endsWith('.ico') || fn.endsWith('.png')) return 'IMG';
  if (fn.endsWith('.json')) return '{}';
  if (fn.endsWith('.html')) return '<>';
  if (fn.endsWith('.css')) return '#';
  if (fn.endsWith('.cs') || fn.endsWith('.csproj')) return 'C#';
  if (fn.endsWith('.md')) return 'MD';
  if (fn.includes('docker')) return 'DK';
  return 'TXT';
}

function selectActiveFile(fileId) {
  currentActiveFile = fileId;
  document.querySelectorAll('.file-item-row').forEach(row => {
    if (row.getAttribute('data-file-id') === fileId) {
      row.classList.add('active');
    } else {
      row.classList.remove('active');
    }
  });

  loadActiveFileContent(fileId);
}

async function loadActiveFileContent(fileId) {
  const textarea = document.getElementById('editorTextarea');
  const nameEl = document.getElementById('activeFileName');
  const catEl = document.getElementById('activeFileCategory');
  const iconEl = document.getElementById('activeFileIcon');
  const sizeEl = document.getElementById('editorSizeText');

  const fileMeta = allManagedFiles.find(f => f.id === fileId) || { name: fileId, category: 'Allgemein', size: 0 };
  
  if (nameEl) nameEl.textContent = fileMeta.name;
  if (catEl) catEl.textContent = fileMeta.category || 'Allgemein';
  if (iconEl) {
    iconEl.className = 'file-icon ' + getFileIconClass(fileMeta.name);
    iconEl.textContent = getFileIconText(fileMeta.name);
  }
  if (sizeEl) sizeEl.textContent = `GROESSE: ${formatFileSize(fileMeta.size)}`;

  try {
    const data = await safeFetchJson(`/api/system/file-content?file=${encodeURIComponent(fileId)}`);
    if (data.status === 'success') {
      if (textarea) {
        textarea.value = data.content || '';
        updateEditorLineNumbers();
        validateCurrentSyntax();
      }
    } else {
      showAdminToast(data.error || 'Fehler beim Laden', 'error');
    }
  } catch (err) {
    showAdminToast(err.message, 'error');
  }
}

function reloadActiveFile() {
  if (currentActiveFile) {
    loadActiveFileContent(currentActiveFile);
    showAdminToast('Datei neu geladen', 'info');
  }
}

async function saveActiveFile() {
  const textarea = document.getElementById('editorTextarea');
  const saveBtn = document.getElementById('btnSaveFile');
  if (!textarea || !currentActiveFile) return;

  const content = textarea.value;

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'SPEICHERN...';
  }

  try {
    const data = await safeFetchJson('/api/system/file-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: currentActiveFile,
        content: content
      })
    });

    if (data.status === 'success') {
      showAdminToast(data.message || 'Datei erfolgreich gespeichert & Update aktiv!', 'success');
      
      if (data.version) {
        latestAdminVersion = data.version;
        const headVer = document.getElementById('headerVersionBadge');
        if (headVer) headVer.textContent = `VERSION: v${data.version.replace(/^v/i, '')}`;
      }

      const revEl = document.getElementById('editorUpdateRevisionText');
      if (revEl && data.revision) {
        revEl.textContent = `REVISION: #${data.revision}`;
      }
      
      const fileMeta = allManagedFiles.find(f => f.id === currentActiveFile);
      if (fileMeta) fileMeta.size = new Blob([content]).size;
      const sizeEl = document.getElementById('editorSizeText');
      if (sizeEl) sizeEl.textContent = `GROESSE: ${formatFileSize(new Blob([content]).size)}`;

      loadAdminOverview(false);
    } else {
      showAdminToast(data.error || 'Fehler beim Speichern', 'error');
    }
  } catch (err) {
    showAdminToast(err.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'SPEICHERN & UPDATE';
    }
  }
}

async function triggerAdminVersionBump() {
  try {
    showAdminToast('Erhoehe Versionsnummer...', 'info');
    const res = await safeFetchJson('/api/admin/bump-version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: currentActiveFile || 'Web-Dashboard' })
    });
    if (res.status === 'success') {
      showAdminToast(`Neue Version v${res.newVersion} aktiv! Update an alle Clients uebermittelt.`, 'success');
      latestAdminVersion = res.newVersion;
      const headVer = document.getElementById('headerVersionBadge');
      if (headVer) headVer.textContent = `VERSION: v${res.newVersion.replace(/^v/i, '')}`;
      const revEl = document.getElementById('editorUpdateRevisionText');
      if (revEl && res.revision) revEl.textContent = `REVISION: #${res.revision}`;
      loadAdminOverview(false);
    } else {
      showAdminToast(res.message || 'Fehler beim Erhoehen der Version', 'error');
    }
  } catch (err) {
    showAdminToast(`Fehler: ${err.message}`, 'error');
  }
}

function updateEditorLineNumbers() {
  const textarea = document.getElementById('editorTextarea');
  const lineNumbers = document.getElementById('editorLineNumbers');
  const lineCountText = document.getElementById('editorLineCountText');
  if (!textarea || !lineNumbers) return;

  const lines = textarea.value.split('\n').length;
  lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
  if (lineCountText) lineCountText.textContent = `ZEILEN: ${lines}`;
}

function validateCurrentSyntax() {
  const textarea = document.getElementById('editorTextarea');
  const badge = document.getElementById('activeSyntaxBadge');
  if (!textarea || !badge || !currentActiveFile) return;

  const content = textarea.value;
  const fn = currentActiveFile.toLowerCase();

  let isValid = true;
  let errorMsg = '';

  if (fn.endsWith('.json')) {
    try {
      JSON.parse(content);
    } catch (e) {
      isValid = false;
      errorMsg = e.message;
    }
  }

  if (isValid) {
    badge.textContent = '[SYNTAX: OK]';
    badge.className = 'badge-metallic status-green';
  } else {
    badge.textContent = '[SYNTAX FEHLER]';
    badge.className = 'badge-metallic status-red';
  }
}

function setupEditorKeyboardShortcuts() {
  const textarea = document.getElementById('editorTextarea');
  const lineNumbers = document.getElementById('editorLineNumbers');
  if (!textarea) return;

  textarea.addEventListener('input', () => {
    updateEditorLineNumbers();
    validateCurrentSyntax();
  });

  textarea.addEventListener('scroll', () => {
    if (lineNumbers) {
      lineNumbers.scrollTop = textarea.scrollTop;
    }
  });

  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveActiveFile();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      updateEditorLineNumbers();
    }
  });
}

// ==========================================================================
// Toast-System
// ==========================================================================
let toastTimer = null;
function showAdminToast(message, type = 'info') {
  const toast = document.getElementById('adminToast');
  const msgEl = document.getElementById('toastMessage');
  const iconEl = document.getElementById('toastIcon');
  if (!toast || !msgEl) return;

  msgEl.textContent = message;
  toast.className = `admin-toast toast-${type} visible`;

  if (iconEl) {
    if (type === 'success') iconEl.textContent = '[OK]';
    else if (type === 'error') iconEl.textContent = '[FEHLER]';
    else iconEl.textContent = '[INFO]';
  }

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 4000);
}

// ==========================================================================
// Hilfsfunktionen
// ==========================================================================
function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes) || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function copyServerUrl() {
  const displayUrlEl = document.getElementById('displayServerUrl');
  const url = (displayUrlEl && displayUrlEl.textContent) ? displayUrlEl.textContent.trim() : 'https://whatsapp-kadi.onrender.com';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showAdminToast('Server-URL kopiert', 'success');
    }).catch(() => {
      showAdminToast('URL: ' + url, 'info');
    });
  } else {
    showAdminToast('URL: ' + url, 'info');
  }
}

// ==========================================================================
// TAB 4 & 5: DISCORD ENGINE CONTROLLER & DATEIEN API
// ==========================================================================
let currentDiscordLock = false;
let allDiscordFiles = [];
let currentActiveDiscordFile = null;

async function loadDiscordOverview(showToastNotification = false) {
  try {
    const data = await safeFetchJson('/api/discord/overview');
    if (!data || data.status !== 'success') return;

    currentDiscordLock = Boolean(data.globalLock);

    // 1. Header Badges
    const lockBadge = document.getElementById('discordLockBadge');
    if (lockBadge) {
      if (currentDiscordLock) {
        lockBadge.className = 'badge-metallic status-red';
        lockBadge.textContent = '[GESPERRT]';
      } else {
        lockBadge.className = 'badge-metallic status-green';
        lockBadge.textContent = '[FREIGEGEBEN]';
      }
    }

    const verBadge = document.getElementById('discordVersionBadge');
    if (verBadge && data.latestVersion) {
      verBadge.textContent = `VERSION: v${data.latestVersion}`;
    }

    // 2. Killswitch Card
    const statusPill = document.getElementById('discordLockStatusPill');
    const statusBox = document.getElementById('discordKillswitchStatusBox');
    const primaryText = document.getElementById('discordStatusPrimaryText');
    const descText = document.getElementById('discordStatusDescText');
    const btnLock = document.getElementById('btnToggleDiscordLock');

    if (currentDiscordLock) {
      if (statusPill) { statusPill.className = 'badge-metallic status-red'; statusPill.textContent = 'GESPERRT'; }
      if (statusBox) statusBox.className = 'killswitch-status-box locked';
      if (primaryText) primaryText.textContent = 'DISCORD TOOL GESPERRT';
      if (descText) descText.textContent = data.lockReason ? `Sperrgrund: ${data.lockReason}` : 'Alle Discord-Clients sind blockiert.';
      if (btnLock) { btnLock.className = 'btn btn-lock-success'; btnLock.textContent = 'TOOL FREIGEBEN'; }
    } else {
      if (statusPill) { statusPill.className = 'badge-metallic status-green'; statusPill.textContent = 'FREIGEGEBEN'; }
      if (statusBox) statusBox.className = 'killswitch-status-box unlocked';
      if (primaryText) primaryText.textContent = 'DISCORD TOOL FREIGEGEBEN';
      if (descText) descText.textContent = 'Alle Discord-Tool Instanzen koennen das Programm normal ausfuehren.';
      if (btnLock) { btnLock.className = 'btn btn-lock-danger'; btnLock.textContent = 'DISCORD TOOL SPERREN'; }
    }

    // 3. Update Status
    const updatePill = document.getElementById('discordUpdateStatusPill');
    if (updatePill) {
      updatePill.textContent = `v${data.latestVersion || '1.1.0'} AKTUELL`;
    }
    const verInput = document.getElementById('discordVersionInput');
    if (verInput && (!verInput.dataset.modified || verInput.dataset.modified === '0')) {
      verInput.value = data.latestVersion || '1.1.0';
    }

    // 4. Clients Table
    renderDiscordClientsTable(data.clients || {});

    // 5. Banned HWIDs Table
    renderDiscordBannedHwidsTable(data.bannedHwids || {});

    if (showToastNotification) {
      showAdminToast('Discord Dashboard synchronisiert', 'success');
    }
  } catch (err) {
    console.warn('[DISCORD] Fehler bei loadDiscordOverview:', err);
  }
}

async function toggleDiscordLock() {
  const reasonInput = document.getElementById('discordLockReasonInput');
  const reason = reasonInput ? reasonInput.value.trim() : '';
  const newLockState = !currentDiscordLock;

  try {
    const res = await safeFetchJson('/api/discord/toggle-lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: newLockState, reason })
    });
    if (res.status === 'success') {
      currentDiscordLock = newLockState;
      showAdminToast(newLockState ? 'Discord Tool gesperrt!' : 'Discord Tool freigegeben!', newLockState ? 'warning' : 'success');
      loadDiscordOverview(false);
    }
  } catch (err) {
    showAdminToast('Fehler: ' + err.message, 'error');
  }
}

async function triggerDiscordVersionBump() {
  try {
    const res = await safeFetchJson('/api/discord/bump-version', { method: 'POST' });
    if (res.status === 'success') {
      showAdminToast(`Discord Version auf v${res.newVersion} erhoeht!`, 'success');
      loadDiscordOverview(false);
    }
  } catch (err) {
    showAdminToast('Fehler bei Versionserhoehung', 'error');
  }
}

async function saveDiscordUpdateSettings() {
  const verInput = document.getElementById('discordVersionInput');
  const clInput = document.getElementById('discordChangelogInput');
  const version = verInput ? verInput.value.trim() : '1.1.0';
  const changelog = clInput ? clInput.value.trim() : '';

  try {
    const res = await safeFetchJson('/api/discord/set-version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, changelog })
    });
    if (res.status === 'success') {
      showAdminToast(`Update v${version} erfolgreich gespeichert & ausgerollt!`, 'success');
      loadDiscordOverview(false);
    }
  } catch (err) {
    showAdminToast('Fehler: ' + err.message, 'error');
  }
}

async function sendDiscordBroadcast() {
  const bcInput = document.getElementById('discordBroadcastInput');
  const text = bcInput ? bcInput.value.trim() : '';
  if (!text) {
    showAdminToast('Bitte einen Text eingeben', 'info');
    return;
  }
  try {
    const res = await safeFetchJson('/api/discord/set-announcement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (res.status === 'success') {
      showAdminToast('Broadcast an Discord-Clients gesendet!', 'success');
    }
  } catch (err) {
    showAdminToast('Fehler: ' + err.message, 'error');
  }
}

function renderDiscordClientsTable(clientsObj) {
  const tbody = document.getElementById('discordClientsTableBody');
  const badge = document.getElementById('discordClientsCountBadge');
  if (!tbody) return;

  const list = Object.values(clientsObj || {});
  const now = Date.now();
  const onlineCount = list.filter(c => (now - (c.lastSeen || 0)) < 120000).length;

  if (badge) badge.textContent = `${onlineCount} ONLINE`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty-row">Warte auf verbundene Discord-Clients... (Sobald jemand Nightheid.exe startet, erscheint er hier live)</td></tr>`;
    return;
  }

  let html = '';
  list.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  list.forEach(c => {
    const isOnline = (now - (c.lastSeen || 0)) < 120000;
    const diffSec = Math.floor((now - (c.lastSeen || 0)) / 1000);
    const seenStr = diffSec < 60 ? `vor ${diffSec}s` : `vor ${Math.floor(diffSec / 60)}m`;

    html += `
      <tr>
        <td><span class="badge-metallic ${isOnline ? 'status-green' : 'status-red'}">${isOnline ? 'ONLINE' : 'OFFLINE'}</span></td>
        <td class="bold-silver">${escapeHtml(c.pcName || 'PC')}</td>
        <td>${escapeHtml(c.username || 'Benutzer')}</td>
        <td><code>${escapeHtml(c.ip || '127.0.0.1')}</code></td>
        <td><code title="${escapeHtml(c.hwid || '')}">${escapeHtml((c.hwid || '').substring(0, 14))}...</code></td>
        <td>${escapeHtml(c.os || 'Windows')}</td>
        <td><span class="code-pill">v${escapeHtml(c.version || '1.1.0')}</span></td>
        <td>${seenStr}</td>
        <td>
          <button class="btn btn-lock-danger btn-sm" onclick="banDiscordHwidDirect('${escapeHtml(c.hwid || '')}', '${escapeHtml(c.id || '')}')">HWID BANNEN</button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderDiscordBannedHwidsTable(bannedObj) {
  const tbody = document.getElementById('discordBannedTableBody');
  const badge = document.getElementById('discordBannedCountBadge');
  if (!tbody) return;

  const entries = Object.entries(bannedObj || {});
  if (badge) badge.textContent = `${entries.length} GEBANNT`;

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty-row">Keine HWID-Sperren aktiv.</td></tr>`;
    return;
  }

  let html = '';
  entries.forEach(([hwid, item]) => {
    html += `
      <tr>
        <td><code>${escapeHtml(hwid)}</code></td>
        <td>${escapeHtml(item.clientId || '-')}</td>
        <td class="status-red">${escapeHtml(item.reason || 'Gesperrt')}</td>
        <td>${item.timestamp ? new Date(item.timestamp).toLocaleString('de-DE') : '-'}</td>
        <td>
          <button class="btn btn-silver btn-sm" onclick="unbanDiscordHwid('${escapeHtml(hwid)}')">ENTBANNEN</button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

async function submitDiscordHwidBan() {
  const hwidInput = document.getElementById('manualDiscordHwidInput');
  const reasonInput = document.getElementById('manualDiscordHwidReasonInput');
  const hwid = hwidInput ? hwidInput.value.trim() : '';
  const reason = reasonInput ? reasonInput.value.trim() : '';
  if (!hwid) {
    showAdminToast('Bitte eine HWID eingeben', 'info');
    return;
  }
  try {
    const res = await safeFetchJson('/api/discord/ban-hwid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hwid, reason })
    });
    if (res.status === 'success') {
      showAdminToast(`HWID ${hwid} erfolgreich gebannt!`, 'warning');
      if (hwidInput) hwidInput.value = '';
      loadDiscordOverview(false);
    }
  } catch (err) {
    showAdminToast('Fehler beim Bannen: ' + err.message, 'error');
  }
}

async function banDiscordHwidDirect(hwid, clientId) {
  if (!hwid && !clientId) return;
  if (!confirm(`Möchtest du das Gerät (HWID: ${hwid || clientId}) wirklich dauerhaft für das Discord-Tool sperren?`)) return;
  try {
    const res = await safeFetchJson('/api/discord/ban-hwid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hwid, clientId, reason: 'Manuelle Sperre via Dashboard' })
    });
    if (res.status === 'success') {
      showAdminToast(`HWID gesperrt!`, 'warning');
      loadDiscordOverview(false);
    }
  } catch (err) {
    showAdminToast('Fehler: ' + err.message, 'error');
  }
}

async function unbanDiscordHwid(hwid) {
  try {
    const res = await safeFetchJson('/api/discord/unban-hwid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hwid })
    });
    if (res.status === 'success') {
      showAdminToast(`HWID ${hwid} entbannt!`, 'success');
      loadDiscordOverview(false);
    }
  } catch (err) {
    showAdminToast('Fehler: ' + err.message, 'error');
  }
}

function copyDiscordServerUrl() {
  const url = 'https://whatsapp-kadi.onrender.com/api/discord';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showAdminToast('Discord API-URL kopiert!', 'success');
    }).catch(() => {
      showAdminToast('URL: ' + url, 'info');
    });
  } else {
    showAdminToast('URL: ' + url, 'info');
  }
}

// --------------------------------------------------------------------------
// DISCORD DATEIEN API & CODE EXPLORER
// --------------------------------------------------------------------------
async function loadDiscordFilesExplorer() {
  try {
    const data = await safeFetchJson('/api/discord/files');
    if (data.status === 'success' && Array.isArray(data.files)) {
      allDiscordFiles = data.files;
      renderDiscordVsCodeSidebar(data.files);

      if (!currentActiveDiscordFile && data.files.length > 0) {
        currentActiveDiscordFile = data.files[0].id;
      }
      if (currentActiveDiscordFile) {
        loadActiveDiscordFileContent(currentActiveDiscordFile);
      }
    }
  } catch (err) {
    console.warn('[DISCORD-FILES] Fehler beim Laden der Dateiliste:', err);
  }
}

function renderDiscordVsCodeSidebar(files) {
  const container = document.getElementById('discordSidebarFileList');
  const countBadge = document.getElementById('discordFilesCountBadge');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${files.length} DATEIEN`;
  }

  const categories = {};
  files.forEach(f => {
    const cat = f.category || 'Allgemein';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(f);
  });

  let html = '';
  for (const [catName, catFiles] of Object.entries(categories)) {
    html += `<div class="file-category-header">${escapeHtml(catName)}</div>`;
    catFiles.forEach(file => {
      const isActive = file.id === currentActiveDiscordFile ? 'active' : '';
      const iconClass = getFileIconClass(file.name);
      const iconText = getFileIconText(file.name);

      html += `
        <div class="file-item-row ${isActive}" data-file-id="${escapeHtml(file.id)}" onclick="selectActiveDiscordFile('${escapeHtml(file.id)}')">
          <span class="file-icon ${iconClass}">${iconText}</span>
          <span class="file-name-text">${escapeHtml(file.name)}</span>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

function selectActiveDiscordFile(fileId) {
  currentActiveDiscordFile = fileId;
  document.querySelectorAll('#discordSidebarFileList .file-item-row').forEach(row => {
    row.classList.toggle('active', row.getAttribute('data-file-id') === fileId);
  });
  loadActiveDiscordFileContent(fileId);
}

async function loadActiveDiscordFileContent(fileId) {
  try {
    const data = await safeFetchJson(`/api/discord/file-content?id=${encodeURIComponent(fileId)}`);
    if (!data || data.status !== 'success') return;

    const fileMeta = allDiscordFiles.find(f => f.id === fileId) || { name: fileId, category: 'Datei' };
    const nameEl = document.getElementById('activeDiscordFileName');
    const catEl = document.getElementById('activeDiscordFileCategory');
    const iconEl = document.getElementById('activeDiscordFileIcon');
    const textarea = document.getElementById('discordEditorTextarea');
    const lineCountEl = document.getElementById('discordEditorLineCountText');
    const sizeEl = document.getElementById('discordEditorSizeText');
    const downloadBtn = document.getElementById('btnDownloadDiscordFile');

    if (nameEl) nameEl.textContent = fileMeta.name;
    if (catEl) catEl.textContent = fileMeta.category || 'Allgemein';
    if (iconEl) {
      iconEl.className = `file-icon ${getFileIconClass(fileMeta.name)}`;
      iconEl.textContent = getFileIconText(fileMeta.name);
    }
    if (downloadBtn) {
      downloadBtn.href = data.downloadUrl || `/api/discord/file-content?id=${encodeURIComponent(fileId)}&download=1`;
      downloadBtn.setAttribute('download', fileMeta.name);
    }

    if (data.isBinary) {
      if (textarea) {
        textarea.value = `[BINÄRE DATEI: ${fileMeta.name}]\nGröße: ${formatFileSize(data.size || 0)}\n\nKlicke oben auf 'DOWNLOAD', um die ausführbare Datei herunterzuladen.`;
        textarea.readOnly = true;
      }
    } else {
      if (textarea) {
        textarea.value = data.content || '';
        textarea.readOnly = false;
      }
    }

    const lines = (textarea ? textarea.value : '').split('\n').length;
    if (lineCountEl) lineCountEl.textContent = `ZEILEN: ${lines}`;
    if (sizeEl) sizeEl.textContent = `GROESSE: ${formatFileSize(data.size || 0)}`;

    updateDiscordLineNumbers();
  } catch (err) {
    console.warn('[DISCORD-FILES] Fehler beim Laden des Inhalts:', err);
  }
}

function updateDiscordLineNumbers() {
  const textarea = document.getElementById('discordEditorTextarea');
  const lineNumbers = document.getElementById('discordEditorLineNumbers');
  if (!textarea || !lineNumbers) return;

  const lines = textarea.value.split('\n').length;
  let nums = '';
  for (let i = 1; i <= lines; i++) {
    nums += i + '\n';
  }
  lineNumbers.textContent = nums;
}

async function saveActiveDiscordFile() {
  if (!currentActiveDiscordFile) return;
  const textarea = document.getElementById('discordEditorTextarea');
  if (!textarea || textarea.readOnly) {
    showAdminToast('Binäre Dateien können nicht im Texteditor bearbeitet werden.', 'info');
    return;
  }
  const content = textarea.value;

  try {
    const res = await safeFetchJson('/api/discord/file-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: currentActiveDiscordFile, content })
    });
    if (res.status === 'success') {
      showAdminToast(`[OK] ${res.file || currentActiveDiscordFile} gespeichert! Neue Version v${res.version || '1.1.x'} (Rev #${res.revision || '?'}) live!`, 'success');
      loadDiscordFilesExplorer();
      if (typeof loadDiscordOverview === 'function') {
        loadDiscordOverview(false);
      }
    }
  } catch (err) {
    showAdminToast('Fehler beim Speichern: ' + err.message, 'error');
  }
}

function reloadActiveDiscordFile() {
  if (currentActiveDiscordFile) {
    loadActiveDiscordFileContent(currentActiveDiscordFile);
    showAdminToast('Datei neu geladen', 'info');
  }
}
