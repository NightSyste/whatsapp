// ==========================================================================
// NIGHT-SYSTEM - ADMIN CONTROL CENTER CONTROLLER
// Dunkles Blau-Silber Theme | Killswitch | VS Code Datei-API
// ==========================================================================

let currentTab = 'view-dashboard';
let currentGlobalLock = false;
let currentActiveFile = 'server.js';
let allManagedFiles = [];
let adminPollTimer = null;

// ==========================================================================
// Initialisierung
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initAdminDashboard();
  setupEditorKeyboardShortcuts();
});

async function initAdminDashboard() {
  await loadAdminOverview();
  await loadFilesExplorer();
  
  // Dashboard im Hintergrund alle 3 Sekunden aktualisieren
  adminPollTimer = setInterval(() => {
    if (currentTab === 'view-dashboard') {
      loadAdminOverview(false);
    }
  }, 3000);
}

// ==========================================================================
// Tab-Navigation (Dashboard vs. Dateien API)
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
  }

  const targetSection = document.getElementById(tabId);
  if (targetSection) targetSection.classList.add('active');
}

// ==========================================================================
// TAB 1: DASHBOARD LOGIK (KILLSWITCH, ANKÜNDIGUNG, INSTANZEN)
// ==========================================================================
async function loadAdminOverview(showToastNotification = false) {
  try {
    const res = await fetch('/api/admin/overview');
    const data = await res.json();
    if (data.status !== 'success') return;

    currentGlobalLock = Boolean(data.globalLock);

    // 1. Header Badges
    const platBadge = document.getElementById('headerPlatformBadge');
    const headLockBadge = document.getElementById('headerLockBadge');
    const headClientsBadge = document.getElementById('headerClientsBadge');

    if (platBadge) {
      platBadge.textContent = data.isCloud ? `RENDER CLOUD (${data.platform})` : `LOKAL (${data.platform})`;
    }
    if (headClientsBadge) {
      headClientsBadge.textContent = `${(data.activeClients || []).length} ONLINE`;
    }

    // 2. Killswitch Card UI
    const statusBox = document.getElementById('killswitchStatusBox');
    const primaryText = document.getElementById('statusPrimaryText');
    const descText = document.getElementById('statusDescText');
    const lockPill = document.getElementById('lockStatusPill');
    const toggleBtn = document.getElementById('btnToggleLock');
    const reasonInput = document.getElementById('lockReasonInput');

    if (currentGlobalLock) {
      // Tool ist GESPERRT
      if (headLockBadge) {
        headLockBadge.textContent = '[TOOL GLOBAL GESPERRT]';
        headLockBadge.className = 'badge-metallic status-red';
      }
      if (lockPill) {
        lockPill.textContent = 'GLOBAL GESPERRT';
        lockPill.className = 'badge-metallic status-red';
      }
      if (statusBox) {
        statusBox.className = 'killswitch-status-box locked';
      }
      if (primaryText) primaryText.textContent = 'Tool ist aktuell GLOBAL GESPERRT';
      if (descText) descText.textContent = `Wartungsmodus aktiv. Grund: "${data.lockReason || 'Kein Grund angegeben'}"`;
      
      // Knopf bietet ENTSPERREN an
      if (toggleBtn) {
        toggleBtn.className = 'btn btn-lock-success';
        toggleBtn.innerHTML = '<span>🔓</span> Tool für alle ENTSPERREN';
      }
    } else {
      // Tool ist FREIGEGEBEN
      if (headLockBadge) {
        headLockBadge.textContent = '[TOOL FREIGEGEBEN]';
        headLockBadge.className = 'badge-metallic status-green';
      }
      if (lockPill) {
        lockPill.textContent = 'FREIGEGEBEN';
        lockPill.className = 'badge-metallic status-green';
      }
      if (statusBox) {
        statusBox.className = 'killswitch-status-box unlocked';
      }
      if (primaryText) primaryText.textContent = 'Tool ist aktuell freigegeben';
      if (descText) descText.textContent = 'Alle weltweiten Instanzen können das Tool normal nutzen.';
      
      // Knopf bietet SPERREN an
      if (toggleBtn) {
        toggleBtn.className = 'btn btn-lock-danger';
        toggleBtn.innerHTML = '<span>🔒</span> Tool jetzt für alle SPERREN';
      }
    }

    // Grund-Eingabe nicht überschreiben, falls der Admin gerade tippt
    if (reasonInput && data.lockReason && !reasonInput.matches(':focus')) {
      reasonInput.value = data.lockReason;
    }

    // 3. Ankündigung
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

    // 4. Verbundene Clients & Telemetrie-Tabelle
    const clientsCount = document.getElementById('clientsTableCount');
    if (clientsCount) {
      clientsCount.textContent = `${(data.activeClients || []).length} Online`;
    }
    renderClientsTable(data.activeClients || []);

    if (showToastNotification) {
      showAdminToast('Dashboard-Daten aktualisiert', 'info');
    }
  } catch (err) {
    console.warn('[ADMIN] Fehler beim Laden des Overviews:', err);
  }
}

