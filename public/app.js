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

function clearAuthSession() {
  sessionStorage.removeItem('mega_mall_auth_token');
  sessionStorage.removeItem('mega_mall_auth_user');
  authUser = null;
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
    showLoginPortal("Your corporate session has expired. Please sign in again.");
    throw new Error("Unauthorized - session expired");
  }
  return response;
}

function showLoginPortal(errorMessage = "") {
  const overlay = document.getElementById("loginScreen");
  const errEl = document.getElementById("loginErrorAlert");
  const adminBtn = document.getElementById("adminPanelBtn");
  if (adminBtn) adminBtn.style.display = "none";
  if (overlay) overlay.classList.remove("hidden");
  if (errEl) {
    if (errorMessage) {
      errEl.textContent = errorMessage;
      errEl.style.display = "block";
    } else {
      errEl.style.display = "none";
    }
  }
}

function updateAdminButtonVisibility() {
  const adminBtn = document.getElementById("adminPanelBtn");
  if (adminBtn) {
    adminBtn.style.display = (authUser && authUser.role === "Administrator") ? "inline-flex" : "none";
  }
}

function hideLoginPortal() {
  const overlay = document.getElementById("loginScreen");
  if (overlay) overlay.classList.add("hidden");
  updateAdminButtonVisibility();
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

    if (!res.ok) {
      throw new Error(data.error || "Authentication failed.");
    }

    setAuthSession(data.token, data.user);
    hideLoginPortal();
    passEl.value = "";
    showToast(`Welcome, ${data.user.username}!`, "success");

    // Load protected data now that authenticated
    loadShopsData();
    renderPreview();
    renderDataEditor();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  } finally {
    submitBtn.disabled = false;
    submitText.textContent = "Sign In to Corporate Workspace";
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
  includePrevBalance: false,
  prevBalanceMode: "zero",
  openingBalance: 0,
  yearRates: {
    "2024": { rate: 1.25, gallons: 53759 },
    "2025": { rate: 1.25, gallons: 137788, overrides: { "2025-12": 99725 } },
    "2026": { rate: 1.25, gallons: 137788 }
  },
  manualCorrections: {},
  currentPageIndex: 0,
  viewAllPages: false,
  activeTab: "preview"
};

// Date Strings and Calendar Math
const MONTH_NAMES_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

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
    let invNum = `${appState.invPrefix}${appState.invStartNum + index}${appState.invSuffix}`;

    let previous = 0;
    if (appState.includePrevBalance) {
      if (appState.prevBalanceMode === "cumulative") {
        previous = runningPrevious;
      } else {
        previous = index === 0 ? appState.openingBalance : 0;
      }
    }

    let billingPeriod = `${m.fullMonthName} ${m.year} (1 ${m.fullMonthName} ${m.year} to ${m.daysInMonth} ${m.fullMonthName} ${m.year}).`;
    let issueDate = `${getOrdinal(m.daysInMonth)} ${m.fullMonthName} ${m.year}`;

    // Apply manual corrections if present
    const custom = appState.manualCorrections[m.ym];
    if (custom) {
      if (custom.invoiceNumber !== undefined) invNum = custom.invoiceNumber;
      if (custom.billingPeriod !== undefined) billingPeriod = custom.billingPeriod;
      if (custom.issueDate !== undefined) issueDate = custom.issueDate;
      if (custom.gallons !== undefined) gallons = Number(custom.gallons);
      if (custom.rate !== undefined) rate = Number(custom.rate);
      if (custom.previous !== undefined) previous = Number(custom.previous);
    }

    const billAmount = Math.round(gallons * rate);
    const totalPayable = billAmount + previous;

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
      billingPeriod,
      issueDate,
      gallons,
      rate,
      billAmount,
      previous,
      totalPayable
    };
  });
}

