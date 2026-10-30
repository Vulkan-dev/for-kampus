/**
 * Water Invoice Maker - Application Logic
 * Professional Matte Dark Architecture with Full Data Editing & Multi-Format Exports
 */

// ==========================================================
// Corporate Session & Authentication Manager (SessionStorage)
// ==========================================================
let authUser = null;

function getAuthToken() {
  return sessionStorage.getItem('mega_mall_auth_token') || localStorage.getItem('mega_mall_auth_token');
}

function setAuthSession(token, user) {
  if (token) {
    sessionStorage.setItem('mega_mall_auth_token', token);
    localStorage.setItem('mega_mall_auth_token', token);
  }
  if (user) {
    sessionStorage.setItem('mega_mall_auth_user', JSON.stringify(user));
    localStorage.setItem('mega_mall_auth_user', JSON.stringify(user));
    authUser = user;
  }
}

// Active Realtime Session Heartbeat (detects user deletion within seconds)
let sessionHeartbeatTimer = null;
function startSessionHeartbeat() {
  if (sessionHeartbeatTimer) clearInterval(sessionHeartbeatTimer);
  sessionHeartbeatTimer = setInterval(async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch('/api/auth/verify', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) {
        clearAuthSession();
        showLoginPortal("Your account has been removed or credentials changed by administrator. Logged out.");
        showToast("Account removed by administrator. Logged out.", "error");
      }
    } catch (e) {
      // network hiccup, ignore
    }
  }, 3000);
}

function stopSessionHeartbeat() {
  if (sessionHeartbeatTimer) {
    clearInterval(sessionHeartbeatTimer);
    sessionHeartbeatTimer = null;
  }
}

function clearAuthSession() {
  sessionStorage.removeItem('mega_mall_auth_token');
  sessionStorage.removeItem('mega_mall_auth_user');
  localStorage.removeItem('mega_mall_auth_token');
  localStorage.removeItem('mega_mall_auth_user');
  authUser = null;
  stopSessionHeartbeat();
}

// Authenticated Fetch Wrapper
async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = Object.assign({}, options.headers || {});
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  options.headers = headers;

  const response = await fetch(url, options);
  if (response.status === 401) {
    clearAuthSession();
    showLoginPortal("Your session was revoked or account removed. Please sign in again.");
    throw new Error("Unauthorized - session revoked");
  }
  return response;
}

function showLoginPortal(errorMessage = "") {
  const overlay = document.getElementById("loginScreen");
  const errEl = document.getElementById("loginErrorAlert");
  if (overlay) overlay.classList.remove("hidden");
  if (errEl && !rateLimitTimers.standard) {
    if (errorMessage) {
      errEl.textContent = errorMessage;
      errEl.className = "login-error-alert";
      errEl.style.display = "block";
    } else {
      errEl.style.display = "none";
    }
  }
  checkIpRateLimitStatus('standard');
}

function hideLoginPortal() {
  const overlay = document.getElementById("loginScreen");
  if (overlay) overlay.classList.add("hidden");
}

async function checkAuthSession() {
  const token = getAuthToken();
  const storedUser = sessionStorage.getItem('mega_mall_auth_user') || localStorage.getItem('mega_mall_auth_user');
  if (storedUser) {
    try { authUser = JSON.parse(storedUser); } catch (e) {}
  }

  if (!token) {
    showLoginPortal();
    return false;
  }

  try {
    const res = await fetch('/api/auth/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.valid) {
        authUser = data.user;
        hideLoginPortal();
        startSessionHeartbeat();
        return true;
      }
    }
  } catch (e) {
    console.warn("Auth verification network error:", e);
    // If offline or network disconnected, allow cached authenticated session to continue offline!
    if (!navigator.onLine || (e && (e.name === 'TypeError' || String(e).includes('Failed to fetch')))) {
      if (token && authUser) {
        hideLoginPortal();
        return true;
      }
    }
  }

  clearAuthSession();
  showLoginPortal();
  return false;
}

// ==========================================================
// Rate Limiter Realtime Countdown Manager
// ==========================================================
const rateLimitTimers = {
  standard: null,
  kernelx: null
};

function formatCountdownTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function startRateLimitCountdown({ btn, textEl, alertEl, defaultText, remainingSeconds, lockedUntil, key = 'standard' }) {
  if (!btn) return;

  if (rateLimitTimers[key]) {
    clearInterval(rateLimitTimers[key]);
    rateLimitTimers[key] = null;
  }

  const targetTime = lockedUntil ? Number(lockedUntil) : Date.now() + (remainingSeconds * 1000);

  btn.disabled = true;
  btn.classList.add("rate-limited-btn");

  function tick() {
    const now = Date.now();
    const secLeft = Math.max(0, Math.ceil((targetTime - now) / 1000));

    if (secLeft <= 0) {
      clearInterval(rateLimitTimers[key]);
      rateLimitTimers[key] = null;

      btn.disabled = false;
      btn.classList.remove("rate-limited-btn");
      if (textEl) textEl.textContent = defaultText;

      if (alertEl) {
        alertEl.style.display = "block";
        alertEl.className = "login-success-alert";
        alertEl.textContent = "Rate limit lock expired. You may now attempt to sign in.";
      }
      return;
    }

    const timeStr = formatCountdownTime(secLeft);
    if (textEl) {
      textEl.textContent = `Locked (${timeStr})`;
    }

    if (alertEl) {
      alertEl.style.display = "block";
      alertEl.className = "login-error-alert";
      alertEl.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> <strong>Access Temporarily Locked:</strong> Too many failed attempts. Button will unlock in <span class="rate-limit-timer-val">${timeStr}</span>`;
    }
  }

  tick();
  rateLimitTimers[key] = setInterval(tick, 1000);
}

async function checkIpRateLimitStatus(key = 'standard') {
  try {
    const res = await fetch('/api/auth/ratelimit-status');
    const data = await res.json();
    if (data.locked && data.remainingSeconds > 0) {
      if (key === 'standard') {
        const btn = document.getElementById("loginSubmitBtn");
        const textEl = document.getElementById("loginSubmitText");
        const alertEl = document.getElementById("loginErrorAlert");
        startRateLimitCountdown({
          btn,
          textEl,
          alertEl,
          defaultText: "Sign In",
          remainingSeconds: data.remainingSeconds,
          lockedUntil: data.lockedUntil,
          key: 'standard'
        });
      } else if (key === 'kernelx') {
        const btn = document.getElementById("kernelxLoginSubmitBtn");
        const textEl = document.getElementById("kernelxLoginSubmitText");
        const alertEl = document.getElementById("kernelxLoginAlert");
        startRateLimitCountdown({
          btn,
          textEl,
          alertEl,
          defaultText: "Authorize Master Access",
          remainingSeconds: data.remainingSeconds,
          lockedUntil: data.lockedUntil,
          key: 'kernelx'
        });
      }
    }
  } catch (e) {}
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const userEl = document.getElementById("loginUsername");
  const passEl = document.getElementById("loginPassword");
  const submitBtn = document.getElementById("loginSubmitBtn");
  const submitText = document.getElementById("loginSubmitText");
  const errorEl = document.getElementById("loginErrorAlert");

  const username = userEl.value.trim();
  const password = passEl.value;

  if (!username || !password) {
    errorEl.textContent = "Please enter both username and password.";
    errorEl.className = "login-error-alert";
    errorEl.style.display = "block";
    return;
  }

  submitBtn.disabled = true;
  submitText.textContent = "Verifying Credentials...";
  errorEl.style.display = "none";

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.status === 429) {
      startRateLimitCountdown({
        btn: submitBtn,
        textEl: submitText,
        alertEl: errorEl,
        defaultText: "Sign In",
        remainingSeconds: data.remainingSeconds || 900,
        lockedUntil: data.lockedUntil,
        key: 'standard'
      });
      return;
    }

    if (!res.ok) {
      throw new Error(data.error || "Authentication failed.");
    }

    setAuthSession(data.token, data.user);
    hideLoginPortal();
    passEl.value = "";
    showToast(`Welcome, ${data.user.username}!`, "success");

    await loadProjectStateFromDatabase();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.className = "login-error-alert";
    errorEl.style.display = "block";
  } finally {
    if (!rateLimitTimers.standard) {
      submitBtn.disabled = false;
      submitText.textContent = "Sign In";
    }
  }
}

async function handleLogout() {
  try {
    await authFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  } catch (e) {}
  clearAuthSession();
  showLoginPortal("You have been signed out.");
  showToast("Logged out successfully.", "info");
}

// Preset Configurations
const PRESETS = {
  falaknaz: {
    "occupier": "FALAKNAZ SPRINGS,",
    "location": "The Mega Mall, Block-18, Gulishtan-e-Jauhar, Karachi.,",
    "ntn": "C951537",
    "startMonth": "2024-01",
    "endMonth": "2026-07",
    "invPrefix": "#INV-01-",
    "invStartNum": 1,
    "invSuffix": "",
    "seqMode": "month_year",
    "autoSuffixYear": false,
    "includePrevBalance": true,
    "prevBalanceMode": "cumulative",
    "openingBalance": 0,
    "rates": {
        "2024": {
            "rate": 2.25,
            "gallons": 53759
        },
        "2025": {
            "rate": 2.25,
            "gallons": 137788
        },
        "2026": {
            "rate": 2.25,
            "gallons": 170957
        }
    },
    "manualCorrections": {}
  },
    mega: {
    occupier: "MEGA RESIDENCY,",
    location: "The Mega Mall, Block-18, Gulishtan-e-Jauhar, Karachi.,",
    ntn: "C951537",
    startMonth: "2024-01",
    endMonth: "2026-07",
    invPrefix: "#INV-",
    invStartNum: 1001,
    invSuffix: "-051026",
    includePrevBalance: false,
    prevBalanceMode: "zero",
    rates: {
      "2024": { rate: 1.25, gallons: 60000 },
      "2025": { rate: 1.25, gallons: 90000 },
      "2026": { rate: 1.25, gallons: 120000 }
    }
  }
};

const DEFAULT_TABLE_COLUMNS = [
  { id: 'gallons', label: 'CONSUMPTION GALLON', widthPct: 26.12, type: 'number', required: true },
  { id: 'rate', label: 'RATE PER\nGALLON', widthPct: 16.46, type: 'number', required: true },
  { id: 'billAmount', label: 'BILL\nAMOUNT', widthPct: 19.14, type: 'number', required: true },
  { id: 'previous', label: 'PREVIOUS', widthPct: 18.94, type: 'number', required: true },
  { id: 'totalPayable', label: 'TOTAL PAYABLE', widthPct: 19.34, type: 'number', required: true }
];

// Global App State
let appState = {
  occupier: "FALAKNAZ SPRINGS,",
  location: "The Mega Mall, Block-18, Gulishtan-e-Jauhar, Karachi.,",
  ntn: "C951537",
  startMonth: "2024-01",
  endMonth: "2026-07",
  invPrefix: "#INV-01-",
  invStartNum: 1,
  invSuffix: "",
  seqMode: "month_year",
  autoSuffixYear: false,
  includePrevBalance: true,
  prevBalanceMode: "cumulative",
  openingBalance: 0,
  yearRates: {
    "2024": { rate: 2.25, gallons: 53759 },
    "2025": { rate: 2.25, gallons: 137788 },
    "2026": { rate: 2.25, gallons: 170957 }
  },
  manualCorrections: JSON.parse(JSON.stringify(PRESETS.falaknaz.manualCorrections || {})),
  tableColumns: JSON.parse(JSON.stringify(DEFAULT_TABLE_COLUMNS)),
  currentPageIndex: 0,
  viewAllPages: false,
  activeTab: "preview"
};

function sanitizeAndMigrateState(state) {
  if (!state) return state;
  // If not explicitly set to incremental, default to month_year
  if (!state.seqMode || state.seqMode === "default" || (state.occupier && state.occupier.toUpperCase().includes("FALAKNAZ"))) {
    state.seqMode = "month_year";
  }
  // Ensure invPrefix for month_year is #INV-01-
  if (state.seqMode === "month_year") {
    if (!state.invPrefix || state.invPrefix === "#INV-" || state.invPrefix === "#INV" || state.invPrefix === "INV-" || state.invPrefix === "INV") {
      state.invPrefix = "#INV-01-";
    }
  }
  // Upgrade any outdated invoice numbers in manual corrections
  if (state.manualCorrections && state.seqMode === "month_year") {
    Object.entries(state.manualCorrections).forEach(([ym, corr]) => {
      if (corr && corr.invoiceNumber) {
        const num = String(corr.invoiceNumber).trim();
        if (/^#INV-\d{2}-\d{4}$/.test(num) || /^#INV-01-\d{4}$/.test(num) || /^#INV-\d{4}/.test(num)) {
          const [y, m] = ym.split("-");
          corr.invoiceNumber = `#INV-01-${m}-${y}`;
        }
      }
    });
  }
  // Purge any frozen/stale calculations from old synthetic preset dumps
  if (state.manualCorrections && typeof state.manualCorrections === 'object') {
    const keys = Object.keys(state.manualCorrections);
    const hasStaticDump = keys.some(k => {
      const c = state.manualCorrections[k];
      return c && (c.rate === 2.25 || c.rate === 1.25) && c.manualBillAmountEnabled;
    });
    if (hasStaticDump) {
      keys.forEach(k => {
        const c = state.manualCorrections[k];
        if (c) {
          delete c.rate;
          delete c.gallons;
          delete c.billAmount;
          delete c.previous;
          delete c.totalPayable;
          delete c.manualBillAmountEnabled;
        }
        if (Object.keys(c || {}).length === 0) {
          delete state.manualCorrections[k];
        }
      });
    }
  }
  return state;
}

// Synchronously restore cached local state on startup so refresh never flashes or resets to defaults
try {
  const localSaved = localStorage.getItem('mega_mall_project_state');
  if (localSaved) {
    const parsed = JSON.parse(localSaved);
    if (parsed && typeof parsed === 'object') {
      if (!parsed.tableColumns || !Array.isArray(parsed.tableColumns) || parsed.tableColumns.length === 0) {
        parsed.tableColumns = JSON.parse(JSON.stringify(DEFAULT_TABLE_COLUMNS));
      }
      appState = Object.assign({}, appState, parsed);
      appState = sanitizeAndMigrateState(appState);
    }
  }
} catch (e) {
  console.warn("Could not load initial cached state:", e);
}

// ==========================================================
// Database Persistence Manager (Atomic Server DB + Local Backup)
// ==========================================================
let dbSaveTimer = null;
let isDbSaving = false;

function updateDbSyncStatus(status, text) {
  const badge = document.getElementById("dbSyncBadge");
  const textEl = document.getElementById("dbSyncText");
  if (!badge) return;
  badge.classList.remove("saving", "error", "synced");
  if (status === "saving") {
    badge.classList.add("saving");
    if (textEl) textEl.textContent = text || "Saving to DB...";
  } else if (status === "error") {
    badge.classList.add("error");
    if (textEl) textEl.textContent = text || "Sync Failed";
  } else {
    badge.classList.add("synced");
    if (textEl) textEl.textContent = text || "Database Synced";
  }
}

async function saveProjectStateToDatabase(isManual = false) {
  try {
    localStorage.setItem('mega_mall_project_state', JSON.stringify(appState));
  } catch (e) {}

  updateDbSyncStatus("saving", isManual ? "Saving to DB..." : "Auto-saving...");
  isDbSaving = true;

  try {
    const res = await authFetch('/api/project/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appState)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    updateDbSyncStatus("synced", "Database Synced");
    if (isManual) {
      showToast("Progress successfully saved to database!", "success");
    }
  } catch (err) {
    console.warn("Database save error:", err);
    updateDbSyncStatus("error", "Offline / Local");
    if (isManual) {
      showToast("Could not save to server database. Saved locally.", "warning");
    }
  } finally {
    isDbSaving = false;
  }
}

function debouncedSaveProjectState(delay = 600) {
  if (dbSaveTimer) clearTimeout(dbSaveTimer);
  updateDbSyncStatus("saving", "Saving...");
  dbSaveTimer = setTimeout(() => {
    saveProjectStateToDatabase(false);
  }, delay);
}

async function loadProjectStateFromDatabase() {
  let loadedState = null;
  try {
    const res = await authFetch('/api/project/state');
    if (res.ok) {
      const data = await res.json();
      if (data && data.state && typeof data.state === 'object') {
        loadedState = data.state;
      }
    }
  } catch (e) {
    console.warn("Failed to fetch state from server, falling back to localStorage", e);
  }

  if (!loadedState) {
    try {
      const local = localStorage.getItem('mega_mall_project_state');
      if (local) loadedState = JSON.parse(local);
    } catch (e) {}
  }

  if (loadedState) {
    if (!loadedState.tableColumns || !Array.isArray(loadedState.tableColumns) || loadedState.tableColumns.length === 0) {
      loadedState.tableColumns = JSON.parse(JSON.stringify(DEFAULT_TABLE_COLUMNS));
    }
    appState = Object.assign({}, appState, loadedState);
    appState = sanitizeAndMigrateState(appState);
    try {
      localStorage.setItem('mega_mall_project_state', JSON.stringify(appState));
    } catch (e) {}
    updateDbSyncStatus("synced", "Database Synced");
  }
  syncInputsWithState();
  updateYearConfigsUI();
  renderPreview();
  renderDataEditor();

  // Restore active tab (preview vs editor)
  if (appState.activeTab) {
    switchTab(appState.activeTab);
  }
}

// Date Strings and Calendar Math
const MONTH_NAMES_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "March", "April", "May", "June",
  "July", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function normalizeMonthNames(str) {
  if (!str) return "";
  return str
    .replace(/\bMar\b/gi, "March")
    .replace(/\bApr\b/gi, "April")
    .replace(/\bJun\b/gi, "June")
    .replace(/\bJul\b/gi, "July");
}

function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getDaysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function formatNumber(num) {
  if (num === undefined || num === null || isNaN(num)) return "0";
  return Math.round(num).toLocaleString("en-US");
}

// Convert numbers into exact English words format e.g. (Rupees One Hundred Twenty Thousand Nine Hundred Fifty-Eight Only)
function numberToWords(num) {
  num = Math.round(Number(num) || 0);
  if (num === 0) return 'Zero';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertHundreds(n) {
    let str = '';
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)];
      if (n % 10 > 0) str += '-' + ones[n % 10];
      str += ' ';
    } else if (n > 0) {
      str += ones[n] + ' ';
    }
    return str.trim();
  }

  let result = '';
  const millions = Math.floor(num / 1000000);
  num %= 1000000;
  const thousands = Math.floor(num / 1000);
  const remainder = num % 1000;

  if (millions > 0) {
    result += convertHundreds(millions) + ' Million ';
  }
  if (thousands > 0) {
    result += convertHundreds(thousands) + ' Thousand ';
  }
  if (remainder > 0) {
    result += convertHundreds(remainder);
  }

  return result.trim();
}

function formatAmountInWords(amount) {
  const words = numberToWords(amount);
  return `(Rupees ${words} Only)`;
}

// ----------------------------------------------------------
// Website-Themed Notification & Dialog System (No Browser Popups)
// ----------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const iconSvg = type === 'success'
    ? `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px;height:16px;color:var(--accent-green);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`
    : type === 'error'
    ? `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px;height:16px;color:var(--accent-red);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
    : `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px;height:16px;color:var(--accent-amber);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;

  toast.innerHTML = `
    <div style="display:flex; align-items:center; gap:0.5rem;">
      ${iconSvg}
      <span>${message}</span>
    </div>
    <button class="toast-close-btn">&times;</button>
  `;

  toast.querySelector(".toast-close-btn").addEventListener("click", () => {
    toast.remove();
  });

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.3s, transform 0.3s";
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

let confirmCallback = null;
function showConfirm(title, message, onConfirm) {
  document.getElementById("confirmModalTitle").textContent = title;
  document.getElementById("confirmModalMessage").textContent = message;
  confirmCallback = onConfirm;
  document.getElementById("confirmModalBackdrop").classList.add("open");
}

function closeConfirmModal() {
  document.getElementById("confirmModalBackdrop").classList.remove("open");
  confirmCallback = null;
}

// Current Date in YYYY-MM
function getCurrentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Validates date selection with error and warning handling
function updateBillingDate(type, newYM) {
  if (!/^\d{4}-\d{2}$/.test(newYM)) return false;

  const currentYM = getCurrentYearMonth();
  const isStart = type === "start";
  const candidateStart = isStart ? newYM : appState.startMonth;
  const candidateEnd = isStart ? appState.endMonth : newYM;

  // 1. Error: Start month cannot be greater than End month
  if (candidateStart > candidateEnd) {
    showToast(`Error: Start month (${candidateStart}) cannot be later than end month (${candidateEnd}).`, "error");
    const startInput = document.getElementById("startMonthInput");
    const endInput = document.getElementById("endMonthInput");
    if (startInput) startInput.value = appState.startMonth;
    if (endInput) endInput.value = appState.endMonth;
    return false;
  }

  // 2. Error: If someone selects a future date for Start Month
  if (candidateStart > currentYM) {
    showToast(`Error: Start month (${candidateStart}) cannot be set to a future date beyond current date (${currentYM}).`, "error");
    const startInput = document.getElementById("startMonthInput");
    if (startInput) startInput.value = appState.startMonth;
    return false;
  }

  // 3. Warning Check: If End Month is more than current date (e.g. current is 2026 and selected is 2027)
  // Proceed with invoice generation but trigger warning notification
  if (candidateEnd > currentYM) {
    showToast(`Warning: End month (${candidateEnd}) extends into future dates beyond current date (${currentYM}). Proceeding with projected billing...`, "warning");
  }

  appState.startMonth = candidateStart;
  appState.endMonth = candidateEnd;

  const startInput = document.getElementById("startMonthInput");
  const endInput = document.getElementById("endMonthInput");
  if (startInput) startInput.value = candidateStart;
  if (endInput) endInput.value = candidateEnd;

  updateYearConfigsUI();
  renderPreview();
  renderDataEditor();
  debouncedSaveProjectState();
  return true;
}

// Future-proof Year-based Suffix Changer
function getEffectiveSuffix(m) {
  if (!appState.autoSuffixYear) {
    return appState.invSuffix || "";
  }
  const rawSuffix = appState.invSuffix || "";
  const year2d = String(m.year).slice(-2); // e.g. "24", "25", "26", "27"
  if (/\d{2}$/.test(rawSuffix)) {
    return rawSuffix.replace(/\d{2}$/, year2d);
  }
  if (/\{yy\}/i.test(rawSuffix)) {
    return rawSuffix.replace(/\{yy\}/i, year2d);
  }
  return `${rawSuffix}-${year2d}`;
}

// Generate months array between start and end
function generateMonthsList(startYM, endYM) {
  const [sY, sM] = (startYM || "2024-01").split("-").map(Number);
  const [eY, eM] = (endYM || "2026-07").split("-").map(Number);
  
  const list = [];
  let curY = sY;
  let curM = sM;

  while (curY < eY || (curY === eY && curM <= eM)) {
    const ymString = `${curY}-${String(curM).padStart(2, '0')}`;
    const daysInMonth = getDaysInMonth(curY, curM - 1);
    const fullMonthName = MONTH_NAMES_FULL[curM - 1];
    const shortMonthName = MONTH_NAMES_SHORT[curM - 1];

    list.push({
      ym: ymString,
      year: curY,
      month: curM,
      daysInMonth: daysInMonth,
      fullMonthName: fullMonthName,
      shortMonthName: shortMonthName
    });

    curM++;
    if (curM > 12) {
      curM = 1;
      curY++;
    }
  }

  return list;
}

// Helper functions for dynamic table columns
function getActiveColumns() {
  if (appState.tableColumns && Array.isArray(appState.tableColumns) && appState.tableColumns.length > 0) {
    return appState.tableColumns;
  }
  return DEFAULT_TABLE_COLUMNS;
}

function getColumnWidthStyles(cols) {
  const isExactDefault = cols.length === 5 &&
    cols[0].id === 'gallons' &&
    cols[1].id === 'rate' &&
    cols[2].id === 'billAmount' &&
    cols[3].id === 'previous' &&
    cols[4].id === 'totalPayable';

  if (isExactDefault) {
    const defaultPcts = [26.12, 16.46, 19.14, 18.94, 19.34];
    return cols.map((c, i) => `${defaultPcts[i]}%`);
  }

  // Auto-adjusting proportional widths totaling 100%
  const sumWeights = cols.reduce((sum, c) => sum + (Number(c.widthPct) || (100 / cols.length)), 0);
  return cols.map(c => {
    const w = Number(c.widthPct) || (100 / cols.length);
    return `${((w / sumWeights) * 100).toFixed(2)}%`;
  });
}

function renderInvoiceTableCells(inv, cols) {
  return cols.map(col => {
    let text = "";
    if (col.id === 'gallons') {
      text = inv.gallons ? String(inv.gallons).replace(/,/g, '') : "0";
    } else if (col.id === 'rate') {
      text = Number(inv.rate).toFixed(2);
    } else if (col.id === 'billAmount') {
      text = `${formatNumber(inv.billAmount)}/-`;
    } else if (col.id === 'previous') {
      text = inv.previous === 0 ? "0" : `${formatNumber(inv.previous)}`;
    } else if (col.id === 'totalPayable') {
      text = `${formatNumber(inv.totalPayable)}/-`;
    } else {
      const rawVal = (inv.customValues && inv.customValues[col.id] !== undefined)
        ? inv.customValues[col.id]
        : (col.defaultValue || "");
      if (col.type === 'currency' && rawVal !== "") {
        text = `${formatNumber(rawVal)}/-`;
      } else if (col.type === 'number' && rawVal !== "") {
        text = String(rawVal).replace(/,/g, '');
      } else {
        text = escapeHtml(String(rawVal || ""));
      }
    }
    return `<td>${text}</td>`;
  }).join('');
}

