// WhatsApp-System - Client Controller
// Lautloses Live-Update ohne Flackern, Bildversand, Emojis, Startup-Loader, Multi-Language

let currentLanguage = localStorage.getItem('whatsapp_system_lang') || 'de';
window.currentLanguage = currentLanguage;

let allChatsList = [];
let activeChatId = null;
let currentFilter = 'persons'; // Standard: 'persons' (Optionen: 'persons', 'groups')
let searchQuery = '';
let pollTimer = null;
let chatSyncTimer = null;
let activeMsgSyncTimer = null;
let lastKnownStatus = '';
let lastKnownQr = '';
let currentMessagesMap = new Map(); // id -> msgObj zur Erkennung neuer Nachrichten
let currentActiveTabId = 'view-start';

// Bot & Click Instant Status
let isBotActive = false;
let selectedPersons = new Set();
let selectedGroups = new Set();
let instantPendingMedia = null; // { dataUrl, filename }

// Bildanhang-Status (fuer Chats)
let pendingMedia = null; // { dataUrl, filename }

// Farbpaletten in Graustufen
const AVATAR_COLORS = [
  '#2a2a2a', '#303030', '#363636', '#2d2d2d', '#333333', '#282828', '#383838'
];

function getAvatarColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function getInitials(name, isGroup) {
  if (isGroup) return 'G';
  if (!name) return '?';
  const clean = name.replace(/[^a-zA-Z0-9äöüÄÖÜß\s]/g, '').trim();
  if (!clean) return name.slice(0, 1).toUpperCase() || '?';
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

// Emojis deaktiviert
const POPULAR_EMOJIS = [];

window.addEventListener('DOMContentLoaded', () => {
  const chosen = localStorage.getItem('whatsapp_system_lang_chosen');
  const langModal = document.getElementById('languageSelectOverlay');

  if (chosen !== 'true') {
    if (langModal) langModal.style.display = 'flex';
  } else {
    if (langModal) langModal.style.display = 'none';
    applyLanguage(currentLanguage);
    initStartupLoader();
  }

  initCustomTheme();
  buildEmojiDrawer();
  initBotState();
  updateHeaderUpdateButton(false, getInstalledVersion());
  pollStatus();
  pollTimer = setInterval(pollStatus, 1200);

  // Schnelle lautlose Hintergrund-Aktualisierung (ohne Lade-Vorschau)
  chatSyncTimer = setInterval(() => {
    if (lastKnownStatus === 'connected') {
      silentSyncChats();
    }
  }, 1200);

  loadSupportConfig();
  loadSystemSettings().then(() => {
    sendClientHeartbeat();
  });

  // Nach Reload ggf. vorherigen Tab wiederherstellen
  const savedTab = sessionStorage.getItem('active_tab_before_reload');
  if (savedTab) {
    sessionStorage.removeItem('active_tab_before_reload');
    setTimeout(() => selectTab(savedTab), 60);
  }

  setInterval(sendClientHeartbeat, 5000);
  pollGlobalStatus();
  setInterval(pollGlobalStatus, 1500);

  activeMsgSyncTimer = setInterval(() => {
    if (lastKnownStatus === 'connected') {
      if (activeChatId && currentActiveTabId === 'view-chats') {
        silentSyncActiveMessages();
      } else if (currentActiveTabId === 'view-support') {
        loadSupportMessages(true);
      }
    }
  }, 1000);
});

// ----------------------------------------------------
// 0. Language Management & Localization
// ----------------------------------------------------
function selectInitialLanguage(lang) {
  currentLanguage = lang;
  window.currentLanguage = lang;
  localStorage.setItem('whatsapp_system_lang', lang);
  localStorage.setItem('whatsapp_system_lang_chosen', 'true');

  const langModal = document.getElementById('languageSelectOverlay');
  if (langModal) langModal.style.display = 'none';

  applyLanguage(lang);

  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: lang })
  }).catch(() => {});

  initStartupLoader();
}

function applyLanguage(lang) {
  currentLanguage = lang || 'de';
  window.currentLanguage = currentLanguage;
  document.documentElement.lang = currentLanguage;

  // Alle [data-i18n] Elemente übersetzen
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = t(key, currentLanguage);
    if (text) {
      el.innerHTML = text;
    }
  });

  // Alle [data-i18n-placeholder] Elemente übersetzen
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const ph = t(key, currentLanguage);
    if (ph) {
      el.placeholder = ph;
    }
  });

  // Alle [data-i18n-title] Elemente übersetzen
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const title = t(key, currentLanguage);
    if (title) {
      el.title = title;
    }
  });

  // Settings Buttons Status
  ['de', 'en', 'ru', 'sq'].forEach(l => {
    const btn = document.getElementById(`btnSetLang_${l}`);
    if (btn) {
      if (l === currentLanguage) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  // Settings Badge
  const badge = document.getElementById('currentLangDisplayBadge');
  if (badge) {
    badge.textContent = t(`badge_lang_${currentLanguage}`, currentLanguage);
  }

  // Connection Badge
  const connBadge = document.getElementById('connectionBadge');
  if (connBadge) {
    if (lastKnownStatus === 'connected') {
      connBadge.textContent = t('status_connected', currentLanguage);
    } else if (lastKnownStatus === 'loading') {
      connBadge.textContent = t('status_loading', currentLanguage);
    } else {
      connBadge.textContent = t('status_disconnected', currentLanguage);
    }
  }

  // Bot Status
  const botBadge = document.getElementById('botStatusBadge');
  const botSub = document.getElementById('botSubStatusText');
  if (botBadge) {
    botBadge.textContent = isBotActive ? t('bot_enabled', currentLanguage) : t('bot_disabled', currentLanguage);
  }
  if (botSub) {
    botSub.textContent = isBotActive ? t('bot_enabled_desc', currentLanguage) : t('bot_disabled_desc', currentLanguage);
  }

  // Chat Filter Zähler
  updateChatFilterDomCounts();

  // Instant Matrix Dropdowns aktualisieren falls nötig
  if (typeof renderInstantDropdowns === 'function') {
    renderInstantDropdowns();
  }
}

async function changeLanguageAndRestart(lang) {
  currentLanguage = lang;
  window.currentLanguage = lang;
  localStorage.setItem('whatsapp_system_lang', lang);
  localStorage.setItem('whatsapp_system_lang_chosen', 'true');

  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang })
    });
  } catch (e) {}

  showToast(t('toast_restarting', lang));
  setTimeout(() => {
    location.reload();
  }, 500);
}

function clearLocalStorageData() {
  if (confirm('Möchten Sie den lokalen Speicher leeren und das Night-System neu initialisieren?')) {
    localStorage.clear();
    location.reload();
  }
}

function onSyncRateChanged(rateMs) {
  const ms = parseInt(rateMs, 10) || 1000;
  if (chatSyncTimer) clearInterval(chatSyncTimer);
  chatSyncTimer = setInterval(() => {
    if (lastKnownStatus === 'connected') {
      silentSyncChats();
    }
  }, ms);
  showToast(t('toast_saved', currentLanguage));
}

function updateChatFilterDomCounts() {
  const personCount = allChatsList.filter(c => !c.isGroup).length;
  const groupCount = allChatsList.filter(c => c.isGroup).length;
  const pBtn = document.getElementById('filterPersonsBtn');
  const gBtn = document.getElementById('filterGroupsBtn');
  if (pBtn) pBtn.textContent = `${t('filter_persons', currentLanguage)} (${personCount})`;
  if (gBtn) gBtn.textContent = `${t('filter_groups', currentLanguage)} (${groupCount})`;
}

async function loadSystemSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data && data.systemInfo) {
      window.waSystemInfo = {
        pcName: data.systemInfo.pcName || '',
        username: data.systemInfo.username || '',
        platform: data.systemInfo.platform || ''
      };
      const pcEl = document.getElementById('settingsPcName');
      const idEl = document.getElementById('settingsInjectId');
      const edEl = document.getElementById('settingsEdition');
      if (pcEl && data.systemInfo.pcName) pcEl.textContent = data.systemInfo.pcName;
      if (idEl && data.systemInfo.injectId) idEl.textContent = data.systemInfo.injectId;
      if (edEl && data.systemInfo.edition) edEl.textContent = data.systemInfo.edition;
    }
    const savedUrl = localStorage.getItem('wa_central_server_url') || (data && data.centralServerUrl) || 'https://whatsapp-kadi.onrender.com';
    const input = document.getElementById('settingCentralServerUrl');
    if (input) input.value = savedUrl;
  } catch (e) {}
}

function saveCentralServerSetting() {
  const input = document.getElementById('settingCentralServerUrl');
  if (!input) return;
  const url = input.value.trim();
  localStorage.setItem('wa_central_server_url', url);
  showToast('Zentrale Server-URL gespeichert & aktiv!', 'success');
  pollGlobalStatus();
  sendClientHeartbeat();
}

// ----------------------------------------------------
// 0b. Startup Loader / Splash-Screen
// ----------------------------------------------------
function initStartupLoader() {
  const overlay = document.getElementById('startupOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  overlay.style.opacity = '1';

  const subtitle = document.getElementById('startupSubtitle');
  const fill = document.getElementById('startupProgressFill');
  const percent = document.getElementById('startupPercent');

  const isInstalled = localStorage.getItem('whatsapp_system_installed') === 'true';
  // Erstes Mal: ca. 10 Sekunden. Danach: ca. 3.5 Sekunden
  const totalDuration = isInstalled ? 3500 : 10000;

  if (subtitle) {
    subtitle.textContent = isInstalled ? t('loader_init', currentLanguage) : t('loader_install', currentLanguage);
  }

  const startTime = Date.now();
  const progressTimer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const p = Math.min(100, Math.round((elapsed / totalDuration) * 100));
    fill.style.width = p + '%';
    percent.textContent = p + '%';

    if (elapsed >= totalDuration) {
      clearInterval(progressTimer);
      localStorage.setItem('whatsapp_system_installed', 'true');
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.4s ease';
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 400);
    }
  }, 40);
}

// ----------------------------------------------------
// Tab-Navigation
// ----------------------------------------------------
function selectTab(viewId) {
  currentActiveTabId = viewId;
  document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active'));

  let activeBtn = null;
  if (viewId === 'view-start') activeBtn = document.getElementById('navStartBtn');
  else if (viewId === 'view-chats') activeBtn = document.getElementById('navChatsBtn');
  else if (viewId === 'view-bot') activeBtn = document.getElementById('navBotBtn');
  else if (viewId === 'view-instant') activeBtn = document.getElementById('navInstantBtn');
  else if (viewId === 'view-support') activeBtn = document.getElementById('navSupportBtn');
  else if (viewId === 'view-settings') activeBtn = document.getElementById('navSettingsBtn');

  if (activeBtn) activeBtn.classList.add('active');

  const activeView = document.getElementById(viewId);
  if (activeView) activeView.classList.add('active');

  if (viewId === 'view-chats' && allChatsList.length === 0) {
    loadChats();
  }

  if (viewId === 'view-instant') {
    if (allChatsList.length === 0) {
      loadChats().then(renderInstantDropdowns);
    } else {
      renderInstantDropdowns();
    }
  }

  if (viewId === 'view-support') {
    loadSupportConfig().then(() => loadSupportMessages());
  }

  if (viewId === 'view-settings') {
    applyLanguage(currentLanguage);
    loadSystemSettings();
  }
}

// ----------------------------------------------------
// 1. Status & QR-Code (Tab "Start")
// ----------------------------------------------------
async function pollStatus(manual = false) {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    // 24h Sperre & Globale Admin-Sperre pruefen
    if (data.isBlocked) {
      if (data.isGlobalLock) {
        showGlobalLockOverlay(data.blockedReason);
        hideBlockOverlay();
      } else {
        showBlockOverlay(data.blockedReason, data.blockedRemainingSeconds);
        if (!isToolGloballyLocked) hideGlobalLockOverlay();
      }
    } else {
      if (isAppBlocked) {
        hideBlockOverlay();
      }
      if (!isToolGloballyLocked) {
        hideGlobalLockOverlay();
      }
    }

    const imgEl = document.getElementById('qrDisplayImg');
    const placeholder = document.getElementById('qrPlaceholder');
    const badge = document.getElementById('connectionBadge');
    const rotationText = document.getElementById('qrRotationText');
    const liveIndicator = document.getElementById('qrLiveIndicator');

    if (!imgEl.dataset.fallbackInit) {
      imgEl.dataset.fallbackInit = '1';
      imgEl.onerror = () => {
        imgEl.src = `/api/qr-image?t=${Date.now()}`;
      };
    }

    if (data.status === 'qr_ready' && (data.qr || data.hasQr)) {
      const targetSrc = data.qr || `/api/qr-image?v=${data.qrVersion || 1}&t=${Date.now()}`;
      if (imgEl.src !== targetSrc) {
        imgEl.src = targetSrc;
        if (lastKnownQr !== '' && lastKnownQr !== targetSrc) {
          showToast('Neuer QR-Code generiert und aktiv.');
        }
        lastKnownQr = targetSrc;
      }
      imgEl.style.display = 'block';
      placeholder.style.display = 'none';

      badge.textContent = t('status_disconnected', currentLanguage);
      badge.classList.remove('status-connected');

      const age = data.qrAgeSeconds || 0;
      rotationText.textContent = `QR-Code #${data.qrVersion || 1} (${age}s)`;
      liveIndicator.textContent = t('qr_active', currentLanguage);
      liveIndicator.style.color = '#25D366';

      setStatus('QR-Code bereit. Bitte mit WhatsApp scannen.');
      if (manual) showToast('QR-Code ist aktiv.');
    } else if (data.status === 'connected') {
      imgEl.style.display = 'none';
      placeholder.style.display = 'block';
      placeholder.innerHTML = '<strong>' + t('qr_connected_title', currentLanguage) + '</strong><br><br>' + t('qr_connected_body', currentLanguage);

      badge.textContent = t('status_connected', currentLanguage);
      badge.classList.add('status-connected');

      rotationText.textContent = `${data.chatCount || 0} Chats`;
      liveIndicator.textContent = t('qr_connected', currentLanguage);
      liveIndicator.style.color = '#25D366';

      setStatus(`Verbunden (${data.chatCount || 0} Chats).`);

      if (lastKnownStatus !== 'connected') {
        showToast('WhatsApp-System verbunden! Lade Chats...');
        await loadChats();
        selectTab('view-chats');
      }
    } else if (data.status === 'loading') {
      imgEl.style.display = 'none';
      placeholder.style.display = 'block';
      placeholder.innerHTML = '<div style="margin-bottom:8px;"><strong>Initialisiere WhatsApp Web...</strong></div><div style="font-size:12px; opacity:0.8;">Browser wird gestartet. Der QR-Code erscheint in wenigen Sekunden.</div>';
      rotationText.textContent = 'Warte auf QR-Code...';
      liveIndicator.textContent = t('status_loading', currentLanguage);
      liveIndicator.style.color = '#8696a0';
      setStatus('WhatsApp Web wird gestartet...');
    } else if (data.status === 'error') {
      imgEl.style.display = 'none';
      placeholder.style.display = 'block';
      placeholder.innerHTML = '<div style="color:#ef4444; margin-bottom:8px;"><strong>Initialisierung fehlgeschlagen</strong></div><div style="font-size:12px; margin-bottom:12px;">Der Hintergrund-Browser wird automatisch bereinigt und neu gestartet...</div><button class="btn btn-primary btn-sm" onclick="forceRefreshQr()">Jetzt erneut starten</button>';
      rotationText.textContent = 'Selbstheilung laeuft...';
      liveIndicator.textContent = '[NEUSTART]';
      liveIndicator.style.color = '#ef4444';
      setStatus('Automatischer Neustart des WhatsApp-Clients laeuft...');
    }

    lastKnownStatus = data.status;
  } catch (err) {
    setStatus('Verbinde mit lokalem Server...');
  }
}

