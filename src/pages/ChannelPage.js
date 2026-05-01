import { db } from '../firebase';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, orderBy, limit, updateDoc, deleteDoc } from 'firebase/firestore';

const CHANNEL_CONFIG = {
  dinein: {
    label: 'Dine In', icon: 'id_VcqlrDV_1777185371840.svg', color: 'amber', hex: '#96588a',
    colQty: 48, colUnitPrice: 49, colUnitDisc: 51, colInvDisc: 31, colBankTrans: 37, colId: 1, colDate: 5
  },
  grabfood: {
    label: 'GrabFood', icon: 'GrabFood.svg', color: 'emerald', hex: '#96588a',
    colGross: 29, colMerchantDisc: 35, colDeliveryDisc: 36, colComm: 46, colMarketing: 44, colAds: 52, colOrderComm: 47, colCategory: 7, colDesc: 62, colDate: 5, colId: 15
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
function standardizeDate(val, channelId) {
  if (val === undefined || val === null || String(val).trim() === '') return null;

  // 1. Nếu Excel đọc ra dưới dạng Serial Number (ví dụ: 45404)
  if (typeof val === 'number') {
    // Serial Number trong Excel luôn tính từ gốc UTC, nên dùng toISOString là đúng cho case này
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
  }

  const str = String(val).trim();

  try {
    const datePart = str.split(' ')[0];

    // 2. Định dạng có dấu gạch ngang (-)
    if (datePart.includes('-')) {
      const parts = datePart.split('-');
      // Nếu năm đứng trước: YYYY-MM-DD
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      // Nếu năm đứng sau: DD-MM-YYYY
      if (parts[2].length === 4) {
        // Có thể là dạng 23-Apr-2026 -> Hàm Date của JS tự parse (nhưng phải dùng Local Time)
        if (isNaN(parts[1])) {
          const d = new Date(datePart);
          if (!isNaN(d.getTime())) return getLocalDateString(d);
        }
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }

    // 3. Định dạng có dấu gạch chéo (/)
    if (datePart.includes('/')) {
      const parts = datePart.split('/');
      // Giả sử DD/MM/YYYY
      if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      // Giả sử YYYY/MM/DD
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }

    // 4. Fallback cuối cùng: Để Javascript tự đoán (Dùng Local Time)
    const fallbackDate = new Date(str);
    if (!isNaN(fallbackDate.getTime())) return getLocalDateString(fallbackDate);

    const fallbackDate2 = new Date(datePart);
    if (!isNaN(fallbackDate2.getTime())) return getLocalDateString(fallbackDate2);

  } catch (e) { return null; }

  return null;
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

       <div class="flex items-center justify-between">
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Historical Data</p>
          <div class="flex items-center gap-2">
            <button id="btn-export-csv" class="px-4 py-1.5 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-500 uppercase hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2">
              <i data-lucide="download" class="w-3.5 h-3.5"></i> Export Excel
            </button>
          </div>
       </div>

       <!-- History Filters (Search + Date) -->
       <div class="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div class="flex gap-3">
             <div class="space-y-1">
                <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest">From</label>
                <input id="channel-from" type="date" class="bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-[10px] font-bold focus:ring-2 focus:ring-[#96588a] transition-all cursor-pointer">
             </div>
             <div class="space-y-1">
                <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest">To</label>
                <input id="channel-to" type="date" class="bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-[10px] font-bold focus:ring-2 focus:ring-[#96588a] transition-all cursor-pointer">
             </div>
          </div>

          <div class="flex gap-2 items-center">
             <input id="channel-search" type="text" placeholder="Search by date (YYYY-MM-DD) or orders..."
               class="w-full md:w-[320px] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 text-[10px] font-bold focus:ring-2 focus:ring-[#96588a] transition-all">
             <button id="channel-clear-btn"
               class="px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-sm">
               Clear
             </button>
          </div>
       </div>

       <div class="chart-card !p-0 overflow-hidden shadow-xl border border-slate-100 dark:border-slate-800">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-tighter">Date</th>
                <th class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-tighter text-center">Orders</th>
                <th class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-tighter">Gross Sale</th>
                <th class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-tighter">Total Ded.</th>
                <th class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-tighter">Net Sale</th>
                <th class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-tighter text-right">Action</th>
              </tr>
            </thead>
            <tbody id="history-table-body" class="divide-y divide-slate-50 dark:divide-slate-800/50">
               <tr><td colspan="6" class="px-6 py-10 text-center text-xs text-slate-400 italic">Fetching data from database...</td></tr>
            </tbody>
          </table>
       </div>
    </div>

    <!-- TAB: IMPORT (Current upload interface) -->
    <div id="section-import" class="tab-content ${activeTab === 'import' ? '' : 'hidden'} space-y-6 page-enter">
        <div id="results-summary" class="grid grid-cols-1 md:grid-cols-3 gap-4"></div>
        <div id="breakdown-area" class="hidden animate-fade-in chart-card !p-0 overflow-hidden"></div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="chart-card flex flex-col items-center justify-center gap-5 min-h-[260px]">
            <input type="file" id="file-input" class="hidden" accept=".xlsx, .xls, .csv" multiple>
            <div id="drop-zone" class="upload-zone w-full flex flex-col items-center gap-3 hover:border-[#96588a] hover:bg-purple-50/50">
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center p-3 bg-purple-50 dark:bg-purple-900/20">
                 <i data-lucide="file-up" class="w-8 h-8" style="color: #96588a;"></i>
              </div>
              <p class="text-sm font-semibold text-slate-600">Drop ${cfg.label} file</p>
            </div>
            <button id="btn-choose" class="w-full py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg transition-all active:scale-[0.98]" style="background: linear-gradient(135deg, #96588a 0%, #7a4671 100%);">Choose File</button>
          </div>
          <div id="preview-area" class="chart-card md:col-span-2 overflow-auto min-h-[260px] flex items-center justify-center relative">
             <p class="text-sm text-slate-400 italic text-center">Preview area<br><span class="text-[10px]">Excel columns (A, B, C...) will appear here</span></p>
          </div>
        </div>

        <div class="flex justify-end pt-4">
          <button id="btn-save" class="hidden px-8 py-3 rounded-xl text-[12px] font-bold text-white transition-all shadow-xl flex items-center gap-2 active:scale-95" style="background-color: #96588a;">
            <i data-lucide="save" class="w-4 h-4"></i> Confirm & Save to Database
          </button>
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

    btnChoose.onclick = () => fileInput.click();
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
        page.querySelector('#tab-history').click();
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
      let modal = document.getElementById('detail-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'detail-modal';
        modal.className = 'fixed inset-0 z-[9999] hidden overflow-y-auto bg-slate-900/30 animate-fade-in py-10 px-4';
        modal.innerHTML = `
            <div class="flex min-h-full items-center justify-center">
               <div class="bg-white/70 dark:bg-slate-900/80 backdrop-blur-2xl w-full max-w-md rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.2),inset_0_0_20px_rgba(255,255,255,0.1)] overflow-hidden animate-scale-up border-2 border-white/60 dark:border-white/10">
                  <div class="px-8 pt-8 pb-2 flex items-center justify-between">
                     <div>
                        <h3 id="modal-date" class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">Date Details</h3>
                        <p class="text-[10px] text-[#96588a] font-bold uppercase tracking-[0.2em] mt-1">Financial Breakdown</p>
                     </div>
                     <button id="close-modal" class="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all text-slate-400 text-3xl font-light">&times;</button>
                  </div>
                  <div id="modal-content" class="px-8 pb-8 pt-4 space-y-4"></div>
               </div>
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
      }
      return modal;
    }
    ensureModal();

    // Export Excel from Template logic
    page.querySelector('#btn-export-csv').onclick = async () => {
      if (historyItems.length === 0) return alert('No data to export');

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

        // Populate data starting from Row 2
        sortedItems.forEach((item, index) => {
          const rowNum = 2 + index;
          worksheet.getCell(`A${rowNum}`).value = item.date;
          worksheet.getCell(`B${rowNum}`).value = item.orders;
          worksheet.getCell(`C${rowNum}`).value = item.financials.gross;
          worksheet.getCell(`D${rowNum}`).value = item.financials.totalDeductions;
          worksheet.getCell(`E${rowNum}`).value = item.financials.net;
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
    const refreshData = () => fetchChannelHistory(channelId);

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
    const globalFilterHandler = () => refreshData();
    window.addEventListener('global-filter-changed', globalFilterHandler);

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
      btnSave.disabled = true;
      btnSave.innerText = "Saving to Database...";
      try {
        await saveToDatabase(channelId, branchId, currentResults);
        btnSave.style.background = "#10b981";
        btnSave.innerText = "Data Successfully Synced!";
        // Switch to history tab to show the new data
        setTimeout(() => {
          btnSave.classList.add('hidden');
          btnSave.style.background = "";
          page.querySelector('#tab-history').click();
          fetchChannelHistory(channelId); // Refresh history
        }, 1500);
      } catch (err) {
        alert("Error saving: " + err.message);
        btnSave.disabled = false;
        btnSave.innerText = "Try Again";
      }
    };

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

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const data = await readExcelFile(file);

        if (data && data.length > 0) {
          if (i === 0) {
            allDataRows.push(data[0]); // Giữ lại dòng Header của file đầu tiên
          }
          // Bỏ qua dòng Header, nối phần dữ liệu của các file lại
          for (let j = 1; j < data.length; j++) {
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
      const grouped = groupDataByDate(allDataRows, channelId, cfg);
      currentResults = grouped;

      try {
        updateUI(page, grouped, channelId);
        renderPreviewTable(allDataRows.slice(0, 15), previewArea, `Combined (${fileList.length} files)`);
        btnSave.classList.remove('hidden');
        btnSave.innerText = "Save to Database";
        btnSave.disabled = false;
      } catch (err) {
        console.error("UI Update Error:", err);
        previewArea.innerHTML = `<p class="text-rose-500 text-sm">UI Error: ${err.message}</p>`;
      }
    }
  }, 0);

  return page;
}

function groupDataByDate(data, channelId, cfg) {
  const dailyData = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i]; if (!row || row.length === 0) continue;

    const dateKey = standardizeDate(row[cfg.colDate], channelId);
    if (!dateKey) continue;

    if (!dailyData[dateKey]) dailyData[dateKey] = [];
    dailyData[dateKey].push(row);
  }

  const results = {};
  for (const [date, rows] of Object.entries(dailyData)) {
    results[date] = (channelId === 'foodpanda') ? calculatePanda(rows, cfg) :
      (channelId === 'grabfood') ? calculateGrab(rows, cfg) :
        (channelId === 'dinein') ? calculateDineIn(rows, cfg) :
          calculateOnline(rows, cfg);
  }
  return results;
}

async function saveToDatabase(channelId, branchId, results) {
  const batchId = `BATCH_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  let totalRows = 0;

  const promises = Object.entries(results).map(([date, res]) => {
    totalRows += (res.orders || 0);
    const safeBranchName = branchId.replace(/\s+/g, '');
    const docId = `${channelId}_${safeBranchName}_${date}`;

    const dataToSave = {
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
      importBatchId: batchId, // Tracking ID
      updatedAt: serverTimestamp()
    };

    return setDoc(doc(db, "daily_sales", docId), dataToSave);
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

function updateUI(page, dailyResults, channelId) {
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
    discount100: '100% Discount (Manager)'
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

  summaryArea.innerHTML = `
    <div class="col-span-full grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      
      <!-- LEFT: 2x2 KPI Grid -->
      <div class="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="chart-card bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl flex flex-col justify-between p-5 border-l-4 border-slate-400">
          <div class="flex items-center justify-between">
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gross Revenue</p>
            <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center"><i data-lucide="bar-chart-3" class="w-4 h-4 text-slate-400"></i></div>
          </div>
          <div class="mt-4">
            <h3 class="text-2xl font-black text-slate-800 dark:text-white">${fmt.format(totalGross)}</h3>
            <p class="text-[10px] text-slate-400 mt-1 font-medium">Total sales before deductions</p>
          </div>
        </div>

        <div class="chart-card bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl flex flex-col justify-between p-5 border-l-4 border-[#96588a]">
          <div class="flex items-center justify-between">
            <p class="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Net Revenue</p>
            <div class="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center"><i data-lucide="wallet" class="w-4 h-4 text-[#96588a]"></i></div>
          </div>
          <div class="mt-4">
            <h3 class="text-2xl font-black text-slate-800 dark:text-white">${fmt.format(totalNet)}</h3>
            <p class="text-[10px] text-emerald-500 mt-1 font-bold">Actual amount credited</p>
          </div>
        </div>

        <div class="chart-card flex flex-col justify-between p-5 border-l-4 border-blue-400">
          <div class="flex items-center justify-between">
            <p class="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Total Orders</p>
            <div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center"><i data-lucide="shopping-bag" class="w-4 h-4 text-blue-400"></i></div>
          </div>
          <div class="mt-4">
            <h3 class="text-2xl font-black text-slate-800 dark:text-white">${totalOrders.toLocaleString()}</h3>
            <p class="text-[10px] text-slate-400 mt-1 font-medium italic">Verified transaction count</p>
          </div>
        </div>

        <div class="chart-card flex flex-col justify-between p-5 border-l-4 border-amber-400">
          <div class="flex items-center justify-between">
            <p class="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Days Found</p>
            <div class="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center"><i data-lucide="calendar-days" class="w-4 h-4 text-amber-500"></i></div>
          </div>
          <div class="mt-4">
            <h3 class="text-2xl font-black text-slate-800 dark:text-white">${dates.length} Days</h3>
            <p class="text-[10px] text-slate-400 mt-1 font-medium">Distinct dates in uploaded files</p>
          </div>
        </div>
      </div>

      <!-- RIGHT: Vertical Financial Breakdown -->
      <div class="chart-card !p-0 overflow-hidden flex flex-col border-l-4 border-rose-400 shadow-xl">
        <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-rose-50/30">
          <p class="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Financial Breakdown</p>
        </div>
        <div class="p-6 flex-1 space-y-4 overflow-auto max-h-[420px]">
          ${finalDetails.length > 0 ? finalDetails.map(d => `
            <div class="flex items-center justify-between group">
              <div class="flex flex-col">
                <p class="text-xs font-bold text-slate-600 dark:text-slate-300 group-hover:text-purple-500 transition-colors">${d.label}</p>
                <p class="text-[9px] text-slate-400 uppercase font-medium">${d.type}</p>
              </div>
              <p class="text-sm font-bold ${d.color}">${d.type === 'deduction' ? '-' : '+'}${fmt.format(d.val)}</p>
            </div>
          `).join('') : '<p class="text-xs text-slate-400 italic text-center py-10">No items found</p>'}
          
          <div class="pt-4 mt-4 border-t border-dashed border-slate-200 dark:border-slate-800 space-y-2">
            <div class="flex items-center justify-between">
              <p class="text-[10px] font-bold text-rose-500 uppercase">Total Deductions</p>
              <p class="text-xs font-bold text-rose-500">-${fmt.format(totalDed)}</p>
            </div>
            ${totalIncome > 0 ? `
              <div class="flex items-center justify-between">
                <p class="text-[10px] font-bold text-emerald-500 uppercase">Total Incomes</p>
                <p class="text-xs font-bold text-emerald-500">+${fmt.format(totalIncome)}</p>
              </div>
            ` : ''}
            <div class="flex items-center justify-between pt-1">
              <p class="text-xs font-black text-slate-800 dark:text-white uppercase tracking-tighter">Aggregated Net</p>
              <p class="text-base font-black text-[#96588a]">${fmt.format(totalNet)}</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  `;

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
    <div class="channel-card-premium" style="--channel-accent: ${accent}">
      <div class="channel-card-accent"></div>
      <div class="relative z-10 flex flex-col h-full">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Revenue</p>
            <h3 id="summary-net" class="text-2xl font-black text-slate-900 dark:text-white tracking-tighter transition-all duration-300">${netVal}</h3>
          </div>
          <div class="p-2 w-10 h-10 rounded-2xl bg-white/50 dark:bg-slate-800/50 flex items-center justify-center shadow-sm">
            <i data-lucide="trending-up" class="w-5 h-5" style="color: ${accent}"></i>
          </div>
        </div>
        
        <div class="mt-auto pt-6 flex items-center gap-2">
          <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[9px] font-black tracking-tight">STABLE</span>
          <span class="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Live Performance</span>
        </div>
      </div>
      
      <div class="sparkline-container">
        <svg viewBox="0 0 300 60" preserveAspectRatio="none" class="w-full h-full">
          <path class="sparkline-path" d="M ${points}" style="--channel-accent: ${accent}"></path>
        </svg>
      </div>
    </div>

    <div class="channel-card-premium">
       <div class="relative z-10">
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Order Volume</p>
          <h3 id="summary-orders" class="text-2xl font-black text-slate-900 dark:text-white tracking-tighter transition-all duration-300">${ordersVal}</h3>
          <p class="text-[9px] text-slate-400 font-bold mt-2 uppercase tracking-widest">Total Orders Handled</p>
       </div>
    </div>

    <div class="channel-card-premium">
       <div class="relative z-10">
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Average Order</p>
          <h3 id="summary-avg" class="text-2xl font-black text-slate-900 dark:text-white tracking-tighter transition-all duration-300">${avgVal}</h3>
          <p class="text-[9px] text-slate-400 font-bold mt-2 uppercase tracking-widest">Revenue Per Order</p>
       </div>
    </div>

    <div class="channel-card-premium">
       <div class="relative z-10">
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Deduction</p>
          <h3 id="summary-ded" class="text-2xl font-black text-rose-500 tracking-tighter transition-all duration-300">${dedVal}</h3>
          <p class="text-[9px] text-slate-400 font-bold mt-2 uppercase tracking-widest">Platform Fees & Costs</p>
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
  const branchId = document.getElementById('db-branch')?.value || 'Pioneer Center';
  const rangeStr = document.getElementById('db-date-range')?.value || '';
  const localFrom = document.getElementById('channel-from')?.value || '';
  const localTo = document.getElementById('channel-to')?.value || '';
  const searchText = (document.getElementById('channel-search')?.value || '').trim().toLowerCase();

  let fromDate = '', toDate = '';
  // Local (table-level) date filter takes precedence.
  if (localFrom || localTo) {
    fromDate = localFrom || localTo;
    toDate = localTo || localFrom;
  } else {
    if (rangeStr.includes(' to ')) {
      [fromDate, toDate] = rangeStr.split(' to ');
    } else if (rangeStr) {
      fromDate = toDate = rangeStr;
    }
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
        orderBy("date", "desc")
      );
    } else {
      // DEFAULT: Yesterday
      const yest = new Date();
      yest.setDate(yest.getDate() - 1);
      const yestStr = yest.toISOString().split('T')[0];

      q = query(
        collection(db, "daily_sales"),
        where("channelId", "==", channelId),
        where("branchId", "==", branchId),
        where("date", "==", yestStr)
      );
    }

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-xs text-slate-400 italic">No historical data found for <span class="font-bold text-slate-600">${branchId}</span> on this channel. <br><span class="text-[10px] mt-2 block">Try importing a file in the "Import Data" tab and click "Save to Database".</span></td></tr>`;
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
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group history-row" data-id="${docId}">
          <td class="px-6 py-4 text-[11px] font-bold text-slate-700 dark:text-slate-300">${data.date}</td>
          <td class="px-6 py-4 text-[11px] font-bold text-slate-500 text-center">${data.orders.toLocaleString()}</td>
          <td class="px-6 py-4 text-[11px] font-bold text-slate-700 dark:text-white">${fmt.format(data.financials.gross)}</td>
          <td class="px-6 py-4 text-[11px] font-bold text-rose-500">-${fmt.format(data.financials.totalDeductions)}</td>
          <td class="px-6 py-4 text-[11px] font-black text-[#96588a]">${fmt.format(data.financials.net)}</td>
          <td class="px-6 py-4 text-right">
            <div class="flex items-center justify-end gap-2">
              <button class="channel-view-btn p-1.5 rounded-lg hover:bg-white hover:shadow-md transition-all opacity-0 group-hover:opacity-100" title="View Detail">
                <i data-lucide="eye" class="w-3.5 h-3.5 text-slate-400"></i>
              </button>
              <button class="channel-edit-btn p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-sm" title="Edit Entry">
                <i data-lucide="pencil" class="w-3 h-3"></i>
              </button>
              <button class="channel-delete-btn p-1.5 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-sm" title="Delete Entry">
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
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // Prevent background scroll

  let html = `
    <div class="space-y-4">
      <div class="p-4 bg-white/20 dark:bg-white/5 backdrop-blur-xl rounded-3xl border border-white/40 dark:border-white/10 flex items-center justify-between">
         <div>
            <p class="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-widest">Gross Revenue</p>
            <p class="text-lg font-black text-slate-800 dark:text-white mt-0.5">${fmt.format(item.financials.gross)}</p>
         </div>
         <div class="w-10 h-10 rounded-xl bg-white/40 dark:bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/50">
            <i data-lucide="trending-up" class="w-5 h-5 text-emerald-500"></i>
         </div>
      </div>

      <div class="space-y-2">
         <p class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2 border-l-2 border-[#96588a]">Deductions</p>
         <div class="space-y-0.5">
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
    discount100: '100% Discount (Manager)'
  };

  if (item.breakdown && item.breakdown.deductions) {
    for (const [key, val] of Object.entries(item.breakdown.deductions)) {
      if (val === 0 && key !== 'invoiceDiscount' && key !== 'discount100') continue;
      html += `
          <div class="flex items-center justify-between px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors rounded-xl">
            <p class="text-xs font-bold text-slate-600 dark:text-slate-400 leading-tight pr-4">${labelsMap[key] || key}</p>
            <p class="text-[13px] font-black text-rose-500 whitespace-nowrap">-${fmt.format(val)}</p>
          </div>
        `;
    }
  }

  if (item.breakdown && item.breakdown.incomes) {
    for (const [key, val] of Object.entries(item.breakdown.incomes)) {
      if (val === 0) continue;
      html += `
         <div class="flex items-center justify-between px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors rounded-xl">
           <p class="text-xs font-bold text-slate-600 dark:text-slate-400 leading-tight pr-4">${labelsMap[key] || key}</p>
           <p class="text-[13px] font-black text-emerald-500 whitespace-nowrap">+${fmt.format(val)}</p>
         </div>
       `;
    }
  }

  html += `
         </div>
      </div>
      
      <div class="p-5 bg-[#96588a]/90 backdrop-blur-xl rounded-3xl border border-white/20 mt-4 shadow-lg shadow-purple-500/5">
         <div class="flex items-center justify-between">
            <div>
               <p class="text-[10px] font-bold text-purple-50 uppercase tracking-widest">Net Revenue</p>
               <p class="text-xl font-black text-white mt-0.5">${fmt.format(item.financials.net)}</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20">
               <i data-lucide="wallet" class="w-5 h-5 text-white"></i>
            </div>
         </div>
      </div>
    </div>
  `;

  modalContent.innerHTML = html;
  if (window.lucide) window.lucide.createIcons();
}

function renderPreviewTable(data, container, fileName) {
  container.className = 'chart-card md:col-span-2 flex flex-col h-full overflow-hidden p-0';
  const excelHeaders = data[0].map((_, i) => getExcelColumnName(i));
  container.innerHTML = `
    <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
      <p class="text-[10px] font-bold text-slate-400 uppercase truncate">Preview: ${fileName}</p>
    </div>
    <div class="flex-1 overflow-auto">
      <table class="w-full text-[9px] text-left border-collapse">
        <thead class="sticky top-0 z-10">
          <tr class="bg-indigo-50 text-indigo-600 font-bold">${excelHeaders.map(h => `<th class="px-3 py-1 border-b border-slate-200 text-center">${h}</th>`).join('')}</tr>
          <tr class="bg-white border-b border-slate-100">${data[0].map(c => `<th class="px-3 py-2 font-bold text-slate-600 whitespace-nowrap">${c || ''}</th>`).join('')}</tr>
        </thead>
        <tbody class="divide-y divide-slate-50">
          ${data.slice(1).map(row => `<tr>${row.map(c => `<td class="px-3 py-1.5 text-slate-500 whitespace-nowrap">${c ?? ''}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function showChannelEditModal(item, channelId) {
  const ov = document.createElement('div');
  ov.className = 'fixed inset-0 bg-slate-900/60 z-[10001] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
  ov.innerHTML = `
    <div class="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] max-w-md w-full space-y-6 animate-scale-up shadow-2xl border border-white/20">
      <div class="flex items-center justify-between">
         <h3 class="text-xl font-black uppercase tracking-tighter">Edit Sales Record</h3>
         <button id="close-channel-edit" class="text-slate-400 hover:text-slate-600 transition-colors"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>
      
      <div class="space-y-4">
         <div class="space-y-1">
            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Date (Read-only)</label>
            <input type="text" class="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold opacity-60" value="${item.date}" disabled>
         </div>
         <div class="space-y-1">
            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Orders Count</label>
            <input type="number" id="edit-ch-orders" class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold" value="${item.orders}">
         </div>
         <div class="space-y-1">
            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Gross Revenue (PHP)</label>
            <input type="number" id="edit-ch-gross" class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold" value="${item.financials.gross}">
         </div>
         <div class="space-y-1">
            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Total Deductions (PHP)</label>
            <input type="number" id="edit-ch-deductions" class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold" value="${item.financials.totalDeductions}">
         </div>
      </div>

      <p class="text-[10px] text-amber-600 font-bold bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl italic">
        Note: Net revenue will be recalculated automatically based on Gross and Deductions.
      </p>

      <button id="save-channel-edit-btn" class="w-full py-4 bg-[#96588a] text-white rounded-xl font-black uppercase tracking-[0.2em] text-[10px] transition-all shadow-lg hover:shadow-[#96588a]/30">
         Update Record
      </button>
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