// Compute all invoice objects
function calculateInvoices() {
  const months = generateMonthsList(appState.startMonth, appState.endMonth);
  let runningPrevious = appState.openingBalance || 0;

  return months.map((m, index) => {
    const yearConfig = appState.yearRates[m.year] || { rate: 2.25, gallons: 50000 };
    
    let gallons = yearConfig.gallons || 50000;
    if (yearConfig.overrides && yearConfig.overrides[m.ym] !== undefined) {
      gallons = yearConfig.overrides[m.ym];
    }
    let rate = yearConfig.rate || 2.25;
    
    let invNum = "";
    const isMonthlySeq = (appState.seqMode === "month_year" || !appState.seqMode || appState.seqMode === "month" || (appState.invPrefix && appState.invPrefix.includes("01")));
    if (isMonthlySeq) {
      const mm = String(m.month).padStart(2, '0');
      let pfx = (appState.invPrefix || "#INV-01-").trim();
      // If user typed whole pattern like #INV-01-01-2024 into prefix field
      if (/#INV-\d+-\d{2}-\d{4}/i.test(pfx)) {
        const pm = pfx.match(/^([#A-Za-z0-9]+-\d+-)/);
        if (pm) pfx = pm[1];
      }
      if (pfx === "#INV-" || pfx === "#INV" || pfx === "INV-" || pfx === "INV") {
        pfx = "#INV-01-";
      } else if (!pfx.endsWith("-")) {
        pfx += "-";
      }
      invNum = `${pfx}${mm}-${m.year}`;
    } else {
      const effectiveSuffix = getEffectiveSuffix(m);
      invNum = `${appState.invPrefix || "#INV-"}${appState.invStartNum + index}${effectiveSuffix}`;
    }

    let previous = 0;
    if (appState.includePrevBalance) {
      if (appState.prevBalanceMode === "cumulative") {
        previous = runningPrevious;
      } else {
        previous = index === 0 ? appState.openingBalance : 0;
      }
    }

    let billingPeriod = normalizeMonthNames(`${m.fullMonthName} ${m.year} (1 ${m.shortMonthName} ${m.year} to ${m.daysInMonth} ${m.shortMonthName} ${m.year}).`);
    let issueDate = normalizeMonthNames(`${getOrdinal(m.daysInMonth)} ${m.shortMonthName} ${m.year}`);

    // Apply manual corrections if present
    const custom = appState.manualCorrections[m.ym] || {};
    if (custom.invoiceNumber !== undefined && custom.invoiceNumber !== "") {
      let customNum = String(custom.invoiceNumber).trim();
      if (/^#INV-\d{2}-\d{4}$/.test(customNum) || /^#INV-01-\d{4}$/.test(customNum)) {
        customNum = `#INV-01-${String(m.month).padStart(2, '0')}-${m.year}`;
      }
      invNum = customNum;
    }
    if (custom.billingPeriod !== undefined && custom.billingPeriod !== "") billingPeriod = normalizeMonthNames(custom.billingPeriod);
    if (custom.issueDate !== undefined && custom.issueDate !== "") issueDate = normalizeMonthNames(custom.issueDate);
    if (custom.gallons !== undefined && custom.gallons !== "") gallons = Number(custom.gallons);
    if (custom.rate !== undefined && custom.rate !== "") rate = Number(custom.rate);
    if (custom.previous !== undefined && custom.previous !== "") previous = Number(custom.previous);

    const autoBill = Math.round(gallons * rate);
    let billAmount = autoBill;
    let isManualBill = false;

    // 1. Year-level manual bill setting
    if (yearConfig.manualBillAmountEnabled && yearConfig.manualBillAmount !== undefined && yearConfig.manualBillAmount !== null && yearConfig.manualBillAmount !== "") {
      billAmount = Number(yearConfig.manualBillAmount);
      isManualBill = true;
    }

    // 2. Row-level manual bill setting (takes precedence if explicitly enabled or disabled)
    if (custom.manualBillAmountEnabled === true && custom.billAmount !== undefined && custom.billAmount !== "") {
      billAmount = Number(custom.billAmount);
      isManualBill = true;
    } else if (custom.manualBillAmountEnabled === false) {
      // User explicitly toggled manual off for this row -> force autoBill
      billAmount = autoBill;
      isManualBill = false;
    } else if (custom.billAmount !== undefined && custom.billAmount !== "") {
      billAmount = Number(custom.billAmount);
      isManualBill = true;
    }

    const totalPayable = (custom.totalPayable !== undefined && custom.totalPayable !== "") 
      ? Number(custom.totalPayable) 
      : (billAmount + previous);

    if (appState.includePrevBalance && appState.prevBalanceMode === "cumulative") {
      runningPrevious = totalPayable;
    }

    return {
      index,
      ym: m.ym,
      year: m.year,
      monthName: m.fullMonthName,
      shortMonthName: m.shortMonthName,
      invoiceNumber: invNum,
      billingPeriod: normalizeMonthNames(billingPeriod),
      issueDate: normalizeMonthNames(issueDate),
      gallons,
      rate,
      billAmount,
      autoBill,
      isManualBill,
      previous,
      totalPayable,
      customValues: custom
    };
  });
}

// Render a single invoice sheet with exact template layout & guaranteed visible grids
function renderInvoiceSheet(inv) {
  const cols = getActiveColumns();
  const widths = getColumnWidthStyles(cols);

  const tableHeadHtml = cols.map((col, i) => {
    const labelHtml = escapeHtml(col.label).replace(/\n/g, '<br>');
    return `<th style="width:${widths[i]};">${labelHtml}</th>`;
  }).join('');

  const tableBodyHtml = renderInvoiceTableCells(inv, cols);

  return `
    <div class="invoice-sheet" id="invoice-page-${inv.index}">
      <!-- Header -->
      <div class="inv-header">
        <div class="inv-logo-left">
          <img src="assets/mega-mall-logo.png" alt="THE MEGA MALL" style="width:96pt; height:79.5pt; object-fit:contain; display:block;" />
        </div>
        <div class="inv-title-center">
          <h1>THE MEGA MALL</h1>
          <p>Official Billing Invoice / Reimburstment Note</p>
        </div>
        <div class="inv-logo-right">
          <img src="assets/kampus-logo.png" alt="KAMPUS Integrated Services" style="width:52.5pt; height:81pt; object-fit:contain; display:block;" />
        </div>
      </div>

      <!-- Faint Divider Line below Header matching template -->
      <div class="inv-header-divider"></div>

      <!-- Customer & Invoice Metadata -->
      <div class="inv-meta-grid">
        <div class="inv-customer-col">
          <div class="heading">Customer</div>
          <div class="line">Legal Occupier: ${appState.occupier}</div>
          <div class="line">Location: ${appState.location}</div>
          <div class="line line-billing-month">Billing Month: ${inv.billingPeriod}</div>
        </div>
        <div class="inv-number-col">
          <div class="title">Invoice,</div>
          <div class="number">${inv.invoiceNumber}</div>
          <div class="ntn">NTN: <strong style="font-weight:700;">${appState.ntn}</strong></div>
        </div>
      </div>

      <!-- Billing Table with Clean 1px Light Borders Matching Original Template -->
      <table class="inv-table">
        <thead>
          <tr>
            ${tableHeadHtml}
          </tr>
        </thead>
        <tbody>
          <tr>
            ${tableBodyHtml}
          </tr>
        </tbody>
      </table>

      <!-- Amount in Words (Rupees ... Only) -->
      <div class="inv-amount-words">
        ${formatAmountInWords(inv.totalPayable)}
      </div>

      <!-- Bullet Notices -->
      <div class="inv-notices">
        <ul>
          <li>*Please make payment in favour of Kampus Integrated Services NTN: C951537 Account No:<br>10380109491064 in Meezan Bank.</li>
          <li>*If the payment is not received till the last payment date, "<strong>The Mega Mall</strong>" will hold the services of your<br>lincensed area and will not held responsible for any losses Whats so ever there for.</li>
        </ul>
      </div>

      <!-- Signoff Row (Two columns: Account Dept on Left, Management on Right) -->
      <div class="inv-signoff-row">
        <div class="inv-signoff-left">
          <div class="dept">Account Department</div>
          <div class="date">Date : ${inv.issueDate}</div>
        </div>
        <div class="inv-signoff-right">
          <div class="mgmt-title">Management</div>
          <div class="mgmt-org">(Kampus Integrated Services)</div>
          <div class="mgmt-mall">(The Mega Mall)</div>
        </div>
      </div>

      <!-- Footer Address -->
      <div class="inv-footer-address">
        4 Floor, Mega Mall, Block-18, Gulishtan-E-Jauhar, Karachi.
      </div>
    </div>
  `;
}

// Populate Year configuration cards in sidebar
function updateYearConfigsUI() {
  const container = document.getElementById("yearConfigsContainer");
  const months = generateMonthsList(appState.startMonth, appState.endMonth);
  const years = [...new Set(months.map(m => m.year))].sort();

  container.innerHTML = "";

  years.forEach(year => {
    if (!appState.yearRates[year]) {
      appState.yearRates[year] = { rate: 1.25, gallons: 53759 };
    }
    const config = appState.yearRates[year];
    const isManual = !!config.manualBillAmountEnabled;
    const currentBill = isManual 
      ? (config.manualBillAmount !== undefined ? config.manualBillAmount : Math.round((config.gallons || 50000) * (config.rate || 1.25)))
      : Math.round((config.gallons || 50000) * (config.rate || 1.25));

    const card = document.createElement("div");
    card.className = "year-config-item";
    card.innerHTML = `
      <div class="year-config-header">
        <span class="year-badge">Year ${year}</span>
        <span style="font-size:0.75rem; color:var(--text-dim);">${months.filter(m => m.year === year).length} Months</span>
      </div>

      <!-- Manual Bill Amount Toggle Row -->
      <div class="toggle-row" style="margin-bottom:0.45rem; padding-bottom:0.35rem; border-bottom:1px solid var(--border-subtle);">
        <div style="display:flex; flex-direction:column;">
          <span style="font-size:0.75rem; font-weight:600; color:${isManual ? 'var(--accent-green)' : 'var(--text-main)'};">Manual Bill Amount</span>
          <span style="font-size:0.67rem; color:var(--text-dim);">${isManual ? 'Fixed manual amount active' : 'Auto: Gallons × Rate'}</span>
        </div>
        <label class="switch switch-sm" title="Toggle manual bill amount for Year ${year}">
          <input type="checkbox" ${isManual ? 'checked' : ''} onchange="setYearManualBillToggle(${year}, this.checked)" />
          <span class="slider"></span>
        </label>
      </div>

      ${isManual ? `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" style="color:var(--accent-green); font-weight:600;">Manual Bill Amount (PKR)</label>
            <input type="number" step="1" class="form-input" style="border-color:rgba(34,197,94,0.4); font-weight:600; color:var(--accent-green);" value="${currentBill}" oninput="setYearManualBillAmount(${year}, this.value)" onchange="setYearManualBillAmount(${year}, this.value)" />
          </div>
          <div class="form-group">
            <label class="form-label">Rate / Gal (PKR)</label>
            <input type="number" step="0.01" class="form-input" value="${config.rate}" oninput="setYearRate(${year}, this.value)" onchange="setYearRate(${year}, this.value)" />
          </div>
        </div>
        <div class="form-row" style="margin-top:0.45rem;">
          <div class="form-group">
            <label class="form-label">Consumption Gallons</label>
            <input type="number" step="1" class="form-input" value="${config.gallons}" oninput="setYearGallons(${year}, this.value)" onchange="setYearGallons(${year}, this.value)" />
          </div>
        </div>
      ` : `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Rate / Gal (PKR)</label>
            <input type="number" step="0.01" class="form-input" value="${config.rate}" oninput="setYearRate(${year}, this.value)" onchange="setYearRate(${year}, this.value)" />
          </div>
          <div class="form-group">
            <label class="form-label">Monthly Gallons</label>
            <input type="number" step="1" class="form-input" value="${config.gallons}" oninput="setYearGallons(${year}, this.value)" onchange="setYearGallons(${year}, this.value)" />
          </div>
        </div>
        <div style="font-size:0.72rem; color:var(--text-dim); margin-top:0.35rem; display:flex; justify-content:space-between; align-items:center;">
          <span>Auto Bill Amount:</span>
          <strong id="autoBillDisplay-${year}" style="color:var(--text-main);">PKR ${formatNumber(currentBill)}</strong>
        </div>
      `}
    `;
    container.appendChild(card);
  });
}

function setYearManualBillToggle(year, isEnabled) {
  if (!appState.yearRates[year]) appState.yearRates[year] = { rate: 1.25, gallons: 50000 };
  appState.yearRates[year].manualBillAmountEnabled = isEnabled;
  if (isEnabled && (appState.yearRates[year].manualBillAmount === undefined || appState.yearRates[year].manualBillAmount === null)) {
    const rate = appState.yearRates[year].rate || 1.25;
    const gallons = appState.yearRates[year].gallons || 50000;
    appState.yearRates[year].manualBillAmount = Math.round(gallons * rate);
  }
  updateYearConfigsUI();
  renderPreview();
  renderDataEditor();
  debouncedSaveProjectState();
  showToast(isEnabled ? `Manual Bill Amount enabled for Year ${year}` : `Automatic calculation restored for Year ${year}`, "info");
}

function setYearManualBillAmount(year, val) {
  if (!appState.yearRates[year]) appState.yearRates[year] = { rate: 1.25, gallons: 50000 };
  appState.yearRates[year].manualBillAmountEnabled = true;
  appState.yearRates[year].manualBillAmount = parseFloat(val) || 0;
  renderPreview();
  renderDataEditor();
  debouncedSaveProjectState();
}

function setYearRate(year, val) {
  if (!appState.yearRates[year]) appState.yearRates[year] = {};
  const num = parseFloat(val);
  appState.yearRates[year].rate = isNaN(num) ? 0 : num;

  // Clear any per-row rate, bill amount, or frozen total locks for this year so new rate applies to all months
  if (appState.manualCorrections) {
    Object.keys(appState.manualCorrections).forEach(ym => {
      if (ym.startsWith(String(year) + "-")) {
        delete appState.manualCorrections[ym].rate;
        delete appState.manualCorrections[ym].previous;
        delete appState.manualCorrections[ym].totalPayable;
        if (!appState.yearRates[year].manualBillAmountEnabled) {
          delete appState.manualCorrections[ym].billAmount;
          delete appState.manualCorrections[ym].manualBillAmountEnabled;
        }
      }
    });
  }

  const config = appState.yearRates[year];
  const autoBill = Math.round((config.gallons || 0) * (config.rate || 0));
  const autoBillEl = document.getElementById(`autoBillDisplay-${year}`);
  if (autoBillEl) autoBillEl.textContent = `PKR ${formatNumber(autoBill)}`;

  renderPreview();
  renderDataEditor();
  debouncedSaveProjectState();
}

function setYearGallons(year, val) {
  if (!appState.yearRates[year]) appState.yearRates[year] = {};
  const num = parseInt(val, 10);
  appState.yearRates[year].gallons = isNaN(num) ? 0 : num;

  if (appState.manualCorrections) {
    Object.keys(appState.manualCorrections).forEach(ym => {
      if (ym.startsWith(String(year) + "-")) {
        delete appState.manualCorrections[ym].gallons;
        delete appState.manualCorrections[ym].previous;
        delete appState.manualCorrections[ym].totalPayable;
        if (!appState.yearRates[year].manualBillAmountEnabled) {
          delete appState.manualCorrections[ym].billAmount;
          delete appState.manualCorrections[ym].manualBillAmountEnabled;
        }
      }
    });
  }

  const config = appState.yearRates[year];
  const autoBill = Math.round((config.gallons || 0) * (config.rate || 0));
  const autoBillEl = document.getElementById(`autoBillDisplay-${year}`);
  if (autoBillEl) autoBillEl.textContent = `PKR ${formatNumber(autoBill)}`;

  renderPreview();
  renderDataEditor();
  debouncedSaveProjectState();
}

// Render Preview Area
function renderPreview() {
  const invoices = calculateInvoices();
  const totalCount = invoices.length;

  if (appState.currentPageIndex >= totalCount) {
    appState.currentPageIndex = Math.max(0, totalCount - 1);
  }

  document.getElementById("totalPagesCount").textContent = totalCount;
  document.getElementById("currentPageDisplay").textContent = totalCount > 0 ? appState.currentPageIndex + 1 : 0;
  document.getElementById("prevPageBtn").disabled = appState.currentPageIndex === 0;
  document.getElementById("nextPageBtn").disabled = appState.currentPageIndex >= totalCount - 1;

  const jumpSelect = document.getElementById("jumpMonthSelect");
  jumpSelect.innerHTML = "";
  invoices.forEach((inv, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    opt.textContent = `${inv.monthName} ${inv.year} (${inv.invoiceNumber})`;
    if (idx === appState.currentPageIndex) opt.selected = true;
    jumpSelect.appendChild(opt);
  });

  const viewport = document.getElementById("invoiceViewport");

  if (appState.viewAllPages) {
    viewport.innerHTML = invoices.map(inv => renderInvoiceSheet(inv)).join("");
  } else {
    const curInvoice = invoices[appState.currentPageIndex];
    viewport.innerHTML = curInvoice ? renderInvoiceSheet(curInvoice) : "<div style='color:#fff; padding:2rem;'>No invoices generated</div>";
  }

  const totalGallons = invoices.reduce((sum, inv) => sum + inv.gallons, 0);
  const totalAmount = invoices.reduce((sum, inv) => sum + inv.totalPayable, 0);
  document.getElementById("statTotalMonths").textContent = `${totalCount} Months`;
  document.getElementById("statTotalBill").textContent = "PKR " + formatNumber(totalAmount);
}

// Render Batch Data Editor Table
function renderDataEditor() {
  const invoices = calculateInvoices();
  const cols = getActiveColumns();

  // 1. Render Dynamic Table Header
  const headerRow = document.getElementById("editorTableHeaderRow");
  if (headerRow) {
    headerRow.innerHTML = `
      <th style="min-width:110px;">Month / Period</th>
      <th style="min-width:150px;">Invoice #</th>
      <th style="min-width:260px;">Billing Period</th>
      <th style="min-width:140px;">Issue Date</th>
      ${cols.map(c => `<th>${escapeHtml(c.label).replace(/\n/g, ' ')}</th>`).join('')}
      <th style="min-width:80px;">Action</th>
    `;
  }

  // 2. Render Table Body with All Columns Directly Editable
  const tbody = document.getElementById("editorTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  invoices.forEach(inv => {
    const tr = document.createElement("tr");

    const colInputsHtml = cols.map(col => {
      if (col.id === 'gallons') {
        return `<td><input type="number" value="${inv.gallons}" onchange="updateCorrection('${inv.ym}', 'gallons', this.value)" style="width:105px;" /></td>`;
      } else if (col.id === 'rate') {
        return `<td><input type="number" step="0.01" value="${inv.rate}" onchange="updateCorrection('${inv.ym}', 'rate', this.value)" style="width:75px;" /></td>`;
      } else if (col.id === 'previous') {
        return `<td><input type="number" value="${inv.previous}" onchange="updateCorrection('${inv.ym}', 'previous', this.value)" style="width:90px;" /></td>`;
      } else if (col.id === 'billAmount') {
        const isManual = !!inv.isManualBill;
        return `
          <td style="white-space:nowrap;">
            <div style="display:inline-flex; align-items:center; gap:0.35rem;">
              <input type="number" 
                     value="${inv.billAmount}" 
                     onchange="updateRowManualBillAmount('${inv.ym}', this.value)" 
                     title="${isManual ? 'Manual Bill Amount active (custom override)' : 'Auto-calculated: Gallons × Rate (Directly edit anytime or use toggle)'}" 
                     style="width:95px; font-weight:600; cursor:text; ${isManual ? 'border-color:var(--accent-green); color:var(--accent-green);' : ''}" />
              <label class="switch switch-sm" title="Toggle manual bill amount ON/OFF for ${inv.monthName} ${inv.year}">
                <input type="checkbox" ${isManual ? 'checked' : ''} onchange="toggleRowManualBill('${inv.ym}', this.checked)" />
                <span class="slider"></span>
              </label>
            </div>
          </td>`;
      } else if (col.id === 'totalPayable') {
        return `<td><input type="text" value="${formatNumber(inv.totalPayable)}" readonly tabindex="-1" title="Total Payable = Bill Amount + Previous (Auto-calculated summary, not editable)" style="width:110px; font-weight:700; color:var(--accent-green); background:rgba(34,197,94,0.06); border:1px solid rgba(34,197,94,0.22); cursor:not-allowed; text-align:right; font-variant-numeric:tabular-nums;" /></td>`;
      } else {
        const val = (inv.customValues && inv.customValues[col.id] !== undefined)
          ? inv.customValues[col.id]
          : (col.defaultValue || "");
        const inputType = (col.type === 'number' || col.type === 'currency') ? 'number' : 'text';
        return `<td><input type="${inputType}" value="${escapeHtml(String(val))}" onchange="updateCorrection('${inv.ym}', '${col.id}', this.value)" style="width:100px;" /></td>`;
      }
    }).join('');

    tr.innerHTML = `
      <td style="font-weight:600; color:var(--text-main); white-space:nowrap;">${inv.monthName} ${inv.year}</td>
      <td>
        <input type="text" value="${inv.invoiceNumber}" onchange="updateCorrection('${inv.ym}', 'invoiceNumber', this.value)" style="width:145px;" />
      </td>
      <td>
        <input type="text" value="${inv.billingPeriod}" onchange="updateCorrection('${inv.ym}', 'billingPeriod', this.value)" style="width:250px;" />
      </td>
      <td>
        <input type="text" value="${inv.issueDate}" onchange="updateCorrection('${inv.ym}', 'issueDate', this.value)" style="width:130px;" />
      </td>
      ${colInputsHtml}
      <td style="white-space:nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="jumpToPageAndPreview(${inv.index})">Preview</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Sync global manual bill toggle state
  const globalToggle = document.getElementById("editorManualBillGlobalToggle");
  if (globalToggle) {
    const allManual = invoices.length > 0 && invoices.every(inv => inv.isManualBill);
    globalToggle.checked = allManual;
  }
}

function toggleRowManualBill(ym, isEnabled) {
  if (!appState.manualCorrections[ym]) {
    appState.manualCorrections[ym] = {};
  }
  appState.manualCorrections[ym].manualBillAmountEnabled = isEnabled;
  if (isEnabled) {
    if (appState.manualCorrections[ym].billAmount === undefined) {
      const invs = calculateInvoices();
      const current = invs.find(i => i.ym === ym);
      appState.manualCorrections[ym].billAmount = current ? current.billAmount : 0;
    }
    showToast(`Manual bill amount enabled for ${ym}. You can edit the amount directly anytime.`, "info");
  } else {
    delete appState.manualCorrections[ym].billAmount;
    showToast(`Restored automatic Bill Amount calculation for ${ym}.`, "info");
  }
  renderPreview();
  renderDataEditor();
  debouncedSaveProjectState();
}

function updateRowManualBillAmount(ym, val) {
  if (!appState.manualCorrections[ym]) {
    appState.manualCorrections[ym] = {};
  }
  if (val === "" || val === null || val === undefined) {
    appState.manualCorrections[ym].manualBillAmountEnabled = false;
    delete appState.manualCorrections[ym].billAmount;
    showToast(`Restored automatic Bill Amount calculation for ${ym}.`, "info");
  } else {
    appState.manualCorrections[ym].manualBillAmountEnabled = true;
    appState.manualCorrections[ym].billAmount = parseFloat(val) || 0;
  }
  renderPreview();
  renderDataEditor();
  debouncedSaveProjectState();
}

function toggleGlobalManualBill(isEnabled) {
  const invoices = calculateInvoices();
  invoices.forEach(inv => {
    if (!appState.manualCorrections[inv.ym]) {
      appState.manualCorrections[inv.ym] = {};
    }
    appState.manualCorrections[inv.ym].manualBillAmountEnabled = isEnabled;
    if (isEnabled) {
      if (appState.manualCorrections[inv.ym].billAmount === undefined) {
        appState.manualCorrections[inv.ym].billAmount = inv.billAmount;
      }
    } else {
      delete appState.manualCorrections[inv.ym].billAmount;
    }
  });

  renderPreview();
  renderDataEditor();
  debouncedSaveProjectState();
  showToast(isEnabled ? "Manual Bill Amount enabled across all invoices" : "All invoices restored to automatic Bill Amount calculation", "info");
}

function updateCorrection(ym, field, val) {
  if (field === 'totalPayable') return;
  if (!appState.manualCorrections[ym]) {
    appState.manualCorrections[ym] = {};
  }
  if (val === "" || val === null || val === undefined) {
    delete appState.manualCorrections[ym][field];
    if (Object.keys(appState.manualCorrections[ym]).length === 0) {
      delete appState.manualCorrections[ym];
    }
  } else {
    appState.manualCorrections[ym][field] = val;
  }
  renderPreview();
  renderDataEditor();
  debouncedSaveProjectState();
}

function jumpToPageAndPreview(index) {
  appState.currentPageIndex = index;
  switchTab("preview");
  renderPreview();
}

function resetManualCorrections() {
  showConfirm("Reset All Overrides", "Are you sure you want to restore all values back to automatic calculations?", () => {
    appState.manualCorrections = {};
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
    showToast("All manual overrides restored to default calculations", "success");
  });
}

// ----------------------------------------------------------
// Invoice Sequence Manager (Table Editor)
// ----------------------------------------------------------
function applyEditorSequence() {
  const modeSelect = document.getElementById("editorSeqMode");
  const prefixInput = document.getElementById("editorSeqPrefix");
  const startNumInput = document.getElementById("editorSeqStartNum");
  const suffixInput = document.getElementById("editorSeqSuffix");
  const autoYearToggle = document.getElementById("editorSeqAutoYear");

  const mode = modeSelect ? modeSelect.value : (appState.seqMode || "month_year");
  let prefix = (prefixInput ? prefixInput.value : appState.invPrefix) || "#INV-01-";
  const startNum = startNumInput ? parseInt(startNumInput.value, 10) || 1 : appState.invStartNum;
  const suffix = suffixInput ? suffixInput.value : appState.invSuffix;
  const autoYear = autoYearToggle ? autoYearToggle.checked : appState.autoSuffixYear;

  appState.seqMode = mode;
  appState.invStartNum = startNum;
  appState.invSuffix = suffix;
  appState.autoSuffixYear = autoYear;

  if (mode === "month_year") {
    if (/#INV-\d+-\d{2}-\d{4}/i.test(prefix)) {
      const pm = prefix.match(/^([#A-Za-z0-9]+-\d+-)/);
      if (pm) prefix = pm[1];
    }
    if (prefix === "#INV-" || prefix === "#INV" || prefix === "INV-" || prefix === "INV") {
      prefix = "#INV-01-";
    } else if (!prefix.endsWith("-")) {
      prefix += "-";
    }
  }
  appState.invPrefix = prefix;

  // Clear per-row custom invoice numbers so the clean sequence applies to all
  if (appState.manualCorrections) {
    Object.keys(appState.manualCorrections).forEach(ym => {
      delete appState.manualCorrections[ym].invoiceNumber;
    });
  }

  syncInputsWithState();
  renderPreview();
  renderDataEditor();
  debouncedSaveProjectState();

  if (mode === "month_year") {
    showToast(`Applied monthly sequence (e.g. ${prefix}01-2024) to all invoices!`, "success");
  } else {
    showToast(`Applied sequence starting from ${prefix}${startNum}${suffix} to all invoices!`, "success");
  }
}

// ----------------------------------------------------------
// Custom Table Boxes & Columns Manager Modal
// ----------------------------------------------------------
function openColumnsModal() {
  renderColumnsModalList();
  const el = document.getElementById("columnsModalBackdrop");
  if (el) el.classList.add("open");
}

function closeColumnsModal() {
  const el = document.getElementById("columnsModalBackdrop");
  if (el) el.classList.remove("open");
}

function renderColumnsModalList() {
  const container = document.getElementById("columnsListContainer");
  const countEl = document.getElementById("activeColCount");
  const cols = getActiveColumns();
  if (countEl) countEl.textContent = cols.length;
  if (!container) return;

  container.innerHTML = "";
  cols.forEach((col, idx) => {
    const isDefault = DEFAULT_TABLE_COLUMNS.some(d => d.id === col.id);
    const row = document.createElement("div");
    row.className = "custom-col-row";
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:0.5rem; flex:1;">
        <span class="col-tag">${idx + 1}</span>
        <div>
          <div style="font-weight:600; color:var(--text-main); font-size:0.8rem;">
            ${escapeHtml(col.label).replace(/\n/g, ' ')}
          </div>
          <div style="font-size:0.7rem; color:var(--text-dim);">
            ID: <code>${col.id}</code> &bull; Type: ${col.type || 'text'} ${isDefault ? '&bull; <em>Standard Box</em>' : '&bull; <span style="color:var(--accent-blue);">Custom Box</span>'}
          </div>
        </div>
      </div>
      <div>
        ${isDefault ? `
          <button class="btn btn-secondary btn-sm" style="opacity:0.5; font-size:0.7rem;" title="Standard required box" disabled>Locked</button>
        ` : `
          <button class="btn btn-secondary btn-sm" style="color:var(--accent-red); font-size:0.75rem;" onclick="removeCustomColumn('${col.id}')">Remove</button>
        `}
      </div>
    `;
    container.appendChild(row);
  });
}

function addNewCustomColumn() {
  const titleInput = document.getElementById("newColTitleInput");
  const typeSelect = document.getElementById("newColTypeSelect");
  const title = (titleInput?.value || "").trim();
  const type = typeSelect?.value || "currency";

  if (!title) {
    showToast("Please enter a title for the new box/column.", "warning");
    return;
  }

  const id = "col_" + Date.now().toString(36);
  if (!appState.tableColumns || !Array.isArray(appState.tableColumns)) {
    appState.tableColumns = JSON.parse(JSON.stringify(DEFAULT_TABLE_COLUMNS));
  }

  appState.tableColumns.push({
    id,
    label: title,
    type,
    defaultValue: "",
    required: false
  });

  if (titleInput) titleInput.value = "";
  renderColumnsModalList();
  renderPreview();
  renderDataEditor();
  debouncedSaveProjectState();
  showToast(`Added custom box "${title}". Table spacing auto-adjusted!`, "success");
}

function removeCustomColumn(colId) {
  if (!appState.tableColumns) return;
  appState.tableColumns = appState.tableColumns.filter(c => c.id !== colId);
  renderColumnsModalList();
  renderPreview();
  renderDataEditor();
  debouncedSaveProjectState();
  showToast("Removed custom box. Table spacing auto-adjusted.", "info");
}

function resetDefaultColumns() {
  showConfirm("Reset Table Boxes", "Restore original 5 standard table boxes? Any custom boxes will be removed.", () => {
    appState.tableColumns = JSON.parse(JSON.stringify(DEFAULT_TABLE_COLUMNS));
    renderColumnsModalList();
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
    showToast("Restored 5 standard table boxes with original spacing.", "success");
  });
}

// Switch Tabs
function switchTab(tab) {
  appState.activeTab = tab;
  try {
    localStorage.setItem('mega_mall_active_tab', tab);
  } catch (e) {}
  const isPreview = tab === "preview";
  const isEditor = tab === "editor";

  document.getElementById("tabInvoicePreview")?.classList.toggle("active", isPreview);
  document.getElementById("tabDataEditor")?.classList.toggle("active", isEditor);

  const mainContainer = document.getElementById("mainContainer");
  if (mainContainer) mainContainer.style.display = isPreview ? "flex" : "none";

  document.getElementById("dataEditorSection")?.classList.toggle("active", isEditor);

  const toggleBtn = document.getElementById("togglePreviewBtn");
  if (toggleBtn) {
    toggleBtn.style.display = isPreview ? "inline-flex" : "none";
  }

  if (isEditor) {
    renderDataEditor();
  } else {
    renderPreview();
  }
}

// Navigation Handlers
function nextPage() {
  const invoices = calculateInvoices();
  if (appState.currentPageIndex < invoices.length - 1) {
    appState.currentPageIndex++;
    renderPreview();
  }
}

function prevPage() {
  if (appState.currentPageIndex > 0) {
    appState.currentPageIndex--;
    renderPreview();
  }
}

function jumpToPage(index) {
  appState.currentPageIndex = parseInt(index, 10) || 0;
  renderPreview();
}

function toggleViewAll(enable) {
  appState.viewAllPages = enable;
  document.getElementById("viewSingleBtn").classList.toggle("btn-primary", !enable);
  document.getElementById("viewSingleBtn").classList.toggle("btn-secondary", enable);
  document.getElementById("viewAllBtn").classList.toggle("btn-primary", enable);
  document.getElementById("viewAllBtn").classList.toggle("btn-secondary", !enable);
  renderPreview();
}

// ----------------------------------------------------------
// Export Handlers: Word (.docx), PDF (.pdf), and Print
// ----------------------------------------------------------
let cachedMegaMallLogoData = null;
let cachedKampusLogoData = null;

async function loadLogoBase64(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = path;
    });
  }
}

async function ensureLogosLoaded() {
  if (!cachedMegaMallLogoData) {
    cachedMegaMallLogoData = await loadLogoBase64('assets/mega-mall-logo.png') || await loadLogoBase64('/assets/mega-mall-logo.png');
  }
  if (!cachedKampusLogoData) {
    cachedKampusLogoData = await loadLogoBase64('assets/kampus-logo.png') || await loadLogoBase64('/assets/kampus-logo.png');
  }
  return { megaMallLogo: cachedMegaMallLogoData, kampusLogo: cachedKampusLogoData };
}

