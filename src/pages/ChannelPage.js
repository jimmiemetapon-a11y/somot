import { validateImportedPayments } from '../utils/paymentAmounts.js';
import { getGrabPayoutBreakdown } from '../utils/grabPayout.js';
import { saveWithAyalaDineOut, syncAyalaDineOut, deleteWithAyalaDineOut } from '../services/ayalaDineOut.js';
import { showAyalaProductImport } from '../components/AyalaProductImport.js';
import { countDineInDrinkOrders, countIncidentOrders } from '../utils/kpiMetrics.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, orderBy, limit, updateDoc, deleteDoc } from 'firebase/firestore';

const CHANNEL_CONFIG = {
  dinein: {
    label: 'Dine In', icon: 'id_VcqlrDV_1777185371840.svg', color: 'amber', hex: '#96588a',
    colQty: 48, colUnitPrice: 49, colUnitDisc: 51, colInvDisc: 31, colBankTrans: 37, colId: 1, colDate: 5,
    fileGuideline: 'KiotViet filename usually has the format: InvoiceListDetail_KV...'
  },
  grabfood: {
    label: 'GrabFood', icon: 'GrabFood.svg', color: 'emerald', hex: '#96588a',
    colGross: 29, colMerchantDisc: 35, colDeliveryDisc: 36, colComm: 46, colMarketing: 44, colAds: 52, colOrderComm: 47, colCategory: 7, colDesc: 62, colDate: 4, colId: 15,
    fileGuideline: 'Grab filename usually has the format: Transaction_Store_2026...._to_....'
  },
  foodpanda: {
    label: 'FoodPanda', icon: 'Foodpanda.svg', color: 'pink', hex: '#96588a',
    colGross: 21, colCheckP: 15, colCheckS: 18, colCheckT: 19, colCheckU: 20, colDiscount: 28, colComm: 31, colTax: 26, colMarketing: 34, colAds: 33, colOthers: 29, colRefunds: 24, colDate: 8,
    fileGuideline: 'Panda filename usually has the format: orderDetails'
  },
  online: {
    label: 'Online Order', icon: 'WooCommerce.svg', color: 'violet', hex: '#96588a',
    colGross: 13, colDate: 18, colId: 15,
    fileGuideline: 'Online Woo filename usually has the format: order'
  },
};

// Mapping tên chi nhánh trong cột A file FoodPanda → branchId trong database
const PANDA_BRANCH_MAP = {
  'So Mot Vietnamese Cuisine - Unimart': 'Unimart Capitol',
  'So Mot Vietnamese Cuisine - Ayala Malls Cloverleaf': 'Ayala Cloverleaf',
  'So Mot Vietnamese Cuisine - Pioneer Center Supermarket': 'Pioneer Center',
  'So Mot Vietnamese Cuisine - Tayuman': 'Catholic Trade',
  'So Mot Vietnamese Cuisine - UST': 'UST'
};

// Mapping tên chi nhánh trong cột A file Dine In (KiotViet) → branchId trong database
const DINEIN_BRANCH_MAP = {
  'PC': 'Pioneer Center',
  'Tayuman ( Catholic Trade )': 'Catholic Trade',
  'Unimart Capitol Commons': 'Unimart Capitol',
  'UST': 'UST'
};

// Mapping tên chi nhánh trong cột C file GrabFood → branchId trong database
const GRAB_BRANCH_MAP = {
  'So Mot Vietnamese Cuisine - Ayala Cloverleaf': 'Ayala Cloverleaf',
  'So Mot Vietnamese Cuisine - Quezon City': 'Ayala Cloverleaf',
  'So Mot Vietnamese Cuisine - Pioneer Center': 'Pioneer Center',
  'So Mot Vietnamese Cuisine - Kapitolyo Pasig': 'Pioneer Center',
  'So Mot Vietnamese Cuisine - Tayuman': 'Catholic Trade',
  'So Mot Vietnamese Cuisine - Manila City': 'Catholic Trade',
  'So Mot Vietnamese Cuisine - Unimart': 'Unimart Capitol',
  'So Mot Vietnamese Cuisine - UST': 'UST'
};

// Flexible Header Detection for GrabFood Excel Import
function getGrabHeaderMap(headerRow) {
  const map = {
    colDate: 4,                  // Column E
    colCategory: 7,              // Column H
    colId: 15,                   // Column P
    colGross: 29,                // Column AD
    colMerchantProductDisc: 35,  // Column AJ
    colMerchantDeliveryDisc: 36, // Column AK
    colMarketing: 44,            // Column AS
    colComm: 46,                 // Column AU
    colOrderComm: 47,            // Column AV
    colAds: 52,                  // Column BA (Net Payout / Net Amount)
    colDesc: 62,                 // Column BK
    colDetail: 64,               // Column BM
    colBranch: 2                 // Column C
  };

  if (!headerRow || !Array.isArray(headerRow)) return map;

  headerRow.forEach((cell, idx) => {
    if (!cell) return;
    const txt = String(cell).trim().toLowerCase();
    if (txt.includes('transaction date') || txt.includes('created date') || txt.includes('order date')) map.colDate = idx;
    else if (txt === 'category' || txt.includes('transaction category')) map.colCategory = idx;
    else if (txt === 'order id' || txt.includes('transaction id')) map.colId = idx;
    else if (txt.includes('gross amount') || txt.includes('gross sales') || txt === 'amount') map.colGross = idx;
    else if (txt.includes('merchant product discount') || txt.includes('merchant product promo')) map.colMerchantProductDisc = idx;
    else if (txt.includes('merchant delivery discount') || txt.includes('merchant delivery promo')) map.colMerchantDeliveryDisc = idx;
    else if (txt.includes('marketing success fee') || txt.includes('marketing fee')) map.colMarketing = idx;
    else if (txt.includes('channel commission') || txt === 'commission fee' || txt === 'commission') map.colComm = idx;
    else if (txt.includes('order commission')) map.colOrderComm = idx;
    else if (txt.includes('net payout') || txt.includes('net amount') || txt.includes('payout amount')) map.colAds = idx;
    else if (txt.includes('description') || txt.includes('campaign name')) map.colDesc = idx;
    else if (txt.includes('detail') || txt.includes('remark') || txt.includes('reason detail')) map.colDetail = idx;
    else if (txt.includes('store name') || txt.includes('merchant name')) map.colBranch = idx;
  });

  return map;
}

// Campaign Normalization Helper (strip date patterns like - 2026-09-04)
function normalizeGrabCampaign(rawDesc) {
  if (!rawDesc || typeof rawDesc !== 'string') return 'Unspecified Campaign';
  let str = rawDesc.trim();
  if (!str) return 'Unspecified Campaign';

  str = str.replace(/\s*[-_]\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}$/i, '');
  str = str.replace(/\s*[-_]\s*\d{1,2}[-/]\d{1,2}[-/]\d{4}$/i, '');
  str = str.replace(/\s*\(\d{4}[-/]\d{1,2}[-/]\d{1,2}\)$/i, '');

  return str.trim() || 'Unspecified Campaign';
}

// Reason Group Classifier for Adjustments & Deductions
function classifyGrabReasonGroup(cat, subcat, desc) {
  const combined = `${cat || ''} ${subcat || ''} ${desc || ''}`.toLowerCase();
  if (combined.includes('missing') || combined.includes('thiếu')) return 'Missing Item';
  if (combined.includes('wrong') || combined.includes('sai') || combined.includes('nhầm')) return 'Wrong Item';
  if (combined.includes('quality') || combined.includes('chất lượng') || combined.includes('hỏng') || combined.includes('spoil')) return 'Food Quality';
  if (combined.includes('cancel') || combined.includes('hủy')) return 'Cancellation';
  if (combined.includes('adjustment') || combined.includes('điều chỉnh')) return 'Adjustment';
  return 'Unclassified';
}

let historyItems = [];

