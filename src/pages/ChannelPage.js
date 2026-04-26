import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const CHANNEL_CONFIG = {
  dinein: { 
    label: 'Dine In', icon: '🍽️', color: 'amber', hex: '#f59e0b', 
    colGross: 57, colProdDisc: 59, colInvDisc: 31, colId: 1, colDate: 5 
  },
  grabfood: { 
    label: 'GrabFood', icon: '🛵', color: 'emerald', hex: '#10b981', 
    colGross: 29, colMerchantDisc: 35, colDeliveryDisc: 36, colComm: 46, colMarketing: 44, colAds: 52, colOrderComm: 47, colDate: 5
  }, 
  foodpanda: { 
    label: 'FoodPanda', icon: '🐼', color: 'pink', hex: '#ec4899', 
    colGross: 21, colCheckP: 15, colCheckS: 18, colCheckT: 19, colCheckU: 20, colDiscount: 28, colComm: 31, colTax: 26, colMarketing: 34, colAds: 33, colOthers: 29, colRefunds: 24, colDate: 8
  }, 
  online: { 
    label: 'Online Order', icon: '🛒', color: 'violet', hex: '#8b5cf6', 
    colGross: 13, colDate: 18
  }, 
};

// Hàm hỗ trợ lấy ngày nội bộ (Local Time) tránh bị lùi 1 ngày do lệch múi giờ (Timezone Offset)
function getLocalDateString(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
      // Nếu năm đứng sau: DD-MM-YYYY
      if (parts[2].length === 4) {
        // Có thể là dạng 23-Apr-2026 -> Hàm Date của JS tự parse (nhưng phải dùng Local Time)
        if (isNaN(parts[1])) {
           const d = new Date(datePart);
           if (!isNaN(d.getTime())) return getLocalDateString(d);
        }
        return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
      }
    }
    
    // 3. Định dạng có dấu gạch chéo (/)
    if (datePart.includes('/')) {
      const parts = datePart.split('/');
      // Giả sử DD/MM/YYYY
      if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
      // Giả sử YYYY/MM/DD
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
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
  const cleaned = String(val).replace(/[^0-9.-]+/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
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

export function renderChannelPage(channelId) {
  const cfg = CHANNEL_CONFIG[channelId];
  const page = document.createElement('div');
  page.className = 'p-6 space-y-6 page-enter';

  page.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style="background: ${cfg.hex}20;">${cfg.icon}</div>
        <div>
          <h2 class="font-bold text-slate-800 dark:text-white text-lg">${cfg.label} Analysis</h2>
          <p class="text-xs text-slate-400 mt-0.5">Automated Multi-day Processing</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <button id="btn-save" class="hidden px-5 py-2 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 flex items-center gap-2">
          <span id="save-icon">💾</span> Save to Database
        </button>
      </div>
    </div>

    <!-- Summary of results -->
    <div id="results-summary" class="grid grid-cols-1 md:grid-cols-3 gap-4">
       <!-- Initial state -->
       <div class="stat-card border-dashed border-2 border-slate-100 flex items-center justify-center min-h-[100px]">
          <p class="text-xs text-slate-400">Upload a file to see analysis</p>
       </div>
    </div>

    <div id="breakdown-area" class="hidden animate-fade-in chart-card !p-0 overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 flex items-center justify-between">
          <p class="text-xs font-bold text-slate-700">Financial Breakdown (Aggregated)</p>
          <p id="days-count" class="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold"></p>
        </div>
        <div class="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" id="breakdown-grid"></div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="chart-card flex flex-col items-center justify-center gap-5 min-h-[260px]">
        <input type="file" id="file-input" class="hidden" accept=".xlsx, .xls, .csv" multiple>
        <div id="drop-zone" class="upload-zone w-full flex flex-col items-center gap-3">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl" style="background: ${cfg.hex}15;">📁</div>
          <p class="text-sm font-semibold text-slate-600">Drop ${cfg.label} file</p>
        </div>
        <button id="btn-choose" class="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style="background: linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);">Choose File</button>
      </div>
      <div id="preview-area" class="chart-card md:col-span-2 overflow-auto min-h-[260px] flex items-center justify-center relative">
         <p class="text-sm text-slate-400 italic text-center">Preview area<br><span class="text-[10px]">Excel columns (A, B, C...) will appear here</span></p>
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

    btnChoose.onclick = () => fileInput.click();
    fileInput.onchange = (e) => { if (e.target.files.length > 0) processFiles(e.target.files); };
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('border-indigo-400'); };
    dropZone.ondrop = (e) => { e.preventDefault(); dropZone.classList.remove('border-indigo-400'); if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files); };
    
    btnSave.onclick = async () => {
      if (!currentResults) return;
      const branchId = document.getElementById('db-branch').value;
      btnSave.disabled = true;
      btnSave.innerText = "Saving...";
      try {
        await saveToDatabase(channelId, branchId, currentResults);
        btnSave.style.background = "#10b981";
        btnSave.innerText = "Successfully Saved!";
        setTimeout(() => { btnSave.classList.add('hidden'); btnSave.style.background = ""; }, 3000);
      } catch (err) {
        alert("Error saving: " + err.message);
        btnSave.disabled = false;
        btnSave.innerText = "Try Again";
      }
    };

    function readExcelFile(file) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
            resolve(data);
          } catch(err) { resolve([]); }
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
          for(let j = 1; j < data.length; j++) {
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

      updateUI(page, grouped, channelId);
      renderPreviewTable(allDataRows.slice(0, 15), previewArea, `Combined (${fileList.length} files)`);
      btnSave.classList.remove('hidden');
      btnSave.innerText = "Save to Database";
      btnSave.disabled = false;
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
  const promises = Object.entries(results).map(([date, res]) => {
    // Định dạng ID: grabfood_PioneerCenter_2026-04-23
    const safeBranchName = branchId.replace(/\s+/g, '');
    const docId = `${channelId}_${safeBranchName}_${date}`;
    
    // Cấu trúc Data chuẩn mới (Raw Data Schema)
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
      updatedAt: serverTimestamp()
    };
    
    // Xóa sạch cấu trúc cũ (không dùng merge: true) để đảm bảo DB gọn gàng
    return setDoc(doc(db, "daily_sales", docId), dataToSave);
  });
  await Promise.all(promises);
}