// Render a single invoice sheet with exact template layout & guaranteed visible grids
function renderInvoiceSheet(inv) {
  return `
    <div class="invoice-sheet" id="invoice-page-${inv.index}">
      <!-- Header -->
      <div class="inv-header">
        <div class="inv-logo-left">
          <img src="assets/mega-mall-logo.png" alt="THE MEGA MALL" style="width:128px; height:106px; object-fit:contain; display:block;" />
        </div>
        <div class="inv-title-center">
          <h1>THE MEGA MALL</h1>
          <p>Official Billing Invoice / Reimburstment Note</p>
        </div>
        <div class="inv-logo-right">
          <img src="assets/kampus-logo.png" alt="KAMPUS Integrated Services" style="width:70px; height:108px; object-fit:contain; display:block;" />
        </div>
      </div>

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
      <table class="inv-table" style="width:100% !important; border-collapse:collapse !important; border:1px solid #d0d5dd !important; margin-bottom:2.2rem; background:#ffffff !important;">
        <thead>
          <tr style="background-color:#fafbfc !important;">
            <th style="border:1px solid #d0d5dd !important; padding:8px 6px !important; font-size:10.5px !important; font-weight:600 !important; text-align:center !important; color:#555555 !important;">CONSUMPTION GALLON</th>
            <th style="border:1px solid #d0d5dd !important; padding:8px 6px !important; font-size:10.5px !important; font-weight:600 !important; text-align:center !important; color:#555555 !important;">RATE PER<br>GALLON</th>
            <th style="border:1px solid #d0d5dd !important; padding:8px 6px !important; font-size:10.5px !important; font-weight:600 !important; text-align:center !important; color:#555555 !important;">BILL<br>AMOUNT</th>
            <th style="border:1px solid #d0d5dd !important; padding:8px 6px !important; font-size:10.5px !important; font-weight:600 !important; text-align:center !important; color:#555555 !important;">PREVIOUS</th>
            <th style="border:1px solid #d0d5dd !important; padding:8px 6px !important; font-size:10.5px !important; font-weight:600 !important; text-align:center !important; color:#555555 !important;">TOTAL PAYABLE</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background-color:#ffffff !important;">
            <td style="border:1px solid #d0d5dd !important; padding:9px 6px !important; font-size:14px !important; font-weight:400 !important; text-align:center !important; color:#000000 !important;">${formatNumber(inv.gallons)}</td>
            <td style="border:1px solid #d0d5dd !important; padding:9px 6px !important; font-size:14px !important; font-weight:400 !important; text-align:center !important; color:#000000 !important;">${Number(inv.rate).toFixed(2)}</td>
            <td style="border:1px solid #d0d5dd !important; padding:9px 6px !important; font-size:14px !important; font-weight:400 !important; text-align:center !important; color:#000000 !important;">${formatNumber(inv.billAmount)}/-</td>
            <td style="border:1px solid #d0d5dd !important; padding:9px 6px !important; font-size:14px !important; font-weight:400 !important; text-align:center !important; color:#000000 !important;">${inv.previous === 0 ? "0" : formatNumber(inv.previous) + "/-"}</td>
            <td style="border:1px solid #d0d5dd !important; padding:9px 6px !important; font-size:14px !important; font-weight:400 !important; text-align:center !important; color:#000000 !important;">${formatNumber(inv.totalPayable)}/-</td>
          </tr>
        </tbody>
      </table>

      <!-- Bullet Notices -->
      <div class="inv-notices">
        <ul>
          <li>*Please make payment in favour of Kampus Integrated Services NTN: C951537 Account No: 10380109491064 in Meezan Bank.</li>
          <li>*If the payment is not received till the last payment date, <strong style="font-weight:700;">"The Mega Mall"</strong> will hold the services of your lincensed area and will not held responsible for any losses Whats so ever there for.</li>
        </ul>
      </div>

      <!-- Signoff -->
      <div class="inv-signoff">
        <div class="dept" style="font-weight:700;">Account Department</div>
        <div class="date" style="font-weight:700;">Date : ${inv.issueDate}</div>
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

    const card = document.createElement("div");
    card.className = "year-config-item";
    card.innerHTML = `
      <div class="year-config-header">
        <span class="year-badge">Year ${year}</span>
        <span style="font-size:0.75rem; color:var(--text-dim);">${months.filter(m => m.year === year).length} Months</span>
      </div>
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
    `;
    container.appendChild(card);
  });
}

function setYearRate(year, val) {
  if (!appState.yearRates[year]) appState.yearRates[year] = {};
  appState.yearRates[year].rate = parseFloat(val) || 1.25;
  renderPreview();
  renderDataEditor();
}

function setYearGallons(year, val) {
  if (!appState.yearRates[year]) appState.yearRates[year] = {};
  appState.yearRates[year].gallons = parseInt(val, 10) || 50000;
  renderPreview();
  renderDataEditor();
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
  const tbody = document.getElementById("editorTableBody");
  tbody.innerHTML = "";

  invoices.forEach(inv => {
    const tr = document.createElement("tr");
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
      <td>
        <input type="number" value="${inv.gallons}" onchange="updateCorrection('${inv.ym}', 'gallons', this.value)" style="width:105px;" />
      </td>
      <td>
        <input type="number" step="0.01" value="${inv.rate}" onchange="updateCorrection('${inv.ym}', 'rate', this.value)" style="width:75px;" />
      </td>
      <td>
        <input type="number" value="${inv.previous}" onchange="updateCorrection('${inv.ym}', 'previous', this.value)" style="width:90px;" />
      </td>
      <td style="font-weight:600; color:var(--text-main); white-space:nowrap;">
        ${formatNumber(inv.billAmount)}/-
      </td>
      <td style="font-weight:700; color:var(--accent-green); white-space:nowrap;">
        ${formatNumber(inv.totalPayable)}/-
      </td>
      <td style="white-space:nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="jumpToPageAndPreview(${inv.index})">Preview</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateCorrection(ym, field, val) {
  if (!appState.manualCorrections[ym]) {
    appState.manualCorrections[ym] = {};
  }
  appState.manualCorrections[ym][field] = val;
  renderPreview();
  renderDataEditor();
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
    showToast("All manual overrides restored to default calculations", "success");
  });
}

// Switch Tabs
function switchTab(tab) {
  appState.activeTab = tab;
  const isPreview = tab === "preview";
  const isEditor = tab === "editor";
  const isShops = tab === "shops";

  document.getElementById("tabInvoicePreview").classList.toggle("active", isPreview);
  document.getElementById("tabDataEditor").classList.toggle("active", isEditor);
  document.getElementById("tabShopIdentifier").classList.toggle("active", isShops);

  document.getElementById("mainContainer").style.display = isPreview ? "flex" : "none";
  document.getElementById("dataEditorSection").classList.toggle("active", isEditor);
  document.getElementById("shopIdentifierSection").classList.toggle("active", isShops);

  const toggleBtn = document.getElementById("togglePreviewBtn");
  if (toggleBtn) {
    toggleBtn.style.display = isPreview ? "inline-flex" : "none";
  }

  const headerXlsxBtn = document.getElementById("exportShopsXlsxHeaderBtn");
  if (headerXlsxBtn) {
    headerXlsxBtn.style.display = isShops ? "inline-flex" : "none";
  }

  if (isShops) {
    renderShopsDirectory();
  } else if (isEditor) {
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

  // If raw text is provided
  if (rawText && !stagedFileData) {
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
    showToast(`Imported corrections for ${count} months from text`, "success");
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
      if (data.occupier) appState.occupier = data.occupier;
      if (data.location) appState.location = data.location;
      if (data.ntn) appState.ntn = data.ntn;

      // Extract min and max months from invoices if available
      data.invoices.forEach(inv => {
        // Match month and year from billingPeriod or issueDate
        const match = (inv.billingPeriod || inv.issueDate || '').match(/(Jan|Feb|March|April|May|June|July|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
        if (match) {
          const mName = match[1].toLowerCase();
          const year = match[2];
          const mIdx = MONTH_NAMES_SHORT.findIndex(s => s.toLowerCase() === mName.slice(0, 3));
          if (mIdx >= 0) {
            const ym = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
            if (!appState.manualCorrections[ym]) appState.manualCorrections[ym] = {};
            if (inv.invoiceNumber) appState.manualCorrections[ym].invoiceNumber = inv.invoiceNumber;
            if (inv.billingPeriod) appState.manualCorrections[ym].billingPeriod = inv.billingPeriod;
            if (inv.issueDate) appState.manualCorrections[ym].issueDate = inv.issueDate;
            if (inv.gallons) appState.manualCorrections[ym].gallons = inv.gallons;
            if (inv.rate) appState.manualCorrections[ym].rate = inv.rate;
            if (inv.previous !== undefined) appState.manualCorrections[ym].previous = inv.previous;
          }
        }
      });

      closeImportModal();
      syncInputsWithState();
      updateYearConfigsUI();
      renderPreview();
      renderDataEditor();
      showToast(`Successfully imported ${data.invoices.length} invoices from ${stagedFileData.filename}`, "success");
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
      if (isStart) {
        appState.startMonth = ym;
        document.getElementById("startMonthInput").value = ym;
      } else {
        appState.endMonth = ym;
        document.getElementById("endMonthInput").value = ym;
      }
      document.getElementById(`${type}CalPopover`).classList.remove("open");
      updateYearConfigsUI();
      renderPreview();
      renderDataEditor();
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
  document.getElementById("prevBalanceToggle").checked = appState.includePrevBalance;
  document.getElementById("prevBalanceOptions").style.display = appState.includePrevBalance ? "block" : "none";

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

  // Restore saved width
  const savedWidth = localStorage.getItem('mega_mall_sidebar_width');
  if (savedWidth && parseInt(savedWidth, 10) >= 280) {
    sidebar.style.width = `${parseInt(savedWidth, 10)}px`;
  }

  // Restore preview toggle state
  if (isPreviewHidden) {
    applyPreviewToggle(true, false);
  }

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener("mousedown", (e) => {
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

    // Constrain width between 290px and window width minus 320px
    const minW = 290;
    const maxW = Math.max(window.innerWidth - 320, 360);
    newWidth = Math.max(minW, Math.min(newWidth, maxW));

    sidebar.style.width = `${newWidth}px`;
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      handle.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const currentWidth = Math.round(sidebar.getBoundingClientRect().width);
      localStorage.setItem('mega_mall_sidebar_width', currentWidth);
    }
  });

  // Double click reset to default 440px
  handle.addEventListener("dblclick", () => {
    sidebar.style.width = "440px";
    localStorage.setItem('mega_mall_sidebar_width', 440);
    showToast("Sidebar width reset to default (440px)", "info");
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
// Shop Identifier & Mall Directory Module
// ==========================================================
let shopsList = [];
let shopFilter = {
  floor: 'ALL',
  search: '',
  viewMode: localStorage.getItem('mega_mall_shop_view_mode') || 'table'
};

async function loadShopsData() {
  try {
    let loaded = null;
    try {
      const res = await authFetch('/api/shops');
      if (res.ok) {
        loaded = await res.json();
      }
    } catch (e) {
      console.warn("Could not fetch /api/shops", e);
    }

    if (Array.isArray(loaded) && loaded.length > 0) {
      shopsList = loaded;
      // Merge any local additions / edits stored in localStorage
      const localCustom = localStorage.getItem('mega_mall_custom_shops');
      if (localCustom) {
        try {
          const parsedLocal = JSON.parse(localCustom);
          if (Array.isArray(parsedLocal)) {
            parsedLocal.forEach(cs => {
              const idx = shopsList.findIndex(s => s.canonical_key === cs.canonical_key);
              if (idx >= 0) {
                shopsList[idx] = cs;
              } else {
                shopsList.unshift(cs);
              }
            });
          }
        } catch (le) {
          console.error("Error merging local custom shops:", le);
        }
      }
    }
  } catch (err) {
    console.error("Failed to load shops:", err);
  }
  updateShopPillsCount();
  renderShopsDirectory();
}

function normalizeShopInput(s) {
  if (!s) return "";
  s = s.trim().toUpperCase();
  // Match prefix UG, G, KIOSK followed by optional spaces/dashes/zeros and numbers/suffixes
  const m = s.match(/^(UG|G|KIOSK)[\s\-_0]*(\d+)([A-Z]?)$/i);
  if (m) {
    const prefix = m[1].toUpperCase();
    const num = parseInt(m[2], 10);
    const suffix = m[3] ? m[3].toUpperCase() : "";
    return `${prefix}${num}${suffix}`;
  }
  // Sub-shops like G-1-A or G1A
  const m2 = s.match(/^(UG|G)[\s\-_0]*(\d+)[\s\-_]+([A-Z])$/i);
  if (m2) {
    return `${m2[1].toUpperCase()}${parseInt(m2[2], 10)}${m2[3].toUpperCase()}`;
  }
  return s.replace(/[^A-Z0-9]/g, "");
}

function formatShopNo(s) {
  if (!s) return "";
  s = s.trim();
  const m = s.match(/^(UG|G|KIOSK)[\s\-_0]*(\d+)([A-Z]?)$/i);
  if (m) {
    const prefix = m[1].toUpperCase();
    const num = parseInt(m[2], 10);
    const suffix = m[3] ? m[3].toUpperCase() : "";
    const pad = (num < 10) ? `0${num}` : `${num}`;
    return `${prefix}-${pad}${suffix}`;
  }
  const m2 = s.match(/^(UG|G)[\s\-_0]*(\d+)[\s\-_]+([A-Z])$/i);
  if (m2) {
    const prefix = m2[1].toUpperCase();
    const num = parseInt(m2[2], 10);
    const pad = (num < 10) ? `0${num}` : `${num}`;
    return `${prefix}-${pad}-${m2[3].toUpperCase()}`;
  }
  return s;
}

function filterShops() {
  const query = (shopFilter.search || "").trim();
  const normQuery = normalizeShopInput(query);
  const floor = shopFilter.floor;

  let filtered = shopsList.filter(shop => {
    // Floor filter
    if (floor !== 'ALL') {
      if (floor === 'Kiosk') {
        const isKiosk = (shop.floor && shop.floor.toLowerCase().includes('kiosk')) ||
                        (shop.shop_no && shop.shop_no.toLowerCase().includes('kiosk')) ||
                        (shop.canonical_key && shop.canonical_key.toLowerCase().includes('kiosk'));
        if (!isKiosk) return false;
      } else if (shop.floor !== floor) {
        return false;
      }
    }

    if (!query) return true;

    // Exact canonical match
    if (normQuery && shop.canonical_key === normQuery) {
      return true;
    }

    const qLower = query.toLowerCase();
    const shopNoLower = (shop.shop_no || "").toLowerCase();
    const brandLower = (shop.brand || "").toLowerCase();
    const allotteeLower = (shop.allottee || "").toLowerCase();
    const floorLower = (shop.floor || "").toLowerCase();

    if (shopNoLower.includes(qLower) || brandLower.includes(qLower) || allotteeLower.includes(qLower) || floorLower.includes(qLower)) {
      return true;
    }

    // Check history entries
    if (Array.isArray(shop.history)) {
      for (const h of shop.history) {
        if ((h.brand && String(h.brand).toLowerCase().includes(qLower)) ||
            (h.allottee && String(h.allottee).toLowerCase().includes(qLower)) ||
            (h.period && String(h.period).toLowerCase().includes(qLower))) {
          return true;
        }
      }
    }

    return false;
  });

  // If there's an exact canonical key match, prioritize it to the top!
  let exactMatch = null;
  if (normQuery) {
    const exactIdx = filtered.findIndex(s => s.canonical_key === normQuery);
    if (exactIdx >= 0) {
      exactMatch = filtered[exactIdx];
      filtered.splice(exactIdx, 1);
      filtered.unshift(exactMatch);
    } else {
      exactMatch = shopsList.find(s => s.canonical_key === normQuery);
      if (exactMatch && !filtered.includes(exactMatch)) {
        filtered.unshift(exactMatch);
      }
    }
  }

  // Smart Match detection banner
  const banner = document.getElementById("shopSmartMatchBar");
  if (banner) {
    if (exactMatch) {
      const histCount = Array.isArray(exactMatch.history) ? exactMatch.history.length : 0;
      const histBadge = histCount > 0
        ? `<span style="background:var(--accent-amber-bg); border:1px solid rgba(234,179,8,0.3); color:var(--accent-amber); padding:0.15rem 0.45rem; border-radius:4px; font-size:0.72rem; font-weight:600;">${histCount} Timeline Periods</span>`
        : "";
      banner.style.display = "flex";
      banner.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
          <span class="smart-match-badge">Exact Shop Match</span>
          <span style="font-weight:700; color:#fff; font-size:0.95rem;">${escapeHtml(exactMatch.shop_no)}</span>
          <span style="color:var(--text-muted);">&bull;</span>
          <span style="color:#ffffff;">Brand: <strong style="color:var(--accent-green);">${escapeHtml(exactMatch.brand || 'Vacant / Unassigned')}</strong></span>
          <span style="color:var(--text-muted);">&bull;</span>
          <span>Allottee: <strong style="color:#ffffff;">${escapeHtml(exactMatch.allottee || 'N/A')}</strong></span>
          <span style="color:var(--text-muted);">&bull;</span>
          <span>Area: <strong style="color:#ffffff;">${exactMatch.sqft ? exactMatch.sqft + ' Sqft' : '—'}</strong></span>
          ${histBadge}
        </div>
        <div style="display:flex; gap:0.4rem;">
          <button class="btn btn-secondary btn-sm" onclick="openAddPeriodModal('${exactMatch.canonical_key}')">+ Add Period</button>
          <button class="btn btn-green btn-sm" onclick="openEditShopModal('${exactMatch.canonical_key}')">Edit Details</button>
        </div>
      `;
    } else if (query && filtered.length === 0) {
      const suggestion = findClosestShop(query);
      if (suggestion) {
        banner.style.display = "flex";
        banner.innerHTML = `
          <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px; height:16px; color:var(--accent-amber);"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>No exact shop for "${escapeHtml(query)}". Did you mean <strong style="color:#ffffff; cursor:pointer; text-decoration:underline;" onclick="applyFuzzySuggestion('${suggestion.shop_no}')">${escapeHtml(suggestion.shop_no)}</strong> (${escapeHtml(suggestion.brand || 'Vacant')}, ${escapeHtml(suggestion.floor)})?</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="applyFuzzySuggestion('${suggestion.shop_no}')">Show ${escapeHtml(suggestion.shop_no)}</button>
        `;
      } else {
        banner.style.display = "none";
      }
    } else {
      banner.style.display = "none";
    }
  }

  return filtered;
}

