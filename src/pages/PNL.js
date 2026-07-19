import { db } from '../firebase.js';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

let _pnlExportState = { branches: [], data: {} };

window.togglePnlDeductions = (rowId) => {
  const icon = document.getElementById(`pnl-toggle-icon-${rowId}`);
  if (icon) {
    const isExpanded = icon.classList.contains('rotate-90');
    icon.classList.toggle('rotate-90', !isExpanded);
    document.querySelectorAll(`tr[data-parent="${rowId}"]`).forEach(el => {
      el.classList.toggle('hidden', isExpanded);
    });
  }
};

export function renderPNL(user = null) {
  const DEFAULT_BRANCHES = ['All Branches', 'Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf', 'UST'];
  const isAdmin = user?.permissions?.isAdmin === true || ['jimmie.somot@gmail.com'].includes(user?.email);
  const allowedBranches = isAdmin ? DEFAULT_BRANCHES : (user?.permissions?.allowedBranches || DEFAULT_BRANCHES);
  const activeBranchSelect = allowedBranches.includes('All Branches') ? 'All Branches' : allowedBranches[0];

  const page = document.createElement('div');
  page.className = 'page-enter h-full flex flex-col p-2 pb-0';

  page.innerHTML = `
    <!-- PNL Header Controls (Simplified) -->
    <div class="flex justify-end gap-3 px-6 py-2" id="pnl-top-actions">
       <!-- Export button moved to local filters area in JS -->
    </div>

    <!-- PNL Table Container -->
    <style>
      #pnl-main-table { border-collapse: separate; border-spacing: 0; }
      #pnl-main-table thead th { 
        position: sticky; 
        top: 0; 
        z-index: 100;
        background: #072a20 !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.15);
        border-left: 1px solid rgba(255, 255, 255, 0.1) !important;
      }
      #pnl-main-table thead th:first-child {
        border-left: none !important;
      }
      
      /* Make all header texts white on green background */
      #pnl-main-table thead th,
      #pnl-main-table thead th h2,
      #pnl-main-table thead th div,
      #pnl-main-table thead th span { 
        color: #ffffff !important;
      }
      #pnl-main-table thead th p {
        color: rgba(255, 255, 255, 0.6) !important;
      }
      
      #pnl-main-table .pnl-section-header td { 
        position: sticky; 
        top: 60px;
        z-index: 90;
        background: #eef7f4 !important; /* Extremely light forest green */
        color: #072a20 !important; /* Rich Dark Forest Green */
        border-bottom: 1px solid rgba(7, 42, 32, 0.1);
      }
      .dark #pnl-main-table .pnl-section-header td { 
        background: #0d2820 !important; /* Deep forest green for dark mode */
        color: #a7d3c7 !important; /* Soft sage green */
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }
      
      .pnl-row-hover:hover td { background: rgba(150, 88, 138, 0.03) !important; }
      .dark .pnl-row-hover:hover td { background: rgba(255, 255, 255, 0.03) !important; }

      .pnl-sticky-desc {
        position: sticky;
        left: 0;
        z-index: 80;
        background: inherit;
      }
      
      #pnl-main-table-wrapper {
        zoom: 0.9;
        -moz-transform: scale(0.9);
        -moz-transform-origin: top left;
      }
      
      /* Global override for PNL tab to remove main container padding and lock height */
      #page-content:has(#pnl-main-table) {
        padding: 0 !important;
        height: calc(100vh - 70px) !important; 
        overflow: hidden !important;
        display: flex;
        flex-direction: column;
      }
    </style>

    <div class="glass-panel rounded-xl border flex flex-col flex-1 overflow-hidden">
      <div id="pnl-main-table-wrapper" class="overflow-y-auto overflow-x-auto flex-1 scrollbar-hide">
        <table class="w-full text-left border-collapse table-fixed" id="pnl-main-table">
          <thead>
            <tr id="pnl-header-row">
              <!-- JS will inject Description, Branches, and Industry Std here -->
            </tr>
          </thead>
          <tbody id="pnl-tbody" class="divide-y divide-slate-50 dark:divide-white/5"></tbody>
        </table>
      </div>
    </div>

    <div id="pnl-loading" class="fixed inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center hidden">
       <div class="flex flex-col items-center gap-3">
          <div class="w-10 h-10 border-4 border-[#96588a] border-t-transparent rounded-full animate-spin"></div>
          <p class="text-[10px] font-black text-slate-600 dark:text-white uppercase tracking-widest">Generating Statement...</p>
       </div>
    </div>
  `;

  // Internal State
  let currentBranch = 'All Branches';
  let dateRange = '';


  const handleUpdate = async () => {
    const branchEl = document.getElementById('pnl-branch');
    const rangeEl = document.getElementById('pnl-date-range');

    currentBranch = branchEl?.value || activeBranchSelect;
    dateRange = rangeEl?.value || '';

    const getLocalStr = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    let fromStr, toStr;
    if (dateRange.includes(' to ')) {
      [fromStr, toStr] = dateRange.split(' to ');
    } else {
      const now = new Date();
      fromStr = getLocalStr(new Date(now.getFullYear(), now.getMonth(), 1));
      toStr = getLocalStr(now);
    }

    await loadAndRenderPNL(page, currentBranch, fromStr, toStr, allowedBranches);
  };

  // Attach local filters to Header anchor
  setTimeout(() => {
    const anchor = document.getElementById('header-local-filters');
    if (anchor) {
      anchor.innerHTML = `
        <div class="flex items-center gap-4 pl-4 border-l border-slate-200 dark:border-white/10">
          <button id="pnl-export-excel" class="h-7 px-4 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-2">
            <i data-lucide="download" class="w-3 h-3"></i> Export
          </button>
          
          <div class="w-[1px] h-4 bg-slate-200 dark:bg-white/10"></div>
          
          <div class="relative group cursor-pointer flex items-center gap-1.5 h-6">
            <input type="hidden" id="pnl-branch" value="${activeBranchSelect}">
            <span id="pnl-branch-text" class="text-[11px] font-black text-slate-600 dark:text-white uppercase tracking-wider group-hover:text-[#96588a] transition-colors">${activeBranchSelect}</span>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 group-hover:text-[#96588a] transition-colors"></i>
            <div class="absolute top-full left-0 mt-2 w-52 bg-white/90 dark:bg-[#141414]/95 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 transition-all duration-300 z-[90] overflow-hidden backdrop-blur-2xl border border-white/60 dark:border-white/10">
              <div class="py-2">
                ${allowedBranches.map(b => `
                  <div class="px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] transition-all cursor-pointer" 
                       onclick="document.getElementById('pnl-branch').value='${b}'; document.getElementById('pnl-branch-text').innerText='${b}'; document.getElementById('pnl-branch').dispatchEvent(new Event('change'));">
                    ${b}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="w-1 h-1 rounded-full bg-slate-300 dark:bg-white/20"></div>

          <div class="relative group cursor-pointer flex items-center gap-1.5 h-6" id="pnl-date-container">
             <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i>
             <span id="pnl-date-label" class="text-[11px] font-black text-slate-600 dark:text-white uppercase tracking-wider">This Month</span>
             <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400"></i>
             <input type="text" id="pnl-date-range" class="absolute inset-0 opacity-0 pointer-events-none" value="">
             <div class="absolute top-full left-0 mt-2 w-52 bg-white/90 dark:bg-[#141414]/95 rounded-2xl shadow-2xl opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[80] overflow-hidden backdrop-blur-2xl border border-white/60 dark:border-white/10">
                <div class="py-2" id="pnl-date-options">
                   <div class="pnl-date-opt px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] cursor-pointer" data-val="thisMonth">This Month</div>
                   <div class="pnl-date-opt px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] cursor-pointer" data-val="lastMonth">Last Month</div>
                   <div class="pnl-date-opt px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] cursor-pointer" data-val="thisQuarter">This Quarter</div>
                   <div class="pnl-date-opt px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] border-t border-slate-100 dark:border-white/5 cursor-pointer" data-val="custom">Custom Range...</div>
                </div>
             </div>
          </div>
        </div>
      `;

      // Setup Flatpickr
      if (window.flatpickr) {
        const fp = window.flatpickr('#pnl-date-range', {
          mode: 'range',
          dateFormat: 'Y-m-d',
          onClose: (selectedDates) => {
            if (selectedDates.length === 2) {
              const range = fp.formatDate(selectedDates[0], 'Y-m-d') + ' to ' + fp.formatDate(selectedDates[1], 'Y-m-d');
              document.getElementById('pnl-date-label').innerText = range;
              document.getElementById('pnl-date-range').value = range;
              handleUpdate();
            }
          }
        });

        document.querySelectorAll('.pnl-date-opt').forEach(opt => {
          opt.onclick = (e) => {
            e.stopPropagation();
            const val = opt.dataset.val;
            if (val === 'custom') { fp.open(); return; }

            const now = new Date();
            let from, to = new Date();
            if (val === 'thisMonth') {
              from = new Date(now.getFullYear(), now.getMonth(), 1);
            } else if (val === 'lastMonth') {
              from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              to = new Date(now.getFullYear(), now.getMonth(), 0);
            } else if (val === 'thisQuarter') {
              const q = Math.floor(now.getMonth() / 3);
              from = new Date(now.getFullYear(), q * 3, 1);
            }

            const fmt = (date) => {
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, '0');
              const d = String(date.getDate()).padStart(2, '0');
              return `${y}-${m}-${d}`;
            };
            const range = fmt(from) + ' to ' + fmt(to);
            document.getElementById('pnl-date-label').innerText = opt.innerText;
            document.getElementById('pnl-date-range').value = range;
            handleUpdate();
          };
        });
      }

      document.getElementById('pnl-branch').onchange = handleUpdate;
      const exportBtn = document.getElementById('pnl-export-excel');
      if (exportBtn) {
        exportBtn.onclick = async () => {
          window.showToast('Preparing Export...', 'info');
          try {
            const ExcelJSModule = await import('exceljs');
            const ExcelJS = ExcelJSModule.default || ExcelJSModule;
            const { branches: allBr, data } = _pnlExportState;
            if (!allBr.length) { window.showToast('No data to export', 'error'); return; }

            // Fetch template
            const resp = await fetch('/templates/PNL_Statement_Template.xlsx');
            if (!resp.ok) throw new Error('Template not found');
            const buf = await resp.arrayBuffer();

            // Load with ExcelJS (preserves ALL formatting)
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buf);
            const ws = wb.getWorksheet(1);

            // Delete the Cleaning Materials row (Row 28)
            ws.spliceRows(28, 1);

            const pctVal = (val, base) => base > 0 ? val / base : 0;

            // Template branch columns (ExcelJS is 1-indexed)
            // B=2, C=3, D=4, E=5, F=6, G=7, H=8, I=9
            const templateBranches = ['Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf', 'UST'];

            // Template has 4 branches pre-built (cols B-I, i.e. 2-9).
            // For each extra branch beyond 4, we copy the last branch column pair and append new columns.
            const builtInCount = 4;
            if (templateBranches.length > builtInCount) {
              // Copy header styles from Ayala Cloverleaf (col 8 & 9) to new columns
              const refAmtCol = 2 + (builtInCount - 1) * 2; // col 8
              const refPctCol = 3 + (builtInCount - 1) * 2; // col 9
              for (let extra = 0; extra < templateBranches.length - builtInCount; extra++) {
                const newAmtCol = refAmtCol + 2 + extra * 2;
                const newPctCol = refPctCol + 2 + extra * 2;
                // Copy row 1 header (branch name cell)
                const refHdrCell = ws.getCell(1, refAmtCol);
                const newHdrCell = ws.getCell(1, newAmtCol);
                newHdrCell.value = templateBranches[builtInCount + extra];
                newHdrCell.style = JSON.parse(JSON.stringify(refHdrCell.style));
                ws.getCell(1, newPctCol).style = JSON.parse(JSON.stringify(ws.getCell(1, refPctCol).style));
                // Copy row 2 sub-headers
                const refSubAmt = ws.getCell(2, refAmtCol);
                const refSubPct = ws.getCell(2, refPctCol);
                const newSubAmt = ws.getCell(2, newAmtCol);
                const newSubPct = ws.getCell(2, newPctCol);
                newSubAmt.value = refSubAmt.value;
                newSubAmt.style = JSON.parse(JSON.stringify(refSubAmt.style));
                newSubPct.value = refSubPct.value;
                newSubPct.style = JSON.parse(JSON.stringify(refSubPct.style));
              }
            }

            // Data rows: ExcelJS rows are 1-indexed, so row 3 in 0-indexed = row 4 in ExcelJS
            const dataRows = [
              { row: 4,  get: d => d.rev.dinein },
              { row: 5,  get: d => d.rev.grocery },
              { row: 6,  get: d => d.rev.online },
              { row: 7,  get: d => d.rev.grabfood },
              { row: 8,  get: d => d.rev.foodpanda },
              { row: 9,  get: d => d.rev.other },
              { row: 10, get: d => d.rev.total },
              { row: 13, get: d => d.ded.instore },
              { row: 14, get: d => d.ded.grab },
              { row: 15, get: d => d.ded.panda },
              { row: 16, get: d => d.ded.bank },
              { row: 17, get: d => d.ded.total },
              { row: 18, get: d => d.netRev },
              { row: 21, get: d => d.cogs.beginInv, useNet: true },
              { row: 22, get: d => d.cogs.process, useNet: true },
              { row: 23, get: d => d.cogs.veggies, useNet: true },
              { row: 24, get: d => d.cogs.beverages, useNet: true },
              { row: 25, get: d => d.cogs.groceries, useNet: true },
              { row: 26, get: d => d.cogs.condiments, useNet: true },
              { row: 27, get: d => d.cogs.takeout, useNet: true },
              { row: 28, get: d => -d.cogs.endInv, useNet: true },
              { row: 29, get: d => d.cogs.total, useNet: true },
              { row: 30, get: d => d.netRev - d.cogs.total, useNet: true },
              { row: 33, get: d => d.operating.labor, useNet: true },
              { row: 34, get: d => d.operating.marketing, useNet: true },
              { row: 35, get: d => d.operating.sales, useNet: true },
              { row: 36, get: d => d.operating.rental, useNet: true },
              { row: 37, get: d => d.operating.utilities, useNet: true },
              { row: 38, get: d => d.operating.management, useNet: true },
              { row: 39, get: d => d.operating.depreciation, useNet: true },
              { row: 40, get: d => d.operating.other, useNet: true },
              { row: 41, get: d => d.operating.total, useNet: true },
              { row: 43, get: d => (d.netRev - d.cogs.total) - d.operating.total, useNet: true },
            ];

            // Write data — ExcelJS preserves cell style when you only set .value
            templateBranches.forEach((branch, bIdx) => {
              const amtCol = 2 + bIdx * 2;  // B=2, D=4, F=6, H=8
              const pctCol = 3 + bIdx * 2;  // C=3, E=5, G=7, I=9

              const brData = data[branch];

              dataRows.forEach(dr => {
                const amtCell = ws.getCell(dr.row, amtCol);
                const pctCell = ws.getCell(dr.row, pctCol);

                if (!brData) {
                  amtCell.value = 0;
                  pctCell.value = 0;
                  return;
                }

                const val = dr.get(brData);
                const base = dr.useNet ? brData.netRev : brData.rev.total;

                amtCell.value = val;
                pctCell.value = pctVal(val, base);
              });
            });

            // Write to buffer and trigger download
            const outBuf = await wb.xlsx.writeBuffer();
            const blob = new Blob([outBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `PNL_Statement_${new Date().toISOString().split('T')[0]}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);

            window.showToast('Export successful!', 'success');
          } catch (err) {
            console.error(err);
            window.showToast('Export failed: ' + err.message, 'error');
          }
        };
      }

      handleUpdate();
    }
    if (window.lucide) window.lucide.createIcons();
  }, 0);

  return page;
}