// Logic tính toán cho từng kênh (đã cập nhật cleanNumber)
function calculateOnline(rows, cfg) {
  let gross = 0;
  rows.forEach(row => { gross += cleanNumber(row[cfg.colGross]); });
  
  const breakdown = {
    deductions: {},
    incomes: {}
  };
  
  return { net: gross, gross, orders: rows.length, totalDed: 0, breakdown, details: [{label: 'Gross Sale', val: gross, color: 'text-slate-600'}] };
}

function calculateGrab(rows, cfg) {
  let gross = 0, merchantDisc = 0, deliveryDisc = 0, comm = 0, marketing = 0, ads = 0, orderComm = 0;
  rows.forEach(row => {
    let g = cleanNumber(row[cfg.colGross]);
    if (g > 0) {
      gross += g;
      merchantDisc += Math.abs(cleanNumber(row[cfg.colMerchantDisc]));
      deliveryDisc += Math.abs(cleanNumber(row[cfg.colDeliveryDisc]));
      comm += Math.abs(cleanNumber(row[cfg.colComm]));
      marketing += Math.abs(cleanNumber(row[cfg.colMarketing]));
      orderComm += Math.abs(cleanNumber(row[cfg.colOrderComm]));
    }
    let aVal = cleanNumber(row[cfg.colAds]);
    if (aVal < 0) ads += Math.abs(aVal);
  });
  const totalDed = merchantDisc + deliveryDisc + comm + marketing + ads + orderComm;
  
  const breakdown = {
    deductions: {
      merchantDiscount: merchantDisc,
      deliveryDiscount: deliveryDisc,
      commission: comm,
      marketingFee: marketing,
      adsFee: ads,
      orderCommission: orderComm
    },
    incomes: {}
  };

  return { net: gross - totalDed, gross, orders: rows.length, totalDed, breakdown, details: [
    { label: 'Gross Sale', val: gross, color: 'text-slate-600' },
    { label: 'Merchant Disc', val: merchantDisc, color: 'text-rose-500', isDed: true },
    { label: 'Delivery Disc', val: deliveryDisc, color: 'text-rose-500', isDed: true },
    { label: 'Commission', val: comm, color: 'text-rose-500', isDed: true },
    { label: 'Marketing Fee', val: marketing, color: 'text-rose-500', isDed: true },
    { label: 'Ads Fee', val: ads, color: 'text-rose-500', isDed: true }
  ]};
}