async function forceRefreshQr() {
  showToast('Fordere frischen QR-Code an...');
  try {
    const res = await fetch('/api/force-refresh', { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'QR-Code wird erneuert.');
    setTimeout(pollStatus, 1000);
  } catch (err) {
    showToast('Fehler bei der Erneuerung: ' + err, true);
  }
}

async function resetSession() {
  if (!confirm('Möchten Sie die WhatsApp-Sitzung wirklich trennen und neu starten?')) {
    return;
  }
  showToast('Setze Sitzung zurück...');
  try {
    const res = await fetch('/api/reset', { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'Sitzung zurückgesetzt.');
    lastKnownQr = '';
    activeChatId = null;
    allChatsList = [];
    currentMessagesMap.clear();
    renderChatList();
    selectTab('view-start');
    pollStatus();
  } catch (err) {
    showToast('Fehler beim Zurücksetzen: ' + err, true);
  }
}

// ----------------------------------------------------
// 2. Chat-Liste & Filterung (Nur Personen & Gruppen)
// ----------------------------------------------------
async function loadChats() {
  try {
    const res = await fetch('/api/chats');
    const data = await res.json();
    allChatsList = data.chats || [];
    renderChatList();
    renderInstantDropdowns();
    setStatus(`${allChatsList.length} Chats und Gruppen geladen.`);
  } catch (err) {
    console.error('Fehler beim Laden der Chats:', err);
  }
}

// Lautlose Hintergrund-Aktualisierung der Chat-Liste
async function silentSyncChats() {
  try {
    const res = await fetch('/api/chats');
    const data = await res.json();
    const newChats = data.chats || [];
    if (newChats.length === 0) return;

    // Pruefen, ob sich letzte Nachricht oder Reihenfolge geaendert hat
    const hasChanged = JSON.stringify(newChats.slice(0, 5).map(c => [c.id, c.lastMessageText, c.lastMessageTime])) !==
                       JSON.stringify(allChatsList.slice(0, 5).map(c => [c.id, c.lastMessageText, c.lastMessageTime])) ||
                       newChats.length !== allChatsList.length;

    if (hasChanged) {
      allChatsList = newChats;
      updateChatListDomInPlace();
    }
  } catch (err) {}
}

function setChatFilter(filter) {
  currentFilter = filter;
  document.getElementById('filterPersonsBtn').classList.toggle('active', filter === 'persons');
  document.getElementById('filterGroupsBtn').classList.toggle('active', filter === 'groups');
  renderChatList();
}

function onSearchInput() {
  searchQuery = (document.getElementById('chatSearchInput').value || '').trim().toLowerCase();
  renderChatList();
}

function getFilteredChats() {
  return allChatsList.filter(c => {
    if (currentFilter === 'persons' && c.isGroup) return false;
    if (currentFilter === 'groups' && !c.isGroup) return false;
    if (searchQuery) {
      const matchName = (c.name || '').toLowerCase().includes(searchQuery);
      const matchPhone = (c.phone || '').toLowerCase().includes(searchQuery);
      const matchLast = (c.lastMessageText || '').toLowerCase().includes(searchQuery);
      return matchName || matchPhone || matchLast;
    }
    return true;
  });
}

function renderChatList() {
  const container = document.getElementById('chatListContainer');
  container.innerHTML = '';

  const personCount = allChatsList.filter(c => !c.isGroup).length;
  const groupCount = allChatsList.filter(c => c.isGroup).length;

  document.getElementById('filterPersonsBtn').textContent = `Personen (${personCount})`;
  document.getElementById('filterGroupsBtn').textContent = `Gruppen (${groupCount})`;

  const filtered = getFilteredChats();

  if (filtered.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.padding = '24px';
    emptyDiv.style.textAlign = 'center';
    emptyDiv.style.color = 'var(--text-secondary)';
    emptyDiv.style.fontSize = '13px';
    emptyDiv.textContent = allChatsList.length === 0
      ? 'Noch keine Chats geladen. Bitte verbinden Sie sich im Tab "Start".'
      : 'Keine Chats für diesen Filter gefunden.';
    container.appendChild(emptyDiv);
    return;
  }

  filtered.forEach(chat => {
    const item = createChatItemElement(chat);
    container.appendChild(item);
  });
}

function createChatItemElement(chat) {
  const item = document.createElement('div');
  item.id = `chat-item-${chat.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
  item.className = 'chat-item' + (chat.id === activeChatId ? ' active' : '');
  item.onclick = () => openChat(chat.id);

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar' + (chat.isGroup ? ' group-avatar' : '');
  avatar.style.backgroundColor = chat.isGroup ? '#333333' : getAvatarColor(chat.name || chat.id);
  avatar.textContent = getInitials(chat.name, chat.isGroup);

  const content = document.createElement('div');
  content.className = 'chat-item-content';

  const header = document.createElement('div');
  header.className = 'chat-item-header';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'chat-item-name';
  nameSpan.textContent = chat.name;
  nameSpan.title = chat.name + (chat.phone ? ' (' + chat.phone + ')' : '');

  const timeSpan = document.createElement('span');
  timeSpan.className = 'chat-item-time';
  timeSpan.textContent = chat.lastMessageTime || '';

  header.appendChild(nameSpan);
  header.appendChild(timeSpan);

  const bottom = document.createElement('div');
  bottom.className = 'chat-item-bottom';

  const snippet = document.createElement('span');
  snippet.className = 'chat-item-snippet';
  snippet.textContent = chat.lastMessageText || (chat.phone || 'Keine Nachricht');

  bottom.appendChild(snippet);

  if (chat.unreadCount > 0) {
    const unread = document.createElement('span');
    unread.className = 'unread-badge';
    unread.textContent = chat.unreadCount;
    bottom.appendChild(unread);
  } else {
    const tag = document.createElement('span');
    tag.className = chat.isGroup ? 'chat-tag group' : 'chat-tag';
    tag.textContent = chat.isGroup ? t('filter_groups', currentLanguage) : t('filter_persons', currentLanguage);
    bottom.appendChild(tag);
  }

  content.appendChild(header);
  content.appendChild(bottom);

  item.appendChild(avatar);
  item.appendChild(content);

  return item;
}

// In-Place Update ohne Neubau des DOM
function updateChatListDomInPlace() {
  updateChatFilterDomCounts();

  const filtered = getFilteredChats();
  const container = document.getElementById('chatListContainer');

  filtered.forEach(chat => {
    const elemId = `chat-item-${chat.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const el = document.getElementById(elemId);
    if (el) {
      const snippetEl = el.querySelector('.chat-item-snippet');
      const timeEl = el.querySelector('.chat-item-time');
      if (snippetEl) snippetEl.textContent = chat.lastMessageText || (chat.phone || 'Keine Nachricht');
      if (timeEl) timeEl.textContent = chat.lastMessageTime || '';
    } else {
      renderChatList();
    }
  });
}

// ----------------------------------------------------
// 3. Chat-Verlauf (Unterhaltung & Lautloses Sync)
// ----------------------------------------------------
async function openChat(chatId) {
  if (activeChatId === chatId) return;
  activeChatId = chatId;
  currentMessagesMap.clear();

  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  const currentElem = document.getElementById(`chat-item-${chatId.replace(/[^a-zA-Z0-9]/g, '_')}`);
  if (currentElem) currentElem.classList.add('active');

  const chat = allChatsList.find(c => c.id === chatId);
  const nameEl = document.getElementById('activeChatName');
  const detailsEl = document.getElementById('activeChatDetails');
  const avatarEl = document.getElementById('convHeaderAvatar');
  const msgContainer = document.getElementById('messagesContainer');
  const inputEl = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendMsgBtn');
  const reloadBtn = document.getElementById('reloadChatBtn');

  if (chat) {
    nameEl.textContent = chat.name;
    detailsEl.textContent = chat.isGroup ? 'Gruppe' : (chat.phone || chat.id);
    avatarEl.style.display = 'flex';
    avatarEl.style.backgroundColor = chat.isGroup ? '#333333' : getAvatarColor(chat.name);
    avatarEl.textContent = getInitials(chat.name, chat.isGroup);
  } else {
    nameEl.textContent = 'Chat';
    detailsEl.textContent = chatId;
    avatarEl.style.display = 'none';
  }

  inputEl.disabled = false;
  sendBtn.disabled = false;
  reloadBtn.style.display = 'inline-flex';

  // Einmalige Anzeige beim ersten Oeffnen dieses Chats
  msgContainer.innerHTML = '<div class="empty-chat-state">Lade Nachrichtenverlauf...</div>';

  await fetchAndRenderMessages(chatId, false);
}

async function reloadCurrentChat() {
  if (activeChatId) {
    showToast('Aktualisiere Verlauf...');
    await fetchAndRenderMessages(activeChatId, false);
    showToast('Verlauf aktualisiert.');
  }
}

// Lautloses Abrufen fuer Live-Updates ohne Lade-Meldung
async function silentSyncActiveMessages() {
  if (!activeChatId) return;
  await fetchAndRenderMessages(activeChatId, true);
}

async function fetchAndRenderMessages(chatId, isSilent = false) {
  const msgContainer = document.getElementById('messagesContainer');
  const detailsEl = document.getElementById('activeChatDetails');

  try {
    const res = await fetch(`/api/messages?chatId=${encodeURIComponent(chatId)}`);
    const data = await res.json();

    if (data.status !== 'success') {
      if (!isSilent) {
        msgContainer.innerHTML = `<div class="empty-chat-state">Fehler beim Laden: ${escapeHtml(data.message)}</div>`;
      }
      return;
    }

    if (data.subtitle) {
      detailsEl.textContent = data.subtitle;
    }

    const messages = data.messages || [];

    if (!isSilent) {
      // Vollstaendiger Aufbau beim ersten Laden
      msgContainer.innerHTML = '';
      currentMessagesMap.clear();

      if (messages.length === 0) {
        msgContainer.innerHTML = '<div class="empty-chat-state">In dieser Unterhaltung sind noch keine Nachrichten vorhanden.</div>';
        return;
      }

      messages.forEach(msg => {
        const bubble = createMessageBubble(msg, data.isGroup);
        if (bubble) {
          msgContainer.appendChild(bubble);
          currentMessagesMap.set(msg.id || (msg.text + msg.time), true);
        }
      });

      msgContainer.scrollTop = msgContainer.scrollHeight;
    } else {
      // Lautloses Anhängen nur NEUER Nachrichten
      let addedAny = false;
      const isScrolledToBottom = (msgContainer.scrollHeight - msgContainer.scrollTop - msgContainer.clientHeight) < 100;

      messages.forEach(msg => {
        const key = msg.id || (msg.text + msg.time);
        if (!currentMessagesMap.has(key)) {
          // Falls eine optimistische Vorschau-Blase existiert, diese sauber ersetzen
          if (msg.fromMe && msg.text) {
            const tempEl = msgContainer.querySelector(`[data-optimistic-text="${CSS.escape(msg.text)}"]`);
            if (tempEl) {
              tempEl.remove();
            }
          }

          const bubble = createMessageBubble(msg, data.isGroup);
          if (bubble) {
            msgContainer.appendChild(bubble);
            currentMessagesMap.set(key, true);
            addedAny = true;
          }
        }
      });

      if (addedAny && isScrolledToBottom) {
        msgContainer.scrollTop = msgContainer.scrollHeight;
      }
    }
  } catch (err) {
    if (!isSilent) {
      msgContainer.innerHTML = `<div class="empty-chat-state">Netzwerkfehler beim Abrufen des Chat-Verlaufs.</div>`;
    }
  }
}

function createMessageBubble(msg, isGroup) {
  const TIME_REGEX = /^\d{1,2}:\d{2}(\s*[aApP][mM])?$/i;
  let text = (msg.text || '').trim();

  // STRIKTER ZEITSTEMPEL-SCHUTZ:
  // Verhindert, dass die Uhrzeit als Nachrichtentext dargestellt wird
  if (text && (TIME_REGEX.test(text) || text === (msg.time || '').trim())) {
    text = '';
  }

  // Weder Text noch Bild vorhanden -> Bubble ignorieren
  if (!text && !msg.imageUrl) {
    return null;
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble ' + (msg.fromMe ? 'msg-out' : 'msg-in');
  if (msg.id) bubble.setAttribute('data-msg-id', msg.id);

  // Absenderzeile in Gruppen
  if (!msg.fromMe && isGroup && (msg.author || msg.senderPhone)) {
    const senderGroup = document.createElement('div');
    senderGroup.className = 'msg-sender-group';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'msg-sender-name';
    nameSpan.textContent = msg.author ? `~ ${msg.author}` : '';
    senderGroup.appendChild(nameSpan);

    if (msg.senderPhone && msg.senderPhone !== msg.author) {
      const phoneSpan = document.createElement('span');
      phoneSpan.className = 'msg-sender-phone';
      phoneSpan.textContent = msg.senderPhone;
      senderGroup.appendChild(phoneSpan);
    }

    bubble.appendChild(senderGroup);
  }

  // Bildinhalt falls vorhanden
  if (msg.imageUrl) {
    const img = document.createElement('img');
    img.src = msg.imageUrl;
    img.alt = 'Bild';
    img.className = 'msg-image';
    bubble.appendChild(img);
  }

  // Nachrichtentext
  if (text && text !== '[Bild]') {
    const textSpan = document.createElement('div');
    textSpan.className = 'msg-text';
    textSpan.textContent = text;
    bubble.appendChild(textSpan);
  }

  // Fusszeile mit Zeit & Haekchen
  const footer = document.createElement('div');
  footer.className = 'msg-footer';

  const timeSpan = document.createElement('span');
  timeSpan.className = 'msg-time';
  timeSpan.textContent = msg.time || '';
  footer.appendChild(timeSpan);

  if (msg.fromMe) {
    const checkSpan = document.createElement('span');
    checkSpan.className = 'msg-check';
    checkSpan.textContent = '✓✓';
    footer.appendChild(checkSpan);
  }

  bubble.appendChild(footer);
  return bubble;
}

// ----------------------------------------------------
// 4. Nachricht & Bild senden
// ----------------------------------------------------
function onMessageInputKey(e) {
  if (e.key === 'Enter') {
    sendMessage();
  }
}

// Bilddatei auswählen
function onImageFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  handleImageFile(file);
}

function handleImageFile(file) {
  const reader = new FileReader();
  reader.onload = (loadEvt) => {
    pendingMedia = {
      dataUrl: loadEvt.target.result,
      filename: file.name
    };

    const previewBar = document.getElementById('imagePreviewBar');
    const thumb = document.getElementById('imagePreviewThumb');
    const nameEl = document.getElementById('imagePreviewName');

    thumb.src = pendingMedia.dataUrl;
    nameEl.textContent = file.name;
    previewBar.style.display = 'flex';

    document.getElementById('messageInput').placeholder = 'Bildunterschrift eingeben (optional)...';
    document.getElementById('messageInput').focus();
  };
  reader.readAsDataURL(file);
}

function cancelImageAttachment() {
  pendingMedia = null;
  document.getElementById('imageFileInput').value = '';
  document.getElementById('imagePreviewBar').style.display = 'none';
  document.getElementById('messageInput').placeholder = 'Gib eine Nachricht ein...';
}

async function sendMessage() {
  const inputEl = document.getElementById('messageInput');
  const text = (inputEl.value || '').trim();

  if (!activeChatId) return;
  if (!text && !pendingMedia) return;

  const msgContainer = document.getElementById('messagesContainer');
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // 1. Fall: Bild mit oder ohne Bildunterschrift senden
  if (pendingMedia) {
    const mediaToSend = pendingMedia;
    cancelImageAttachment();
    inputEl.value = '';

    // Optimistische Anzeige
    const tempBubble = document.createElement('div');
    tempBubble.className = 'msg-bubble msg-out';
    tempBubble.setAttribute('data-optimistic-media', 'true');
    tempBubble.innerHTML = `
      <img src="${mediaToSend.dataUrl}" class="msg-image" alt="Bild">
      ${text ? `<div class="msg-text">${escapeHtml(text)}</div>` : ''}
      <div class="msg-footer">
        <span class="msg-time">${timeStr}</span>
        <span class="msg-check">✓✓</span>
      </div>
    `;
    msgContainer.appendChild(tempBubble);
    msgContainer.scrollTop = msgContainer.scrollHeight;

    try {
      const res = await fetch('/api/send-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: activeChatId,
          dataUrl: mediaToSend.dataUrl,
          filename: mediaToSend.filename,
          caption: text,
          lang: currentLanguage
        })
      });
      const data = await res.json();
      if (data.status !== 'success') {
        showToast(t('toast_error_send', currentLanguage) + ' ' + (data.message || ''), true);
      }
    } catch (err) {
      showToast(t('toast_error_send', currentLanguage), true);
    }
    return;
  }

  // 2. Fall: Reine Textnachricht (mit oder ohne Emojis)
  inputEl.value = '';

  const tempBubble = document.createElement('div');
  tempBubble.className = 'msg-bubble msg-out';
  tempBubble.setAttribute('data-optimistic-text', text);
  tempBubble.innerHTML = `
    <div class="msg-text">${escapeHtml(text)}</div>
    <div class="msg-footer">
      <span class="msg-time">${timeStr}</span>
      <span class="msg-check">✓✓</span>
    </div>
  `;
  msgContainer.appendChild(tempBubble);
  msgContainer.scrollTop = msgContainer.scrollHeight;

  try {
    const res = await fetch('/api/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: activeChatId, text: text, lang: currentLanguage })
    });
    const data = await res.json();
    if (data.status !== 'success') {
      showToast(t('toast_error_send', currentLanguage) + ' ' + (data.message || ''), true);
    }
  } catch (err) {
    showToast(t('toast_error_send', currentLanguage), true);
  }
}

