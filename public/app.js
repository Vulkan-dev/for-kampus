/**
 * Water Invoice Maker - Application Logic
 * Professional Matte Dark Architecture with Full Data Editing & Multi-Format Exports
 */

// ==========================================================
// Corporate Session & Authentication Manager (SessionStorage)
// ==========================================================
let authUser = null;

function getAuthToken() {
  return sessionStorage.getItem('mega_mall_auth_token');
}

function setAuthSession(token, user) {
  if (token) {
    sessionStorage.setItem('mega_mall_auth_token', token);
  }
  if (user) {
    sessionStorage.setItem('mega_mall_auth_user', JSON.stringify(user));
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
  const storedUser = sessionStorage.getItem('mega_mall_auth_user');
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
    console.warn("Auth verification error:", e);
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
    occupier: "FALAKNAZ SPRINGS,",
    location: "The Mega Mall, Block-18, Gulishtan-e-Jauhar, Karachi.,",
    ntn: "C951537",
    startMonth: "2024-01",
    endMonth: "2026-07",
    invPrefix: "#INV-",
    invStartNum: 3001,
    invSuffix: "-051026",
    includePrevBalance: false,
    prevBalanceMode: "zero",
    rates: {
      "2024": { rate: 1.25, gallons: 53759 },
      "2025": { rate: 1.25, gallons: 137788, overrides: { "2025-12": 99725 } },
      "2026": { rate: 1.25, gallons: 137788 }
    }
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
  invPrefix: "#INV-",
  invStartNum: 3001,
  invSuffix: "-051026",
  autoSuffixYear: false,
  includePrevBalance: false,
  prevBalanceMode: "zero",
  openingBalance: 0,
  yearRates: {
    "2024": { rate: 1.25, gallons: 53759 },
    "2025": { rate: 1.25, gallons: 137788, overrides: { "2025-12": 99725 } },
    "2026": { rate: 1.25, gallons: 137788 }
  },
  manualCorrections: {},
  tableColumns: JSON.parse(JSON.stringify(DEFAULT_TABLE_COLUMNS)),
  currentPageIndex: 0,
  viewAllPages: false,
  activeTab: "preview"
};

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
    updateDbSyncStatus("synced", "Database Synced");
  }
  syncInputsWithState();
  updateYearConfigsUI();
  renderPreview();
  renderDataEditor();
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
      text = inv.previous === 0 ? "0" : `${formatNumber(inv.previous)}/-`;
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
    const yearConfig = appState.yearRates[m.year] || { rate: 1.25, gallons: 50000 };
    
    let gallons = yearConfig.gallons || 50000;
    if (yearConfig.overrides && yearConfig.overrides[m.ym] !== undefined) {
      gallons = yearConfig.overrides[m.ym];
    }
    let rate = yearConfig.rate || 1.25;
    const effectiveSuffix = getEffectiveSuffix(m);
    let invNum = `${appState.invPrefix}${appState.invStartNum + index}${effectiveSuffix}`;

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
    if (custom.invoiceNumber !== undefined && custom.invoiceNumber !== "") invNum = custom.invoiceNumber;
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

    let totalPayable = billAmount + previous;
    if (custom.totalPayable !== undefined && custom.totalPayable !== "") {
      totalPayable = Number(custom.totalPayable);
    }

    if (appState.includePrevBalance && appState.prevBalanceMode === "cumulative") {
      runningPrevious += billAmount;
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

      <!-- Bullet Notices -->
      <div class="inv-notices">
        <ul>
          <li>*Please make payment in favour of Kampus Integrated Services NTN: C951537 Account No:<br>10380109491064 in Meezan Bank.</li>
          <li>*If the payment is not received till the last payment date, "<strong>The Mega Mall</strong>" will hold the services of your<br>lincensed area and will not held responsible for any losses Whats so ever there for.</li>
        </ul>
      </div>

      <!-- Signoff -->
      <div class="inv-signoff">
        <div class="dept">Account Department</div>
        <div class="date">Date : ${inv.issueDate}</div>
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
            <input type="number" step="1" class="form-input" style="border-color:rgba(34,197,94,0.4); font-weight:600; color:var(--accent-green);" value="${currentBill}" onchange="setYearManualBillAmount(${year}, this.value)" />
          </div>
          <div class="form-group">
            <label class="form-label">Rate / Gal (PKR)</label>
            <input type="number" step="0.01" class="form-input" value="${config.rate}" onchange="setYearRate(${year}, this.value)" />
          </div>
        </div>
        <div class="form-row" style="margin-top:0.45rem;">
          <div class="form-group">
            <label class="form-label">Consumption Gallons</label>
            <input type="number" step="1" class="form-input" value="${config.gallons}" onchange="setYearGallons(${year}, this.value)" />
          </div>
        </div>
      ` : `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Rate / Gal (PKR)</label>
            <input type="number" step="0.01" class="form-input" value="${config.rate}" onchange="setYearRate(${year}, this.value)" />
          </div>
          <div class="form-group">
            <label class="form-label">Monthly Gallons</label>
            <input type="number" step="1" class="form-input" value="${config.gallons}" onchange="setYearGallons(${year}, this.value)" />
          </div>
        </div>
        <div style="font-size:0.72rem; color:var(--text-dim); margin-top:0.35rem; display:flex; justify-content:space-between; align-items:center;">
          <span>Auto Bill Amount:</span>
          <strong style="color:var(--text-main);">PKR ${formatNumber(currentBill)}</strong>
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
  appState.yearRates[year].rate = parseFloat(val) || 1.25;
  renderPreview();
  renderDataEditor();
  debouncedSaveProjectState();
}