// Hàm hỗ trợ lấy ngày nội bộ (Local Time) tránh bị lùi 1 ngày do lệch múi giờ (Timezone Offset)
function getLocalDateString(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatAbbreviated(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(3) + 'M';
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Chuẩn hóa ngày về YYYY-MM-DD (Siêu bền bỉ cho mọi định dạng)
// Helper bóc tách ngày giờ thông minh (hỗ trợ cả MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, AM/PM, và Excel Serial)
function parseDateComponents(val) {
  if (val === undefined || val === null || String(val).trim() === '') return null;

  let year = 0, month = 0, day = 0, hours = 0, minutes = 0;

  if (typeof val === 'number') {
    const totalDays = Math.floor(val);
    const timeFraction = val - totalDays;
    const totalMinutes = Math.round(timeFraction * 24 * 60);
    hours = Math.floor(totalMinutes / 60);
    minutes = totalMinutes % 60;

    const daysSinceEpoch = totalDays - 25569;
    const refDate = new Date(1970, 0, 1 + daysSinceEpoch, hours, minutes);

    return {
      year: refDate.getFullYear(),
      month: refDate.getMonth(), // 0-indexed
      day: refDate.getDate(),
      hours: refDate.getHours(),
      minutes: refDate.getMinutes()
    };
  }

  const str = String(val).trim();

  // Bóc tách giờ/phút kèm hỗ trợ AM/PM
  const timeMatch = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (timeMatch) {
    let hh = parseInt(timeMatch[1], 10);
    const mm = parseInt(timeMatch[2], 10);
    const ampm = timeMatch[4] ? timeMatch[4].toUpperCase() : null;
    if (ampm) {
      if (ampm === 'PM' && hh < 12) hh += 12;
      if (ampm === 'AM' && hh === 12) hh = 0;
    }
    hours = hh;
    minutes = mm;
  }

  const datePart = str.split(' ')[0];
  const sep = datePart.includes('/') ? '/' : (datePart.includes('-') ? '-' : null);

  if (sep) {
    const parts = datePart.split(sep);
    if (parts.length >= 3) {
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      const p2 = parseInt(parts[2], 10);

      if (parts[0].length === 4) {
        // YYYY-MM-DD hoặc YYYY/MM/DD
        year = p0; month = p1 - 1; day = p2;
      } else if (parts[2].length === 4) {
        year = p2;
        // Xử lý thông minh MM/DD/YYYY (vd: 09/13/2026) vs DD/MM/YYYY (vd: 13/09/2026)
        if (p1 > 12) {
          // p1 > 12 bắt buộc là Day (13), p0 là Month (9)
          month = p0 - 1; day = p1;
        } else if (p0 > 12) {
          // p0 > 12 bắt buộc là Day (13), p1 là Month (9)
          day = p0; month = p1 - 1;
        } else {
          // Cả p0 và p1 <= 12 (vd: 09/05/2026): mặc định p0 là Tháng (MM/DD/YYYY)
          month = p0 - 1; day = p1;
        }
      }
    }
  }

  // Fallback nếu không tách được theo pattern trên
  if (!year || month < 0 || month > 11 || !day || day < 1 || day > 31) {
    const fallback = new Date(str);
    if (!isNaN(fallback.getTime())) {
      year = fallback.getFullYear();
      month = fallback.getMonth();
      day = fallback.getDate();
      hours = fallback.getHours();
      minutes = fallback.getMinutes();
    } else {
      return null;
    }
  }

  return { year, month, day, hours, minutes };
}

function standardizeDate(val, channelId) {
  const comp = parseDateComponents(val);
  if (!comp) return null;

  const dObj = new Date(comp.year, comp.month, comp.day, comp.hours, comp.minutes);
  if (isNaN(dObj.getTime())) return null;

  if (channelId === 'dinein' && comp.hours < 2) {
    dObj.setDate(dObj.getDate() - 1);
  }

  return getLocalDateString(dObj);
}

function standardizeDateWithHour(val, channelId) {
  const comp = parseDateComponents(val);
  if (!comp) return { dateKey: null, hour: 0 };

  const dObj = new Date(comp.year, comp.month, comp.day, comp.hours, comp.minutes);
  if (isNaN(dObj.getTime())) return { dateKey: null, hour: 0 };

  const originalHour = comp.hours;

  if (channelId === 'dinein' && comp.hours < 2) {
    dObj.setDate(dObj.getDate() - 1);
  }

  return {
    dateKey: getLocalDateString(dObj),
    hour: originalHour
  };
}

function parseAyalaDate(val) {
  if (!val) return null;
  let str = String(val).trim();

  // Chuỗi số nén MMDDYYYY (8 chữ số) hoặc MDDYYYY (7 chữ số)
  if (/^\d{7,8}$/.test(str)) {
    if (str.length === 7) str = '0' + str;
    const mm = parseInt(str.substring(0, 2), 10);
    const dd = parseInt(str.substring(2, 4), 10);
    const yyyy = parseInt(str.substring(4, 8), 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const dObj = new Date(yyyy, mm - 1, dd);
      return getLocalDateString(dObj);
    }
  }

  return standardizeDate(val, 'dinein');
}

function cleanNumber(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  let str = String(val).trim();
  // Handle (1,234.56) -> -1234.56 (Accounting format)
  const isParenthesized = str.startsWith('(') && str.endsWith(')');
  let cleaned = str.replace(/[^0-9.-]+/g, "");
  let num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return isParenthesized ? -Math.abs(num) : num;
}

function getExcelColumnName(n) {
  let ordA = 'A'.charCodeAt(0);
  let len = 26;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(n % len + ordA) + s;
    n = Math.floor(n / len) - 1;
  }
  return s;
}

export function renderChannelPage(channelId, activeTab = 'history') {
  const cfg = CHANNEL_CONFIG[channelId];
  const page = document.createElement('div');
  page.className = 'p-6 space-y-6 page-enter';

  const viewNavigation = document.createElement('nav');
  viewNavigation.className = 'kpi-view-buttons';
  viewNavigation.setAttribute('aria-label', 'Channel actions');
  viewNavigation.innerHTML = `
    <button type="button" class="kpi-view-button" id="btn-goto-import" aria-pressed="true">
      <i data-lucide="file-up" class="w-3.5 h-3.5 inline-block mr-1"></i> Import Data
    </button>
    <button type="button" class="kpi-view-button" id="btn-export-csv" aria-pressed="true">
      <i data-lucide="file-spreadsheet" class="w-3.5 h-3.5 inline-block mr-1"></i> Export Report
    </button>
  `;
  page.kpiViewNavigation = viewNavigation;

  page.innerHTML = `
    <!-- TAB: HISTORY (Main View) -->
    <div id="section-history" class="tab-content ${(!activeTab || activeTab === 'history') ? '' : 'hidden'} space-y-4 page-enter">
       <div id="channel-summary-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"></div>
       <section id="history-branch-performance" class="history-branch-performance" aria-label="Branch performance"></section>

       <!-- Optimized Action Bar: Exclusive Export & Import -->
       <div class="history-data-card">
          <!-- Subdued Table Header Action Area -->
          <div class="history-data-heading">
             <h3>Historical Data</h3>
          </div>

          <div class="history-data-scroll">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-transparent">
                <th class="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em]">Date</th>
                <th class="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-center">Orders</th>
                <th class="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em]">Gross Sale</th>
                <th class="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em]">Total Ded.</th>
                <th class="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em]">Net Sale</th>
                <th class="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-right">Action</th>
              </tr>
            </thead>
            <tbody id="history-table-body" class="divide-y divide-slate-100 dark:divide-white/5">
               <tr><td colspan="6" class="px-6 py-10 text-center text-[11px] text-slate-400 italic">Fetching data from database...</td></tr>
            </tbody>
          </table>
          </div>
       </div>
    </div>

    <!-- TAB: ANALYTICS (New Report) -->
    ${channelId === 'grabfood' ? `
    <div id="section-analytics" class="tab-content ${activeTab === 'analytics' ? '' : 'hidden'} space-y-6 page-enter">
       <div id="grab-analytics-container" class="w-full space-y-8"></div>
    </div>
    ` : ''}

    <!-- TAB: IMPORT (Current upload interface) -->
    <div id="section-import" class="tab-content ${activeTab === 'import' ? '' : 'hidden'} space-y-6 page-enter">
        <!-- Results Hero Area -->
        <div id="results-summary" class="w-full"></div>
        <div id="breakdown-area" class="hidden"></div>
        
        <!-- Import Header Actions -->
        <div class="flex justify-between items-center px-2">
           <button id="btn-back-to-history" class="flex items-center gap-2 text-[10px] font-black text-[#96588a] hover:text-[#7a4671] dark:text-[#d4afcd] uppercase tracking-widest transition-all group">
              <i data-lucide="arrow-left" class="w-4 h-4 group-hover:-translate-x-1 transition-transform"></i>
              Back to History
           </button>
        </div>

        <!-- Upload Interface Row -->
        <div id="upload-controls-row" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Left: Modernized Upload Zone -->
          <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-[2.5rem] p-8 flex flex-col items-center justify-center gap-6 min-h-[300px] border-t border-white/60 dark:border-white/10 relative overflow-hidden group">
            <input type="file" id="file-input" class="hidden" accept=".xlsx, .xls, .csv" multiple>
            <div id="drop-zone" class="w-full flex flex-col items-center gap-4 cursor-pointer transition-all duration-300">
              <div class="w-16 h-16 rounded-[1.5rem] flex items-center justify-center bg-slate-100 dark:bg-white/5 shadow-inner">
                 <i data-lucide="file-up" class="w-8 h-8 text-[#96588a]"></i>
              </div>
              <div class="text-center">
                <p class="text-xs font-black text-slate-700 dark:text-white uppercase tracking-widest">Drop ${cfg.label} File</p>
                <p class="text-[9px] text-slate-400 font-bold mt-1">EXCEL / CSV ONLY</p>
              </div>
            </div>
            <div class="flex gap-3 w-full">
               <button id="btn-choose" class="flex-1 h-12 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-95 bg-[#96588a]">Browse Files</button>
               <button id="btn-manual" class="flex-1 h-12 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-95 bg-emerald-600 hidden">Product Import</button>
            </div>
          </div>

          <!-- Right: Premium Info Area (Static) -->
          <div class="lg:col-span-2 luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-[2.5rem] p-10 border-t border-white/60 dark:border-white/10 relative flex flex-col justify-center gap-4">
             <h4 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">Import Guidelines</h4>
             <ul class="space-y-3">
                <li class="flex items-start gap-3 text-[11px] text-slate-500 dark:text-white/60 font-bold">
                   <div class="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0"><i data-lucide="check" class="w-3 h-3"></i></div>
                   Supports multi-file upload for combined analysis.
                </li>
                <li class="flex items-start gap-3 text-[11px] text-slate-500 dark:text-white/60 font-bold">
                   <div class="w-5 h-5 rounded-full bg-[#96588a]/10 flex items-center justify-center text-[#96588a] shrink-0"><i data-lucide="clock" class="w-3 h-3"></i></div>
                   Dine-in orders before 2:00 AM are adjusted to previous day.
                </li>
                <li class="flex items-start gap-3 text-[11px] text-slate-500 dark:text-white/60 font-bold">
                   <div class="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0"><i data-lucide="alert-circle" class="w-3 h-3"></i></div>
                   Conflicts are automatically detected and highlighted.
                </li>
                ${cfg.fileGuideline ? `
                <li class="flex items-start gap-3 text-[11px] text-slate-500 dark:text-white/60 font-bold">
                   <div class="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0"><i data-lucide="file-text" class="w-3 h-3"></i></div>
                   ${cfg.fileGuideline}
                </li>
                ` : ''}
             </ul>
          </div>
        </div>

        <!-- NEW: Dedicated Preview Area (Always visible when there is content) -->
        <div id="preview-area" class="w-full min-h-[100px]"></div>

        <div class="flex justify-end pt-4">
          <!-- Standalone button hidden, now using the one inside Hero Card -->
          <div id="btn-save" class="hidden"></div>
        </div>
    </div>
  `;

  if (channelId === 'dinein') {
    const syncButton = document.createElement('button');
    syncButton.type = 'button';
    syncButton.id = 'btn-sync-ayala-dine-out';
    syncButton.className = 'ayala-dine-out-sync';
    syncButton.hidden = document.getElementById('db-branch')?.value !== 'Ayala Cloverleaf';
    syncButton.textContent = 'Sync Ayala Dine Out';
    syncButton.title = 'Reconcile Ayala records in the currently displayed history with Grab payouts for the same dates';
    syncButton.onclick = async () => {
      const rows = historyItems.filter(item => item.branchId === 'Ayala Cloverleaf' && item.channelId === 'dinein');
      if (!rows.length) return window.showToast('Select Ayala and load the dates to reconcile.', 'info');
      if (new Set(rows.map(row => row.date)).size !== rows.length) {
        return window.showToast('Duplicate Ayala daily records found. Resolve duplicates before syncing.', 'error');
      }
      syncButton.disabled = true;
      try {
        for (const row of rows) await syncAyalaDineOut(db, row.date, row.id);
        window.dispatchEvent(new CustomEvent('sales-updated'));
        await fetchChannelHistory(channelId);
        window.showToast('Ayala Dine Out adjustments synced for ' + rows.length + ' day(s).', 'success');
      } catch (error) {
        console.error(error);
        window.showToast('Sync incomplete. Retry safely: ' + error.message, 'error');
      } finally { syncButton.disabled = false; }
    };
    page.querySelector('.history-data-heading').append(syncButton);
  }

  let currentResults = null;

  setTimeout(() => {
    const fileInput = page.querySelector('#file-input');
    const btnChoose = page.querySelector('#btn-choose');
    const btnSave = page.querySelector('#btn-save');
    const dropZone = page.querySelector('#drop-zone');
    const previewArea = page.querySelector('#preview-area');

    // Initial state refresh
    fetchChannelHistory(channelId);

    const btnManual = page.querySelector('#btn-manual');
    const branchSelect = document.getElementById('db-branch');

    const updateManualBtn = () => {
      if (channelId === 'dinein' && branchSelect?.value === 'Ayala Cloverleaf') {
        btnManual?.classList.remove('hidden');
      } else {
        btnManual?.classList.add('hidden');
      }
    };

    updateManualBtn();

    const btnGotoImport = viewNavigation.querySelector('#btn-goto-import') || document.getElementById('btn-goto-import');
    if (btnGotoImport) {
       btnGotoImport.onclick = () => {
          const targetTab = (activeTab === 'import') ? 'history' : 'import';
          window.dispatchEvent(new CustomEvent('switch-sub-tab', { detail: { tabId: targetTab } }));
       };
    }

    const btnBackToHistory = page.querySelector('#btn-back-to-history');
    if (btnBackToHistory) {
       btnBackToHistory.onclick = () => {
          window.dispatchEvent(new CustomEvent('switch-sub-tab', { detail: { tabId: 'history' } }));
       };
    }

    btnChoose.onclick = () => fileInput.click();
    if (btnManual) btnManual.onclick = () => showAyalaProductImport(() => fetchChannelHistory(channelId));
    fileInput.onchange = (e) => { if (e.target.files.length > 0) processFiles(e.target.files); };
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('border-indigo-400'); };
    dropZone.ondrop = (e) => { e.preventDefault(); dropZone.classList.remove('border-indigo-400'); if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files); };

    btnSave.onclick = async () => {
      if (!currentResults) return;
      const branchId = document.getElementById('db-branch')?.value || 'Pioneer Center';

      btnSave.disabled = true;
      btnSave.style.backgroundColor = '#10b981'; // Emerald Green
      btnSave.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Saving...';

      try {
        await saveToDatabase(channelId, branchId, currentResults);
        window.showToast('Data saved successfully!', 'success');

        // Reset Import state
        currentResults = null;
        btnSave.classList.add('hidden');
        previewArea.innerHTML = '<p class="text-sm text-slate-400 italic text-center">Preview area<br><span class="text-[10px]">Excel columns (A, B, C...) will appear here</span></p>';
        fileInput.value = '';

        // Switch to History tab and reload
        window.dispatchEvent(new CustomEvent('switch-sub-tab', { detail: { tabId: 'history' } }));
        fetchChannelHistory(channelId);
      } catch (error) {
        console.error("Save Error:", error);
        window.showToast("Failed to save data: " + error.message, "error");
        btnSave.disabled = false;
        btnSave.style.backgroundColor = '#96588a';
        btnSave.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Confirm & Save to Database';
        if (window.lucide) window.lucide.createIcons();
      }
    };

    // Modal logic (Portal)
    function ensureModal() {
      const existing = document.getElementById('detail-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'detail-modal';
      modal.className = 'fixed inset-0 z-[10000] hidden flex items-center justify-center p-4 animate-fade-in';

      // Ghost Glass logic (Minimalist 2026)
      const glassBg = 'rgba(255, 255, 255, 0.08)'; // Pure Ghost Glass

      modal.innerHTML = `
          <div class="relative w-full max-w-[500px] rounded-[3rem] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.5)] overflow-hidden animate-fade-in flex flex-col min-h-[400px] max-h-[87vh] bg-white/70 dark:bg-white/[0.04] backdrop-blur-[40px] [transform:translateZ(0)] contain-paint isolation-isolate">
             <div class="px-10 pt-12 pb-6 flex flex-col items-center relative z-10">
                <p id="modal-title-prefix" class="text-[9px] font-black text-slate-500 dark:text-white/50 uppercase tracking-[0.5em] mb-1">Financial Report</p>
                <h3 id="modal-date" class="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter text-center">Date Details</h3>
                <button id="close-modal" class="absolute top-8 right-8 w-9 h-9 rounded-full bg-slate-900/5 dark:bg-white/5 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all backdrop-blur-2xl">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
             </div>

             <!-- Modal Body -->
             <div id="modal-content" class="px-8 pb-10 flex-1 flex flex-col gap-6"></div>
          </div>
        `;
      document.body.appendChild(modal);

      modal.querySelector('#close-modal').onclick = () => {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
      };
      modal.onclick = (e) => {
        if (e.target.id === 'detail-modal' || e.target.classList.contains('flex')) {
          modal.classList.add('hidden');
          document.body.style.overflow = '';
        }
      };
      return modal;
    }
    ensureModal();

    // Export Excel from Template logic
    const btnExportCsv = viewNavigation.querySelector('#btn-export-csv') || document.getElementById('btn-export-csv');
    if (btnExportCsv) {
      btnExportCsv.onclick = async () => {
      const branchId = (document.getElementById('db-branch')?.value || 'Pioneer Center').trim();
      const isAllBranches = (branchId === 'All Branches');

      if (isAllBranches) {
        window.showToast('Preparing Consolidated All-Branches Export...', 'info');

        try {
          // 1. Get dates range
          const rangeStr = document.getElementById('db-date-range')?.value || '';
          let fromDate = '', toDate = '';
          if (rangeStr.includes(' to ')) {
            [fromDate, toDate] = rangeStr.split(' to ');
          } else if (rangeStr) {
            fromDate = toDate = rangeStr;
          }

          if (!fromDate || !toDate) {
            const yest = new Date();
            yest.setDate(yest.getDate() - 1);
            const yestStr = getLocalDateString(yest);
            fromDate = toDate = yestStr;
          }

          // 2. Fetch all channel and branch records from daily_sales
          const q = query(
            collection(db, "daily_sales"),
            where("date", ">=", fromDate),
            where("date", "<=", toDate)
          );

          const snapshot = await getDocs(q);
          if (snapshot.empty) {
            return alert('No database records found in the selected period to export.');
          }

          const branchNameMap = {
            'Pioneer Center': 'PIONEER',
            'Catholic Trade': 'TAYUMAN',
            'Unimart Capitol': 'UNIMART',
            'Ayala Cloverleaf': 'AYALA',
            'UST': 'UST'
          };

          const consolidated = {};

          snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const rawBranch = data.branchId;
            const mappedBranch = branchNameMap[rawBranch] || String(rawBranch).toUpperCase();

            const dateStr = data.date;
            if (!dateStr) return;

            if (!consolidated[dateStr]) {
              consolidated[dateStr] = {};
            }
            if (!consolidated[dateStr][mappedBranch]) {
              consolidated[dateStr][mappedBranch] = {
                dinein: { gross: 0, deduction: 0, cash: 0, bankTransfer: 0, card: 0, cardFee: 0, net: 0 },
                grabfood: { gross: 0, deduction: 0, net: 0 },
                foodpanda: { gross: 0, deduction: 0, net: 0 },
                online: { net: 0, cash: 0, bankTransfer: 0 }
              };
            }

            const branchData = consolidated[dateStr][mappedBranch];
            const channel = data.channelId;

            if (channel === 'dinein') {
              branchData.dinein.gross += (data.financials?.gross || 0);
              branchData.dinein.deduction += (data.financials?.totalDeductions || 0);
              branchData.dinein.cash += (data.paymentMethods?.cash || 0);
              branchData.dinein.bankTransfer += (data.paymentMethods?.bankTransfer || 0);
              branchData.dinein.card += (data.paymentMethods?.bankCard || 0);
              branchData.dinein.cardFee += (data.breakdown?.deductions?.bankCardFee || 0);
              branchData.dinein.net += (data.financials?.net || 0);
            } else if (channel === 'grabfood') {
              branchData.grabfood.gross += (data.financials?.gross || 0);
              branchData.grabfood.deduction += (data.financials?.totalDeductions || 0);
              branchData.grabfood.net += (data.financials?.net || 0);
            } else if (channel === 'foodpanda') {
              branchData.foodpanda.gross += (data.financials?.gross || 0);
              branchData.foodpanda.deduction += (data.financials?.totalDeductions || 0);
              branchData.foodpanda.net += (data.financials?.net || 0);
            } else if (channel === 'online') {
              branchData.online.net += (data.financials?.net || 0);
              branchData.online.cash += (data.paymentMethods?.cash || 0);
              branchData.online.bankTransfer += (data.paymentMethods?.bankTransfer || 0);
            }
          });

          // 4. Create ExcelJS workbook
          const ExcelJSModule = await import('exceljs');
          const ExcelJS = ExcelJSModule.default || ExcelJSModule;
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet('Consolidated Report');

          // Configure Columns
          worksheet.columns = [
            { key: 'date', width: 25 },
            { key: 'branch', width: 15 },
            // Dine In
            { key: 'di_gross', width: 15 },
            { key: 'di_ded', width: 15 },
            { key: 'di_cash', width: 15 },
            { key: 'di_bank', width: 18 },
            { key: 'di_card', width: 15 },
            { key: 'di_card_fee', width: 12 },
            { key: 'di_net', width: 15 },
            // GrabFood
            { key: 'grab_gross', width: 15 },
            { key: 'grab_ded', width: 15 },
            { key: 'grab_net', width: 15 },
            // FoodPanda
            { key: 'panda_gross', width: 15 },
            { key: 'panda_ded', width: 15 },
            { key: 'panda_net', width: 15 },
            // Online
            { key: 'online_net', width: 15 },
            { key: 'online_cash', width: 15 },
            { key: 'online_bank', width: 18 }
          ];

          // Headers values & merge
          worksheet.getCell('A1').value = 'DATE';
          worksheet.getCell('B1').value = 'BRANCH';
          worksheet.getCell('C1').value = 'DINE-IN (KIOTVIET)';
          worksheet.getCell('J1').value = 'GRABFOOD';
          worksheet.getCell('M1').value = 'FOODPANDA';
          worksheet.getCell('P1').value = 'ONLINE';

          worksheet.getCell('C2').value = 'GROSS SALE';
          worksheet.getCell('D2').value = 'DEDUCTION';
          worksheet.getCell('E2').value = 'CASH';
          worksheet.getCell('F2').value = 'BANK TRANSFER';
          worksheet.getCell('G2').value = 'CARD';
          worksheet.getCell('H2').value = 'CARD FEE';
          worksheet.getCell('I2').value = 'NET SALE';

          worksheet.getCell('J2').value = 'GROSS';
          worksheet.getCell('K2').value = 'DEDUCTION';
          worksheet.getCell('L2').value = 'NET SALE';

          worksheet.getCell('M2').value = 'GROSS';
          worksheet.getCell('N2').value = 'DEDUCTION';
          worksheet.getCell('O2').value = 'NET SALE';

          worksheet.getCell('P2').value = 'NET SALE';
          worksheet.getCell('Q2').value = 'CASH';
          worksheet.getCell('R2').value = 'BANK TRANSFER';

          worksheet.mergeCells('A1:A2');
          worksheet.mergeCells('B1:B2');
          worksheet.mergeCells('C1:I1');
          worksheet.mergeCells('J1:L1');
          worksheet.mergeCells('M1:O1');
          worksheet.mergeCells('P1:R1');

          // Styles for header
          const grayFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAEAEA' } };
          const purpleFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0E6F0' } };
          const greenFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F5EC' } };
          const pinkFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE8ED' } };
          const violetFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0EBF9' } };

          for (let r = 1; r <= 2; r++) {
            worksheet.getCell(r, 1).fill = grayFill;
            worksheet.getCell(r, 2).fill = grayFill;
            for (let c = 3; c <= 9; c++) worksheet.getCell(r, c).fill = purpleFill;
            for (let c = 10; c <= 12; c++) worksheet.getCell(r, c).fill = greenFill;
            for (let c = 13; c <= 15; c++) worksheet.getCell(r, c).fill = pinkFill;
            for (let c = 16; c <= 18; c++) worksheet.getCell(r, c).fill = violetFill;
          }

          const borderStyle = {
            top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
          };

          const headerRefs = [
            'A1', 'B1', 'C1', 'J1', 'M1', 'P1', 
            'C2', 'D2', 'E2', 'F2', 'G2', 'H2', 'I2', 
            'J2', 'K2', 'L2', 
            'M2', 'N2', 'O2', 
            'P2', 'Q2', 'R2'
          ];

          headerRefs.forEach(cellRef => {
            const cell = worksheet.getCell(cellRef);
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.font = { name: 'Arial', size: 9, bold: true };
          });

          for (let r = 1; r <= 2; r++) {
            for (let c = 1; c <= 18; c++) {
              worksheet.getCell(r, c).border = borderStyle;
            }
          }

          // Sort dates chronologically
          const sortedDates = Object.keys(consolidated).sort();

          let rowNum = 3;
          sortedDates.forEach(dateStr => {
            // Format date string to "Monday, June 1, 2026"
            const parts = dateStr.split('-');
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            const localDate = new Date(year, month, day);
            const formattedDate = localDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            // Branch loop for this date
            const branchesForDate = Object.keys(consolidated[dateStr]).sort();
            branchesForDate.forEach(branch => {
              const bData = consolidated[dateStr][branch];

              worksheet.getCell(`A${rowNum}`).value = formattedDate;
              worksheet.getCell(`B${rowNum}`).value = branch;

              // Dine In
              worksheet.getCell(`C${rowNum}`).value = bData.dinein.gross;
              worksheet.getCell(`D${rowNum}`).value = bData.dinein.deduction;
              worksheet.getCell(`E${rowNum}`).value = bData.dinein.cash;
              worksheet.getCell(`F${rowNum}`).value = bData.dinein.bankTransfer;
              worksheet.getCell(`G${rowNum}`).value = bData.dinein.card;
              worksheet.getCell(`H${rowNum}`).value = bData.dinein.cardFee;
              worksheet.getCell(`I${rowNum}`).value = bData.dinein.net;

              // GrabFood
              worksheet.getCell(`J${rowNum}`).value = bData.grabfood.gross;
              worksheet.getCell(`K${rowNum}`).value = bData.grabfood.deduction;
              worksheet.getCell(`L${rowNum}`).value = bData.grabfood.net;

              // FoodPanda
              worksheet.getCell(`M${rowNum}`).value = bData.foodpanda.gross;
              worksheet.getCell(`N${rowNum}`).value = bData.foodpanda.deduction;
              worksheet.getCell(`O${rowNum}`).value = bData.foodpanda.net;

              // Online
              worksheet.getCell(`P${rowNum}`).value = bData.online.net;
              worksheet.getCell(`Q${rowNum}`).value = bData.online.cash;
              worksheet.getCell(`R${rowNum}`).value = bData.online.bankTransfer;

              // Formatting cells as currency/number where appropriate
              for (let col = 3; col <= 18; col++) {
                const cell = worksheet.getCell(rowNum, col);
                cell.numFmt = '#,##0.00';
                cell.alignment = { horizontal: 'right' };
                cell.font = { name: 'Arial', size: 9 };
                cell.border = borderStyle;
              }

              // Add border to date & branch cells
              worksheet.getCell(rowNum, 1).border = borderStyle;
              worksheet.getCell(rowNum, 2).border = borderStyle;
              worksheet.getCell(rowNum, 1).font = { name: 'Arial', size: 9 };
              worksheet.getCell(rowNum, 2).font = { name: 'Arial', size: 9 };
              worksheet.getCell(rowNum, 1).alignment = { horizontal: 'left' };
              worksheet.getCell(rowNum, 2).alignment = { horizontal: 'center' };

              rowNum++;
            });
          });

          // Write Workbook
          const fileName = `Consolidated_Report_${fromDate}_${toDate}.xlsx`;
          const buffer = await workbook.xlsx.writeBuffer();
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          window.URL.revokeObjectURL(url);
          window.showToast('Consolidated Export successful!', 'success');
        } catch (err) {
          console.error(err);
          window.showToast('Failed to export consolidated Excel file', 'error');
        }
        return;
      }

      if (historyItems.length === 0) return alert('No data to export');

      // 1. Danh mục label phí
      const labelsMap = {
        merchantDiscount: 'Merchant Discount',
        deliveryDiscount: 'Delivery Discount',
        commission: 'Commission',
        marketingFee: channelId === 'foodpanda' ? 'Wait time fee' : 'Marketing Fee',
        orderCommission: 'Order Commission',
        adsFee: 'Ads Fee',
        dineOutPromo: 'Dine Out Promo',
        adjustmentFee: 'Adjustments',
        otherBaFees: 'Other Fees',
        productDiscount: 'Product Discount',
        invoiceDiscount: 'Invoice Discount',
        bankCardFee: 'Bank Card Fee',
        discount: 'Discount',
        tax: 'Tax Charge',
        others: 'Others Deductions',
        vendorRefunds: 'Other Incomes',
        grabDineOut: 'Grab Dine Out (Adj)',
    ayalaGrabDineOut: 'Grab Dine Out adjustment — already recorded in Grab (same day)',
        discount100: '100% Discount (Manager)'
      };

      // 2. Thu thập tất cả các loại phí có trong dữ liệu hiện tại để tạo cột động
      const deductionKeys = new Set();
      historyItems.forEach(item => {
        if (item.breakdown && item.breakdown.deductions) {
          Object.keys(item.breakdown.deductions).forEach(k => {
            if (k !== 'total_deduction') deductionKeys.add(k);
          });
        }
      });
      const dedKeyList = Array.from(deductionKeys);

      // Sort chronologically (smallest to largest date)
      const sortedItems = [...historyItems].sort((a, b) => new Date(a.date) - new Date(b.date));

      const fromDate = sortedItems[0].date;
      const toDate = sortedItems[sortedItems.length - 1].date;
      const fileName = `${cfg.label}_History_${fromDate}_${toDate}.xlsx`;

      window.showToast('Preparing Export...', 'info');

      try {
        const response = await fetch('/templates/_chanel__History__date-from-to__templates.xlsx');
        if (!response.ok) throw new Error('Template file not found');

        const arrayBuffer = await response.arrayBuffer();

        const ExcelJSModule = await import('exceljs');
        const ExcelJS = ExcelJSModule.default || ExcelJSModule;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        const worksheet = workbook.worksheets[0];

        // 3. Ghi Tiêu đề cho các cột mặc định (A-E)
        worksheet.getCell('A1').value = 'Date';
        worksheet.getCell('B1').value = 'Orders';
        worksheet.getCell('C1').value = 'Gross Revenue';
        worksheet.getCell('D1').value = 'Total Deductions';
        worksheet.getCell('E1').value = 'Net Revenue';

        // 4. Ghi Tiêu đề cho các cột phí động (Bắt đầu từ cột F - cột số 6)
        // Ptô màu tiêu đề cột động để dễ nhìn
        dedKeyList.forEach((key, i) => {
          const colNum = 6 + i;
          const cell = worksheet.getCell(1, colNum);
          cell.value = labelsMap[key] || key;
        });

        const isDineIn = (channelId === 'dinein');
        if (isDineIn) {
          const startCol = 6 + dedKeyList.length;
          worksheet.getCell(1, startCol).value = 'Cash';
          worksheet.getCell(1, startCol + 1).value = 'Bank Card';
          worksheet.getCell(1, startCol + 2).value = 'Bank Transfer';
        }

        // Populate data starting from Row 2
        sortedItems.forEach((item, index) => {
          const rowNum = 2 + index;
          worksheet.getCell(`A${rowNum}`).value = item.date;
          worksheet.getCell(`B${rowNum}`).value = item.orders;
          worksheet.getCell(`C${rowNum}`).value = item.financials.gross;
          worksheet.getCell(`D${rowNum}`).value = item.financials.totalDeductions;
          worksheet.getCell(`E${rowNum}`).value = item.financials.net;

          // 5. Điền giá trị chi tiết cho từng loại phí vào đúng cột
          dedKeyList.forEach((key, i) => {
            const colNum = 6 + i;
            const val = item.breakdown?.deductions?.[key] || 0;
            worksheet.getCell(rowNum, colNum).value = val;
          });

          if (isDineIn) {
            const startCol = 6 + dedKeyList.length;
            worksheet.getCell(rowNum, startCol).value = item.paymentMethods?.cash || 0;
            worksheet.getCell(rowNum, startCol + 1).value = item.paymentMethods?.bankCard || 0;
            worksheet.getCell(rowNum, startCol + 2).value = item.paymentMethods?.bankTransfer || 0;
          }
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);
        window.showToast('Export successful!', 'success');
      } catch (err) {
        console.error(err);
        window.showToast('Failed to export Excel file', 'error');
      }
    };
    }

    // --- GLOBAL FILTERS LOGIC ---
    const refreshData = () => {
      fetchChannelHistory(channelId);
      updateManualBtn();
    };

    // Listen for global header changes
    const branchSelector = document.getElementById('db-branch');
    const rangeInput = document.getElementById('db-date-range');
    const refreshBtn = document.getElementById('db-refresh');

    if (branchSelector) branchSelector.onchange = refreshData;
    if (rangeInput) rangeInput.onchange = refreshData;
    if (refreshBtn) refreshBtn.onclick = (e) => {
      e.preventDefault();
      refreshData();
    };

    // Listen for global filter changes (from main.js) without full re-render
    const globalFilterHandler = () => {
      refreshData();
      updateManualBtn();
    };
    window.addEventListener('global-filter-changed', globalFilterHandler);

    // Cleanup logic
    window.addEventListener('cleanup-page', () => {
      window.removeEventListener('global-filter-changed', globalFilterHandler);
    }, { once: true });

    // Clean up on page change (simplified for this structure)
    // Note: Since we recreate the page element, we should be careful with listeners
    // but in this app's architecture, old elements are GC'd.

    // Local history filters (date range + search)
    const localFrom = page.querySelector('#channel-from');
    const localTo = page.querySelector('#channel-to');
    const localSearch = page.querySelector('#channel-search');
    const localClear = page.querySelector('#channel-clear-btn');

    let channelSearchDebounce = null;
    if (localSearch) {
      localSearch.oninput = () => {
        clearTimeout(channelSearchDebounce);
        channelSearchDebounce = setTimeout(() => fetchChannelHistory(channelId), 250);
      };
    }
    if (localFrom) localFrom.onchange = () => fetchChannelHistory(channelId);
    if (localTo) localTo.onchange = () => fetchChannelHistory(channelId);
    if (localClear) {
      localClear.onclick = () => {
        if (localSearch) localSearch.value = '';
        if (localFrom) localFrom.value = '';
        if (localTo) localTo.value = '';
        fetchChannelHistory(channelId);
      };
    }

    // Initial Load
    fetchChannelHistory(channelId);

    btnSave.onclick = async () => {
      if (!currentResults) return;
      const branchId = document.getElementById('db-branch').value;
      const heroBtn = page.querySelector('#hero-save-btn');

      const datesInFile = Object.keys(currentResults);
      const conflictDates = await checkConflicts(channelId, branchId, datesInFile);

      let saveMode = 'overwrite'; // mặc định

      if (conflictDates.length > 0) {
        const resolution = await showConflictResolutionModal(conflictDates);
        if (resolution === 'cancel') return;
        saveMode = resolution;
      }

      // Loading State
      btnSave.disabled = true;
      if (heroBtn) {
        heroBtn.disabled = true;
        heroBtn.innerHTML = `<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Saving...`;
      }

      try {
        await saveToDatabase(channelId, branchId, currentResults, saveMode);

        // Success State
        if (window.showToast) window.showToast(`Data ${saveMode === 'merge' ? 'merged' : 'synced'} successfully!`, 'success');

        if (heroBtn) {
          heroBtn.style.background = "#10b981";
          heroBtn.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i> Data Successfully Synced!`;
          if (window.lucide) window.lucide.createIcons();
        }

        // Wait a bit then switch tab
        setTimeout(() => {
          btnSave.classList.add('hidden');
          if (heroBtn) heroBtn.style.background = "";
          window.dispatchEvent(new CustomEvent('switch-sub-tab', { detail: { tabId: 'history' } }));
          fetchChannelHistory(channelId);
        }, 1500);

      } catch (err) {
        console.error(err);
        if (window.showToast) window.showToast("Error saving: " + err.message, 'error');
        btnSave.disabled = false;
        if (heroBtn) {
          heroBtn.disabled = false;
          heroBtn.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i> Confirm & Commit Data`;
          if (window.lucide) window.lucide.createIcons();
        }
      }
    };

    async function showConflictResolutionModal(dates) {
      return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in';
        modal.innerHTML = `
             <div class="luxury-card bg-white dark:bg-[#141414] w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl animate-scale-up border-t border-white/60 dark:border-white/10">
                <div class="flex flex-col items-center text-center gap-4 mb-8">
                   <div class="w-16 h-16 rounded-3xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-500">
                      <i data-lucide="alert-triangle" class="w-8 h-8"></i>
                   </div>
                   <h3 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Data Conflict</h3>
                   <p class="text-xs text-slate-500 dark:text-white/60 leading-relaxed font-bold">
                      Data for <span class="text-amber-500">${dates.length} date(s)</span> already exists in the database. How would you like to proceed?
                   </p>
                </div>
                
                <div class="space-y-3">
                   <button id="res-overwrite" class="w-full py-4 rounded-2xl bg-rose-500 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 hover:scale-[1.02] active:scale-95 transition-all flex flex-col items-center">
                      <span>Overwrite Existing Data</span>
                      <span class="text-[8px] opacity-60 font-bold mt-1">Replace with new file content</span>
                   </button>
                   <button id="res-merge" class="w-full py-4 rounded-2xl bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all flex flex-col items-center">
                      <span>Accumulate / Merge</span>
                      <span class="text-[8px] opacity-60 font-bold mt-1">Add new values to existing records</span>
                   </button>
                   <button id="res-cancel" class="w-full py-4 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-400 text-[11px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">
                      Cancel Import
                   </button>
                </div>
             </div>
          `;
        document.body.appendChild(modal);
        if (window.lucide) window.lucide.createIcons();

        modal.querySelector('#res-overwrite').onclick = () => { modal.remove(); resolve('overwrite'); };
        modal.querySelector('#res-merge').onclick = () => { modal.remove(); resolve('merge'); };
        modal.querySelector('#res-cancel').onclick = () => { modal.remove(); resolve('cancel'); };
      });
    }

    async function readExcelFile(file) {
      const XLSX = await import('xlsx');
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
            resolve(data);
          } catch (err) { resolve([]); }
        };
        reader.onerror = () => resolve([]);
        reader.readAsArrayBuffer(file);
      });
    }

    async function processFiles(fileList) {
      previewArea.innerHTML = `<div class="text-center"><div class="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div><p class="text-sm">Merging ${fileList.length} file(s)...</p></div>`;

      let allDataRows = [];

      const branchId = (document.getElementById('db-branch')?.value || 'Pioneer Center').trim();
      const isAyalaDineIn = (channelId === 'dinein' && branchId === 'Ayala Cloverleaf');

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const data = await readExcelFile(file);

        if (data && data.length > 0) {
          const dataStartIdx = isAyalaDineIn ? 10 : 1;
          const headerIdx = isAyalaDineIn ? 9 : 0;

          if (i === 0) {
            allDataRows.push(data[headerIdx]); // Giữ lại dòng Header
          }
          // Nối phần dữ liệu của các file lại
          for (let j = dataStartIdx; j < data.length; j++) {
            if (data[j] && data[j].length > 0) {
              allDataRows.push(data[j]);
            }
          }
        }
      }

      if (allDataRows.length <= 1) {
        previewArea.innerHTML = `<p class="text-rose-500 text-sm">Error: No valid data found in selected files.</p>`;
        return;
      }

      // Group by Date cho toàn bộ dữ liệu đã gộp
      const isAllBranches = (branchId === 'All Branches');
      const grouped = (isAllBranches && (channelId === 'foodpanda' || channelId === 'dinein' || channelId === 'grabfood'))
        ? groupDataByBranchAndDate(allDataRows, channelId, cfg)
        : groupDataByDate(allDataRows, channelId, cfg, branchId);
      currentResults = grouped;

      try {
        // Kiểm tra xem những ngày này đã có dữ liệu chưa
        const conflictDates = await checkConflicts(channelId, branchId, Object.keys(grouped));

        updateUI(page, grouped, channelId, conflictDates);
        renderPreviewTable(allDataRows.slice(0, 30), previewArea, `Combined (${fileList.length} files)`, conflictDates, grouped, channelId);

        // btnSave stays hidden, logic is triggered by hero-save-btn
        btnSave.disabled = false;
      } catch (err) {
        console.error("UI Update Error:", err);
        previewArea.innerHTML = `<p class="text-rose-500 text-sm">UI Error: ${err.message}</p>`;
      }
    }

    async function checkConflicts(channelId, branchId, dateKeys) {
      const conflicts = [];

      const promises = dateKeys.map(async (key) => {
        let actualBranch = branchId;
        let actualDate = key;

        // Parse compound key cho All Branches: "branchId|||date"
        if (key.includes('|||')) {
          const parts = key.split('|||');
          actualBranch = parts[0];
          actualDate = parts[1];
        }

        const safeBranchName = actualBranch.replace(/\s+/g, '');
        const docId = `${channelId}_${safeBranchName}_${actualDate}`;
        const snap = await getDocs(query(collection(db, "daily_sales"), where("__name__", "==", docId)));
        if (!snap.empty) conflicts.push(key);
      });

      await Promise.all(promises);
      return conflicts;
    }
  }, 0);

  return page;
}