function findClosestShop(q) {
  const norm = normalizeShopInput(q);
  if (!norm) return null;
  return shopsList.find(s => s.canonical_key.startsWith(norm) || norm.startsWith(s.canonical_key)) || null;
}

function applyFuzzySuggestion(shopNo) {
  const input = document.getElementById("shopSearchInput");
  if (input) {
    input.value = shopNo;
    shopFilter.search = shopNo;
    renderShopsDirectory();
  }
}

function updateShopPillsCount() {
  const cAll = shopsList.length;
  const cUG = shopsList.filter(s => s.floor === 'Upper Ground').length;
  const cG = shopsList.filter(s => s.floor === 'Ground Floor').length;
  const cP1 = shopsList.filter(s => s.floor && s.floor.toLowerCase().includes('phase 1')).length;
  const cP2 = shopsList.filter(s => s.floor && s.floor.toLowerCase().includes('phase 2')).length;
  const cKiosk = shopsList.filter(s =>
    (s.floor && s.floor.toLowerCase().includes('kiosk')) ||
    (s.shop_no && s.shop_no.toLowerCase().includes('kiosk')) ||
    (s.canonical_key && s.canonical_key.toLowerCase().includes('kiosk'))
  ).length;

  document.getElementById("countAll").textContent = cAll;
  document.getElementById("countUG").textContent = cUG;
  document.getElementById("countG").textContent = cG;
  document.getElementById("countP1").textContent = cP1;
  document.getElementById("countP2").textContent = cP2;
  document.getElementById("countKiosk").textContent = cKiosk;
}