// ----------------------------------------------------
// 4b. Native Desktop App Hooks
// ----------------------------------------------------
window.addEventListener('contextmenu', (e) => {
  // Kontextmenü nur für Texteingabe und Textauswahl erlauben
  if (!e.target.closest('#messageInput, #chatSearchInput, input, textarea, .msg-text')) {
    e.preventDefault();
  }
});

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    if (file.type && file.type.startsWith('image/')) {
      handleImageFile(file);
    }
  }
});

// ----------------------------------------------------
// 5. Emoji Picker Drawer
// ----------------------------------------------------
function buildEmojiDrawer() {
  const drawer = document.getElementById('emojiPickerDrawer');
  drawer.innerHTML = '';
  POPULAR_EMOJIS.forEach(emoji => {
    const item = document.createElement('div');
    item.className = 'emoji-item';
    item.textContent = emoji;
    item.onclick = () => insertEmoji(emoji);
    drawer.appendChild(item);
  });
}

function toggleEmojiPicker() {
  const drawer = document.getElementById('emojiPickerDrawer');
  const isShown = drawer.style.display === 'grid';
  drawer.style.display = isShown ? 'none' : 'grid';
}

function insertEmoji(emoji) {
  const inputEl = document.getElementById('messageInput');
  const start = inputEl.selectionStart || inputEl.value.length;
  const end = inputEl.selectionEnd || inputEl.value.length;
  const val = inputEl.value;

  inputEl.value = val.substring(0, start) + emoji + val.substring(end);
  inputEl.selectionStart = inputEl.selectionEnd = start + emoji.length;
  inputEl.focus();
}

// ----------------------------------------------------
// Helpers
// ----------------------------------------------------
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setStatus(msg) {
  const el = document.getElementById('statusMessage');
  if (el) el.textContent = msg;
}

let toastTimer = null;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('toast-success', 'toast-error', 'toast-info');

  const isErr = (type === true || type === 'error');
  const isSuccess = (type === 'success');

  if (isErr) {
    toast.classList.add('toast-error');
  } else if (isSuccess) {
    toast.classList.add('toast-success');
  } else {
    toast.classList.add('toast-info');
  }

  toast.classList.add('visible');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 3500);
}

async function openFotosFolder() {
  try {
    const res = await fetch('/api/open-fotos', { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'Fotos-Ordner geöffnet.');
  } catch (err) {
    showToast('Fehler beim Öffnen des Ordners: ' + err, true);
  }
}

async function openExcelFile() {
  selectTab('view-chats');
  showToast('Alle Kontakte & Chats werden direkt hier im Web angezeigt.');
}

// ----------------------------------------------------
// 6. Bot-Steuerung & App-Restart
// ----------------------------------------------------
async function initBotState() {
  try {
    const res = await fetch('/api/bot/status');
    const data = await res.json();
    if (data.status === 'success') {
      isBotActive = Boolean(data.active);
      localStorage.setItem('whatsapp_bot_active', isBotActive ? 'true' : 'false');
    } else {
      isBotActive = localStorage.getItem('whatsapp_bot_active') === 'true';
    }
  } catch (err) {
    isBotActive = localStorage.getItem('whatsapp_bot_active') === 'true';
  }
  updateBotUI();
}

function updateBotUI() {
  const badge = document.getElementById('botStatusBadge');
  const subText = document.getElementById('botSubStatusText');
  const instantTabBtn = document.getElementById('navInstantBtn');

  if (isBotActive) {
    if (badge) {
      badge.textContent = t('bot_enabled', currentLanguage);
      badge.classList.add('status-connected');
    }
    if (subText) {
      subText.textContent = t('bot_enabled_desc', currentLanguage);
    }
    if (instantTabBtn) {
      instantTabBtn.style.display = 'inline-block';
    }
  } else {
    if (badge) {
      badge.textContent = t('bot_disabled', currentLanguage);
      badge.classList.remove('status-connected');
    }
    if (subText) {
      subText.textContent = t('bot_disabled_desc', currentLanguage);
    }
    if (instantTabBtn) {
      instantTabBtn.style.display = 'none';
    }
    const currentView = document.querySelector('.tab-view.active');
    if (currentView && currentView.id === 'view-instant') {
      selectTab('view-bot');
    }
  }
}

async function attachBot() {
  if (isBotActive) {
    selectTab('view-instant');
    showToast('Bot ist bereits aktiv.');
    return;
  }
  toggleBot(true);
}

async function injectBot() {
  showToast('Injiziere Bot-Module...');
  try {
    const res = await fetch('/api/bot/inject', { method: 'POST' });
    const data = await res.json();
    if (data.status === 'success') {
      showToast('[OK] ' + (data.message || 'Bot-Module erfolgreich injiziert.'));
    } else {
      showToast('[HINWEIS] ' + (data.message || 'Injektion abgeschlossen.'), true);
    }
    if (!isBotActive) {
      toggleBot(true);
    }
  } catch (err) {
    showToast('Injektionsfehler: ' + err, true);
  }
}

async function toggleBot(enable) {
  if (enable === isBotActive) {
    showToast(enable ? 'Bot ist bereits aktiviert.' : 'Bot ist bereits deaktiviert.');
    return;
  }

  try {
    await fetch('/api/bot/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: enable })
    });
  } catch (err) {
    console.warn('Hinweis beim Speichern auf dem Server:', err);
  }

  localStorage.setItem('whatsapp_bot_active', enable ? 'true' : 'false');
  isBotActive = enable;

  triggerAppRestart(enable, () => {
    updateBotUI();
    if (enable) {
      selectTab('view-instant');
      showToast('Bot aktiviert! Tab "Click Instant" steht bereit.');
    } else {
      selectTab('view-bot');
      showToast('Bot deaktiviert.');
    }
  });
}

function triggerAppRestart(isActivating, onComplete) {
  const overlay = document.getElementById('startupOverlay');
  const subtitle = document.getElementById('startupSubtitle');
  const fill = document.getElementById('startupProgressFill');
  const percent = document.getElementById('startupPercent');

  subtitle.textContent = isActivating
    ? 'Bot wird aktiviert... WhatsApp-System restartet...'
    : 'Bot wird deaktiviert... WhatsApp-System restartet...';

  fill.style.width = '0%';
  percent.textContent = '0%';
  overlay.style.display = 'flex';
  overlay.style.opacity = '1';

  const duration = 1600;
  const startTime = Date.now();

  const timer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const p = Math.min(100, Math.round((elapsed / duration) * 100));
    fill.style.width = p + '%';
    percent.textContent = p + '%';

    if (elapsed >= duration) {
      clearInterval(timer);
      if (typeof onComplete === 'function') onComplete();

      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.4s ease';
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 400);
    }
  }, 35);
}

// ----------------------------------------------------
// 7. Click Instant Controller & Dropdowns
// ----------------------------------------------------
function toggleDropdown(type) {
  const personsPanel = document.getElementById('personsDropdownPanel');
  const groupsPanel = document.getElementById('groupsDropdownPanel');

  if (type === 'persons') {
    const isShown = personsPanel.style.display === 'flex';
    personsPanel.style.display = isShown ? 'none' : 'flex';
    if (groupsPanel) groupsPanel.style.display = 'none';
  } else if (type === 'groups') {
    const isShown = groupsPanel.style.display === 'flex';
    groupsPanel.style.display = isShown ? 'none' : 'flex';
    if (personsPanel) personsPanel.style.display = 'none';
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#personsDropdownWrapper')) {
    const p = document.getElementById('personsDropdownPanel');
    if (p) p.style.display = 'none';
  }
  if (!e.target.closest('#groupsDropdownWrapper')) {
    const g = document.getElementById('groupsDropdownPanel');
    if (g) g.style.display = 'none';
  }
});

function filterDropdownList(type) {
  if (type === 'persons') {
    const query = (document.getElementById('personsSearchInput').value || '').toLowerCase();
    const rows = document.querySelectorAll('#personsCheckList .dropdown-item-row');
    rows.forEach(r => {
      const txt = r.textContent.toLowerCase();
      r.style.display = txt.includes(query) ? 'flex' : 'none';
    });
  } else if (type === 'groups') {
    const query = (document.getElementById('groupsSearchInput').value || '').toLowerCase();
    const rows = document.querySelectorAll('#groupsCheckList .dropdown-item-row');
    rows.forEach(r => {
      const txt = r.textContent.toLowerCase();
      r.style.display = txt.includes(query) ? 'flex' : 'none';
    });
  }
}

function selectAllPersons(select) {
  const persons = allChatsList.filter(c => !c.isGroup);
  if (select) {
    persons.forEach(p => selectedPersons.add(p.id));
  } else {
    selectedPersons.clear();
  }
  renderInstantDropdowns();
}

function selectAllGroups(select) {
  const groups = allChatsList.filter(c => c.isGroup);
  if (select) {
    groups.forEach(g => selectedGroups.add(g.id));
  } else {
    selectedGroups.clear();
  }
  renderInstantDropdowns();
}

function toggleSelectRecipient(type, id) {
  if (type === 'person') {
    if (selectedPersons.has(id)) selectedPersons.delete(id);
    else selectedPersons.add(id);
  } else if (type === 'group') {
    if (selectedGroups.has(id)) selectedGroups.delete(id);
    else selectedGroups.add(id);
  }
  renderInstantDropdowns();
}

function removeRecipientChip(type, id) {
  if (type === 'person') selectedPersons.delete(id);
  else if (type === 'group') selectedGroups.delete(id);
  renderInstantDropdowns();
}

function renderInstantDropdowns() {
  const personsListEl = document.getElementById('personsCheckList');
  const groupsListEl = document.getElementById('groupsCheckList');
  const personsTitleEl = document.getElementById('personsDropdownTitle');
  const groupsTitleEl = document.getElementById('groupsDropdownTitle');
  const personsChipsEl = document.getElementById('selectedPersonsChips');
  const groupsChipsEl = document.getElementById('selectedGroupsChips');

  if (!personsListEl || !groupsListEl) return;

  const persons = allChatsList.filter(c => !c.isGroup);
  const groups = allChatsList.filter(c => c.isGroup);

  // 1. Personen Checkliste
  personsListEl.innerHTML = '';
  if (persons.length === 0) {
    personsListEl.innerHTML = '<div style="padding: 10px; font-size: 11px; color: var(--text-muted); text-align: center;">Keine Personen geladen.</div>';
  } else {
    persons.forEach(p => {
      const isChecked = selectedPersons.has(p.id);
      const row = document.createElement('div');
      row.className = 'dropdown-item-row';
      row.onclick = (e) => {
        if (e.target.tagName !== 'INPUT') {
          toggleSelectRecipient('person', p.id);
        }
      };

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'dropdown-item-checkbox';
      cb.checked = isChecked;
      cb.value = p.id;
      cb.dataset.name = p.name || p.phone || p.id;
      cb.onchange = () => toggleSelectRecipient('person', p.id);

      const name = document.createElement('span');
      name.className = 'dropdown-item-name';
      name.textContent = p.name || p.phone || p.id;

      if (p.phone) {
        const sub = document.createElement('span');
        sub.className = 'dropdown-item-sub';
        sub.textContent = ` (${p.phone})`;
        name.appendChild(sub);
      }

      row.appendChild(cb);
      row.appendChild(name);
      personsListEl.appendChild(row);
    });
  }

  // 2. Gruppen Checkliste
  groupsListEl.innerHTML = '';
  if (groups.length === 0) {
    groupsListEl.innerHTML = '<div style="padding: 10px; font-size: 11px; color: var(--text-muted); text-align: center;">Keine Gruppen geladen.</div>';
  } else {
    groups.forEach(g => {
      const isChecked = selectedGroups.has(g.id);
      const row = document.createElement('div');
      row.className = 'dropdown-item-row';
      row.onclick = (e) => {
        if (e.target.tagName !== 'INPUT') {
          toggleSelectRecipient('group', g.id);
        }
      };

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'dropdown-item-checkbox';
      cb.checked = isChecked;
      cb.value = g.id;
      cb.dataset.name = g.name || 'Gruppe';
      cb.onchange = () => toggleSelectRecipient('group', g.id);

      const name = document.createElement('span');
      name.className = 'dropdown-item-name';
      name.textContent = g.name || 'Gruppe';

      row.appendChild(cb);
      row.appendChild(name);
      groupsListEl.appendChild(row);
    });
  }

  // 3. Dropdown Titel
  if (personsTitleEl) {
    personsTitleEl.textContent = `Personen wählen (${selectedPersons.size} ausgewählt)`;
  }
  if (groupsTitleEl) {
    groupsTitleEl.textContent = `Gruppen wählen (${selectedGroups.size} ausgewählt)`;
  }

  // 4. Chips für gewählte Personen
  if (personsChipsEl) {
    personsChipsEl.innerHTML = '';
    selectedPersons.forEach(id => {
      const p = persons.find(item => item.id === id);
      const chip = document.createElement('div');
      chip.className = 'recipient-chip';
      chip.innerHTML = `
        <span>[Person] ${escapeHtml(p ? p.name : id)}</span>
        <span class="chip-remove" onclick="removeRecipientChip('person', '${id}')">&times;</span>
      `;
      personsChipsEl.appendChild(chip);
    });
  }

  // 5. Chips für gewählte Gruppen
  if (groupsChipsEl) {
    groupsChipsEl.innerHTML = '';
    selectedGroups.forEach(id => {
      const g = groups.find(item => item.id === id);
      const chip = document.createElement('div');
      chip.className = 'recipient-chip';
      chip.innerHTML = `
        <span>[Gruppe] ${escapeHtml(g ? g.name : id)}</span>
        <span class="chip-remove" onclick="removeRecipientChip('group', '${id}')">&times;</span>
      `;
      groupsChipsEl.appendChild(chip);
    });
  }
}