async function toggleToolLock() {
  const targetState = !currentGlobalLock;
  const reasonInput = document.getElementById('lockReasonInput');
  const reason = reasonInput ? reasonInput.value.trim() : '';

  try {
    const res = await fetch('/api/admin/toggle-lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: targetState, reason })
    });
    const data = await res.json();
    if (data.status === 'success') {
      const msg = targetState 
        ? 'Tool wurde weltweit für alle Nutzer GESPERRT!' 
        : 'Tool wurde für alle Nutzer ENTSPERRT & FREIGEGEBEN!';
      showAdminToast(msg, targetState ? 'error' : 'success');
      await loadAdminOverview();
    } else {
      showAdminToast(data.error || 'Fehler beim Umschalten', 'error');
    }
  } catch (err) {
    showAdminToast('Netzwerkfehler: ' + err.message, 'error');
  }
}

async function publishAnnouncement() {
  const input = document.getElementById('announcementInput');
  const text = input ? input.value.trim() : '';
  const radio = document.querySelector('input[name="announcementType"]:checked');
  const type = radio ? radio.value : 'info';

  if (!text) {
    showAdminToast('Bitte einen Ankündigungstext eingeben!', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/set-announcement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, type })
    });
    const data = await res.json();
    if (data.status === 'success') {
      showAdminToast('Ankündigung erfolgreich an alle Instanzen gesendet!', 'success');
      loadAdminOverview();
    } else {
      showAdminToast(data.error || 'Fehler beim Senden', 'error');
    }
  } catch (err) {
    showAdminToast('Netzwerkfehler: ' + err.message, 'error');
  }
}

async function clearAnnouncement() {
  try {
    const res = await fetch('/api/admin/set-announcement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '', type: 'info' })
    });
    const data = await res.json();
    if (data.status === 'success') {
      const input = document.getElementById('announcementInput');
      if (input) input.value = '';
      showAdminToast('Ankündigung entfernt', 'info');
      loadAdminOverview();
    }
  } catch (err) {
    showAdminToast('Netzwerkfehler: ' + err.message, 'error');
  }
}