async function exportToWord() {
  const btn = document.getElementById("exportDocxBtn");
  const originalText = btn ? btn.innerHTML : "Word (.docx)";
  if (btn) {
    btn.innerHTML = "Generating Word Doc...";
    btn.disabled = true;
  }

  try {
    const invoices = calculateInvoices();
    if (!invoices.length) {
      showToast("No invoices to export", "error");
      return;
    }

    // Try client-side docx generation first (fully offline & instant)
    if (window.docx) {
      try {
        const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun, AlignmentType, PageBreak } = window.docx;

        let megaMallBytes = null;
        let kampusBytes = null;
        try {
          const [resM, resK] = await Promise.all([
            fetch('assets/mega-mall-logo.png'),
            fetch('assets/kampus-logo.png')
          ]);
          if (resM.ok) megaMallBytes = new Uint8Array(await resM.arrayBuffer());
          if (resK.ok) kampusBytes = new Uint8Array(await resK.arrayBuffer());
        } catch (e) {}

        const solidBorder = { style: BorderStyle.SINGLE, size: 10, color: '000000' };
        const cellBorders = { top: solidBorder, bottom: solidBorder, left: solidBorder, right: solidBorder };
        const emptyBorder = { style: BorderStyle.NONE, size: 0, color: 'auto' };
        const noBorders = { top: emptyBorder, bottom: emptyBorder, left: emptyBorder, right: emptyBorder };

        const children = [];
        const effectiveCols = getActiveColumns();

        invoices.forEach((inv, index) => {
          // 1. Header Table
          const headerRowCells = [
            new TableCell({
              width: { size: 26, type: WidthType.PERCENTAGE },
              borders: noBorders,
              alignment: AlignmentType.CENTER,
              children: [
                megaMallBytes
                  ? new Paragraph({
                      alignment: AlignmentType.LEFT,
                      children: [new ImageRun({ data: megaMallBytes, transformation: { width: 128, height: 106 } })]
                    })
                  : new Paragraph({ text: "MEGA MALL", alignment: AlignmentType.LEFT })
              ]
            }),
            new TableCell({
              width: { size: 48, type: WidthType.PERCENTAGE },
              borders: noBorders,
              alignment: AlignmentType.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 80 },
                  children: [new TextRun({ text: "THE MEGA MALL", bold: true, size: 28, font: "Segoe UI" })]
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: "Official Billing Invoice / Reimburstment Note", bold: true, size: 24, font: "Segoe UI" })]
                })
              ]
            }),
            new TableCell({
              width: { size: 26, type: WidthType.PERCENTAGE },
              borders: noBorders,
              alignment: AlignmentType.RIGHT,
              children: [
                kampusBytes
                  ? new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      children: [new ImageRun({ data: kampusBytes, transformation: { width: 70, height: 108 } })]
                    })
                  : new Paragraph({ text: "KAMPUS", alignment: AlignmentType.RIGHT })
              ]
            })
          ];

          children.push(new Table({
            rows: [new TableRow({ children: headerRowCells })],
            width: { size: 100, type: WidthType.PERCENTAGE }
          }));
          children.push(new Paragraph({ spacing: { after: 300 } }));

          // 2. Customer & Metadata Table
          const metaTable = new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 65, type: WidthType.PERCENTAGE },
                    borders: noBorders,
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "Customer", bold: true, size: 20, font: "Segoe UI" })],
                        spacing: { after: 180 }
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({ text: "Legal Occupier: ", bold: false, size: 18, font: "Segoe UI" }),
                          new TextRun({ text: appState.occupier || "FALAKNAZ SPRINGS,", size: 18, font: "Segoe UI" })
                        ],
                        spacing: { after: 40 }
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({ text: "Location: ", bold: false, size: 18, font: "Segoe UI" }),
                          new TextRun({ text: appState.location || "The Mega Mall, Block-18, Gulishtan-e-Jauhar, Karachi.,", size: 18, font: "Segoe UI" })
                        ],
                        spacing: { after: 40 }
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({ text: "Billing Month: ", bold: true, size: 18, font: "Segoe UI" }),
                          new TextRun({ text: normalizeMonthNames(inv.billingPeriod), bold: true, size: 18, font: "Segoe UI" })
                        ]
                      })
                    ]
                  }),
                  new TableCell({
                    width: { size: 35, type: WidthType.PERCENTAGE },
                    borders: noBorders,
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [new TextRun({ text: "Invoice,", bold: true, size: 20, font: "Segoe UI" })],
                        spacing: { after: 180 }
                      }),
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [new TextRun({ text: inv.invoiceNumber, bold: true, size: 19, font: "Segoe UI" })],
                        spacing: { after: 40 }
                      }),
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                          new TextRun({ text: "NTN: ", size: 18, font: "Segoe UI" }),
                          new TextRun({ text: appState.ntn || "C951537", bold: true, size: 18, font: "Segoe UI" })
                        ]
                      })
                    ]
                  })
                ]
              })
            ],
            width: { size: 100, type: WidthType.PERCENTAGE }
          });

          children.push(metaTable);
          children.push(new Paragraph({ spacing: { after: 350 } }));

          // 3. Billing Table
          const thStyle = { borders: cellBorders, alignment: AlignmentType.CENTER };
          const headerCells = effectiveCols.map(col => new TableCell({
            ...thStyle,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: (col.label || col.id).replace(/<br\s*\/?>/gi, ' ').replace(/\n/g, ' '),
                    bold: true,
                    size: 15,
                    font: "Segoe UI",
                    color: "5e616f"
                  })
                ]
              })
            ]
          }));

          const dataCells = effectiveCols.map(col => {
            let displayVal = "";
            if (col.id === 'gallons') {
              displayVal = inv.gallons ? String(inv.gallons).replace(/,/g, '') : "0";
            } else if (col.id === 'rate') {
              displayVal = Number(inv.rate).toFixed(2);
            } else if (col.id === 'billAmount') {
              displayVal = `${formatNumber(inv.billAmount)}/-`;
            } else if (col.id === 'previous') {
              displayVal = inv.previous === 0 ? "0" : `${formatNumber(inv.previous)}`;
            } else if (col.id === 'totalPayable') {
              displayVal = `${formatNumber(inv.totalPayable)}/-`;
            } else {
              const rawVal = (inv.customValues && inv.customValues[col.id] !== undefined)
                ? inv.customValues[col.id]
                : (col.defaultValue || "");
              if (col.type === 'currency' && rawVal !== "") {
                displayVal = `${formatNumber(rawVal)}/-`;
              } else if (col.type === 'number' && rawVal !== "") {
                displayVal = String(rawVal).replace(/,/g, '');
              } else {
                displayVal = String(rawVal || "");
              }
            }

            return new TableCell({
              borders: cellBorders,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: displayVal, size: 18, font: "Segoe UI" })]
                })
              ]
            });
          });

          children.push(new Table({
            rows: [new TableRow({ children: headerCells }), new TableRow({ children: dataCells })],
            width: { size: 100, type: WidthType.PERCENTAGE }
          }));
          children.push(new Paragraph({ spacing: { after: 180 } }));

          // 4. Amount in Words
          const words = formatAmountInWords(inv.totalPayable);
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: words, bold: true, size: 21, font: "Segoe UI" })],
            spacing: { before: 180, after: 260 }
          }));

          // 5. Bullet Notices
          children.push(new Paragraph({
            children: [new TextRun({ text: "• *Please make payment in favour of Kampus Integrated Services NTN: C951537 Account No: 10380109491064 in Meezan Bank.", size: 17, font: "Segoe UI" })],
            spacing: { after: 120 }
          }));
          children.push(new Paragraph({
            children: [
              new TextRun({ text: "• *If the payment is not received till the last payment date, ", size: 17, font: "Segoe UI" }),
              new TextRun({ text: "\"The Mega Mall\"", bold: true, size: 17, font: "Segoe UI" }),
              new TextRun({ text: " will hold the services of your lincensed area and will not held responsible for any losses Whats so ever there for.", size: 17, font: "Segoe UI" })
            ],
            spacing: { after: 380 }
          }));

          // 6. Signoff
          children.push(new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: noBorders,
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "Account Department", bold: true, size: 18, font: "Segoe UI" })],
                        spacing: { after: 50 }
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: `Date : ${normalizeMonthNames(inv.issueDate)}`, bold: true, size: 18, font: "Segoe UI" })]
                      })
                    ]
                  }),
                  new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: noBorders,
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [new TextRun({ text: "Management", bold: true, size: 18, font: "Segoe UI" })],
                        spacing: { after: 200 }
                      }),
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [new TextRun({ text: "(Kampus Integrated Services)", bold: true, size: 17, font: "Segoe UI" })],
                        spacing: { after: 50 }
                      }),
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [new TextRun({ text: "(The Mega Mall)", bold: true, size: 17, font: "Segoe UI" })]
                      })
                    ]
                  })
                ]
              })
            ],
            width: { size: 100, type: WidthType.PERCENTAGE }
          }));
          children.push(new Paragraph({ spacing: { after: 800 } }));

          // 7. Footer Address
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "4 Floor, Mega Mall, Block-18, Gulishtan-E-Jauhar, Karachi.", bold: true, size: 17, font: "Segoe UI" })]
          }));

          if (index < invoices.length - 1) {
            children.push(new Paragraph({ children: [new PageBreak()] }));
          }
        });

        const doc = new Document({
          sections: [{
            properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 1080 } } },
            children
          }]
        });

        const blob = await Packer.toBlob(doc);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeOcc = (appState.occupier || "Invoices").replace(/[^a-zA-Z0-9]/g, '_');
        a.download = `Water_Invoices_${safeOcc}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showToast("Word document generated and downloaded successfully", "success");
        return;
      } catch (clientErr) {
        console.warn("Client-side docx generation failed, falling back to server:", clientErr);
      }
    }

    // Server fallback
    const payload = {
      invoices,
      columns: getActiveColumns(),
      occupier: appState.occupier,
      location: appState.location,
      ntn: appState.ntn
    };

    const response = await authFetch('/api/export/docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Water_Invoices_${appState.occupier.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast("Word document generated and downloaded successfully", "success");
  } catch (err) {
    showToast("Could not export Word document: " + err.message, "error");
  } finally {
    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
}

async function exportToPdf() {
  const btn = document.getElementById("exportPdfBtn");
  const originalText = btn ? btn.innerHTML : "PDF (Editable)";
  if (btn) {
    btn.innerHTML = "Generating PDF...";
    btn.disabled = true;
  }

  try {
    const invoices = calculateInvoices();
    if (!invoices.length) {
      showToast("No invoices to export", "error");
      return;
    }

    const JsPdfConstructor = window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
    if (!JsPdfConstructor) {
      throw new Error("jsPDF library not loaded");
    }

    showToast(`Generating selectable & editable PDF (${invoices.length} pages)...`, "info");

    const { megaMallLogo, kampusLogo } = await ensureLogosLoaded();

    const pdf = new JsPdfConstructor({
      unit: 'pt',
      format: 'a4',
      orientation: 'portrait',
      compress: true
    });

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const leftMargin = 32.5;
    const rightMargin = 52.9;
    const contentRight = pageWidth - rightMargin;
    const contentWidth = contentRight - leftMargin;

    const cols = getActiveColumns();
    const colWidths = (cols.length === 5 && cols[0].id === 'gallons')
      ? [0.22, 0.18, 0.20, 0.20, 0.20].map(r => r * contentWidth)
      : cols.map(() => contentWidth / cols.length);

    for (let i = 0; i < invoices.length; i++) {
      if (btn) {
        btn.innerHTML = `PDF (${i + 1}/${invoices.length})...`;
      }
      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }

      const inv = invoices[i];

      // 1. Header Logos & Title
      if (megaMallLogo) {
        try {
          pdf.addImage(megaMallLogo, 'PNG', leftMargin, 41.4, 96, 79.5);
        } catch (e) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.setTextColor(0, 0, 0);
          pdf.text('THE MEGA MALL', leftMargin, 80);
        }
      } else {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(0, 0, 0);
        pdf.text('THE MEGA MALL', leftMargin, 80);
      }

      if (kampusLogo) {
        try {
          pdf.addImage(kampusLogo, 'PNG', contentRight - 52.5, 41.4, 52.5, 81);
        } catch (e) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.setTextColor(0, 0, 0);
          pdf.text('KAMPUS', contentRight, 80, { align: 'right' });
        }
      } else {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(0, 0, 0);
        pdf.text('KAMPUS', contentRight, 80, { align: 'right' });
      }

      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.text('THE MEGA MALL', pageWidth / 2, 70, { align: 'center' });

      pdf.setFontSize(11.5);
      pdf.text('Official Billing Invoice / Reimburstment Note', pageWidth / 2, 90, { align: 'center' });

      // Divider Line below Header
      pdf.setDrawColor(230, 230, 230);
      pdf.setLineWidth(0.75);
      pdf.line(leftMargin, 133, contentRight, 133);

      // 2. Customer & Invoice Metadata
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      pdf.text('Customer', leftMargin, 168);

      pdf.setFont('helvetica', 'normal');
      pdf.text('Legal Occupier: ' + (appState.occupier || 'FALAKNAZ SPRINGS,'), leftMargin, 185);

      const locText = 'Location: ' + (appState.location || 'The Mega Mall, Block-18, Gulishtan-e-Jauhar, Karachi.,');
      const locLines = pdf.splitTextToSize(locText, 310);
      pdf.text(locLines, leftMargin, 201);

      const billingY = 201 + (locLines.length * 14.5);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Billing Month: ' + normalizeMonthNames(inv.billingPeriod || ''), leftMargin, billingY);

      // Right Column Invoice info
      pdf.text('Invoice,', contentRight, 168, { align: 'right' });
      pdf.setFontSize(12);
      pdf.text(inv.invoiceNumber || '', contentRight, 187, { align: 'right' });
      pdf.setFontSize(10.5);
      pdf.setFont('helvetica', 'normal');
      const ntnVal = String(appState.ntn || 'C951537');
      pdf.text('NTN: ', contentRight - 48, 205, { align: 'right' });
      pdf.setFont('helvetica', 'bold');
      pdf.text(ntnVal, contentRight, 205, { align: 'right' });

      // 3. Billing Table (Dynamic Columns)
      const tableTop = Math.max(242, billingY + 22);
      const tableHeaderHeight = 45;
      const tableDataHeight = 24;

      let curX = leftMargin;
      pdf.setDrawColor(222, 226, 230);
      pdf.setLineWidth(0.75);

      cols.forEach((col, idx) => {
        const colW = colWidths[idx];

        // Header Cell
        pdf.setFillColor(250, 251, 252);
        pdf.rect(curX, tableTop, colW, tableHeaderHeight, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(94, 97, 111);

        const cleanLabel = (col.label || col.id)
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/\r/g, '');
        const lines = cleanLabel.split('\n');

        if (lines.length === 1) {
          pdf.text(lines[0].toUpperCase(), curX + colW / 2, tableTop + 26, { align: 'center' });
        } else if (lines.length === 2) {
          pdf.text(lines[0].toUpperCase(), curX + colW / 2, tableTop + 20, { align: 'center' });
          pdf.text(lines[1].toUpperCase(), curX + colW / 2, tableTop + 31, { align: 'center' });
        } else {
          pdf.text(lines[0].toUpperCase(), curX + colW / 2, tableTop + 16, { align: 'center' });
          pdf.text(lines[1].toUpperCase(), curX + colW / 2, tableTop + 26, { align: 'center' });
          pdf.text(lines[2].toUpperCase(), curX + colW / 2, tableTop + 36, { align: 'center' });
        }

        // Data Cell
        pdf.setFillColor(255, 255, 255);
        pdf.rect(curX, tableTop + tableHeaderHeight, colW, tableDataHeight, 'FD');

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10.5);
        pdf.setTextColor(0, 0, 0);

        let cellText = "";
        if (col.id === 'gallons') {
          cellText = inv.gallons ? String(inv.gallons).replace(/,/g, '') : "0";
        } else if (col.id === 'rate') {
          cellText = Number(inv.rate).toFixed(2);
        } else if (col.id === 'billAmount') {
          cellText = `${formatNumber(inv.billAmount)}/-`;
        } else if (col.id === 'previous') {
          cellText = inv.previous === 0 ? "0" : `${formatNumber(inv.previous)}`;
        } else if (col.id === 'totalPayable') {
          cellText = `${formatNumber(inv.totalPayable)}/-`;
        } else {
          const rawVal = (inv.customValues && inv.customValues[col.id] !== undefined)
            ? inv.customValues[col.id]
            : (col.defaultValue || "");
          if (col.type === 'currency' && rawVal !== "") {
            cellText = `${formatNumber(rawVal)}/-`;
          } else if (col.type === 'number' && rawVal !== "") {
            cellText = String(rawVal).replace(/,/g, '');
          } else {
            cellText = String(rawVal || "");
          }
        }

        pdf.text(cellText, curX + colW / 2, tableTop + tableHeaderHeight + 16, { align: 'center' });
        curX += colW;
      });

      // 4. Amount in Words
      const wordsY = tableTop + tableHeaderHeight + tableDataHeight + 25;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      pdf.setTextColor(0, 0, 0);
      const amountWords = formatAmountInWords(inv.totalPayable);
      pdf.text(amountWords, pageWidth / 2, wordsY, { align: 'center' });

      // 5. Bullet Notices
      let noticeY = wordsY + 28;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      pdf.setTextColor(0, 0, 0);
      pdf.text('• *Please make payment in favour of Kampus Integrated Services NTN: C951537 Account No:', leftMargin + 10, noticeY);
      noticeY += 13.5;
      pdf.text('10380109491064 in Meezan Bank.', leftMargin + 19, noticeY);
      noticeY += 18.5;
      pdf.text('• *If the payment is not received till the last payment date, "The Mega Mall" will hold the services of your', leftMargin + 10, noticeY);
      noticeY += 13.5;
      pdf.text('lincensed area and will not held responsible for any losses Whats so ever there for.', leftMargin + 19, noticeY);

      // 6. Signoff
      const signoffY = 680;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Account Department', leftMargin, signoffY);
      pdf.text('Date : ' + normalizeMonthNames(inv.issueDate || ''), leftMargin, signoffY + 20);

      pdf.text('Management', contentRight, signoffY, { align: 'right' });
      pdf.setFontSize(10);
      pdf.text('(Kampus Integrated Services)', contentRight, signoffY + 18, { align: 'right' });
      pdf.text('(The Mega Mall)', contentRight, signoffY + 34, { align: 'right' });

      // 7. Footer
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      pdf.text('4 Floor, Mega Mall, Block-18, Gulishtan-E-Jauhar, Karachi.', pageWidth / 2, 800, { align: 'center' });
    }

    const safeOccupier = (appState.occupier || "Invoices").replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `Water_Invoices_${safeOccupier}.pdf`;
    pdf.save(filename);
    showToast(`Exported all ${invoices.length} invoices as editable PDF with selectable text!`, "success");
  } catch (err) {
    console.error("PDF export error:", err);
    showToast("Could not export PDF: " + err.message, "error");
  } finally {
    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
}

function triggerPrint() {
  const wasSingle = !appState.viewAllPages;
  if (wasSingle) {
    appState.viewAllPages = true;
    renderPreview();
  }
  setTimeout(() => {
    window.print();
    if (wasSingle) {
      appState.viewAllPages = false;
      renderPreview();
    }
  }, 200);
}

function exportToCsv() {
  const invoices = calculateInvoices();
  let csv = "Month,InvoiceNumber,BillingPeriod,IssueDate,Gallons,Rate,PreviousBalance,BillAmount,TotalPayable\n";
  invoices.forEach(inv => {
    csv += `"${inv.monthName} ${inv.year}","${inv.invoiceNumber}","${inv.billingPeriod}","${inv.issueDate}",${inv.gallons},${inv.rate},${inv.previous},${inv.billAmount},${inv.totalPayable}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `water_billing_schedule_${appState.startMonth}_to_${appState.endMonth}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast("CSV file exported successfully", "success");
}

// ----------------------------------------------------------
// File Import Engine (PDF, Word .docx, and CSV)
// ----------------------------------------------------------
let stagedFileData = null;

function handleFileSelection(file) {
  if (!file) return;

  const reader = new FileReader();
  const statusEl = document.getElementById("fileUploadStatus");
  statusEl.style.display = "block";
  statusEl.textContent = `Reading ${file.name}...`;

  reader.onload = async (e) => {
    const base64Data = e.target.result.split(',')[1];
    stagedFileData = {
      filename: file.name,
      fileBase64: base64Data
    };
    statusEl.textContent = `Ready to import: ${file.name} (${Math.round(file.size / 1024)} KB)`;
  };

  reader.readAsDataURL(file);
}

async function processImport() {
  const statusEl = document.getElementById("fileUploadStatus");
  const rawText = document.getElementById("importTextarea").value.trim();
  const isScratch = document.getElementById("importModeScratch")?.checked;

  // If raw text is provided
  if (rawText && !stagedFileData) {
    if (isScratch) {
      appState.manualCorrections = {};
    }
    const lines = rawText.split("\n");
    let count = 0;
    lines.forEach(line => {
      const parts = line.split(",").map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 2) {
        const ym = parts[0];
        if (/^\d{4}-\d{2}$/.test(ym)) {
          if (!appState.manualCorrections[ym]) appState.manualCorrections[ym] = {};
          if (parts[1] && !isNaN(parts[1])) appState.manualCorrections[ym].gallons = Number(parts[1]);
          if (parts[2] && !isNaN(parts[2])) appState.manualCorrections[ym].rate = Number(parts[2]);
          if (parts[3] && !isNaN(parts[3])) appState.manualCorrections[ym].previous = Number(parts[3]);
          count++;
        }
      }
    });
    closeImportModal();
    renderPreview();
    renderDataEditor();
    showToast(`Imported ${count} months from text (${isScratch ? 'Clean scratch import' : 'Merged / Overwritten'})`, "success");
    return;
  }

  if (!stagedFileData) {
    showToast("Please choose a file or paste text first", "warning");
    return;
  }

  statusEl.textContent = "Uploading & parsing on server...";

  try {
    const res = await authFetch('/api/import/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stagedFileData)
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || "Failed to parse file");
    }

    if (data.invoices && Array.isArray(data.invoices)) {
      if (isScratch) {
        appState.manualCorrections = {};
      }
      if (data.occupier) appState.occupier = data.occupier;
      if (data.location) appState.location = data.location;
      if (data.ntn) appState.ntn = data.ntn;

      // Extract min and max months from invoices if available
      let minYM = null;
      let maxYM = null;
      data.invoices.forEach(inv => {
        // Match month and year from billingPeriod or issueDate
        const match = (inv.billingPeriod || inv.issueDate || '').match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
        if (match) {
          const mName = match[1].toLowerCase();
          const year = match[2];
          const mIdx = MONTH_NAMES_SHORT.findIndex(s => s.toLowerCase().startsWith(mName.slice(0, 3)) || s.toLowerCase() === mName);
          if (mIdx >= 0) {
            const ym = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
            if (!minYM || ym < minYM) minYM = ym;
            if (!maxYM || ym > maxYM) maxYM = ym;
            if (!appState.manualCorrections[ym]) appState.manualCorrections[ym] = {};
            if (inv.invoiceNumber) appState.manualCorrections[ym].invoiceNumber = inv.invoiceNumber;
            if (inv.billingPeriod) appState.manualCorrections[ym].billingPeriod = normalizeMonthNames(inv.billingPeriod);
            if (inv.issueDate) appState.manualCorrections[ym].issueDate = normalizeMonthNames(inv.issueDate);
            if (inv.gallons) appState.manualCorrections[ym].gallons = inv.gallons;
            if (inv.rate) appState.manualCorrections[ym].rate = inv.rate;
            if (inv.previous !== undefined) appState.manualCorrections[ym].previous = inv.previous;
          }
        }
      });

      if (minYM && maxYM) {
        appState.startMonth = minYM;
        appState.endMonth = maxYM;
      }

      closeImportModal();
      syncInputsWithState();
      updateYearConfigsUI();
      renderPreview();
      renderDataEditor();
      showToast(`Successfully imported ${data.invoices.length} invoices from ${stagedFileData.filename} (${isScratch ? 'Clean scratch import' : 'Merged / Overwritten'})`, "success");
    } else {
      throw new Error("No invoices found in file");
    }
  } catch (err) {
    showToast("Import error: " + err.message, "error");
    statusEl.textContent = "Error: " + err.message;
  }
}

function openImportModal() {
  stagedFileData = null;
  document.getElementById("fileUploadStatus").style.display = "none";
  document.getElementById("importTextarea").value = "";
  const el = document.getElementById("importModalBackdrop");
  if (el) {
    el.classList.add("open");
    el.classList.add("active");
  }
}
function closeImportModal() {
  const el = document.getElementById("importModalBackdrop");
  if (el) {
    el.classList.remove("open");
    el.classList.remove("active");
  }
}

// ----------------------------------------------------------
// Interactive Calendar Popovers (3-Letter Months & Bounds Sized)
// ----------------------------------------------------------
let startCalYear = 2024;
let endCalYear = 2026;

function initCalendarPopovers() {
  const startBtn = document.getElementById("startCalBtn");
  const endBtn = document.getElementById("endCalBtn");
  const startPopover = document.getElementById("startCalPopover");
  const endPopover = document.getElementById("endCalPopover");

  startBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    endPopover.classList.remove("open");
    startPopover.classList.toggle("open");
    renderCalGrid("start");
  });

  endBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    startPopover.classList.remove("open");
    endPopover.classList.toggle("open");
    renderCalGrid("end");
  });

  document.addEventListener("click", (e) => {
    if (!startPopover.contains(e.target) && e.target !== startBtn) startPopover.classList.remove("open");
    if (!endPopover.contains(e.target) && e.target !== endBtn) endPopover.classList.remove("open");
  });

  document.getElementById("startCalPrevYear").addEventListener("click", (e) => {
    e.stopPropagation();
    startCalYear--;
    renderCalGrid("start");
  });
  document.getElementById("startCalNextYear").addEventListener("click", (e) => {
    e.stopPropagation();
    startCalYear++;
    renderCalGrid("start");
  });

  document.getElementById("endCalPrevYear").addEventListener("click", (e) => {
    e.stopPropagation();
    endCalYear--;
    renderCalGrid("end");
  });
  document.getElementById("endCalNextYear").addEventListener("click", (e) => {
    e.stopPropagation();
    endCalYear++;
    renderCalGrid("end");
  });
}

function renderCalGrid(type) {
  const isStart = type === "start";
  const currentVal = isStart ? appState.startMonth : appState.endMonth;
  const [curY, curM] = currentVal.split("-").map(Number);
  const year = isStart ? startCalYear : endCalYear;

  document.getElementById(`${type}CalYearLabel`).textContent = year;
  const grid = document.getElementById(`${type}CalMonthsGrid`);
  grid.innerHTML = "";

  MONTH_NAMES_SHORT.forEach((name, idx) => {
    const monthNum = idx + 1;
    const isSelected = curY === year && curM === monthNum;
    const cell = document.createElement("div");
    cell.className = `cal-month-cell ${isSelected ? 'selected' : ''}`;
    cell.textContent = name;
    cell.addEventListener("click", (e) => {
      e.stopPropagation();
      const ym = `${year}-${String(monthNum).padStart(2, '0')}`;
      document.getElementById(`${type}CalPopover`).classList.remove("open");
      updateBillingDate(type, ym);
    });
    grid.appendChild(cell);
  });
}

// Load Preset
function applyPreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return;

  document.querySelectorAll(".preset-pill-btn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.getElementById(`preset-${presetKey}`);
  if (activeBtn) activeBtn.classList.add("active");

  appState.occupier = preset.occupier;
  appState.location = preset.location;
  appState.ntn = preset.ntn;
  appState.startMonth = preset.startMonth;
  appState.endMonth = preset.endMonth;
  appState.invPrefix = preset.invPrefix;
  appState.invStartNum = preset.invStartNum;
  appState.invSuffix = preset.invSuffix;
  appState.includePrevBalance = preset.includePrevBalance;
  appState.prevBalanceMode = preset.prevBalanceMode;
  appState.yearRates = JSON.parse(JSON.stringify(preset.rates));
  appState.seqMode = preset.seqMode || "incremental";
  if (preset.manualCorrections) {
    appState.manualCorrections = JSON.parse(JSON.stringify(preset.manualCorrections));
  } else {
    appState.manualCorrections = {};
    if (preset.rates["2025"]?.overrides) {
      Object.entries(preset.rates["2025"].overrides).forEach(([ym, gal]) => {
        appState.manualCorrections[ym] = { gallons: gal };
      });
    }
  }

  appState.currentPageIndex = 0;

  syncInputsWithState();
  updateYearConfigsUI();
  renderPreview();
  renderDataEditor();
  debouncedSaveProjectState();
  showToast(`Loaded ${presetKey === 'falaknaz' ? 'Falaknaz Springs' : 'Mega Residency'} preset`, "success");
}

// Sync Form Inputs with appState
function syncInputsWithState() {
  document.getElementById("occupierInput").value = appState.occupier;
  document.getElementById("locationInput").value = appState.location;
  document.getElementById("ntnInput").value = appState.ntn;
  document.getElementById("startMonthInput").value = appState.startMonth;
  document.getElementById("endMonthInput").value = appState.endMonth;

  const isMonthly = (appState.seqMode || "month_year") === "month_year";
  const seqSelect = document.getElementById("seqModeSelect");
  if (seqSelect) seqSelect.value = isMonthly ? "month_year" : "incremental";

  const monthlyFields = document.getElementById("monthlySeqFields");
  const incFields = document.getElementById("incrementalSeqFields");
  if (monthlyFields) monthlyFields.style.display = isMonthly ? "grid" : "none";
  if (incFields) incFields.style.display = isMonthly ? "none" : "block";

  const prefixInput = document.getElementById("invPrefixInput");
  if (prefixInput) prefixInput.value = appState.invPrefix || (isMonthly ? "#INV-01-" : "#INV-");

  const previewText = document.getElementById("monthlySeqPreviewText");
  if (previewText) {
    let p = (appState.invPrefix || "#INV-01-").trim();
    if (/#INV-\d+-\d{2}-\d{4}/i.test(p)) {
      const pm = p.match(/^([#A-Za-z0-9]+-\d+-)/);
      if (pm) p = pm[1];
    }
    if (p === "#INV-" || p === "#INV" || p === "INV-" || p === "INV") p = "#INV-01-";
    if (!p.endsWith("-")) p += "-";
    previewText.textContent = `${p}01-2024`;
  }

  document.getElementById("invStartNumInput").value = appState.invStartNum !== undefined ? appState.invStartNum : 3001;
  document.getElementById("invSuffixInput").value = appState.invSuffix || "";
  const autoSuffixToggle = document.getElementById("autoSuffixYearToggle");
  if (autoSuffixToggle) autoSuffixToggle.checked = !!appState.autoSuffixYear;
  document.getElementById("prevBalanceToggle").checked = !!appState.includePrevBalance;
  const prevOptions = document.getElementById("prevBalanceOptions");
  if (prevOptions) prevOptions.style.display = appState.includePrevBalance ? "flex" : "none";

  // Opening Balance & Dropdown Behavior for Previous Amount
  const openBalInput = document.getElementById("openingBalanceInput");
  if (openBalInput) openBalInput.value = appState.openingBalance !== undefined ? appState.openingBalance : 0;

  const prevModeSelect = document.getElementById("prevBalanceModeSelect");
  if (prevModeSelect) prevModeSelect.value = appState.prevBalanceMode || "zero";

  // Also sync Editor Sequence Bar inputs
  const edMode = document.getElementById("editorSeqMode");
  const edPrefix = document.getElementById("editorSeqPrefix");
  const edStart = document.getElementById("editorSeqStartNum");
  const edSuffix = document.getElementById("editorSeqSuffix");
  const edAutoYear = document.getElementById("editorSeqAutoYear");
  const edStartItem = document.getElementById("editorSeqStartItem");
  const edSuffixItem = document.getElementById("editorSeqSuffixItem");
  const edAutoYearItem = document.getElementById("editorSeqAutoYearItem");

  if (edMode) edMode.value = isMonthly ? "month_year" : "incremental";
  if (edPrefix) edPrefix.value = appState.invPrefix || (isMonthly ? "#INV-01-" : "#INV-");
  if (edStart) edStart.value = appState.invStartNum !== undefined ? appState.invStartNum : 3001;
  if (edSuffix) edSuffix.value = appState.invSuffix || "";
  if (edAutoYear) edAutoYear.checked = !!appState.autoSuffixYear;

  if (edStartItem) edStartItem.style.display = isMonthly ? "none" : "flex";
  if (edSuffixItem) edSuffixItem.style.display = isMonthly ? "none" : "flex";
  if (edAutoYearItem) edAutoYearItem.style.display = isMonthly ? "none" : "flex";

  const [sY] = (appState.startMonth || "2024-01").split("-").map(Number);
  const [eY] = (appState.endMonth || "2026-07").split("-").map(Number);
  startCalYear = sY;
  endCalYear = eY;
}

// ----------------------------------------------------------
// Resizable Split-Pane & Live Preview Toggle Handlers
// ----------------------------------------------------------
let isPreviewHidden = localStorage.getItem('mega_mall_preview_hidden') === 'true';

function initSplitPaneResizer() {
  const container = document.getElementById("mainContainer");
  const sidebar = document.getElementById("settingsSidebar");
  const handle = document.getElementById("resizerHandle");
  if (!container || !sidebar || !handle) return;

  function checkSidebarResponsive() {
    if (window.innerWidth <= 1180) {
      sidebar.style.width = "";
    } else {
      const savedWidth = localStorage.getItem('mega_mall_sidebar_width');
      if (savedWidth && parseInt(savedWidth, 10) >= 280) {
        const targetWidth = Math.min(parseInt(savedWidth, 10), Math.round(window.innerWidth * 0.45));
        sidebar.style.width = `${targetWidth}px`;
      } else {
        sidebar.style.width = "420px";
      }
    }
  }

  window.addEventListener("resize", checkSidebarResponsive);
  checkSidebarResponsive();

  // Restore preview toggle state
  if (isPreviewHidden) {
    applyPreviewToggle(true, false);
  }

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener("mousedown", (e) => {
    if (window.innerWidth <= 1180) return;
    isDragging = true;
    startX = e.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    handle.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startX;
    let newWidth = startWidth + deltaX;

    // Constrain width between 280px and max 50vw or window width - 360px
    const minW = 280;
    const maxW = Math.max(minW, Math.min(Math.round(window.innerWidth * 0.5), window.innerWidth - 360));
    newWidth = Math.max(minW, Math.min(newWidth, maxW));

    sidebar.style.width = `${newWidth}px`;
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      handle.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (window.innerWidth > 1180) {
        const currentWidth = Math.round(sidebar.getBoundingClientRect().width);
        localStorage.setItem('mega_mall_sidebar_width', currentWidth);
      }
    }
  });

  // Double click reset to default 420px
  handle.addEventListener("dblclick", () => {
    if (window.innerWidth <= 1180) return;
    sidebar.style.width = "420px";
    localStorage.setItem('mega_mall_sidebar_width', 420);
    showToast("Sidebar width reset to default (420px)", "info");
  });
}

function togglePreview() {
  isPreviewHidden = !isPreviewHidden;
  localStorage.setItem('mega_mall_preview_hidden', isPreviewHidden ? 'true' : 'false');
  applyPreviewToggle(isPreviewHidden, true);
}

function applyPreviewToggle(hide, showNotification = true) {
  const container = document.getElementById("mainContainer");
  const btn = document.getElementById("togglePreviewBtn");
  const text = document.getElementById("togglePreviewText");
  const icon = document.getElementById("togglePreviewIcon");
  if (!container || !btn || !text || !icon) return;

  container.classList.toggle("preview-hidden", hide);
  if (hide) {
    text.textContent = "Show Preview";
    btn.title = "Show Live Invoice Preview";
    // Eye icon (view)
    icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />`;
    if (showNotification) showToast("Live preview hidden (settings expanded)", "info");
  } else {
    text.textContent = "Hide Preview";
    btn.title = "Hide Live Preview to maximize settings space";
    // Eye-slash icon (hide)
    icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />`;
    if (showNotification) showToast("Live preview restored", "info");
  }
}

// Helper to escape HTML characters in templates
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================================
// Security Safeguards: Block Developer Tools & Context Menu
// ==========================================================
(function initSecuritySafeguards() {
  // 1. Block right-click context menu everywhere
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    return false;
  }, true);

  // 2. Block DevTools keyboard shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S)
  document.addEventListener("keydown", (e) => {
    // F12
    if (e.key === "F12" || e.keyCode === 123) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
    if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
      const k = (e.key || "").toLowerCase();
      if (k === "i" || k === "j" || k === "c" || e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }
    // Ctrl+U (View Source)
    if ((e.ctrlKey || e.metaKey) && ((e.key || "").toLowerCase() === "u" || e.keyCode === 85)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Ctrl+S (Save Page)
    if ((e.ctrlKey || e.metaKey) && ((e.key || "").toLowerCase() === "s" || e.keyCode === 83)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);
})();

// ==========================================================
// KernelX Master Admin Console (/kernelx)
// ==========================================================
let kernelxUsersList = [];

function getKernelxToken() {
  return sessionStorage.getItem('kernelx_auth_token');
}

function setKernelxSession(token, user) {
  if (token) sessionStorage.setItem('kernelx_auth_token', token);
  if (user) sessionStorage.setItem('kernelx_auth_user', JSON.stringify(user));
}

function clearKernelxSession() {
  sessionStorage.removeItem('kernelx_auth_token');
  sessionStorage.removeItem('kernelx_auth_user');
}

async function kernelxFetch(url, options = {}) {
  const token = getKernelxToken();
  const headers = Object.assign({}, options.headers || {});
  if (token) headers['Authorization'] = `Bearer ${token}`;
  options.headers = headers;

  const res = await fetch(url, options);
  if (res.status === 401) {
    clearKernelxSession();
    showKernelxGate("Master session expired or unauthorized. Please re-enter credentials.");
    throw new Error("Unauthorized");
  }
  return res;
}

function showKernelxGate(errorMsg = "") {
  const gate = document.getElementById("kernelxLoginGate");
  const dash = document.getElementById("kernelxDashboard");
  const alertEl = document.getElementById("kernelxLoginAlert");
  if (gate) gate.style.display = "flex";
  if (dash) dash.style.display = "none";
  if (alertEl && !rateLimitTimers.kernelx) {
    if (errorMsg) {
      alertEl.textContent = errorMsg;
      alertEl.className = "login-error-alert";
      alertEl.style.display = "block";
    } else {
      alertEl.style.display = "none";
    }
  }
  checkIpRateLimitStatus('kernelx');
}

function showKernelxDashboard() {
  const gate = document.getElementById("kernelxLoginGate");
  const dash = document.getElementById("kernelxDashboard");
  if (gate) gate.style.display = "none";
  if (dash) dash.style.display = "flex";
  loadKernelxUsers();
}

async function initKernelx() {
  // Wire up login form
  const loginForm = document.getElementById("kernelxLoginForm");
  loginForm?.addEventListener("submit", handleKernelxLogin);

  // Wire up password toggle
  document.getElementById("toggleKernelxPassBtn")?.addEventListener("click", () => {
    const input = document.getElementById("kernelxPassword");
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
  });

  // Wire up logout button
  document.getElementById("kernelxLogoutBtn")?.addEventListener("click", () => {
    clearKernelxSession();
    showToast("Master Console locked.", "info");
    showKernelxGate();
  });

  // Wire up Add User Modal
  document.getElementById("kernelxAddUserBtn")?.addEventListener("click", () => {
    document.getElementById("addModalUsername").value = "";
    document.getElementById("addModalPassword").value = "";
    document.getElementById("addModalRole").value = "Staff";
    document.getElementById("kernelxAddModalAlert").style.display = "none";
    document.getElementById("kernelxAddModalBackdrop").style.display = "flex";
  });

  document.getElementById("kernelxCloseAddModalBtn")?.addEventListener("click", () => {
    document.getElementById("kernelxAddModalBackdrop").style.display = "none";
  });
  document.getElementById("kernelxCancelAddModalBtn")?.addEventListener("click", () => {
    document.getElementById("kernelxAddModalBackdrop").style.display = "none";
  });

  document.getElementById("kernelxAddUserForm")?.addEventListener("submit", handleKernelxAddUser);

  // Wire up Edit User Modal
  document.getElementById("kernelxCloseEditModalBtn")?.addEventListener("click", () => {
    document.getElementById("kernelxEditModalBackdrop").style.display = "none";
  });
  document.getElementById("kernelxCancelEditModalBtn")?.addEventListener("click", () => {
    document.getElementById("kernelxEditModalBackdrop").style.display = "none";
  });

  document.getElementById("kernelxEditUserForm")?.addEventListener("submit", handleKernelxEditUser);

  // Wire up Delete User Modal
  document.getElementById("kernelxCloseDeleteModalBtn")?.addEventListener("click", () => {
    document.getElementById("kernelxDeleteModalBackdrop").style.display = "none";
  });
  document.getElementById("kernelxCancelDeleteModalBtn")?.addEventListener("click", () => {
    document.getElementById("kernelxDeleteModalBackdrop").style.display = "none";
  });

  // Wire up live search filter
  document.getElementById("kernelxSearchInput")?.addEventListener("input", (e) => {
    renderKernelxTable(e.target.value);
  });

  // Check existing token
  const token = getKernelxToken();
  if (token) {
    try {
      const res = await fetch('/api/kernelx/verify', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showKernelxDashboard();
        return;
      }
    } catch (e) {}
  }

  clearKernelxSession();
  showKernelxGate();
}

async function handleKernelxLogin(e) {
  e.preventDefault();
  const userEl = document.getElementById("kernelxUsername");
  const passEl = document.getElementById("kernelxPassword");
  const submitBtn = document.getElementById("kernelxLoginSubmitBtn");
  const submitText = document.getElementById("kernelxLoginSubmitText");
  const alertEl = document.getElementById("kernelxLoginAlert");

  const username = userEl.value.trim();
  const password = passEl.value;

  if (!username || !password) {
    alertEl.textContent = "Please enter Admin ID and Password.";
    alertEl.className = "login-error-alert";
    alertEl.style.display = "block";
    return;
  }

  submitBtn.disabled = true;
  submitText.textContent = "Verifying...";
  if (!rateLimitTimers.kernelx) {
    alertEl.style.display = "none";
  }

  try {
    const res = await fetch('/api/kernelx/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.status === 429) {
      startRateLimitCountdown({
        btn: submitBtn,
        textEl: submitText,
        alertEl: alertEl,
        defaultText: "Authorize Master Access",
        remainingSeconds: data.remainingSeconds || 900,
        lockedUntil: data.lockedUntil,
        key: 'kernelx'
      });
      return;
    }

    if (!res.ok) throw new Error(data.error || "Authentication failed.");

    setKernelxSession(data.token, data.user);
    passEl.value = "";
    showToast("Master Kernel access granted.", "success");
    showKernelxDashboard();
  } catch (err) {
    alertEl.textContent = err.message;
    alertEl.className = "login-error-alert";
    alertEl.style.display = "block";
  } finally {
    if (!rateLimitTimers.kernelx) {
      submitBtn.disabled = false;
      submitText.textContent = "Authorize Master Access";
    }
  }
}

async function loadKernelxUsers() {
  const tbody = document.getElementById("kernelxTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Loading user directory...</td></tr>`;

  try {
    const res = await kernelxFetch('/api/kernelx/users');
    const data = await res.json();
    kernelxUsersList = data.users || [];
    renderKernelxTable();
    updateKernelxStats();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--accent-red);">Failed to load users: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function updateKernelxStats() {
  const total = kernelxUsersList.length;
  const admins = kernelxUsersList.filter(u => u.role === 'Administrator').length;
  const staff = kernelxUsersList.filter(u => u.role !== 'Administrator').length;

  document.getElementById("kernelxStatTotal").textContent = total;
  document.getElementById("kernelxStatAdmins").textContent = admins;
  document.getElementById("kernelxStatStaff").textContent = staff;
}

