import { db } from '../firebase';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, orderBy, limit, updateDoc, deleteDoc } from 'firebase/firestore';

const CHANNEL_CONFIG = {
  dinein: {
    label: 'Dine In', icon: 'id_VcqlrDV_1777185371840.svg', color: 'amber', hex: '#96588a',
    colQty: 48, colUnitPrice: 49, colUnitDisc: 51, colInvDisc: 31, colBankTrans: 37, colId: 1, colDate: 5
  },
  grabfood: {
    label: 'GrabFood', icon: 'GrabFood.svg', color: 'emerald', hex: '#96588a',
    colGross: 29, colMerchantDisc: 35, colDeliveryDisc: 36, colComm: 46, colMarketing: 44, colAds: 52, colOrderComm: 47, colCategory: 7, colDesc: 62, colDate: 4, colId: 15
  },
  foodpanda: {
    label: 'FoodPanda', icon: 'Foodpanda.svg', color: 'pink', hex: '#96588a',
    colGross: 21, colCheckP: 15, colCheckS: 18, colCheckT: 19, colCheckU: 20, colDiscount: 28, colComm: 31, colTax: 26, colMarketing: 34, colAds: 33, colOthers: 29, colRefunds: 24, colDate: 8
  },
  online: {
    label: 'Online Order', icon: 'WooCommerce.svg', color: 'violet', hex: '#96588a',
    colGross: 13, colDate: 18, colId: 15
  },
};

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
// FIX: Tránh lệch múi giờ UTC bằng cách bóc tách trực tiếp từ Serial Number
function standardizeDate(val, channelId) {
  if (val === undefined || val === null || String(val).trim() === '') return null;

  let year, month, day, hours = 0, minutes = 0;

  // 1. Nếu Excel đọc ra dưới dạng Serial Number (ví dụ: 46156.987)
  //    Phần nguyên = số ngày kể từ 1/1/1900, Phần thập phân = thời gian trong ngày
  if (typeof val === 'number') {
    const totalDays = Math.floor(val);       // Phần nguyên = ngày
    const timeFraction = val - totalDays;     // Phần thập phân = giờ

    // Bóc tách giờ/phút từ phần thập phân
    const totalMinutes = Math.round(timeFraction * 24 * 60);
    hours = Math.floor(totalMinutes / 60);
    minutes = totalMinutes % 60;

    // Chuyển serial thành ngày bằng cách dùng epoch cố định (Local Time)
    // Serial 1 = 1 Jan 1900, nhưng Excel có bug Lotus 1-2-3 (thêm 29/2/1900 không tồn tại)
    // → Dùng mốc: Serial 25569 = 1 Jan 1970
    const daysSinceEpoch = totalDays - 25569;
    const refDate = new Date(1970, 0, 1 + daysSinceEpoch, hours, minutes);

    year = refDate.getFullYear();
    month = refDate.getMonth();  // 0-indexed
    day = refDate.getDate();
    hours = refDate.getHours();
    minutes = refDate.getMinutes();
  } else {
    const str = String(val).trim();
    const datePart = str.split(' ')[0];

    // Thử tách y, m, d từ các định dạng phổ biến
    let y, m, d;
    if (datePart.includes('/')) {
      const p = datePart.split('/');
      if (p[2]?.length === 4) { y = p[2]; m = p[1]; d = p[0]; }       // DD/MM/YYYY
      else if (p[0]?.length === 4) { y = p[0]; m = p[1]; d = p[2]; }   // YYYY/MM/DD
    } else if (datePart.includes('-')) {
      const p = datePart.split('-');
      if (p[0]?.length === 4) { y = p[0]; m = p[1]; d = p[2]; }       // YYYY-MM-DD
      else if (p[2]?.length === 4) { y = p[2]; m = p[1]; d = p[0]; }   // DD-MM-YYYY
    }

    if (y && m && d) {
      const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
      year = parseInt(y);
      month = parseInt(m) - 1;  // 0-indexed
      day = parseInt(d);
      hours = timeMatch ? parseInt(timeMatch[1]) : 0;
      minutes = timeMatch ? parseInt(timeMatch[2]) : 0;
    } else {
      // Fallback: thử parse trực tiếp (ít tin cậy)
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
  }

  // Tạo Date object bằng Local Time constructor (KHÔNG BAO GIỜ dùng UTC)
  const dObj = new Date(year, month, day, hours, minutes);

  if (isNaN(dObj.getTime())) return null;

  // Logic lùi ngày cho Dine In: đơn trước 2:00 AM thuộc về ngày kinh doanh hôm trước
  if (channelId === 'dinein' && hours < 2) {
    dObj.setDate(dObj.getDate() - 1);
  }

  return getLocalDateString(dObj);
}

function parseAyalaDate(val) {
  if (!val) return null;
  let str = String(val).trim();

  // Case: DD/MM/YYYY HH:mm (Column E in Ayala POS)
  if (str.includes('/') || str.includes('-')) {
    const datePart = str.split(' ')[0];
    const sep = datePart.includes('/') ? '/' : '-';
    const parts = datePart.split(sep);

    if (parts.length >= 3) {
      let d, m, y;
      if (parts[2].length === 4) { d = parts[0]; m = parts[1]; y = parts[2]; }
      else if (parts[0].length === 4) { y = parts[0]; m = parts[1]; d = parts[2]; }

      if (y && m && d) {
        const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
        const hh = timeMatch ? parseInt(timeMatch[1]) : 0;
        const mm = timeMatch ? parseInt(timeMatch[2]) : 0;
        const resultDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), hh, mm);
        
        if (hh < 2) {
          resultDate.setDate(resultDate.getDate() - 1);
        }
        return getLocalDateString(resultDate);
      }
    }
  }

  // Fallback: MMDDYYYY (8 digits) or MDDYYYY (7 digits)
  if (/^\d{7,8}$/.test(str)) {
    if (str.length === 7) str = '0' + str;
    const mm = str.substring(0, 2);
    const dd = str.substring(2, 4);
    const yyyy = str.substring(4, 8);
    const monthVal = parseInt(mm), dayVal = parseInt(dd);
    if (monthVal >= 1 && monthVal <= 12 && dayVal >= 1 && dayVal <= 31) {
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  }
  return standardizeDate(val);
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

  page.innerHTML = `
    <!-- TAB: HISTORY -->
    <div id="section-history" class="tab-content ${activeTab === 'history' ? '' : 'hidden'} space-y-4 page-enter">
       <div id="channel-summary-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"></div>

       <!-- Optimized Action Bar: Exclusive Export & Import -->
       <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-2xl overflow-hidden shadow-xl border-t border-white/60 dark:border-white/10 transition-all">
          <!-- Subdued Table Header Action Area -->
          <div class="px-8 pt-6 pb-2 flex justify-between items-center">
             <p class="text-[10px] font-black text-slate-800 dark:text-white uppercase tracking-[0.2em]">Historical Data</p>
             <div class="flex items-center gap-6">
                <button id="btn-goto-import" class="flex items-center gap-2 text-[9px] font-black text-slate-400 hover:text-[#96588a] dark:text-white/30 dark:hover:text-white uppercase tracking-widest transition-all group">
                   <i data-lucide="file-up" class="w-3 h-3 group-hover:scale-110 transition-transform"></i>
                   Import Data
                </button>
                <div class="w-px h-3 bg-slate-200 dark:bg-white/10"></div>
                <button id="btn-export-csv" class="flex items-center gap-2 text-[9px] font-black text-slate-400 hover:text-[#96588a] dark:text-white/30 dark:hover:text-white uppercase tracking-widest transition-all group">
                   <i data-lucide="file-spreadsheet" class="w-3 h-3 group-hover:scale-110 transition-transform"></i>
                   Export Report
                </button>
             </div>
          </div>

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
               <button id="btn-manual" class="flex-1 h-12 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-95 bg-emerald-600 hidden">Manual Entry</button>
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
    
    // Navigation Listeners
    const btnGotoImport = page.querySelector('#btn-goto-import');
    if (btnGotoImport) {
       btnGotoImport.onclick = () => {
          window.dispatchEvent(new CustomEvent('switch-sub-tab', { detail: { tabId: 'import' } }));
       };
    }

    const btnBackToHistory = page.querySelector('#btn-back-to-history');
    if (btnBackToHistory) {
       btnBackToHistory.onclick = () => {
          window.dispatchEvent(new CustomEvent('switch-sub-tab', { detail: { tabId: 'history' } }));
       };
    }

    btnChoose.onclick = () => fileInput.click();
    if (btnManual) btnManual.onclick = () => showManualEntryModal();
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
    page.querySelector('#btn-export-csv').onclick = async () => {
      if (historyItems.length === 0) return alert('No data to export');

      // 1. Danh mục label phí
      const labelsMap = {
        merchantDiscount: 'Merchant Discount',
        deliveryDiscount: 'Delivery Discount',
        commission: 'Commission',
        marketingFee: 'Marketing Fee',
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
        // Loại bỏ style cứng để template tự áp dụng định dạng (Conditional Formatting)
        dedKeyList.forEach((key, i) => {
          const colNum = 6 + i;
          const cell = worksheet.getCell(1, colNum);
          cell.value = labelsMap[key] || key;
          // Không set cell.fill hay cell.font để giữ format gốc của template
        });

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
      const grouped = groupDataByDate(allDataRows, channelId, cfg, branchId);
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

    async function checkConflicts(channelId, branchId, dates) {
      const conflicts = [];
      const safeBranchName = branchId.replace(/\s+/g, '');

      const promises = dates.map(async (date) => {
        const docId = `${channelId}_${safeBranchName}_${date}`;
        const snap = await getDocs(query(collection(db, "daily_sales"), where("__name__", "==", docId)));
        if (!snap.empty) conflicts.push(date);
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

async function saveToDatabase(channelId, branchId, results, mode = 'overwrite') {
  const batchId = `BATCH_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  let totalRows = 0;
  const { doc, getDoc, writeBatch } = await import('firebase/firestore');

  const safeBranchName = branchId.replace(/\s+/g, '');

  // Use a batch or individual updates? Since we might need to read first for merge, we'll process with a loop
  const promises = Object.entries(results).map(async ([date, res]) => {
    totalRows += (res.orders || 0);
    const docId = `${channelId}_${safeBranchName}_${date}`;
    const docRef = doc(db, "daily_sales", docId);

    let dataToSave = {
      channelId,
      branchId,
      date,
      orders: res.orders,
      financials: {
        gross: res.gross,
        net: res.net,
        totalDeductions: res.totalDed
      },
      breakdown: res.breakdown,
      importBatchId: batchId,
      updatedAt: serverTimestamp()
    };

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
      }
    }

    return setDoc(docRef, dataToSave);
  });

  // Create log entry
  const logPromise = setDoc(doc(db, "import_logs", batchId), {
    batchId,
    timestamp: serverTimestamp(),
    type: channelId,
    branchId: branchId,
    rowCount: totalRows,
    collections: ["daily_sales"],
    status: "active"
  });

  await Promise.all([...promises, logPromise]);
  window.dispatchEvent(new CustomEvent('sales-updated'));
}