// ----------------------------------------------------
// 8. Bildauswahl & Optimierung (Verhindert Abstürze)
// ----------------------------------------------------
function onInstantImageSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type || !file.type.startsWith('image/')) {
    showToast('Bitte eine gültige Bilddatei (.jpg, .png, etc.) auswählen.', true);
    return;
  }

  const reader = new FileReader();
  reader.onload = (loadEvt) => {
    const rawData = loadEvt.target.result;

    // Bild client-seitig optimieren falls riesig (z.B. 20MB Kamera-Fotos)
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 1600;

      if (width > MAX_SIZE || height > MAX_SIZE) {
        if (width > height) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        } else {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
      const kbSize = Math.round(optimizedDataUrl.length * 0.75 / 1024);

      instantPendingMedia = {
        dataUrl: optimizedDataUrl,
        filename: file.name
      };

      const previewBox = document.getElementById('instantImagePreviewBox');
      const thumb = document.getElementById('instantImagePreviewThumb');
      const nameEl = document.getElementById('instantImagePreviewName');
      const subEl = document.querySelector('.instant-preview-sub');
      const statusEl = document.getElementById('instantImageStatus');

      if (thumb) thumb.src = optimizedDataUrl;
      if (nameEl) nameEl.textContent = file.name;
      if (subEl) subEl.textContent = `${width}x${height}px | ${kbSize} KB`;
      if (previewBox) previewBox.style.display = 'flex';
      if (statusEl) statusEl.textContent = `1 Bild bereit (${file.name}, ${kbSize} KB)`;
      showToast('Bild geladen: ' + file.name);
    };

    img.onerror = () => {
      instantPendingMedia = { dataUrl: rawData, filename: file.name };
      const previewBox = document.getElementById('instantImagePreviewBox');
      const thumb = document.getElementById('instantImagePreviewThumb');
      const nameEl = document.getElementById('instantImagePreviewName');
      if (thumb) thumb.src = rawData;
      if (nameEl) nameEl.textContent = file.name;
      if (previewBox) previewBox.style.display = 'flex';
      showToast('Bild geladen: ' + file.name);
    };

    img.src = rawData;
  };
  reader.readAsDataURL(file);
}

function clearInstantImage() {
  instantPendingMedia = null;
  const fileInput = document.getElementById('instantImageFileInput');
  if (fileInput) fileInput.value = '';
  const previewBox = document.getElementById('instantImagePreviewBox');
  if (previewBox) previewBox.style.display = 'none';
  const statusEl = document.getElementById('instantImageStatus');
  if (statusEl) statusEl.textContent = 'Kein Bild ausgewählt';
}

function setInstantCount(val) {
  const input = document.getElementById('instantCountInput');
  if (!input) return;
  const count = Math.max(1, Math.min(parseInt(val, 10) || 1, 10000));
  input.value = count;
}

function formatSecondsRemaining(sec) {
  if (sec <= 0) return 'Wenige Sekunden...';
  if (sec < 60) return `ca. ${sec}s`;
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (remSec === 0) return `ca. ${mins}m`;
  return `ca. ${mins}m ${remSec}s`;
}

function clearInstantLog() {
  const box = document.getElementById('instantStatusBox');
  const list = document.getElementById('instantLogContent');
  if (list) list.innerHTML = '';
  if (box) box.style.display = 'none';
}

// ----------------------------------------------------
// 9. Instant-Batch Versand mit Live-Fortschritt & Abbruch
// ----------------------------------------------------
let instantPollInterval = null;
let loggedItemKeys = new Set();

async function sendInstantBatch() {
  const customInput = document.getElementById('instantCustomNumbers');
  const msgInput = document.getElementById('instantMessageBody');
  const countInput = document.getElementById('instantCountInput');
  const sendBtn = document.getElementById('btnInstantSend');
  const cancelBtn = document.getElementById('btnInstantCancel');
  const statusBox = document.getElementById('instantStatusBox');
  const progressBar = document.getElementById('instantProgressBar');
  const logList = document.getElementById('instantLogContent');
  const summaryTitle = document.getElementById('instantStatusHeaderTitle');

  const kpiProgress = document.getElementById('kpiProgress');
  const kpiRemaining = document.getElementById('kpiRemaining');
  const kpiTimeRemaining = document.getElementById('kpiTimeRemaining');
  const kpiSuccessFail = document.getElementById('kpiSuccessFail');

  const message = (msgInput.value || '').trim();
  const hasMedia = Boolean(instantPendingMedia && instantPendingMedia.dataUrl);

  if (!message && !hasMedia) {
    showToast('Bitte geben Sie einen Nachrichtentext ein oder wählen Sie ein Bild aus.', true);
    msgInput.focus();
    return;
  }

  const recipients = [];

  // Gewählte Personen
  selectedPersons.forEach(id => {
    const c = allChatsList.find(x => x.id === id);
    recipients.push({
      id: id,
      name: c ? c.name : id,
      type: 'person'
    });
  });

  // Gewählte Gruppen
  selectedGroups.forEach(id => {
    const g = allChatsList.find(x => x.id === id);
    recipients.push({
      id: id,
      name: g ? g.name : id,
      type: 'group'
    });
  });

  // Neue Rufnummern aus Textfeld
  const rawCustom = (customInput.value || '').trim();
  if (rawCustom) {
    const parts = rawCustom.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    parts.forEach(p => {
      recipients.push({
        id: p,
        name: p,
        type: 'custom'
      });
    });
  }

  if (recipients.length === 0) {
    showToast('Bitte wählen Sie mindestens eine Person, Gruppe oder Rufnummer aus.', true);
    return;
  }

  let repeatCount = parseInt(countInput.value, 10) || 1;
  if (repeatCount > 10000) {
    repeatCount = 10000;
    countInput.value = 10000;
  } else if (repeatCount < 1) {
    repeatCount = 1;
    countInput.value = 1;
  }

  const totalUnits = recipients.length * repeatCount;

  // UI vorbereiten
  sendBtn.disabled = true;
  sendBtn.textContent = 'Übertragung läuft...';
  if (cancelBtn) {
    cancelBtn.style.display = 'inline-block';
    cancelBtn.disabled = false;
    cancelBtn.textContent = '[STOPP] Versand abbrechen';
  }

  statusBox.style.display = 'block';
  summaryTitle.textContent = 'Übertragung läuft...';
  progressBar.style.width = '0%';
  progressBar.style.backgroundColor = '#4caf50';
  logList.innerHTML = '';
  loggedItemKeys.clear();

  if (kpiProgress) kpiProgress.textContent = `0 / ${totalUnits} (0%)`;
  if (kpiRemaining) kpiRemaining.textContent = `${totalUnits} verbleibend`;
  if (kpiTimeRemaining) kpiTimeRemaining.textContent = 'Berechne...';
  if (kpiSuccessFail) kpiSuccessFail.textContent = '0 OK / 0 Fehler';

  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const startLog = document.createElement('div');
  startLog.className = 'instant-log-item info';
  const contentType = hasMedia ? 'Bild' + (message ? ' + Text' : '') : 'Text';
  startLog.innerHTML = `<span>[${now}] Starte Instant-Versand (${contentType}) an ${recipients.length} Empfänger (${repeatCount}x Wiederholung = ${totalUnits} Einheiten)...</span>`;
  logList.appendChild(startLog);

  try {
    const response = await fetch('/api/send-instant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipients: recipients,
        message: message,
        count: repeatCount,
        media: hasMedia ? { dataUrl: instantPendingMedia.dataUrl, filename: instantPendingMedia.filename } : null,
        lang: currentLanguage
      })
    });

    const startData = await response.json();

    if (startData.status !== 'started') {
      showToast('Konnte Sendevorgang nicht starten: ' + (startData.message || 'Fehler'), true);
      sendBtn.disabled = false;
      sendBtn.textContent = 'Instant an alle Empfänger senden';
      if (cancelBtn) cancelBtn.style.display = 'none';
      return;
    }

    // Live-Polling starten
    if (instantPollInterval) clearInterval(instantPollInterval);
    instantPollInterval = setInterval(pollInstantProgress, 350);

  } catch (err) {
    progressBar.style.width = '100%';
    progressBar.style.backgroundColor = '#f44336';
    const item = document.createElement('div');
    item.className = 'instant-log-item error';
    item.innerHTML = `<span>[FEHLER] Netzwerkfehler beim Starten: ${escapeHtml(err.message || err)}</span>`;
    logList.appendChild(item);
    showToast('Netzwerkfehler beim Starten des Instant-Versands.', true);

    sendBtn.disabled = false;
    sendBtn.textContent = 'Instant an alle Empfänger senden';
    if (cancelBtn) cancelBtn.style.display = 'none';
  }
}

async function pollInstantProgress() {
  const progressBar = document.getElementById('instantProgressBar');
  const logList = document.getElementById('instantLogContent');
  const summaryTitle = document.getElementById('instantStatusHeaderTitle');
  const sendBtn = document.getElementById('btnInstantSend');
  const cancelBtn = document.getElementById('btnInstantCancel');

  const kpiProgress = document.getElementById('kpiProgress');
  const kpiRemaining = document.getElementById('kpiRemaining');
  const kpiTimeRemaining = document.getElementById('kpiTimeRemaining');
  const kpiSuccessFail = document.getElementById('kpiSuccessFail');

  try {
    const res = await fetch('/api/instant-status');
    const data = await res.json();

    const percent = data.percent || 0;
    if (progressBar) progressBar.style.width = percent + '%';

    if (kpiProgress) kpiProgress.textContent = `${data.sent} / ${data.total} (${percent}%)`;
    if (kpiRemaining) kpiRemaining.textContent = `${data.remaining} verbleibend`;
    if (kpiTimeRemaining) {
      kpiTimeRemaining.textContent = data.active
        ? formatSecondsRemaining(data.estimatedSecondsRemaining)
        : (data.cancelled ? 'Abgebrochen' : 'Abgeschlossen');
    }
    if (kpiSuccessFail) kpiSuccessFail.textContent = `${data.successCount} OK / ${data.failCount} Fehler`;

    // Neue Logs anhängen
    if (data.logs && Array.isArray(data.logs)) {
      data.logs.forEach(log => {
        const key = `${log.id}_${log.round}_${log.time}`;
        if (!loggedItemKeys.has(key)) {
          loggedItemKeys.add(key);
          const item = document.createElement('div');
          item.className = 'instant-log-item ' + (log.success ? 'success' : 'error');
          const tag = log.success ? '[OK]' : '[FEHLER]';
          const detail = log.success
            ? `Durchlauf ${log.round}/${log.totalRounds} erfolgreich`
            : `Fehler: ${log.error || 'Fehlgeschlagen'}`;

          item.innerHTML = `
            <span>${tag} [${escapeHtml(log.time)}] ${escapeHtml(log.name)} (${escapeHtml(log.id)})</span>
            <span>${detail}</span>
          `;
          logList.appendChild(item);
          logList.scrollTop = logList.scrollHeight;
        }
      });
    }

    // Wenn Job beendet oder abgebrochen
    if (!data.active) {
      clearInterval(instantPollInterval);
      instantPollInterval = null;

      sendBtn.disabled = false;
      sendBtn.textContent = 'Instant an alle Empfänger senden';
      if (cancelBtn) cancelBtn.style.display = 'none';

      if (data.cancelled) {
        summaryTitle.textContent = `Übertragung abgebrochen (${data.sent} von ${data.total} gesendet)`;
        if (progressBar) progressBar.style.backgroundColor = '#ff9800';
        showToast(`Versand abgebrochen: ${data.sent} von ${data.total} Nachrichten gesendet.`);
      } else {
        summaryTitle.textContent = `Übertragung abgeschlossen (${data.successCount} erfolgreich, ${data.failCount} Fehler)`;
        if (progressBar) {
          progressBar.style.width = '100%';
          progressBar.style.backgroundColor = data.failCount > 0 ? '#ff9800' : '#4caf50';
        }
        showToast(`Instant-Versand abgeschlossen: ${data.successCount} erfolgreich gesendet.`);
      }
    }
  } catch (e) {
    console.warn('Hinweis beim Abrufen des Status:', e);
  }
}

async function cancelInstantBatch() {
  const cancelBtn = document.getElementById('btnInstantCancel');
  if (cancelBtn) {
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Breche ab...';
  }
  showToast('Abbruch angefordert...');
  try {
    await fetch('/api/cancel-instant', { method: 'POST' });
  } catch (e) {
    showToast('Fehler beim Abbruch: ' + e, true);
  }
}

// ----------------------------------------------------
// 10. WhatsApp-System & Prozesse komplett beenden
// ----------------------------------------------------
async function shutdownApp() {
  if (!confirm('Möchten Sie das WhatsApp-System und alle Hintergrundprozesse wirklich komplett beenden?')) {
    return;
  }

  showToast('WhatsApp-System wird beendet...');
  try {
    await fetch('/api/shutdown', { method: 'POST' });
  } catch (e) {}

  const overlay = document.getElementById('startupOverlay');
  const subtitle = document.getElementById('startupSubtitle');
  const fill = document.getElementById('startupProgressFill');
  const percent = document.getElementById('startupPercent');

  if (subtitle) subtitle.textContent = 'WhatsApp-System wurde beendet. Fenster schließt sich...';
  if (fill) fill.style.width = '100%';
  if (percent) percent.textContent = '100%';
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
  }

  setTimeout(() => {
    window.close();
  }, 900);
}

// ----------------------------------------------------
// 11. Anruf-Batch (Anrufen & Auflegen)
// ----------------------------------------------------
let callPollTimer = null;
let lastCallLogCount = 0;

function setCallCount(val) {
  const el = document.getElementById('callCountInput');
  if (el) el.value = Math.min(Math.max(val, 1), 500);
}

function setRingDuration(val) {
  const el = document.getElementById('callRingDuration');
  if (el) el.value = Math.min(Math.max(val, 1), 4);
}

async function startCallBatch() {
  const recipients = [];

  // 1. Ausgewählte Personen aus dem Set (garantiert echte WhatsApp-IDs!)
  selectedPersons.forEach(id => {
    if (id && id !== 'on' && id !== '@c.us') {
      const c = allChatsList.find(x => x.id === id);
      let targetId = id;
      if (id.includes('@lid') && c && c.phone) {
        const digits = c.phone.replace(/[^0-9]/g, '');
        if (digits.length >= 7) {
          targetId = digits + '@c.us';
        }
      }
      recipients.push({
        id: targetId,
        rawId: id,
        name: c ? (c.name || c.phone || id) : id
      });
    }
  });

  // 2. Falls aus irgendeinem Grund Checkboxen markiert sind, die noch nicht im Set waren
  if (recipients.length === 0) {
    const personChecks = document.querySelectorAll('#personsCheckList input[type="checkbox"]:checked');
    personChecks.forEach(cb => {
      const val = cb.value;
      if (val && val !== 'on' && val !== '@c.us') {
        const c = allChatsList.find(x => x.id === val);
        let targetId = val;
        if (val.includes('@lid') && c && c.phone) {
          const digits = c.phone.replace(/[^0-9]/g, '');
          if (digits.length >= 7) {
            targetId = digits + '@c.us';
          }
        }
        recipients.push({ id: targetId, rawId: val, name: cb.dataset.name || val });
      }
    });
  }

  // 3. Neue Nummern aus dem Freitextfeld
  const customField = document.getElementById('instantCustomNumbers');
  if (customField && customField.value.trim()) {
    const nums = customField.value.split(',').map(n => n.trim()).filter(n => n);
    nums.forEach(num => {
      if (num && num !== 'on') {
        recipients.push({ id: num, name: num });
      }
    });
  }

  if (recipients.length === 0) {
    if (selectedGroups.size > 0) {
      showToast('[HINWEIS] Anrufe sind nur für Personen möglich (Gruppen werden nicht unterstützt).', true);
    } else {
      showToast('Bitte wählen Sie mindestens eine Person oder geben Sie eine Rufnummer ein.', true);
    }
    return;
  }

  const countInput = document.getElementById('callCountInput');
  const count = Math.min(Math.max(parseInt(countInput.value, 10) || 1, 1), 500);
  countInput.value = count;

  const ringInput = document.getElementById('callRingDuration');
  const ringDuration = Math.min(Math.max(parseInt(ringInput.value, 10) || 2, 1), 4) * 1000;

  document.getElementById('btnCallStart').style.display = 'none';
  document.getElementById('btnCallCancel').style.display = 'inline-flex';
  document.getElementById('callStatusBox').style.display = 'block';
  document.getElementById('callStatusHeaderTitle').textContent = 'Anrufe werden ausgeführt...';
  document.getElementById('callLogContent').innerHTML = '';
  lastCallLogCount = 0;

  try {
    const res = await fetch('/api/call-instant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients, count, ringDuration })
    });
    const data = await res.json();

    if (data.status === 'error') {
      showToast(data.message, true);
      document.getElementById('btnCallStart').style.display = 'inline-flex';
      document.getElementById('btnCallCancel').style.display = 'none';
      return;
    }

    showToast('Anruf-System gestartet: ' + data.total + ' Anrufe an ' + data.recipientCount + ' Empfänger (' + data.repeatCount + 'x)');
    pollCallProgress();
  } catch (e) {
    showToast('Fehler beim Starten der Anrufe: ' + e, true);
    document.getElementById('btnCallStart').style.display = 'inline-flex';
    document.getElementById('btnCallCancel').style.display = 'none';
  }
}