function renderKernelxTable(query = "") {
  const tbody = document.getElementById("kernelxTableBody");
  const countLabel = document.getElementById("kernelxUserCountLabel");
  if (!tbody) return;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? kernelxUsersList.filter(u => u.username.toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q))
    : kernelxUsersList;

  countLabel.textContent = `Showing ${filtered.length} of ${kernelxUsersList.length} user accounts`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-dim);">No matching user accounts found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const initials = (u.username || "U").substring(0, 2).toUpperCase();
    const isAdmin = u.role === 'Administrator';
    const roleBadge = isAdmin
      ? `<span class="role-badge-admin">Administrator</span>`
      : `<span class="role-badge-staff">Staff</span>`;
    const createdStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "System";

    return `
      <tr>
        <td>
          <div class="user-cell">
            <div class="user-avatar-circle">${escapeHtml(initials)}</div>
            <div class="user-names">
              <span class="user-username">${escapeHtml(u.username)}</span>
              <span class="user-id-sub">${escapeHtml(u.id)}</span>
            </div>
          </div>
        </td>
        <td>${roleBadge}</td>
        <td style="color:var(--text-muted); font-size:0.75rem;">${createdStr}</td>
        <td>
          <span class="status-badge-active">
            <span class="live-pulse-dot" style="width:6px; height:6px;"></span>
            Active Sync
          </span>
        </td>
        <td>
          <div class="table-actions-cell">
            <button type="button" class="btn btn-secondary btn-sm" onclick="openKernelxEditModal('${escapeHtml(u.id)}')">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:12px; height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              Edit
            </button>
            <button type="button" class="btn btn-danger btn-sm" onclick="openKernelxDeleteModal('${escapeHtml(u.id)}', '${escapeHtml(u.username)}')">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:12px; height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              Remove
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function handleKernelxAddUser(e) {
  e.preventDefault();
  const username = document.getElementById("addModalUsername").value.trim();
  const password = document.getElementById("addModalPassword").value.trim();
  const role = document.getElementById("addModalRole").value;
  const alertEl = document.getElementById("kernelxAddModalAlert");
  const submitBtn = document.getElementById("kernelxSubmitAddUserBtn");

  if (!username || !password) {
    alertEl.textContent = "Please provide username and password.";
    alertEl.style.display = "block";
    return;
  }

  submitBtn.disabled = true;
  alertEl.style.display = "none";

  try {
    const res = await kernelxFetch('/api/kernelx/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create user.");

    showToast(`User account "${username}" created successfully!`, "success");
    document.getElementById("kernelxAddModalBackdrop").style.display = "none";
    await loadKernelxUsers();
  } catch (err) {
    alertEl.textContent = err.message;
    alertEl.style.display = "block";
  } finally {
    submitBtn.disabled = false;
  }
}

function openKernelxEditModal(userId) {
  const user = kernelxUsersList.find(u => u.id === userId);
  if (!user) return;

  document.getElementById("editModalUserId").value = user.id;
  document.getElementById("editModalUsername").value = user.username;
  document.getElementById("editModalPassword").value = "";
  document.getElementById("editModalRole").value = user.role || "Staff";
  document.getElementById("kernelxEditModalAlert").style.display = "none";
  document.getElementById("kernelxEditModalBackdrop").style.display = "flex";
}

async function handleKernelxEditUser(e) {
  e.preventDefault();
  const userId = document.getElementById("editModalUserId").value;
  const username = document.getElementById("editModalUsername").value.trim();
  const password = document.getElementById("editModalPassword").value.trim();
  const role = document.getElementById("editModalRole").value;
  const alertEl = document.getElementById("kernelxEditModalAlert");
  const submitBtn = document.getElementById("kernelxSubmitEditUserBtn");

  if (!username) {
    alertEl.textContent = "Username is required.";
    alertEl.style.display = "block";
    return;
  }

  submitBtn.disabled = true;
  alertEl.style.display = "none";

  try {
    const res = await kernelxFetch(`/api/kernelx/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update user.");

    showToast(`User "${username}" updated successfully!`, "success");
    document.getElementById("kernelxEditModalBackdrop").style.display = "none";
    await loadKernelxUsers();
  } catch (err) {
    alertEl.textContent = err.message;
    alertEl.style.display = "block";
  } finally {
    submitBtn.disabled = false;
  }
}

function openKernelxDeleteModal(userId, username) {
  document.getElementById("kernelxDeleteUsernameHighlight").textContent = `"${username}"`;
  document.getElementById("kernelxDeleteModalBackdrop").style.display = "flex";

  const confirmBtn = document.getElementById("kernelxConfirmDeleteBtn");
  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Revoking...";
    try {
      const res = await kernelxFetch(`/api/kernelx/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user.");

      showToast(`User "${username}" removed. Active session terminated.`, "success");
      document.getElementById("kernelxDeleteModalBackdrop").style.display = "none";
      await loadKernelxUsers();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Revoke & Delete";
    }
  };
}

// ==========================================================
// Toast Notification Helper (Universal)
// ==========================================================
function showToast(message, type = 'info') {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  const bg = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#3b82f6');
  toast.style.cssText = `
    background: ${bg};
    color: #ffffff;
    padding: 0.65rem 1rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    margin-top: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    z-index: 99999;
  `;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================================
// Allottees Rent Master Portal Logic (/rents)
// ==========================================================
let rentsDb = {
  updatedAt: null,
  months: [],
  records: []
};
let currentRentsMonth = 'ALL';
let rentsSearchQuery = '';
let stagedImportRecords = [];

function getRentsToken() {
  return sessionStorage.getItem('mega_rents_auth_token') || localStorage.getItem('mega_rents_auth_token');
}

function setRentsSession(token) {
  if (token) {
    sessionStorage.setItem('mega_rents_auth_token', token);
    localStorage.setItem('mega_rents_auth_token', token);
  }
}

function clearRentsSession() {
  sessionStorage.removeItem('mega_rents_auth_token');
  localStorage.removeItem('mega_rents_auth_token');
}

async function rentsAuthFetch(url, options = {}) {
  const token = getRentsToken();
  const headers = Object.assign({}, options.headers || {});
  if (token) headers['Authorization'] = `Bearer ${token}`;
  options.headers = headers;

  const res = await fetch(url, options);
  if (res.status === 401) {
    clearRentsSession();
    showRentsLoginGate("Session expired or unauthorized. Please re-enter security password.");
    throw new Error("Unauthorized");
  }
  return res;
}

function showRentsLoginGate(errorMsg = "") {
  const gate = document.getElementById("rentsLoginGate");
  const dash = document.getElementById("rentsDashboard");
  const alertEl = document.getElementById("rentsLoginAlert");
  if (gate) gate.style.display = "flex";
  if (dash) dash.style.display = "none";
  if (alertEl) {
    if (errorMsg) {
      alertEl.textContent = errorMsg;
      alertEl.className = "login-error-alert";
      alertEl.style.display = "block";
    } else {
      alertEl.style.display = "none";
    }
  }
}

function hideRentsLoginGate() {
  const gate = document.getElementById("rentsLoginGate");
  const dash = document.getElementById("rentsDashboard");
  if (gate) gate.style.display = "none";
  if (dash) dash.style.display = "flex";
}

async function checkRentsAuthSession() {
  const token = getRentsToken();
  if (!token) {
    showRentsLoginGate();
    return;
  }
  try {
    const res = await fetch('/api/rents/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      hideRentsLoginGate();
      loadRentsFromLocalStorage();
    } else {
      clearRentsSession();
      showRentsLoginGate("Session expired. Please enter security password.");
    }
  } catch (err) {
    console.warn("Rents verification network error:", err);
    if (!navigator.onLine || (err && (err.name === 'TypeError' || String(err).includes('Failed to fetch')))) {
      if (token) {
        hideRentsLoginGate();
        loadRentsFromLocalStorage();
        return;
      }
    }
    clearRentsSession();
    showRentsLoginGate();
  }
}

async function handleRentsLogin(e) {
  e.preventDefault();
  const input = document.getElementById("rentsPasswordInput");
  const submitBtn = document.getElementById("rentsLoginSubmitBtn");
  const submitText = document.getElementById("rentsLoginSubmitText");
  const alertEl = document.getElementById("rentsLoginAlert");
  if (!input) return;

  const password = input.value;
  submitBtn.disabled = true;
  submitText.textContent = "Verifying...";
  if (alertEl) alertEl.style.display = "none";

  try {
    const res = await fetch('/api/rents/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Access Denied: Invalid security password");
    }

    setRentsSession(data.token);
    input.value = "";
    hideRentsLoginGate();
    showToast("Password verified! Unlocked Allottees Rent Master.", "success");
    loadRentsFromLocalStorage();
  } catch (err) {
    if (alertEl) {
      alertEl.textContent = err.message;
      alertEl.className = "login-error-alert";
      alertEl.style.display = "block";
    }
  } finally {
    submitBtn.disabled = false;
    submitText.textContent = "Unlock Register";
  }
}

function handleRentsLogout() {
  clearRentsSession();
  showRentsLoginGate("Register locked. Please enter security password to access.");
  showToast("Register locked successfully.", "info");
}

let rentsEventsInitialized = false;

function toggleRentsTheme() {
  const container = document.getElementById('rentsTableContainer');
  const text = document.getElementById('rentsThemeToggleText');
  if (!container) return;
  const isExcel = container.classList.toggle('excel-theme');
  localStorage.setItem('mega_rents_theme', isExcel ? 'excel' : 'dark');
  if (text) {
    text.textContent = isExcel ? '📄 Classic Sheet' : '🌙 Dark Theme';
  }
  showToast(`Switched to ${isExcel ? 'Classic Excel Sheet' : 'Dark'} theme`, 'info');
}

function initRentsTheme() {
  const saved = localStorage.getItem('mega_rents_theme');
  const container = document.getElementById('rentsTableContainer');
  const text = document.getElementById('rentsThemeToggleText');
  if (!container) return;
  if (saved === 'excel') {
    container.classList.add('excel-theme');
    if (text) text.textContent = '📄 Classic Sheet';
  } else {
    container.classList.remove('excel-theme');
    if (text) text.textContent = '🌙 Dark Theme';
  }
}

async function initRentsApp() {
  initRentsTheme();
  setupRentsEventListeners();
  await checkRentsAuthSession();
}

const RENTS_LOCAL_STORAGE_KEY = 'mega_mall_rents_local_db';

function loadRentsFromLocalStorage() {
  const standardMonths = ['JAN-2026', 'FEB-2026', 'MARCH-2026', 'APRIL-2026', 'MAY-2026', 'JUNE-2026', 'JULY-2026', 'AUG-2026'];
  try {
    const saved = localStorage.getItem(RENTS_LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        rentsDb = parsed;
        const recordMonths = Array.from(new Set((rentsDb.records || []).map(r => r.month))).filter(Boolean);
        rentsDb.months = Array.from(new Set([...standardMonths, ...recordMonths]));
      }
    }
  } catch (e) {
    console.warn("Could not load rents from local storage:", e);
  }

  if (!rentsDb || !rentsDb.records) {
    rentsDb = {
      updatedAt: null,
      months: standardMonths,
      totalRecords: 0,
      records: []
    };
  }

  renderRentsMonthTabs();
  renderRentsTable();
  updateRentsStats();
}

function saveRentsToLocalStorage(notify = false) {
  try {
    if (!rentsDb) rentsDb = { records: [], months: [] };
    rentsDb.updatedAt = new Date().toISOString();
    rentsDb.totalRecords = (rentsDb.records || []).length;
    localStorage.setItem(RENTS_LOCAL_STORAGE_KEY, JSON.stringify(rentsDb));
    if (notify) {
      showToast('All changes saved securely to private local storage!', 'success');
    }
  } catch (e) {
    console.error("Local storage save error:", e);
    showToast('Failed to save to local storage: ' + e.message, 'error');
  }
}

function clearLocalRentsData() {
  const count = (rentsDb && rentsDb.records) ? rentsDb.records.length : 0;
  showConfirm("Clear Private Local Rent Data", `Are you sure you want to permanently delete all ${count} rent records from your device's local storage? This cannot be undone.`, () => {
    localStorage.removeItem(RENTS_LOCAL_STORAGE_KEY);
    const standardMonths = ['JAN-2026', 'FEB-2026', 'MARCH-2026', 'APRIL-2026', 'MAY-2026', 'JUNE-2026', 'JULY-2026', 'AUG-2026'];
    rentsDb = {
      updatedAt: null,
      months: standardMonths,
      totalRecords: 0,
      records: []
    };
    renderRentsMonthTabs();
    renderRentsTable();
    updateRentsStats();
    showToast("All rent data cleared from local storage.", "info");
  });
}

function renderRentsMonthTabs() {
  const container = document.getElementById('rentsMonthTabs');
  if (!container) return;
  const standardMonths = ['JAN-2026', 'FEB-2026', 'MARCH-2026', 'APRIL-2026', 'MAY-2026', 'JUNE-2026', 'JULY-2026', 'AUG-2026'];
  const recordMonths = Array.from(new Set((rentsDb.records || []).map(r => r.month))).filter(Boolean);
  const months = ['ALL', ...Array.from(new Set([...standardMonths, ...recordMonths]))];

  container.innerHTML = months.map(m => {
    const label = m === 'ALL' ? 'ALL MONTHS' : m;
    const isActive = currentRentsMonth === m;
    return `<button type="button" class="rents-month-btn ${isActive ? 'active' : ''}" data-month="${escapeHtml(m)}">${escapeHtml(label)}</button>`;
  }).join('');

  container.querySelectorAll('.rents-month-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.rents-month-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRentsMonth = btn.getAttribute('data-month');
      renderRentsTable();
      updateRentsStats();
    });
  });
}