function groupDataByDate(data, channelId, cfg, branchId) {
  const dailyData = {};
  const isAyalaDineIn = (channelId === 'dinein' && (branchId || '').trim() === 'Ayala Cloverleaf');

  for (let i = 1; i < data.length; i++) {
    const row = data[i]; if (!row || row.length === 0) continue;

    const dateIdx = isAyalaDineIn ? 4 : cfg.colDate;
    const dateKey = isAyalaDineIn ? parseAyalaDate(row[dateIdx]) : standardizeDate(row[dateIdx], channelId);

    if (!dateKey) continue;

    if (!dailyData[dateKey]) dailyData[dateKey] = [];
    dailyData[dateKey].push(row);
  }

  const results = {};
  for (const [date, rows] of Object.entries(dailyData)) {
    results[date] = (isAyalaDineIn) ? calculateAyalaDineIn(rows) :
      (channelId === 'foodpanda') ? calculatePanda(rows, cfg) :
        (channelId === 'grabfood') ? calculateGrab(rows, cfg) :
          (channelId === 'dinein') ? calculateDineIn(rows, cfg) :
            calculateOnline(rows, cfg);
  }
  return results;
}

// Hàm mới: Group theo Branch + Date cho All Branches
// Đọc cột tương ứng để xác định chi nhánh (cột A cho dinein/panda, cột C cho grabfood), dùng compound key "branchId|||date"
function groupDataByBranchAndDate(data, channelId, cfg) {
  // Chọn branch map theo channel
  const branchMap = (channelId === 'dinein') 
    ? DINEIN_BRANCH_MAP 
    : (channelId === 'grabfood') 
      ? GRAB_BRANCH_MAP 
      : PANDA_BRANCH_MAP;

  const branchDailyData = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i]; if (!row || row.length === 0) continue;

    // Đọc cột xác định chi nhánh: grabfood dùng cột C (index 2), các kênh khác dùng cột A (index 0)
    const colIdx = (channelId === 'grabfood') ? 2 : 0;
    const rawBranch = String(row[colIdx] || '').trim();
    let mappedBranch = branchMap[rawBranch];
    // Fuzzy fallback: nếu không match chính xác, kiểm tra từ khóa chi nhánh
    if (!mappedBranch) {
      const rawUpper = rawBranch.toUpperCase();
      if (rawUpper.includes('MANILA CITY')) mappedBranch = 'Catholic Trade';
      else if (rawUpper.includes('QUEZON CITY')) mappedBranch = 'Ayala Cloverleaf';
      else if (rawUpper.includes('UST')) mappedBranch = 'UST';
    }
    if (!mappedBranch) continue; // Bỏ qua nếu không map được

    const dateKey = standardizeDate(row[cfg.colDate], channelId);
    if (!dateKey) continue;

    const compoundKey = `${mappedBranch}|||${dateKey}`;
    if (!branchDailyData[compoundKey]) branchDailyData[compoundKey] = [];
    branchDailyData[compoundKey].push(row);
  }

  const results = {};
  for (const [compoundKey, rows] of Object.entries(branchDailyData)) {
    // Chọn hàm tính toán theo channel — logic tính toán KHÔNG thay đổi
    results[compoundKey] = (channelId === 'dinein')
      ? calculateDineIn(rows, cfg)
      : (channelId === 'grabfood')
        ? calculateGrab(rows, cfg)
        : calculatePanda(rows, cfg);
  }
  return results;
}