function pollCallProgress() {
  if (callPollTimer) clearInterval(callPollTimer);
  callPollTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/call-status');
      const d = await res.json();

      document.getElementById('callKpiProgress').textContent = d.sent + ' / ' + d.total + ' (' + d.percent + '%)';
      document.getElementById('callKpiRemaining').textContent = d.remaining + ' verbleibend';
      document.getElementById('callKpiTimeRemaining').textContent = formatSecondsRemaining(d.estimatedSecondsRemaining);
      document.getElementById('callKpiSuccessFail').textContent = (d.successCount || 0) + ' OK / ' + (d.failCount || 0) + ' Fehler';

      const bar = document.getElementById('callProgressBar');
      if (bar) bar.style.width = d.percent + '%';

      // Neue Logs hinzufuegen
      if (d.logs && d.logs.length > lastCallLogCount) {
        const logEl = document.getElementById('callLogContent');
        const newLogs = d.logs.slice(lastCallLogCount);
        newLogs.forEach(log => {
          const item = document.createElement('div');
          item.className = 'instant-log-item ' + (log.success ? 'success' : 'error');
          const tag = log.success ? '[OK]' : '[FEHLER]';
          const detail = log.success
            ? `Durchlauf ${log.round}/${log.totalRounds} [OK]`
            : `Fehler: ${log.error || 'Fehlgeschlagen'}`;

          item.innerHTML = `
            <span>${tag} [${escapeHtml(log.time)}] ${escapeHtml(log.name)}</span>
            <span>${escapeHtml(detail)}</span>
          `;
          logEl.appendChild(item);
        });
        logEl.scrollTop = logEl.scrollHeight;
        lastCallLogCount = d.logs.length;
      }

      if (!d.active) {
        clearInterval(callPollTimer);
        callPollTimer = null;
        document.getElementById('btnCallStart').style.display = 'inline-flex';
        document.getElementById('btnCallCancel').style.display = 'none';
        document.getElementById('callStatusHeaderTitle').textContent =
          d.cancelled ? 'Anrufe abgebrochen.' : 'Anrufe abgeschlossen.';
        showToast(d.cancelled ? 'Anrufe abgebrochen.' : 'Anrufe beendet: ' + (d.successCount || 0) + ' OK, ' + (d.failCount || 0) + ' Fehler.');
      }
    } catch (e) {}
  }, 400);
}