function renderShopsDirectory() {
  const filtered = filterShops();

  document.getElementById("statShowingCount").textContent = `${filtered.length} of ${shopsList.length}`;
  const totalSqft = filtered.reduce((acc, s) => {
    const num = parseFloat(s.sqft);
    return !isNaN(num) ? acc + num : acc;
  }, 0);
  document.getElementById("statTotalSqft").textContent = totalSqft > 0 ? `${formatNumber(totalSqft)} Sqft` : '—';

  const clearBtn = document.getElementById("shopSearchClearBtn");
  if (clearBtn) {
    clearBtn.style.display = shopFilter.search ? "block" : "none";
  }

  const isTable = shopFilter.viewMode === 'table';
  document.getElementById("shopTableWrapper").style.display = isTable ? "block" : "none";
  document.getElementById("shopGridWrapper").style.display = !isTable ? "grid" : "none";
  document.getElementById("viewModeTableBtn").classList.toggle("active", isTable);
  document.getElementById("viewModeGridBtn").classList.toggle("active", !isTable);

  const emptyState = document.getElementById("shopEmptyState");
  if (filtered.length === 0) {
    emptyState.style.display = "block";
    return;
  } else {
    emptyState.style.display = "none";
  }

  if (isTable) {
    renderShopsTable(filtered);
  } else {
    renderShopsGrid(filtered);
  }
}