function getFilteredRentRecords() {
  let list = rentsDb.records || [];
  if (currentRentsMonth && currentRentsMonth !== 'ALL') {
    list = list.filter(r => r.month === currentRentsMonth);
  }
  if (rentsSearchQuery) {
    const q = rentsSearchQuery.toLowerCase();
    list = list.filter(r => 
      (r.brand_name || '').toLowerCase().includes(q) ||
      (r.shop_no || '').toLowerCase().includes(q) ||
      (r.allotee_name || '').toLowerCase().includes(q) ||
      (r.chq_no || '').toLowerCase().includes(q) ||
      (r.month || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function renderRentsTable() {
  const thead = document.querySelector('#rentsMasterTable thead');
  const tbody = document.getElementById('rentsTableBody');
  const tfoot = document.getElementById('rentsTableFoot');
  const banner = document.getElementById('rentsSheetBanner');
  if (!tbody) return;

  const records = getFilteredRentRecords();
  const isAll = currentRentsMonth === 'ALL';
  const bannerTitle = isAll ? 'RENT MASTER REGISTER - ALL MONTHS' : `RENT MONTH OF ${currentRentsMonth}`;
  if (banner) banner.textContent = bannerTitle;

  // Render header dynamically matching reference screenshot
  if (thead) {
    if (isAll) {
      thead.innerHTML = `
        <tr>
          <th style="width: 55px; text-align:center;">S.NOS.</th>
          <th style="width: 95px; text-align:center;">MONTH</th>
          <th style="width: 140px;">BRAND NAME</th>
          <th style="width: 90px; text-align:center;">SHOP NOS.</th>
          <th style="min-width: 180px;">ALLOTEE</th>
          <th style="width: 75px; text-align:right;">SQ.FT.</th>
          <th style="width: 100px; text-align:right;">AMOUNT</th>
          <th style="width: 110px; text-align:center;">CHQ NO.</th>
          <th style="width: 95px; text-align:right;">PAID</th>
          <th style="width: 100px; text-align:center;">DATE</th>
          <th style="width: 100px; text-align:right;">IN HAND</th>
          <th style="width: 70px; text-align:center;" class="no-print">ACTIONS</th>
        </tr>
      `;
    } else {
      thead.innerHTML = `
        <tr>
          <th style="width: 55px; text-align:center;">S.NOS.</th>
          <th style="width: 150px;">BRAND NAME</th>
          <th style="width: 90px; text-align:center;">SHOP NOS.</th>
          <th style="min-width: 190px;">ALLOTEE</th>
          <th style="width: 75px; text-align:right;">SQ.FT.</th>
          <th style="width: 100px; text-align:right;">AMOUNT</th>
          <th style="width: 110px; text-align:center;">CHQ NO.</th>
          <th style="width: 95px; text-align:right;">PAID</th>
          <th style="width: 100px; text-align:center;">DATE</th>
          <th style="width: 100px; text-align:right;">IN HAND</th>
          <th style="width: 70px; text-align:center;" class="no-print">ACTIONS</th>
        </tr>
      `;
    }
  }

  if (records.length === 0) {
    const colSpan = isAll ? 12 : 11;
    tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding:2.5rem; color:var(--text-muted);">No matching rent records found.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  let totalSqFt = 0;
  let totalAmount = 0;
  let totalPaid = 0;
  let totalInHand = 0;
  let lastMonth = '';

  tbody.innerHTML = records.map((r, idx) => {
    totalSqFt += Number(r.sq_ft) || 0;
    totalAmount += Number(r.amount) || 0;
    totalPaid += Number(r.paid) || 0;
    totalInHand += Number(r.in_hand) || 0;

    const sqFtStr = r.sq_ft ? Number(r.sq_ft).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '0.0';
    const amountStr = r.amount ? Number(r.amount).toLocaleString() : '0';
    const paidStr = r.paid ? Number(r.paid).toLocaleString() : '0';
    const inHandStr = r.in_hand ? Number(r.in_hand).toLocaleString() : '0';

    let monthDivider = '';
    if (isAll && r.month && r.month !== lastMonth) {
      lastMonth = r.month;
      monthDivider = `
        <tr class="rents-month-divider-row">
          <td colspan="12" style="background:#1c1c1c; color:#ffffff; font-weight:800; font-size:0.85rem; padding:0.55rem 0.85rem; border-top:2px solid #383838; border-bottom:1px solid #2e2e2e; letter-spacing:0.04em;">
            📋 RENT REGISTER • ${escapeHtml(r.month)}
          </td>
        </tr>
      `;
    }

    return `
      ${monthDivider}
      <tr data-id="${escapeHtml(r.id)}">
        <td style="text-align:center; font-weight:700; color:#ffffff;">${idx + 1}</td>
        ${isAll ? `<td style="text-align:center; font-weight:700; color:#ffffff;">${escapeHtml(r.month || '')}</td>` : ''}
        <td style="font-weight:700; color:#ffffff;">${escapeHtml(r.brand_name || '')}</td>
        <td style="text-align:center; font-weight:700; color:#ffffff; letter-spacing:0.04em;">${escapeHtml(r.shop_no || '')}</td>
        <td style="font-weight:500; color:#ffffff;">${escapeHtml(r.allotee_name || '')}</td>
        <td style="text-align:right; font-weight:500; color:#ffffff;">${sqFtStr}</td>
        <td style="text-align:right; font-weight:700; color:#ffffff;">${amountStr}</td>
        <td style="text-align:center; font-family:monospace; font-size:0.85rem; color:#ffffff;">${escapeHtml(r.chq_no || '-')}</td>
        <td style="text-align:right; font-weight:700; color:#ffffff;">${paidStr}</td>
        <td style="text-align:center; font-size:0.75rem; color:#ffffff;">${escapeHtml(r.date || '-')}</td>
        <td style="text-align:right; font-weight:700; color:#ffffff;">${inHandStr}</td>
        <td style="text-align:center;" class="no-print">
          <button type="button" class="rents-action-btn edit" onclick="openRentsEditModal('${escapeHtml(r.id)}')" title="Edit Record">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:14px; height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
          </button>
          <button type="button" class="rents-action-btn delete" onclick="deleteRentRecord('${escapeHtml(r.id)}')" title="Delete Record">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:14px; height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (tfoot) {
    const totalLeadColSpan = isAll ? 4 : 3;
    tfoot.innerHTML = `
      <tr>
        <td colspan="${totalLeadColSpan}" style="text-align:center; font-weight:800; font-size:0.85rem; letter-spacing:0.06em; color:#ffffff;">TOTAL</td>
        <td style="text-align:right; font-weight:700; color:#a3a3a3;">${records.length} shops</td>
        <td style="text-align:right; font-weight:800; color:#ffffff;">${totalSqFt.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
        <td style="text-align:right; font-weight:800; font-size:0.9rem; color:#ffffff;">Rs. ${totalAmount.toLocaleString()}</td>
        <td style="color:#ffffff;"></td>
        <td style="text-align:right; font-weight:800; font-size:0.9rem; color:#ffffff;">Rs. ${totalPaid.toLocaleString()}</td>
        <td style="color:#ffffff;"></td>
        <td style="text-align:right; font-weight:800; font-size:0.9rem; color:#ffffff;">Rs. ${totalInHand.toLocaleString()}</td>
        <td class="no-print"></td>
      </tr>
    `;
  }
}

function updateRentsStats() {
  const records = getFilteredRentRecords();
  let totalAmount = 0;
  let totalPaid = 0;
  let totalInHand = 0;

  records.forEach(r => {
    totalAmount += Number(r.amount) || 0;
    totalPaid += Number(r.paid) || 0;
    totalInHand += Number(r.in_hand) || 0;
  });

  const scopeLabel = document.getElementById('rentsStatMonth');
  if (scopeLabel) scopeLabel.textContent = currentRentsMonth === 'ALL' ? 'All Months' : currentRentsMonth;
  const totAmtEl = document.getElementById('rentsStatTotalAmount');
  if (totAmtEl) totAmtEl.textContent = `Rs. ${totalAmount.toLocaleString()}`;
  const totPaidEl = document.getElementById('rentsStatTotalPaid');
  if (totPaidEl) totPaidEl.textContent = `Rs. ${totalPaid.toLocaleString()}`;
  const totInHandEl = document.getElementById('rentsStatTotalInHand');
  if (totInHandEl) totInHandEl.textContent = `Rs. ${totalInHand.toLocaleString()}`;
  const recCntEl = document.getElementById('rentsStatRecordCount');
  if (recCntEl) recCntEl.textContent = records.length;
}

function openRentsEditModal(recordId) {
  const modal = document.getElementById('rentsEditModalBackdrop');
  const title = document.getElementById('rentsEditModalTitle');
  if (!modal) return;

  if (recordId) {
    const record = (rentsDb.records || []).find(r => r.id === recordId);
    if (!record) return;
    title.textContent = `Edit Record (${record.shop_no})`;
    document.getElementById('rentsEditRecordId').value = record.id;
    document.getElementById('rentsEditMonth').value = record.month || 'JAN-2026';
    document.getElementById('rentsEditSNo').value = record.s_no || '';
    document.getElementById('rentsEditBrand').value = record.brand_name || '';
    document.getElementById('rentsEditShop').value = record.shop_no || '';
    document.getElementById('rentsEditAllotee').value = record.allotee_name || '';
    document.getElementById('rentsEditSqFt').value = record.sq_ft !== undefined ? record.sq_ft : 96;
    document.getElementById('rentsEditAmount').value = record.amount !== undefined ? record.amount : 0;
    document.getElementById('rentsEditChqNo').value = record.chq_no || '';
    document.getElementById('rentsEditPaid').value = record.paid !== undefined ? record.paid : 0;
    document.getElementById('rentsEditDate').value = record.date || '';
    document.getElementById('rentsEditInHand').value = record.in_hand !== undefined ? record.in_hand : 0;
  } else {
    title.textContent = 'Add New Rent Record';
    document.getElementById('rentsEditRecordId').value = '';
    document.getElementById('rentsEditMonth').value = currentRentsMonth !== 'ALL' ? currentRentsMonth : 'JAN-2026';
    document.getElementById('rentsEditSNo').value = (rentsDb.records || []).length + 1;
    document.getElementById('rentsEditBrand').value = '';
    document.getElementById('rentsEditShop').value = '';
    document.getElementById('rentsEditAllotee').value = '';
    document.getElementById('rentsEditSqFt').value = 96;
    document.getElementById('rentsEditAmount').value = 0;
    document.getElementById('rentsEditChqNo').value = '-';
    document.getElementById('rentsEditPaid').value = 0;
    document.getElementById('rentsEditDate').value = '';
    document.getElementById('rentsEditInHand').value = 0;
  }

  modal.style.display = 'flex';
}

function closeRentsEditModal() {
  const modal = document.getElementById('rentsEditModalBackdrop');
  if (modal) modal.style.display = 'none';
}

async function handleSaveRentRecord(e) {
  e.preventDefault();
  const id = document.getElementById('rentsEditRecordId').value;
  const month = document.getElementById('rentsEditMonth').value;
  const s_no = document.getElementById('rentsEditSNo').value;
  const brand_name = document.getElementById('rentsEditBrand').value.trim();
  const shop_no = document.getElementById('rentsEditShop').value.trim().toUpperCase();
  const allotee_name = document.getElementById('rentsEditAllotee').value.trim();
  const sq_ft = parseFloat(document.getElementById('rentsEditSqFt').value) || 0;
  const amount = parseInt(document.getElementById('rentsEditAmount').value, 10) || 0;
  const chq_no = document.getElementById('rentsEditChqNo').value.trim();
  const paid = parseInt(document.getElementById('rentsEditPaid').value, 10) || 0;
  const date = document.getElementById('rentsEditDate').value.trim();
  const in_hand = parseInt(document.getElementById('rentsEditInHand').value, 10) || 0;

  if (id) {
    const idx = (rentsDb.records || []).findIndex(r => r.id === id);
    if (idx !== -1) {
      rentsDb.records[idx] = {
        ...rentsDb.records[idx],
        month, s_no, brand_name, shop_no, allotee_name, sq_ft, amount, chq_no, paid, date, in_hand
      };
      showToast(`Record for Shop ${shop_no} updated!`, 'success');
    }
  } else {
    const newRecord = {
      id: `rent_${Date.now()}`,
      month, s_no, brand_name, shop_no, allotee_name, sq_ft, amount, chq_no, paid, date, in_hand
    };
    rentsDb.records.push(newRecord);
    showToast(`New record for Shop ${shop_no} added!`, 'success');
  }

  closeRentsEditModal();
  renderRentsTable();
  updateRentsStats();
  saveRentsToLocalStorage(true);
}

function deleteRentRecord(recordId) {
  const record = (rentsDb.records || []).find(r => r.id === recordId);
  if (!record) return;

  if (confirm(`Are you sure you want to delete the record for Shop ${record.shop_no} (${record.allotee_name}) in ${record.month}?`)) {
    rentsDb.records = rentsDb.records.filter(r => r.id !== recordId);
    renderRentsTable();
    updateRentsStats();
    showToast(`Record for Shop ${record.shop_no} deleted`, 'info');
    saveRentsToLocalStorage(false);
  }
}

function saveRentsToDatabase(notify = true) {
  saveRentsToLocalStorage(notify);
}

function openRentsImportModal() {
  const modal = document.getElementById('rentsImportModalBackdrop');
  if (modal) modal.style.display = 'flex';
  stagedImportRecords = [];
  document.getElementById('rentsImportPreviewArea').style.display = 'none';
  document.getElementById('rentsConfirmImportModalBtn').disabled = true;
  document.getElementById('rentsFileInput').value = '';
}

function closeRentsImportModal() {
  const modal = document.getElementById('rentsImportModalBackdrop');
  if (modal) modal.style.display = 'none';
}

function handleRentFileSelect(file) {
  if (!file) return;
  const fileName = file.name;
  const previewArea = document.getElementById('rentsImportPreviewArea');
  const fileNameEl = document.getElementById('rentsImportFileName');
  const countEl = document.getElementById('rentsImportRowCount');
  const confirmBtn = document.getElementById('rentsConfirmImportModalBtn');

  fileNameEl.textContent = fileName;
  countEl.textContent = 'Parsing...';
  previewArea.style.display = 'block';

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      if (typeof XLSX === 'undefined') {
        throw new Error('XLSX parser library not loaded. Please ensure assets/xlsx.full.min.js is present.');
      }
      const workbook = XLSX.read(data, { type: 'array' });
      const records = [];

      const normalizeRentMonth = (str) => {
        if (!str) return '';
        const s = String(str).toUpperCase().trim();
        if (s.includes('JAN')) return 'JAN-2026';
        if (s.includes('FEB')) return 'FEB-2026';
        if (s.includes('MARCH') || s.includes('MAR')) return 'MARCH-2026';
        if (s.includes('APRIL') || s.includes('APR')) return 'APRIL-2026';
        if (s.includes('MAY')) return 'MAY-2026';
        if (s.includes('JUNE') || s.includes('JUN')) return 'JUNE-2026';
        if (s.includes('JULY') || s.includes('JUL')) return 'JULY-2026';
        if (s.includes('AUG')) return 'AUG-2026';
        return '';
      };

      const isRentBanner = (shop, allotee) => {
        const s = String(shop || '').toUpperCase().trim();
        const a = String(allotee || '').toUpperCase().trim();
        if (s === 'DESCRCIPTION' || a === 'DESCRCIPTION') return true;
        if (s.includes('PREPAID') || a.includes('PREPAID')) return true;
        if (s.includes('CHECKED') || a.includes('CHECKED')) return true;
        if (s.includes('VERIFIED') || a.includes('VERIFIED')) return true;
        if (s.includes('APPROVED') || a.includes('APPROVED')) return true;
        if (s.includes('POSSESION') || a.includes('POSSESION')) return true;
        if (s.includes('RENT CHEQUES') || a.includes('RENT CHEQUES')) return true;
        if (s.includes('RENT START') || a.includes('RENT START')) return true;
        if (s.includes('RENT WILL BE') || a.includes('RENT WILL BE')) return true;
        if (s.includes('SUMMARY') || a.includes('SUMMARY')) return true;
        if (s.includes('FROM DEC-2025') || a.includes('FROM DEC-2025')) return true;
        if (s === a && s.length > 20) return true;
        if (s === '?' || a === '?') return true;
        return false;
      };

      const cleanStr = str => String(str || '').replace(/[\r\n\t]+/g, ' ').trim();

      workbook.SheetNames.forEach(sheetName => {
        const ws = workbook.Sheets[sheetName];
        if (!ws) return;
        const jsonRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!jsonRows || jsonRows.length === 0) return;

        let defaultSheetMonth = normalizeRentMonth(sheetName);
        let currentMonth = defaultSheetMonth || 'JAN-2026';
        let headers = [];
        let headerRowIdx = -1;
        let snoIdx = -1, brandIdx = -1, shopIdx = -1, alloteeIdx = -1, sqftIdx = -1;
        let amountIdx = -1, chqIdx = -1, paidIdx = -1, dateIdx = -1, inHandIdx = -1;
        let currentBrand = '';

        for (let r = 0; r < jsonRows.length; r++) {
          const row = jsonRows[r];
          const rowStr = row.join(' ').toUpperCase();

          // Check for embedded month header row like 'RENT MONTH OF MARCH-2026'
          if (rowStr.includes('RENT MONTH OF')) {
            const foundM = normalizeRentMonth(rowStr);
            if (foundM) currentMonth = foundM;
          }

          const isHeader = row.some(c => {
            const s = String(c).toUpperCase();
            return s.includes('SHOP NOS') || s.includes('SHOP NO') || s.includes('ALLOTEE') || s.includes('BRAND NAME');
          });

          if (isHeader) {
            headers = row.map(c => String(c).toUpperCase().replace(/[\r\n]+/g, ' ').trim());
            headerRowIdx = r;
            snoIdx = headers.findIndex(h => h.includes('S.NO') || h.includes('S.NOS'));
            brandIdx = headers.findIndex(h => h.includes('BRAND'));
            shopIdx = headers.findIndex(h => h.includes('SHOP'));
            alloteeIdx = headers.findIndex(h => h.includes('ALLOTEE'));
            sqftIdx = headers.findIndex(h => h.includes('SQ.FT') || h.includes('SQFT'));
            amountIdx = headers.findIndex(h => h === 'AMOUNT' || h.includes('AMOUNT (RS)') || h.includes('RENT AMOUNT'));
            chqIdx = headers.findIndex(h => h.includes('CHQ') || h.includes('CHEQUE'));
            paidIdx = headers.findIndex(h => h.includes('PAID'));
            dateIdx = headers.findIndex(h => h.includes('DATE'));
            inHandIdx = headers.findIndex(h => h.includes('HAND') || h.includes('BALANCE'));

            // Check if row r+1 contains subheaders
            if (r + 1 < jsonRows.length) {
              const nextRow = jsonRows[r + 1].map(c => String(c).toUpperCase().trim());
              if (nextRow.some(c => c === 'AMOUNT' || c === 'CHQ NO.' || c === 'PAID')) {
                if (amountIdx === -1) amountIdx = nextRow.findIndex(c => c === 'AMOUNT');
                if (chqIdx === -1) chqIdx = nextRow.findIndex(c => c.includes('CHQ'));
                if (paidIdx === -1) paidIdx = nextRow.findIndex(c => c === 'PAID');
                if (dateIdx === -1) dateIdx = nextRow.findIndex(c => c.includes('DATE'));
                if (inHandIdx === -1) inHandIdx = nextRow.findIndex(c => c.includes('HAND'));
                r++;
              }
            }
            continue;
          }

          if (shopIdx !== -1) {
            let rawShop = shopIdx !== -1 ? cleanStr(row[shopIdx]) : '';
            const rawAllotee = alloteeIdx !== -1 ? cleanStr(row[alloteeIdx]) : '';
            const rawBrand = brandIdx !== -1 ? cleanStr(row[brandIdx]) : '';

            // Skip total or empty rows
            if (rowStr.includes('TOTAL') || (!rawShop && !rawAllotee)) continue;

            // Skip banner / signature / note rows
            if (isRentBanner(rawShop, rawAllotee)) continue;
            if (rawShop === '?' || rawShop.length < 2) continue;

            if (rawShop && !rawShop.toUpperCase().includes('SHOP NOS')) {
              if (rawBrand) currentBrand = rawBrand;

              const rec = {
                id: 'rent_' + currentMonth.replace(/[^A-Z0-9]/g, '') + '_' + rawShop.replace(/[^A-Z0-9]/g, ''),
                month: currentMonth,
                s_no: '',
                brand_name: rawBrand || currentBrand,
                shop_no: rawShop,
                allotee_name: rawAllotee,
                sq_ft: sqftIdx !== -1 ? parseFloat(String(row[sqftIdx]).replace(/,/g, '')) || 0 : 0,
                amount: amountIdx !== -1 ? parseInt(String(row[amountIdx]).replace(/,/g, ''), 10) || 0 : 0,
                chq_no: chqIdx !== -1 ? cleanStr(row[chqIdx] || '-') : '-',
                paid: paidIdx !== -1 ? parseInt(String(row[paidIdx]).replace(/,/g, ''), 10) || 0 : 0,
                date: dateIdx !== -1 ? cleanStr(row[dateIdx] || '') : '',
                in_hand: inHandIdx !== -1 ? parseInt(String(row[inHandIdx]).replace(/,/g, ''), 10) || 0 : 0
              };

              if (!rec.in_hand && rec.amount && !rec.paid) {
                rec.in_hand = rec.amount;
              }

              if (rec.shop_no || rec.allotee_name) {
                records.push(rec);
              }
            }
          }
        }
      });

      if (records.length === 0) {
        countEl.textContent = '0 valid rows detected';
        confirmBtn.disabled = true;
        showToast('No recognizable rent tables found in file. Please check column headers.', 'error');
        return;
      }

      stagedImportRecords = records;
      countEl.textContent = `${records.length} records detected across sheets`;
      confirmBtn.disabled = false;
      showToast(`${records.length} records parsed and ready to import`, 'success');
    } catch (err) {
      console.error('Import parse error:', err);
      countEl.textContent = 'Error parsing file';
      confirmBtn.disabled = true;
      showToast('Error parsing file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function handleProcessRentImport() {
  if (!stagedImportRecords || stagedImportRecords.length === 0) return;
  const mode = document.querySelector('input[name="rentsImportMode"]:checked')?.value || 'merge';
  const confirmBtn = document.getElementById('rentsConfirmImportModalBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Importing to Local Storage...';
  }

  try {
    if (!rentsDb) rentsDb = { records: [], months: [] };
    if (!rentsDb.records) rentsDb.records = [];

    let finalRecords = [];
    if (mode === 'replace') {
      finalRecords = stagedImportRecords.map((r, i) => ({ ...r, id: r.id || `rent_imp_${Date.now()}_${i}` }));
    } else {
      const map = new Map();
      (rentsDb.records || []).forEach(r => {
        const key = `${r.month}_${r.shop_no}`.toUpperCase();
        map.set(key, r);
      });
      stagedImportRecords.forEach((r, i) => {
        const key = `${r.month}_${r.shop_no}`.toUpperCase();
        const prev = map.get(key) || {};
        map.set(key, { ...prev, ...r, id: prev.id || r.id || `rent_imp_${Date.now()}_${i}` });
      });
      finalRecords = Array.from(map.values());
    }

    const standardMonths = ['JAN-2026', 'FEB-2026', 'MARCH-2026', 'APRIL-2026', 'MAY-2026', 'JUNE-2026', 'JULY-2026', 'AUG-2026'];
    const recordMonths = Array.from(new Set(finalRecords.map(r => r.month))).filter(Boolean);
    rentsDb.months = Array.from(new Set([...standardMonths, ...recordMonths]));
    rentsDb.records = finalRecords;

    saveRentsToLocalStorage(false);

    showToast(`Successfully imported ${stagedImportRecords.length} records into your private local storage!`, 'success');
    closeRentsImportModal();
    renderRentsMonthTabs();
    renderRentsTable();
    updateRentsStats();
  } catch (err) {
    console.error('Local import error:', err);
    showToast('Import failed: ' + err.message, 'error');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Process & Load into Local Storage';
    }
  }
}

function exportRentsMasterExcel() {
  const records = (rentsDb && Array.isArray(rentsDb.records) && rentsDb.records.length > 0) ? rentsDb.records : [];
  if (records.length === 0) {
    showToast('No rent records available in local storage to export.', 'info');
    return;
  }
  if (typeof XLSX === 'undefined') {
    showToast('Excel library not loaded. Please ensure XLSX is loaded.', 'error');
    return;
  }

  const wb = XLSX.utils.book_new();
  const headers = ['S.NOS.', 'MONTH', 'BRAND NAME', 'SHOP NOS.', 'ALLOTEE', 'SQ.FT.', 'AMOUNT', 'CHQ NO.', 'PAID', 'DATE', 'IN HAND'];

  // Master Sheet with all records
  const masterAoa = [headers];
  records.forEach((r, idx) => {
    masterAoa.push([
      idx + 1,
      r.month || '',
      r.brand_name || '',
      r.shop_no || '',
      r.allotee_name || '',
      Number(r.sq_ft) || 0,
      Number(r.amount) || 0,
      r.chq_no || '-',
      Number(r.paid) || 0,
      r.date || '',
      Number(r.in_hand) || 0
    ]);
  });
  const wsMaster = XLSX.utils.aoa_to_sheet(masterAoa);
  XLSX.utils.book_append_sheet(wb, wsMaster, 'ALL-MONTHS');

  // Month-by-month sheets matching original multi-sheet format
  const months = Array.from(new Set(records.map(r => r.month))).filter(Boolean);
  months.forEach(m => {
    const monthRecords = records.filter(r => r.month === m);
    const monthAoa = [['S.NOS.', 'BRAND NAME', 'SHOP NOS.', 'ALLOTEE', 'SQ.FT.', 'AMOUNT', 'CHQ NO.', 'PAID', 'DATE', 'IN HAND']];
    monthRecords.forEach((r, idx) => {
      monthAoa.push([
        idx + 1,
        r.brand_name || '',
        r.shop_no || '',
        r.allotee_name || '',
        Number(r.sq_ft) || 0,
        Number(r.amount) || 0,
        r.chq_no || '-',
        Number(r.paid) || 0,
        r.date || '',
        Number(r.in_hand) || 0
      ]);
    });
    const wsMonth = XLSX.utils.aoa_to_sheet(monthAoa);
    const safeSheetName = m.substring(0, 31).replace(/[:\\\/\?\*\[\]]/g, '-');
    XLSX.utils.book_append_sheet(wb, wsMonth, safeSheetName);
  });

  const filename = `consolidated_allottees_rent_master_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
  showToast('Master Excel workbook generated directly from private local storage!', 'success');
}

function exportRentsMasterCsv() {
  const records = (rentsDb && Array.isArray(rentsDb.records) && rentsDb.records.length > 0) ? rentsDb.records : [];
  if (records.length === 0) {
    showToast('No rent records available in local storage to export.', 'info');
    return;
  }
  const cleanStr = str => String(str || '').replace(/[\r\n\t]+/g, ' ').trim();
  const quoteField = str => '"' + cleanStr(str).replace(/"/g, '""') + '"';
  let csv = 'S.NOS.,MONTH,BRAND NAME,SHOP NOS.,ALLOTEE,SQ.FT.,AMOUNT,CHQ NO.,PAID,DATE,IN HAND\n';
  records.forEach((r, idx) => {
    csv += `${idx + 1},${r.month},${quoteField(r.brand_name)},${quoteField(r.shop_no)},${quoteField(r.allotee_name)},${r.sq_ft || 0},${r.amount || 0},${quoteField(r.chq_no || '-')},${r.paid || 0},${quoteField(r.date || '')},${r.in_hand || 0}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `consolidated_allottees_rent_master_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Consolidated Master CSV exported successfully', 'success');
}

function setupRentsEventListeners() {
  if (rentsEventsInitialized) return;
  rentsEventsInitialized = true;

  // Password Login Form & Visibility Toggle
  document.getElementById('rentsLoginForm')?.addEventListener('submit', handleRentsLogin);
  document.getElementById('rentsLogoutBtn')?.addEventListener('click', handleRentsLogout);
  document.getElementById('rentsTogglePassBtn')?.addEventListener('click', () => {
    const input = document.getElementById('rentsPasswordInput');
    const icon = document.getElementById('rentsPassEyeIcon');
    if (!input || !icon) return;
    if (input.type === 'password') {
      input.type = 'text';
      icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />`;
    } else {
      input.type = 'password';
      icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />`;
    }
  });

  // Table Theme Switcher (Classic Excel Sheet vs Obsidian Dark)
  document.getElementById('rentsThemeToggleBtn')?.addEventListener('click', toggleRentsTheme);

  // Search filter
  document.getElementById('rentsSearchInput')?.addEventListener('input', (e) => {
    rentsSearchQuery = e.target.value.trim();
    renderRentsTable();
    updateRentsStats();
  });

  // Database save & exports
  document.getElementById('rentsSaveDbBtn')?.addEventListener('click', () => saveRentsToDatabase(true));
  document.getElementById('rentsClearLocalBtn')?.addEventListener('click', clearLocalRentsData);
  document.getElementById('rentsExportExcelBtn')?.addEventListener('click', exportRentsMasterExcel);
  document.getElementById('rentsExportCsvBtn')?.addEventListener('click', exportRentsMasterCsv);
  document.getElementById('rentsQuickExcelLink')?.addEventListener('click', exportRentsMasterExcel);
  document.getElementById('rentsQuickCsvLink')?.addEventListener('click', exportRentsMasterCsv);

  // Add & Edit modal
  document.getElementById('rentsAddNewBtn')?.addEventListener('click', () => openRentsEditModal(null));
  document.getElementById('rentsCloseEditModalBtn')?.addEventListener('click', closeRentsEditModal);
  document.getElementById('rentsCancelEditModalBtn')?.addEventListener('click', closeRentsEditModal);
  document.getElementById('rentsEditRecordForm')?.addEventListener('submit', handleSaveRentRecord);

  // Import modal
  document.getElementById('rentsImportBtn')?.addEventListener('click', openRentsImportModal);
  document.getElementById('rentsCloseImportModalBtn')?.addEventListener('click', closeRentsImportModal);
  document.getElementById('rentsCancelImportModalBtn')?.addEventListener('click', closeRentsImportModal);
  document.getElementById('rentsConfirmImportModalBtn')?.addEventListener('click', handleProcessRentImport);

  const dropzone = document.getElementById('rentsFileDropzone');
  const fileInput = document.getElementById('rentsFileInput');
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = '#ffffff'; });
    dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = 'var(--border-medium)'; });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--border-medium)';
      if (e.dataTransfer.files.length > 0) {
        handleRentFileSelect(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleRentFileSelect(e.target.files[0]);
      }
    });
  }
}

// Make helpers available on window for onclick attributes
window.openRentsEditModal = openRentsEditModal;
window.deleteRentRecord = deleteRentRecord;

// ==========================================================
// Route Isolation & View Initialization (/rent, /rents vs /kernelx vs /reminders vs /)
// ==========================================================
function checkRouteMode() {
  const pathname = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';

  const isConvertRoute = pathname === '/convert' || pathname === '/converter';
  if (isConvertRoute) {
    document.getElementById("loginScreen")?.remove();
    document.querySelector(".app-header")?.style.setProperty("display", "none", "important");
    document.querySelector(".app-container")?.style.setProperty("display", "none", "important");
    const rentsApp = document.getElementById("rentsApp");
    if (rentsApp) rentsApp.style.display = "none";
    const kernelxApp = document.getElementById("kernelxApp");
    if (kernelxApp) kernelxApp.style.display = "none";
    const remindersApp = document.getElementById("remindersApp");
    if (remindersApp) remindersApp.style.display = "none";

    const converterApp = document.getElementById("converterApp");
    if (converterApp) converterApp.style.display = "flex";
    document.body.classList.add("route-convert");
    document.documentElement.classList.add("route-convert");
    document.title = "Billing Excel Rearranger & Converter - The Mega Mall";
    if (typeof initConverterApp === 'function') {
      initConverterApp();
    }
    return true;
  }

  const isRemindersRoute = pathname === '/reminders' || pathname === '/reminder';
  if (isRemindersRoute) {
    document.getElementById("loginScreen")?.remove();
    document.querySelector(".app-header")?.style.setProperty("display", "none", "important");
    document.querySelector(".app-container")?.style.setProperty("display", "none", "important");
    const rentsApp = document.getElementById("rentsApp");
    if (rentsApp) rentsApp.style.display = "none";
    const kernelxApp = document.getElementById("kernelxApp");
    if (kernelxApp) kernelxApp.style.display = "none";

    const remindersApp = document.getElementById("remindersApp");
    if (remindersApp) remindersApp.style.display = "flex";
    document.body.classList.add("route-reminders");
    document.documentElement.classList.add("route-reminders");
    document.title = "Payment Reminders - The Mega Mall";
    if (typeof initRemindersApp === 'function') {
      initRemindersApp();
    }
    return true;
  }

  const isRentsRoute = pathname === '/rent' || pathname === '/rents';
  if (isRentsRoute) {
    document.getElementById("loginScreen")?.remove();
    document.querySelector(".app-header")?.style.setProperty("display", "none", "important");
    document.querySelector(".app-container")?.style.setProperty("display", "none", "important");
    const kernelxApp = document.getElementById("kernelxApp");
    if (kernelxApp) kernelxApp.style.display = "none";
    const remindersApp = document.getElementById("remindersApp");
    if (remindersApp) remindersApp.style.display = "none";
    const rentsApp = document.getElementById("rentsApp");
    if (rentsApp) rentsApp.style.display = "block";
    document.title = "Allottees Rent Master Register - The Mega Mall";
    initRentsApp();
    return true;
  }

  const isKernelxRoute = pathname === '/kernelx';
  if (isKernelxRoute) {
    // Dedicated KernelX Master Mode
    document.getElementById("loginScreen")?.remove();
    document.querySelector(".app-header")?.style.setProperty("display", "none", "important");
    document.querySelector(".app-container")?.style.setProperty("display", "none", "important");
    const rentsApp = document.getElementById("rentsApp");
    if (rentsApp) rentsApp.style.display = "none";
    const remindersApp = document.getElementById("remindersApp");
    if (remindersApp) remindersApp.style.display = "none";

    const kernelxApp = document.getElementById("kernelxApp");
    if (kernelxApp) kernelxApp.style.display = "block";
    document.title = "KernelX - User Directory & Access Control";
    initKernelx();
    return true;
  }

  // Standard Root Invoice Mode - Guarantee rents and reminders portals are completely hidden
  const rentsApp = document.getElementById("rentsApp");
  if (rentsApp) rentsApp.style.display = "none";
  const kernelxApp = document.getElementById("kernelxApp");
  if (kernelxApp) kernelxApp.style.display = "none";
  const remindersApp = document.getElementById("remindersApp");
  if (remindersApp) remindersApp.style.display = "none";
  const converterApp = document.getElementById("converterApp");
  if (converterApp) converterApp.style.display = "none";

  switchTab("preview");
  return false;
}

// Setup Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  // Isolate execution: on /rents or /kernelx, initialize dedicated app and do not run water invoice code
  if (checkRouteMode()) {
    return;
  }

  document.getElementById("occupierInput").addEventListener("input", (e) => {
    appState.occupier = e.target.value;
    renderPreview();
    debouncedSaveProjectState();
  });
  document.getElementById("locationInput").addEventListener("input", (e) => {
    appState.location = e.target.value;
    renderPreview();
    debouncedSaveProjectState();
  });
  document.getElementById("ntnInput").addEventListener("input", (e) => {
    appState.ntn = e.target.value;
    renderPreview();
    debouncedSaveProjectState();
  });

  document.getElementById("startMonthInput").addEventListener("change", (e) => {
    updateBillingDate("start", e.target.value);
  });
  document.getElementById("endMonthInput").addEventListener("change", (e) => {
    updateBillingDate("end", e.target.value);
  });

  const handleSeqModeChange = (newMode) => {
    appState.seqMode = newMode;
    if (newMode === "month_year") {
      if (!appState.invPrefix || appState.invPrefix === "#INV-" || appState.invPrefix === "#INV") {
        appState.invPrefix = "#INV-01-";
      }
    }
    syncInputsWithState();
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
    showToast(newMode === "month_year" ? "Switched to Monthly sequence (#INV-01-MM-YYYY)" : "Switched to Sequential numbering", "info");
  };

  document.getElementById("seqModeSelect")?.addEventListener("change", (e) => {
    handleSeqModeChange(e.target.value);
  });
  document.getElementById("editorSeqMode")?.addEventListener("change", (e) => {
    handleSeqModeChange(e.target.value);
  });

  const handlePrefixInput = (val) => {
    appState.invPrefix = val;
    const sbInput = document.getElementById("invPrefixInput");
    const edInput = document.getElementById("editorSeqPrefix");
    if (sbInput && sbInput.value !== val) sbInput.value = val;
    if (edInput && edInput.value !== val) edInput.value = val;

    const previewText = document.getElementById("monthlySeqPreviewText");
    if (previewText) {
      let p = (val || "#INV-01-").trim();
      if (/#INV-\d+-\d{2}-\d{4}/i.test(p)) {
        const pm = p.match(/^([#A-Za-z0-9]+-\d+-)/);
        if (pm) p = pm[1];
      }
      if (p === "#INV-" || p === "#INV" || p === "INV-" || p === "INV") p = "#INV-01-";
      if (!p.endsWith("-")) p += "-";
      previewText.textContent = `${p}01-2024`;
    }
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
  };

  document.getElementById("invPrefixInput")?.addEventListener("input", (e) => {
    handlePrefixInput(e.target.value);
  });
  document.getElementById("editorSeqPrefix")?.addEventListener("input", (e) => {
    handlePrefixInput(e.target.value);
  });

  document.getElementById("invStartNumInput")?.addEventListener("input", (e) => {
    appState.invStartNum = parseInt(e.target.value, 10) || 1;
    const edInput = document.getElementById("editorSeqStartNum");
    if (edInput) edInput.value = e.target.value;
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
  });
  document.getElementById("editorSeqStartNum")?.addEventListener("input", (e) => {
    appState.invStartNum = parseInt(e.target.value, 10) || 1;
    const sbInput = document.getElementById("invStartNumInput");
    if (sbInput) sbInput.value = e.target.value;
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
  });

  document.getElementById("invSuffixInput")?.addEventListener("input", (e) => {
    appState.invSuffix = e.target.value;
    const edInput = document.getElementById("editorSeqSuffix");
    if (edInput) edInput.value = e.target.value;
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
  });
  document.getElementById("editorSeqSuffix")?.addEventListener("input", (e) => {
    appState.invSuffix = e.target.value;
    const sbInput = document.getElementById("invSuffixInput");
    if (sbInput) sbInput.value = e.target.value;
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
  });

  document.getElementById("autoSuffixYearToggle")?.addEventListener("change", (e) => {
    appState.autoSuffixYear = e.target.checked;
    const edToggle = document.getElementById("editorSeqAutoYear");
    if (edToggle) edToggle.checked = e.target.checked;
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
    if (e.target.checked) {
      showToast("Year-based suffix changer activated (e.g. -051026 -> -051027)", "info");
    } else {
      showToast("Static suffix sequence restored", "info");
    }
  });

  document.getElementById("editorSeqAutoYear")?.addEventListener("change", (e) => {
    appState.autoSuffixYear = e.target.checked;
    const sbToggle = document.getElementById("autoSuffixYearToggle");
    if (sbToggle) sbToggle.checked = e.target.checked;
    renderPreview();
    renderDataEditor();
  });
  document.getElementById("editorManualBillGlobalToggle")?.addEventListener("change", (e) => {
    toggleGlobalManualBill(e.target.checked);
  });
  document.getElementById("editorApplySeqBtn")?.addEventListener("click", applyEditorSequence);

  // Custom Table Boxes (Columns) Modal Actions
  document.getElementById("openColumnsModalBtn")?.addEventListener("click", openColumnsModal);
  document.getElementById("closeColumnsModalBtn")?.addEventListener("click", closeColumnsModal);
  document.getElementById("doneColumnsModalBtn")?.addEventListener("click", closeColumnsModal);
  document.getElementById("addNewColumnBtn")?.addEventListener("click", addNewCustomColumn);
  document.getElementById("resetColumnsBtn")?.addEventListener("click", resetDefaultColumns);

  // Manual DB Save Button
  document.getElementById("manualSaveDbBtn")?.addEventListener("click", () => saveProjectStateToDatabase(true));

  const prevToggle = document.getElementById("prevBalanceToggle");
  prevToggle.addEventListener("change", (e) => {
    appState.includePrevBalance = e.target.checked;
    const prevOptions = document.getElementById("prevBalanceOptions");
    if (prevOptions) prevOptions.style.display = e.target.checked ? "flex" : "none";
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
  });

  document.getElementById("openingBalanceInput").addEventListener("input", (e) => {
    appState.openingBalance = parseFloat(e.target.value) || 0;
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
  });

  document.getElementById("prevBalanceModeSelect").addEventListener("change", (e) => {
    appState.prevBalanceMode = e.target.value;
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
  });

  document.getElementById("tabInvoicePreview").addEventListener("click", () => switchTab("preview"));
  document.getElementById("tabDataEditor").addEventListener("click", () => switchTab("editor"));

  document.getElementById("prevPageBtn").addEventListener("click", prevPage);
  document.getElementById("nextPageBtn").addEventListener("click", nextPage);
  document.getElementById("jumpMonthSelect").addEventListener("change", (e) => jumpToPage(e.target.value));

  document.getElementById("viewSingleBtn").addEventListener("click", () => toggleViewAll(false));
  document.getElementById("viewAllBtn").addEventListener("click", () => toggleViewAll(true));

  document.getElementById("exportDocxBtn").addEventListener("click", exportToWord);
  document.getElementById("exportPdfBtn").addEventListener("click", exportToPdf);
  document.getElementById("printBtn").addEventListener("click", triggerPrint);

  document.getElementById("openImportModalBtn").addEventListener("click", openImportModal);
  document.getElementById("closeImportModalBtn").addEventListener("click", closeImportModal);
  document.getElementById("cancelImportBtn").addEventListener("click", closeImportModal);
  document.getElementById("confirmImportBtn").addEventListener("click", processImport);
  document.getElementById("exportCsvBtn").addEventListener("click", exportToCsv);
  document.getElementById("resetEditorBtn").addEventListener("click", resetManualCorrections);

  // Authentication form & logout handlers
  document.getElementById("loginForm")?.addEventListener("submit", handleLoginSubmit);
  document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);
  document.getElementById("togglePasswordBtn")?.addEventListener("click", () => {
    const input = document.getElementById("loginPassword");
    const icon = document.getElementById("eyeIcon");
    if (!input || !icon) return;
    if (input.type === "password") {
      input.type = "text";
      icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />`;
    } else {
      input.type = "password";
      icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />`;
    }
  });

  // File drag & drop handling with stopPropagation to prevent double-click lock
  const dropzone = document.getElementById("fileDropzone");
  const fileInput = document.getElementById("fileInput");

  dropzone?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("click", (e) => e.stopPropagation());
  fileInput?.addEventListener("change", (e) => {
    if (e.target.files.length > 0) handleFileSelection(e.target.files[0]);
  });

  dropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });

  // Confirm modal event handlers
  document.getElementById("confirmModalOkBtn")?.addEventListener("click", () => {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
  });
  document.getElementById("confirmModalCancelBtn")?.addEventListener("click", closeConfirmModal);
  document.getElementById("confirmModalCloseBtn")?.addEventListener("click", closeConfirmModal);

  document.getElementById("togglePreviewBtn")?.addEventListener("click", togglePreview);
  initSplitPaneResizer();

  initCalendarPopovers();
  syncInputsWithState();
  updateYearConfigsUI();
  renderPreview();
  renderDataEditor();

  const savedActiveTab = localStorage.getItem('mega_mall_active_tab') || appState.activeTab;
  if (savedActiveTab) {
    switchTab(savedActiveTab);
  }

  // Register beforeunload handler to immediately persist state to localStorage on refresh/exit
  window.addEventListener("beforeunload", () => {
    try {
      localStorage.setItem('mega_mall_project_state', JSON.stringify(appState));
    } catch (e) {}
  });

  // Offline Support Status Indicator Manager
  function updateOfflineSupportUI() {
    const badge = document.getElementById("offlineSupportBadge");
    const textEl = document.getElementById("offlineSupportText");
    if (!badge) return;

    if (navigator.onLine) {
      badge.classList.remove("offline-now");
      if (textEl) textEl.textContent = "Offline Ready";
      badge.title = "Offline Support Active: All app assets, formulas, and local data are saved to your device. You can use the site without internet.";
    } else {
      badge.classList.add("offline-now");
      if (textEl) textEl.textContent = "Offline Mode Active";
      badge.title = "Currently Offline: Full calculation engine, editing, and exports remain 100% functional locally.";
    }
  }

  updateOfflineSupportUI();

  document.getElementById("offlineSupportBadge")?.addEventListener("click", () => {
    if (navigator.onLine) {
      showToast("Offline Support Active: All formulas and app assets are cached. You can disconnect internet anytime and continue working.", "info");
    } else {
      showToast("Offline Mode Active: Calculations and exports running locally in your browser. Changes are saved to your device.", "info");
    }
  });

  // Offline / Online network event listeners
  window.addEventListener('online', () => {
    updateOfflineSupportUI();
    showToast("Internet connection restored. Back online.", "success");
    saveProjectStateToDatabase(false);
  });
  window.addEventListener('offline', () => {
    updateOfflineSupportUI();
    showToast("Offline Mode Active — calculations, preview, and exports work 100% locally.", "info");
  });

  // Initialize Session Authentication for standard application
  checkAuthSession().then(async (isAuth) => {
    if (isAuth) {
      await loadProjectStateFromDatabase();
    }
  });
});

// ==========================================================
// Payment Reminders Module (/reminders & /reminder)
// Minimal Matte Black/Slate UI + Master Table Editor + Actions Menu + Vector PDF
// ==========================================================
const REMINDERS_TOKEN_KEY = 'mega_mall_reminders_token';
const REMINDERS_DRAFT_KEY = 'mega_mall_reminders_draft_v3';
const REMINDERS_MASTER_LIST_KEY = 'mega_mall_reminders_master_list_v2';

const reminderTemplates = {
  1: {
    subtitle: 'PAYMENT REMINDER – 1',
    introText: 'As per our records, the following amount is outstanding against your shop. You are requested to clear the outstanding amount by the due date.',
    notice1: 'If payment has already been made, please share the payment proof with the Accounts Department.',
    notice2: 'Kindly treat this as a payment reminder and arrange settlement within the above deadline.'
  },
  2: {
    subtitle: 'PAYMENT REMINDER – 2',
    introText: 'This is a second reminder that the above outstanding amount is still unpaid as per our records. You are requested to clear the outstanding amount immediately to avoid further recovery action.',
    notice1: 'If payment has already been made, please share the payment proof with the Accounts Department.',
    notice2: 'Please treat this matter as urgent. Continued non-payment may result in escalation to the relevant Management / Recovery authority.'
  },
  3: {
    subtitle: 'FINAL PAYMENT REMINDER – 3',
    introText: 'This is the final reminder regarding the outstanding amount mentioned above. You are requested to clear the dues by the payment deadline. If the amount remains unpaid, the matter will be referred to Management / Recovery Department for further action.',
    notice1: 'If payment has already been made, please share the payment proof with the Accounts Department.',
    notice2: 'If the dues are not cleared by the final deadline, the case will be forwarded to Management for appropriate further action and recovery proceedings, as applicable according to Procedures.'
  }
};

function getDefaultReminderState(id = 'rem_1') {
  return {
    id,
    activePreset: 3,
    mallName: 'MEGA MALL',
    subtitle: 'FINAL PAYMENT REMINDER – 3',
    subject: 'Subject: Outstanding Payment',
    date: new Date().toISOString().split('T')[0],
    tenantBrand: '',
    shopNo: '',
    salutation: 'Dear Tenant,',
    introText: reminderTemplates[3].introText,
    columns: [
      { id: 'sr', label: 'Sr.', isSr: true, isRemovable: false },
      { id: 'invNo', label: 'Invoice No.', isRemovable: true },
      { id: 'particulars', label: 'Particulars', isRemovable: true },
      { id: 'dueDate', label: 'Due Date', isRemovable: true },
      { id: 'outstanding', label: 'Outstanding (PKR)', isAmount: true, isRemovable: true }
    ],
    rows: [
      { id: 'r_1', sr: 1, invNo: 'INV-001', particulars: 'Rent / CAM / Water / Other Charges', dueDate: '15-Oct-2026', outstanding: '150000' }
    ],
    isManualTotal: false,
    manualTotal: '',
    paymentDeadline: '05-Nov-2026',
    notice1: reminderTemplates[3].notice1,
    notice2: reminderTemplates[3].notice2,
    signOff: 'For Mega Mall',
    zoom: 1
  };
}

let remState = getDefaultReminderState();
let remindersMasterList = [];
let currentRemView = 'designer'; // 'designer' | 'table'

function loadRemindersDraft() {
  try {
    const savedDraft = localStorage.getItem(REMINDERS_DRAFT_KEY);
    if (savedDraft) {
      const parsed = JSON.parse(savedDraft);
      remState = { ...getDefaultReminderState(), ...parsed };
    }
  } catch (e) {
    console.warn('Failed to parse reminders draft from localStorage:', e);
  }

  try {
    const savedList = localStorage.getItem(REMINDERS_MASTER_LIST_KEY);
    if (savedList) {
      remindersMasterList = JSON.parse(savedList);
      if (!Array.isArray(remindersMasterList)) remindersMasterList = [];
    }
  } catch (e) {
    console.warn('Failed to parse reminders master list:', e);
    remindersMasterList = [];
  }

  // Seed with active draft if master list is empty
  if (remindersMasterList.length === 0) {
    saveCurrentDraftToMasterList(false);
  }
}

function saveRemindersDraft(showFeedback = false) {
  try {
    localStorage.setItem(REMINDERS_DRAFT_KEY, JSON.stringify(remState));
    saveCurrentDraftToMasterList(false);
    updateRemindersBadgeCount();
    if (showFeedback) {
      showToast('Draft and table saved to browser storage.', 'success');
    }
  } catch (e) {
    console.error('Failed to save reminders draft:', e);
    if (showFeedback) {
      showToast('Storage quota exceeded or error saving draft.', 'error');
    }
  }
}

function saveCurrentDraftToMasterList(triggerRender = true) {
  if (!remState || !remState.id) return;
  const existingIdx = remindersMasterList.findIndex(r => r.id === remState.id);
  const record = {
    id: remState.id,
    date: remState.date || '',
    brand: remState.tenantBrand || 'Untitled Tenant',
    shop: remState.shopNo || '-',
    preset: remState.activePreset || 3,
    deadline: remState.paymentDeadline || '-',
    particularsSummary: (remState.rows && remState.rows[0]) ? remState.rows[0].particulars || 'Dues' : 'Dues',
    total: getFormattedTotal(),
    state: JSON.parse(JSON.stringify(remState)),
    updatedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    remindersMasterList[existingIdx] = record;
  } else {
    remindersMasterList.unshift(record);
  }

  try {
    localStorage.setItem(REMINDERS_MASTER_LIST_KEY, JSON.stringify(remindersMasterList));
    updateRemindersBadgeCount();
    if (triggerRender) renderRemindersMasterTable();
  } catch (e) {
    console.warn('Failed to save master list:', e);
  }
}

function updateRemindersBadgeCount() {
  const badge = document.getElementById('remTableBadgeCount');
  if (badge) {
    badge.textContent = remindersMasterList.length;
  }
}

function switchRemindersView(view) {
  currentRemView = view;
  const designerView = document.getElementById('remDesignerView');
  const tableView = document.getElementById('remTableView');
  const tabDesignerBtn = document.getElementById('remTabDesignerBtn');
  const tabTableBtn = document.getElementById('remTabTableBtn');

  if (view === 'table') {
    if (designerView) designerView.style.display = 'none';
    if (tableView) tableView.style.display = 'block';
    if (tabDesignerBtn) tabDesignerBtn.classList.remove('active');
    if (tabTableBtn) tabTableBtn.classList.add('active');
    renderRemindersMasterTable();
  } else {
    if (tableView) tableView.style.display = 'none';
    if (designerView) designerView.style.display = 'flex';
    if (tabTableBtn) tabTableBtn.classList.remove('active');
    if (tabDesignerBtn) tabDesignerBtn.classList.add('active');
    renderRemindersPreview();
  }
}

function createNewReminder() {
  const newId = 'rem_' + Date.now();
  remState = getDefaultReminderState(newId);
  saveRemindersDraft(false);
  syncFormFromState();
  renderRemindersColumnsChips();
  renderRemindersEditTable();
  renderRemindersPreview();
  switchRemindersView('designer');
  showToast('Created new blank reminder letter.', 'info');
}

function loadReminderRecordIntoDesigner(recordId) {
  const found = remindersMasterList.find(r => r.id === recordId);
  if (!found || !found.state) {
    showToast('Could not load reminder record.', 'error');
    return;
  }
  remState = { ...getDefaultReminderState(recordId), ...found.state };
  localStorage.setItem(REMINDERS_DRAFT_KEY, JSON.stringify(remState));

  syncFormFromState();
  renderRemindersColumnsChips();
  renderRemindersEditTable();
  renderRemindersPreview();
  switchRemindersView('designer');
  showToast('Loaded ' + (remState.tenantBrand || 'Tenant') + ' into Designer.', 'info');
}

function deleteReminderRecord(recordId) {
  if (confirm('Are you sure you want to delete this reminder from the table?')) {
    remindersMasterList = remindersMasterList.filter(r => r.id !== recordId);
    localStorage.setItem(REMINDERS_MASTER_LIST_KEY, JSON.stringify(remindersMasterList));
    updateRemindersBadgeCount();
    renderRemindersMasterTable();
    showToast('Reminder deleted from table.', 'info');
  }
}

function onMasterTableFieldChange(recordId, field, value) {
  const record = remindersMasterList.find(r => r.id === recordId);
  if (!record) return;

  if (field === 'preset') {
    const p = parseInt(value, 10);
    record.preset = p;
    if (record.state) {
      record.state.activePreset = p;
      if (reminderTemplates[p]) {
        record.state.subtitle = reminderTemplates[p].subtitle;
        record.state.introText = reminderTemplates[p].introText;
        record.state.notice1 = reminderTemplates[p].notice1;
        record.state.notice2 = reminderTemplates[p].notice2;
      }
    }
  } else if (field === 'brand') {
    record.brand = value;
    if (record.state) record.state.tenantBrand = value;
  } else if (field === 'shop') {
    record.shop = value;
    if (record.state) record.state.shopNo = value;
  } else if (field === 'date') {
    record.date = value;
    if (record.state) record.state.date = value;
  } else if (field === 'deadline') {
    record.deadline = value;
    if (record.state) record.state.paymentDeadline = value;
  } else if (field === 'particularsSummary') {
    record.particularsSummary = value;
    if (record.state && record.state.rows && record.state.rows[0]) {
      record.state.rows[0].particulars = value;
    }
  } else if (field === 'total') {
    record.total = value;
    if (record.state) {
      record.state.isManualTotal = true;
      record.state.manualTotal = value;
    }
  }

  // Persist to localStorage
  localStorage.setItem(REMINDERS_MASTER_LIST_KEY, JSON.stringify(remindersMasterList));

  // If currently active in designer, sync
  if (remState && remState.id === recordId) {
    remState = { ...remState, ...(record.state || {}) };
    localStorage.setItem(REMINDERS_DRAFT_KEY, JSON.stringify(remState));
    syncFormFromState();
    renderRemindersPreview();
  }
}

function renderRemindersMasterTable() {
  const tbody = document.getElementById('remMasterTableBody');
  if (!tbody) return;

  const searchVal = (document.getElementById('remTableSearchInput')?.value || '').toLowerCase().trim();
  const filterVal = document.getElementById('remTableFilterSelect')?.value || 'all';

  let filtered = remindersMasterList.slice();

  if (filterVal !== 'all') {
    const presetNum = parseInt(filterVal, 10);
    filtered = filtered.filter(r => r.preset === presetNum);
  }

  if (searchVal) {
    filtered = filtered.filter(r => {
      const brand = (r.brand || '').toLowerCase();
      const shop = (r.shop || '').toLowerCase();
      const summary = (r.particularsSummary || '').toLowerCase();
      return brand.includes(searchVal) || shop.includes(searchVal) || summary.includes(searchVal);
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding:2.5rem 1rem; color:var(--text-muted); font-size:0.84rem;">
          No matching reminders found.<br>
          <button type="button" class="btn btn-secondary btn-sm" id="remEmptyAddBtn" style="margin-top:0.75rem; border-color:#10b981; color:#10b981;">
            + Add New Reminder
          </button>
        </td>
      </tr>
    `;
    document.getElementById('remEmptyAddBtn')?.addEventListener('click', createNewReminder);
    return;
  }

  let html = '';
  filtered.forEach((r, idx) => {
    html += `
      <tr data-record-id="${r.id}">
        <td style="text-align:center; font-weight:600; color:var(--text-dim); width:40px;">${idx + 1}</td>
        <td style="width:115px;">
          <input type="date" class="rem-te-input rem-te-date" data-id="${r.id}" data-field="date" value="${r.date || ''}" title="Notice Date" />
        </td>
        <td style="min-width:140px;">
          <input type="text" class="rem-te-input rem-te-brand" data-id="${r.id}" data-field="brand" value="${escapeHtml(r.brand || '')}" placeholder="Tenant / Brand" style="font-weight:600;" />
        </td>
        <td style="width:85px;">
          <input type="text" class="rem-te-input rem-te-shop" data-id="${r.id}" data-field="shop" value="${escapeHtml(r.shop || '')}" placeholder="Shop #" style="text-align:center;" />
        </td>
        <td style="width:125px;">
          <select class="rem-te-select rem-te-preset" data-id="${r.id}" data-field="preset" style="font-weight:600; color:${r.preset === 3 ? '#f87171' : (r.preset === 2 ? '#fbbf24' : '#fde047')};">
            <option value="3" ${r.preset === 3 ? 'selected' : ''} style="color:#f87171;">Final 3</option>
            <option value="2" ${r.preset === 2 ? 'selected' : ''} style="color:#fbbf24;">Reminder 2</option>
            <option value="1" ${r.preset === 1 ? 'selected' : ''} style="color:#fde047;">Reminder 1</option>
          </select>
        </td>
        <td style="min-width:160px;">
          <input type="text" class="rem-te-input rem-te-particulars" data-id="${r.id}" data-field="particularsSummary" value="${escapeHtml(r.particularsSummary || '')}" placeholder="Particulars summary" />
        </td>
        <td style="width:110px;">
          <input type="text" class="rem-te-input rem-te-deadline" data-id="${r.id}" data-field="deadline" value="${escapeHtml(r.deadline || '')}" placeholder="Deadline" style="text-align:center; color:#fbbf24; font-weight:600;" />
        </td>
        <td style="width:115px;">
          <input type="text" class="rem-te-input rem-te-total" data-id="${r.id}" data-field="total" value="${escapeHtml(r.total || '0')}" placeholder="0" style="text-align:right; font-weight:700; color:#10b981;" />
        </td>
        <td style="text-align:center; white-space:nowrap; width:130px;">
          <div style="display:inline-flex; gap:0.25rem;">
            <button type="button" class="btn btn-secondary btn-xs rem-table-edit-btn" data-id="${r.id}" title="Open in Letter Designer" style="padding:3px 7px;">📄 Letter</button>
            <button type="button" class="btn btn-secondary btn-xs rem-table-pdf-btn" data-id="${r.id}" title="Export PDF" style="padding:3px 7px; border-color:#10b981; color:#10b981;">📥 PDF</button>
            <button type="button" class="btn btn-secondary btn-xs rem-table-docx-btn" data-id="${r.id}" title="Export Word .docx" style="padding:3px 7px;">Word</button>
            <button type="button" class="btn btn-danger btn-xs rem-table-del-btn" data-id="${r.id}" title="Delete" style="padding:3px 6px;">&times;</button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Bind change events for inline table inputs
  tbody.querySelectorAll('.rem-te-input, .rem-te-select').forEach(input => {
    input.addEventListener('change', (e) => {
      const recordId = e.target.getAttribute('data-id');
      const field = e.target.getAttribute('data-field');
      const val = e.target.value;
      onMasterTableFieldChange(recordId, field, val);
    });
  });

  // Action buttons
  tbody.querySelectorAll('.rem-table-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      loadReminderRecordIntoDesigner(id);
    });
  });

  tbody.querySelectorAll('.rem-table-pdf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      exportReminderToPdf(id);
    });
  });

  tbody.querySelectorAll('.rem-table-docx-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const found = remindersMasterList.find(r => r.id === id);
      if (found && found.state) {
        exportReminderStateToWord(found.state);
      }
    });
  });

  tbody.querySelectorAll('.rem-table-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      deleteReminderRecord(id);
    });
  });
}

