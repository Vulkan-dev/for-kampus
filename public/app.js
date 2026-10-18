/**
 * Water Invoice Maker - Application Logic
 * Professional Matte Dark Architecture with Full Data Editing & Multi-Format Exports
 */

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

    let billingPeriod = `${m.fullMonthName} ${m.year} (1 ${m.shortMonthName} ${m.year} to ${m.daysInMonth} ${m.shortMonthName.toUpperCase()} ${m.year}).`;
    let issueDate = `${getOrdinal(m.daysInMonth)} ${m.shortMonthName} ${m.year}`;

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
          <img src="assets/mega-mall-logo.png" alt="THE MEGA MALL" style="width:92px; height:auto; display:block;" />
        </div>
        <div class="inv-title-center">
          <h1>THE MEGA MALL</h1>
          <p>Official Billing Invoice / Reimburstment Note</p>
        </div>
        <div class="inv-logo-right">
          <img src="assets/kampus-logo.png" alt="KAMPUS Integrated Services" style="width:78px; height:auto; display:block;" />
        </div>
      </div>

      <!-- Customer & Invoice Metadata -->
      <div class="inv-meta-grid">
        <div class="inv-customer-col">
          <div class="heading">Customer</div>
          <div class="line"><span class="label">Legal Occupier:</span> ${appState.occupier}</div>
          <div class="line"><span class="label">Location:</span> ${appState.location}</div>
          <div class="line"><span class="label">Billing Month:</span> ${inv.billingPeriod}</div>
        </div>
        <div class="inv-number-col">
          <div class="title">Invoice,</div>
          <div class="number">${inv.invoiceNumber}</div>
          <div class="ntn">NTN: ${appState.ntn}</div>
        </div>
      </div>

      <!-- Billing Table with SOLID, GUARANTEED VISIBLE GRIDS -->
      <table class="inv-table" style="width:100% !important; border-collapse:collapse !important; border:1.5px solid #000000 !important; margin-bottom:2.2rem;">
        <thead>
          <tr style="background-color:#f7f7f7 !important;">
            <th style="border:1.5px solid #000000 !important; padding:8px 6px !important; font-size:11px !important; font-weight:700 !important; text-align:center !important; color:#000000 !important;">CONSUMPTION GALLON</th>
            <th style="border:1.5px solid #000000 !important; padding:8px 6px !important; font-size:11px !important; font-weight:700 !important; text-align:center !important; color:#000000 !important;">RATE PER<br>GALLON</th>
            <th style="border:1.5px solid #000000 !important; padding:8px 6px !important; font-size:11px !important; font-weight:700 !important; text-align:center !important; color:#000000 !important;">BILL<br>AMOUNT</th>
            <th style="border:1.5px solid #000000 !important; padding:8px 6px !important; font-size:11px !important; font-weight:700 !important; text-align:center !important; color:#000000 !important;">PREVIOUS</th>
            <th style="border:1.5px solid #000000 !important; padding:8px 6px !important; font-size:11px !important; font-weight:700 !important; text-align:center !important; color:#000000 !important;">TOTAL PAYABLE</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border:1.5px solid #000000 !important; padding:9px 6px !important; font-size:13px !important; font-weight:500 !important; text-align:center !important; color:#000000 !important;">${formatNumber(inv.gallons)}</td>
            <td style="border:1.5px solid #000000 !important; padding:9px 6px !important; font-size:13px !important; font-weight:500 !important; text-align:center !important; color:#000000 !important;">${Number(inv.rate).toFixed(2)}</td>
            <td style="border:1.5px solid #000000 !important; padding:9px 6px !important; font-size:13px !important; font-weight:500 !important; text-align:center !important; color:#000000 !important;">${formatNumber(inv.billAmount)}/-</td>
            <td style="border:1.5px solid #000000 !important; padding:9px 6px !important; font-size:13px !important; font-weight:500 !important; text-align:center !important; color:#000000 !important;">${inv.previous === 0 ? "0" : formatNumber(inv.previous) + "/-"}</td>
            <td style="border:1.5px solid #000000 !important; padding:9px 6px !important; font-size:13px !important; font-weight:500 !important; text-align:center !important; color:#000000 !important;">${formatNumber(inv.totalPayable)}/-</td>
          </tr>
        </tbody>
      </table>

      <!-- Bullet Notices -->
      <div class="inv-notices">
        <ul>
          <li>*Please make payment in favour of Kampus Integrated Services NTN: C951537 Account No: 10380109491064 in Meezan Bank.</li>
          <li>*If the payment is not received till the last payment date, "The Mega Mall" will hold the services of your lincensed area and will not held responsible for any losses Whats so ever there for.</li>
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

  document.getElementById("tabInvoicePreview").classList.toggle("active", isPreview);
  document.getElementById("tabDataEditor").classList.toggle("active", !isPreview);

  document.getElementById("mainContainer").style.display = isPreview ? "grid" : "none";
  document.getElementById("dataEditorSection").classList.toggle("active", !isPreview);

  if (!isPreview) {
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

    const response = await fetch('/api/export/docx', {
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
  btn.innerHTML = "Generating PDF...";
  btn.disabled = true;

  try {
    const invoices = calculateInvoices();
    const tempContainer = document.createElement("div");
    tempContainer.style.background = "#ffffff";
    tempContainer.style.color = "#000000";
    tempContainer.style.width = "210mm";
    tempContainer.innerHTML = invoices.map(inv => renderInvoiceSheet(inv)).join("");

    const opt = {
      margin: 0,
      filename: `Water_Invoices_${appState.occupier.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    await html2pdf().set(opt).from(tempContainer).save();
    showToast("PDF document downloaded successfully", "success");
  } catch (err) {
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
    const res = await fetch('/api/import/file', {
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
  document.getElementById("importModalBackdrop").classList.add("open");
}
function closeImportModal() {
  document.getElementById("importModalBackdrop").classList.remove("open");
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

  // File drag & drop handling
  const dropzone = document.getElementById("fileDropzone");
  const fileInput = document.getElementById("fileInput");

  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) handleFileSelection(e.target.files[0]);
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });

  // Confirm modal event handlers
  document.getElementById("confirmModalOkBtn").addEventListener("click", () => {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
  });
  document.getElementById("confirmModalCancelBtn").addEventListener("click", closeConfirmModal);
  document.getElementById("confirmModalCloseBtn").addEventListener("click", closeConfirmModal);

  initCalendarPopovers();
  syncInputsWithState();
  updateYearConfigsUI();
  renderPreview();
  renderDataEditor();
});
