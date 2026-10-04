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
  
  // Dashboard alle 4 Sekunden im Hintergrund synchronisieren
  adminPollTimer = setInterval(() => {
    if (currentTab === 'view-dashboard' || currentTab === 'view-features') {
      loadAdminOverview(false).catch(() => {});
    }
  }, 4000);
}

// ==========================================================================
// Tab-Navigation (Dashboard vs. Dateien API vs. Remote Features)
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
    updateFeatureTargetSelect(data.activeClients || []);

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
        <td colspan="7" class="table-empty-row">
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
    const isAllowed = c.allowed !== false;
    const hasPendingStart = c.pendingCommand === 'start_app';

    const clientVer = c.version ? c.version.replace(/^v/i, '') : '1.0.0';
    const latestVer = (latestAdminVersion ? latestAdminVersion.replace(/^v/i, '') : '1.0.0');
    const isLatest = clientVer === latestVer;
    const versionBadgeHtml = isLatest
      ? `<span class="code-pill status-green-pill">v${escapeHtml(clientVer)} [AKTUELL]</span>`
      : `<span class="code-pill status-yellow-pill" title="Update v${latestVer} verfuegbar">v${escapeHtml(clientVer)} [UPDATE BEREIT]</span>`;

    return `
      <tr>
        <td>
          <span class="client-status-pill">
            <span class="client-status-dot"></span> ONLINE
          </span>
        </td>
        <td><span class="code-pill bold-silver">${escapeHtml(pcName)}</span></td>
        <td><span class="user-pill">${escapeHtml(user)}</span></td>
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
// TAB 3: REMOTE FEATURES & TROLL CONTROLLER (40 FEATURES)
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
      saveBtn.textContent = 'SPEICHERN';
    }
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