async function saveToDatabase(channelId, branchId, results, mode = 'overwrite') {
  // Validate every day before any database write starts.
  for (const [key, result] of Object.entries(results)) {
    validateImportedPayments(channelId, key.includes('|||') ? key.split('|||')[0] : branchId, result);
  }
  const batchId = `BATCH_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  let totalRows = 0;
  const { doc, getDoc, writeBatch } = await import('firebase/firestore');

  const safeBranchName = branchId.replace(/\s+/g, '');

  // Use a batch or individual updates? Since we might need to read first for merge, we'll process with a loop
  const promises = Object.entries(results).map(async ([key, res]) => {
    totalRows += (res.orders || 0);

    // Parse compound key cho All Branches: "branchId|||date"
    let actualBranch = branchId;
    let actualDate = key;
    if (key.includes('|||')) {
      const parts = key.split('|||');
      actualBranch = parts[0];
      actualDate = parts[1];
    }

    const actualSafeBranch = actualBranch.replace(/\s+/g, '');
    const docId = `${channelId}_${actualSafeBranch}_${actualDate}`;
    const docRef = doc(db, "daily_sales", docId);

    let dataToSave = {
      channelId,
      branchId: actualBranch,
      date: actualDate,
      orders: res.orders,
      financials: {
        gross: res.gross,
        net: res.net,
        totalDeductions: res.totalDed
      },
      breakdown: res.breakdown,
      hourlyNet: res.hourlyNet || null,
      importBatchId: batchId,
      updatedAt: serverTimestamp()
    };

    // Persist tender totals for new imports and overwrites, not only merges.
    if (res.paymentMethods) {
      dataToSave.paymentMethods = { ...res.paymentMethods };
    }

    if (res.reconciliation) {
      dataToSave.reconciliation = res.reconciliation;
    }
    if (res.actualNetPayout !== undefined) {
      dataToSave.actualNetPayout = res.actualNetPayout;
    }
    if (res.dineOutPayout !== undefined) {
      dataToSave.dineOutPayout = res.dineOutPayout;
    }
    if (res.adjustments !== undefined) {
      dataToSave.adjustments = res.adjustments;
    }
    if (res.incidentCount !== undefined) {
      dataToSave.incidentCount = res.incidentCount;
      if (!dataToSave.breakdown) dataToSave.breakdown = {};
      if (!dataToSave.breakdown.kpi) dataToSave.breakdown.kpi = {};
      dataToSave.breakdown.kpi.incidentCount = res.incidentCount;
    }

    if (mode === 'merge') {
      const existingSnap = await getDoc(docRef);
      if (existingSnap.exists()) {
        const old = existingSnap.data();

        // Merge Financials
        dataToSave.orders = (old.orders || 0) + res.orders;
        dataToSave.financials.gross = (old.financials?.gross || 0) + res.gross;
        dataToSave.financials.net = (old.financials?.net || 0) + res.net;
        dataToSave.financials.totalDeductions = (old.financials?.totalDeductions || 0) + res.totalDed;

        // Merge Breakdown Deductions
        if (res.breakdown && res.breakdown.deductions) {
          const mergedDeductions = { ...(old.breakdown?.deductions || {}) };
          Object.entries(res.breakdown.deductions).forEach(([k, v]) => {
            mergedDeductions[k] = (mergedDeductions[k] || 0) + v;
          });
          dataToSave.breakdown.deductions = mergedDeductions;
        }

        // Add beverage counts only when both batches have known SKU coverage.
        if (channelId === 'dinein') {
          const oldCount = old.breakdown?.kpi?.drinkOrders;
          const newCount = res.breakdown?.kpi?.drinkOrders;
          dataToSave.breakdown.kpi = {
            ...(res.breakdown?.kpi || {}),
            drinkOrders: Number.isFinite(oldCount) && Number.isFinite(newCount) ? oldCount + newCount : null
          };
        }

        // Preserve all income components, not only deduction components, when merging batches.
        if (res.breakdown?.incomes) {
          const incomes = { ...(old.breakdown?.incomes || {}) };
          for (const [key, value] of Object.entries(res.breakdown.incomes)) {
            incomes[key] = (Number(incomes[key]) || 0) + value;
          }
          dataToSave.breakdown.incomes = incomes;
        }
        if (channelId === 'grabfood') {
          dataToSave.adjustments = (old.adjustments ?? ((old.breakdown?.incomes?.adjustmentCredits || 0) - (old.breakdown?.deductions?.adjustmentFee || 0))) + (res.adjustments || 0);
          dataToSave.actualNetPayout = dataToSave.financials.net;
        }

        // Grab payout is cumulative when importing an additional batch for the day.
        if (channelId === 'grabfood' && res.dineOutPayout !== undefined) {
          dataToSave.dineOutPayout = (old.dineOutPayout ?? old.breakdown?.incomes?.dineOutPayout ?? 0) + res.dineOutPayout;
          dataToSave.breakdown.incomes = {
            ...dataToSave.breakdown.incomes,
            dineOutPayout: Math.max(0, dataToSave.dineOutPayout)
          };
        }

        // Merge hourlyNet
        if (res.hourlyNet) {
          const mergedHourly = { ...(old.hourlyNet || {}) };
          Object.entries(res.hourlyNet).forEach(([hr, val]) => {
            mergedHourly[hr] = (mergedHourly[hr] || 0) + val;
          });
          dataToSave.hourlyNet = mergedHourly;
        }

        // Merge paymentMethods
        if (res.paymentMethods) {
          const mergedPayments = { ...(old.paymentMethods || { cash: 0, bankCard: 0, bankTransfer: 0 }) };
          mergedPayments.cash = (mergedPayments.cash || 0) + res.paymentMethods.cash;
          mergedPayments.bankCard = (mergedPayments.bankCard || 0) + res.paymentMethods.bankCard;
          mergedPayments.bankTransfer = (mergedPayments.bankTransfer || 0) + res.paymentMethods.bankTransfer;
          dataToSave.paymentMethods = mergedPayments;
        }
      }
    }

    // GrabFood specific extra collections
    if (channelId === 'grabfood') {
      if (res.campaignSummaries && res.campaignSummaries.length > 0) {
        for (const camp of res.campaignSummaries) {
          const campSlug = camp.campaignGroup.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          const campDocId = `grab_ads_${actualSafeBranch}_${actualDate}_${campSlug}`;
          await setDoc(doc(db, "grab_advertising_summary", campDocId), {
            reportDate: actualDate,
            branch: actualBranch,
            campaignGroup: camp.campaignGroup,
            entryCount: camp.entryCount,
            spendExVAT: camp.spendExVAT,
            vat: camp.vat,
            totalCostInclVAT: camp.totalCostInclVAT,
            importBatchId: batchId,
            updatedAt: serverTimestamp()
          });
        }
      }

      if (res.adjustmentDetails && res.adjustmentDetails.length > 0) {
        for (let idx = 0; idx < res.adjustmentDetails.length; idx++) {
          const adj = res.adjustmentDetails[idx];
          // Skip empty fallback records without changing stable import indices.
          if (adj.reasonGroup === 'Unclassified' && adj.payoutImpact === 0) continue;
          const adjDocId = `grab_adj_${actualSafeBranch}_${actualDate}_${idx}`;
          await setDoc(doc(db, "grab_adjustments", adjDocId), {
            transactionId: adj.transactionId,
            linkedOrderId: adj.linkedOrderId,
            branch: actualBranch,
            date: actualDate,
            category: adj.category,
            subcategory: adj.subcategory || '',
            reasonGroup: adj.reasonGroup,
            originalDescription: adj.originalDescription,
            payoutImpact: adj.payoutImpact,
            sourceStatus: adj.sourceStatus || 'COMPLETED',
            importBatchId: batchId,
            updatedAt: serverTimestamp()
          });
        }
      }
    }

    if (channelId === 'dinein' && actualBranch === 'Ayala Cloverleaf') {
      const existing = await getDoc(docRef);
      if (existing.exists() && existing.data().productImport) {
        const old = existing.data();
        dataToSave.hourlyNet = old.hourlyNet;
        dataToSave.hourlyBills = old.hourlyBills;
        dataToSave.productImport = old.productImport;
        dataToSave.breakdown.kpi = { ...dataToSave.breakdown.kpi, ...old.breakdown?.kpi };
      }
    }
    return saveWithAyalaDineOut(db, docRef, dataToSave);
  });

  // Create log entry
  const logPromise = setDoc(doc(db, "import_logs", batchId), {
    batchId,
    timestamp: serverTimestamp(),
    type: channelId,
    branchId: branchId,
    rowCount: totalRows,
    collections: channelId === 'grabfood' ? ["daily_sales", "grab_advertising_summary", "grab_adjustments"] : ["daily_sales"],
    status: "active"
  });

  await Promise.all([...promises, logPromise]);
  window.dispatchEvent(new CustomEvent('sales-updated'));
}

// Logic tính toán cho từng kênh (đã cập nhật cleanNumber)
function calculateOnline(rows, cfg) {
  let gross = 0;
  const hourlyNet = {};

  rows.forEach(row => { 
    const val = cleanNumber(row[cfg.colGross]);
    gross += val;

    const dateVal = row[cfg.colDate];
    const { hour } = standardizeDateWithHour(dateVal, 'online');
    const hrStr = String(hour).padStart(2, '0');
    hourlyNet[hrStr] = (hourlyNet[hrStr] || 0) + val;
  });

  const breakdown = {
    deductions: {},
    incomes: {}
  };

  return {
    net: gross, gross, orders: rows.length, totalDed: 0, breakdown, details: [
      { label: 'Gross Sale', val: gross, color: 'text-slate-600' },
      { label: 'Total Deduction', val: 0, color: 'text-rose-700 font-bold', isDed: true }
    ],
    hourlyNet
  };
}

function calculateGrab(rows, cfg) {
  const map = getGrabHeaderMap(rows[0] && typeof rows[0][0] === 'string' ? rows[0] : null);

  let gross = 0;
  let net = 0; // Actual Net Payout = Exact sum of Column BA
  let merchantProdDisc = 0;
  let merchantDelivDisc = 0;
  let comm = 0;
  let marketing = 0;
  let orderComm = 0;
  let feeTaxMemo = 0;
  let dineOutPromo = 0;
  let adsExVAT = 0;
  let adVAT = 0;
  let adsInclVAT = 0;
  let totalDeductions = 0;
  let totalCredits = 0;
  let netAdjustment = 0;
  let otherPayoutImpact = 0;

  const campaignMap = {}; // campaignGroup -> { campaignGroup, entryCount, spendExVAT, vat, totalCostInclVAT }
  const adjustmentDetails = [];
  const hourlyGross = {};
  const hourlyNet = {};
  const orderIdSet = new Set();

  rows.forEach((row, rowIdx) => {
    if (!row || row.length === 0) return;
    const cat = String(row[map.colCategory] || '').trim();
    const catUpper = cat.toUpperCase();
    const g = cleanNumber(row[map.colGross]);
    const orderId = String(row[map.colId] || '').trim();
    const descBK = String(row[map.colDesc !== undefined ? map.colDesc : 62] || '').trim();
    const detailBM = String(row[map.colDetail !== undefined ? map.colDetail : 64] || '').trim();
    const desc = descBK;
    const fullDesc = (descBK && detailBM && descBK !== detailBM) ? `${descBK} (${detailBM})` : (descBK || detailBM || '');
    const aVal = cleanNumber(row[map.colAds]); // Column BA Payout Amount

    // Accumulate total Net payout directly from Column BA
    net += aVal;

    const dateVal = row[map.colDate];
    const { hour } = standardizeDateWithHour(dateVal, 'grabfood');
    const hrStr = String(hour).padStart(2, '0');

    const descUpper = fullDesc.toUpperCase();
    const isAd = catUpper.includes('ADVERTISEMENT') || catUpper.includes('ADS') || descUpper.includes('ADVERTISEMENT') || descUpper.includes('ADS');
    const isAdjustment = catUpper.includes('ADJUSTMENT') || catUpper.includes('REIMBURSEMENT') || catUpper.includes('PENALTY') || descUpper.includes('ADJUSTMENT') || descUpper.includes('REIMBURSEMENT') || descUpper.includes('PENALTY');
    
    const isIncomeCat = catUpper === 'INCOME' || catUpper.includes('INCOME') || catUpper.includes('GRAB DINEOUT') || catUpper.includes('DINEOUT') || descUpper.includes('INCOME');
    const isDineOut = isIncomeCat ||
                      catUpper.includes('DINE OUT') || catUpper.includes('DINE-OUT') || catUpper.includes('DINE_OUT') || catUpper.includes('DINE IN') || catUpper.includes('DINE-IN') ||
                      descUpper.includes('DINE OUT') || descUpper.includes('DINEOUT') || descUpper.includes('DINE-OUT') || descUpper.includes('DINE_OUT') || descUpper.includes('DINE IN') || descUpper.includes('DINE-IN');
    const isPayment = (g > 0 && !isAd && !isAdjustment && !isDineOut);

    if (isPayment) {
      const pDisc = Math.abs(cleanNumber(row[map.colMerchantProductDisc || 35]));
      const dDisc = Math.abs(cleanNumber(row[map.colMerchantDeliveryDisc || 36]));
      const cFee = Math.abs(cleanNumber(row[map.colComm || 46]));
      const mFee = Math.abs(cleanNumber(row[map.colMarketing || 44]));
      const oComm = Math.abs(cleanNumber(row[map.colOrderComm || 47]));

      merchantProdDisc += pDisc;
      merchantDelivDisc += dDisc;
      comm += cFee;
      marketing += mFee;
      orderComm += oComm;

      const rowDeductions = pDisc + dDisc + cFee + mFee + oComm;
      const rowGross = aVal + rowDeductions;
      gross += rowGross;

      hourlyGross[hrStr] = (hourlyGross[hrStr] || 0) + rowGross;
      hourlyNet[hrStr] = (hourlyNet[hrStr] || 0) + aVal;

      if (orderId) orderIdSet.add(orderId);
    } else if (isAd) {
      const absCost = Math.abs(aVal);
      const vatPart = Math.round((absCost * 12 / 112) * 100) / 100;
      const exVatPart = absCost - vatPart;

      adsInclVAT += absCost;
      adVAT += vatPart;
      adsExVAT += exVatPart;

      const campName = normalizeGrabCampaign(descBK || fullDesc);
      if (!campaignMap[campName]) {
        campaignMap[campName] = { campaignGroup: campName, entryCount: 0, spendExVAT: 0, vat: 0, totalCostInclVAT: 0 };
      }
      campaignMap[campName].entryCount += 1;
      campaignMap[campName].spendExVAT += exVatPart;
      campaignMap[campName].vat += vatPart;
      campaignMap[campName].totalCostInclVAT += absCost;
    } else if (isAdjustment) {
      if (aVal < 0) {
        totalDeductions += Math.abs(aVal);
      } else {
        totalCredits += aVal;
        gross += aVal;
      }
      netAdjustment += aVal;

      const reasonGroup = classifyGrabReasonGroup(cat, detailBM, descBK);
      adjustmentDetails.push({
        transactionId: String(row[map.colId] || `TX_${rowIdx}`).trim(),
        linkedOrderId: orderId,
        category: cat,
        subcategory: detailBM,
        reasonGroup,
        originalDescription: fullDesc,
        payoutImpact: aVal,
        sourceStatus: 'COMPLETED'
      });
    } else if (isDineOut) {
      const dVal = Math.abs(aVal) || g;
      dineOutPromo += dVal;
      gross += dVal;
    } else {
      otherPayoutImpact += aVal;
      if (aVal > 0) {
        gross += aVal;
      } else {
        totalDeductions += Math.abs(aVal);
        const reasonGroup = classifyGrabReasonGroup(cat, detailBM, descBK);
        adjustmentDetails.push({
          transactionId: String(row[map.colId] || `TX_${rowIdx}`).trim(),
          linkedOrderId: orderId,
          category: cat || 'Other',
          subcategory: detailBM,
          reasonGroup,
          originalDescription: fullDesc,
          payoutImpact: aVal,
          sourceStatus: 'COMPLETED'
        });
      }
    }
  });

  const orders = orderIdSet.size || rows.length;
  const merchantPromo = merchantProdDisc + merchantDelivDisc;
  const commissionAndSuccessFees = comm + marketing + orderComm;

  const deliveryOrderGross = gross - dineOutPromo - (netAdjustment > 0 ? netAdjustment : 0) - (otherPayoutImpact > 0 ? otherPayoutImpact : 0);
  const calculatedOrderPayout = deliveryOrderGross - merchantPromo - commissionAndSuccessFees;

  const calculatedNetPayout = gross - merchantPromo - commissionAndSuccessFees - adsInclVAT + (netAdjustment < 0 ? netAdjustment : 0) + (otherPayoutImpact < 0 ? otherPayoutImpact : 0);
  const difference = Math.round((calculatedNetPayout - net) * 100) / 100;

  const campaignSummaries = Object.values(campaignMap);

  const totalDed = merchantPromo + commissionAndSuccessFees + adsInclVAT + Math.abs(netAdjustment < 0 ? netAdjustment : 0);

  const breakdown = {
    deductions: {
      merchantProductDiscount: merchantProdDisc,
      merchantDeliveryDiscount: merchantDelivDisc,
      merchantDiscount: merchantPromo,
      marketingSuccessFee: marketing,
      channelCommission: comm,
      orderCommission: orderComm,
      commission: commissionAndSuccessFees,
      adsFee: adsInclVAT,
      adsExVAT: adsExVAT,
      adVAT: adVAT,
      adjustmentFee: Math.abs(netAdjustment < 0 ? netAdjustment : 0),
      otherBaFees: Math.abs(otherPayoutImpact < 0 ? otherPayoutImpact : 0)
    },
    incomes: {
      adjustmentCredits: netAdjustment > 0 ? netAdjustment : 0,
      dineOutPayout: dineOutPromo > 0 ? dineOutPromo : 0,
      otherIncomes: otherPayoutImpact > 0 ? otherPayoutImpact : 0
    }
  };

  return {
    net, // Actual Net Payout from Column BA
    gross,
    orders,
    incidentCount: countIncidentOrders(adjustmentDetails),
    merchantProductDiscount: merchantProdDisc,
    merchantDeliveryDiscount: merchantDelivDisc,
    merchantPromo,
    marketingSuccessFee: marketing,
    channelCommission: comm,
    orderCommission: orderComm,
    commissionAndSuccessFees,
    feeTax: feeTaxMemo,
    orderPayout: calculatedOrderPayout,
    adsExVAT,
    adVAT,
    adsInclVAT,
    adjustments: netAdjustment,
    totalDeductions,
    totalCredits,
    dineOutPayout: dineOutPromo,
    otherPayoutImpact,
    actualNetPayout: net,
    reconciliation: {
      calculatedOrderPayout,
      calculatedNetPayout,
      actualNetPayout: net,
      difference
    },
    campaignSummaries,
    adjustmentDetails,
    totalDed,
    breakdown,
    details: [
      { label: 'Gross Sales', val: gross, color: 'text-slate-600' },
      { label: 'Merchant Product Discount', val: merchantProdDisc, color: 'text-rose-500', isDed: true },
      { label: 'Merchant Delivery Discount', val: merchantDelivDisc, color: 'text-rose-500', isDed: true },
      { label: 'Marketing Success Fee', val: marketing, color: 'text-rose-500', isDed: true },
      { label: 'Channel Commission', val: comm, color: 'text-rose-500', isDed: true },
      { label: 'Order Commission', val: orderComm, color: 'text-rose-500', isDed: true },
      { label: 'Ads incl VAT', val: adsInclVAT, color: 'text-rose-500 font-bold', isDed: true },
      { label: 'Adjustments (Net)', val: netAdjustment, color: netAdjustment < 0 ? 'text-rose-500' : 'text-emerald-500' },
      { label: 'Actual Net Payout (Col BA)', val: net, color: 'text-emerald-600 font-black' }
    ],
    hourlyNet
  };
}

function calculatePanda(rows, cfg) {
  let gross = 0, disc = 0, comm = 0, tax = 0, marketing = 0, ads = 0, others = 0, refunds = 0, orders = 0;
  const hourlyNet = {};

  rows.forEach(row => {
    // Logic Hủy đơn: ô P trống VÀ (ô S HOẶC T HOẶC U có dữ liệu)
    const pVal = String(row[cfg.colCheckP] || '').trim();
    const sVal = String(row[cfg.colCheckS] || '').trim();
    const tVal = String(row[cfg.colCheckT] || '').trim();
    const uVal = String(row[cfg.colCheckU] || '').trim();

    const isCancelled = (pVal === '') && (sVal !== '' || tVal !== '' || uVal !== '');

    let g = cleanNumber(row[cfg.colGross]);
    let rowGross = 0;

    // Nếu không hủy thì mới cộng vào Gross Sale
    if (!isCancelled && g !== 0) {
      rowGross = g;
      gross += g;
      orders++;
    }

    // Deduction tính tổng toàn bộ cột theo yêu cầu
    const rowDisc = Math.abs(cleanNumber(row[cfg.colDiscount]));
    const rowComm = Math.abs(cleanNumber(row[cfg.colComm]));
    const rowTax = Math.abs(cleanNumber(row[cfg.colTax]));
    const rowMarketing = Math.abs(cleanNumber(row[cfg.colMarketing]));
    const rowAds = Math.abs(cleanNumber(row[cfg.colAds]));
    const rowOthers = Math.abs(cleanNumber(row[cfg.colOthers]));

    disc += rowDisc;
    comm += rowComm;
    tax += rowTax;
    marketing += rowMarketing;
    ads += rowAds;
    others += rowOthers;

    // Other Incomes (Vendor Refunds) - tổng cột Y
    const rowRefund = cleanNumber(row[cfg.colRefunds]);
    refunds += rowRefund;

    const rowTotalDed = rowDisc + rowComm + rowTax + rowMarketing + rowAds + rowOthers;
    const rowNet = rowGross - rowTotalDed + rowRefund;

    const dateVal = row[cfg.colDate];
    const { hour } = standardizeDateWithHour(dateVal, 'foodpanda');
    const hrStr = String(hour).padStart(2, '0');
    hourlyNet[hrStr] = (hourlyNet[hrStr] || 0) + rowNet;
  });

  const totalDed = disc + comm + tax + marketing + ads + others;

  const breakdown = {
    deductions: {
      discount: disc,
      commission: comm,
      tax: tax,
      marketingFee: marketing,
      adsFee: ads,
      others: others
    },
    incomes: {
      vendorRefunds: refunds
    }
  };

  return {
    net: gross - totalDed + refunds,
    gross,
    orders,
    totalDed,
    breakdown,
    details: [
      { label: 'Gross Sale', val: gross, color: 'text-slate-600' },
      { label: 'Discount', val: disc, color: 'text-rose-500', isDed: true },
      { label: 'Commission Fee', val: comm, color: 'text-rose-500', isDed: true },
      { label: 'Tax Charge', val: tax, color: 'text-rose-500', isDed: true },
      { label: 'Wait time fee', val: marketing, color: 'text-rose-500', isDed: true },
      { label: 'Ads Fee', val: ads, color: 'text-rose-500', isDed: true },
      { label: 'Others Deductions', val: others, color: 'text-rose-500', isDed: true },
      { label: 'Other Incomes', val: refunds, color: 'text-emerald-500', isIncome: true },
      { label: 'Total Deduction', val: totalDed, color: 'text-rose-700 font-bold', isDed: true }
    ],
    hourlyNet
  };
}

function calculateAyalaDineIn(rows) {
  let gross = 0, orders = 0, vatAdj = 0, seniorDisc = 0, pwdDisc = 0, otherDisc = 0, voidInv = 0;

  rows.forEach(row => {
    // Ayala POS specific columns:
    // B(1)=Date, I(8)=Orders, T(19)=Gross, W(22)=VAT Adj, AA(26)=Senior, AB(27)=PWD, AE(30)=Other Disc, AG(32)=Void
    orders += cleanNumber(row[8]);
    gross += cleanNumber(row[19]);
    vatAdj += cleanNumber(row[22]);
    seniorDisc += cleanNumber(row[26]);
    pwdDisc += cleanNumber(row[27]);
    otherDisc += cleanNumber(row[30]);
    voidInv += cleanNumber(row[32]);
  });

  const adjustedGross = gross - voidInv;
  const totalDed = vatAdj + seniorDisc + pwdDisc + otherDisc;
  const net = adjustedGross - totalDed;

  const breakdown = {
    deductions: {
      vatAdjustment: vatAdj,
      seniorCitizenDiscount: seniorDisc,
      pwdDiscount: pwdDisc,
      otherDiscount: otherDisc,
      voidInvoice: voidInv
    },
    incomes: {}
  };

  return {
    net, gross: adjustedGross, orders, totalDed, breakdown,
    details: [
      { label: 'Gross Sale', val: gross, color: 'text-slate-600' },
      { label: 'VAT Adjustment', val: vatAdj, color: 'text-rose-500', isDed: true },
      { label: 'Senior Citizen Disc.', val: seniorDisc, color: 'text-rose-500', isDed: true },
      { label: 'PWD Discount', val: pwdDisc, color: 'text-rose-500', isDed: true },
      { label: 'Other Discount', val: otherDisc, color: 'text-rose-500', isDed: true },
      { label: 'Void Invoice', val: voidInv, color: 'text-rose-500', isDed: true },
      { label: 'Total Deduction', val: totalDed, color: 'text-rose-700 font-bold', isDed: true }
    ]
  };
}

function calculateDineIn(rows, cfg) {
  let gross = 0, productDisc = 0, invoiceDisc = 0, totalBankTrans = 0, grabDineOut = 0, discount100 = 0;
  let totalCash = 0, totalBankCard = 0, totalBankTransfer = 0;
  const ids = new Set();

  const orderRowsMap = {};
  rows.forEach(row => {
    const id = String(row[cfg.colId] || '').trim();
    if (!id) return;
    if (!orderRowsMap[id]) orderRowsMap[id] = [];
    orderRowsMap[id].push(row);
  });

  const hourlyNet = {};

  Object.entries(orderRowsMap).forEach(([id, oRows]) => {
    ids.add(id);

    let orderGross = 0;
    let orderProductDisc = 0;
    let orderInvoiceDisc = 0;
    let orderBankTrans = 0;
    let orderDiscount100 = 0;

    const firstRow = oRows[0];
    const dateVal = firstRow[cfg.colDate];
    const { hour } = standardizeDateWithHour(dateVal, 'dinein');
    const hrStr = String(hour).padStart(2, '0');

    const akVal = cleanNumber(firstRow[36]);
    const alVal = cleanNumber(firstRow[cfg.colBankTrans]); // AL is 37
    const amVal = cleanNumber(firstRow[38]);
    const anVal = cleanNumber(firstRow[39]);
    const aiVal = cleanNumber(firstRow[34]);
    const ajVal = cleanNumber(firstRow[35]);

    const isZeroPaymentColumns = (akVal === 0 && alVal === 0 && amVal === 0 && anVal === 0);

    if (isZeroPaymentColumns) {
      if (aiVal === 0 && ajVal === 0) {
        oRows.forEach(row => {
          const qty = cleanNumber(row[cfg.colQty]);
          const uPrice = cleanNumber(row[cfg.colUnitPrice]);
          orderGross += (qty * uPrice);
        });
        gross += orderGross;
        discount100 += orderGross;
        hourlyNet[hrStr] = (hourlyNet[hrStr] || 0) + 0;
        return;
      } else {
        oRows.forEach(row => {
          const qty = cleanNumber(row[cfg.colQty]);
          const uPrice = cleanNumber(row[cfg.colUnitPrice]);
          orderGross += (qty * uPrice);
        });
        grabDineOut += orderGross;
        hourlyNet[hrStr] = (hourlyNet[hrStr] || 0) + 0;
        return;
      }
    }

    oRows.forEach(row => {
      const qty = cleanNumber(row[cfg.colQty]);
      const uPrice = cleanNumber(row[cfg.colUnitPrice]);
      const rowGross = (qty * uPrice);
      orderGross += rowGross;

      const uDisc = cleanNumber(row[cfg.colUnitDisc]);
      orderProductDisc += (qty * uDisc);
    });

    orderInvoiceDisc = cleanNumber(firstRow[cfg.colInvDisc]);
    if (alVal > 0) {
      orderBankTrans = alVal;
    }

    const orderBankFee = (orderBankTrans / 100) * 2;
    const orderTotalDed = orderProductDisc + orderInvoiceDisc + orderBankFee;
    const orderNet = orderGross - orderTotalDed;

    gross += orderGross;
    productDisc += orderProductDisc;
    invoiceDisc += orderInvoiceDisc;
    totalBankTrans += orderBankTrans;

    totalCash += akVal;
    totalBankCard += alVal;
    totalBankTransfer += amVal;

    hourlyNet[hrStr] = (hourlyNet[hrStr] || 0) + orderNet;
  });

  const bankFee = (totalBankTrans / 100) * 2;
  const totalDed = productDisc + invoiceDisc + bankFee + discount100;

  const breakdown = {
    kpi: { drinkOrders: countDineInDrinkOrders(orderRowsMap, cfg.colQty), drinkRule: 'sku-AS-D-DR-v1' },
    deductions: {
      productDiscount: productDisc,
      invoiceDiscount: invoiceDisc,
      bankCardFee: bankFee,
      grabDineOut: grabDineOut,
      discount100: discount100
    },
    incomes: {}
  };

  return {
    net: gross - totalDed,
    gross,
    orders: ids.size,
    totalDed,
    breakdown,
    details: [
      { label: 'Gross Sale', val: gross, color: 'text-slate-600' },
      { label: 'Grab Dine Out', val: grabDineOut, color: 'text-amber-600 font-medium', isDed: true },
      { label: '100% Discount', val: discount100, color: 'text-rose-400', isDed: true },
      { label: 'Product Discount', val: productDisc, color: 'text-rose-500', isDed: true },
      { label: 'Invoice Discount', val: invoiceDisc, color: 'text-rose-500', isDed: true },
      { label: 'Bank Card Fee', val: bankFee, color: 'text-rose-500 font-medium', isDed: true },
      { label: 'Total Deduction', val: totalDed, color: 'text-rose-700 font-bold', isDed: true }
    ],
    hourlyNet,
    paymentMethods: {
      cash: totalCash,
      bankCard: totalBankCard,
      bankTransfer: totalBankTransfer
    }
  };
}

function updateUI(page, dailyResults, channelId, conflictDates = []) {
  const summaryArea = page.querySelector('#results-summary');
  const breakdownArea = page.querySelector('#breakdown-area');

  const dates = Object.keys(dailyResults).sort();
  if (dates.length === 0) {
    summaryArea.innerHTML = '<div class="col-span-full p-10 text-center text-slate-400 italic">No valid data found for the selected period.</div>';
    return;
  }

  const fmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

  // Aggregate totals
  let totalGross = 0, totalNet = 0, totalOrders = 0, totalDed = 0, totalIncome = 0;
  const aggDeductions = {};
  const aggIncomes = {};

  // Tính unique days và branches cho All Branches mode
  const hasCompoundKeys = dates.some(d => d.includes('|||'));
  const uniqueDays = hasCompoundKeys
    ? new Set(dates.map(d => d.split('|||')[1])).size
    : dates.length;
  const uniqueBranches = hasCompoundKeys
    ? new Set(dates.map(d => d.split('|||')[0])).size
    : 0;

  dates.forEach(d => {
    const res = dailyResults[d];
    if (!res) return;

    totalGross += (res.gross || 0);
    totalNet += (res.net || 0);
    totalOrders += (res.orders || 0);
    totalDed += (res.totalDed || 0);

    // Merge breakdowns safely
    if (res.breakdown) {
      if (res.breakdown.deductions) {
        for (const [key, val] of Object.entries(res.breakdown.deductions)) {
          aggDeductions[key] = (aggDeductions[key] || 0) + val;
        }
      }
      if (res.breakdown.incomes) {
        for (const [key, val] of Object.entries(res.breakdown.incomes)) {
          const v = val || 0;
          aggIncomes[key] = (aggIncomes[key] || 0) + v;
          totalIncome += v;
        }
      }
    }
  });

  const labelsMap = {
    merchantDiscount: 'Merchant Discount',
    deliveryDiscount: 'Delivery Discount',
    commission: 'Commission',
    marketingFee: channelId === 'foodpanda' ? 'Wait time fee' : 'Marketing Fee',
    orderCommission: 'Order Commission',
    adsFee: 'True Ads Fee',
    dineOutPromo: 'Dine Out Promo',
    adjustmentFee: 'Adjustments',
    otherBaFees: 'Other Fees',
    productDiscount: 'Product Discount',
    invoiceDiscount: 'Invoice Discount',
    bankCardFee: 'Bank Card Fee',
    discount: 'Discount',
    tax: 'Tax Charge',
    adsFee: 'Ads Fee',
    others: 'Others Deductions',
    vendorRefunds: 'Other Incomes',
    grabDineOut: 'Grab Dine Out (Adj)',
    ayalaGrabDineOut: 'Grab Dine Out adjustment — already recorded in Grab (same day)',
    discount100: '100% Discount (Manager)',
    vatAdjustment: 'VAT Adjustment',
    seniorCitizenDiscount: 'Senior Citizen Discount',
    pwdDiscount: 'PWD Discount',
    otherDiscount: 'Other Discount',
    voidInvoice: 'Void Invoice'
  };

  const deductionList = Object.entries(aggDeductions)
    .filter(([key, val]) => (val !== 0 || key === 'invoiceDiscount' || key === 'discount100') && key !== 'total_deduction')
    .map(([key, val]) => ({
      label: labelsMap[key] || key,
      val: val,
      color: key.toLowerCase().includes('adjustment') ? 'text-amber-600' : 'text-rose-500',
      type: 'deduction'
    }));

  const incomeList = Object.entries(aggIncomes)
    .filter(([key, val]) => val !== 0)
    .map(([key, val]) => ({
      label: labelsMap[key] || key,
      val: val,
      color: 'text-emerald-500',
      type: 'income'
    }));

  const finalDetails = [...deductionList, ...incomeList];

  // Hide upload row if data is found
  // Hide upload part but keep preview
  const uploadZone = page.querySelector('#upload-controls-row');
  if (uploadZone && dates.length > 0) uploadZone.classList.add('hidden');

  summaryArea.innerHTML = `
    <div class="luxury-card relative bg-white/40 dark:bg-[#141414]/60 rounded-[2.5rem] p-8 mb-8 shadow-2xl backdrop-blur-3xl border-t border-white/60 dark:border-white/10 overflow-hidden animate-fade-in flex flex-col lg:flex-row items-stretch gap-10">
      
      <!-- Left: Net Hero -->
      <div class="flex-1 w-full py-2">
        <div class="flex items-center gap-3 mb-6">
           <div class="w-10 h-10 rounded-full bg-[#96588a] flex items-center justify-center text-white shadow-lg"><i data-lucide="zap" class="w-5 h-5"></i></div>
           <p class="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Analysis Complete</p>
        </div>
        <h2 class="text-5xl font-black text-slate-900 dark:text-white tracking-tighter">${fmt.format(totalNet)}</h2>
        <div class="mt-10 flex flex-wrap items-center gap-10">
           <div class="flex flex-col">
              <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gross Sales</span>
              <span class="text-lg font-bold text-slate-700 dark:text-slate-200">${fmt.format(totalGross)}</span>
           </div>
           <div class="flex flex-col">
              <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Orders</span>
              <span class="text-lg font-bold text-slate-700 dark:text-slate-200">${totalOrders.toLocaleString()}</span>
           </div>
           <div class="flex flex-col">
              <span class="text-[9px] font-black text-amber-500 uppercase tracking-widest">Days Found</span>
              <span class="text-lg font-bold text-amber-600 dark:text-amber-500">${uniqueDays} Days</span>
           </div>
           ${uniqueBranches > 0 ? `
           <div class="flex flex-col">
              <span class="text-[9px] font-black text-[#96588a] uppercase tracking-widest">Branches</span>
              <span class="text-lg font-bold text-[#96588a]">${uniqueBranches}</span>
           </div>
           ` : ''}
        </div>
      </div>

      <!-- Right: Financial Breakdown (Clean Hub) -->
      <div class="flex-1 w-full flex flex-col justify-between border-l border-slate-200/50 dark:border-white/5 lg:pl-10">
         <div>
            <div class="px-0 py-2 mb-6">
               <p class="text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em]">Financial Breakdown</p>
            </div>
            <div class="space-y-3 px-0">
               ${finalDetails.length > 0 ? finalDetails.map(d => `
                 <div class="flex items-center justify-between group py-1.5 border-b border-slate-200/30 dark:border-white/5 last:border-0">
                   <div class="flex flex-col">
                     <p class="text-[11px] font-bold text-slate-600 dark:text-slate-300">${d.label}</p>
                     <p class="text-[8px] text-slate-400 uppercase font-black tracking-tighter">${d.type}</p>
                   </div>
                   <p class="text-[11px] font-black ${d.color}">${d.type === 'deduction' ? '-' : '+'}${fmt.format(d.val)}</p>
                 </div>
               `).join('') : '<p class="text-xs text-slate-400 italic py-6">No items found</p>'}
            </div>
         </div>
         
         <div class="pt-6 mt-6 border-t border-slate-200 dark:border-white/10 space-y-5">
            <div class="space-y-2">
               <div class="flex items-center justify-between">
                  <p class="text-[10px] font-black text-rose-500 uppercase">Total Deductions</p>
                  <p class="text-[11px] font-black text-rose-500">-${fmt.format(totalDed)}</p>
               </div>
               ${totalIncome > 0 ? `
               <div class="flex items-center justify-between">
                  <p class="text-[10px] font-black text-emerald-500 uppercase">Total Incomes</p>
                  <p class="text-[11px] font-black text-emerald-500">+${fmt.format(totalIncome)}</p>
               </div>` : ''}
               <div class="flex items-center justify-between pt-1">
                  <p class="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-tighter">Aggregated Net</p>
                  <p class="text-xl font-black text-[#96588a]">${fmt.format(totalNet)}</p>
               </div>
            </div>

            <!-- Integrated Save Button -->
            <button id="hero-save-btn" class="w-full h-14 rounded-2xl text-[12px] font-black uppercase tracking-[0.2em] text-white transition-all shadow-xl hover:shadow-[#96588a]/30 active:scale-95 flex items-center justify-center gap-3" style="background: linear-gradient(135deg, #96588a 0%, #4c2d46 100%);">
               <i data-lucide="check-circle" class="w-5 h-5"></i> Confirm & Commit Data
            </button>
         </div>
      </div>

    </div>
  `;

  // Re-attach save logic to the new hero button
  const heroSaveBtn = summaryArea.querySelector('#hero-save-btn');
  const originalSaveBtn = page.querySelector('#btn-save'); // This might be a hidden placeholder now

  if (heroSaveBtn) {
    heroSaveBtn.onclick = () => {
      // Trigger the existing save logic by dispatching click to the original (hidden) button 
      // OR manually trigger handleSave if available. 
      // For safety, we'll try to find the event listener or just re-bind the logic.
      // Assuming handleSave is accessible or we can just click the hidden one:
      const realBtn = document.getElementById('btn-save');
      if (realBtn) realBtn.click();
    };
  }

  breakdownArea.classList.add('hidden');
  if (window.lucide) window.lucide.createIcons();
}



const ACCENT_COLORS = {
  dinein: '#96588a',
  grabfood: '#00b14f',
  foodpanda: '#d70f64',
  online: '#5b21b6'
};

function updateSummary(items, channelId, page) {
  const summaryContainer = page.querySelector('#channel-summary-container');
  if (!summaryContainer) return;

  const totalNet = items.reduce((sum, item) => sum + (item.financials?.net || 0), 0);
  const totalOrders = items.reduce((sum, item) => sum + (item.orders || 0), 0);
  const totalDed = items.reduce((sum, item) => sum + (item.financials?.totalDeductions || 0), 0);
  const avgOrder = totalOrders > 0 ? totalNet / totalOrders : 0;
  const accent = ACCENT_COLORS[channelId] || '#96588a';

  // Generate Sparkline path (last 10 items, chronologically)
  const sparklineData = items.slice(0, 10).reverse().map(i => i.financials?.net || 0);
  let points = "0,30 300,30";
  if (sparklineData.length > 1) {
    const maxVal = Math.max(...sparklineData, 1);
    const minVal = Math.min(...sparklineData, 0);
    const range = maxVal - minVal || 1;
    points = sparklineData.map((v, i) => {
      const x = (i / (sparklineData.length - 1)) * 300;
      const y = 60 - ((v - minVal) / range) * 50;
      return `${x},${y}`;
    }).join(' ');
  }

  const netVal = `₱${Math.round(totalNet).toLocaleString()}`;
  const ordersVal = totalOrders.toLocaleString();
  const avgVal = `₱${Math.round(avgOrder).toLocaleString()}`;
  const dedVal = `₱${Math.round(totalDed).toLocaleString()}`;

  summaryContainer.innerHTML = `
    <div class="channel-card-premium group" style="--channel-accent: ${accent}">
      <div class="channel-card-accent"></div>
      <div class="absolute -bottom-4 -right-4 opacity-[0.08] dark:opacity-[0.15] -rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
         <i data-lucide="banknote" class="w-24 h-24 text-slate-900 dark:text-white"></i>
      </div>
      <div class="relative z-10 flex flex-col h-full">
        <p class="text-[10px] font-black text-slate-400 dark:text-white/70 uppercase tracking-widest mb-1">Net Revenue</p>
        <h3 id="summary-net" class="text-2xl font-black text-slate-900 dark:text-white tracking-tighter transition-all duration-300">${netVal}</h3>
        <p class="text-[9px] text-slate-400 dark:text-white/70 font-bold mt-2 uppercase tracking-widest">Total Earnings After Fees</p>
      </div>
      
      <div class="sparkline-container">
        <svg viewBox="0 0 300 60" preserveAspectRatio="none" class="w-full h-full">
          <path class="sparkline-path" d="M ${points}" style="--channel-accent: ${accent}"></path>
        </svg>
      </div>
    </div>

    <div class="channel-card-premium group">
       <div class="absolute -bottom-4 -right-4 opacity-[0.08] dark:opacity-[0.15] -rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
          <i data-lucide="shopping-bag" class="w-24 h-24 text-slate-900 dark:text-white"></i>
       </div>
       <div class="relative z-10">
          <p class="text-[10px] font-black text-slate-400 dark:text-white/70 uppercase tracking-widest mb-1">Order Volume</p>
          <h3 id="summary-orders" class="text-2xl font-black text-slate-900 dark:text-white tracking-tighter transition-all duration-300">${ordersVal}</h3>
          <p class="text-[9px] text-slate-400 dark:text-white/70 font-bold mt-2 uppercase tracking-widest">Total Orders Handled</p>
       </div>
    </div>

    <div class="channel-card-premium group">
       <div class="absolute -bottom-4 -right-4 opacity-[0.08] dark:opacity-[0.15] -rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
          <i data-lucide="calculator" class="w-24 h-24 text-slate-900 dark:text-white"></i>
       </div>
       <div class="relative z-10">
          <p class="text-[10px] font-black text-slate-400 dark:text-white/70 uppercase tracking-widest mb-1">Average Order</p>
          <h3 id="summary-avg" class="text-2xl font-black text-slate-900 dark:text-white tracking-tighter transition-all duration-300">${avgVal}</h3>
          <p class="text-[9px] text-slate-400 dark:text-white/70 font-bold mt-2 uppercase tracking-widest">Revenue Per Order</p>
       </div>
    </div>

    <div class="channel-card-premium group">
       <div class="absolute -bottom-4 -right-4 opacity-[0.08] dark:opacity-[0.15] -rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
          <i data-lucide="receipt" class="w-24 h-24 text-slate-900 dark:text-white"></i>
       </div>
       <div class="relative z-10">
          <p class="text-[10px] font-black text-slate-400 dark:text-white/70 uppercase tracking-widest mb-1">Total Deduction</p>
          <h3 id="summary-ded" class="text-2xl font-black text-rose-500 tracking-tighter transition-all duration-300">${dedVal}</h3>
          <p class="text-[9px] text-slate-400 dark:text-white/70 font-bold mt-2 uppercase tracking-widest">Platform Fees & Costs</p>
       </div>
    </div>
  `;

  // Trigger Shimmer-Snap Animation
  ['summary-net', 'summary-orders', 'summary-avg', 'summary-ded'].forEach((id, idx) => {
    const el = summaryContainer.querySelector(`#${id}`);
    if (el) {
      // Step 1: Shimmer phase
      el.classList.add('shimmer-text');

      setTimeout(() => {
        // Step 2: Snap phase
        el.classList.remove('shimmer-text');
        el.classList.add('animate-snap');

        // Clean up animation class
        setTimeout(() => el.classList.remove('animate-snap'), 500);
      }, 200 + (idx * 50)); // Staggered snap for a more "flowing" feel
    }
  });

  if (window.lucide) window.lucide.createIcons();
}