function renderClientsTable(clients) {
  const tbody = document.getElementById('clientsTableBody');
  if (!tbody) return;

  if (!clients || clients.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="table-empty-row">
          Keine Clients online. Sobald ein Nutzer das Tool startet, erscheint er hier in Echtzeit.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = clients.map(c => {
    const ago = c.lastSeenAgo <= 5 ? 'Gerade eben' : `vor ${c.lastSeenAgo}s`;
    return `
      <tr>
        <td>
          <span class="client-status-pill">
            <span class="client-status-dot"></span> Online
          </span>
        </td>
        <td><span class="code-pill">${escapeHtml(c.id)}</span></td>
        <td><strong style="color: #f1f5f9;">${escapeHtml(c.os)}</strong></td>
        <td><span class="code-pill">v${escapeHtml(c.version)}</span></td>
        <td style="color: var(--silver-400);">${ago}</td>
      </tr>
    `;
  }).join('');
}

// ==========================================================================
// TAB 2: DATEIEN API (VISUAL STUDIO CODE STYLE FILE EXPLORER & EDITOR)
// ==========================================================================
async function loadFilesExplorer() {
  try {
    const res = await fetch('/api/system/files');
    const data = await res.json();
    if (data.status === 'success' && Array.isArray(data.files)) {
      allManagedFiles = data.files;
      renderVsCodeSidebar(data.files);

      // Erste Datei laden falls noch nichts geladen
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
    countBadge.textContent = `${files.length} Dateien`;
  }

  // Gruppiere nach Kategorie
  const categories = {};
  files.forEach(f => {
    const cat = f.category || 'Allgemein';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(f);
  });

  let html = '';
  for (const [catName, catFiles] of Object.entries(categories)) {
    html += `<div class="tree-category-title">&#x1F4C2; ${escapeHtml(catName)}</div>`;
    catFiles.forEach(file => {
      const isActive = file.id === currentActiveFile ? ' active' : '';
      const iconClass = getFileIconClass(file.name);
      const iconText = getFileIconText(file.name);
      const sizeStr = formatFileSize(file.size);

      html += `
        <button class="tree-file-item${isActive}" onclick="selectActiveFile('${escapeHtml(file.id)}')">
          <span class="file-icon ${iconClass}">${iconText}</span>
          <span class="tree-file-name" title="${escapeHtml(file.description || file.name)}">${escapeHtml(file.name)}</span>
          <span class="tree-file-size">${sizeStr}</span>
        </button>
      `;
    });
  }

  container.innerHTML = html;
}

function getFileIconClass(filename) {
  const fn = (filename || '').toLowerCase();
  if (fn.endsWith('.json')) return 'icon-json';
  if (fn.endsWith('.js')) return 'icon-js';
  if (fn.endsWith('.html')) return 'icon-html';
  if (fn.endsWith('.css')) return 'icon-css';
  if (fn.endsWith('.cs')) return 'icon-cs';
  if (fn.endsWith('.csproj') || fn.endsWith('.xml')) return 'icon-cs';
  if (fn.endsWith('.md')) return 'icon-md';
  if (fn.endsWith('.yaml') || fn.endsWith('.yml')) return 'icon-yaml';
  if (fn.includes('docker')) return 'icon-docker';
  return 'icon-md';
}

function getFileIconText(filename) {
  const fn = (filename || '').toLowerCase();
  if (fn.endsWith('.json')) return '{}';
  if (fn.endsWith('.js')) return 'JS';
  if (fn.endsWith('.html')) return '<>';
  if (fn.endsWith('.css')) return '#';
  if (fn.endsWith('.cs')) return 'C#';
  if (fn.endsWith('.csproj')) return 'PRJ';
  if (fn.endsWith('.md')) return 'MD';
  if (fn.endsWith('.yaml') || fn.endsWith('.yml')) return 'YML';
  if (fn.includes('docker')) return 'DOC';
  return 'TXT';
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function selectActiveFile(fileId) {
  currentActiveFile = fileId;
  renderVsCodeSidebar(allManagedFiles);
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
  if (sizeEl) sizeEl.textContent = `Größe: ${formatFileSize(fileMeta.size)}`;

  try {
    const res = await fetch(`/api/system/file-content?file=${encodeURIComponent(fileId)}`);
    const data = await res.json();
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
    showAdminToast('Netzwerkfehler: ' + err.message, 'error');
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

  if (!validateCurrentSyntax()) {
    showAdminToast('Achtung: Syntaxfehler entdeckt! Bitte vor dem Speichern korrigieren.', 'error');
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span>⏳</span> Speichere &amp; wende an...';
  }

  try {
    const res = await fetch('/api/system/file-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: currentActiveFile, content })
    });
    const data = await res.json();

    if (data.status === 'success') {
      showAdminToast(`${currentActiveFile} gespeichert & sofort live aktiv (Rev #${data.revision || 1})!`, 'success');
      
      const revText = document.getElementById('editorUpdateRevisionText');
      if (revText && data.revision) {
        revText.textContent = `Update-Revision: #${data.revision}`;
      }

      await loadFilesExplorer();
    } else {
      showAdminToast(data.error || 'Fehler beim Speichern', 'error');
    }
  } catch (err) {
    showAdminToast('Netzwerkfehler: ' + err.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span>💾</span> Speichern &amp; Live anwenden';
    }
  }
}

// ==========================================================================
// EDITOR ZEILENNUMMERN, SYNTAX & SHORTCUTS
// ==========================================================================
function updateEditorLineNumbers() {
  const textarea = document.getElementById('editorTextarea');
  const lineNumbers = document.getElementById('editorLineNumbers');
  const lineCountText = document.getElementById('editorLineCountText');
  if (!textarea || !lineNumbers) return;

  const lines = textarea.value.split('\n').length;
  let numbersHtml = '';
  for (let i = 1; i <= lines; i++) {
    numbersHtml += i + '<br>';
  }
  lineNumbers.innerHTML = numbersHtml;

  if (lineCountText) {
    lineCountText.textContent = `Zeilen: ${lines}`;
  }
}

function validateCurrentSyntax() {
  const textarea = document.getElementById('editorTextarea');
  const badge = document.getElementById('activeSyntaxBadge');
  if (!textarea || !badge) return true;

  const fn = (currentActiveFile || '').toLowerCase();

  if (fn.endsWith('.json')) {
    try {
      JSON.parse(textarea.value);
      badge.textContent = '[SYNTAX: GÜLTIG]';
      badge.className = 'badge-metallic status-green';
      return true;
    } catch (e) {
      badge.textContent = '[SYNTAXFEHLER]';
      badge.className = 'badge-metallic status-red';
      return false;
    }
  }

  if (fn.endsWith('.js')) {
    try {
      new Function(textarea.value);
      badge.textContent = '[SYNTAX: GÜLTIG]';
      badge.className = 'badge-metallic status-green';
      return true;
    } catch (e) {
      badge.textContent = '[SYNTAXFEHLER]';
      badge.className = 'badge-metallic status-red';
      return false;
    }
  }

  badge.textContent = '[SYNTAX: GÜLTIG]';
  badge.className = 'badge-metallic status-green';
  return true;
}

function setupEditorKeyboardShortcuts() {
  const textarea = document.getElementById('editorTextarea');
  const lineNumbers = document.getElementById('editorLineNumbers');
  if (!textarea) return;

  // Scroll Sync
  textarea.addEventListener('scroll', () => {
    if (lineNumbers) {
      lineNumbers.scrollTop = textarea.scrollTop;
    }
  });

  // Input & Zeilenaktualisierung
  textarea.addEventListener('input', () => {
    updateEditorLineNumbers();
    validateCurrentSyntax();
  });

  // Tab & Speichern-Shortcuts
  textarea.addEventListener('keydown', (e) => {
    // Ctrl+S / Cmd+S: Direkt speichern
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveActiveFile();
      return;
    }

    // Tab-Taste: 2 Leerzeichen einfügen statt Fokus zu verlieren
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
// TOAST NOTIFICATIONS
// ==========================================================================
let toastTimer = null;
function showAdminToast(msg, type = 'success') {
  const toast = document.getElementById('adminToast');
  const icon = document.getElementById('toastIcon');
  const text = document.getElementById('toastMessage');
  if (!toast) return;

  if (text) text.textContent = msg;
  if (icon) {
    if (type === 'success') icon.textContent = '✔';
    else if (type === 'error') icon.textContent = '✖';
    else icon.textContent = 'ℹ';
  }

  toast.className = `admin-toast ${type}`;
  toast.style.display = 'flex';

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.display = 'none';
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