function setYearGallons(year, val) {
  if (!appState.yearRates[year]) appState.yearRates[year] = {};
  appState.yearRates[year].gallons = parseInt(val, 10) || 50000;
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
                     ${isManual ? '' : 'readonly'}
                     onchange="updateRowManualBillAmount('${inv.ym}', this.value)" 
                     title="${isManual ? 'Manual Bill Amount active (custom override)' : 'Auto-calculated: Gallons × Rate (Turn toggle on to set manually)'}" 
                     style="width:95px; font-weight:600; ${isManual ? 'border-color:var(--accent-green); color:var(--accent-green);' : 'opacity:0.8; background:var(--bg-app); cursor:not-allowed;'}" />
              <label class="switch switch-sm" title="Toggle manual bill amount ON/OFF for ${inv.monthName} ${inv.year}">
                <input type="checkbox" ${isManual ? 'checked' : ''} onchange="toggleRowManualBill('${inv.ym}', this.checked)" />
                <span class="slider"></span>
              </label>
            </div>
          </td>`;
      } else if (col.id === 'totalPayable') {
        const val = (inv.customValues && inv.customValues.totalPayable !== undefined) ? inv.customValues.totalPayable : inv.totalPayable;
        return `<td><input type="number" value="${val}" onchange="updateCorrection('${inv.ym}', 'totalPayable', this.value)" title="Directly editable Total Payable" style="width:110px; font-weight:700; color:var(--accent-green);" /></td>`;
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
    showToast(`Manual bill amount enabled for ${ym}. You can now edit the amount directly.`, "info");
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
  appState.manualCorrections[ym].manualBillAmountEnabled = true;
  appState.manualCorrections[ym].billAmount = parseFloat(val) || 0;
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
  if (!appState.manualCorrections[ym]) {
    appState.manualCorrections[ym] = {};
  }
  appState.manualCorrections[ym][field] = val;
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
  const prefixInput = document.getElementById("editorSeqPrefix");
  const startNumInput = document.getElementById("editorSeqStartNum");
  const suffixInput = document.getElementById("editorSeqSuffix");
  const autoYearToggle = document.getElementById("editorSeqAutoYear");

  const prefix = prefixInput ? prefixInput.value : appState.invPrefix;
  const startNum = startNumInput ? parseInt(startNumInput.value, 10) || 1 : appState.invStartNum;
  const suffix = suffixInput ? suffixInput.value : appState.invSuffix;
  const autoYear = autoYearToggle ? autoYearToggle.checked : appState.autoSuffixYear;

  appState.invPrefix = prefix;
  appState.invStartNum = startNum;
  appState.invSuffix = suffix;
  appState.autoSuffixYear = autoYear;

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
  showToast(`Applied sequence starting from ${prefix}${startNum}${suffix} to all invoices!`, "success");
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
async function exportToWord() {
  const btn = document.getElementById("exportDocxBtn");
  const originalText = btn.innerHTML;
  btn.innerHTML = "Generating Word Doc...";
  btn.disabled = true;

  try {
    const invoices = calculateInvoices();
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
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function exportToPdf() {
  const btn = document.getElementById("exportPdfBtn");
  const originalText = btn.innerHTML;
  btn.disabled = true;

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

    const pdf = new JsPdfConstructor({
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
      compress: true
    });

    // Create an isolated single-page off-screen staging container
    const stage = document.createElement("div");
    stage.style.position = "fixed";
    stage.style.left = "-9999px";
    stage.style.top = "0";
    stage.style.width = "210mm";
    stage.style.background = "#ffffff";
    stage.style.color = "#000000";
    stage.style.padding = "0";
    stage.style.margin = "0";
    stage.style.zIndex = "-9999";
    document.body.appendChild(stage);

    showToast(`Generating PDF (${invoices.length} pages)...`, "info");

    for (let i = 0; i < invoices.length; i++) {
      btn.innerHTML = `PDF (${i + 1}/${invoices.length})...`;
      const inv = invoices[i];
      stage.innerHTML = renderInvoiceSheet(inv);
      const sheet = stage.querySelector(".invoice-sheet");

      // Render exactly one A4 page to canvas at 2x crisp resolution
      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: 1000
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.96);

      if (i > 0) {
        pdf.addPage("a4", "portrait");
      }
      pdf.addImage(imgData, "JPEG", 0, 0, 210, 297, undefined, "FAST");
    }

    document.body.removeChild(stage);

    const safeOccupier = (appState.occupier || "Invoices").replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `Water_Invoices_${safeOccupier}.pdf`;
    pdf.save(filename);
    showToast(`Exported all ${invoices.length} invoices to PDF successfully!`, "success");
  } catch (err) {
    console.error("PDF export error:", err);
    showToast("Could not export PDF: " + err.message, "error");
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
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
  appState.manualCorrections = {};
  if (preset.rates["2025"]?.overrides) {
    Object.entries(preset.rates["2025"].overrides).forEach(([ym, gal]) => {
      appState.manualCorrections[ym] = { gallons: gal };
    });
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
  document.getElementById("invPrefixInput").value = appState.invPrefix;
  document.getElementById("invStartNumInput").value = appState.invStartNum;
  document.getElementById("invSuffixInput").value = appState.invSuffix;
  const autoSuffixToggle = document.getElementById("autoSuffixYearToggle");
  if (autoSuffixToggle) autoSuffixToggle.checked = !!appState.autoSuffixYear;
  document.getElementById("prevBalanceToggle").checked = appState.includePrevBalance;
  document.getElementById("prevBalanceOptions").style.display = appState.includePrevBalance ? "block" : "none";

  // Also sync Editor Sequence Bar inputs
  const edPrefix = document.getElementById("editorSeqPrefix");
  const edStart = document.getElementById("editorSeqStartNum");
  const edSuffix = document.getElementById("editorSeqSuffix");
  const edAutoYear = document.getElementById("editorSeqAutoYear");
  if (edPrefix) edPrefix.value = appState.invPrefix;
  if (edStart) edStart.value = appState.invStartNum;
  if (edSuffix) edSuffix.value = appState.invSuffix;
  if (edAutoYear) edAutoYear.checked = !!appState.autoSuffixYear;

  const [sY] = appState.startMonth.split("-").map(Number);
  const [eY] = appState.endMonth.split("-").map(Number);
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

  // 3. Clear console periodically
  setInterval(() => {
    try {
      console.clear();
    } catch (err) {}
  }, 2000);
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
// Route Isolation & View Initialization (/kernelx vs /)
// ==========================================================
function checkRouteMode() {
  const isKernelxRoute = window.location.pathname.startsWith('/kernelx');

  if (isKernelxRoute) {
    // Dedicated KernelX Master Mode
    document.getElementById("loginScreen")?.remove();
    document.querySelector(".app-header")?.style.setProperty("display", "none", "important");
    document.querySelector(".app-container")?.style.setProperty("display", "none", "important");

    const kernelxApp = document.getElementById("kernelxApp");
    if (kernelxApp) kernelxApp.style.display = "block";
    document.title = "KernelX - User Directory & Access Control";
    initKernelx();
    return true;
  }

  // Standard Root Invoice Mode
  switchTab("preview");
  return false;
}

// Setup Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("preset-falaknaz")?.addEventListener("click", () => applyPreset("falaknaz"));
  document.getElementById("preset-mega")?.addEventListener("click", () => applyPreset("mega"));

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

  document.getElementById("invPrefixInput").addEventListener("input", (e) => {
    appState.invPrefix = e.target.value;
    const edInput = document.getElementById("editorSeqPrefix");
    if (edInput) edInput.value = e.target.value;
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
  });
  document.getElementById("invStartNumInput").addEventListener("input", (e) => {
    appState.invStartNum = parseInt(e.target.value, 10) || 1;
    const edInput = document.getElementById("editorSeqStartNum");
    if (edInput) edInput.value = e.target.value;
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
  });
  document.getElementById("invSuffixInput").addEventListener("input", (e) => {
    appState.invSuffix = e.target.value;
    const edInput = document.getElementById("editorSeqSuffix");
    if (edInput) edInput.value = e.target.value;
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

  // Table Editor Sequence Bar Inputs & Apply Button
  document.getElementById("editorSeqPrefix")?.addEventListener("input", (e) => {
    appState.invPrefix = e.target.value;
    const sbInput = document.getElementById("invPrefixInput");
    if (sbInput) sbInput.value = e.target.value;
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
  document.getElementById("editorSeqSuffix")?.addEventListener("input", (e) => {
    appState.invSuffix = e.target.value;
    const sbInput = document.getElementById("invSuffixInput");
    if (sbInput) sbInput.value = e.target.value;
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
  });
  document.getElementById("editorSeqAutoYear")?.addEventListener("change", (e) => {
    appState.autoSuffixYear = e.target.checked;
    const sbToggle = document.getElementById("autoSuffixYearToggle");
    if (sbToggle) sbToggle.checked = e.target.checked;
    renderPreview();
    renderDataEditor();
    debouncedSaveProjectState();
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
    document.getElementById("prevBalanceOptions").style.display = e.target.checked ? "block" : "none";
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

  // Route check for /kernelx vs root /
  const isKernelx = checkRouteMode();
  if (isKernelx) {
    return;
  }

  // Initialize Session Authentication for standard application
  checkAuthSession().then(async (isAuth) => {
    if (isAuth) {
      await loadProjectStateFromDatabase();
    }
  });
});