function syncFormFromState() {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val != null ? val : '';
  };

  setVal('remMallNameInput', remState.mallName);
  setVal('remSubtitleInput', remState.subtitle);
  setVal('remSubjectInput', remState.subject);
  setVal('remDateInput', remState.date);
  setVal('remTenantBrandInput', remState.tenantBrand);
  setVal('remShopNoInput', remState.shopNo);
  setVal('remSalutationInput', remState.salutation);
  setVal('remIntroTextInput', remState.introText);
  setVal('remPaymentDeadlineInput', remState.paymentDeadline);
  setVal('remNotice1Input', remState.notice1);
  setVal('remNotice2Input', remState.notice2);
  setVal('remSignOffInput', remState.signOff);

  const tplSelect = document.getElementById('remTemplateSelect');
  if (tplSelect) tplSelect.value = String(remState.activePreset || 3);

  const manualTotalBox = document.getElementById('remManualTotalCheckbox');
  const manualContainer = document.getElementById('remManualTotalContainer');
  if (manualTotalBox) {
    manualTotalBox.checked = !!remState.isManualTotal;
  }
  if (manualContainer) {
    manualContainer.style.display = remState.isManualTotal ? 'block' : 'none';
  }
  setVal('remManualTotalInput', remState.manualTotal);
}

function renderRemindersColumnsChips() {
  const container = document.getElementById('remColumnsList');
  if (!container) return;
  container.innerHTML = '';

  (remState.columns || []).forEach((col) => {
    const chip = document.createElement('div');
    chip.className = 'rem-column-chip';
    chip.innerHTML = `
      <span>${escapeHtml(col.label)}</span>
      ${col.isRemovable !== false && remState.columns.length > 1 ? `<button type="button" class="chip-remove-btn" data-col-id="${col.id}" title="Remove Column">&times;</button>` : ''}
    `;
    container.appendChild(chip);
  });

  container.querySelectorAll('.chip-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const colId = btn.getAttribute('data-col-id');
      removeReminderColumn(colId);
    });
  });
}

function removeReminderColumn(colId) {
  if (remState.columns.length <= 1) {
    showToast('Cannot remove column. Minimum 1 column is required!', 'warning');
    return;
  }
  remState.columns = remState.columns.filter(c => c.id !== colId);
  renderRemindersColumnsChips();
  renderRemindersEditTable();
  renderRemindersPreview();
  saveRemindersDraft(false);
}

function openAddColumnModal() {
  const modal = document.getElementById('remAddColModalBackdrop');
  const input = document.getElementById('remNewColNameInput');
  if (input) input.value = '';
  if (modal) modal.style.display = 'flex';
  setTimeout(() => input && input.focus(), 50);
}

function closeAddColumnModal() {
  const modal = document.getElementById('remAddColModalBackdrop');
  if (modal) modal.style.display = 'none';
}

function confirmAddColumn() {
  const input = document.getElementById('remNewColNameInput');
  const name = (input ? input.value : '').trim();
  if (!name) {
    showToast('Please enter a column header name.', 'warning');
    return;
  }

  const newColId = 'col_' + Date.now();
  remState.columns.push({
    id: newColId,
    label: name,
    isRemovable: true
  });

  closeAddColumnModal();
  renderRemindersColumnsChips();
  renderRemindersEditTable();
  renderRemindersPreview();
  saveRemindersDraft(false);
  showToast('Added column "' + name + '".', 'success');
}

function renderRemindersEditTable() {
  const head = document.getElementById('remEditTableHead');
  const body = document.getElementById('remEditTableBody');
  if (!head || !body) return;

  // Header row
  let headHtml = '<tr>';
  (remState.columns || []).forEach(col => {
    headHtml += '<th>' + escapeHtml(col.label) + '</th>';
  });
  headHtml += '<th style="width:40px; text-align:center;">Action</th></tr>';
  head.innerHTML = headHtml;

  // Body rows
  body.innerHTML = '';
  (remState.rows || []).forEach((row, rowIdx) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-row-id', row.id || ('r_' + rowIdx));

    let rowHtml = '';
    (remState.columns || []).forEach(col => {
      if (col.id === 'sr' || col.isSr) {
        rowHtml += '<td style="text-align:center; font-weight:700; width:45px; color:#ffffff;">' + (rowIdx + 1) + '</td>';
      } else if (col.id === 'particulars') {
        rowHtml += `
          <td>
            <input type="text" class="rem-table-input rem-cell-input" data-row-idx="${rowIdx}" data-col-id="${col.id}" value="${escapeHtml(row[col.id] || '')}" placeholder="Rent / CAM / Electricity / etc." />
          </td>
        `;
      } else if (col.id === 'outstanding' || col.isAmount) {
        rowHtml += `
          <td style="width:130px;">
            <input type="text" class="rem-table-input rem-cell-input rem-amount-input" data-row-idx="${rowIdx}" data-col-id="${col.id}" value="${escapeHtml(row[col.id] != null ? String(row[col.id]) : '')}" placeholder="0" style="text-align:right;" />
          </td>
        `;
      } else if (col.id === 'dueDate') {
        rowHtml += `
          <td style="width:110px;">
            <input type="text" class="rem-table-input rem-cell-input" data-row-idx="${rowIdx}" data-col-id="${col.id}" value="${escapeHtml(row[col.id] || '')}" placeholder="DD-Mon-YYYY" style="text-align:center;" />
          </td>
        `;
      } else if (col.id === 'invNo') {
        rowHtml += `
          <td style="width:110px;">
            <input type="text" class="rem-table-input rem-cell-input" data-row-idx="${rowIdx}" data-col-id="${col.id}" value="${escapeHtml(row[col.id] || '')}" placeholder="INV-001" />
          </td>
        `;
      } else {
        rowHtml += `
          <td>
            <input type="text" class="rem-table-input rem-cell-input" data-row-idx="${rowIdx}" data-col-id="${col.id}" value="${escapeHtml(row[col.id] || '')}" />
          </td>
        `;
      }
    });

    const isDeleteDisabled = (remState.rows || []).length <= 1;
    rowHtml += `
      <td style="text-align:center;">
        <button type="button" class="rem-delete-row-btn" data-row-idx="${rowIdx}" title="Delete Row" ${isDeleteDisabled ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>&times;</button>
      </td>
    `;

    tr.innerHTML = rowHtml;
    body.appendChild(tr);
  });

  // Attach input events
  body.querySelectorAll('.rem-cell-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const rIdx = parseInt(e.target.getAttribute('data-row-idx'), 10);
      const cId = e.target.getAttribute('data-col-id');
      if (remState.rows[rIdx]) {
        remState.rows[rIdx][cId] = e.target.value;
        updateCalculatedTotalDisplay();
        renderRemindersPreview();
        saveRemindersDraft(false);
      }
    });
  });

  // Attach row delete buttons
  body.querySelectorAll('.rem-delete-row-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const rIdx = parseInt(btn.getAttribute('data-row-idx'), 10);
      removeReminderRow(rIdx);
    });
  });

  updateCalculatedTotalDisplay();
}

function addReminderRow() {
  const newRow = { id: 'r_' + Date.now() };
  (remState.columns || []).forEach(col => {
    if (col.id === 'sr' || col.isSr) {
      newRow[col.id] = remState.rows.length + 1;
    } else if (col.id === 'particulars') {
      newRow[col.id] = '';
    } else {
      newRow[col.id] = '';
    }
  });

  remState.rows.push(newRow);
  renderRemindersEditTable();
  renderRemindersPreview();
  saveRemindersDraft(false);
}

function removeReminderRow(rIdx) {
  if (remState.rows.length <= 1) {
    showToast('Minimum 1 line item row is required!', 'warning');
    return;
  }
  remState.rows.splice(rIdx, 1);
  renderRemindersEditTable();
  renderRemindersPreview();
  saveRemindersDraft(false);
}

function calculateRawTotal() {
  let sum = 0;
  (remState.rows || []).forEach(row => {
    const rawVal = row.outstanding != null ? String(row.outstanding).replace(/,/g, '').trim() : '0';
    const num = parseFloat(rawVal);
    if (!isNaN(num)) sum += num;
  });
  return sum;
}

function getFormattedTotal() {
  if (remState.isManualTotal && remState.manualTotal != null && remState.manualTotal !== '') {
    return remState.manualTotal;
  }
  const total = calculateRawTotal();
  return total.toLocaleString('en-US');
}

function updateCalculatedTotalDisplay() {
  const el = document.getElementById('remAutoTotalDisplay');
  if (el) {
    const sum = calculateRawTotal();
    el.textContent = 'PKR ' + sum.toLocaleString('en-US');
  }
}

function applyReminderTemplate(presetNum) {
  const num = parseInt(presetNum, 10);
  const tpl = reminderTemplates[num];
  if (!tpl) return;

  remState.activePreset = num;
  remState.subtitle = tpl.subtitle;
  remState.introText = tpl.introText;
  remState.notice1 = tpl.notice1;
  remState.notice2 = tpl.notice2;

  syncFormFromState();
  renderRemindersPreview();
  saveRemindersDraft(false);
  showToast('Applied ' + tpl.subtitle + ' preset.', 'info');
}