// Render GrabFood Single Unified Analytics View
function renderGrabfoodDashboard(container, salesDocs, adsDocs, adjDocs) {
  // Legacy zero-impact fallback rows add no reconciliation information.
  adjDocs = adjDocs.filter(adj => !(adj.reasonGroup === 'Unclassified' && adj.payoutImpact === 0));
  if (!container) return;
  container.grabChartCleanup?.();
  container.classList.add('grab-analytics-view');
  const fmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
  const fmtNum = n => (n || 0).toLocaleString();

  // 1. Calculate Aggregated Sales Summary
  let totalGross = 0;
  let totalOrders = 0;
  let totalPaymentGross = 0;
  let totalMerchantProductDisc = 0;
  let totalMerchantDeliveryDisc = 0;
  let totalMerchantPromo = 0;
  let totalMarketingSuccessFee = 0;
  let totalChannelCommission = 0;
  let totalOrderCommission = 0;
  let totalCommissionAndSuccessFees = 0;
  let totalFeeTax = 0;
  let totalOrderPayout = 0;
  let totalAdsExVAT = 0;
  let totalAdVAT = 0;
  let totalAdsInclVAT = 0;
  let totalNetAdjustment = 0;
  let totalDineOutPayout = 0;
  let totalOtherPayoutImpact = 0;
  let totalActualNetPayout = 0;

  // Group by branch for Branch Performance table
  const branchMap = {};
  const dailyPayout = new Map();

  salesDocs.forEach(item => {
    const b = item.branchId || 'Unknown Branch';
    if (!branchMap[b]) {
      branchMap[b] = {
        branch: b,
        orders: 0,
        gross: 0,
        merchantProductDisc: 0,
        merchantDeliveryDisc: 0,
        merchantPromo: 0,
        marketingSuccessFee: 0,
        channelCommission: 0,
        orderCommission: 0,
        commissionAndSuccessFees: 0,
        feeTax: 0,
        orderPayout: 0,
        adsExVAT: 0,
        adVAT: 0,
        adsInclVAT: 0,
        adjustments: 0,
        dineOutPayout: 0,
        otherPayoutImpact: 0,
        actualNetPayout: 0
      };
    }

    const bObj = branchMap[b];

    const payout = getGrabPayoutBreakdown(item);
    const { gross: g, actualNetPayout: net, product: pDisc, delivery: dDisc, promo,
      marketing: mFee, channelCommission: cFee, orderCommission: oComm, commission: comm,
      ads: adsVal, adsExVAT: adsExV, adVAT: vatV, adjustments: adjNet,
      dineOut, other: otherImp, orderPayout: ordPayout } = payout;
    const ord = Number(item.orders) || 0;
    if (/^\d{4}-\d{2}-\d{2}$/.test(item.date || '')) {
      const daily = dailyPayout.get(item.date) || { gross: 0, payout: 0 };
      daily.gross += g;
      daily.payout += net;
      dailyPayout.set(item.date, daily);
    }
    totalPaymentGross += payout.paymentGross;

    // Accumulate total
    totalGross += g;
    totalOrders += ord;
    totalMerchantProductDisc += pDisc;
    totalMerchantDeliveryDisc += dDisc;
    totalMerchantPromo += promo;
    totalMarketingSuccessFee += mFee;
    totalChannelCommission += cFee;
    totalOrderCommission += oComm;
    totalCommissionAndSuccessFees += comm;
    totalFeeTax += payout.feeTax;
    totalOrderPayout += ordPayout;
    totalAdsExVAT += adsExV;
    totalAdVAT += vatV;
    totalAdsInclVAT += adsVal;
    totalNetAdjustment += adjNet;
    totalDineOutPayout += dineOut;
    totalOtherPayoutImpact += otherImp;
    totalActualNetPayout += net;

    // Accumulate branch
    bObj.orders += ord;
    bObj.gross += g;
    bObj.merchantProductDisc += pDisc;
    bObj.merchantDeliveryDisc += dDisc;
    bObj.merchantPromo += promo;
    bObj.marketingSuccessFee += mFee;
    bObj.channelCommission += cFee;
    bObj.orderCommission += oComm;
    bObj.commissionAndSuccessFees += comm;
    bObj.feeTax += payout.feeTax;
    bObj.orderPayout += ordPayout;
    bObj.adsExVAT += adsExV;
    bObj.adVAT += vatV;
    bObj.adsInclVAT += adsVal;
    bObj.adjustments += adjNet;
    bObj.dineOutPayout += dineOut;
    bObj.otherPayoutImpact += otherImp;
    bObj.actualNetPayout += net;
  });

  // Calculate Reconciliation formula
  const calcNetPayout = totalOrderPayout - totalAdsInclVAT + totalNetAdjustment + totalDineOutPayout + totalOtherPayoutImpact;
  const unexplainedDiff = Math.round((calcNetPayout - totalActualNetPayout) * 100) / 100;
  const isReconciled = Math.abs(unexplainedDiff) < 0.01;

  // 2. Aggregate Advertising Summary
  const campaignMap = {};
  let totalAdEntries = 0;
  let totalCampaignSpendExVat = 0;
  let totalCampaignVat = 0;
  let totalCampaignCostInclVat = 0;

  adsDocs.forEach(ad => {
    const cName = ad.campaignGroup || 'Unspecified Campaign';
    if (!campaignMap[cName]) {
      campaignMap[cName] = { campaignGroup: cName, entryCount: 0, spendExVAT: 0, vat: 0, totalCostInclVAT: 0 };
    }
    const cObj = campaignMap[cName];
    const exV = ad.spendExVAT || 0;
    const vV = ad.vat || 0;
    const cIncl = ad.totalCostInclVAT || (exV + vV);

    cObj.entryCount += ad.entryCount || 1;
    cObj.spendExVAT += exV;
    cObj.vat += vV;
    cObj.totalCostInclVAT += cIncl;

    totalAdEntries += ad.entryCount || 1;
    totalCampaignSpendExVat += exV;
    totalCampaignVat += vV;
    totalCampaignCostInclVat += cIncl;
  });

  const campaignList = Object.values(campaignMap).sort((a, b) => b.totalCostInclVAT - a.totalCostInclVAT);

  // 3. Aggregate Adjustments & Deductions
  let totalAdjDeductions = 0;
  let totalAdjCredits = 0;
  const reasonSummaryMap = {};

  adjDocs.forEach(adj => {
    const rGroup = adj.reasonGroup || 'Unclassified';
    const impact = adj.payoutImpact || 0;
    if (impact < 0) totalAdjDeductions += Math.abs(impact);
    else totalAdjCredits += impact;

    if (!reasonSummaryMap[rGroup]) {
      reasonSummaryMap[rGroup] = { reasonGroup: rGroup, count: 0, totalImpact: 0 };
    }
    reasonSummaryMap[rGroup].count += 1;
    reasonSummaryMap[rGroup].totalImpact += impact;
  });

  const reasonList = Object.values(reasonSummaryMap).sort((a, b) => Math.abs(b.totalImpact) - Math.abs(a.totalImpact));

  // 4. Data Sanity Checks
  const passPayout = isReconciled;
  const passAds = salesDocs.length === 0 || Math.abs(totalCampaignCostInclVat - totalAdsInclVAT) < 1.0;
  const passAdj = salesDocs.length === 0 || Math.abs(totalAdjCredits - totalAdjDeductions - totalNetAdjustment) < 1.0;
  const passBranches = Object.keys(branchMap).length > 0;
  const passSanity = passPayout && passAds && passAdj && passBranches;

  // Render Section HTML
  container.innerHTML = `
    <!-- SECTION 1: SALES & BRANCH PERFORMANCE -->
    <div class="space-y-6">
      <div class="flex justify-between items-center px-2">
        <div>
           <h3 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">1. Sales & Branch Performance</h3>
           <p class="text-[10px] text-slate-400 dark:text-white/50 font-bold uppercase tracking-widest mt-0.5">Revenue, orders, promotions & platform commissions</p>
        </div>
      </div>

      <!-- KPI Grid -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-2xl p-5 border-t border-white/60 dark:border-white/10">
           <p class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest">Gross Sales</p>
           <h4 class="text-lg font-black text-slate-800 dark:text-white tracking-tighter mt-1">${fmt.format(totalGross)}</h4>
           <p class="text-[8px] text-slate-400 font-bold mt-1 uppercase">Payment Gross Amount</p>
        </div>
        <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-2xl p-5 border-t border-white/60 dark:border-white/10">
           <p class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest">Total Orders</p>
           <h4 class="text-lg font-black text-slate-800 dark:text-white tracking-tighter mt-1">${fmtNum(totalOrders)}</h4>
           <p class="text-[8px] text-slate-400 font-bold mt-1 uppercase">Order Volume</p>
        </div>
        <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-2xl p-5 border-t border-white/60 dark:border-white/10">
           <p class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest">Merchant Promo</p>
           <h4 class="text-lg font-black text-rose-500 tracking-tighter mt-1">-${fmt.format(totalMerchantPromo)}</h4>
           <p class="text-[8px] text-slate-400 font-bold mt-1 uppercase">Product + Delivery Disc.</p>
        </div>
        <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-2xl p-5 border-t border-white/60 dark:border-white/10">
           <p class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest">Commissions & Fees</p>
           <h4 class="text-lg font-black text-rose-500 tracking-tighter mt-1">-${fmt.format(totalCommissionAndSuccessFees)}</h4>
           <p class="text-[8px] text-slate-400 font-bold mt-1 uppercase">Channel + Marketing + Order</p>
        </div>
        <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-2xl p-5 border-t border-white/60 dark:border-white/10">
           <p class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest">Ads incl VAT</p>
           <h4 class="text-lg font-black text-amber-500 tracking-tighter mt-1">-${fmt.format(totalAdsInclVAT)}</h4>
           <p class="text-[8px] text-slate-400 font-bold mt-1 uppercase">Total Campaign Cost</p>
        </div>
        <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-2xl p-5 border-t border-white/60 dark:border-white/10 bg-emerald-500/5 border-emerald-500/20">
           <p class="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Actual Net Payout</p>
           <h4 class="text-lg font-black text-emerald-600 dark:text-emerald-400 tracking-tighter mt-1">${fmt.format(totalActualNetPayout)}</h4>
           <p class="text-[8px] text-emerald-600/70 dark:text-emerald-400/70 font-bold mt-1 uppercase">Source Column BA Total</p>
        </div>
      </div>

      <section class="grab-revenue-chart-card">
        <div class="grab-revenue-chart-heading"><h4><i data-lucide="chart-no-axes-combined" aria-hidden="true"></i>Revenue &amp; Payout</h4><select id="grab-chart-period" aria-label="Revenue chart date range"><option value="7">Last 7 Days</option><option value="14">Last 14 Days</option><option value="30">Last 30 Days</option><option value="month">This Month</option></select></div>
        <p id="grab-chart-status" role="status" class="grab-chart-status"></p>
        <div class="grab-revenue-chart-canvas"><canvas id="grab-revenue-payout-chart" role="img" aria-label="Daily Gross Sales and Actual Net Payout comparison"></canvas></div>
      </section>

      <!-- Branch Performance Table -->
      <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-2xl overflow-hidden shadow-xl border-t border-white/60 dark:border-white/10">
         <div class="px-8 py-5 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
            <h4 class="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest">Branch Performance Table</h4>
            <div class="text-[10px] font-bold text-slate-400">Net/Gross Ratio: <span class="text-emerald-500 font-black">${totalGross > 0 ? ((totalActualNetPayout / totalGross) * 100).toFixed(1) : '0.0'}%</span></div>
         </div>
         <div class="overflow-x-auto">
           <table class="w-full text-left border-collapse min-w-[900px]">
             <thead>
               <tr class="bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                 <th class="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider">Branch</th>
                 <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider text-center">Orders</th>
                 <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider">Gross Sales</th>
                 <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider">Merchant Promo</th>
                 <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider">Commissions</th>
                 <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider">Order Payout</th>
                 <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider">Ads incl VAT</th>
                 <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider">Adjustments</th>
                 <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider">Actual Net Payout</th>
                 <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider text-right">Payout %</th>
               </tr>
             </thead>
             <tbody class="divide-y divide-slate-100 dark:divide-white/5 text-[11px]">
               ${Object.values(branchMap).length === 0 ? `<tr><td colspan="10" class="px-6 py-8 text-center text-slate-400 italic">No sales data found for selected period.</td></tr>` : Object.values(branchMap).map(b => {
                 const pRatio = b.gross > 0 ? ((b.actualNetPayout / b.gross) * 100).toFixed(1) : '0.0';
                 return `
                   <tr class="hover:bg-white/10 dark:hover:bg-white/5 transition-all">
                     <td class="px-6 py-4 font-bold text-slate-800 dark:text-white">${b.branch}</td>
                     <td class="px-4 py-4 text-center font-bold text-slate-500">${fmtNum(b.orders)}</td>
                     <td class="px-4 py-4 font-bold text-slate-700 dark:text-white/80">${fmt.format(b.gross)}</td>
                     <td class="px-4 py-4 font-bold text-rose-500">-${fmt.format(b.merchantPromo)}</td>
                     <td class="px-4 py-4 font-bold text-rose-500">-${fmt.format(b.commissionAndSuccessFees)}</td>
                     <td class="px-4 py-4 font-bold text-indigo-600 dark:text-indigo-400">${fmt.format(b.orderPayout)}</td>
                     <td class="px-4 py-4 font-bold text-amber-500">-${fmt.format(b.adsInclVAT)}</td>
                     <td class="px-4 py-4 font-bold ${b.adjustments < 0 ? 'text-rose-500' : 'text-emerald-500'}">${b.adjustments >= 0 ? '+' : ''}${fmt.format(b.adjustments)}</td>
                     <td class="px-4 py-4 font-black text-emerald-600 dark:text-emerald-400">${fmt.format(b.actualNetPayout)}</td>
                     <td class="px-4 py-4 text-right font-black text-slate-700 dark:text-white">${pRatio}%</td>
                   </tr>
                 `;
               }).join('')}
               <tr class="bg-slate-100/50 dark:bg-white/[0.05] font-black text-slate-900 dark:text-white">
                 <td class="px-6 py-4 uppercase">Total System</td>
                 <td class="px-4 py-4 text-center">${fmtNum(totalOrders)}</td>
                 <td class="px-4 py-4">${fmt.format(totalGross)}</td>
                 <td class="px-4 py-4 text-rose-500">-${fmt.format(totalMerchantPromo)}</td>
                 <td class="px-4 py-4 text-rose-500">-${fmt.format(totalCommissionAndSuccessFees)}</td>
                 <td class="px-4 py-4 text-indigo-600 dark:text-indigo-400">${fmt.format(totalOrderPayout)}</td>
                 <td class="px-4 py-4 text-amber-500">-${fmt.format(totalAdsInclVAT)}</td>
                 <td class="px-4 py-4 ${totalNetAdjustment < 0 ? 'text-rose-500' : 'text-emerald-500'}">${totalNetAdjustment >= 0 ? '+' : ''}${fmt.format(totalNetAdjustment)}</td>
                 <td class="px-4 py-4 text-emerald-600 dark:text-emerald-400">${fmt.format(totalActualNetPayout)}</td>
                 <td class="px-4 py-4 text-right">${totalGross > 0 ? ((totalActualNetPayout / totalGross) * 100).toFixed(1) : '0.0'}%</td>
               </tr>
             </tbody>
           </table>
         </div>
      </div>
    </div>

    <!-- SECTION 2: PAYOUT RECONCILIATION & ADJUSTMENTS -->
    <div class="grab-reconciliation space-y-6 pt-6 border-t border-slate-200 dark:border-white/10">
      <div>
         <h3 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">2. Payout Reconciliation & Adjustments</h3>
         <p class="text-[10px] text-slate-400 dark:text-white/50 font-bold uppercase tracking-widest mt-0.5">Waterfall calculation formula & adjustment details</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Waterfall Table (Left 50%) -->
        <div class="grab-finance-card grab-waterfall">
           <div>
              <h4 class="grab-finance-heading"><i data-lucide="list-filter" aria-hidden="true"></i>Payout Breakdown</h4>

              <div class="flex justify-between text-[11px] py-1.5 border-b border-slate-100 dark:border-white/5">
                 <span class="font-bold text-slate-600 dark:text-white/80">Gross Sales (Payment Transactions)</span>
                 <span class="font-bold text-slate-900 dark:text-white">${fmt.format(totalPaymentGross)}</span>
              </div>
              <div class="flex justify-between text-[11px] py-1.5 border-b border-slate-100 dark:border-white/5">
                 <span class="font-medium text-rose-500 pl-4">− Merchant Product Discount</span>
                 <span class="font-bold text-rose-500">-${fmt.format(totalMerchantProductDisc)}</span>
              </div>
              <div class="flex justify-between text-[11px] py-1.5 border-b border-slate-100 dark:border-white/5">
                 <span class="font-medium text-rose-500 pl-4">− Merchant Delivery Discount</span>
                 <span class="font-bold text-rose-500">-${fmt.format(totalMerchantDeliveryDisc)}</span>
              </div>
              <div class="flex justify-between text-[11px] py-1.5 border-b border-slate-100 dark:border-white/5">
                 <span class="font-medium text-rose-500 pl-4">− Marketing Success Fee</span>
                 <span class="font-bold text-rose-500">-${fmt.format(totalMarketingSuccessFee)}</span>
              </div>
              <div class="flex justify-between text-[11px] py-1.5 border-b border-slate-100 dark:border-white/5">
                 <span class="font-medium text-rose-500 pl-4">− Channel Commission</span>
                 <span class="font-bold text-rose-500">-${fmt.format(totalChannelCommission)}</span>
              </div>
              <div class="flex justify-between text-[11px] py-1.5 border-b border-slate-100 dark:border-white/5">
                 <span class="font-medium text-rose-500 pl-4">− Order Commission</span>
                 <span class="font-bold text-rose-500">-${fmt.format(totalOrderCommission)}</span>
              </div>
              <div class="flex justify-between text-[11px] py-2 bg-indigo-50/50 dark:bg-indigo-500/10 px-3 rounded-xl font-black">
                 <span class="text-indigo-600 dark:text-indigo-400 uppercase">= Calculated Order Payout</span>
                 <span class="text-indigo-600 dark:text-indigo-400">${fmt.format(totalOrderPayout)}</span>
              </div>
              <div class="flex justify-between text-[11px] py-1.5 border-b border-slate-100 dark:border-white/5">
                 <span class="font-medium text-amber-500 pl-4">− Ads incl VAT</span>
                 <span class="font-bold text-amber-500">-${fmt.format(totalAdsInclVAT)}</span>
              </div>
              <div class="flex justify-between text-[11px] py-1.5 border-b border-slate-100 dark:border-white/5">
                 <span class="font-medium text-slate-600 dark:text-white/80 pl-4">+/− Net Adjustments</span>
                 <span class="font-bold ${totalNetAdjustment < 0 ? 'text-rose-500' : 'text-emerald-500'}">${totalNetAdjustment >= 0 ? '+' : ''}${fmt.format(totalNetAdjustment)}</span>
              </div>
              <div class="flex justify-between text-[11px] py-1.5 border-b border-slate-100 dark:border-white/5">
                 <span class="font-medium text-slate-600 dark:text-white/80 pl-4">+ Dine Out Payout</span>
                 <span class="font-bold text-emerald-500">+${fmt.format(totalDineOutPayout)}</span>
              </div>
              <div class="flex justify-between text-[11px] py-1.5 border-b border-slate-100 dark:border-white/5">
                 <span class="font-medium text-slate-600 dark:text-white/80 pl-4">+/− Other Payout Impact</span>
                 <span class="font-bold ${totalOtherPayoutImpact < 0 ? 'text-rose-500' : 'text-emerald-500'}">${totalOtherPayoutImpact >= 0 ? '+' : ''}${fmt.format(totalOtherPayoutImpact)}</span>
              </div>
              <div class="flex justify-between text-[12px] py-3 bg-emerald-500/10 px-4 rounded-xl font-black mt-2">
                 <span class="text-emerald-600 dark:text-emerald-400 uppercase">= Calculated Actual Net Payout</span>
                 <span class="text-emerald-600 dark:text-emerald-400">${fmt.format(calcNetPayout)}</span>
              </div>
           </div>
        </div>

        <!-- Adjustments & Deductions (Right 50% - Replaces Source BA Comparison) -->
        <div class="grab-finance-card grab-adjustments">
           <div>
              <div class="flex justify-between items-center mb-3">
                 <h4 class="grab-finance-heading"><i data-lucide="sliders-horizontal" aria-hidden="true"></i>Adjustments & Deductions</h4>
                 <span class="text-[10px] font-black ${totalNetAdjustment < 0 ? 'text-rose-500' : 'text-emerald-500'}">
                   Net: ${totalNetAdjustment >= 0 ? '+' : ''}${fmt.format(totalNetAdjustment)}
                 </span>
              </div>

              <!-- Adjustment Mini KPIs -->
              <div class="grid grid-cols-2 gap-3 mb-3">
                 <div class="p-3 rounded-xl bg-slate-100/50 dark:bg-white/5">
                    <p class="text-[8px] font-black text-slate-400 uppercase">Deductions (-)</p>
                    <p class="text-sm font-black text-rose-500 mt-0.5">-${fmt.format(totalAdjDeductions)}</p>
                 </div>
                 <div class="p-3 rounded-xl bg-slate-100/50 dark:bg-white/5">
                    <p class="text-[8px] font-black text-slate-400 uppercase">Credits (+)</p>
                    <p class="text-sm font-black text-emerald-500 mt-0.5">+${fmt.format(totalAdjCredits)}</p>
                 </div>
              </div>

              <!-- Reason Summary Badges -->
              <div class="flex flex-wrap gap-1.5 mb-3">
                ${reasonList.map(r => `
                  <div class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center gap-1.5">
                     <span class="text-[9px] font-black text-slate-700 dark:text-white uppercase">${r.reasonGroup}:</span>
                     <span class="text-[9px] font-black ${r.totalImpact < 0 ? 'text-rose-500' : 'text-emerald-500'}">${r.totalImpact >= 0 ? '+' : ''}${fmt.format(r.totalImpact)}</span>
                  </div>
                `).join('')}
              </div>

              <!-- Search Bar & Detail Table -->
              <div class="space-y-2">
                 <div class="w-full">
                    <input type="text" id="grab-adj-search" aria-label="Search adjustment order ID, description or reason" placeholder="Search order ID, description or reason…" class="w-full h-8 px-3 rounded-xl text-[10px] font-bold bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-[#96588a]">
                 </div>
                 <div class="overflow-x-auto max-h-[310px] scrollbar-hide">
                   <table class="w-full text-left border-collapse">
                     <thead class="sticky top-0 bg-slate-100 dark:bg-[#1a1a1a] z-10">
                       <tr class="border-b border-slate-200 dark:border-white/10">
                         <th class="px-3 py-2 text-[8px] font-black text-slate-400 dark:text-white/40 uppercase">Date/Branch</th>
                         <th class="px-3 py-2 text-[8px] font-black text-slate-400 dark:text-white/40 uppercase">Reason</th>
                         <th class="px-3 py-2 text-[8px] font-black text-slate-400 dark:text-white/40 uppercase text-right">Impact</th>
                       </tr>
                     </thead>
                     <tbody id="grab-adj-table-body" class="divide-y divide-slate-100 dark:divide-white/5 text-[10px]">
                       ${adjDocs.length === 0 ? `<tr><td colspan="3" class="px-4 py-6 text-center text-slate-400 italic">No adjustment records.</td></tr>` : adjDocs.slice(0, 50).map(adj => `
                         <tr class="hover:bg-white/10 dark:hover:bg-white/5 transition-all">
                           <td class="px-3 py-2 font-bold text-slate-700 dark:text-white/80">${adj.date || ''} <span class="text-[8px] text-[#96588a]">(${adj.branch || ''})</span></td>
                           <td class="px-3 py-2 font-bold text-slate-600 dark:text-white/70 max-w-[120px] truncate" title="${adj.originalDescription || adj.reasonGroup}">${adj.reasonGroup || 'Unclassified'}</td>
                           <td class="px-3 py-2 text-right font-black ${adj.payoutImpact < 0 ? 'text-rose-500' : 'text-emerald-500'}">${adj.payoutImpact >= 0 ? '+' : ''}${fmt.format(adj.payoutImpact)}</td>
                         </tr>
                       `).join('')}
                     </tbody>
                   </table>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>

    <!-- SECTION 3: ADVERTISING BREAKDOWN -->
    <div class="space-y-6 pt-6 border-t border-slate-200 dark:border-white/10 pb-8">
      <div class="flex justify-between items-center">
         <div>
            <h3 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">3. Advertising Breakdown</h3>
            <p class="text-[10px] text-slate-400 dark:text-white/50 font-bold uppercase tracking-widest mt-0.5">Campaign cost ex VAT, VAT, total cost incl VAT and revenue share</p>
         </div>
      </div>

      <!-- Campaign KPI Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-2xl p-5 border-t border-white/60 dark:border-white/10">
           <p class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest">Spend ex VAT</p>
           <h4 class="text-lg font-black text-slate-800 dark:text-white tracking-tighter mt-1">${fmt.format(totalAdsExVAT)}</h4>
           <p class="text-[8px] text-slate-400 font-bold mt-1 uppercase">Net Ad Cost</p>
        </div>
        <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-2xl p-5 border-t border-white/60 dark:border-white/10">
           <p class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest">Ad VAT (12%)</p>
           <h4 class="text-lg font-black text-amber-500 tracking-tighter mt-1">${fmt.format(totalAdVAT)}</h4>
           <p class="text-[8px] text-slate-400 font-bold mt-1 uppercase">Tax Charge</p>
        </div>
        <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-2xl p-5 border-t border-white/60 dark:border-white/10">
           <p class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest">Total Cost incl VAT</p>
           <h4 class="text-lg font-black text-amber-600 tracking-tighter mt-1">${fmt.format(totalAdsInclVAT)}</h4>
           <p class="text-[8px] text-slate-400 font-bold mt-1 uppercase">Total Campaign Cost</p>
        </div>
        <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-2xl p-5 border-t border-white/60 dark:border-white/10">
           <p class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest">Ad Spend / Gross Sales</p>
           <h4 class="text-lg font-black text-indigo-600 dark:text-indigo-400 tracking-tighter mt-1">${totalGross > 0 ? ((totalAdsInclVAT / totalGross) * 100).toFixed(1) : '0.0'}%</h4>
           <p class="text-[8px] text-slate-400 font-bold mt-1 uppercase">Marketing Intensity Ratio</p>
        </div>
      </div>

      <!-- Campaign Table -->
      <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-2xl overflow-hidden shadow-xl border-t border-white/60 dark:border-white/10">
         <div class="px-8 py-5 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
            <h4 class="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest">Campaign Performance Breakdown (${campaignList.length} Campaigns)</h4>
         </div>
         <div class="overflow-x-auto">
           <table class="w-full text-left border-collapse">
             <thead>
               <tr class="bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                 <th class="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider">Campaign Group</th>
                 <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider text-center">Log Entries</th>
                 <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider">Spend ex VAT</th>
                 <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider">VAT</th>
                 <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider">Total Cost incl VAT</th>
                 <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-wider text-right">Share of Ad Spend</th>
               </tr>
             </thead>
             <tbody class="divide-y divide-slate-100 dark:divide-white/5 text-[11px]">
               ${campaignList.length === 0 ? `<tr><td colspan="6" class="px-6 py-8 text-center text-slate-400 italic">No campaign breakdown found for this period. Re-import GrabFood file to generate.</td></tr>` : campaignList.map(c => {
                 const share = totalAdsInclVAT > 0 ? ((c.totalCostInclVAT / totalAdsInclVAT) * 100).toFixed(1) : '0.0';
                 return `
                   <tr class="hover:bg-white/10 dark:hover:bg-white/5 transition-all">
                     <td class="px-6 py-4 font-bold text-slate-800 dark:text-white">${c.campaignGroup}</td>
                     <td class="px-4 py-4 text-center font-bold text-slate-500">${fmtNum(c.entryCount)}</td>
                     <td class="px-4 py-4 font-bold text-slate-700 dark:text-white/80">${fmt.format(c.spendExVAT)}</td>
                     <td class="px-4 py-4 font-bold text-amber-500">${fmt.format(c.vat)}</td>
                     <td class="px-4 py-4 font-black text-amber-600 dark:text-amber-400">${fmt.format(c.totalCostInclVAT)}</td>
                     <td class="px-4 py-4 text-right font-black text-indigo-600 dark:text-indigo-400">${share}%</td>
                   </tr>
                 `;
               }).join('')}
             </tbody>
           </table>
         </div>
      </div>
    </div>
  `;

  // Attach search listener for Adjustments Table
  const chartCanvas = container.querySelector('#grab-revenue-payout-chart');
  if (chartCanvas) {
    const dates = [];
    const dark = document.documentElement.classList.contains('dark');
    const chart = new Chart(chartCanvas, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          { label: 'Gross Sales', data: dates.map(date => dailyPayout.get(date)?.gross ?? null), borderColor: '#8599b7', backgroundColor: '#8599b7' },
          { label: 'Actual Net Payout', data: dates.map(date => dailyPayout.get(date)?.payout ?? null), borderColor: '#39815d', backgroundColor: '#39815d' }
        ].map(dataset => ({
          ...dataset, borderWidth: 2.5, pointRadius: 3,
          pointBackgroundColor: dataset.borderColor, pointBorderWidth: 0,
          pointHoverRadius: 6, tension: .4, fill: true,
          borderCapStyle: 'round', borderJoinStyle: 'round', spanGaps: false,
          backgroundColor: context => {
            const { ctx, chartArea } = context.chart;
            if (!chartArea) return dataset.borderColor + '18';
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, dataset.borderColor + '33');
            gradient.addColorStop(1, dataset.borderColor + '00');
            return gradient;
          }
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'end', labels: { padding: 28, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, color: dark ? '#cbd5e1' : '#64748b', font: { family: 'Plus Jakarta Sans', size: 10, weight: 'bold' } } },
          tooltip: { backgroundColor: dark ? '#1e293b' : '#fff', titleColor: dark ? '#fff' : '#1e293b', bodyColor: dark ? '#cbd5e1' : '#64748b', borderColor: dark ? '#ffffff1a' : '#0000001a', borderWidth: 1, padding: 12, boxPadding: 6, cornerRadius: 10, usePointStyle: true, callbacks: { label: context => `${context.dataset.label}: ${fmt.format(context.parsed.y)}` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 0, color: dark ? '#aab8c8' : '#647184', font: { size: 10 }, callback: (value, index) => dates[index].slice(5) } },
          y: { ticks: { maxTicksLimit: 5, color: dark ? '#aab8c8' : '#647184', font: { size: 10 }, callback: value => '₱' + new Intl.NumberFormat('en', { notation: 'compact' }).format(value) }, grid: { color: dark ? '#ffffff0d' : '#e9edf2' } }
        }
      }
    });
    let requestId = 0;
    let disposed = false;
    const periodSelect = container.querySelector('#grab-chart-period');
    const status = container.querySelector('#grab-chart-status');
    periodSelect.value = container.grabChartPeriod || '7';
    const loadChartPeriod = async () => {
      const request = ++requestId;
      container.grabChartPeriod = periodSelect.value;
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const end = new Date(`${today}T00:00:00Z`);
      const start = new Date(end);
      if (periodSelect.value === 'month') start.setUTCDate(1);
      else start.setUTCDate(start.getUTCDate() - Number(periodSelect.value) + 1);
      const from = start.toISOString().slice(0, 10);
      const branch = document.getElementById('db-branch')?.value || 'All Branches';
      status.textContent = 'Loading chart…';
      chart.data.datasets.forEach(dataset => { dataset.data = []; });
      chart.update('none');
      try {
        const constraints = [where('channelId', '==', 'grabfood'), where('date', '>=', from), where('date', '<=', today)];
        if (branch !== 'All Branches') constraints.push(where('branchId', '==', branch));
        const snapshot = await getDocs(query(collection(db, 'daily_sales'), ...constraints));
        if (disposed || request !== requestId) return;
        const daily = new Map();
        snapshot.forEach(doc => {
          const row = doc.data();
          const entry = daily.get(row.date) || { gross: 0, payout: 0 };
          entry.gross += row.financials?.gross || row.gross || 0;
          entry.payout += row.actualNetPayout !== undefined ? row.actualNetPayout : (row.financials?.net || 0);
          daily.set(row.date, entry);
        });
        dates.length = 0;
        for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) dates.push(cursor.toISOString().slice(0, 10));
        chart.data.labels = dates;
        chart.data.datasets[0].data = dates.map(date => daily.get(date)?.gross ?? null);
        chart.data.datasets[1].data = dates.map(date => daily.get(date)?.payout ?? null);
        chart.data.datasets.forEach(dataset => { dataset.pointRadius = dates.length > 15 ? 0 : 3; });
        chart.update();
        status.textContent = `${from} — ${today} · ${branch}${daily.size ? '' : ' · No recorded data'}`;
      } catch (error) {
        if (!disposed && request === requestId) status.textContent = 'Could not load chart. Select a period to retry.';
        console.error('Revenue chart load failed:', error);
      }
    };
    periodSelect.addEventListener('change', loadChartPeriod);
    loadChartPeriod();
    const cleanupChart = () => {
      disposed = true;
      periodSelect.removeEventListener('change', loadChartPeriod);
      chart.destroy();
      window.removeEventListener('cleanup-page', cleanupChart);
      if (container.grabChartCleanup === cleanupChart) container.grabChartCleanup = null;
    };
    container.grabChartCleanup = cleanupChart;
    window.addEventListener('cleanup-page', cleanupChart, { once: true });
  }
  const searchInput = container.querySelector('#grab-adj-search');
  const adjTbody = container.querySelector('#grab-adj-table-body');
  if (searchInput && adjTbody) {
    searchInput.oninput = () => {
      const q = searchInput.value.trim().toLowerCase();
      const filtered = adjDocs.filter(a =>
        (a.linkedOrderId || '').toLowerCase().includes(q) ||
        (a.transactionId || '').toLowerCase().includes(q) ||
        (a.originalDescription || '').toLowerCase().includes(q) ||
        (a.reasonGroup || '').toLowerCase().includes(q)
      );

      adjTbody.innerHTML = filtered.length === 0 ? `<tr><td colspan="3" class="px-6 py-8 text-center text-slate-400 italic">No adjustments match search.</td></tr>` : filtered.slice(0, 50).map(adj => `
        <tr class="hover:bg-white/10 dark:hover:bg-white/5 transition-all">
          <td class="px-4 py-3 font-bold text-slate-700 dark:text-white/80">${adj.date || ''}<br><span class="text-[9px] text-[#96588a] font-black">${adj.branch || ''}</span></td>
          <td class="px-3 py-2 font-bold text-slate-600 dark:text-white/70 max-w-[120px] truncate" title="${adj.originalDescription || adj.reasonGroup}">${adj.reasonGroup || 'Unclassified'}</td>
          <td class="px-4 py-3 text-right font-black ${adj.payoutImpact < 0 ? 'text-rose-500' : 'text-emerald-500'}">${adj.payoutImpact >= 0 ? '+' : ''}${fmt.format(adj.payoutImpact)}</td>
        </tr>
      `).join('');
    };
  }

  if (window.lucide) window.lucide.createIcons();
}