async function loadAndRenderPNL(page, branchFilter, fromDate, toDate, allowedBranches = []) {
  const loader = page.querySelector('#pnl-loading');
  if (loader) loader.classList.remove('hidden');

  try {
    // Enforce branch permission
    if (!allowedBranches.includes(branchFilter)) {
      throw new Error("Permission Denied: Unauthorized branch access");
    }

    // 1. Identify Branches to Display
    const allBranches = allowedBranches.filter(b => b !== 'All Branches');
    const displayBranches = branchFilter === 'All Branches' ? allBranches : [branchFilter];

    // 2. Data Fetching
    const [salesSnap, expensesSnap, opexSnap] = await Promise.all([
      getDocs(query(collection(db, 'daily_sales'), where('date', '>=', fromDate), where('date', '<=', toDate))),
      getDocs(query(collection(db, 'expenses'), where('date', '>=', fromDate), where('date', '<=', toDate), where('status', '==', 'liquidated'))),
      getDocs(query(collection(db, 'opex_records'))) // Usually small enough to filter in-memory
    ]);

    const salesData = salesSnap.docs.map(d => d.data());
    const expensesData = expensesSnap.docs.map(d => d.data());
    const opexData = opexSnap.docs.map(d => d.data());

    // 3. Prepare P&L Map
    const pnlMap = {};
    displayBranches.forEach(b => {
      pnlMap[b] = {
        rev: { dinein: 0, grocery: 0, online: 0, grabfood: 0, foodpanda: 0, other: 0, total: 0 },
        ded: { instore: 0, grab: 0, panda: 0, bank: 0, total: 0 },
        dedDetails: {
          instore: {
            productDiscount: 0,
            invoiceDiscount: 0,
            discount100: 0,
            discount: 0,
            vatAdjustment: 0,
            seniorCitizenDiscount: 0,
            pwdDiscount: 0,
            otherDiscount: 0,
            voidInvoice: 0
          },
          grab: {
            commission: 0,
            orderCommission: 0,
            merchantDiscount: 0,
            deliveryDiscount: 0,
            dineOutPromo: 0,
            adsFee: 0,
            marketingFee: 0,
            adjustmentFee: 0,
            otherBaFees: 0
          },
          panda: {
            commission: 0,
            adsFee: 0,
            marketingFee: 0,
            discount: 0,
            tax: 0,
            others: 0
          }
        },
        netRev: 0,
        cogs: { beginInv: 0, endInv: 0, process: 0, veggies: 0, beverages: 0, groceries: 0, condiments: 0, takeout: 0, cleaning: 0, purchases: 0, total: 0 },
        operating: { labor: 0, marketing: 0, sales: 0, rental: 0, utilities: 0, management: 0, depreciation: 0, other: 0, total: 0 }
      };
    });

    // Process Sales & Deductions
    salesData.forEach(s => {
      const b = s.branchId;
      if (!pnlMap[b]) return;

      const gross = parseFloat(s.financials?.gross) || 0;
      const ch = s.channelId;
      const brk = s.breakdown?.deductions || {};
      const inc = s.breakdown?.incomes || {};

      // Revenue (Use Gross)
      if (ch === 'dinein') pnlMap[b].rev.dinein += gross;
      else if (ch === 'online') pnlMap[b].rev.online += gross;
      else if (ch === 'grabfood') pnlMap[b].rev.grabfood += gross;
      else if (ch === 'foodpanda') pnlMap[b].rev.foodpanda += gross;

      // Process Incomes (e.g. Vendor Refunds)
      Object.values(inc).forEach(v => {
        pnlMap[b].rev.other += (parseFloat(v) || 0);
      });

      // Deductions Breakdown
      if (ch === 'dinein') {
        const pd = parseFloat(brk.productDiscount) || 0;
        const id = parseFloat(brk.invoiceDiscount) || 0;
        const d100 = parseFloat(brk.discount100) || 0;
        const d = parseFloat(brk.discount) || 0;
        const va = parseFloat(brk.vatAdjustment) || 0;
        const sc = parseFloat(brk.seniorCitizenDiscount) || 0;
        const pwd = parseFloat(brk.pwdDiscount) || 0;
        const od = parseFloat(brk.otherDiscount) || 0;
        const vi = parseFloat(brk.voidInvoice) || 0;

        pnlMap[b].dedDetails.instore.productDiscount += pd;
        pnlMap[b].dedDetails.instore.invoiceDiscount += id;
        pnlMap[b].dedDetails.instore.discount100 += d100;
        pnlMap[b].dedDetails.instore.discount += d;
        pnlMap[b].dedDetails.instore.vatAdjustment += va;
        pnlMap[b].dedDetails.instore.seniorCitizenDiscount += sc;
        pnlMap[b].dedDetails.instore.pwdDiscount += pwd;
        pnlMap[b].dedDetails.instore.otherDiscount += od;
        pnlMap[b].dedDetails.instore.voidInvoice += vi;

        pnlMap[b].ded.instore += pd + id + d100 + d + va + sc + pwd + od;
        pnlMap[b].ded.bank += (parseFloat(brk.bankCardFee) || 0);

        // Adjust Gross if there's a void (as per requirement: void is not a deduction, it's a reduction of Gross)
        const voidAmt = parseFloat(brk.voidInvoice) || 0;
        if (voidAmt > 0) {
          pnlMap[b].rev.dinein -= voidAmt;
        }
      } else if (ch === 'grabfood') {
        const comm = parseFloat(brk.commission) || 0;
        const ocomm = parseFloat(brk.orderCommission) || 0;
        const mdisc = parseFloat(brk.merchantDiscount) || 0;
        const ddisc = parseFloat(brk.deliveryDiscount) || 0;
        const dPromo = parseFloat(brk.dineOutPromo) || 0;
        const ads = parseFloat(brk.adsFee) || 0;
        const mFee = parseFloat(brk.marketingFee) || 0;
        const adj = parseFloat(brk.adjustmentFee) || 0;
        const otherF = parseFloat(brk.otherBaFees) || 0;

        pnlMap[b].dedDetails.grab.commission += comm;
        pnlMap[b].dedDetails.grab.orderCommission += ocomm;
        pnlMap[b].dedDetails.grab.merchantDiscount += mdisc;
        pnlMap[b].dedDetails.grab.deliveryDiscount += ddisc;
        pnlMap[b].dedDetails.grab.dineOutPromo += dPromo;
        pnlMap[b].dedDetails.grab.adsFee += ads;
        pnlMap[b].dedDetails.grab.marketingFee += mFee;
        pnlMap[b].dedDetails.grab.adjustmentFee += adj;
        pnlMap[b].dedDetails.grab.otherBaFees += otherF;

        pnlMap[b].ded.grab += (parseFloat(s.financials?.totalDeductions) || 0);
      } else if (ch === 'foodpanda') {
        const comm = parseFloat(brk.commission) || 0;
        const ads = parseFloat(brk.adsFee) || 0;
        const mFee = parseFloat(brk.marketingFee) || 0;
        const disc = parseFloat(brk.discount) || 0;
        const tax = parseFloat(brk.tax) || 0;
        const oth = parseFloat(brk.others) || 0;

        pnlMap[b].dedDetails.panda.commission += comm;
        pnlMap[b].dedDetails.panda.adsFee += ads;
        pnlMap[b].dedDetails.panda.marketingFee += mFee;
        pnlMap[b].dedDetails.panda.discount += disc;
        pnlMap[b].dedDetails.panda.tax += tax;
        pnlMap[b].dedDetails.panda.others += oth;

        pnlMap[b].ded.panda += (parseFloat(s.financials?.totalDeductions) || 0);
      } else {
        pnlMap[b].ded.instore += (parseFloat(s.financials?.totalDeductions) || 0);
      }
    });

    // Recalculate Totals
    displayBranches.forEach(b => {
      pnlMap[b].rev.total = pnlMap[b].rev.dinein + pnlMap[b].rev.grocery + pnlMap[b].rev.online + pnlMap[b].rev.grabfood + pnlMap[b].rev.foodpanda + pnlMap[b].rev.other;
      pnlMap[b].ded.total = pnlMap[b].ded.instore + pnlMap[b].ded.grab + pnlMap[b].ded.panda + pnlMap[b].ded.bank;
      pnlMap[b].netRev = pnlMap[b].rev.total - pnlMap[b].ded.total;
    });

    // Process COGS & Operating Expenses from recorded expenses
    const cogsKeys = {
      'process products': 'process',
      'vegetables': 'veggies', 'vegtables': 'veggies',
      'beverages': 'beverages',
      'groceries': 'groceries', 'grocery': 'groceries', 'accountant import': 'groceries',
      'condiments': 'condiments',
      'take out materials': 'takeout'
    };

    const mapCategoryToPnlField = (category) => {
      const cat = (category || '').toLowerCase().trim();
      if (!cat) return null;

      // 1. COGS (1 to 6)
      if (cat.includes('process')) return { type: 'cogs', field: 'process' };
      if (cat.includes('veg')) return { type: 'cogs', field: 'veggies' };
      if (cat.includes('bev')) return { type: 'cogs', field: 'beverages' };
      if (cat.includes('groc')) return { type: 'cogs', field: 'groceries' };
      if (cat.includes('condiment')) return { type: 'cogs', field: 'condiments' };
      if (cat.includes('take out') || cat.includes('takeout')) return { type: 'cogs', field: 'takeout' };

      // 2. OPEX (7 to 14)
      if (cat.includes('allowance') || cat.includes('benefit') || cat.includes('labor') || cat.includes('meal')) return { type: 'opex', field: 'labor' };
      if (cat.includes('marketing')) return { type: 'opex', field: 'marketing' };
      if (cat.includes('online')) return { type: 'opex', field: 'sales' };
      if (cat.includes('rental') || cat.includes('rent')) return { type: 'opex', field: 'rental' };
      
      if (cat.includes('electricity') || cat.includes('electric') || cat.includes('gas') || cat.includes('water') ||
          cat.includes('internet') || cat.includes('load')) {
        return { type: 'opex', field: 'utilities' };
      }
      
      if (cat.includes('representation') || cat.includes('share')) {
        return { type: 'opex', field: 'management' };
      }
      
      if (cat.includes('equipment') || cat.includes('asset') || cat.includes('depreciation')) {
        return { type: 'opex', field: 'depreciation' };
      }
      
      if (cat.includes('cleaning') || cat.includes('clean') || cat.includes('other') ||
          cat.includes('maintenance') || cat.includes('stationery') || cat.includes('transport')) {
        return { type: 'opex', field: 'other' };
      }

      return null;
    };

    expensesData.forEach(e => {
      const b = e.branchId;
      if (!pnlMap[b]) return;
      const category = (e.category || '').toLowerCase().trim();
      const purpose = (e.purpose || '').toLowerCase();
      const amt = parseFloat(e.amount) || 0;

      // 1. Old pantry accountant logic
      if (category === 'pantry' && e.fundedBy === 'accountant') {
        if (purpose.includes('cleaning materials')) {
          pnlMap[b].operating.other += amt;
          pnlMap[b].operating.total += amt;
          return;
        }

        let matched = false;
        for (const [key, field] of Object.entries(cogsKeys)) {
          if (purpose.includes(key)) {
            pnlMap[b].cogs[field] += amt;
            pnlMap[b].cogs.purchases += amt;
            matched = true;
            break;
          }
        }
        if (matched) return;
      }

      // 2. New mapping using substring keywords for both petty cash and accountant
      const mapped = mapCategoryToPnlField(category);
      if (mapped) {
        if (mapped.type === 'cogs') {
          pnlMap[b].cogs[mapped.field] += amt;
          pnlMap[b].cogs.purchases += amt;
        } else if (mapped.type === 'opex') {
          pnlMap[b].operating[mapped.field] += amt;
          pnlMap[b].operating.total += amt;
        }
      }
    });

    // Fetch Inventory Snapshots
    const targetMonth = toDate.slice(0, 7); // e.g. "2026-05"
    const [targetYear, targetMonthNum] = targetMonth.split('-').map(Number);
    const prevMonth = targetMonthNum === 1
      ? `${targetYear - 1}-12`
      : `${targetYear}-${String(targetMonthNum - 1).padStart(2, '0')}`;

    const inventoryPromises = displayBranches.map(async (b) => {
      // Beginning Inventory = Previous month's Ending Inventory
      const prevDocId = `inv_${b}_${prevMonth}`;
      const prevSnap = await getDoc(doc(db, 'inventory_snapshots', prevDocId));
      if (prevSnap.exists()) {
        pnlMap[b].cogs.beginInv = parseFloat(prevSnap.data().endingValue) || 0;
      }

      // Ending Inventory = Current month
      const curDocId = `inv_${b}_${targetMonth}`;
      const curSnap = await getDoc(doc(db, 'inventory_snapshots', curDocId));
      if (curSnap.exists()) {
        pnlMap[b].cogs.endInv = parseFloat(curSnap.data().endingValue) || 0;
      }
    });
    await Promise.all(inventoryPromises);

    // Recalculate COGS Total: Beginning + Purchases - Ending
    displayBranches.forEach(b => {
      pnlMap[b].cogs.total = pnlMap[b].cogs.beginInv + pnlMap[b].cogs.purchases - pnlMap[b].cogs.endInv;
    });

    // Process Operating Expenses (from opex_records)
    // Strictly filter by the month of the "TO" date to ensure we don't leak previous month data

    opexData.forEach(r => {
      const b = r.branchId;
      if (!pnlMap[b] || r.month !== targetMonth) return;

      pnlMap[b].operating.labor += (r.labor || 0);
      pnlMap[b].operating.marketing += (r.marketing || 0);
      pnlMap[b].operating.sales += (r.sales || 0);
      pnlMap[b].operating.rental += (r.rental || 0);
      pnlMap[b].operating.utilities += (r.utilities || 0);
      pnlMap[b].operating.management += (r.management || 0);
      pnlMap[b].operating.depreciation += (r.depreciation || 0);
      pnlMap[b].operating.other += (r.other || 0);
      pnlMap[b].operating.total += (r.total || 0);
    });

    // 4. Render Table
    renderPNLTable(page, displayBranches, pnlMap, targetMonth);
    _pnlExportState = { branches: displayBranches, data: pnlMap };

  } catch (err) {
    console.error("PNL Error:", err);
    window.showToast("Error generating P&L statement", "error");
  } finally {
    if (loader) loader.classList.add('hidden');
  }
}