function renderRemindersPreview() {
  const viewMall = document.getElementById('viewMallName');
  if (viewMall) viewMall.textContent = remState.mallName || 'MEGA MALL';
  const viewSub = document.getElementById('viewSubtitle');
  if (viewSub) viewSub.textContent = remState.subtitle || 'FINAL PAYMENT REMINDER – 3';

  // No underscores, clean text
  const viewDate = document.getElementById('viewDate');
  if (viewDate) {
    viewDate.textContent = remState.date ? formatDateStandard(remState.date) : '';
  }
  const viewBrand = document.getElementById('viewTenantBrand');
  if (viewBrand) viewBrand.textContent = remState.tenantBrand || '';
  const viewShop = document.getElementById('viewShopNo');
  if (viewShop) viewShop.textContent = remState.shopNo || '';

  const viewSubj = document.getElementById('viewSubject');
  if (viewSubj) viewSubj.textContent = remState.subject || 'Subject: Outstanding Payment';
  const viewSal = document.getElementById('viewSalutation');
  if (viewSal) viewSal.textContent = remState.salutation || 'Dear Tenant,';
  const viewIntro = document.getElementById('viewIntroText');
  if (viewIntro) viewIntro.textContent = remState.introText || '';

  const tableHead = document.getElementById('viewDuesTableHead');
  const tableBody = document.getElementById('viewDuesTableBody');
  const tableFoot = document.getElementById('viewDuesTableFoot');

  if (tableHead && tableBody && tableFoot) {
    let headHtml = '<tr>';
    (remState.columns || []).forEach(col => {
      headHtml += '<th>' + escapeHtml(col.label) + '</th>';
    });
    headHtml += '</tr>';
    tableHead.innerHTML = headHtml;

    let bodyHtml = '';
    (remState.rows || []).forEach((row, rowIdx) => {
      bodyHtml += '<tr>';
      (remState.columns || []).forEach(col => {
        let val = '';
        if (col.id === 'sr' || col.isSr) {
          val = String(rowIdx + 1);
        } else {
          val = row[col.id] != null ? String(row[col.id]) : '';
        }

        const isAmountCol = col.id === 'outstanding' || col.isAmount;
        let cellClass = 'rem-cell-left';
        if (col.id === 'sr' || col.isSr || col.id === 'dueDate') cellClass = 'rem-cell-center';
        else if (isAmountCol) cellClass = 'rem-cell-right';

        let displayVal = val;
        if (isAmountCol && val) {
          const num = parseFloat(String(val).replace(/,/g, ''));
          if (!isNaN(num)) displayVal = num.toLocaleString('en-US');
        }

        bodyHtml += '<td class="' + cellClass + '">' + escapeHtml(displayVal) + '</td>';
      });
      bodyHtml += '</tr>';
    });
    tableBody.innerHTML = bodyHtml;

    const totalCols = remState.columns.length;
    const labelSpan = Math.max(1, totalCols - 1);
    const formattedTotal = getFormattedTotal();

    tableFoot.innerHTML = `
      <tr>
        <td colspan="${labelSpan}" style="text-align:right; font-weight:700;">Total Outstanding PKR</td>
        <td style="text-align:right; font-weight:700;">${escapeHtml(formattedTotal)}</td>
      </tr>
    `;
  }

  // Payment deadline with NO underline
  const viewDl = document.getElementById('viewPaymentDeadline');
  if (viewDl) viewDl.textContent = remState.paymentDeadline || '';

  const viewN1 = document.getElementById('viewNotice1');
  if (viewN1) viewN1.textContent = remState.notice1 || '';

  const viewN2 = document.getElementById('viewNotice2');
  if (viewN2) viewN2.textContent = remState.notice2 || '';

  const viewSign = document.getElementById('viewSignOff');
  if (viewSign) viewSign.textContent = remState.signOff || 'For Mega Mall';
}

function formatDateStandard(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const mIdx = parseInt(parts[1], 10) - 1;
      const day = parts[2];
      if (mIdx >= 0 && mIdx < 12) {
        return day + '-' + monthNames[mIdx] + '-' + year;
      }
    }
    return dateStr;
  } catch (e) {
    return dateStr;
  }
}

// ==========================================================
// Native Vector PDF Generation (jsPDF)
// High Precision, Selectable Text & Razor Sharp
// ==========================================================
async function exportReminderToPdf(recordId = null) {
  let targetState = remState;
  if (recordId) {
    const found = remindersMasterList.find(r => r.id === recordId);
    if (found && found.state) {
      targetState = found.state;
    }
  }

  const JsPdfConstructor = window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
  if (!JsPdfConstructor) {
    showToast('jsPDF library not loaded.', 'error');
    return;
  }

  try {
    showToast('Generating PDF...', 'info');

    const pdf = new JsPdfConstructor({
      unit: 'pt',
      format: 'a4',
      orientation: 'portrait',
      compress: true
    });

    const pageWidth = 595.28;
    const leftMargin = 36;
    const rightMargin = 36;
    const contentWidth = pageWidth - leftMargin - rightMargin;
    let y = 36;

    // 1. Logo
    try {
      const logos = await ensureLogosLoaded();
      if (logos && logos.megaMallLogo) {
        pdf.addImage(logos.megaMallLogo, 'PNG', pageWidth / 2 - 38, y, 76, 48);
        y += 54;
      }
    } catch (e) {
      // fallback
    }

    // 2. Mall Name & Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(0, 0, 0);
    pdf.text(targetState.mallName || 'MEGA MALL', pageWidth / 2, y, { align: 'center' });
    y += 18;

    pdf.setFontSize(12);
    pdf.text(targetState.subtitle || 'FINAL PAYMENT REMINDER – 3', pageWidth / 2, y, { align: 'center' });
    y += 20;

    // 3. Meta Lines (Date, Tenant/Brand, Shop No. - Underlined Lines, NO BOX / NO CELLS)
    const labelW = 115;
    const metaItems = [
      { label: 'Date:', val: targetState.date ? formatDateStandard(targetState.date) : '' },
      { label: 'Tenant / Brand:', val: targetState.tenantBrand || '' },
      { label: 'Shop No.', val: targetState.shopNo || '' }
    ];

    metaItems.forEach((item) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      pdf.setTextColor(0, 0, 0);
      pdf.text(item.label, leftMargin, y + 10);

      // Underline line across the row
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(1.0);
      pdf.line(leftMargin + labelW, y + 12, leftMargin + contentWidth, y + 12);

      if (item.val) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.5);
        pdf.text(String(item.val), leftMargin + labelW + 4, y + 9);
      }
      y += 20;
    });

    y += 6;

    // 4. Subject Line
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.text(targetState.subject || 'Subject: Outstanding Payment', leftMargin, y);
    y += 18;

    // 5. Salutation
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(targetState.salutation || 'Dear Tenant,', leftMargin, y);
    y += 16;

    // 6. Intro statement
    if (targetState.introText) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      const introLines = pdf.splitTextToSize(targetState.introText, contentWidth);
      pdf.text(introLines, leftMargin, y);
      y += introLines.length * 13 + 12;
    }

    // 7. Dues Table
    const cols = (targetState.columns && targetState.columns.length > 0) ? targetState.columns : [
      { id: 'sr', label: 'Sr.' },
      { id: 'invNo', label: 'Invoice No.' },
      { id: 'particulars', label: 'Particulars' },
      { id: 'dueDate', label: 'Due Date' },
      { id: 'outstanding', label: 'Outstanding (PKR)' }
    ];

    const colCount = cols.length;
    let colWidths = [];
    if (cols.some(c => c.id === 'sr') && cols.some(c => c.id === 'invNo') && cols.some(c => c.id === 'particulars') && cols.some(c => c.id === 'outstanding')) {
      colWidths = cols.map(c => {
        if (c.id === 'sr' || c.isSr) return 35;
        if (c.id === 'invNo') return 95;
        if (c.id === 'dueDate') return 80;
        if (c.id === 'outstanding' || c.isAmount) return 110;
        return 0;
      });
      const fixedTotal = colWidths.reduce((a, b) => a + b, 0);
      const flexCount = colWidths.filter(w => w === 0).length || 1;
      const flexWidth = Math.max(120, (contentWidth - fixedTotal) / flexCount);
      colWidths = colWidths.map(w => w === 0 ? flexWidth : w);
    } else {
      const w = contentWidth / colCount;
      colWidths = cols.map(() => w);
    }

    // Table Header
    const thHeight = 20;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(1.2);
    pdf.rect(leftMargin, y, contentWidth, thHeight);

    let currX = leftMargin;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    cols.forEach((col, cIdx) => {
      const cW = colWidths[cIdx];
      if (cIdx > 0) {
        pdf.line(currX, y, currX, y + thHeight);
      }
      const align = (col.id === 'sr' || col.isSr || col.id === 'dueDate') ? 'center' : ((col.id === 'outstanding' || col.isAmount) ? 'right' : 'left');
      const textX = align === 'center' ? (currX + cW / 2) : (align === 'right' ? (currX + cW - 6) : (currX + 6));
      pdf.text(col.label, textX, y + 13.5, { align });
      currX += cW;
    });
    y += thHeight;

    // Table Rows
    const rows = (targetState.rows && targetState.rows.length > 0) ? targetState.rows : [
      { sr: 1, invNo: '', particulars: 'Rent / CAM / Electricity / Water / Other', dueDate: '', outstanding: '' }
    ];

    const rowH = 18;
    pdf.setLineWidth(0.8);
    rows.forEach((row, rIdx) => {
      pdf.rect(leftMargin, y, contentWidth, rowH);
      let rX = leftMargin;
      cols.forEach((col, cIdx) => {
        const cW = colWidths[cIdx];
        if (cIdx > 0) {
          pdf.line(rX, y, rX, y + rowH);
        }

        let val = '';
        if (col.id === 'sr' || col.isSr) {
          val = String(rIdx + 1);
        } else {
          val = row[col.id] != null ? String(row[col.id]) : '';
        }

        const isAmountCol = col.id === 'outstanding' || col.isAmount;
        let displayVal = val;
        if (isAmountCol && val) {
          const num = parseFloat(String(val).replace(/,/g, ''));
          if (!isNaN(num)) displayVal = num.toLocaleString('en-US');
        }

        const align = (col.id === 'sr' || col.isSr || col.id === 'dueDate') ? 'center' : (isAmountCol ? 'right' : 'left');
        const textX = align === 'center' ? (rX + cW / 2) : (align === 'right' ? (rX + cW - 6) : (rX + 6));

        pdf.setFont('helvetica', (col.id === 'sr' || col.isSr) ? 'bold' : 'normal');
        pdf.setFontSize(8.5);
        if (displayVal) {
          pdf.text(String(displayVal), textX, y + 12.5, { align });
        }
        rX += cW;
      });
      y += rowH;
    });

    // Total Row
    pdf.setLineWidth(1.2);
    pdf.rect(leftMargin, y, contentWidth, rowH);
    const lastColW = colWidths[colWidths.length - 1];
    const totalLabelW = contentWidth - lastColW;
    pdf.line(leftMargin + totalLabelW, y, leftMargin + totalLabelW, y + rowH);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('Total Outstanding PKR', leftMargin + totalLabelW - 8, y + 12.5, { align: 'right' });

    let finalTotal = '';
    if (targetState.isManualTotal && targetState.manualTotal != null && targetState.manualTotal !== '') {
      finalTotal = targetState.manualTotal;
    } else {
      let sum = 0;
      rows.forEach(r => {
        const amt = parseFloat(String(r.outstanding || '').replace(/,/g, '')) || 0;
        sum += amt;
      });
      finalTotal = sum.toLocaleString('en-US');
    }
    pdf.text(finalTotal, leftMargin + contentWidth - 6, y + 12.5, { align: 'right' });
    y += rowH + 18;

    // 8. Payment Deadline (Underlined line)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Payment Deadline: ', leftMargin, y);
    const dlWidth = pdf.getTextWidth('Payment Deadline: ') + 4;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.8);
    pdf.line(leftMargin + dlWidth, y + 2, leftMargin + contentWidth, y + 2);
    if (targetState.paymentDeadline) {
      pdf.text(String(targetState.paymentDeadline), leftMargin + dlWidth + 4, y);
    }
    y += 18;

    // 9. Proof Notice
    if (targetState.notice1) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      const n1Lines = pdf.splitTextToSize(targetState.notice1, contentWidth);
      pdf.text(n1Lines, leftMargin, y);
      y += n1Lines.length * 13 + 10;
    }

    // 10. Recovery Notice
    if (targetState.notice2) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      const n2Lines = pdf.splitTextToSize(targetState.notice2, contentWidth);
      pdf.text(n2Lines, leftMargin, y);
      y += n2Lines.length * 13 + 18;
    }

    // 11. Official Sign-off
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.text(targetState.signOff || 'For Mega Mall', leftMargin, y);

    // Save File
    const cleanBrand = (targetState.tenantBrand || 'Tenant').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanShop = (targetState.shopNo || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Mega_Mall_Reminder_${cleanBrand}_${cleanShop || 'Notice'}.pdf`;
    pdf.save(fileName);
    showToast('PDF downloaded: ' + fileName, 'success');
  } catch (err) {
    console.error('PDF export error:', err);
    showToast('Failed to generate PDF: ' + err.message, 'error');
  }
}

// ==========================================================
// Word .docx Generation
// ==========================================================
async function exportReminderToWord() {
  exportReminderStateToWord(remState);
}

async function exportReminderStateToWord(stateToExport) {
  const token = localStorage.getItem(REMINDERS_TOKEN_KEY);
  if (!token) {
    showToast('Please sign in to export Word document.', 'error');
    return;
  }

  const payload = {
    mallName: stateToExport.mallName || 'MEGA MALL',
    reminderSubtitle: stateToExport.subtitle || 'FINAL PAYMENT REMINDER – 3',
    date: stateToExport.date ? formatDateStandard(stateToExport.date) : '',
    tenantBrand: stateToExport.tenantBrand || '',
    shopNo: stateToExport.shopNo || '',
    subject: stateToExport.subject || 'Subject: Outstanding Payment',
    salutation: stateToExport.salutation || 'Dear Tenant,',
    introText: stateToExport.introText || '',
    columns: stateToExport.columns || [],
    rows: stateToExport.rows || [],
    totalOutstanding: (stateToExport.isManualTotal && stateToExport.manualTotal) ? stateToExport.manualTotal : getFormattedTotal(),
    paymentDeadline: stateToExport.paymentDeadline || '',
    notice1: stateToExport.notice1 || '',
    notice2: stateToExport.notice2 || '',
    signOff: stateToExport.signOff || 'For Mega Mall'
  };

  try {
    showToast('Generating Word document...', 'info');
    const res = await fetch('/api/reminders/export-docx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || ('Server returned ' + res.status));
    }

    const blob = await res.blob();
    const cleanBrand = (stateToExport.tenantBrand || 'Tenant').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanShop = (stateToExport.shopNo || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Mega_Mall_Reminder_${cleanBrand}_${cleanShop || 'Notice'}.docx`;

    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);

    showToast('Downloaded ' + fileName, 'success');
  } catch (err) {
    console.error('Word export error:', err);
    showToast('Failed to export Word doc: ' + err.message, 'error');
  }
}

function exportRemindersSession() {
  try {
    const sessionData = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      currentDraft: remState,
      masterList: remindersMasterList
    };
    const jsonStr = JSON.stringify(sessionData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const fileName = 'Mega_Mall_Reminders_Session_' + (new Date().toISOString().split('T')[0]) + '.json';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Exported session data file.', 'success');
  } catch (err) {
    showToast('Failed to export session: ' + err.message, 'error');
  }
}

function importRemindersSession(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.masterList && Array.isArray(parsed.masterList)) {
        remindersMasterList = parsed.masterList;
        localStorage.setItem(REMINDERS_MASTER_LIST_KEY, JSON.stringify(remindersMasterList));
      }
      if (parsed.currentDraft) {
        remState = { ...getDefaultReminderState(), ...parsed.currentDraft };
        localStorage.setItem(REMINDERS_DRAFT_KEY, JSON.stringify(remState));
      }
      syncFormFromState();
      renderRemindersColumnsChips();
      renderRemindersEditTable();
      renderRemindersPreview();
      updateRemindersBadgeCount();
      renderRemindersMasterTable();
      showToast('Session loaded successfully!', 'success');
    } catch (err) {
      showToast('Invalid session JSON file: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function resetReminderDraft() {
  if (confirm('Reset the current form to blank template? Unsaved changes in this letter will be cleared.')) {
    remState = getDefaultReminderState('rem_' + Date.now());
    saveRemindersDraft(false);
    syncFormFromState();
    renderRemindersColumnsChips();
    renderRemindersEditTable();
    renderRemindersPreview();
    showToast('Form reset to default template.', 'info');
  }
}

async function checkRemindersAuthSession() {
  const token = localStorage.getItem(REMINDERS_TOKEN_KEY);
  const gate = document.getElementById('remindersLoginGate');
  const workspace = document.getElementById('remindersWorkspace');

  if (!token) {
    if (gate) gate.style.display = 'flex';
    if (workspace) workspace.style.display = 'none';
    return false;
  }

  try {
    const res = await fetch('/api/reminders/verify', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.valid) {
      if (gate) gate.style.display = 'none';
      if (workspace) workspace.style.display = 'flex';
      syncFormFromState();
      renderRemindersColumnsChips();
      renderRemindersEditTable();
      renderRemindersPreview();
      updateRemindersBadgeCount();
      return true;
    } else {
      localStorage.removeItem(REMINDERS_TOKEN_KEY);
      if (gate) gate.style.display = 'flex';
      if (workspace) workspace.style.display = 'none';
      return false;
    }
  } catch (err) {
    // offline fallback
    if (gate) gate.style.display = 'none';
    if (workspace) workspace.style.display = 'flex';
    syncFormFromState();
    renderRemindersColumnsChips();
    renderRemindersEditTable();
    renderRemindersPreview();
    updateRemindersBadgeCount();
    return true;
  }
}

async function loginRemindersPortal(password) {
  const errorEl = document.getElementById('remindersLoginError');
  const submitBtn = document.getElementById('remindersLoginSubmitBtn');
  if (errorEl) errorEl.style.display = 'none';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';
  }

  try {
    const res = await fetch('/api/reminders/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success && data.token) {
      localStorage.setItem(REMINDERS_TOKEN_KEY, data.token);
      const gate = document.getElementById('remindersLoginGate');
      const workspace = document.getElementById('remindersWorkspace');
      if (gate) gate.style.display = 'none';
      if (workspace) workspace.style.display = 'flex';
      syncFormFromState();
      renderRemindersColumnsChips();
      renderRemindersEditTable();
      renderRemindersPreview();
      updateRemindersBadgeCount();
      showToast('Welcome to Reminders Portal.', 'success');
    } else {
      if (errorEl) {
        errorEl.textContent = data.message || 'Incorrect password. Check REMINDERS_PASSWORD env.';
        errorEl.style.display = 'block';
      }
    }
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = 'Server connection error: ' + err.message;
      errorEl.style.display = 'block';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"></path></svg> Unlock Reminders Portal';
    }
  }
}

function logoutRemindersPortal() {
  localStorage.removeItem(REMINDERS_TOKEN_KEY);
  const gate = document.getElementById('remindersLoginGate');
  const workspace = document.getElementById('remindersWorkspace');
  if (gate) gate.style.display = 'flex';
  if (workspace) workspace.style.display = 'none';
  showToast('Logged out of Reminders Portal.', 'info');
}

function setupRemindersEventListeners() {
  // Login form
  const loginForm = document.getElementById('remindersLoginForm');
  const passInput = document.getElementById('remindersPassInput');
  if (loginForm && passInput) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      loginRemindersPortal(passInput.value.trim());
    });
  }

  // Toggle password visibility
  document.getElementById('remTogglePassVisibility')?.addEventListener('click', () => {
    if (passInput) {
      passInput.type = passInput.type === 'password' ? 'text' : 'password';
    }
  });

  // Logout button
  document.getElementById('remLogoutBtn')?.addEventListener('click', logoutRemindersPortal);

  // View Switchers
  document.getElementById('remTabDesignerBtn')?.addEventListener('click', () => switchRemindersView('designer'));
  document.getElementById('remTabTableBtn')?.addEventListener('click', () => switchRemindersView('table'));
  document.getElementById('remHeaderAddBtn')?.addEventListener('click', createNewReminder);
  document.getElementById('remTableAddBtn')?.addEventListener('click', createNewReminder);

  // Template Preset Dropdown inside Card 1
  document.getElementById('remTemplateSelect')?.addEventListener('change', (e) => {
    applyReminderTemplate(e.target.value);
  });

  // Form Field Live Sync
  const bindField = (id, prop) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      remState[prop] = el.value;
      renderRemindersPreview();
      saveRemindersDraft(false);
    });
  };

  bindField('remMallNameInput', 'mallName');
  bindField('remSubtitleInput', 'subtitle');
  bindField('remSubjectInput', 'subject');
  bindField('remDateInput', 'date');
  bindField('remTenantBrandInput', 'tenantBrand');
  bindField('remShopNoInput', 'shopNo');
  bindField('remSalutationInput', 'salutation');
  bindField('remIntroTextInput', 'introText');
  bindField('remPaymentDeadlineInput', 'paymentDeadline');
  bindField('remNotice1Input', 'notice1');
  bindField('remNotice2Input', 'notice2');
  bindField('remSignOffInput', 'signOff');

  // Manual Total Toggle
  const manualCheckbox = document.getElementById('remManualTotalCheckbox');
  const manualContainer = document.getElementById('remManualTotalContainer');
  const manualInput = document.getElementById('remManualTotalInput');
  if (manualCheckbox) {
    manualCheckbox.addEventListener('change', () => {
      remState.isManualTotal = manualCheckbox.checked;
      if (manualContainer) {
        manualContainer.style.display = remState.isManualTotal ? 'block' : 'none';
      }
      if (remState.isManualTotal && manualInput && !manualInput.value) {
        manualInput.value = calculateRawTotal().toLocaleString('en-US');
        remState.manualTotal = manualInput.value;
      }
      renderRemindersPreview();
      saveRemindersDraft(false);
    });
  }

  if (manualInput) {
    manualInput.addEventListener('input', () => {
      remState.manualTotal = manualInput.value;
      renderRemindersPreview();
      saveRemindersDraft(false);
    });
  }

  // Row and Column Action Buttons
  document.getElementById('remAddRowBtn')?.addEventListener('click', addReminderRow);
  document.getElementById('remAddColumnBtn')?.addEventListener('click', openAddColumnModal);
  document.getElementById('remCancelAddColBtn')?.addEventListener('click', closeAddColumnModal);
  document.getElementById('remCancelAddColBtn2')?.addEventListener('click', closeAddColumnModal);
  document.getElementById('remConfirmAddColBtn')?.addEventListener('click', confirmAddColumn);

  // Actions Dropdown Toggle
  const actionsBtn = document.getElementById('remActionsDropdownBtn');
  const actionsMenu = document.getElementById('remActionsMenu');
  if (actionsBtn && actionsMenu) {
    actionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      actionsMenu.style.display = actionsMenu.style.display === 'none' ? 'block' : 'none';
    });
  }

  document.addEventListener('click', (e) => {
    if (actionsMenu && !e.target.closest('.rem-actions-dropdown-wrap')) {
      actionsMenu.style.display = 'none';
    }
  });

  // Action Menu Items
  document.getElementById('remExportPdfBtn')?.addEventListener('click', () => {
    if (actionsMenu) actionsMenu.style.display = 'none';
    exportReminderToPdf();
  });

  document.getElementById('remPreviewPdfBtn')?.addEventListener('click', () => {
    exportReminderToPdf();
  });

  document.getElementById('remPrintPdfBtn')?.addEventListener('click', () => {
    if (actionsMenu) actionsMenu.style.display = 'none';
    if (currentRemView !== 'designer') switchRemindersView('designer');
    setTimeout(() => window.print(), 150);
  });

  document.getElementById('remExportDocxBtn')?.addEventListener('click', () => {
    if (actionsMenu) actionsMenu.style.display = 'none';
    exportReminderToWord();
  });

  document.getElementById('remSaveDraftBtn')?.addEventListener('click', () => {
    if (actionsMenu) actionsMenu.style.display = 'none';
    saveRemindersDraft(true);
  });

  document.getElementById('remExportSessionBtn')?.addEventListener('click', () => {
    if (actionsMenu) actionsMenu.style.display = 'none';
    exportRemindersSession();
  });

  const importFileInput = document.getElementById('remImportFileInput');
  document.getElementById('remImportSessionBtn')?.addEventListener('click', () => {
    if (actionsMenu) actionsMenu.style.display = 'none';
    if (importFileInput) importFileInput.click();
  });

  if (importFileInput) {
    importFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        importRemindersSession(e.target.files[0]);
        importFileInput.value = '';
      }
    });
  }

  document.getElementById('remResetBtn')?.addEventListener('click', () => {
    if (actionsMenu) actionsMenu.style.display = 'none';
    resetReminderDraft();
  });

  // Search & Filter in Master Table
  document.getElementById('remTableSearchInput')?.addEventListener('input', renderRemindersMasterTable);
  document.getElementById('remTableFilterSelect')?.addEventListener('change', renderRemindersMasterTable);

  // Zoom Controls
  const sheet = document.getElementById('reminderPrintArea');
  const zoomText = document.getElementById('remZoomLevelText');
  const updateZoom = () => {
    if (sheet) {
      sheet.style.transform = 'scale(' + remState.zoom + ')';
      sheet.style.transformOrigin = 'top center';
    }
    if (zoomText) {
      zoomText.textContent = Math.round(remState.zoom * 100) + '%';
    }
  };

  document.getElementById('remZoomInBtn')?.addEventListener('click', () => {
    if (remState.zoom < 1.6) {
      remState.zoom = Math.round((remState.zoom + 0.1) * 10) / 10;
      updateZoom();
    }
  });

  document.getElementById('remZoomOutBtn')?.addEventListener('click', () => {
    if (remState.zoom > 0.5) {
      remState.zoom = Math.round((remState.zoom - 0.1) * 10) / 10;
      updateZoom();
    }
  });

  document.getElementById('remZoomResetBtn')?.addEventListener('click', () => {
    remState.zoom = 1;
    updateZoom();
  });
}

async function initRemindersApp() {
  loadRemindersDraft();
  setupRemindersEventListeners();
  updateRemindersBadgeCount();
  await checkRemindersAuthSession();
}

// Auto-initialize route if DOM already ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  checkRouteMode();
}

// ==========================================================
// Excel Billing Data Converter Module (/convert)
// Multi-sheet matching, mismatch dropdown approval & Image 1 export
// ==========================================================

let convState = {
  activeTab: 'upload', // 'upload' | 'mismatch' | 'preview'
  templateFile: null,
  templateWorkbook: null,
  templateSheetName: '',
  templateRawRows: [],
  templateCols: [],
  
  workingFile: null,
  workingWorkbook: null,
  workingSheetName: '',
  workingRawRows: [],
  workingCols: [],

  // Processed records
  templateRecords: [], // { id, name, cleanName, lastBillDate, startReading, rate, adjustment, tax, remarks }
  workingRecords: [],  // { id, name, cleanName, currentReading, previousReading, amount, originalName }
  
  // Mapping state
  autoMatches: [], // [ { templateId, workingId } ]
  manualMappings: {}, // templateId -> workingId (or 'skip')
  
  // Final combined rows matching Image 1 format
  compiledOutput: []
};