// Logic tính toán cho từng kênh (đã cập nhật cleanNumber)
function calculateOnline(rows, cfg) {
  let gross = 0;
  rows.forEach(row => { gross += cleanNumber(row[cfg.colGross]); });

  const breakdown = {
    deductions: {},
    incomes: {}
  };

  return {
    net: gross, gross, orders: rows.length, totalDed: 0, breakdown, details: [
      { label: 'Gross Sale', val: gross, color: 'text-slate-600' },
      { label: 'Total Deduction', val: 0, color: 'text-rose-700 font-bold', isDed: true }
    ]
  };
}

function calculateGrab(rows, cfg) {
  let gross = 0, merchantDisc = 0, deliveryDisc = 0, comm = 0, marketing = 0, orderComm = 0, orders = 0;

  // Các biến mới để bóc tách từ cột BA (52)
  let ads_fee = 0;
  let dine_out_promo = 0;
  let adjustment_fee = 0;
  let other_ba_fees = 0;

  rows.forEach(row => {
    let g = cleanNumber(row[cfg.colGross]);
    const orderId = String(row[cfg.colId] || '').trim();

    if (g > 0) {
      gross += g;
      merchantDisc += Math.abs(cleanNumber(row[cfg.colMerchantDisc]));
      deliveryDisc += Math.abs(cleanNumber(row[cfg.colDeliveryDisc]));
      comm += Math.abs(cleanNumber(row[cfg.colComm]));
      marketing += Math.abs(cleanNumber(row[cfg.colMarketing]));
      orderComm += Math.abs(cleanNumber(row[cfg.colOrderComm]));
    }

    // Đếm đơn dựa trên ID cột P (15)
    if (orderId !== '') orders++;

    // Xử lý thông minh cột BA (52) dựa trên Category (7)
    let aVal = cleanNumber(row[cfg.colAds]);
    if (aVal < 0) {
      const absVal = Math.abs(aVal);
      const cat = String(row[cfg.colCategory] || '').trim();

      if (cat === 'Advertisement') {
        ads_fee += absVal;
      } else if (cat === 'Dine Out Discount') {
        dine_out_promo += absVal;
      } else if (cat === 'Adjustment') {
        adjustment_fee += absVal;
      } else {
        other_ba_fees += absVal;
      }
    }
  });

  const totalDed = merchantDisc + deliveryDisc + comm + marketing + orderComm + ads_fee + dine_out_promo + adjustment_fee + other_ba_fees;

  const breakdown = {
    deductions: {
      merchantDiscount: merchantDisc,
      deliveryDiscount: deliveryDisc,
      commission: comm,
      marketingFee: marketing,
      orderCommission: orderComm,
      adsFee: ads_fee,
      dineOutPromo: dine_out_promo,
      adjustmentFee: adjustment_fee,
      otherBaFees: other_ba_fees
    },
    incomes: {}
  };

  return {
    net: gross - totalDed, gross, orders, totalDed, breakdown, details: [
      { label: 'Gross Sale', val: gross, color: 'text-slate-600' },
      { label: 'Commission', val: comm + orderComm, color: 'text-rose-500', isDed: true },
      { label: 'Merchant Discount', val: merchantDisc, color: 'text-rose-500', isDed: true },
      { label: 'Delivery Discount', val: deliveryDisc, color: 'text-rose-500', isDed: true },
      { label: 'Marketing Fee', val: marketing, color: 'text-rose-500', isDed: true },
      { label: 'True Ads Fee', val: ads_fee, color: 'text-rose-500 font-bold', isDed: true },
      { label: 'Dine Out Promo', val: dine_out_promo, color: 'text-rose-500', isDed: true },
      { label: 'Adjustments', val: adjustment_fee, color: 'text-amber-600', isDed: true },
      { label: 'Total Deduction', val: totalDed, color: 'text-rose-700 font-black', isDed: true }
    ]
  };
}