function renderPNLTable(page, branches, data, targetMonth) {
  const headerRow = page.querySelector('#pnl-header-row');
  const tbody = page.querySelector('#pnl-tbody');

  // Update Headers
  headerRow.innerHTML = `
    <th class="pnl-sticky-desc px-4 py-2 w-56 border-r border-slate-100 dark:border-white/5 bg-white dark:bg-[#1a1a1a]">
      <h2 class="text-[12px] font-black text-slate-800 dark:text-white uppercase tracking-tighter whitespace-nowrap">P&L Statement</h2>
      <p class="text-[7px] text-slate-400 dark:text-white/30 font-bold uppercase tracking-widest mt-0.5 leading-tight whitespace-nowrap">Comparative Analysis</p>
    </th>
    ${branches.map(b => `
      <th class="px-3 py-3 text-center border-l border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/40">
        <div class="text-[12px] font-black text-slate-800 dark:text-white uppercase tracking-tight mb-1 whitespace-nowrap">${b}</div>
        <div class="flex items-center justify-between px-1 gap-2">
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Amount</span>
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">% Rev</span>
        </div>
      </th>
    `).join('')}
    <th class="pl-2 pr-2 py-4 text-left w-14 text-[11px] font-black text-[#96588a] uppercase tracking-tight bg-purple-50/80 dark:bg-purple-900/20 whitespace-nowrap">Std</th>
  `;

  const fmt = (val) => val === 0 ? '₱0.00' : '₱' + val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (val, net) => net > 0 ? ((val / net) * 100).toFixed(1) + '%' : '0.0%';

  const row = (label, getVal, isBold = false, colorClass = '', std = '', useNet = false, options = {}) => {
    const { rowId = '', parentId = '', hasChildren = false, isChild = false } = options;

    let baseClass = isBold ? 'font-black text-[13px]' : 'font-bold text-[12px]';
    if (isChild) {
      baseClass = 'font-semibold text-[11px]';
    }

    let textColor = colorClass || (isBold ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400');
    if (label === '5. Operating Income (EBIT)') {
      textColor = 'text-[#96588a] dark:text-[#a46297]';
    }
    if (isChild) {
      textColor = 'text-slate-500 dark:text-slate-400';
    }

    const childAttr = isChild ? `data-parent="${parentId}" class="pnl-child-row hidden pnl-row-hover transition-all bg-slate-50/30 dark:bg-white/[0.01]"` : `class="pnl-row-hover transition-all"`;
    const labelPadding = isChild ? 'pl-8' : 'pl-4';

    let labelContent = label;
    if (hasChildren) {
      labelContent = `
        <span class="inline-flex items-center gap-1.5 cursor-pointer select-none group/toggle" onclick="window.togglePnlDeductions('${rowId}')">
          <i data-lucide="chevron-right" id="pnl-toggle-icon-${rowId}" class="w-3.5 h-3.5 text-slate-400 group-hover/toggle:text-[#96588a] transition-transform duration-200"></i>
          <span>${label}</span>
        </span>
      `;
    }

    return `
      <tr ${childAttr}>
        <td class="pnl-sticky-desc ${labelPadding} py-2 uppercase tracking-tight border-r border-slate-100 dark:border-white/5 ${baseClass} ${textColor} whitespace-nowrap">${labelContent}</td>
        ${branches.map(b => {
      const val = getVal(data[b]);
      const net = useNet ? data[b].netRev : data[b].rev.total;
      return `
            <td class="px-3 py-2 border-l border-slate-100 dark:border-white/5">
              <div class="flex items-center justify-between gap-3">
                <span class="tabular-nums ${baseClass} ${textColor} whitespace-nowrap text-[12px]">${fmt(val)}</span>
                <span class="text-[10px] text-right font-black text-[#96588a] tracking-tighter whitespace-nowrap">${pct(val, net)}</span>
              </div>
            </td>
          `;
    }).join('')}
        <td class="px-4 py-2 text-left text-[11px] font-black text-[#96588a] bg-purple-50/10 dark:bg-purple-900/5 whitespace-nowrap">${std}</td>
      </tr>
    `;
  };

  const header = (title) => `
    <tr class="pnl-section-header">
      <td colspan="${branches.length + 2}" class="px-8 py-3 text-[14px] font-black uppercase tracking-[0.2em]">${title}</td>
    </tr>
  `;

  let html = '';

  // 1. Revenue
  html += header('1. REVENUE');
  html += row('Dine in', d => d.rev.dinein);
  html += row('Grocery', d => d.rev.grocery);
  html += row('Sales Online', d => d.rev.online);
  html += row('GrabFood', d => d.rev.grabfood);
  html += row('FoodPanda', d => d.rev.foodpanda);
  html += row('Vendor Refunds (Panda)', d => d.rev.other);
  html += row('TOTAL REVENUE', d => d.rev.total, true, 'text-emerald-600 dark:text-emerald-400', '100.0%');

  // 2. Deductions
  html += header('2. SALES DEDUCTIONS');
  html += row('In store deductions', d => d.ded.instore, false, '', '', false, { rowId: 'instore', hasChildren: true });
  html += row('Product Discount', d => d.dedDetails.instore.productDiscount, false, '', '', false, { parentId: 'instore', isChild: true });
  html += row('Invoice Discount', d => d.dedDetails.instore.invoiceDiscount, false, '', '', false, { parentId: 'instore', isChild: true });
  html += row('100% Discount', d => d.dedDetails.instore.discount100, false, '', '', false, { parentId: 'instore', isChild: true });
  html += row('General Discount', d => d.dedDetails.instore.discount, false, '', '', false, { parentId: 'instore', isChild: true });
  html += row('Senior Citizen Discount', d => d.dedDetails.instore.seniorCitizenDiscount, false, '', '', false, { parentId: 'instore', isChild: true });
  html += row('PWD Discount', d => d.dedDetails.instore.pwdDiscount, false, '', '', false, { parentId: 'instore', isChild: true });
  html += row('Other Discount', d => d.dedDetails.instore.otherDiscount, false, '', '', false, { parentId: 'instore', isChild: true });
  html += row('VAT Adjustment', d => d.dedDetails.instore.vatAdjustment, false, '', '', false, { parentId: 'instore', isChild: true });
  html += row('Void Invoice (Gross Reduction)', d => d.dedDetails.instore.voidInvoice, false, '', '', false, { parentId: 'instore', isChild: true });

  html += row('Grab food deductions', d => d.ded.grab, false, '', '', false, { rowId: 'grab', hasChildren: true });
  html += row('Commission', d => d.dedDetails.grab.commission + d.dedDetails.grab.orderCommission, false, '', '', false, { parentId: 'grab', isChild: true });
  html += row('Merchant Promo/Discounts', d => d.dedDetails.grab.merchantDiscount + d.dedDetails.grab.deliveryDiscount + d.dedDetails.grab.dineOutPromo, false, '', '', false, { parentId: 'grab', isChild: true });
  html += row('Ads & Marketing', d => d.dedDetails.grab.adsFee + d.dedDetails.grab.marketingFee, false, '', '', false, { parentId: 'grab', isChild: true });
  html += row('Adjustment Fee', d => d.dedDetails.grab.adjustmentFee, false, '', '', false, { parentId: 'grab', isChild: true });
  html += row('Other Fees', d => d.dedDetails.grab.otherBaFees, false, '', '', false, { parentId: 'grab', isChild: true });

  html += row('Food panda deductions', d => d.ded.panda, false, '', '', false, { rowId: 'panda', hasChildren: true });
  html += row('Commission', d => d.dedDetails.panda.commission, false, '', '', false, { parentId: 'panda', isChild: true });
  html += row('Ads & Marketing', d => d.dedDetails.panda.adsFee + d.dedDetails.panda.marketingFee, false, '', '', false, { parentId: 'panda', isChild: true });
  html += row('Discounts/Promotions', d => d.dedDetails.panda.discount, false, '', '', false, { parentId: 'panda', isChild: true });
  html += row('Tax', d => d.dedDetails.panda.tax, false, '', '', false, { parentId: 'panda', isChild: true });
  html += row('Others', d => d.dedDetails.panda.others, false, '', '', false, { parentId: 'panda', isChild: true });

  html += row('Bank card', d => d.ded.bank);
  html += row('TOTAL DEDUCTIONS', d => d.ded.total, true, 'text-rose-600 dark:text-rose-400');
  html += row('NET REVENUE', d => d.netRev, true, 'text-emerald-600 dark:text-emerald-400');

  // 3. COGS
  html += header('3. COST OF GOODS SOLD');
  html += row('Beginning Inventory', d => d.cogs.beginInv, false, 'text-blue-600 dark:text-blue-400', '', true);
  html += row('Process products', d => d.cogs.process, false, '', '', true);
  html += row('Vegetables', d => d.cogs.veggies, false, '', '', true);
  html += row('Beverages', d => d.cogs.beverages, false, '', '', true);
  html += row('Groceries', d => d.cogs.groceries, false, '', '', true);
  html += row('Condiments', d => d.cogs.condiments, false, '', '', true);
  html += row('Take out materials', d => d.cogs.takeout, false, '', '', true);
  html += row('Ending Inventory', d => -d.cogs.endInv, false, 'text-blue-600 dark:text-blue-400', '', true);
  html += row('TOTAL COGS', d => d.cogs.total, true, 'text-rose-600 dark:text-rose-400', '35.0%', true);
  html += row('GROSS PROFIT', d => d.netRev - d.cogs.total, true, 'text-emerald-600 dark:text-emerald-400', '65.0%', true);

  // 4. Operating Expenses
  html += header('4. OPERATING EXPENSES');
  html += row('Labor Costs', d => d.operating.labor, false, '', '', true);
  html += row('Marketing Expenses', d => d.operating.marketing, false, '', '', true);
  html += row('Sales Expenses', d => d.operating.sales, false, '', '', true);
  html += row('Rental', d => d.operating.rental, false, '', '', true);
  html += row('Utilities', d => d.operating.utilities, false, '', '', true);
  html += row('Management Fees', d => d.operating.management, false, '', '', true);
  html += row('Depreciation', d => d.operating.depreciation, false, '', '', true);
  html += row('Other Expenses', d => d.operating.other, false, '', '', true);
  html += row('TOTAL OPEX', d => d.operating.total, true, 'text-rose-600 dark:text-rose-400', '35.0%', true);

  // 5. EBIT
  html += row('5. EBIT', d => (d.netRev - d.cogs.total) - d.operating.total, true, 'text-[#96588a] dark:text-[#a46297]', '30.0%', true);

  tbody.innerHTML = html;

  // Add Inventory Edit Button to the COGS section header
  const cogsHeader = tbody.querySelectorAll('.pnl-section-header')[2]; // 3rd section = COGS
  if (cogsHeader && targetMonth) {
    const td = cogsHeader.querySelector('td');
    td.innerHTML = `
      <div class="flex items-center justify-between">
        <span>3. COST OF GOODS SOLD</span>
        <button id="btn-set-inventory" class="px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[8px] font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all flex items-center gap-1.5" title="Set Beginning/Ending Inventory">
          <i data-lucide="package" class="w-3 h-3"></i> Inventory
        </button>
      </div>
    `;
    const invBtn = td.querySelector('#btn-set-inventory');
    if (invBtn) {
      invBtn.onclick = (e) => {
        e.stopPropagation();
        showInventoryModal(branches, data, targetMonth, async () => {
          // Reload PNL after saving
          const branchEl = document.getElementById('pnl-branch');
          const rangeEl = document.getElementById('pnl-date-range');
          const br = branchEl?.value || 'All Branches';
          const dr = rangeEl?.value || '';
          const getLocalStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          let fromStr, toStr;
          if (dr.includes(' to ')) { [fromStr, toStr] = dr.split(' to '); }
          else { const now = new Date(); fromStr = getLocalStr(new Date(now.getFullYear(), now.getMonth(), 1)); toStr = getLocalStr(now); }
          await loadAndRenderPNL(page, br, fromStr, toStr);
        });
      };
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

// --- Inventory Modal ---
function showInventoryModal(branches, data, targetMonth, onSave) {
  const [tYear, tMonthNum] = targetMonth.split('-').map(Number);
  const prevMonth = tMonthNum === 1
    ? `${tYear - 1}-12`
    : `${tYear}-${String(tMonthNum - 1).padStart(2, '0')}`;

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthLabel = `${monthNames[tMonthNum - 1]} ${tYear}`;

  const fmt = (v) => '₱' + (v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[10001] flex items-center justify-center p-4 animate-fade-in';
  overlay.innerHTML = `
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" id="inv-backdrop"></div>
    <div class="relative w-full max-w-[560px] rounded-[2.5rem] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.5)] overflow-hidden animate-fade-in flex flex-col bg-white/80 dark:bg-[#141414]/90 backdrop-blur-[40px] border border-white/30 dark:border-white/10">

      <!-- Header -->
      <div class="px-10 pt-10 pb-4 flex flex-col items-center text-center">
        <div class="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-4">
          <i data-lucide="package" class="w-6 h-6"></i>
        </div>
        <p class="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] mb-1">Inventory Management</p>
        <h3 class="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">${monthLabel}</h3>
        <p class="text-[10px] text-slate-400 mt-1 font-bold">Set Ending Inventory for each branch. Beginning Inventory auto-chains from previous month.</p>
        <button id="inv-close" class="absolute top-7 right-7 w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <!-- Branch Rows -->
      <div class="px-10 pb-6 space-y-3 max-h-[50vh] overflow-y-auto scrollbar-hide">
        ${branches.map(b => {
          const beginVal = data[b].cogs.beginInv;
          const endVal = data[b].cogs.endInv;
          return `
            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <p class="text-[10px] font-black text-slate-500 dark:text-white/50 uppercase tracking-widest mb-3">${b}</p>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Beginning Inv. (auto)</label>
                  <div class="w-full bg-slate-100 dark:bg-white/5 rounded-xl px-4 py-3 text-xs font-bold text-slate-400 dark:text-white/30">${fmt(beginVal)}</div>
                  <p class="text-[7px] text-slate-300 dark:text-white/20 mt-1 font-bold">= Ending of ${prevMonth}</p>
                </div>
                <div>
                  <label class="text-[8px] font-black text-blue-500 uppercase tracking-widest block mb-1">Ending Inventory</label>
                  <input type="number" class="inv-ending-input w-full bg-white dark:bg-white/10 border border-blue-200 dark:border-blue-500/30 rounded-xl px-4 py-3 text-xs font-black text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all" data-branch="${b}" value="${endVal || ''}" placeholder="0.00">
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Save Button -->
      <div class="px-10 pb-10">
        <button id="inv-save-btn" class="w-full h-14 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-black uppercase tracking-[0.2em] text-[10px] transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2">
          <i data-lucide="save" class="w-4 h-4"></i> Save Inventory Data
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  if (window.lucide) window.lucide.createIcons();

  overlay.querySelector('#inv-backdrop').onclick = () => overlay.remove();
  overlay.querySelector('#inv-close').onclick = () => overlay.remove();

  overlay.querySelector('#inv-save-btn').onclick = async () => {
    const btn = overlay.querySelector('#inv-save-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Saving...';

    try {
      const inputs = overlay.querySelectorAll('.inv-ending-input');
      const promises = [];

      inputs.forEach(input => {
        const branch = input.dataset.branch;
        const val = parseFloat(input.value) || 0;
        const docId = `inv_${branch}_${targetMonth}`;

        promises.push(
          setDoc(doc(db, 'inventory_snapshots', docId), {
            branchId: branch,
            month: targetMonth,
            endingValue: val,
            updatedAt: serverTimestamp()
          })
        );
      });

      await Promise.all(promises);

      btn.style.backgroundColor = '#10b981';
      btn.innerHTML = '✓ Saved Successfully';
      window.showToast('Inventory data saved!', 'success');

      setTimeout(() => {
        overlay.remove();
        if (onSave) onSave();
      }, 800);
    } catch (err) {
      console.error('Inventory save error:', err);
      window.showToast('Failed to save: ' + err.message, 'error');
      btn.disabled = false;
      btn.style.backgroundColor = '';
      btn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Save Inventory Data';
      if (window.lucide) window.lucide.createIcons();
    }
  };
}