function calculatePanda(rows, cfg) {
  let gross = 0, disc = 0, comm = 0, tax = 0, marketing = 0, ads = 0, others = 0, refunds = 0, orders = 0;
  rows.forEach(row => {
    const isCancelled = String(row[cfg.colCheckP] || '').trim() === '' && (String(row[cfg.colCheckS] || '').trim() !== '' || String(row[cfg.colCheckT] || '').trim() !== '' || String(row[cfg.colCheckU] || '').trim() !== '');
    let g = cleanNumber(row[cfg.colGross]);
    if (!isCancelled && g !== 0) { gross += g; orders++; }
    disc += Math.abs(cleanNumber(row[cfg.colDiscount]));
    comm += Math.abs(cleanNumber(row[cfg.colComm]));
    tax += Math.abs(cleanNumber(row[cfg.colTax]));
    marketing += Math.abs(cleanNumber(row[cfg.colMarketing]));
    ads += Math.abs(cleanNumber(row[cfg.colAds]));
    others += Math.abs(cleanNumber(row[cfg.colOthers]));
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

  return { net: gross - totalDed + refunds, gross, orders, totalDed, breakdown, details: [
    { label: 'Gross Sale', val: gross, color: 'text-slate-600' },
    { label: 'Total Deductions', val: totalDed, color: 'text-rose-500', isDed: true },
    { label: 'Vendor Refunds', val: refunds, color: 'text-emerald-500', isIncome: true }
  ]};
}

function calculateDineIn(rows, cfg) {
  let gross = 0, prodDisc = 0, invDisc = 0;
  const ids = new Set(), invProcessed = new Set();
  rows.forEach(row => {
    const id = String(row[cfg.colId] || '').trim(); if (!id) return;
    ids.add(id);
    gross += cleanNumber(row[cfg.colGross]);
    prodDisc += cleanNumber(row[cfg.colProdDisc]);
    if (!invProcessed.has(id)) { invDisc += cleanNumber(row[cfg.colInvDisc]); invProcessed.add(id); }
  });
  
  const breakdown = {
    deductions: {
      productDiscount: prodDisc,
      invoiceDiscount: invDisc
    },
    incomes: {}
  };

  return { net: gross - prodDisc - invDisc, gross, orders: ids.size, totalDed: prodDisc + invDisc, breakdown, details: [
    { label: 'Gross Sale', val: gross, color: 'text-slate-600' },
    { label: 'Product Disc', val: prodDisc, color: 'text-rose-500', isDed: true },
    { label: 'Invoice Disc', val: invDisc, color: 'text-rose-500', isDed: true }
  ]};
}

function updateUI(page, groupedResults, channelId) {
  const dates = Object.keys(groupedResults).sort();
  const fmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
  
  // Tính tổng tất cả các ngày trong file
  let totalGross = 0, totalNet = 0, totalOrders = 0, totalDed = 0;
  dates.forEach(d => {
    totalGross += groupedResults[d].gross;
    totalNet += groupedResults[d].net;
    totalOrders += groupedResults[d].orders;
    totalDed += groupedResults[d].totalDed;
  });

  const summaryArea = page.querySelector('#results-summary');
  summaryArea.innerHTML = `
    <div class="stat-card border-b-4 border-emerald-500">
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Net (All Days)</p>
      <p class="text-2xl font-bold text-emerald-600">${fmt.format(totalNet)}</p>
    </div>
    <div class="stat-card">
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Orders</p>
      <p class="text-2xl font-bold text-slate-700">${totalOrders.toLocaleString()}</p>
    </div>
    <div class="stat-card">
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Dates Found</p>
      <p class="text-2xl font-bold text-indigo-500">${dates.length} Days</p>
    </div>
  `;

  const brk = page.querySelector('#breakdown-area');
  brk.classList.remove('hidden');
  
  // Aggregate details dynamically to keep the breakdown intact
  let aggregatedDetails = [];
  if (dates.length > 0) {
    aggregatedDetails = groupedResults[dates[0]].details.map(d => ({...d, val: 0}));
    dates.forEach(d => {
      groupedResults[d].details.forEach((item, index) => {
        if (aggregatedDetails[index]) aggregatedDetails[index].val += item.val;
      });
    });
  }

  const grid = page.querySelector('#breakdown-grid');
  let html = aggregatedDetails.map(d => `
    <div>
      <p class="text-[10px] font-bold text-slate-400 uppercase mb-1 truncate">${d.label}</p>
      <p class="text-base font-bold ${d.color}">${d.isDed ? '-' : d.isIncome ? '+' : ''}${fmt.format(d.val)}</p>
    </div>
  `).join('');

  if (dates.length > 1) {
    page.querySelector('#days-count').innerText = `Aggregated: ${dates[0]} to ${dates[dates.length-1]}`;
    html += `
      <div class="col-span-full md:col-span-2 lg:col-span-4 bg-indigo-50/50 p-4 rounded-xl mt-2 border border-indigo-100/50">
         <p class="text-[10px] font-bold text-indigo-400 uppercase mb-3 flex items-center justify-between">
            <span>Daily Net Summary</span>
            <span class="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">${dates.length} Days</span>
         </p>
         <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[160px] overflow-y-auto pr-2">
           ${dates.map(d => `
             <div class="bg-white p-2.5 rounded-lg shadow-sm border border-slate-100 flex flex-col items-center justify-center hover:border-indigo-200 transition-colors">
               <span class="font-bold text-[10px] text-slate-400 mb-0.5">${d}</span>
               <span class="text-emerald-600 font-bold text-xs">${fmt.format(groupedResults[d].net)}</span>
             </div>
           `).join('')}
         </div>
      </div>
    `;
  } else {
    page.querySelector('#days-count').innerText = `Single Day: ${dates[0]}`;
  }

  grid.innerHTML = html;
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