function renderHistoryBranchPerformance(container, items) {
  if (!container) return;
  const groups = new Map();
  const total = { branch: 'Total', orders: 0, gross: 0, deductions: 0, net: 0 };
  for (const item of items) {
    const branch = item.branchId || 'Unknown branch';
    if (!groups.has(branch)) groups.set(branch, { branch, orders: 0, gross: 0, deductions: 0, net: 0 });
    const values = { orders: item.orders, gross: item.financials?.gross, deductions: item.financials?.totalDeductions, net: item.financials?.net };
    for (const key of Object.keys(values)) {
      const value = Number(values[key]) || 0;
      groups.get(branch)[key] += value;
      total[key] += value;
    }
  }
  const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
  const ratio = row => row.gross > 0 ? `${(row.net / row.gross * 100).toFixed(1)}%` : '—';
  container.innerHTML = `<header><h3>Branch Performance Table</h3><span>Net / Gross <strong>${ratio(total)}</strong></span></header><div class="history-branch-scroll"><table><thead><tr><th>Branch</th><th>Orders</th><th>Gross Sales</th><th>Deductions</th><th>Net Revenue</th><th>Avg. Order (Net)</th><th>Net / Gross</th></tr></thead><tbody></tbody><tfoot></tfoot></table></div>`;
  const appendRow = (parent, row) => {
    const tr = document.createElement('tr');
    const values = [row.branch, row.orders.toLocaleString('en-PH'), money.format(row.gross), money.format(-row.deductions), money.format(row.net), row.orders > 0 ? money.format(row.net / row.orders) : '—', ratio(row)];
    values.forEach((value, index) => {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      if (index === 0) cell.scope = 'row';
      cell.textContent = value;
      tr.append(cell);
    });
    parent.append(tr);
  };
  const body = container.querySelector('tbody');
  if (!items.length) body.innerHTML = '<tr><td colspan="7" class="history-branch-empty">No sales data for the current filters.</td></tr>';
  else {
    [...groups.values()].sort((a, b) => b.net - a.net).forEach(row => appendRow(body, row));
    appendRow(container.querySelector('tfoot'), total);
  }
}