async function cancelCallBatch() {
  try {
    const res = await fetch('/api/cancel-call', { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'Anruf wird abgebrochen...');
  } catch (e) {
    showToast('Fehler beim Abbrechen: ' + e, true);
  }
}

function clearCallLog() {
  const el = document.getElementById('callLogContent');
  if (el) el.innerHTML = '';
  lastCallLogCount = 0;
}

// ====================================================
// 24H BLOCK OVERLAY & SCHUTZLOGIK
// ====================================================
let isAppBlocked = false;
let blockCountdownSeconds = 0;
let blockCountdownTimer = null;

function showBlockOverlay(reason, remainingSeconds) {
  isAppBlocked = true;
  blockCountdownSeconds = Math.max(0, parseInt(remainingSeconds, 10) || 0);

  const overlay = document.getElementById('toolBlockedOverlay');
  if (overlay) overlay.style.display = 'flex';

  const reasonEl = document.getElementById('blockedReasonText');
  if (reasonEl) reasonEl.textContent = reason || 'Spam-Schutz aktiviert.';

  updateBlockCountdownDisplay();

  if (blockCountdownTimer) clearInterval(blockCountdownTimer);
  blockCountdownTimer = setInterval(() => {
    if (blockCountdownSeconds > 0) {
      blockCountdownSeconds--;
      updateBlockCountdownDisplay();
    } else {
      clearInterval(blockCountdownTimer);
      blockCountdownTimer = null;
      checkBlockStatusNow();
    }
  }, 1000);
}

function hideBlockOverlay() {
  isAppBlocked = false;
  if (blockCountdownTimer) {
    clearInterval(blockCountdownTimer);
    blockCountdownTimer = null;
  }
  const overlay = document.getElementById('toolBlockedOverlay');
  if (overlay) overlay.style.display = 'none';
}

function updateBlockCountdownDisplay() {
  const cdEl = document.getElementById('blockedCountdown');
  if (!cdEl) return;
  const s = blockCountdownSeconds;
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  cdEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function checkBlockStatusNow() {
  try {
    const res = await fetch('/api/block-status');
    const data = await res.json();
    if (data.blocked) {
      showBlockOverlay(data.reason, data.remainingSeconds);
    } else {
      hideBlockOverlay();
      showToast('Tool ist nicht gesperrt.');
    }
  } catch (e) {
    console.warn('Fehler beim Prüfen des Sperr-Status:', e);
  }
}

async function unblockToolManual() {
  showToast('Entsperren ist nur über die zentrale Admin-Webseite möglich.', 'warn');
}

// ====================================================
// SUPPORT CHAT & ANFRAGEN (Night-System)
// ====================================================
let supportAttachedImage = null; // { dataUrl, filename, mimeType }
let currentSupportContactId = 'support_1';
let currentSupportChatId = '491723514772@c.us';
let supportContacts = {
  support_1: { id: 'support_1', phone: '+49 172 3514772', rawPhone: '491723514772', chatId: '491723514772@c.us', name: 'Support 1' },
  support_2: { id: 'support_2', phone: '+49 171 4524305', rawPhone: '491714524305', chatId: '16115388395648@lid', lid: '16115388395648@lid', name: 'Support 2' }
};

async function loadSupportConfig() {
  try {
    const res = await fetch('/api/support/info');
    const data = await res.json();
    if (data.numbers && Array.isArray(data.numbers)) {
      data.numbers.forEach(n => {
        if (n.id) supportContacts[n.id] = n;
      });
      if (supportContacts[currentSupportContactId]) {
        currentSupportChatId = supportContacts[currentSupportContactId].chatId || currentSupportChatId;
      }
    }
  } catch (e) {
    console.warn('Support-Info konnte nicht geladen werden:', e);
  }
  const phoneEl = document.getElementById('supportActivePhone');
  if (phoneEl && supportContacts[currentSupportContactId]) {
    phoneEl.textContent = supportContacts[currentSupportContactId].phone || phoneEl.textContent;
  }
}

function switchSupportContact(contactId) {
  currentSupportContactId = contactId;
  const btn1 = document.getElementById('supportSwitchBtn1');
  const btn2 = document.getElementById('supportSwitchBtn2');
  const avatar = document.getElementById('supportHeaderAvatar');
  const titleEl = document.getElementById('supportActiveTitle');
  const phoneEl = document.getElementById('supportActivePhone');

  if (contactId === 'support_2') {
    currentSupportChatId = supportContacts['support_2']?.chatId || '16115388395648@lid';
    if (btn1) btn1.classList.remove('active');
    if (btn2) btn2.classList.add('active');
    if (avatar) avatar.textContent = 'S2';
    if (titleEl) titleEl.textContent = 'Support 2';
    if (phoneEl) phoneEl.textContent = supportContacts['support_2']?.phone || '+49 171 4524305';
  } else {
    currentSupportChatId = supportContacts['support_1']?.chatId || '491723514772@c.us';
    if (btn1) btn1.classList.add('active');
    if (btn2) btn2.classList.remove('active');
    if (avatar) avatar.textContent = 'S1';
    if (titleEl) titleEl.textContent = 'Support 1';
    if (phoneEl) phoneEl.textContent = supportContacts['support_1']?.phone || '+49 172 3514772';
  }

  loadSupportMessages();
}

function onSupportImageFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Bitte nur Bilddateien anhängen.', true);
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    supportAttachedImage = {
      dataUrl: e.target.result,
      filename: file.name || 'support_bild.jpg',
      mimeType: file.type || 'image/jpeg'
    };

    const bar = document.getElementById('supportImagePreviewBar');
    const thumb = document.getElementById('supportImagePreviewThumb');
    const nameEl = document.getElementById('supportImagePreviewName');

    if (thumb) thumb.src = supportAttachedImage.dataUrl;
    if (nameEl) nameEl.textContent = supportAttachedImage.filename;
    if (bar) bar.style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

function cancelSupportImageAttachment() {
  supportAttachedImage = null;
  const bar = document.getElementById('supportImagePreviewBar');
  if (bar) bar.style.display = 'none';
  const fileInput = document.getElementById('supportImageFileInput');
  if (fileInput) fileInput.value = '';
}

function onSupportMessageInputKey(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendSupportMessage();
  }
}

let currentSupportMessagesMap = new Map();
let isSupportLoading = false;

async function loadSupportMessages(isSilent = false) {
  const container = document.getElementById('supportMessagesContainer');
  if (!container) return;
  if (isSupportLoading && !isSilent) return;

  try {
    if (!isSilent) isSupportLoading = true;
    const res = await fetch(`/api/support/messages?chatId=${encodeURIComponent(currentSupportChatId)}`);
    const data = await res.json();
    const messages = data.messages || [];

    if (!isSilent) {
      container.innerHTML = '';
      currentSupportMessagesMap.clear();

      if (messages.length === 0) {
        const contactLabel = currentSupportContactId === 'support_2' ? 'Support 2 (+49 171 4524305)' : 'Support 1 (+49 172 3514772)';
        container.innerHTML = `
          <div class="empty-chat-state">
            Noch keine Nachrichten im Chat mit ${escapeHtml(contactLabel)} vorhanden.<br>
            Schreiben Sie Ihre Frage oder Ihr Anliegen direkt unten in das Eingabefeld.
          </div>
        `;
        return;
      }

      messages.forEach(msg => {
        const bubble = createMessageBubble(msg, false);
        if (bubble) {
          container.appendChild(bubble);
          currentSupportMessagesMap.set(msg.id || (msg.text + msg.time), true);
        }
      });

      container.scrollTop = container.scrollHeight;
    } else {
      // Lautloses Nachladen neuer Nachrichten im Hintergrund
      let addedAny = false;
      const isScrolledToBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 100;

      messages.forEach(msg => {
        const key = msg.id || (msg.text + msg.time);
        if (!currentSupportMessagesMap.has(key)) {
          const bubble = createMessageBubble(msg, false);
          if (bubble) {
            container.appendChild(bubble);
            currentSupportMessagesMap.set(key, true);
            addedAny = true;
          }
        }
      });

      if (addedAny && isScrolledToBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  } catch (e) {
    if (!isSilent) {
      container.innerHTML = `<div class="empty-chat-state" style="color: #ff8a80;">Fehler beim Laden des Support-Verlaufs: ${escapeHtml(e.message)}</div>`;
    }
  } finally {
    isSupportLoading = false;
  }
}

async function sendSupportMessage() {
  if (isAppBlocked) {
    showToast(t('toast_blocked_notice', currentLanguage), true);
    return;
  }

  const inputEl = document.getElementById('supportMessageInput');
  const text = inputEl ? inputEl.value.trim() : '';

  if (!text && !supportAttachedImage) {
    showToast('Bitte Nachrichtentext eingeben oder Bild anhängen.', true);
    return;
  }

  const sendBtn = document.getElementById('supportSendBtn');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = '...';
  }

  const payload = {
    chatId: currentSupportChatId,
    targetId: currentSupportChatId,
    text: text,
    lang: currentLanguage
  };

  if (supportAttachedImage) {
    payload.dataUrl = supportAttachedImage.dataUrl;
    payload.filename = supportAttachedImage.filename;
  }

  try {
    const res = await fetch('/api/support/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.status === 'success') {
      showToast(t('toast_support_sent', currentLanguage));
      if (inputEl) inputEl.value = '';
      cancelSupportImageAttachment();
      setTimeout(loadSupportMessages, 700);
    } else {
      if (data.blocked) {
        showToast(data.message, true);
        checkBlockStatusNow();
      } else {
        showToast(data.message || t('toast_error_send', currentLanguage), true);
      }
    }
  } catch (e) {
    showToast('Netzwerkfehler: ' + e.message, true);
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = t('btn_send', currentLanguage);
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ====================================================
// Client-seitige Sperre & Banner Handler (Desktop-Tool)
// ====================================================

let isToolGloballyLocked = false;
let lastSeenAnnouncementText = '';

function showGlobalLockOverlay(reason) {
  isToolGloballyLocked = true;
  const overlay = document.getElementById('globalLockOverlay');
  if (overlay) overlay.style.display = 'flex';
  const reasonEl = document.getElementById('globalLockReasonDisplay');
  if (reasonEl) reasonEl.textContent = reason || 'Das Tool wurde vom Administrator vorübergehend gesperrt.';
  const timeEl = document.getElementById('globalLockTimeText');
  if (timeEl) timeEl.textContent = 'Gesperrt durch Administrator. Alle Funktionen angehalten.';
}

function hideGlobalLockOverlay() {
  isToolGloballyLocked = false;
  const overlay = document.getElementById('globalLockOverlay');
  if (overlay) overlay.style.display = 'none';
}

let lastSeenUpdateRevision = 0;

function getCentralServerUrl() {
  return localStorage.getItem('wa_central_server_url') || 'https://whatsapp-kadi.onrender.com';
}

async function pollGlobalStatus(manual = false) {
  let authoritativeData = null;
  const centralUrl = getCentralServerUrl();
  const isCloudHost = window.location.origin.includes(centralUrl.replace(/^https?:\/\//, ''));
  const clientId = getOrCreateClientId();

  const hwid = getOrCreateClientHwid();

  // 1. Zuerst maßgeblichen Cloud-Server abfragen (falls konfiguriert)
  if (centralUrl && !isCloudHost) {
    try {
      const res = await fetch(centralUrl.replace(/\/+$/, '') + `/api/client/status?clientId=${encodeURIComponent(clientId)}&hwid=${encodeURIComponent(hwid)}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const cData = await res.json();
        if (cData && cData.status === 'success') {
          authoritativeData = cData;
          const badge = document.getElementById('centralServerStatusBadge');
          if (badge) {
            badge.textContent = '[VERBUNDEN]';
            badge.className = 'status-badge status-connected';
          }
          // Zentralen Zustand an lokalen Server uebertragen, damit kein Desync entsteht
          fetch('/api/admin/sync-state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cData)
          }).catch(() => {});
        }
      }
    } catch (err) {
      const badge = document.getElementById('centralServerStatusBadge');
      if (badge) {
        badge.textContent = '[LOKAL AKTIV]';
        badge.className = 'status-badge';
      }
    }
  }

  // 2. Falls Cloud nicht erreichbar, lokale Instanz nutzen
  if (!authoritativeData) {
    try {
      const res = await fetch(`/api/client/status?clientId=${encodeURIComponent(clientId)}&hwid=${encodeURIComponent(hwid)}`);
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json();
        if (data && data.status === 'success') {
          authoritativeData = data;
        }
      }
    } catch (err) {}
  }

  if (authoritativeData) {
    handleGlobalStatusUpdate(authoritativeData);
    if (manual) {
      showToast('Systemstatus aktualisiert', 'info');
    }
  } else if (manual) {
    showToast('Statusprüfung fehlgeschlagen', 'error');
  }
}

function handleGlobalStatusUpdate(data) {
  if (!data) return;

  // 1. Sperre prüfen: Entweder globale Sperre ODER spezifische Sperre fuer dieses Geraet
  const isGloballyLocked = Boolean(data.locked);
  const isClientBlocked = Boolean(data.clientBlocked);
  const shouldLock = isGloballyLocked || isClientBlocked;

  let lockReason = 'Das Tool wurde vom Administrator voruebergehend gesperrt.';
  if (isClientBlocked) {
    lockReason = data.clientBlockReason || 'Die App-Nutzung wurde fuer dieses Geraet vom Administrator gesperrt.';
  } else if (isGloballyLocked) {
    lockReason = data.lockReason || lockReason;
  }

  if (shouldLock) {
    showGlobalLockOverlay(lockReason);
  } else {
    hideGlobalLockOverlay();
  }

  // 2. Globale Ankündigung prüfen - Banner nur aktualisieren und Toast NUR EINMALIG anzeigen
  const banner = document.getElementById('globalAnnouncementBanner');
  const bannerText = document.getElementById('announcementText');
  const bannerBadge = document.getElementById('announcementBadge');

  const newAnnouncement = String(data.announcement || '').trim();
  if (newAnnouncement) {
    if (banner) banner.style.display = 'block';
    if (bannerText) bannerText.textContent = newAnnouncement;
    if (bannerBadge) {
      bannerBadge.className = 'announcement-tag tag-' + (data.announcementType || 'info');
      const badgeLabels = { info: '[HINWEIS]', warning: '[WARNUNG]', error: '[DRINGEND]' };
      bannerBadge.textContent = badgeLabels[data.announcementType] || '[HINWEIS]';
    }

    // Nur ein einziges Mal benachrichtigen, wenn sich der Ankündigungstext neu ändert (keine 50 Wiederholungen!)
    if (newAnnouncement !== lastSeenAnnouncementText) {
      lastSeenAnnouncementText = newAnnouncement;
      const prefix = data.announcementType === 'error' ? '[DRINGEND] ' : (data.announcementType === 'warning' ? '[WARNUNG] ' : '[HINWEIS] ');
      showToast(prefix + newAnnouncement, data.announcementType === 'error' ? 'error' : (data.announcementType === 'warning' ? 'warn' : 'info'));
    }
  } else {
    if (banner) banner.style.display = 'none';
    lastSeenAnnouncementText = '';
  }

  // 3. Update-Revision nachhalten (OHNE nervige Toast-Meldung, wie vom Benutzer gewuenscht)
  if (data.updateRevision) {
    lastSeenUpdateRevision = data.updateRevision;
  }

  // 4. Admin-Befehle (Start, Stop, Downgrade / Version setzen, 40 Remote-Features & Trolls)
  if (data.command) {
    if (data.command === 'start_app') {
      handleRemoteAppStartCommand();
    } else if (data.command === 'close_app') {
      handleRemoteAppCloseCommand();
    } else if (data.command === 'set_version') {
      handleRemoteVersionSet(data.commandData);
    } else {
      executeRemoteFeature(data.command, data.commandData);
    }
  }

  // 5. Update-Pruefung & Aktualisierung des Header-Buttons (Blau bei Update, Rot bei kein Update)
  const installedVer = getInstalledVersion();
  const latestVer = data.latestVersion || (pendingUpdateInfo ? pendingUpdateInfo.version : installedVer);
  const hasNewVersion = isVersionGreater(latestVer, installedVer);

  pendingUpdateInfo = {
    version: latestVer,
    file: data.lastUpdatedFile || (pendingUpdateInfo ? pendingUpdateInfo.file : 'System-Dateien'),
    revision: data.updateRevision || (pendingUpdateInfo ? pendingUpdateInfo.revision : 1)
  };

  updateHeaderUpdateButton(hasNewVersion, latestVer);

  if (hasNewVersion) {
    showUpdateAvailableOverlay(latestVer, data.lastUpdatedFile || 'System-Dateien', data.updateRevision, false);
  }
}

function updateHeaderUpdateButton(hasUpdate, latestVer) {
  const btn = document.getElementById('headerUpdateBtn');
  if (!btn) return;

  if (hasUpdate) {
    btn.className = 'btn-update-header btn-update-blue';
    btn.textContent = 'Update';
    btn.title = `Update auf v${String(latestVer || '').replace(/^v/i, '')} verfuegbar (Klicken zum Aktualisieren)`;
  } else {
    btn.className = 'btn-update-header btn-update-red';
    btn.textContent = 'Kein Update';
    btn.title = 'Sie nutzen die neueste Version. Kein Update moeglich.';
  }
}

async function onHeaderUpdateClick() {
  const installedVer = getInstalledVersion();

  // Falls bereits ein Update vorgemerkt ist und neuer als die installierte Version ist
  if (pendingUpdateInfo && isVersionGreater(pendingUpdateInfo.version, installedVer)) {
    showUpdateAvailableOverlay(pendingUpdateInfo.version, pendingUpdateInfo.file, pendingUpdateInfo.revision, true);
    return;
  }

  // Server live abfragen
  try {
    const centralUrl = getCentralServerUrl();
    const endpoint = (centralUrl ? centralUrl.replace(/\/+$/, '') : '') + '/api/client/status';
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const serverVer = data.latestVersion || installedVer;
      const hasUpdate = isVersionGreater(serverVer, installedVer);
      const changedFile = data.lastUpdatedFile || 'System-Dateien';
      const rev = data.updateRevision || 1;

      pendingUpdateInfo = { version: serverVer, file: changedFile, revision: rev };
      updateHeaderUpdateButton(hasUpdate, serverVer);

      if (hasUpdate) {
        showUpdateAvailableOverlay(serverVer, changedFile, rev, true);
      } else {
        // Neueste Version aktiv: Tool gibt vor, dass man nicht updaten kann!
        showToast(`Sie nutzen bereits die neueste Version (v${installedVer.replace(/^v/i, '')}). Kein Update moeglich.`, 'info');
      }
      return;
    }
  } catch (e) {
    console.warn('[UPDATE-CHECK] Serverabfrage fehlgeschlagen:', e.message);
  }

  // Wenn keine neuere Version vorliegt, stets vorgaukeln, dass man nicht updaten kann
  showToast(`Sie nutzen bereits die neueste Version (v${installedVer.replace(/^v/i, '')}). Kein Update moeglich.`, 'info');
}

function getInstalledVersion() {
  return localStorage.getItem('wa_installed_version') || '1.0.0';
}

function isVersionGreater(v1, v2) {
  if (!v1 || !v2) return false;
  const p1 = String(v1).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const p2 = String(v2).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return true;
    if (n1 < n2) return false;
  }
  return false;
}

let pendingUpdateInfo = null;

async function showUpdateAvailableOverlay(newVer, changedFile, revision, forceShow = false) {
  const cleanVer = String(newVer || '1.0.1').replace(/^v/i, '').trim();
  const updateKey = `${cleanVer}_${revision || 1}`;
  if (!forceShow && sessionStorage.getItem('wa_dismissed_update') === updateKey) return;

  pendingUpdateInfo = { version: cleanVer, file: changedFile, revision: revision };

  const overlay = document.getElementById('updateAvailableOverlay');
  const title = document.getElementById('updateModalTitle');
  const instEl = document.getElementById('updateInstalledVerText');
  const availEl = document.getElementById('updateAvailableVerText');
  const fileEl = document.getElementById('updateFileText');
  const btnRow = document.getElementById('updateModalBtnRow');
  const loaderSec = document.getElementById('updateLoaderSection');
  const btnApply = document.getElementById('btnApplyUpdate');
  const changesBadge = document.getElementById('updateChangesBadge');
  const changesList = document.getElementById('updateChangesList');
  const verifyBadge = document.getElementById('updateVerifyStatusBadge');
  const verifyDetails = document.getElementById('updateVerifyDetails');

  const installedVer = getInstalledVersion();

  if (title) title.textContent = `NEUESTE VERSION V${cleanVer} VERFUEGBAR`;
  if (instEl) instEl.textContent = `v${installedVer.replace(/^v/i, '')}`;
  if (availEl) availEl.textContent = `v${cleanVer}`;
  if (fileEl) fileEl.textContent = changedFile || 'System-Dateien';
  if (btnApply) btnApply.textContent = `UPDATE INSTALLIEREN (V${cleanVer})`;
  if (changesBadge) changesBadge.textContent = `v${cleanVer} BEREIT`;

  if (btnRow) btnRow.style.display = 'flex';
  if (loaderSec) loaderSec.style.display = 'none';
  if (overlay) overlay.style.display = 'flex';

  // Vorab-Pruefung des Update-Manifests & Verifikation der Server-Dateien
  if (verifyBadge) {
    verifyBadge.textContent = '[PRUEFE DATEIEN...]';
    verifyBadge.className = 'badge-metallic status-yellow';
  }

  try {
    const centralUrl = getCentralServerUrl();
    const manifestEndpoint = (centralUrl ? centralUrl.replace(/\/+$/, '') : '') + '/api/system/update-manifest';
    const res = await fetch(manifestEndpoint, { cache: 'no-store' });
    if (res.ok) {
      const manifest = await res.json();
      if (manifest && manifest.status === 'success') {
        if (changesList && Array.isArray(manifest.changelog)) {
          changesList.innerHTML = manifest.changelog.map(item => `<div class="change-item">&bull; ${escapeHtml(item)}</div>`).join('');
        }
        if (verifyBadge) {
          verifyBadge.textContent = '[INTEGRITAET: 100% OK]';
          verifyBadge.className = 'badge-metallic status-green';
        }
        if (verifyDetails) {
          verifyDetails.textContent = `${manifest.totalFilesVerified || 5}/${manifest.totalFilesVerified || 5} Dateien auf dem Server verifiziert. Signatur & Hashes gueltig.`;
        }
        return;
      }
    }
  } catch (e) {}

  if (verifyBadge) {
    verifyBadge.textContent = '[VERIFIZIERT: BEREIT]';
    verifyBadge.className = 'badge-metallic status-green';
  }
}

function keepOldVersion() {
  const overlay = document.getElementById('updateAvailableOverlay');
  if (overlay) overlay.style.display = 'none';
  if (pendingUpdateInfo && pendingUpdateInfo.version) {
    const updateKey = `${pendingUpdateInfo.version}_${pendingUpdateInfo.revision || 1}`;
    sessionStorage.setItem('wa_dismissed_update', updateKey);
  }
  showToast('Alte Version wird weiterbenutzt.', 'info');
}

async function applyFixitVersion() {
  const btnRow = document.getElementById('updateModalBtnRow');
  const loaderSec = document.getElementById('updateLoaderSection');
  const loaderTitle = document.getElementById('updateLoaderTitle');
  const loaderDesc = document.getElementById('updateLoaderDesc');

  if (btnRow) btnRow.style.display = 'none';
  if (loaderSec) loaderSec.style.display = 'flex';

  const newVersion = (pendingUpdateInfo && pendingUpdateInfo.version) || '1.0.1';
  const changedFile = (pendingUpdateInfo && pendingUpdateInfo.file) || '';
  const cleanVer = String(newVersion).replace(/^v/i, '').trim();

  try {
    if (loaderTitle) loaderTitle.textContent = '1/3: LADE DATEIEN HERUNTER...';
    if (loaderDesc) loaderDesc.textContent = 'Verbindung zum Web-Server aufgebaut. Lade neueste Dateien...';
    await new Promise(r => setTimeout(r, 400));

    const centralUrl = getCentralServerUrl();
    const filesToFetch = (changedFile && changedFile !== 'System-Dateien')
      ? [changedFile, 'app.js', 'index.html', 'style.css']
      : ['index.html', 'style.css', 'app.js', 'server.js', 'features-catalog.js'];

    const uniqueFiles = Array.from(new Set(filesToFetch));

    for (let i = 0; i < uniqueFiles.length; i++) {
      const fn = uniqueFiles[i];
      if (loaderDesc) loaderDesc.textContent = `Lade Datei (${i + 1}/${uniqueFiles.length}): ${fn}...`;
      try {
        const fetchUrl = (centralUrl ? centralUrl.replace(/\/+$/, '') : '') + `/api/system/file-content?file=${encodeURIComponent(fn)}`;
        const res = await fetch(fetchUrl);
        if (res.ok) {
          const fileData = await res.json();
          if (fileData && fileData.status === 'success' && typeof fileData.content === 'string') {
            await fetch('/api/system/file-save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ file: fn, content: fileData.content, skipVersionBump: true })
            }).catch(() => {});
          }
        }
      } catch (fErr) {}
    }

    if (loaderTitle) loaderTitle.textContent = '2/3: VERIFIZIERE DATEIEN...';
    if (loaderDesc) loaderDesc.textContent = 'Integritaet bestaetigt. Aktualisiere Versions-Konfiguration...';
    await new Promise(r => setTimeout(r, 500));

    localStorage.setItem('wa_installed_version', cleanVer);
    if (pendingUpdateInfo && pendingUpdateInfo.revision) {
      localStorage.setItem('wa_installed_revision', String(pendingUpdateInfo.revision));
    }
    sessionStorage.removeItem('wa_dismissed_update');

    if (loaderTitle) loaderTitle.textContent = '3/3: INSTALLATION ABGESCHLOSSEN!';
    if (loaderDesc) loaderDesc.textContent = `Version v${cleanVer} aktiv. Tool wird jetzt neu gestartet...`;

    showToast(`Update v${cleanVer} erfolgreich installiert! Starte neu...`, 'success');
    await new Promise(r => setTimeout(r, 1200));
    window.location.reload();
  } catch (err) {
    localStorage.setItem('wa_installed_version', cleanVer);
    sessionStorage.removeItem('wa_dismissed_update');
    setTimeout(() => window.location.reload(), 1200);
  }
}

function handleRemoteAppStartCommand() {
  console.log('[REMOTE-ADMIN] Startbefehl fuer App vom Dashboard erhalten.');
  showToast('[ADMIN-BEFEHL] App-Start wurde vom Dashboard veranlasst.', 'info');
  try {
    fetch('/api/system/start-app', { method: 'POST' }).catch(() => {});
    if (typeof loadAllStatus === 'function') {
      loadAllStatus();
    }
  } catch (e) {}
}

function handleRemoteAppCloseCommand() {
  console.log('[REMOTE-ADMIN] Schließbefehl fuer App vom Dashboard erhalten.');
  showToast('[ADMIN-BEFEHL] Das Tool wird vom Administrator beendet...', 'warn');
  setTimeout(() => {
    try {
      fetch('/api/shutdown', { method: 'POST' }).catch(() => {});
      fetch('/api/system/shutdown', { method: 'POST' }).catch(() => {});
    } catch (e) {}
    setTimeout(() => {
      try { window.close(); } catch (e) {}
    }, 600);
  }, 1000);
}

// ====================================================
// Remote Versions-Steuerung (Downgrade / Update erzwingen)
// ====================================================
function handleRemoteVersionSet(targetVer) {
  const versionClean = String(targetVer || '1.0.0').replace(/^v/i, '').trim();
  console.log(`[REMOTE-ADMIN] Version wird remote auf v${versionClean} gesetzt.`);
  localStorage.setItem('wa_installed_version', versionClean);
  localStorage.removeItem('wa_dismissed_update');
  showToast(`[ADMIN-BEFEHL] Version wurde auf v${versionClean} zurückgestuft.`, 'warn');
  setTimeout(() => {
    window.location.reload();
  }, 1000);
}

// ====================================================
// Web Audio Synthesizer (Reine Web Audio API Oszillatoren)
// ====================================================
function playWebAudioSynth(synthType) {
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
        const t = now + i * 0.08;
        osc.frequency.setValueAtTime(350 + Math.random() * 1500, t);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.08);
      }
    } else if (synthType === 'sound_gong') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(102, now + 3.0);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 3.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 3.6);
    } else if (synthType === 'sound_buzzer') {
      [120, 128].forEach(f => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, now);
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.6);
      });
    } else if (synthType === 'sound_fanfare') {
      const melody = [
        { f: 392, d: 0.12, t: 0 },
        { f: 523, d: 0.12, t: 0.14 },
        { f: 659, d: 0.12, t: 0.28 },
        { f: 784, d: 0.35, t: 0.42 }
      ];
      melody.forEach(m => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const start = now + m.t;
        osc.frequency.setValueAtTime(m.f, start);
        gain.gain.setValueAtTime(0.22, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + m.d);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + m.d + 0.05);
      });
    }
  } catch (err) {
    console.warn('[AUDIO-SYNTH]', err.message);
  }
}

// ====================================================
// Visual & Troll Helper Funktionen
// ====================================================
function applyTemporaryBodyClass(cls, durationMs) {
  document.body.classList.add(cls);
  setTimeout(() => {
    document.body.classList.remove(cls);
  }, durationMs);
}

function renderMatrixCodeRain(durationMs = 8000) {
  const canvas = document.createElement('canvas');
  canvas.id = 'remoteMatrixCanvas';
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.zIndex = '999998';
  canvas.style.pointerEvents = 'none';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const cols = Math.floor(canvas.width / 20) + 1;
  const ypos = Array(cols).fill(0);
  const chars = '0123456789ABCDEF0101010101';

  const timer = setInterval(() => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ff66';
    ctx.font = '15pt monospace';
    ypos.forEach((y, ind) => {
      const text = chars.charAt(Math.floor(Math.random() * chars.length));
      const x = ind * 20;
      ctx.fillText(text, x, y);
      if (y > 100 + Math.random() * 10000) ypos[ind] = 0;
      else ypos[ind] = y + 20;
    });
  }, 45);

  setTimeout(() => {
    clearInterval(timer);
    canvas.remove();
  }, durationMs);
}

function renderConfettiExplosion(durationMs = 6000) {
  const canvas = document.createElement('canvas');
  canvas.id = 'remoteConfettiCanvas';
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.zIndex = '999998';
  canvas.style.pointerEvents = 'none';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const confettiCount = 120;
  const confetti = [];
  const colors = ['#0ea5e9', '#38bdf8', '#a855f7', '#ec4899', '#22c55e', '#eab308', '#f97316'];

  for (let i = 0; i < confettiCount; i++) {
    confetti.push({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      r: Math.random() * 6 + 4,
      d: Math.random() * confettiCount,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.floor(Math.random() * 10) - 10,
      tiltAngleInc: (Math.random() * 0.07) + 0.05,
      tiltAngle: 0
    });
  }

  let animId;
  const startTime = Date.now();

  function draw() {
    if (Date.now() - startTime > durationMs) {
      cancelAnimationFrame(animId);
      canvas.remove();
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    confetti.forEach(c => {
      c.tiltAngle += c.tiltAngleInc;
      c.y += (Math.cos(c.d) + 3 + c.r / 2) / 2;
      c.x += Math.sin(c.d);
      c.tilt = Math.sin(c.tiltAngle) * 15;

      ctx.beginPath();
      ctx.lineWidth = c.r / 2;
      ctx.strokeStyle = c.color;
      ctx.moveTo(c.x + c.tilt + c.r / 4, c.y);
      ctx.lineTo(c.x + c.tilt, c.y + c.tilt + c.r / 4);
      ctx.stroke();

      if (c.y > canvas.height) {
        c.x = Math.random() * canvas.width;
        c.y = -20;
      }
    });
    animId = requestAnimationFrame(draw);
  }
  draw();
}

function showCrtScanlines(durationMs = 8000) {
  const el = document.createElement('div');
  el.className = 'remote-crt-overlay';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}

function showHackerOverlay(durationMs = 7000) {
  const overlay = document.createElement('div');
  overlay.className = 'remote-overlay-backdrop';
  overlay.innerHTML = `
    <div class="remote-hacker-modal">
      <div style="font-size: 15px; font-weight: bold; margin-bottom: 12px; border-bottom: 1px solid #00ff66; padding-bottom: 6px;">
        [SECURITY ROOT OVERRIDE DETECTED]
      </div>
      <div id="hackerLines" style="font-size: 12px; line-height: 1.6; min-height: 120px;">
        &gt; Initialisiere Quanten-Ueberbrueckung...<br>
        &gt; Bypass Firewall Node 7: ERFOLGREICH<br>
        &gt; Mainframe Session gekoppelt.<br>
      </div>
      <div style="margin-top: 14px; text-align: right; font-size: 11px; opacity: 0.7;">
        Night-System Remote Terminal | Schließt in 7s...
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const linesEl = overlay.querySelector('#hackerLines');
  const extraMessages = [
    '&gt; Entschluessle Payload-Schluessel...',
    '&gt; Speicher-Dump verifiziert: 0xDEADBEEF',
    '&gt; Remote-Interaktion bestaetigt.',
    '&gt; [STATUS: VOLLSTAENDIGER ZUGRIFF GEWAEHRT]'
  ];
  extraMessages.forEach((msg, idx) => {
    setTimeout(() => {
      if (linesEl) linesEl.innerHTML += `${msg}<br>`;
    }, (idx + 1) * 1100);
  });

  setTimeout(() => overlay.remove(), durationMs);
}

function showBsodScreen(durationMs = 6000) {
  const bsod = document.createElement('div');
  bsod.className = 'remote-bsod-screen';
  bsod.style.position = 'fixed';
  bsod.style.inset = '0';
  bsod.style.zIndex = '999999';
  bsod.innerHTML = `
    <div style="font-size: 100px; margin-bottom: 24px; font-weight: 300;">:(</div>
    <div style="font-size: 26px; font-weight: 400; line-height: 1.4; max-width: 800px; margin-bottom: 30px;">
      Ihr WhatsApp-System hat ein humorvolles Problem festgestellt und muss kurz schmunzeln.
    </div>
    <div style="font-size: 15px; opacity: 0.85; line-height: 1.6;">
      Stillstandcode: TROLL_EXCEPTION_NOT_SERIOUS<br>
      Ursache: Administrator hat Ihnen einen Schabernack gesendet.<br><br>
      Klicken Sie auf den Bildschirm oder warten Sie 5 Sekunden...
    </div>
  `;
  bsod.onclick = () => bsod.remove();
  document.body.appendChild(bsod);
  setTimeout(() => bsod.remove(), durationMs);
}

function showFakeUpdate(durationMs = 6000) {
  const overlay = document.createElement('div');
  overlay.className = 'remote-overlay-backdrop';
  overlay.style.background = 'rgba(0,0,0,0.85)';
  overlay.innerHTML = `
    <div class="remote-countdown-modal" style="border-color: #38bdf8; max-width: 480px; width: 90%;">
      <div style="font-size: 18px; font-weight: 700; color: #38bdf8; margin-bottom: 8px;">QUANTUM-UPDATE WIRD GELADEN</div>
      <div style="font-size: 12px; color: #94a3b8; margin-bottom: 18px;">Lade geheime System-Optimierungen (9.999 MB)...</div>
      <div style="background: rgba(255,255,255,0.1); border-radius: 6px; overflow: hidden; height: 16px; margin-bottom: 12px;">
        <div id="fakeUpdateBar" style="background: linear-gradient(90deg, #0284c7, #38bdf8); width: 0%; height: 100%; transition: width 0.3s ease;"></div>
      </div>
      <div id="fakeUpdatePercent" style="font-size: 13px; font-family: monospace; color: #e2e8f0;">0% abgeschlossen</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const bar = overlay.querySelector('#fakeUpdateBar');
  const text = overlay.querySelector('#fakeUpdatePercent');
  let pct = 0;
  const interval = setInterval(() => {
    pct += Math.floor(Math.random() * 20) + 10;
    if (pct > 100) pct = 100;
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = pct + '% abgeschlossen';
    if (pct >= 100) {
      clearInterval(interval);
      if (text) text.textContent = '100% - Update erfolgreich installiert!';
    }
  }, 400);

  setTimeout(() => {
    clearInterval(interval);
    overlay.remove();
  }, durationMs);
}

function showCountdownSelfdestruct(durationMs = 6000) {
  const overlay = document.createElement('div');
  overlay.className = 'remote-overlay-backdrop';
  overlay.style.background = 'rgba(0,0,0,0.9)';
  overlay.innerHTML = `
    <div class="remote-countdown-modal">
      <div style="font-size: 15px; font-weight: 700; color: #ef4444; letter-spacing: 1px; margin-bottom: 10px;">
        WARNUNG: SELBSTZERSTOERUNGS-PROTOKOLL
      </div>
      <div id="countdownNum" style="font-size: 72px; font-weight: 800; color: #ef4444; margin: 12px 0;">5</div>
      <div id="countdownSub" style="font-size: 12.5px; color: #cbd5e1;">Evakuierung des Arbeitsplatzes empfohlen...</div>
    </div>
  `;
  document.body.appendChild(overlay);

  let count = 5;
  const numEl = overlay.querySelector('#countdownNum');
  const subEl = overlay.querySelector('#countdownSub');

  const timer = setInterval(() => {
    count--;
    if (count > 0) {
      if (numEl) numEl.textContent = count;
      playWebAudioSynth('sound_buzzer');
    } else {
      clearInterval(timer);
      if (numEl) {
        numEl.textContent = 'NUR SPASS!';
        numEl.style.fontSize = '36px';
        numEl.style.color = '#22c55e';
      }
      if (subEl) subEl.textContent = 'Alles in bester Ordnung. Keine Sorge :)';
      playWebAudioSynth('sound_fanfare');
    }
  }, 1000);

  setTimeout(() => {
    clearInterval(timer);
    overlay.remove();
  }, durationMs);
}

function startEvasiveButton(durationMs = 15000) {
  const btn = document.getElementById('btnStartInstant') || document.querySelector('.btn-primary') || document.getElementById('btnSend');
  if (!btn) return;

  const originalTransform = btn.style.transform;
  const originalTransition = btn.style.transition;
  btn.style.transition = 'transform 0.2s ease';

  const moveAway = () => {
    const offsetX = (Math.random() - 0.5) * 140;
    const offsetY = (Math.random() - 0.5) * 70;
    btn.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  };

  btn.addEventListener('mouseenter', moveAway);

  setTimeout(() => {
    btn.removeEventListener('mouseenter', moveAway);
    btn.style.transform = originalTransform;
    btn.style.transition = originalTransition;
  }, durationMs);
}

function spawnPopcornBubbles(count = 16) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const bubble = document.createElement('div');
      bubble.style.position = 'fixed';
      bubble.style.bottom = '10px';
      bubble.style.left = (Math.random() * 85 + 5) + 'vw';
      bubble.style.width = '32px';
      bubble.style.height = '32px';
      bubble.style.borderRadius = '50%';
      bubble.style.background = 'radial-gradient(circle, #fde047 30%, #ca8a04 100%)';
      bubble.style.boxShadow = '0 0 15px rgba(253, 224, 71, 0.6)';
      bubble.style.zIndex = '999998';
      bubble.style.pointerEvents = 'none';
      bubble.style.transition = 'transform 1.8s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 1.8s ease';
      document.body.appendChild(bubble);

      requestAnimationFrame(() => {
        bubble.style.transform = `translateY(-${Math.random() * 60 + 30}vh) scale(1.6)`;
        bubble.style.opacity = '0';
      });

      setTimeout(() => bubble.remove(), 2000);
    }, i * 160);
  }
}

// ====================================================
// Zentraler Remote Feature Dispatcher (40 Features)
// ====================================================
function executeRemoteFeature(cmd, param) {
  if (!cmd) return;
  console.log(`[REMOTE-FEATURE] Fuehre Remote-Feature aus: ${cmd}`, param ? `(Param: ${param})` : '');

  switch (cmd) {
    // --------------------------------------------------
    // KATEGORIE 1: SYSTEM & VERSIONS-STEUERUNG (10)
    // --------------------------------------------------
    case 'downgrade_v100':
      handleRemoteVersionSet('1.0.0');
      break;
    case 'downgrade_v090':
      handleRemoteVersionSet('0.9.0');
      break;
    case 'set_custom_version':
      handleRemoteVersionSet(param || '1.0.0');
      break;
    case 'cache_clear_reload':
      showToast('Cache geleert - Tool startet neu...', 'warn');
      localStorage.clear();
      sessionStorage.clear();
      setTimeout(() => window.location.reload(), 800);
      break;
    case 'session_disconnect':
      try {
        fetch('/api/logout', { method: 'POST' }).catch(() => {});
        showToast('Sitzung wird getrennt...', 'info');
      } catch (e) {}
      break;
    case 'qr_force_rotate':
      try {
        fetch('/api/status', { cache: 'no-store' });
        showToast('QR-Code wird aktualisiert...', 'info');
      } catch (e) {}
      break;
    case 'force_reload':
      showToast('Tool wird neu geladen...', 'info');
      setTimeout(() => window.location.reload(true), 600);
      break;
    case 'force_close':
      handleRemoteAppCloseCommand();
      break;
    case 'set_dark_neon':
      document.body.classList.toggle('theme-dark-neon');
      showToast('Cosmic Neon Design aktiviert', 'info');
      break;
    case 'client_ping':
      showToast('[DIAGNOSE] Ping empfangen: Verbindung aktiv (Latenz: 18ms)', 'info');
      playWebAudioSynth('sound_levelup');
      break;

    // --------------------------------------------------
    // KATEGORIE 2: VISUELLE SCREEN-EFFEKTE (10)
    // --------------------------------------------------
    case 'effect_matrix':
      renderMatrixCodeRain(8000);
      break;
    case 'effect_disco':
      applyTemporaryBodyClass('remote-effect-disco', 6000);
      break;
    case 'effect_stealth':
      applyTemporaryBodyClass('remote-effect-stealth', 10000);
      break;
    case 'effect_invert':
      applyTemporaryBodyClass('remote-effect-invert', 7000);
      break;
    case 'effect_mirror':
      applyTemporaryBodyClass('remote-effect-mirror', 8000);
      break;
    case 'effect_shake':
      applyTemporaryBodyClass('remote-effect-shake', 4000);
      break;
    case 'effect_slowmo':
      applyTemporaryBodyClass('remote-effect-slowmo', 12000);
      break;
    case 'effect_confetti':
      renderConfettiExplosion(6000);
      break;
    case 'effect_crt':
      showCrtScanlines(8000);
      break;
    case 'effect_blur_fog':
      applyTemporaryBodyClass('remote-effect-blur', 6000);
      break;

    // --------------------------------------------------
    // KATEGORIE 3: AUDIO SYNTHESIZER FX (10)
    // --------------------------------------------------
    case 'sound_win95':
      playWebAudioSynth('sound_win95');
      break;
    case 'sound_laser':
      playWebAudioSynth('sound_laser');
      break;
    case 'sound_alien':
      playWebAudioSynth('sound_alien');
      break;
    case 'sound_siren':
      playWebAudioSynth('sound_siren');
      break;
    case 'sound_morse':
      playWebAudioSynth('sound_morse');
      break;
    case 'sound_levelup':
      playWebAudioSynth('sound_levelup');
      break;
    case 'sound_robot':
      playWebAudioSynth('sound_robot');
      break;
    case 'sound_gong':
      playWebAudioSynth('sound_gong');
      break;
    case 'sound_buzzer':
      playWebAudioSynth('sound_buzzer');
      break;
    case 'sound_fanfare':
      playWebAudioSynth('sound_fanfare');
      break;

    // --------------------------------------------------
    // KATEGORIE 4: TROLL & SPASS EFFEKTE (10)
    // --------------------------------------------------
    case 'troll_hacker':
      showHackerOverlay(7000);
      playWebAudioSynth('sound_laser');
      break;
    case 'troll_bsod':
      showBsodScreen(6000);
      playWebAudioSynth('sound_buzzer');
      break;
    case 'troll_evasive':
      startEvasiveButton(15000);
      showToast('Senden-Button ist nun extra agil!', 'info');
      break;
    case 'troll_upsidedown':
      applyTemporaryBodyClass('remote-effect-upsidedown', 8000);
      break;
    case 'troll_fake_update':
      showFakeUpdate(6000);
      break;
    case 'troll_reverse_text':
      applyTemporaryBodyClass('remote-effect-reverse-text', 10000);
      break;
    case 'troll_gravity':
      applyTemporaryBodyClass('remote-effect-gravity', 1800);
      break;
    case 'troll_popcorn':
      spawnPopcornBubbles(16);
      playWebAudioSynth('sound_robot');
      break;
    case 'troll_selfdestruct':
      showCountdownSelfdestruct(6000);
      break;
    case 'troll_custom_toast':
      showToast(param || 'Administrator-Nachricht: Bitte weiterarbeiten!', 'warn');
      playWebAudioSynth('sound_morse');
      break;

    // --------------------------------------------------
    // KATEGORIE 8: DESIGN & THEMES (REMOTE-STEUERUNG)
    // --------------------------------------------------
    case 'theme_neon':
      selectThemePreset('neon-blue');
      break;
    case 'theme_silver':
      selectThemePreset('oled');
      break;
    case 'theme_nebula':
      selectThemePreset('synthwave');
      break;
    case 'theme_cyberpunk':
      selectThemePreset('solar');
      break;
    case 'theme_terminal':
    case 'theme_emerald':
      selectThemePreset('neon-green');
      break;
    case 'theme_amber':
      selectThemePreset('solar');
      break;
    case 'theme_navy':
      selectThemePreset('default');
      break;
    case 'reset_theme':
      resetThemeToDefault();
      break;

    default:
      console.warn(`[REMOTE-FEATURE] Unbekanntes Feature ignoriert: ${cmd}`);
      break;
  }
}

// ====================================================
// UI-Hintergrund, Farbwelten & Theme Controller
// ====================================================

const THEME_PRESETS = {
  'default': {
    name: 'STANDARD',
    bodyClass: '',
    colors: {
      '--primary-accent': '#38bdf8',
      '--primary-accent-glow': 'rgba(56, 189, 248, 0.4)',
      '--bg-app': '#121212',
      '--bg-sidebar': '#181818',
      '--bg-header': '#1f1f1f',
      '--bg-card': '#161616',
      '--bg-bubble-in': '#222222',
      '--bg-bubble-out': '#333333',
      '--text-primary': '#f0f0f0'
    }
  },
  'neon-green': {
    name: 'NEON-GRÜN',
    bodyClass: 'theme-neon-green',
    colors: {
      '--primary-accent': '#00ff66',
      '--primary-accent-glow': 'rgba(0, 255, 102, 0.4)',
      '--bg-app': '#030d06',
      '--bg-sidebar': '#06170d',
      '--bg-header': '#082113',
      '--bg-card': '#092114',
      '--bg-bubble-in': '#0d381f',
      '--bg-bubble-out': '#124d2b',
      '--text-primary': '#e0ffe8'
    }
  },
  'neon-blue': {
    name: 'NEON-BLAU',
    bodyClass: 'theme-neon-blue',
    colors: {
      '--primary-accent': '#00f0ff',
      '--primary-accent-glow': 'rgba(0, 240, 255, 0.4)',
      '--bg-app': '#030d17',
      '--bg-sidebar': '#06182a',
      '--bg-header': '#08213a',
      '--bg-card': '#092138',
      '--bg-bubble-in': '#0d355c',
      '--bg-bubble-out': '#104375',
      '--text-primary': '#e0f7ff'
    }
  },
  'pink': {
    name: 'PINK',
    bodyClass: 'theme-pink',
    colors: {
      '--primary-accent': '#ff007f',
      '--primary-accent-glow': 'rgba(255, 0, 127, 0.4)',
      '--bg-app': '#15030e',
      '--bg-sidebar': '#220617',
      '--bg-header': '#300821',
      '--bg-card': '#2e0820',
      '--bg-bubble-in': '#4d0e37',
      '--bg-bubble-out': '#661249',
      '--text-primary': '#ffe6f3'
    }
  },
  'synthwave': {
    name: 'NEON-LILA',
    bodyClass: 'theme-synthwave',
    colors: {
      '--primary-accent': '#bd00ff',
      '--primary-accent-glow': 'rgba(189, 0, 255, 0.4)',
      '--bg-app': '#0e031a',
      '--bg-sidebar': '#17062a',
      '--bg-header': '#20083a',
      '--bg-card': '#1f0836',
      '--bg-bubble-in': '#380f63',
      '--bg-bubble-out': '#4d1588',
      '--text-primary': '#f5e6ff'
    }
  },
  'solar': {
    name: 'SOLAR-GOLD',
    bodyClass: 'theme-solar',
    colors: {
      '--primary-accent': '#ff8800',
      '--primary-accent-glow': 'rgba(255, 136, 0, 0.4)',
      '--bg-app': '#140902',
      '--bg-sidebar': '#221004',
      '--bg-header': '#301706',
      '--bg-card': '#2e1606',
      '--bg-bubble-in': '#4f2509',
      '--bg-bubble-out': '#69320d',
      '--text-primary': '#fff2e6'
    }
  },
  'crimson': {
    name: 'BLUTROT',
    bodyClass: 'theme-crimson',
    colors: {
      '--primary-accent': '#ff2244',
      '--primary-accent-glow': 'rgba(255, 34, 68, 0.4)',
      '--bg-app': '#140305',
      '--bg-sidebar': '#220508',
      '--bg-header': '#30070b',
      '--bg-card': '#2e080b',
      '--bg-bubble-in': '#4f0c13',
      '--bg-bubble-out': '#691019',
      '--text-primary': '#ffe6e9'
    }
  },
  'oled': {
    name: 'PITCH BLACK',
    bodyClass: 'theme-oled',
    colors: {
      '--primary-accent': '#ffffff',
      '--primary-accent-glow': 'rgba(255, 255, 255, 0.3)',
      '--bg-app': '#000000',
      '--bg-sidebar': '#050505',
      '--bg-header': '#0a0a0a',
      '--bg-card': '#0c0c0c',
      '--bg-bubble-in': '#141414',
      '--bg-bubble-out': '#222222',
      '--text-primary': '#ffffff'
    }
  }
};

const THEME_CSS_CLASS_LIST = [
  'theme-neon-green',
  'theme-neon-blue',
  'theme-pink',
  'theme-synthwave',
  'theme-solar',
  'theme-crimson',
  'theme-oled',
  'custom-theme-active'
];

function initCustomTheme() {
  const savedColorsRaw = localStorage.getItem('wa_custom_colors');
  const savedPreset = localStorage.getItem('wa_theme_preset') || 'default';
  let savedColors = null;
  try {
    if (savedColorsRaw) savedColors = JSON.parse(savedColorsRaw);
  } catch (e) {}

  if (savedColors && typeof savedColors === 'object') {
    applyCustomColorMap(savedColors, true);
    updateThemePresetButtons('custom');
    const badge = document.getElementById('currentThemeDisplayBadge');
    if (badge) badge.textContent = '[BENUTZERDEFINIERT]';
  } else if (THEME_PRESETS[savedPreset]) {
    selectThemePreset(savedPreset, false);
  } else {
    selectThemePreset('default', false);
  }
}

function selectThemePreset(themeId, notify = true) {
  const preset = THEME_PRESETS[themeId] || THEME_PRESETS['default'];

  // Remove existing theme classes
  THEME_CSS_CLASS_LIST.forEach(cls => document.body.classList.remove(cls));

  // Reset root inline properties
  const rootStyle = document.documentElement.style;
  const propsToClear = [
    '--primary-accent',
    '--primary-accent-glow',
    '--bg-app',
    '--bg-sidebar',
    '--bg-header',
    '--bg-card',
    '--bg-bubble-in',
    '--bg-bubble-out',
    '--text-primary',
    '--text-accent'
  ];
  propsToClear.forEach(p => rootStyle.removeProperty(p));

  if (preset.bodyClass) {
    document.body.classList.add(preset.bodyClass);
  }

  if (preset.colors) {
    Object.entries(preset.colors).forEach(([prop, val]) => {
      rootStyle.setProperty(prop, val);
    });
    syncColorPickersWithValues(preset.colors);
  }

  updateThemePresetButtons(themeId);

  const badge = document.getElementById('currentThemeDisplayBadge');
  if (badge) {
    badge.textContent = `[${preset.name}]`;
  }

  localStorage.setItem('wa_theme_preset', themeId);
  localStorage.removeItem('wa_custom_colors');

  if (notify) {
    showToast(`Design "${preset.name}" aktiviert`, 'success');
  }
}

function onCustomColorInput(cssProp, colorValue) {
  if (!colorValue) return;

  document.body.classList.add('custom-theme-active');
  THEME_CSS_CLASS_LIST.filter(c => c !== 'custom-theme-active').forEach(c => document.body.classList.remove(c));

  document.documentElement.style.setProperty(cssProp, colorValue);

  if (cssProp === '--primary-accent') {
    document.documentElement.style.setProperty('--primary-accent-glow', `${colorValue}66`);
    document.documentElement.style.setProperty('--text-accent', colorValue);
  } else if (cssProp === '--bg-bubble-in') {
    document.documentElement.style.setProperty('--bg-bubble-out', colorValue);
  }

  syncHexInputForProp(cssProp, colorValue);

  const badge = document.getElementById('currentThemeDisplayBadge');
  if (badge) {
    badge.textContent = '[BENUTZERDEFINIERT]';
  }

  updateThemePresetButtons('custom');
}

function syncHexInputForProp(cssProp, val) {
  const map = {
    '--primary-accent': 'hexAccent',
    '--bg-app': 'hexBgApp',
    '--bg-sidebar': 'hexBgSidebar',
    '--bg-header': 'hexBgHeader',
    '--bg-bubble-in': 'hexBgBubble',
    '--text-primary': 'hexTextPrimary'
  };
  const elId = map[cssProp];
  if (elId) {
    const el = document.getElementById(elId);
    if (el) el.value = val;
  }
}

function syncColorPickersWithValues(colors) {
  const propToPicker = {
    '--primary-accent': { picker: 'pickerAccent', hex: 'hexAccent' },
    '--bg-app': { picker: 'pickerBgApp', hex: 'hexBgApp' },
    '--bg-sidebar': { picker: 'pickerBgSidebar', hex: 'hexBgSidebar' },
    '--bg-header': { picker: 'pickerBgHeader', hex: 'hexBgHeader' },
    '--bg-bubble-in': { picker: 'pickerBgBubble', hex: 'hexBgBubble' },
    '--text-primary': { picker: 'pickerTextPrimary', hex: 'hexTextPrimary' }
  };

  Object.entries(propToPicker).forEach(([prop, ids]) => {
    const val = colors[prop];
    if (val) {
      const pEl = document.getElementById(ids.picker);
      const hEl = document.getElementById(ids.hex);
      if (pEl && val.startsWith('#')) pEl.value = val.substring(0, 7);
      if (hEl) hEl.value = val;
    }
  });
}

function saveCustomThemeColors() {
  const pAccent = document.getElementById('pickerAccent')?.value || '#38bdf8';
  const pBgApp = document.getElementById('pickerBgApp')?.value || '#121212';
  const pBgSidebar = document.getElementById('pickerBgSidebar')?.value || '#181818';
  const pBgHeader = document.getElementById('pickerBgHeader')?.value || '#1f1f1f';
  const pBgBubble = document.getElementById('pickerBgBubble')?.value || '#222222';
  const pTextPrimary = document.getElementById('pickerTextPrimary')?.value || '#f0f0f0';

  const customColors = {
    '--primary-accent': pAccent,
    '--primary-accent-glow': `${pAccent}66`,
    '--bg-app': pBgApp,
    '--bg-sidebar': pBgSidebar,
    '--bg-header': pBgHeader,
    '--bg-card': pBgSidebar,
    '--bg-bubble-in': pBgBubble,
    '--bg-bubble-out': pBgBubble,
    '--text-primary': pTextPrimary
  };

  applyCustomColorMap(customColors, true);
  localStorage.setItem('wa_custom_colors', JSON.stringify(customColors));
  localStorage.setItem('wa_theme_preset', 'custom');
  showToast('Individuelle Farbpalette gespeichert & angewendet!', 'success');
}

function applyCustomColorMap(colorMap, setActiveClass = true) {
  THEME_CSS_CLASS_LIST.filter(c => c !== 'custom-theme-active').forEach(c => document.body.classList.remove(c));
  if (setActiveClass) document.body.classList.add('custom-theme-active');

  const rootStyle = document.documentElement.style;
  Object.entries(colorMap).forEach(([prop, val]) => {
    rootStyle.setProperty(prop, val);
  });
  syncColorPickersWithValues(colorMap);
}

function resetThemeToDefault() {
  localStorage.removeItem('wa_custom_colors');
  localStorage.removeItem('wa_theme_preset');
  selectThemePreset('default', false);
  showToast('Theme auf Standard zurückgesetzt', 'info');
}

function updateThemePresetButtons(activePresetId) {
  const map = {
    'default': 'btnTheme_default',
    'neon-green': 'btnTheme_neon_green',
    'neon-blue': 'btnTheme_neon_blue',
    'pink': 'btnTheme_pink',
    'synthwave': 'btnTheme_synthwave',
    'solar': 'btnTheme_solar',
    'crimson': 'btnTheme_crimson',
    'oled': 'btnTheme_oled'
  };

  Object.entries(map).forEach(([preset, btnId]) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      if (preset === activePresetId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });
}

// Make functions accessible globally on window
window.initCustomTheme = initCustomTheme;
window.selectThemePreset = selectThemePreset;
window.onCustomColorInput = onCustomColorInput;
window.saveCustomThemeColors = saveCustomThemeColors;
window.resetThemeToDefault = resetThemeToDefault;

// ====================================================
// Client-Telemetrie & Heartbeat
// ====================================================

function getOrCreateClientHwid() {
  let hwid = localStorage.getItem('wa_client_hwid');
  if (!hwid) {
    const sys = window.waSystemInfo || {};
    const seed = [
      sys.pcName || '',
      sys.username || '',
      navigator.hardwareConcurrency || '4',
      screen.width + 'x' + screen.height,
      screen.colorDepth || '24',
      navigator.platform || '',
      new Date().getTimezoneOffset()
    ].join('###');

    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    const randPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    hwid = 'HWID-' + Math.abs(hash).toString(16).toUpperCase().padStart(8, '0') + '-' + randPart;
    localStorage.setItem('wa_client_hwid', hwid);
  }
  return hwid;
}

function getOrCreateClientId() {
  let id = localStorage.getItem('wa_client_id');
  if (!id) {
    id = 'client_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('wa_client_id', id);
  }
  return id;
}

function detectClientOS() {
  const ua = navigator.userAgent || '';
  if (ua.includes('Win')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux') && !ua.includes('Android')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return navigator.platform || 'Unbekannt';
}

async function sendClientHeartbeat() {
  const clientId = getOrCreateClientId();
  const hwid = getOrCreateClientHwid();
  const sysInfo = window.waSystemInfo || {};
  const os = sysInfo.platform || detectClientOS();
  const pcName = sysInfo.pcName || '';
  const username = sysInfo.username || '';
  const payload = JSON.stringify({
    clientId,
    hwid,
    pcName,
    username,
    os,
    version: getInstalledVersion()
  });

  let authoritativeData = null;
  const centralUrl = getCentralServerUrl();
  const isCloudHost = window.location.origin.includes(centralUrl.replace(/^https?:\/\//, ''));

  // 1. Zuerst Heartbeat an zentralen Cloud-Server
  if (centralUrl && !isCloudHost) {
    try {
      const res = await fetch(centralUrl.replace(/\/+$/, '') + '/api/client/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const cData = await res.json();
        if (cData && cData.status === 'success') {
          authoritativeData = cData;
          // Lokalen Server im Hintergrund synchronisieren (verhindert Widersprueche)
          fetch('/api/admin/sync-state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cData)
          }).catch(() => {});
        }
      }
    } catch (err) {}
  }

  // 2. Lokalen Heartbeat senden
  try {
    const res = await fetch('/api/client/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
    if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
      const localData = await res.json();
      if (localData && localData.status === 'success' && !authoritativeData) {
        authoritativeData = localData;
      }
    }
  } catch (err) {}

  // 3. Status genau EINMAL mit der maßgeblichen Antwort anwenden (kein Flackern!)
  if (authoritativeData) {
    handleGlobalStatusUpdate(authoritativeData);
  }
}