function calculatePanda(rows, cfg) {
  let gross = 0, disc = 0, comm = 0, tax = 0, marketing = 0, ads = 0, others = 0, refunds = 0, orders = 0;

  rows.forEach(row => {
    // Logic Hủy đơn: ô P trống VÀ (ô S HOẶC T HOẶC U có dữ liệu)
    const pVal = String(row[cfg.colCheckP] || '').trim();
    const sVal = String(row[cfg.colCheckS] || '').trim();
    const tVal = String(row[cfg.colCheckT] || '').trim();
    const uVal = String(row[cfg.colCheckU] || '').trim();

    const isCancelled = (pVal === '') && (sVal !== '' || tVal !== '' || uVal !== '');

    let g = cleanNumber(row[cfg.colGross]);

    // Nếu không hủy thì mới cộng vào Gross Sale
    if (!isCancelled && g !== 0) {
      gross += g;
      orders++;
    }

    // Deduction tính tổng toàn bộ cột theo yêu cầu
    disc += Math.abs(cleanNumber(row[cfg.colDiscount]));
    comm += Math.abs(cleanNumber(row[cfg.colComm]));
    tax += Math.abs(cleanNumber(row[cfg.colTax]));
    marketing += Math.abs(cleanNumber(row[cfg.colMarketing]));
    ads += Math.abs(cleanNumber(row[cfg.colAds]));
    others += Math.abs(cleanNumber(row[cfg.colOthers]));

    // Other Incomes (Vendor Refunds) - tổng cột Y
    refunds += cleanNumber(row[cfg.colRefunds]);
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
      { label: 'Marketing Fee', val: marketing, color: 'text-rose-500', isDed: true },
      { label: 'Ads Fee', val: ads, color: 'text-rose-500', isDed: true },
      { label: 'Others Deductions', val: others, color: 'text-rose-500', isDed: true },
      { label: 'Other Incomes', val: refunds, color: 'text-emerald-500', isIncome: true },
      { label: 'Total Deduction', val: totalDed, color: 'text-rose-700 font-bold', isDed: true }
    ]
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
  const ids = new Set(), invoiceDiscProcessed = new Set(), bankProcessed = new Set();

  rows.forEach(row => {
    const id = String(row[cfg.colId] || '').trim();
    if (!id) return;

    // Các cột kiểm tra thanh toán
    const akVal = cleanNumber(row[36]);
    const alVal = cleanNumber(row[cfg.colBankTrans]); // AL is 37
    const amVal = cleanNumber(row[38]);
    const anVal = cleanNumber(row[39]);
    const aiVal = cleanNumber(row[34]);
    const ajVal = cleanNumber(row[35]);

    const qty = cleanNumber(row[cfg.colQty]);
    const uPrice = cleanNumber(row[cfg.colUnitPrice]);
    const rowGross = (qty * uPrice);

    // Kiểm tra logic Grab Dine Out vs 100% Discount
    const isZeroPaymentColumns = (akVal === 0 && alVal === 0 && amVal === 0 && anVal === 0);

    if (isZeroPaymentColumns) {
      if (aiVal === 0 && ajVal === 0) {
        // CASE: 100% Discount (Manager/Free meals)
        // Vẫn tính vào Gross và Orders của Dine In nhưng trừ sạch ở Net thông qua discount100
        ids.add(id);
        gross += rowGross;
        discount100 += rowGross;
        return; // Xong dòng này, không tính thêm chiết khấu lẻ nữa để tránh trùng
      } else {
        // CASE: Grab Dine Out (Ghi nhầm vào POS Dine In)
        // Loại bỏ hoàn toàn khỏi doanh thu Dine In
        grabDineOut += rowGross;
        return;
      }
    }

    ids.add(id);

    // 1. Gross Sale = AW * AX
    gross += rowGross;

    // 2. Product Discount = AW * AZ
    const uDisc = cleanNumber(row[cfg.colUnitDisc]);
    productDisc += (qty * uDisc);

    // 3. Invoice Discount (AF - Cột 31), chỉ tính 1 lần mỗi ID
    if (!invoiceDiscProcessed.has(id)) {
      const invDiscVal = cleanNumber(row[cfg.colInvDisc]);
      if (invDiscVal > 0) invoiceDisc += invDiscVal;
      invoiceDiscProcessed.add(id);
    }

    // 4. Bank Card Transaction (AL - Cột 37), chỉ tính 1 lần mỗi ID
    if (!bankProcessed.has(id)) {
      if (alVal > 0) totalBankTrans += alVal;
      bankProcessed.add(id);
    }
  });

  const bankFee = (totalBankTrans / 100) * 2;
  const totalDed = productDisc + invoiceDisc + bankFee + discount100;

  const breakdown = {
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
    ]
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
    marketingFee: 'Marketing Fee',
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
              <span class="text-lg font-bold text-amber-600 dark:text-amber-500">${dates.length} Days</span>
           </div>
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

async function fetchChannelHistory(channelId) {
  const branchId = (document.getElementById('db-branch')?.value || 'Pioneer Center').trim();
  const rangeStr = document.getElementById('db-date-range')?.value || '';
  const searchText = (document.getElementById('channel-search')?.value || '').trim().toLowerCase();

  let fromDate = '', toDate = '';
  if (rangeStr.includes(' to ')) {
    [fromDate, toDate] = rangeStr.split(' to ');
  } else if (rangeStr) {
    fromDate = toDate = rangeStr;
  }

  const tableBody = document.getElementById('history-table-body');
  const kpiArea = document.getElementById('overview-kpis');
  const breakdownArea = document.getElementById('overview-breakdown-card');
  const fmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

  try {
    let q;
    if (fromDate && toDate) {
      q = query(
        collection(db, "daily_sales"),
        where("channelId", "==", channelId),
        where("branchId", "==", branchId),
        where("date", ">=", fromDate),
        where("date", "<=", toDate),
        orderBy("date", "desc"),
        limit(100)
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

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-xs text-slate-400 dark:text-white italic">No historical data found for <span class="font-bold text-slate-600 dark:text-white">${branchId}</span> on this channel. <br><span class="text-[10px] mt-2 block dark:text-white/80">Try importing a file in the "Import Data" tab and click "Save to Database".</span></td></tr>`;
      return;
    }

    let totalGross = 0, totalNet = 0, totalOrders = 0, totalDeductions = 0;
    let listHtml = '';
    historyItems = []; // Reset local storage

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const docId = docSnap.id;

      const dateStr = (data.date || '').toString();
      const ordersStr = String(data.orders ?? '');

      const matchesSearch = !searchText
        || dateStr.toLowerCase().includes(searchText)
        || ordersStr.includes(searchText);

      if (!matchesSearch) return;

      historyItems.push({ id: docId, ...data });
      totalGross += data.financials.gross;
      totalNet += data.financials.net;
      totalOrders += data.orders;
      totalDeductions += data.financials.totalDeductions;

      listHtml += `
        <tr class="hover:bg-white/10 dark:hover:bg-white/5 transition-all group history-row cursor-pointer" data-id="${docId}">
          <td class="px-6 py-5 text-[11px] font-bold text-slate-700 dark:text-slate-300">${data.date}</td>
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
                await deleteDoc(doc(db, "daily_sales", docId));
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
    marketingFee: 'Marketing Fee',
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
      await setDoc(doc(db, "daily_sales", docId), dataToSave);

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
           return `
             <div class="p-3 rounded-2xl bg-white dark:bg-white/5 border ${isConflict ? 'border-amber-500/30 bg-amber-500/[0.02]' : 'border-slate-200 dark:border-white/10'} transition-all">
                <div class="flex items-center justify-between mb-1">
                   <p class="text-[9px] font-black text-slate-400 uppercase tracking-tighter">${d}</p>
                   ${isConflict ? '<i data-lucide="history" class="w-2.5 h-2.5 text-amber-500"></i>' : ''}
                </div>
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