async function fetchChannelHistory(channelId) {
  const branchId = (document.getElementById('db-branch')?.value || 'Pioneer Center').trim();
  const syncButton = document.getElementById('btn-sync-ayala-dine-out');
  if (syncButton) syncButton.hidden = channelId !== 'dinein' || branchId !== 'Ayala Cloverleaf';
  const rangeStr = document.getElementById('db-date-range')?.value || '';
  const searchText = (document.getElementById('channel-search')?.value || '').trim().toLowerCase();

  let fromDate = '', toDate = '';
  if (rangeStr.includes(' to ')) {
    [fromDate, toDate] = rangeStr.split(' to ');
  } else if (rangeStr) {
    fromDate = toDate = rangeStr;
  }

  const tableBody = document.getElementById('history-table-body');
  const branchPerformance = document.getElementById('history-branch-performance');
  const requestToken = {};
  if (branchPerformance) {
    branchPerformance.requestToken = requestToken;
    branchPerformance.textContent = 'Loading branch performance…';
  }
  const kpiArea = document.getElementById('overview-kpis');
  const breakdownArea = document.getElementById('overview-breakdown-card');
  const fmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

  try {
    let q;
    if (branchId === 'All Branches') {
      if (fromDate && toDate) {
        q = query(
          collection(db, "daily_sales"),
          where("channelId", "==", channelId),
          where("date", ">=", fromDate),
          where("date", "<=", toDate)
        );
      } else {
        const yest = new Date();
        yest.setDate(yest.getDate() - 1);
        const yestStr = getLocalDateString(yest);
        q = query(
          collection(db, "daily_sales"),
          where("channelId", "==", channelId),
          where("date", "==", yestStr)
        );
      }
    } else {
      if (fromDate && toDate) {
        q = query(
          collection(db, "daily_sales"),
          where("channelId", "==", channelId),
          where("branchId", "==", branchId),
          where("date", ">=", fromDate),
          where("date", "<=", toDate),
          orderBy("date", "desc")
        );
      } else {
        // DEFAULT: Yesterday
        const yest = new Date();
        yest.setDate(yest.getDate() - 1);
        const yestStr = getLocalDateString(yest);

        q = query(
          collection(db, "daily_sales"),
          where("channelId", "==", channelId),
          where("branchId", "==", branchId),
          where("date", "==", yestStr)
        );
      }
    }

    const snapshot = await getDocs(q);
    if (branchPerformance && (!branchPerformance.isConnected || branchPerformance.requestToken !== requestToken)) return;
    let docsList = [];
    snapshot.forEach(docSnap => {
      docsList.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (branchId === 'All Branches') {
      docsList.sort((a, b) => {
        const dateComp = b.date.localeCompare(a.date);
        if (dateComp !== 0) return dateComp;
        return (a.branchId || '').localeCompare(b.branchId || '');
      });
    }

    // Special GrabFood unified dashboard handling
    if (channelId === 'grabfood') {
      let adsDocs = [];
      let adjDocs = [];

      try {
        const adsQuery = fromDate && toDate 
          ? query(collection(db, "grab_advertising_summary"), where("reportDate", ">=", fromDate), where("reportDate", "<=", toDate))
          : query(collection(db, "grab_advertising_summary"), limit(500));
          
        const adjQuery = fromDate && toDate
          ? query(collection(db, "grab_adjustments"), where("date", ">=", fromDate), where("date", "<=", toDate))
          : query(collection(db, "grab_adjustments"), limit(500));

        const [adsSnap, adjSnap] = await Promise.all([getDocs(adsQuery), getDocs(adjQuery)]);

        const matchBranch = (b) => {
          if (!branchId || branchId === 'All Branches') return true;
          if (!b) return false;
          return b.trim().toLowerCase() === branchId.trim().toLowerCase();
        };

        adsSnap.forEach(d => {
          const data = d.data();
          if (matchBranch(data.branch)) adsDocs.push(data);
        });

        adjSnap.forEach(d => {
          const data = d.data();
          if (matchBranch(data.branch)) adjDocs.push(data);
        });
      } catch (err) {
        console.warn("Could not fetch extra GrabFood collections:", err);
      }

      const analyticsContainer = document.getElementById('grab-analytics-container');
      if (analyticsContainer) {
        renderGrabfoodDashboard(analyticsContainer, docsList, adsDocs, adjDocs);
      }
    }

    if (branchPerformance && (!branchPerformance.isConnected || branchPerformance.requestToken !== requestToken)) return;
    if (snapshot.empty) {
      historyItems = [];
      renderHistoryBranchPerformance(branchPerformance, []);
      updateSummary([], channelId, document.getElementById('section-history') || document.body);
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-xs text-slate-400 dark:text-white italic">No historical data found for <span class="font-bold text-slate-600 dark:text-white">${branchId}</span> on this channel. <br><span class="text-[10px] mt-2 block dark:text-white/80">Try importing a file in the "Import Data" tab and click "Save to Database".</span></td></tr>`;
      return;
    }

    let totalGross = 0, totalNet = 0, totalOrders = 0, totalDeductions = 0;
    let listHtml = '';
    historyItems = []; // Reset local storage

    docsList.forEach(data => {
      const docId = data.id;

      const dateStr = (data.date || '').toString();
      const ordersStr = String(data.orders ?? '');

      const matchesSearch = !searchText
        || dateStr.toLowerCase().includes(searchText)
        || ordersStr.includes(searchText);

      if (!matchesSearch) return;

      historyItems.push(data);
      totalGross += data.financials.gross;
      totalNet += data.financials.net;
      totalOrders += data.orders;
      totalDeductions += data.financials.totalDeductions;

      const displayDate = branchId === 'All Branches'
        ? `${data.date}<br><span class="text-[9px] font-black text-[#96588a] uppercase">${data.branchId}</span>`
        : data.date;

      listHtml += `
        <tr class="hover:bg-white/10 dark:hover:bg-white/5 transition-all group history-row cursor-pointer" data-id="${docId}">
          <td class="px-6 py-5 text-[11px] font-bold text-slate-700 dark:text-slate-300">${displayDate}</td>
          <td class="px-6 py-5 text-[11px] font-bold text-slate-500 text-center">
            <span class="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400">${data.orders.toLocaleString()}</span>
          </td>
          <td class="px-6 py-5 text-[11px] font-bold text-slate-700 dark:text-white/80">${fmt.format(data.financials.gross)}</td>
          <td class="px-6 py-5 text-[11px] font-bold text-rose-500">-${fmt.format(data.financials.totalDeductions)}</td>
          <td class="px-6 py-5 text-[11px] font-black text-[#96588a] dark:text-white">${fmt.format(data.financials.net)}</td>
          <td class="px-6 py-5 text-right">
            <div class="flex items-center justify-end gap-2.5">
              <button class="channel-view-btn w-8 h-8 flex items-center justify-center rounded-full hover:bg-white dark:hover:bg-white/10 hover:shadow-md transition-all opacity-0 group-hover:opacity-100" title="View Detail">
                <i data-lucide="eye" class="w-3.5 h-3.5 text-slate-400"></i>
              </button>
              <button class="channel-edit-btn w-8 h-8 flex items-center justify-center rounded-full bg-indigo-50/50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 dark:hover:bg-indigo-500 hover:text-white transition-all opacity-0 group-hover:opacity-100" title="Edit Entry">
                <i data-lucide="pencil" class="w-3 h-3"></i>
              </button>
              <button class="channel-delete-btn w-8 h-8 flex items-center justify-center rounded-full bg-rose-50/50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 hover:bg-rose-500 hover:text-white transition-all opacity-0 group-hover:opacity-100" title="Delete Entry">
                <i data-lucide="trash-2" class="w-3 h-3"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    if (tableBody) tableBody.innerHTML = listHtml || `<tr><td colspan="6" class="px-6 py-10 text-center text-xs text-slate-400 italic">No results match your filter.</td></tr>`;
    if (window.lucide) window.lucide.createIcons();

    // Update Summary Cards
    renderHistoryBranchPerformance(branchPerformance, historyItems);
    updateSummary(historyItems, channelId, document.querySelector('.page-enter') || document.body);

    // Attach click listeners to rows
    const pageContainer = document.querySelector('.page-enter');
    // Attach click listeners to actions
    if (tableBody) {
      tableBody.querySelectorAll('.history-row').forEach(row => {
        const docId = row.getAttribute('data-id');
        const item = historyItems.find(h => h.id === docId);

        // View detail on eye button OR row click (except on buttons)
        row.onclick = (e) => {
          if (e.target.closest('.channel-edit-btn') || e.target.closest('.channel-delete-btn')) return;
          if (item) showDayDetail(item, CHANNEL_CONFIG[channelId].label);
        };

        const delBtn = row.querySelector('.channel-delete-btn');
        if (delBtn) {
          delBtn.onclick = async (e) => {
            e.stopPropagation();
            const confirmed = await window.showConfirmModal('Delete Entry', `Are you sure you want to permanently delete the record for ${item.date}?`);
            if (confirmed) {
              try {
                await deleteWithAyalaDineOut(db, doc(db, "daily_sales", docId), item);
                window.showToast('Record deleted successfully', 'success');
                fetchChannelHistory(channelId);
              } catch (err) {
                console.error(err);
                window.showToast('Failed to delete record', 'error');
              }
            }
          };
        }

        const editBtn = row.querySelector('.channel-edit-btn');
        if (editBtn) {
          editBtn.onclick = (e) => {
            e.stopPropagation();
            showChannelEditModal(item, channelId);
          };
        }
      });
    }

    if (window.lucide) window.lucide.createIcons();

    // Update Overview KPIs
    if (kpiArea) {
      const fA = n => '₱' + formatAbbreviated(n);
      kpiArea.innerHTML = `
        <div class="chart-card p-5 border-l-4 border-slate-400">
          <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">30D Gross Sale</p>
          <h3 class="text-xl font-black text-slate-800 dark:text-white mt-2">${fA(totalGross)}</h3>
        </div>
        <div class="chart-card p-5 border-l-4 border-[#96588a]">
          <p class="text-[9px] font-bold text-purple-400 uppercase tracking-widest">30D Net Sale</p>
          <h3 class="text-xl font-black text-slate-800 dark:text-white mt-2">${fA(totalNet)}</h3>
        </div>
        <div class="chart-card p-5 border-l-4 border-rose-400">
          <p class="text-[9px] font-bold text-rose-400 uppercase tracking-widest">30D Deductions</p>
          <h3 class="text-xl font-black text-rose-500 mt-2">-${fA(totalDeductions)}</h3>
        </div>
        <div class="chart-card p-5 border-l-4 border-blue-400">
          <p class="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Avg Order Value</p>
          <h3 class="text-xl font-black text-slate-800 dark:text-white mt-2">${fmt.format(totalOrders > 0 ? totalGross / totalOrders : 0)}</h3>
        </div>
      `;
    }

    if (breakdownArea) {
      breakdownArea.innerHTML = `
          <div class="w-full space-y-4">
             <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">30D Efficiency</p>
             <div class="flex flex-col items-center gap-2">
               <div class="text-2xl font-black text-[#96588a]">${totalGross > 0 ? ((totalNet / totalGross) * 100).toFixed(1) : '0.0'}%</div>
                <p class="text-[9px] text-slate-400 font-bold uppercase">Net-to-Gross Ratio</p>
             </div>
             <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
               <div class="bg-[#96588a] h-full" style="width: ${totalGross > 0 ? (totalNet / totalGross) * 100 : 0}%"></div>
             </div>
          </div>
       `;
    }

  } catch (err) {
    console.error(err);
    if (branchPerformance && branchPerformance.requestToken === requestToken) branchPerformance.textContent = 'Could not load branch performance. Please refresh to retry.';
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-rose-500">Error: ${err.message}</td></tr>`;
  }
}

function showDayDetail(item, channelLabel) {
  const modal = document.getElementById('detail-modal');
  const modalDate = document.getElementById('modal-date');
  const modalContent = document.getElementById('modal-content');
  const fmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

  modalDate.innerText = `${channelLabel} - ${item.date}`;
  document.body.style.overflow = 'hidden';

  let html = `
    <div class="space-y-4 animate-fade-in [transform:translateZ(0)]">
      <!-- Revenue Hub: Merged Gross & Net -->
      <div class="p-6 bg-slate-900/[0.03] dark:bg-white/[0.05] backdrop-blur-[40px] rounded-[2.5rem] flex items-center justify-between relative overflow-hidden group">
         <div class="flex-1 border-r border-slate-900/5 dark:border-white/5 pr-6">
            <p class="text-[9px] font-black text-slate-500 dark:text-white/40 uppercase tracking-[0.4em] mb-1 text-center">Gross Sale</p>
            <p class="text-2xl font-black text-slate-900 dark:text-white tracking-tighter text-center">${fmt.format(item.financials.gross)}</p>
         </div>
         <div class="flex-1 pl-6 pr-6">
            <p class="text-[9px] font-black text-slate-500 dark:text-white/40 uppercase tracking-[0.4em] mb-1 text-center">Net Revenue</p>
            <p class="text-2xl font-black text-emerald-500 dark:text-emerald-400 tracking-tighter text-center">${fmt.format(item.financials.net)}</p>
         </div>
      </div>

      <!-- Breakdown List -->
      <div class="px-2 pt-2">
         <div class="flex items-center justify-between mb-4 px-2">
            <p class="text-[9px] font-black text-slate-400 dark:text-white/30 uppercase tracking-[0.4em]">Detail Analysis</p>
            <div class="h-px flex-1 bg-slate-900/5 dark:bg-white/5 ml-6"></div>
         </div>
         <div class="space-y-1">
  `;

  const labelsMap = {
    merchantDiscount: 'Merchant Discount',
    deliveryDiscount: 'Delivery Discount',
    commission: 'Commission',
    marketingFee: item.channelId === 'foodpanda' ? 'Wait time fee' : 'Marketing Fee',
    orderCommission: 'Order Commission',
    adsFee: 'Ads Fee',
    dineOutPromo: 'Dine Out Promo',
    adjustmentFee: 'Adjustments',
    otherBaFees: 'Other Fees',
    productDiscount: 'Product Discount',
    invoiceDiscount: 'Invoice Discount',
    bankCardFee: 'Bank Card Fee',
    discount: 'Discount',
    tax: 'Tax Charge',
    others: 'Others Deductions',
    vendorRefunds: 'Other Incomes',
    grabDineOut: 'Grab Dine Out (Adj)',
    ayalaGrabDineOut: 'Grab Dine Out adjustment — already recorded in Grab (same day)',
    discount100: '100% Discount (Manager)',
    vatAdjustment: 'VAT Adjustment',
    seniorCitizenDiscount: 'Senior Citizen Discount',
    pwdDiscount: 'PWD Discount',
    otherDiscount: 'Other Discount',
    voidInvoice: 'Void Invoice'
  };

  if (item.breakdown && item.breakdown.deductions) {
    for (const [key, val] of Object.entries(item.breakdown.deductions)) {
      if (val === 0 && key !== 'invoiceDiscount' && key !== 'discount100') continue;
      html += `
          <div class="flex items-center justify-between px-6 py-2.5 hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.03] transition-all rounded-2xl group">
            <p class="text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-widest leading-tight">${labelsMap[key] || key}</p>
            <p class="text-[12px] font-black text-rose-600 dark:text-rose-500 tracking-tight">-${fmt.format(val)}</p>
          </div>
        `;
    }
  }

  if (item.breakdown && item.breakdown.incomes) {
    for (const [key, val] of Object.entries(item.breakdown.incomes)) {
      if (val === 0) continue;
      html += `
         <div class="flex items-center justify-between px-6 py-2.5 hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.03] transition-all rounded-2xl group">
           <p class="text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-widest leading-tight">${labelsMap[key] || key}</p>
           <p class="text-[12px] font-black text-emerald-600 dark:text-emerald-400 tracking-tight">+${fmt.format(val)}</p>
         </div>
       `;
    }
  }

  html += `
         </div>
      </div>
    </div>
  `;

  modalContent.innerHTML = html;

  // Show modal AFTER content is ready to prevent flickering
  modal.classList.remove('hidden');
}


async function showManualEntryModal() {
  const branchId = document.getElementById('db-branch')?.value || 'Ayala Cloverleaf';

  const ov = document.createElement('div');
  ov.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-in';
  ov.innerHTML = `
      <style>
        #m-date::-webkit-calendar-picker-indicator {
          display: none;
          -webkit-appearance: none;
        }
      </style>
      <div class="relative w-full max-w-[550px] rounded-[3rem] shadow-2xl overflow-hidden animate-scale-up flex flex-col bg-white/[0.6] dark:bg-white/[0.04] backdrop-blur-[5px] border-t border-white/60 dark:border-white/10">
        
        <div class="px-10 pt-10 pb-6 flex flex-col items-center relative z-10">
           <p class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.5em] mb-1">Financial Entry</p>
           <h3 class="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter text-center">Manual Recording</h3>
           <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 opacity-60">${branchId} • Dine In</p>
           
           <button id="close-manual" class="absolute top-8 right-8 w-10 h-10 rounded-full bg-slate-900/5 dark:bg-white/5 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all backdrop-blur-2xl">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
           </button>
        </div>

        <div class="px-10 pb-12 space-y-10 relative z-10">
           <!-- Form Grid (3x2) -->
           <div class="grid grid-cols-2 gap-x-8 gap-y-6">
              <div class="space-y-1.5">
                 <label class="text-[7px] font-black text-slate-400 dark:text-white/30 uppercase tracking-widest ml-1">Transaction Date</label>
                 <div class="relative">
                    <input type="date" id="m-date" class="w-full bg-slate-200 dark:bg-[#343434]/80 rounded-2xl pl-4 pr-10 py-3 text-sm font-bold text-slate-700 dark:text-white focus:ring-2 focus:ring-[#96588a] transition-all outline-none border-none cursor-pointer" value="${getLocalDateString(new Date())}">
                    <div id="m-date-icon" class="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 dark:text-white/40">
                       <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    </div>
                 </div>
              </div>
              <div class="space-y-1.5">
                 <label class="text-[8px] font-black text-slate-400 dark:text-white/30 uppercase tracking-widest ml-1">Total Orders</label>
                 <input type="number" id="m-orders" class="w-full bg-slate-200 dark:bg-[#343434]/80 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-white focus:ring-2 focus:ring-[#96588a] transition-all outline-none border-none" placeholder="0">
              </div>
              <div class="space-y-1.5">
                 <label class="text-[8px] font-black text-slate-400 dark:text-white/30 uppercase tracking-widest ml-1">Net Sale</label>
                 <input type="number" id="m-net" class="w-full bg-slate-200 dark:bg-[#343434]/80 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-white focus:ring-2 focus:ring-[#96588a] transition-all outline-none border-none" placeholder="0.00">
              </div>
              <div class="space-y-1.5">
                 <label class="text-[8px] font-black text-slate-400 dark:text-white/30 uppercase tracking-widest ml-1">Discount</label>
                 <input type="number" id="m-discount" class="w-full bg-slate-200 dark:bg-[#343434]/80 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-white focus:ring-2 focus:ring-[#96588a] transition-all outline-none border-none" placeholder="0.00">
              </div>
              <div class="space-y-1.5">
                 <label class="text-[8px] font-black text-slate-400 dark:text-white/30 uppercase tracking-widest ml-1">Tax Charge</label>
                 <input type="number" id="m-tax" class="w-full bg-slate-200 dark:bg-[#343434]/80 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-white focus:ring-2 focus:ring-[#96588a] transition-all outline-none border-none" placeholder="0.00">
              </div>
              <div class="space-y-1.5">
                 <label class="text-[8px] font-black text-emerald-500 uppercase tracking-widest ml-1">Gross Revenue</label>
                 <div class="w-full bg-emerald-500/50 dark:bg-emerald-500/40 backdrop-blur-md rounded-2xl px-4 py-3 flex items-center justify-center">
                    <p id="m-gross-display" class="text-sm font-black text-emerald-600 dark:text-emerald-400 tracking-tighter">₱0.00</p>
                 </div>
              </div>
           </div>
           
           <button id="btn-m-save" class="w-full h-16 bg-slate-600 dark:bg-[#444444] text-white rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-[11px] transition-all shadow-xl hover:border-white/60  active:scale-95 flex items-center justify-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
              Commit Transaction
           </button>
        </div>
      </div>
    `;

  document.body.appendChild(ov);

  const mDate = ov.querySelector('#m-date');
  const mDateIcon = ov.querySelector('#m-date-icon');
  if (mDateIcon) mDateIcon.onclick = () => mDate.showPicker();
  mDate.onclick = () => mDate.showPicker();

  const inputs = ov.querySelectorAll('input[type="number"]');
  const grossDisplay = ov.querySelector('#m-gross-display');
  const updateGross = () => {
    const net = parseFloat(ov.querySelector('#m-net').value) || 0;
    const disc = parseFloat(ov.querySelector('#m-discount').value) || 0;
    const tax = parseFloat(ov.querySelector('#m-tax').value) || 0;
    const gross = net + disc + tax;
    grossDisplay.textContent = '₱' + gross.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return gross;
  };
  inputs.forEach(i => i.oninput = updateGross);

  ov.querySelector('#close-manual').onclick = () => ov.remove();

  ov.querySelector('#btn-m-save').onclick = async () => {
    const date = ov.querySelector('#m-date').value;
    const orders = parseInt(ov.querySelector('#m-orders').value) || 0;
    const net = parseFloat(ov.querySelector('#m-net').value) || 0;
    const disc = parseFloat(ov.querySelector('#m-discount').value) || 0;
    const tax = parseFloat(ov.querySelector('#m-tax').value) || 0;
    const gross = net + disc + tax;

    if (!date) { window.showToast('Select a date', 'error'); return; }

    const btn = ov.querySelector('#btn-m-save');
    btn.disabled = true;
    btn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>';

    try {
      const dataToSave = {
        branchId: branchId,
        channelId: 'dinein',
        date: date,
        orders: orders,
        financials: {
          gross: gross,
          net: net,
          totalDeductions: disc + tax
        },
        breakdown: {
          deductions: {
            discount: disc,
            tax: tax
          }
        },
        updatedAt: serverTimestamp()
      };

      const docId = `sales_${branchId}_dinein_${date}`;
      await saveWithAyalaDineOut(db, doc(db, "daily_sales", docId), dataToSave);

      btn.style.backgroundColor = '#10b981';
      btn.innerHTML = 'SUCCESS';
      window.showToast('Data saved successfully!', 'success');

      setTimeout(() => {
        ov.remove();
        fetchChannelHistory('dinein');
      }, 1000);
    } catch (err) {
      console.error(err);
      window.showToast('Save failed: ' + err.message, 'error');
      btn.disabled = false;
      btn.style.backgroundColor = '#96588a';
      btn.innerHTML = 'Save Manual Entry';
    }
  };
}

function renderPreviewTable(data, container, fileName, conflictDates = [], dailyResults = {}, channelId) {
  container.className = 'chart-card md:col-span-2 flex flex-col h-full overflow-hidden p-0 bg-white/50 dark:bg-[#141414]/80';
  const excelHeaders = data[0].map((_, i) => getExcelColumnName(i));
  const fmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

  const datesFound = Object.keys(dailyResults).sort();

  container.innerHTML = `
    <div class="px-8 py-6 border-b border-slate-200 dark:border-white/10 flex flex-col gap-4 bg-slate-50/80 dark:bg-transparent">
      <div class="flex items-center justify-between">
         <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-xl bg-[#96588a]/10 flex items-center justify-center text-[#96588a]">
               <i data-lucide="file-search" class="w-4 h-4"></i>
            </div>
            <div>
               <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Audit Center</p>
               <p class="text-xs font-black text-slate-700 dark:text-white uppercase truncate">${fileName}</p>
            </div>
         </div>
         ${conflictDates.length > 0 ? `
            <div class="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
               <i data-lucide="alert-triangle" class="w-3 h-3"></i> ${conflictDates.length} Existing Days
            </div>
         ` : `
            <div class="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
               <i data-lucide="check-circle" class="w-3 h-3"></i> Ready to Import
            </div>
         `}
      </div>

      <!-- Quick Summary by Date -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
         ${datesFound.map(d => {
           const res = dailyResults[d];
           const isConflict = conflictDates.includes(d);
           const hasBranch = d.includes('|||');
           const displayDate = hasBranch ? d.split('|||')[1] : d;
           const displayBranch = hasBranch ? d.split('|||')[0] : '';
           return `
             <div class="p-3 rounded-2xl bg-white dark:bg-white/5 border ${isConflict ? 'border-amber-500/30 bg-amber-500/[0.02]' : 'border-slate-200 dark:border-white/10'} transition-all">
                <div class="flex items-center justify-between mb-1">
                   <p class="text-[9px] font-black text-slate-400 uppercase tracking-tighter">${displayDate}</p>
                   ${isConflict ? '<i data-lucide="history" class="w-2.5 h-2.5 text-amber-500"></i>' : ''}
                </div>
                ${displayBranch ? `<p class="text-[8px] font-black text-[#96588a] uppercase tracking-tighter mb-0.5">${displayBranch}</p>` : ''}
                <p class="text-xs font-black text-slate-800 dark:text-white">${fmt.format(res.gross)}</p>
                <p class="text-[8px] font-bold text-slate-400 uppercase mt-0.5">${res.orders} Orders</p>
             </div>
           `;
         }).join('')}
      </div>
    </div>

    <div class="flex-1 overflow-auto scrollbar-hide">
      <table class="w-full text-[9px] text-left border-collapse">
        <thead class="sticky top-0 z-20">
          <tr class="bg-slate-200 dark:bg-[#1a1a1a] text-slate-500 dark:text-white/40 font-black uppercase tracking-widest">
            <th class="px-4 py-2 border-b border-[#96588a]/20 text-[#96588a] font-black text-center bg-[#96588a]/5">AUDIT: ADJUSTED</th>
            ${excelHeaders.map(h => `<th class="px-4 py-2 border-b border-slate-300 dark:border-white/10 text-center font-black">${h}</th>`).join('')}
          </tr>
          <tr class="bg-slate-50 dark:bg-[#202020] border-b border-slate-200 dark:border-white/10 shadow-sm">
            <th class="px-4 py-3 font-black text-[#96588a] text-center uppercase tracking-tighter">Shifted Date</th>
            ${data[0].map(c => `<th class="px-4 py-3 font-black text-slate-800 dark:text-white whitespace-nowrap uppercase tracking-tighter">${c || ''}</th>`).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-white/5">
          ${data.slice(1, 30).map(row => {
            // Tính toán ngày hạch toán cho dòng này để hiện audit
            const dateColIdx = channelId === 'dinein' && (document.getElementById('db-branch')?.value === 'Ayala Cloverleaf') ? 4 : (CHANNEL_CONFIG[channelId]?.colDate ?? 0);
            const rawDateVal = row[dateColIdx];
            const adjustedDate = standardizeDate(rawDateVal, channelId);
            
            // Tính ngày gốc (không áp dụng quy tắc 2AM) để so sánh
            const originalDate = standardizeDate(rawDateVal, '_no_shift_');
            const isShifted = adjustedDate && originalDate && adjustedDate !== originalDate;

            return `
              <tr class="${isShifted ? 'bg-indigo-500/[0.04]' : ''} hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-all group">
                <td class="px-4 py-2.5 text-center font-black ${isShifted ? 'text-indigo-600' : 'text-slate-400 opacity-40'}">
                   ${isShifted ? `<span class="flex items-center justify-center gap-1"><i data-lucide="clock" class="w-2.5 h-2.5"></i> ${adjustedDate}</span>` : adjustedDate || '-'}
                </td>
                ${row.map(c => {
                  const valStr = String(c || '');
                  const isDateCell = valStr.includes('/') || (valStr.includes('-') && valStr.length > 8);
                  return `
                    <td class="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap font-bold ${isDateCell ? 'text-[#96588a]' : ''}">
                      ${c ?? ''}
                    </td>
                  `;
                }).join('')}
              </tr>
             `;
          }).join('')}
        </tbody>
      </table>
      <div class="p-6 text-center bg-slate-50/50 dark:bg-transparent border-t border-slate-100 dark:border-white/5">
         <p class="text-[9px] text-slate-400 font-black uppercase tracking-[0.3em]">Advanced Audit: Showing first 30 transactions</p>
      </div>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

function showChannelEditModal(item, channelId) {
  const ov = document.createElement('div');
  ov.className = 'fixed inset-0 z-[10001] flex items-center justify-center p-4 animate-fade-in [transform:translateZ(0)]';
  ov.innerHTML = `
    <div class="relative w-full max-w-[600px] rounded-[3rem] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.5)] overflow-hidden animate-fade-in flex flex-col bg-white/70 dark:bg-white/[0.04] backdrop-blur-[40px] [transform:translateZ(0)] contain-paint isolation-isolate">
      <div class="px-10 pt-12 pb-6 flex flex-col items-center relative z-10 text-center">
         <p class="text-[9px] font-black text-slate-500 dark:text-white/40 uppercase tracking-[0.5em] mb-1">Database Management</p>
         <h3 class="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Edit Sales Record</h3>
         <button id="close-channel-edit" class="absolute top-8 right-8 w-9 h-9 rounded-full bg-slate-900/5 dark:bg-white/5 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all backdrop-blur-2xl">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
         </button>
      </div>
      
      <div class="px-10 pb-10 space-y-6 relative z-10">
         <div class="grid grid-cols-2 gap-x-8 gap-y-5">
            <div class="space-y-1">
               <label class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest ml-1">Date (Read-only)</label>
               <input type="text" class="w-full bg-slate-900/5 dark:bg-white/[0.05] border-none rounded-2xl px-5 py-4 text-xs font-bold text-slate-400 dark:text-white/30" value="${item.date}" disabled>
            </div>
            <div class="space-y-1">
               <label class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest ml-1">Orders Count</label>
               <input type="number" id="edit-ch-orders" class="w-full bg-slate-900/5 dark:bg-white/[0.05] border-none rounded-2xl px-5 py-4 text-xs font-bold text-slate-800 dark:text-white" value="${item.orders}">
            </div>
            <div class="space-y-1">
               <label class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest ml-1">Gross Revenue (PHP)</label>
               <input type="number" id="edit-ch-gross" class="w-full bg-slate-900/5 dark:bg-white/[0.05] border-none rounded-2xl px-5 py-4 text-xs font-bold text-slate-800 dark:text-white" value="${item.financials.gross}">
            </div>
            <div class="space-y-1">
               <label class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest ml-1">Total Deductions (PHP)</label>
               <input type="number" id="edit-ch-deductions" class="w-full bg-slate-900/5 dark:bg-white/[0.05] border-none rounded-2xl px-5 py-4 text-xs font-bold text-rose-600 dark:text-rose-500" value="${item.financials.totalDeductions}">
            </div>
         </div>

         <div class="pt-4 flex justify-center">
            <button id="save-channel-edit-btn" class="w-full h-14 bg-green-500/70 hover:bg-green-400/70 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all shadow-xl hover:bg-white/90 active:scale-95 flex items-center justify-center gap-3">
               Update Database Record
            </button>
         </div>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  if (window.lucide) window.lucide.createIcons();

  ov.querySelector('#close-channel-edit').onclick = () => ov.remove();

  ov.querySelector('#save-channel-edit-btn').onclick = async () => {
    const btn = ov.querySelector('#save-channel-edit-btn');
    const orders = parseInt(ov.querySelector('#edit-ch-orders').value);
    const gross = parseFloat(ov.querySelector('#edit-ch-gross').value);
    const totalDeductions = parseFloat(ov.querySelector('#edit-ch-deductions').value);

    if (isNaN(orders) || isNaN(gross) || isNaN(totalDeductions)) {
      window.showToast('Please fill all numeric fields correctly', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>`;

    try {
      const net = gross - totalDeductions;
      await updateDoc(doc(db, "daily_sales", item.id), {
        orders,
        financials: {
          gross,
          totalDeductions,
          net
        },
        updatedAt: serverTimestamp()
      });
      window.showToast('Record updated successfully', 'success');
      ov.remove();
      fetchChannelHistory(channelId);
    } catch (err) {
      console.error(err);
      window.showToast('Update failed', 'error');
      btn.disabled = false;
      btn.textContent = 'Update Record';
    }
  };
}