// String normalization helper
function cleanCustomerName(name) {
  if (!name) return '';
  return String(name)
    .replace(/^[*#\s_\-]+/, '')
    .replace(/[*#\s_\-]+$/, '')
    .replace(/\(tabinda\)?/gi, '')
    .replace(/meter\s*\d+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Levenshtein similarity
function calculateStringSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  
  // Check substring containment
  if (longer.includes(shorter) && shorter.length >= 3) {
    return Math.max(0.85, shorter.length / longerLength);
  }

  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) costs[j] = j;
      else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return (longerLength - costs[s2.length]) / longerLength;
}

function switchConverterTab(tab) {
  convState.activeTab = tab;
  
  document.getElementById('convTabUploadBtn')?.classList.toggle('active', tab === 'upload');
  document.getElementById('convTabMismatchBtn')?.classList.toggle('active', tab === 'mismatch');
  document.getElementById('convTabPreviewBtn')?.classList.toggle('active', tab === 'preview');

  const secUpload = document.getElementById('convSectionUpload');
  const secMismatch = document.getElementById('convSectionMismatch');
  const secPreview = document.getElementById('convSectionPreview');

  if (secUpload) secUpload.style.display = tab === 'upload' ? 'block' : 'none';
  if (secMismatch) secMismatch.style.display = tab === 'mismatch' ? 'block' : 'none';
  if (secPreview) secPreview.style.display = tab === 'preview' ? 'block' : 'none';

  if (tab === 'mismatch') {
    renderConverterMismatches();
  } else if (tab === 'preview') {
    compileConvertedOutput();
    renderConverterOutputTable();
  }
}

// ----------------------------------------------------------
// File Ingestion & Sheet Extraction
// ----------------------------------------------------------
function setupConverterUploads() {
  // Template File Input & Dropzone
  const tDrop = document.getElementById('convTemplateDropzone');
  const tInput = document.getElementById('convTemplateFileInput');
  tDrop?.addEventListener('click', () => tInput?.click());
  tDrop?.addEventListener('dragover', (e) => { e.preventDefault(); tDrop.classList.add('dragover'); });
  tDrop?.addEventListener('dragleave', () => tDrop.classList.remove('dragover'));
  tDrop?.addEventListener('drop', (e) => {
    e.preventDefault();
    tDrop.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleTemplateUploadedFile(e.dataTransfer.files[0]);
  });
  tInput?.addEventListener('change', (e) => {
    if (e.target.files.length) handleTemplateUploadedFile(e.target.files[0]);
  });

  // Working File Input & Dropzone
  const wDrop = document.getElementById('convWorkingDropzone');
  const wInput = document.getElementById('convWorkingFileInput');
  wDrop?.addEventListener('click', () => wInput?.click());
  wDrop?.addEventListener('dragover', (e) => { e.preventDefault(); wDrop.classList.add('dragover'); });
  wDrop?.addEventListener('dragleave', () => wDrop.classList.remove('dragover'));
  wDrop?.addEventListener('drop', (e) => {
    e.preventDefault();
    wDrop.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleWorkingUploadedFile(e.dataTransfer.files[0]);
  });
  wInput?.addEventListener('change', (e) => {
    if (e.target.files.length) handleWorkingUploadedFile(e.target.files[0]);
  });

  // Sheet Selectors
  document.getElementById('convTemplateSheetSelect')?.addEventListener('change', (e) => {
    convState.templateSheetName = e.target.value;
    parseTemplateSheetData();
  });
  document.getElementById('convWorkingSheetSelect')?.addEventListener('change', (e) => {
    convState.workingSheetName = e.target.value;
    parseWorkingSheetData();
  });

  // Replace Buttons
  document.getElementById('convTemplateChangeBtn')?.addEventListener('click', () => tInput?.click());
  document.getElementById('convWorkingChangeBtn')?.addEventListener('click', () => wInput?.click());

  // Navigation & Actions
  document.getElementById('convTabUploadBtn')?.addEventListener('click', () => switchConverterTab('upload'));
  document.getElementById('convTabMismatchBtn')?.addEventListener('click', () => switchConverterTab('mismatch'));
  document.getElementById('convTabPreviewBtn')?.addEventListener('click', () => switchConverterTab('preview'));
  document.getElementById('convViewOutputBtn')?.addEventListener('click', () => switchConverterTab('preview'));

  document.getElementById('convProcessBtn')?.addEventListener('click', runConverterMatching);
  document.getElementById('convLoadDemoBtn')?.addEventListener('click', loadConverterDemoData);
  document.getElementById('convAutoAcceptSuggestionsBtn')?.addEventListener('click', acceptAllSuggestions);

  document.getElementById('convDownloadXlsxBtn')?.addEventListener('click', downloadConvertedExcel);
  document.getElementById('convDownloadXlsxBtn2')?.addEventListener('click', downloadConvertedExcel);
  document.getElementById('convDownloadCsvBtn')?.addEventListener('click', downloadConvertedCsv);
  document.getElementById('convClearAllBtn')?.addEventListener('click', clearAllConverterData);

  // Actions Dropdown Toggle
  const actionsBtn = document.getElementById('convActionsDropdownBtn');
  const actionsMenu = document.getElementById('convActionsMenu');
  if (actionsBtn && actionsMenu) {
    actionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      actionsMenu.style.display = actionsMenu.style.display === 'none' ? 'block' : 'none';
    });
  }
  document.addEventListener('click', (e) => {
    if (actionsMenu && !e.target.closest('.rem-actions-dropdown-wrap')) {
      actionsMenu.style.display = 'none';
    }
  });

  // Table Filters
  document.getElementById('convSearchInput')?.addEventListener('input', renderConverterOutputTable);
  document.getElementById('convFilterStatus')?.addEventListener('change', renderConverterOutputTable);
}

function handleTemplateUploadedFile(file) {
  if (!file) return;
  convState.templateFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      convState.templateWorkbook = workbook;
      convState.templateSheetName = workbook.SheetNames[0] || '';
      
      const statusPill = document.getElementById('convTemplateFileStatus');
      if (statusPill) {
        statusPill.textContent = 'File Loaded';
        statusPill.className = 'conv-status-pill conv-pill-ready';
      }

      document.getElementById('convTemplateDropzone').style.display = 'none';
      document.getElementById('convTemplateDetails').style.display = 'block';
      document.getElementById('convTemplateFileName').textContent = file.name;
      document.getElementById('convTemplateFileInfo').textContent = (file.size / 1024).toFixed(1) + ' KB - ' + workbook.SheetNames.length + ' sheet(s)';

      const sheetSelect = document.getElementById('convTemplateSheetSelect');
      if (sheetSelect) {
        sheetSelect.innerHTML = workbook.SheetNames.map(s => '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>').join('');
      }

      parseTemplateSheetData();
      checkEnableProcessButton();
      showToast('Template file loaded.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to parse template Excel file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function handleWorkingUploadedFile(file) {
  if (!file) return;
  convState.workingFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      convState.workingWorkbook = workbook;
      convState.workingSheetName = workbook.SheetNames[0] || '';
      
      const statusPill = document.getElementById('convWorkingFileStatus');
      if (statusPill) {
        statusPill.textContent = 'File Loaded';
        statusPill.className = 'conv-status-pill conv-pill-ready';
      }

      document.getElementById('convWorkingDropzone').style.display = 'none';
      document.getElementById('convWorkingDetails').style.display = 'block';
      document.getElementById('convWorkingFileName').textContent = file.name;
      document.getElementById('convWorkingFileInfo').textContent = (file.size / 1024).toFixed(1) + ' KB - ' + workbook.SheetNames.length + ' sheet(s)';

      const sheetSelect = document.getElementById('convWorkingSheetSelect');
      if (sheetSelect) {
        sheetSelect.innerHTML = workbook.SheetNames.map(s => '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>').join('');
      }

      parseWorkingSheetData();
      checkEnableProcessButton();
      showToast('Working file loaded.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to parse working Excel file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function checkEnableProcessButton() {
  const btn = document.getElementById('convProcessBtn');
  if (btn) {
    const ready = convState.templateRecords.length > 0 && convState.workingRecords.length > 0;
    btn.disabled = !ready;
  }
}

// ----------------------------------------------------------
// Sheet Parsing & Column Detection
// ----------------------------------------------------------
function parseTemplateSheetData() {
  if (!convState.templateWorkbook || !convState.templateSheetName) return;
  const sheet = convState.templateWorkbook.Sheets[convState.templateSheetName];
  if (!sheet) return;

  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rawRows || !rawRows.length) return;

  // Find header row (row containing "Customer" or "Name" or max strings)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const row = rawRows[i];
    if (row.some(cell => /customer|name|tenant/i.test(String(cell)))) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = rawRows[headerRowIdx].map(h => String(h || '').trim());
  convState.templateCols = headers;

  // Detect column indexes
  let colNameIdx = headers.findIndex(h => /customer.*name|name|tenant/i.test(h));
  if (colNameIdx === -1) colNameIdx = 0;
  let colDateIdx = headers.findIndex(h => /last.*bill|bill.*date|date/i.test(h));
  let colStartIdx = headers.findIndex(h => /start.*read|prev.*read|opening/i.test(h));
  let colCurrIdx = headers.findIndex(h => /current.*read|present|closing/i.test(h));
  let colRateIdx = headers.findIndex(h => /rate|tariff/i.test(h));
  let colAdjIdx = headers.findIndex(h => /adjust|surcharge/i.test(h));
  let colTaxIdx = headers.findIndex(h => /tax|duty|gst/i.test(h));
  let colRemIdx = headers.findIndex(h => /remark|note/i.test(h));

  // Render detected chips
  const chipsContainer = document.getElementById('convTemplateColsList');
  if (chipsContainer) {
    chipsContainer.innerHTML = headers.filter(h => h).map(h => '<span class="conv-chip">' + escapeHtml(h) + '</span>').join('');
  }

  // Extract records
  convState.templateRecords = [];
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    const nameVal = String(row[colNameIdx] || '').trim();
    if (!nameVal || /^(total|grands*total)$/i.test(nameVal)) continue;

    let dateVal = colDateIdx !== -1 ? String(row[colDateIdx] || '').trim() : '';
    // Format date string if excel date object
    if (row[colDateIdx] instanceof Date) {
      dateVal = row[colDateIdx].toISOString().split('T')[0];
    }

    const startVal = colStartIdx !== -1 ? String(row[colStartIdx] || '').trim() : '';
    const currVal = colCurrIdx !== -1 ? String(row[colCurrIdx] || '').trim() : '';
    const rateVal = colRateIdx !== -1 ? String(row[colRateIdx] || '').trim() : '';
    const adjVal = colAdjIdx !== -1 ? String(row[colAdjIdx] || '').trim() : '';
    const taxVal = colTaxIdx !== -1 ? String(row[colTaxIdx] || '0').trim() : '0';
    const remVal = colRemIdx !== -1 ? String(row[colRemIdx] || '0').trim() : '0';

    convState.templateRecords.push({
      id: 'tmpl_' + i,
      rawIndex: i,
      name: nameVal,
      cleanName: cleanCustomerName(nameVal),
      lastBillDate: dateVal,
      startReading: startVal,
      currentReading: currVal,
      rate: rateVal,
      adjustment: adjVal,
      tax: taxVal || '0',
      remarks: remVal || '0'
    });
  }
}

function parseWorkingSheetData() {
  if (!convState.workingWorkbook || !convState.workingSheetName) return;
  const sheet = convState.workingWorkbook.Sheets[convState.workingSheetName];
  if (!sheet) return;

  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rawRows || !rawRows.length) return;

  // Find header row (row containing Previous Reading or Current Reading)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const row = rawRows[i];
    if (row.some(cell => /previous.*read|current.*read|units.*consumed|amount/i.test(String(cell)))) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = rawRows[headerRowIdx].map(h => String(h || '').trim());
  convState.workingCols = headers;

  let colNameIdx = headers.findIndex(h => /customer|name|tenant|shop|mall/i.test(h));
  if (colNameIdx === -1) colNameIdx = 0;
  let colPrevIdx = headers.findIndex(h => /previous.*read|prev/i.test(h));
  let colCurrIdx = headers.findIndex(h => /current.*read|curr/i.test(h));
  let colAmtIdx = headers.findIndex(h => /amount|bill|total.*pkr/i.test(h));

  // Render detected chips
  const chipsContainer = document.getElementById('convWorkingColsList');
  if (chipsContainer) {
    chipsContainer.innerHTML = headers.filter(h => h).map(h => '<span class="conv-chip">' + escapeHtml(h) + '</span>').join('');
  }

  convState.workingRecords = [];
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    const nameVal = String(row[colNameIdx] || '').trim();
    if (!nameVal || /^(mall|total|grands*total|summary|subtotal)$/i.test(nameVal)) continue;

    const prevVal = colPrevIdx !== -1 ? String(row[colPrevIdx] || '').trim() : '';
    const currVal = colCurrIdx !== -1 ? String(row[colCurrIdx] || '').trim() : '';
    const amtVal = colAmtIdx !== -1 ? String(row[colAmtIdx] || '').trim() : '';

    convState.workingRecords.push({
      id: 'work_' + i,
      rawIndex: i,
      originalName: nameVal,
      name: nameVal,
      cleanName: cleanCustomerName(nameVal),
      previousReading: prevVal,
      currentReading: currVal,
      amount: amtVal
    });
  }
}

// ----------------------------------------------------------
// Intelligent Matching Engine
// ----------------------------------------------------------
function runConverterMatching() {
  if (!convState.templateRecords.length || !convState.workingRecords.length) {
    showToast('Please upload both Template and Working files first.', 'warning');
    return;
  }

  convState.autoMatches = [];
  convState.manualMappings = {};

  const matchedWorkingIds = new Set();
  const matchedTemplateIds = new Set();

  // Pass 1: Exact Clean Name Match
  convState.templateRecords.forEach(tmpl => {
    const match = convState.workingRecords.find(work => !matchedWorkingIds.has(work.id) && work.cleanName === tmpl.cleanName);
    if (match) {
      convState.autoMatches.push({
        templateId: tmpl.id,
        workingId: match.id,
        confidence: 1.0,
        isAuto: true
      });
      matchedWorkingIds.add(match.id);
      matchedTemplateIds.add(tmpl.id);
    }
  });

  // Pass 2: High Confidence Substring / Similarity Match (> 0.88)
  convState.templateRecords.forEach(tmpl => {
    if (matchedTemplateIds.has(tmpl.id)) return;

    let bestMatch = null;
    let bestScore = 0;

    convState.workingRecords.forEach(work => {
      if (matchedWorkingIds.has(work.id)) return;
      const score = calculateStringSimilarity(tmpl.cleanName, work.cleanName);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = work;
      }
    });

    if (bestMatch && bestScore >= 0.88) {
      convState.autoMatches.push({
        templateId: tmpl.id,
        workingId: bestMatch.id,
        confidence: bestScore,
        isAuto: true
      });
      matchedWorkingIds.add(bestMatch.id);
      matchedTemplateIds.add(tmpl.id);
    }
  });

  // Remaining are mismatches
  const unmatchedTmpl = convState.templateRecords.filter(t => !matchedTemplateIds.has(t.id));
  const mismatchCount = unmatchedTmpl.length;

  const mismatchBadge = document.getElementById('convMismatchBadge');
  if (mismatchBadge) mismatchBadge.textContent = mismatchCount;

  if (mismatchCount > 0) {
    switchConverterTab('mismatch');
    showToast('Found ' + mismatchCount + ' customer name(s) requiring verification.', 'info');
  } else {
    switchConverterTab('preview');
    showToast('All customer names matched automatically! Output table generated.', 'success');
  }
}

// ----------------------------------------------------------
// Mismatch Resolution UI (Only Problem Names in Dropdowns with Previous Amounts)
// ----------------------------------------------------------
function renderConverterMismatches() {
  const container = document.getElementById('convMismatchContainer');
  const emptyNotice = document.getElementById('convNoMismatchNotice');
  if (!container) return;

  const resolvedTemplateIds = new Set([
    ...convState.autoMatches.map(m => m.templateId),
    ...Object.keys(convState.manualMappings)
  ]);

  const usedWorkingIds = new Set([
    ...convState.autoMatches.map(m => m.workingId),
    ...Object.values(convState.manualMappings).filter(id => id && id !== 'skip')
  ]);

  // Only unmatched / problem template customers
  const problemTemplates = convState.templateRecords.filter(t => !resolvedTemplateIds.has(t.id));
  // Only unmatched / problem working customers
  const problemWorkings = convState.workingRecords.filter(w => !usedWorkingIds.has(w.id));

  const mismatchBadge = document.getElementById('convMismatchBadge');
  if (mismatchBadge) mismatchBadge.textContent = problemTemplates.length;

  if (problemTemplates.length === 0) {
    container.innerHTML = '';
    if (emptyNotice) emptyNotice.style.display = 'block';
    return;
  }

  if (emptyNotice) emptyNotice.style.display = 'none';

  let html = '';
  problemTemplates.forEach((tmpl, pIdx) => {
    // Find best candidate suggestion among problem workings
    let suggestedWorkId = '';
    let highestSim = 0;
    problemWorkings.forEach(work => {
      const sim = calculateStringSimilarity(tmpl.cleanName, work.cleanName);
      if (sim > highestSim) {
        highestSim = sim;
        suggestedWorkId = work.id;
      }
    });

    // Format previous amount / reading for template
    const tmplPrev = tmpl.startReading ? ('Prev: ' + tmpl.startReading) : 'No prev reading';

    html += `
      <div class="conv-mismatch-row" data-template-id="${tmpl.id}">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span class="conv-card-badge" style="background:#2b1216; color:#f87171; border-color:#6b1d24;">!${pIdx + 1}</span>
            <span style="font-weight:700; color:#ffffff; font-size:0.92rem;">${escapeHtml(tmpl.name)}</span>
            <span style="font-size:0.75rem; color:#9ca3af;">(${tmplPrev})</span>
          </div>
          ${highestSim > 0.4 ? `<span class="conv-badge-tag conv-badge-manual">Suggested Match: ${Math.round(highestSim * 100)}%</span>` : ''}
        </div>

        <div class="conv-mismatch-grid">
          <!-- 1st Dropdown: Template Names (Only Problem Names) -->
          <div>
            <label class="conv-label">1) Template Customer (Target Image 1)</label>
            <select class="conv-select conv-tmpl-select" data-template-id="${tmpl.id}">
              <option value="${tmpl.id}">${escapeHtml(tmpl.name)} (${tmplPrev})</option>
            </select>
          </div>

          <!-- 2nd Dropdown: Working File Names (Only Problem Names with Previous Amount) -->
          <div>
            <label class="conv-label">2) Working File Customer (Showing with Previous Amount / Reading)</label>
            <select class="conv-select conv-work-select" data-template-id="${tmpl.id}">
              <option value="">-- Select Matching Customer in Working File --</option>
              ${problemWorkings.map(work => {
                const workInfo = [
                  work.previousReading ? ('Prev: ' + work.previousReading) : '',
                  work.currentReading ? ('Curr: ' + work.currentReading) : '',
                  work.amount ? ('Amt: ' + work.amount) : ''
                ].filter(Boolean).join(' | ');

                const isSelected = (work.id === suggestedWorkId && highestSim > 0.5) ? 'selected' : '';
                return '<option value="' + work.id + '" ' + isSelected + '>' + escapeHtml(work.originalName) + ' (' + escapeHtml(workInfo || 'No readings') + ')</option>';
              }).join('')}
            </select>
          </div>

          <!-- Action Buttons -->
          <div style="display:flex; gap:0.4rem; white-space:nowrap;">
            <button type="button" class="btn btn-secondary btn-sm conv-match-btn" data-template-id="${tmpl.id}" style="border-color:#10b981; color:#10b981; font-weight:700;">
              ✓ Match
            </button>
            <button type="button" class="btn btn-secondary btn-sm conv-skip-btn" data-template-id="${tmpl.id}" style="color:#9ca3af;">
              Skip (Leave Empty)
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Bind Match Buttons
  container.querySelectorAll('.conv-match-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tmplId = btn.getAttribute('data-template-id');
      const rowEl = container.querySelector('.conv-mismatch-row[data-template-id="' + tmplId + '"]');
      const workSelect = rowEl?.querySelector('.conv-work-select');
      const selectedWorkId = workSelect?.value;

      if (!selectedWorkId) {
        showToast('Please select a customer from the working file dropdown first.', 'warning');
        return;
      }

      convState.manualMappings[tmplId] = selectedWorkId;
      showToast('Customer matched successfully!', 'success');
      renderConverterMismatches();
    });
  });

  // Bind Skip Buttons
  container.querySelectorAll('.conv-skip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tmplId = btn.getAttribute('data-template-id');
      convState.manualMappings[tmplId] = 'skip';
      showToast('Marked as skipped (current reading will remain blank).', 'info');
      renderConverterMismatches();
    });
  });
}

function acceptAllSuggestions() {
  const container = document.getElementById('convMismatchContainer');
  if (!container) return;

  let approvedCount = 0;
  container.querySelectorAll('.conv-mismatch-row').forEach(rowEl => {
    const tmplId = rowEl.getAttribute('data-template-id');
    const workSelect = rowEl.querySelector('.conv-work-select');
    if (tmplId && workSelect && workSelect.value) {
      convState.manualMappings[tmplId] = workSelect.value;
      approvedCount++;
    }
  });

  if (approvedCount > 0) {
    showToast('Accepted ' + approvedCount + ' customer suggestions.', 'success');
    renderConverterMismatches();
  } else {
    showToast('No auto-suggestions available to approve.', 'info');
  }
}

// ----------------------------------------------------------
// Compile Converted Output Table (Strictly in Image 1 Format)
// ----------------------------------------------------------
function compileConvertedOutput() {
  convState.compiledOutput = [];

  const autoMap = {};
  convState.autoMatches.forEach(m => {
    autoMap[m.templateId] = m.workingId;
  });

  const workingMap = {};
  convState.workingRecords.forEach(w => {
    workingMap[w.id] = w;
  });

  convState.templateRecords.forEach((tmpl, idx) => {
    let matchedWorkId = convState.manualMappings[tmpl.id];
    let status = 'empty';

    if (matchedWorkId && matchedWorkId !== 'skip') {
      status = 'manual';
    } else if (matchedWorkId === 'skip') {
      status = 'empty';
    } else if (autoMap[tmpl.id]) {
      matchedWorkId = autoMap[tmpl.id];
      status = 'matched';
    }

    const matchedWorking = matchedWorkId ? workingMap[matchedWorkId] : null;

    // Start reading: use template start reading or working previous reading
    const finalStartReading = tmpl.startReading || (matchedWorking ? matchedWorking.previousReading : '');
    // Current reading: filled directly from matched working record
    const finalCurrentReading = matchedWorking ? matchedWorking.currentReading : '';

    convState.compiledOutput.push({
      sr: idx + 1,
      templateId: tmpl.id,
      customerName: tmpl.name,
      lastBillDate: tmpl.lastBillDate || '2026-09-30',
      startReading: finalStartReading,
      currentReading: finalCurrentReading,
      rate: tmpl.rate || '',
      adjustmentSurcharge: tmpl.adjustment || '',
      taxDuty: tmpl.tax || '0',
      remarks: tmpl.remarks || '0',
      status: status,
      workingName: matchedWorking ? matchedWorking.originalName : ''
    });
  });

  const totalBadge = document.getElementById('convTotalRowsBadge');
  if (totalBadge) totalBadge.textContent = convState.compiledOutput.length;
}

function renderConverterOutputTable() {
  const tbody = document.getElementById('convOutputTableBody');
  if (!tbody) return;

  const searchVal = (document.getElementById('convSearchInput')?.value || '').toLowerCase().trim();
  const filterVal = document.getElementById('convFilterStatus')?.value || 'all';

  let filtered = convState.compiledOutput.slice();

  if (filterVal !== 'all') {
    filtered = filtered.filter(row => row.status === filterVal);
  }

  if (searchVal) {
    filtered = filtered.filter(row => {
      const name = (row.customerName || '').toLowerCase();
      const wName = (row.workingName || '').toLowerCase();
      return name.includes(searchVal) || wName.includes(searchVal);
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:2rem; color:#9ca3af;">No rows match filter.</td></tr>';
    return;
  }

  let html = '';
  filtered.forEach((row, idx) => {
    let statusBadge = '<span class="conv-badge-tag conv-badge-empty">No Reading</span>';
    if (row.status === 'matched') {
      statusBadge = '<span class="conv-badge-tag conv-badge-matched">Auto-Matched</span>';
    } else if (row.status === 'manual') {
      statusBadge = '<span class="conv-badge-tag conv-badge-manual">Manually Approved</span>';
    }

    const hasReadingStyle = row.currentReading ? 'background:rgba(16, 185, 129, 0.08); font-weight:700; color:#10b981;' : '';

    html += `
      <tr data-row-idx="${row.sr - 1}">
        <td style="text-align:center; color:#9ca3af; font-weight:600;">${row.sr}</td>
        <td style="font-weight:700; color:#ffffff;">
          <input type="text" class="rem-te-input conv-cell-input" data-field="customerName" data-idx="${row.sr - 1}" value="${escapeHtml(row.customerName)}" />
        </td>
        <td style="text-align:center;">
          <input type="text" class="rem-te-input conv-cell-input" data-field="lastBillDate" data-idx="${row.sr - 1}" value="${escapeHtml(row.lastBillDate)}" style="text-align:center;" />
        </td>
        <td style="text-align:right;">
          <input type="text" class="rem-te-input conv-cell-input" data-field="startReading" data-idx="${row.sr - 1}" value="${escapeHtml(row.startReading)}" style="text-align:right;" />
        </td>
        <td style="text-align:right;">
          <input type="text" class="rem-te-input conv-cell-input" data-field="currentReading" data-idx="${row.sr - 1}" value="${escapeHtml(row.currentReading)}" style="text-align:right; ${hasReadingStyle}" />
        </td>
        <td style="text-align:right;">
          <input type="text" class="rem-te-input conv-cell-input" data-field="rate" data-idx="${row.sr - 1}" value="${escapeHtml(row.rate)}" style="text-align:right;" />
        </td>
        <td style="text-align:right;">
          <input type="text" class="rem-te-input conv-cell-input" data-field="adjustmentSurcharge" data-idx="${row.sr - 1}" value="${escapeHtml(row.adjustmentSurcharge)}" style="text-align:right;" />
        </td>
        <td style="text-align:center;">
          <input type="text" class="rem-te-input conv-cell-input" data-field="taxDuty" data-idx="${row.sr - 1}" value="${escapeHtml(row.taxDuty)}" style="text-align:center;" />
        </td>
        <td>
          <input type="text" class="rem-te-input conv-cell-input" data-field="remarks" data-idx="${row.sr - 1}" value="${escapeHtml(row.remarks)}" />
        </td>
        <td style="text-align:center;">${statusBadge}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Bind cell edit changes
  tbody.querySelectorAll('.conv-cell-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.getAttribute('data-idx'), 10);
      const field = e.target.getAttribute('data-field');
      if (convState.compiledOutput[idx]) {
        convState.compiledOutput[idx][field] = e.target.value;
      }
    });
  });
}

// ----------------------------------------------------------
// Excel & CSV Download (Image 1 Format)
// ----------------------------------------------------------
function downloadConvertedExcel() {
  if (!convState.compiledOutput.length) {
    compileConvertedOutput();
  }
  if (!convState.compiledOutput.length) {
    showToast('No converted data to export. Please process files first.', 'error');
    return;
  }

  try {
    showToast('Generating Excel (.xlsx) file...', 'info');

    // Headers exactly as shown in Image 1:
    // Customer Name | Last Bill Date | Start Reading | Current Reading | Rate | Adjustment Surcharge | Tax / Duty | Remarks
    const headerRow = [
      'Customer Name',
      'Last Bill Date',
      'Start Reading',
      'Current Reading',
      'Rate',
      'Adjustment Surcharge',
      'Tax / Duty',
      'Remarks'
    ];

    const dataRows = convState.compiledOutput.map(r => {
      // Parse numbers if numeric
      const startNum = parseFloat(String(r.startReading).replace(/,/g, ''));
      const currNum = parseFloat(String(r.currentReading).replace(/,/g, ''));
      const rateNum = parseFloat(String(r.rate).replace(/,/g, ''));
      const adjNum = parseFloat(String(r.adjustmentSurcharge).replace(/,/g, ''));
      const taxNum = parseFloat(String(r.taxDuty).replace(/,/g, ''));

      return [
        r.customerName,
        r.lastBillDate,
        !isNaN(startNum) ? startNum : r.startReading,
        !isNaN(currNum) ? currNum : (r.currentReading || ''),
        !isNaN(rateNum) ? rateNum : (r.rate || ''),
        !isNaN(adjNum) ? adjNum : (r.adjustmentSurcharge || ''),
        !isNaN(taxNum) ? taxNum : (r.taxDuty || 0),
        r.remarks != null ? r.remarks : 0
      ];
    });

    const worksheetData = [headerRow, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    // Auto set column widths
    ws['!cols'] = [
      { wch: 24 }, // Customer Name
      { wch: 15 }, // Last Bill Date
      { wch: 16 }, // Start Reading
      { wch: 16 }, // Current Reading
      { wch: 10 }, // Rate
      { wch: 22 }, // Adjustment Surcharge
      { wch: 12 }, // Tax / Duty
      { wch: 14 }  // Remarks
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Billing Readings');

    const fileName = 'Mega_Mall_Billing_Converted_' + (new Date().toISOString().split('T')[0]) + '.xlsx';
    XLSX.writeFile(wb, fileName);
    showToast('Downloaded ' + fileName, 'success');
  } catch (err) {
    console.error('Excel download error:', err);
    showToast('Failed to export Excel file: ' + err.message, 'error');
  }
}

function downloadConvertedCsv() {
  if (!convState.compiledOutput.length) {
    compileConvertedOutput();
  }
  if (!convState.compiledOutput.length) {
    showToast('No converted data to export.', 'error');
    return;
  }

  try {
    const headerRow = ['Customer Name', 'Last Bill Date', 'Start Reading', 'Current Reading', 'Rate', 'Adjustment Surcharge', 'Tax / Duty', 'Remarks'];
    const csvRows = [headerRow.join(',')];

    convState.compiledOutput.forEach(r => {
      const escapeCsv = (str) => {
        const val = String(str != null ? str : '');
        return val.includes(',') ? ('"' + val.replace(/"/g, '""') + '"') : val;
      };
      csvRows.push([
        escapeCsv(r.customerName),
        escapeCsv(r.lastBillDate),
        escapeCsv(r.startReading),
        escapeCsv(r.currentReading),
        escapeCsv(r.rate),
        escapeCsv(r.adjustmentSurcharge),
        escapeCsv(r.taxDuty),
        escapeCsv(r.remarks)
      ].join(','));
    });

    const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Mega_Mall_Billing_Converted_' + (new Date().toISOString().split('T')[0]) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded CSV file.', 'success');
  } catch (err) {
    showToast('Failed to download CSV: ' + err.message, 'error');
  }
}

function clearAllConverterData() {
  if (confirm('Clear all uploaded files and reset converter?')) {
    convState.templateFile = null;
    convState.templateWorkbook = null;
    convState.templateRawRows = [];
    convState.templateRecords = [];
    convState.workingFile = null;
    convState.workingWorkbook = null;
    convState.workingRawRows = [];
    convState.workingRecords = [];
    convState.autoMatches = [];
    convState.manualMappings = {};
    convState.compiledOutput = [];

    document.getElementById('convTemplateDropzone').style.display = 'block';
    document.getElementById('convTemplateDetails').style.display = 'none';
    document.getElementById('convTemplateFileStatus').textContent = 'Waiting for file';
    document.getElementById('convTemplateFileStatus').className = 'conv-status-pill conv-pill-waiting';

    document.getElementById('convWorkingDropzone').style.display = 'block';
    document.getElementById('convWorkingDetails').style.display = 'none';
    document.getElementById('convWorkingFileStatus').textContent = 'Waiting for file';
    document.getElementById('convWorkingFileStatus').className = 'conv-status-pill conv-pill-waiting';

    checkEnableProcessButton();
    switchConverterTab('upload');
    showToast('Converter reset.', 'info');
  }
}

// ----------------------------------------------------------
// Load Demo Data (From User Screenshots: Image 1 & Image 2)
// ----------------------------------------------------------
function loadConverterDemoData() {
  // Demo Template Data (Image 1 Format)
  convState.templateRecords = [
    { id: 'tmpl_1', name: 'KFC', cleanName: 'kfc', lastBillDate: '2026-09-30', startReading: '1107202.4', currentReading: '', rate: '', adjustment: '', tax: '0', remarks: '0' },
    { id: 'tmpl_2', name: 'BONANZA', cleanName: 'bonanza', lastBillDate: '2026-09-30', startReading: '99989.4', currentReading: '', rate: '', adjustment: '', tax: '0', remarks: '0' },
    { id: 'tmpl_3', name: 'IDEAS', cleanName: 'ideas', lastBillDate: '2026-09-30', startReading: '275048', currentReading: '', rate: '', adjustment: '', tax: '0', remarks: '0' },
    { id: 'tmpl_4', name: 'SERVIS', cleanName: 'servis', lastBillDate: '2026-09-30', startReading: '63947', currentReading: '', rate: '', adjustment: '', tax: '0', remarks: '0' },
    { id: 'tmpl_5', name: 'Shop Zirrotti', cleanName: 'shop zirrotti', lastBillDate: '2026-09-30', startReading: '101', currentReading: '', rate: '', adjustment: '', tax: '0', remarks: '0' },
    { id: 'tmpl_6', name: 'marfeen', cleanName: 'marfeen', lastBillDate: '2026-09-30', startReading: '652', currentReading: '', rate: '', adjustment: '', tax: '0', remarks: '0' },
    { id: 'tmpl_7', name: 'SAYA', cleanName: 'saya', lastBillDate: '2026-09-30', startReading: '93513', currentReading: '', rate: '', adjustment: '', tax: '0', remarks: '0' },
    { id: 'tmpl_8', name: 'STYLO METER 1', cleanName: 'stylo', lastBillDate: '2026-09-30', startReading: '22939', currentReading: '', rate: '', adjustment: '', tax: '0', remarks: '0' }
  ];

  // Demo Working Data (Image 2 Format with Previous Amounts)
  convState.workingRecords = [
    { id: 'work_1', originalName: '*Bonanza', name: '*Bonanza', cleanName: 'bonanza', previousReading: '99,989', currentReading: '102,037.8', amount: '192,091' },
    { id: 'work_2', originalName: '*Ideas', name: '*Ideas', cleanName: 'ideas', previousReading: '275,048', currentReading: '275,326', amount: '26,065' },
    { id: 'work_3', originalName: '*Servis', name: '*Servis', cleanName: 'servis', previousReading: '63,947', currentReading: '65,494.3', amount: '145,072' },
    { id: 'work_4', originalName: 'Shop Zirrotti', name: 'Shop Zirrotti', cleanName: 'shop zirrotti', previousReading: '101', currentReading: '140', amount: '3,691' },
    { id: 'work_5', originalName: 'marfan', name: 'marfan', cleanName: 'marfan', previousReading: '652', currentReading: '825', amount: '16,220' },
    { id: 'work_6', originalName: '*Saya', name: '*Saya', cleanName: 'saya', previousReading: '93,513', currentReading: '97,595', amount: '382,678' },
    { id: 'work_7', originalName: '*Stylo Meter 1', name: '*Stylo Meter 1', cleanName: 'stylo', previousReading: '22,939', currentReading: '23,723', amount: '73,544' }
  ];

  document.getElementById('convTemplateDropzone').style.display = 'none';
  document.getElementById('convTemplateDetails').style.display = 'block';
  document.getElementById('convTemplateFileName').textContent = 'Demo_Template_Image1.xlsx';
  document.getElementById('convTemplateFileInfo').textContent = '8 Customer Rows - Image 1 Format';
  document.getElementById('convTemplateFileStatus').textContent = 'Demo Loaded';
  document.getElementById('convTemplateFileStatus').className = 'conv-status-pill conv-pill-ready';

  document.getElementById('convWorkingDropzone').style.display = 'none';
  document.getElementById('convWorkingDetails').style.display = 'block';
  document.getElementById('convWorkingFileName').textContent = 'Demo_Working_Readings_Image2.xlsx';
  document.getElementById('convWorkingFileInfo').textContent = '7 Customer Readings with Amounts';
  document.getElementById('convWorkingFileStatus').textContent = 'Demo Loaded';
  document.getElementById('convWorkingFileStatus').className = 'conv-status-pill conv-pill-ready';

  checkEnableProcessButton();
  runConverterMatching();
  showToast('Loaded demo dataset from screenshots. Notice the marfeen ↔ marfan mismatch approval!', 'success');
}

function initConverterApp() {
  setupConverterUploads();
}