function renderShopsTable(shops) {
  const tbody = document.getElementById("shopTableBody");
  tbody.innerHTML = "";

  shops.forEach(shop => {
    const tr = document.createElement("tr");

    // Format timeline pills
    let historyHtml = '';
    if (Array.isArray(shop.history) && shop.history.length > 0) {
      historyHtml = shop.history.map(h => `
        <span class="timeline-pill" title="Period: ${escapeHtml(h.period || '')} | Brand: ${escapeHtml(h.brand || '')} | Allottee: ${escapeHtml(h.allottee || '')}">
          <span class="timeline-pill-year">${escapeHtml(h.period || '')}</span>
          <span class="timeline-pill-brand">${escapeHtml(h.brand || h.allottee || 'Tenure')}</span>
        </span>
      `).join('');
    } else {
      historyHtml = `<span style="color:var(--text-dim); font-size:0.73rem;">Current only</span>`;
    }
    historyHtml += ` <button class="timeline-add-mini-btn" onclick="openAddPeriodModal('${shop.canonical_key}')" title="Add historical tenure period">+ Period</button>`;

    const brandDisplay = shop.brand
      ? `<span style="font-weight:600; color:var(--text-main);">${escapeHtml(shop.brand)}</span>`
      : `<span style="color:var(--text-dim); font-style:italic;">Vacant / Available</span>`;

    const allotteeDisplay = shop.allottee
      ? `<span style="color:var(--text-muted);">${escapeHtml(shop.allottee)}</span>`
      : `<span style="color:var(--text-dim);">—</span>`;

    const sqftDisplay = shop.sqft ? `${shop.sqft} Sqft` : `<span style="color:var(--text-dim);">—</span>`;

    tr.innerHTML = `
      <td>
        <span style="font-size:0.86rem; color:#ffffff; font-weight:700;">${escapeHtml(shop.shop_no)}</span>
      </td>
      <td>
        <span style="font-size:0.75rem; color:var(--text-muted); background:rgba(255,255,255,0.04); padding:0.15rem 0.4rem; border-radius:4px;">${escapeHtml(shop.floor)}</span>
      </td>
      <td>${brandDisplay}</td>
      <td>${allotteeDisplay}</td>
      <td style="text-align:right; font-weight:600; color:var(--text-main);">${sqftDisplay}</td>
      <td>
        <div class="timeline-pills-cell">${historyHtml}</div>
      </td>
      <td style="text-align:center; white-space:nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="openEditShopModal('${shop.canonical_key}')" style="padding:0.25rem 0.55rem; font-size:0.74rem;">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:12px; height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
          Edit
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderShopsGrid(shops) {
  const container = document.getElementById("shopGridWrapper");
  container.innerHTML = "";

  shops.forEach(shop => {
    const card = document.createElement("div");
    card.className = "shop-card";

    let historyHtml = '';
    if (Array.isArray(shop.history) && shop.history.length > 0) {
      historyHtml = shop.history.map(h => `
        <span class="timeline-pill" title="Period: ${escapeHtml(h.period || '')} | Brand: ${escapeHtml(h.brand || '')} | Allottee: ${escapeHtml(h.allottee || '')}">
          <span class="timeline-pill-year">${escapeHtml(h.period || '')}</span>
          <span class="timeline-pill-brand">${escapeHtml(h.brand || h.allottee || 'Tenure')}</span>
        </span>
      `).join('');
    } else {
      historyHtml = `<span style="color:var(--text-dim); font-size:0.73rem;">No past recorded tenures</span>`;
    }

    const brandDisplay = shop.brand ? escapeHtml(shop.brand) : 'Vacant / Unassigned';
    const allotteeDisplay = shop.allottee ? escapeHtml(shop.allottee) : 'No Allottee Assigned';
    const sqftDisplay = shop.sqft ? `${shop.sqft} Sqft` : '—';

    card.innerHTML = `
      <div class="shop-card-header">
        <span class="shop-card-number">${escapeHtml(shop.shop_no)}</span>
        <span class="shop-card-floor">${escapeHtml(shop.floor)}</span>
      </div>

      <div>
        <div class="shop-card-brand-title">${brandDisplay}</div>
        <div class="shop-card-allottee">${allotteeDisplay}</div>
      </div>

      <div class="shop-card-metrics">
        <div class="shop-card-metric-item">
          <span class="shop-card-metric-label">Area</span>
          <span class="shop-card-metric-val">${sqftDisplay}</span>
        </div>
      </div>

      <div class="shop-card-timeline-block">
        <div class="shop-card-timeline-title">
          <span>Tenure History &amp; Timeline</span>
          <button class="timeline-add-mini-btn" onclick="openAddPeriodModal('${shop.canonical_key}')">+ Add Period</button>
        </div>
        <div class="timeline-pills-cell" style="margin-top:0.35rem;">
          ${historyHtml}
        </div>
      </div>

      <div class="shop-card-footer">
        <button class="btn btn-secondary btn-sm" onclick="openEditShopModal('${shop.canonical_key}')" style="width:100%; justify-content:center;">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:13px; height:13px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
          Edit Shop Details
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function setShopViewMode(mode) {
  shopFilter.viewMode = mode;
  localStorage.setItem('mega_mall_shop_view_mode', mode);
  renderShopsDirectory();
}

// Modal Handlers: Add / Edit Shop
function openAddShopModal() {
  document.getElementById("shopModalTitle").textContent = "Add New Shop";
  document.getElementById("editShopOriginalKey").value = "";
  document.getElementById("shopModalNo").value = "";
  document.getElementById("shopModalNo").readOnly = false;
  document.getElementById("shopModalFloor").value = "Upper Ground";
  document.getElementById("shopModalBrand").value = "";
  document.getElementById("shopModalAllottee").value = "";
  document.getElementById("shopModalSqft").value = "";
  document.getElementById("shopModalHistoryList").innerHTML = "";

  const backdrop = document.getElementById("shopModalBackdrop");
  if (backdrop) {
    backdrop.classList.add("open");
    backdrop.classList.add("active");
  }
}

function openEditShopModal(canonicalKey) {
  const shop = shopsList.find(s => s.canonical_key === canonicalKey);
  if (!shop) return;

  document.getElementById("shopModalTitle").textContent = `Edit Shop: ${shop.shop_no}`;
  document.getElementById("editShopOriginalKey").value = canonicalKey;
  document.getElementById("shopModalNo").value = shop.shop_no;
  document.getElementById("shopModalNo").readOnly = false;
  document.getElementById("shopModalFloor").value = shop.floor || "Upper Ground";
  document.getElementById("shopModalBrand").value = shop.brand || "";
  document.getElementById("shopModalAllottee").value = shop.allottee || "";
  document.getElementById("shopModalSqft").value = shop.sqft || "";

  const histContainer = document.getElementById("shopModalHistoryList");
  histContainer.innerHTML = "";
  if (Array.isArray(shop.history)) {
    shop.history.forEach(h => addHistoryEditorRow(h.period, h.brand, h.allottee));
  }

  const backdrop = document.getElementById("shopModalBackdrop");
  if (backdrop) {
    backdrop.classList.add("open");
    backdrop.classList.add("active");
  }
}

function closeShopModal() {
  const backdrop = document.getElementById("shopModalBackdrop");
  if (backdrop) {
    backdrop.classList.remove("open");
    backdrop.classList.remove("active");
  }
}

function addHistoryEditorRow(period = '', brand = '', allottee = '') {
  const container = document.getElementById("shopModalHistoryList");
  const row = document.createElement("div");
  row.className = "history-editor-row";
  row.innerHTML = `
    <input type="text" placeholder="Period (e.g. 2024-25)" value="${escapeHtml(period)}" style="width:130px;" class="hist-period" />
    <input type="text" placeholder="Brand Name" value="${escapeHtml(brand)}" style="flex:1;" class="hist-brand" />
    <input type="text" placeholder="Allottee Name" value="${escapeHtml(allottee)}" style="flex:1;" class="hist-allottee" />
    <button type="button" class="history-remove-btn" onclick="this.parentElement.remove()" title="Remove period">&times;</button>
  `;
  container.appendChild(row);
}

async function saveShopModal() {
  const originalKey = document.getElementById("editShopOriginalKey").value;
  const rawNo = document.getElementById("shopModalNo").value.trim();
  if (!rawNo) {
    showToast("Shop Number is required", "error");
    return;
  }

  const formattedNo = formatShopNo(rawNo);
  const canonicalKey = normalizeShopInput(rawNo);
  const floor = document.getElementById("shopModalFloor").value;
  const brand = document.getElementById("shopModalBrand").value.trim();
  const allottee = document.getElementById("shopModalAllottee").value.trim();
  const sqft = document.getElementById("shopModalSqft").value.trim();

  // Collect history
  const history = [];
  const rows = document.querySelectorAll("#shopModalHistoryList .history-editor-row");
  rows.forEach(r => {
    const p = r.querySelector(".hist-period").value.trim();
    const b = r.querySelector(".hist-brand").value.trim();
    const a = r.querySelector(".hist-allottee").value.trim();
    if (p || b || a) {
      history.push({ period: p, brand: b, allottee: a });
    }
  });

  const updatedShop = {
    shop_no: formattedNo,
    canonical_key: canonicalKey,
    floor: floor,
    brand: brand,
    allottee: allottee,
    sqft: sqft ? (parseFloat(sqft) || sqft) : "",
    start_date: "",
    history: history
  };

  if (originalKey) {
    const idx = shopsList.findIndex(s => s.canonical_key === originalKey);
    if (idx >= 0) {
      shopsList[idx] = updatedShop;
    } else {
      shopsList.unshift(updatedShop);
    }
  } else {
    // Check if shop already exists
    const existingIdx = shopsList.findIndex(s => s.canonical_key === canonicalKey);
    if (existingIdx >= 0) {
      shopsList[existingIdx] = updatedShop;
    } else {
      shopsList.unshift(updatedShop);
    }
  }

  // Persist locally
  saveCustomShopsLocally();

  closeShopModal();
  updateShopPillsCount();
  renderShopsDirectory();
  showToast(`Shop ${formattedNo} saved! Syncing with database...`, "info");

  // Sync with secure backend database
  try {
    const res = await authFetch('/api/shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shops: shopsList })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast(`Shop ${formattedNo} saved to secure database!`, "success");
  } catch (e) {
    console.warn("Backend save error:", e);
    showToast(`Saved locally in session (${e.message})`, "warning");
  }
}

function openAddPeriodModal(canonicalKey) {
  const shop = shopsList.find(s => s.canonical_key === canonicalKey);
  if (!shop) return;

  document.getElementById("periodShopKey").value = canonicalKey;
  document.getElementById("periodShopLabel").innerHTML = `Adding tenure entry for <strong>${escapeHtml(shop.shop_no)}</strong> (${escapeHtml(shop.brand || 'Vacant')})`;
  document.getElementById("periodInputYears").value = "";
  document.getElementById("periodInputBrand").value = shop.brand || "";
  document.getElementById("periodInputAllottee").value = shop.allottee || "";
  document.getElementById("periodInputSqft").value = shop.sqft || "";

  const backdrop = document.getElementById("periodModalBackdrop");
  if (backdrop) {
    backdrop.classList.add("open");
    backdrop.classList.add("active");
  }
}

function closePeriodModal() {
  const backdrop = document.getElementById("periodModalBackdrop");
  if (backdrop) {
    backdrop.classList.remove("open");
    backdrop.classList.remove("active");
  }
}

async function savePeriodModal() {
  const key = document.getElementById("periodShopKey").value;
  const shop = shopsList.find(s => s.canonical_key === key);
  if (!shop) return;

  const years = document.getElementById("periodInputYears").value.trim();
  if (!years) {
    showToast("Period / Years (e.g. 2024-25) is required", "error");
    return;
  }

  const brand = document.getElementById("periodInputBrand").value.trim();
  const allottee = document.getElementById("periodInputAllottee").value.trim();
  const sqft = document.getElementById("periodInputSqft").value.trim();

  if (!Array.isArray(shop.history)) {
    shop.history = [];
  }

  shop.history.push({
    period: years,
    brand: brand,
    allottee: allottee,
    sqft: sqft ? (parseFloat(sqft) || sqft) : ""
  });

  saveCustomShopsLocally();

  closePeriodModal();
  renderShopsDirectory();
  showToast(`Tenure period (${years}) added! Syncing...`, "info");

  // Sync with secure backend database
  try {
    const res = await authFetch('/api/shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shops: shopsList })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast(`Tenure period saved to database!`, "success");
  } catch (e) {
    console.warn("Backend save error:", e);
  }
}

function saveCustomShopsLocally() {
  try {
    localStorage.setItem('mega_mall_custom_shops', JSON.stringify(shopsList));
  } catch (e) {
    console.warn("Could not save to localStorage", e);
  }
}

// Export Shops to Microsoft Excel (.xlsx)
async function exportShopsToExcel() {
  const filtered = filterShops();
  const listToExport = (filtered.length > 0 && shopFilter.search) ? filtered : shopsList;

  showToast(`Generating Excel (.xlsx) file with ${listToExport.length} shops...`, "info");

  try {
    const res = await authFetch('/api/shops/export/xlsx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shops: listToExport })
    });

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Mega_Mall_Shops_Directory.xlsx";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    showToast("Shops Directory exported to Excel (.xlsx) successfully!", "success");
  } catch (err) {
    console.error("Excel export failed:", err);
    showToast("Failed to generate Excel file: " + err.message, "error");
  }
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
// Admin Panel: User Account Management
// ==========================================================
async function openAdminPanelModal() {
  const backdrop = document.getElementById("adminPanelModalBackdrop");
  if (!backdrop) return;
  backdrop.classList.add("open");
  backdrop.classList.add("active");
  await loadAdminUsers();
}

function closeAdminPanelModal() {
  const backdrop = document.getElementById("adminPanelModalBackdrop");
  if (!backdrop) return;
  backdrop.classList.remove("open");
  backdrop.classList.remove("active");
}

async function loadAdminUsers() {
  const tbody = document.getElementById("adminUsersTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:1rem; color:var(--text-muted);">Loading users...</td></tr>`;

  try {
    const res = await authFetch('/api/admin/users');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const users = data.users || [];

    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:1rem; color:var(--text-dim);">No user accounts found.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => {
      const isRoot = u.id === 'usr_root_admin' || u.username === 'admin';
      const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'System';
      const actionBtn = isRoot
        ? `<span style="color:var(--text-dim); font-size:0.7rem;">Primary Root</span>`
        : `<button type="button" class="btn btn-danger btn-sm" onclick="deleteAdminUser('${escapeHtml(u.id)}', '${escapeHtml(u.username)}')" style="padding:2px 6px; font-size:0.7rem;">Delete</button>`;

      return `
        <tr style="border-bottom:1px solid #1a1e28;">
          <td style="padding:0.45rem 0.75rem; font-weight:600; color:var(--text-main);">${escapeHtml(u.username)}</td>
          <td style="padding:0.45rem 0.75rem;"><span class="badge" style="background:rgba(59,130,246,0.12); color:#60a5fa; padding:2px 6px; border-radius:4px; font-size:0.7rem;">${escapeHtml(u.role || 'Administrator')}</span></td>
          <td style="padding:0.45rem 0.75rem; color:var(--text-muted); font-size:0.72rem;">${dateStr}</td>
          <td style="padding:0.45rem 0.75rem; text-align:right;">${actionBtn}</td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Failed to load users:", err);
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:1rem; color:var(--accent-red);">Failed to load users: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function handleAdminAddUser(e) {
  e.preventDefault();
  const userInput = document.getElementById("newUserIdInput");
  const passInput = document.getElementById("newUserPasswordInput");
  const roleInput = document.getElementById("newUserRoleInput");
  const submitBtn = document.getElementById("adminCreateUserBtn");

  const username = userInput.value.trim();
  const password = passInput.value.trim();
  const role = roleInput.value;

  if (!username || !password) {
    showToast("Please provide both username and password.", "error");
    return;
  }

  submitBtn.disabled = true;
  try {
    const res = await authFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create user.");

    showToast(`User account "${username}" created successfully!`, "success");
    userInput.value = "";
    passInput.value = "";
    await loadAdminUsers();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
  }
}

function deleteAdminUser(userId, username) {
  showConfirm(
    "Delete User Account",
    `Are you sure you want to delete user "${username}"? They will immediately lose access.`,
    async () => {
      try {
        const res = await authFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to delete user.");
        showToast(`User "${username}" deleted.`, "success");
        await loadAdminUsers();
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  );
}

// ==========================================================
// Route Isolation & View Initialization (/shopslist vs /)
// ==========================================================
function checkRouteMode() {
  const isShopsRoute = window.location.pathname.startsWith('/shopslist');

  if (isShopsRoute) {
    // Standalone Shop Directory Mode
    document.body.classList.add("shops-standalone-mode");
    switchTab("shops");
    document.title = "The Mega Mall - Shop & Tenant Directory";
  } else {
    // Standard Root Invoice Mode
    document.body.classList.remove("shops-standalone-mode");
    const shopTabBtn = document.getElementById("tabShopIdentifier");
    if (shopTabBtn) shopTabBtn.style.display = "none";
    const shopsSection = document.getElementById("shopIdentifierSection");
    if (shopsSection) {
      shopsSection.classList.remove("active");
      shopsSection.style.display = "none";
    }
    switchTab("preview");
  }
}

// Setup Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("preset-falaknaz")?.addEventListener("click", () => applyPreset("falaknaz"));
  document.getElementById("preset-mega")?.addEventListener("click", () => applyPreset("mega"));

  document.getElementById("occupierInput").addEventListener("input", (e) => {
    appState.occupier = e.target.value;
    renderPreview();
  });
  document.getElementById("locationInput").addEventListener("input", (e) => {
    appState.location = e.target.value;
    renderPreview();
  });
  document.getElementById("ntnInput").addEventListener("input", (e) => {
    appState.ntn = e.target.value;
    renderPreview();
  });

  document.getElementById("startMonthInput").addEventListener("change", (e) => {
    if (/^\d{4}-\d{2}$/.test(e.target.value)) {
      appState.startMonth = e.target.value;
      updateYearConfigsUI();
      renderPreview();
      renderDataEditor();
    }
  });
  document.getElementById("endMonthInput").addEventListener("change", (e) => {
    if (/^\d{4}-\d{2}$/.test(e.target.value)) {
      appState.endMonth = e.target.value;
      updateYearConfigsUI();
      renderPreview();
      renderDataEditor();
    }
  });

  document.getElementById("invPrefixInput").addEventListener("input", (e) => {
    appState.invPrefix = e.target.value;
    renderPreview();
    renderDataEditor();
  });
  document.getElementById("invStartNumInput").addEventListener("input", (e) => {
    appState.invStartNum = parseInt(e.target.value, 10) || 1;
    renderPreview();
    renderDataEditor();
  });
  document.getElementById("invSuffixInput").addEventListener("input", (e) => {
    appState.invSuffix = e.target.value;
    renderPreview();
    renderDataEditor();
  });

  const prevToggle = document.getElementById("prevBalanceToggle");
  prevToggle.addEventListener("change", (e) => {
    appState.includePrevBalance = e.target.checked;
    document.getElementById("prevBalanceOptions").style.display = e.target.checked ? "block" : "none";
    renderPreview();
    renderDataEditor();
  });

  document.getElementById("openingBalanceInput").addEventListener("input", (e) => {
    appState.openingBalance = parseFloat(e.target.value) || 0;
    renderPreview();
    renderDataEditor();
  });

  document.getElementById("prevBalanceModeSelect").addEventListener("change", (e) => {
    appState.prevBalanceMode = e.target.value;
    renderPreview();
    renderDataEditor();
  });

  document.getElementById("tabInvoicePreview").addEventListener("click", () => switchTab("preview"));
  document.getElementById("tabDataEditor").addEventListener("click", () => switchTab("editor"));
  document.getElementById("tabShopIdentifier").addEventListener("click", () => switchTab("shops"));

  // Shop Identifier Toolbar Events
  document.getElementById("exportShopsXlsxHeaderBtn")?.addEventListener("click", exportShopsToExcel);
  document.getElementById("exportShopsXlsxBtn")?.addEventListener("click", exportShopsToExcel);
  document.getElementById("openAddShopModalBtn")?.addEventListener("click", openAddShopModal);
  document.getElementById("closeShopModalBtn")?.addEventListener("click", closeShopModal);
  document.getElementById("cancelShopModalBtn")?.addEventListener("click", closeShopModal);
  document.getElementById("saveShopModalBtn")?.addEventListener("click", saveShopModal);
  document.getElementById("shopModalAddHistoryBtn")?.addEventListener("click", () => addHistoryEditorRow());

  document.getElementById("closePeriodModalBtn")?.addEventListener("click", closePeriodModal);
  document.getElementById("cancelPeriodModalBtn")?.addEventListener("click", closePeriodModal);
  document.getElementById("savePeriodModalBtn")?.addEventListener("click", savePeriodModal);

  document.getElementById("viewModeTableBtn")?.addEventListener("click", () => setShopViewMode("table"));
  document.getElementById("viewModeGridBtn")?.addEventListener("click", () => setShopViewMode("grid"));

  const shopSearchInput = document.getElementById("shopSearchInput");
  if (shopSearchInput) {
    let debounceTimer = null;
    shopSearchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        shopFilter.search = e.target.value;
        renderShopsDirectory();
      }, 100);
    });
  }

  document.getElementById("shopSearchClearBtn")?.addEventListener("click", () => {
    const input = document.getElementById("shopSearchInput");
    if (input) input.value = "";
    shopFilter.search = "";
    renderShopsDirectory();
  });

  document.getElementById("resetShopSearchBtn")?.addEventListener("click", () => {
    const input = document.getElementById("shopSearchInput");
    if (input) input.value = "";
    shopFilter.search = "";
    shopFilter.floor = "ALL";
    document.querySelectorAll(".shop-pill").forEach(p => p.classList.toggle("active", p.dataset.floor === "ALL"));
    renderShopsDirectory();
  });

  // Filter Pills Click Handlers
  document.querySelectorAll(".shop-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".shop-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      shopFilter.floor = pill.dataset.floor;
      renderShopsDirectory();
    });
  });

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

  // Admin Panel Event Handlers
  document.getElementById("adminPanelBtn")?.addEventListener("click", openAdminPanelModal);
  document.getElementById("closeAdminPanelBtn")?.addEventListener("click", closeAdminPanelModal);
  document.getElementById("adminPanelCloseFooterBtn")?.addEventListener("click", closeAdminPanelModal);
  document.getElementById("adminAddUserForm")?.addEventListener("submit", handleAdminAddUser);

  document.getElementById("togglePreviewBtn")?.addEventListener("click", togglePreview);
  initSplitPaneResizer();

  initCalendarPopovers();
  syncInputsWithState();
  updateYearConfigsUI();

  // Route check for /shopslist vs root /
  checkRouteMode();

  // Initialize Session Authentication
  checkAuthSession().then(isAuth => {
    if (isAuth) {
      if (window.location.pathname.startsWith('/shopslist')) {
        loadShopsData();
      } else {
        renderPreview();
        renderDataEditor();
      }
    }
  });
});
