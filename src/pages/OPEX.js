import { db } from '../firebase.js';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

// Render OPEX Page
export function renderOPEX() {
  const page = document.createElement('div');
  page.className = 'p-6 space-y-6 page-enter min-h-full relative';

  page.innerHTML = `
    <!-- Top Stats Row -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="channel-card-premium group">
        <div class="channel-card-accent" style="background-color: #f43f5e; opacity: 0.1;"></div>
        <div class="absolute -bottom-4 -right-4 opacity-[0.08] dark:opacity-[0.15] -rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
           <i data-lucide="calculator" class="w-24 h-24 text-slate-900 dark:text-white"></i>
        </div>
        <div class="relative z-10 flex flex-col h-full">
           <p class="text-[10px] font-black text-slate-400 dark:text-white/60 uppercase tracking-[0.15em] mb-1">Total OPEX</p>
           <h2 id="opex-total-val" class="text-3xl font-black text-rose-500 tracking-tighter">₱0.00</h2>
           <p class="text-[9px] text-slate-400 dark:text-white/40 font-bold mt-auto uppercase tracking-widest">In Selected Period</p>
        </div>
      </div>

      <div class="channel-card-premium group">
        <div class="channel-card-accent" style="background-color: #f59e0b; opacity: 0.1;"></div>
        <div class="absolute -bottom-4 -right-4 opacity-[0.08] dark:opacity-[0.15] -rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
           <i data-lucide="bar-chart-3" class="w-24 h-24 text-slate-900 dark:text-white"></i>
        </div>
        <div class="relative z-10 flex flex-col h-full">
           <p class="text-[10px] font-black text-slate-400 dark:text-white/60 uppercase tracking-[0.15em] mb-1">Highest Cost</p>
           <h2 id="opex-highest-name" class="text-xl font-black text-amber-500 tracking-tight">-</h2>
           <p id="opex-highest-val" class="text-[10px] text-slate-400 dark:text-white/60 font-black mt-auto uppercase tracking-widest">₱0.00</p>
        </div>
      </div>

      <div class="channel-card-premium group">
        <div class="channel-card-accent" style="background-color: #8b5cf6; opacity: 0.1;"></div>
        <div class="absolute -bottom-4 -right-4 opacity-[0.08] dark:opacity-[0.15] -rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
           <i data-lucide="percent" class="w-24 h-24 text-slate-900 dark:text-white"></i>
        </div>
        <div class="relative z-10 flex flex-col h-full">
           <p class="text-[10px] font-black text-slate-400 dark:text-white/60 uppercase tracking-[0.15em] mb-1">OPEX vs Net Sale</p>
           <h2 id="opex-pct-val" class="text-3xl font-black text-[#96588a] tracking-tighter">0%</h2>
           <p class="text-[9px] text-slate-400 dark:text-white/40 font-bold mt-auto uppercase tracking-widest">Efficiency Metric</p>
        </div>
      </div>
    </div>

    <!-- Data Table -->
    <div class="luxury-card bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-2xl overflow-hidden shadow-xl border-t border-white/60 dark:border-white/10 transition-all">
      <div class="px-8 pt-6 pb-2 flex justify-between items-center border-b border-slate-100 dark:border-white/5">
         <div>
           <p class="text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em] mb-0.5">Fixed Costs</p>
           <h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">Operating Expenses Ledger</h3>
         </div>
         <button id="btn-add-opex" class="flex items-center gap-2 h-9 px-4 rounded-full text-[10px] font-black text-white bg-[#96588a] hover:bg-[#7a4671] uppercase tracking-widest transition-all shadow-md active:scale-95">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i> Add Record
         </button>
      </div>

      <div class="overflow-x-auto scrollbar-hide">
        <table class="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr class="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-transparent">
              <th class="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em]">Month</th>
              <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em]">Branch</th>
              <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-right">Labor</th>
              <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-right">Mktg</th>
              <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-right">Sales</th>
              <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-right">Rent</th>
              <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-right">Utils</th>
              <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-right">Mgmt</th>
              <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-right">Depr</th>
              <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-right">Other</th>
              <th class="px-6 py-4 text-[9px] font-black text-rose-500 uppercase tracking-[0.15em] text-right">Total OPEX</th>
              <th class="px-4 py-4 text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-center w-16">Act</th>
            </tr>
          </thead>
          <tbody id="opex-tbody" class="divide-y divide-slate-100 dark:divide-white/5">
             <tr><td colspan="12" class="px-6 py-10 text-center text-[11px] text-slate-400 italic">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  setTimeout(() => {
    const anchor = document.getElementById('header-local-filters');
    if (anchor) {
      anchor.innerHTML = `
        <div class="flex items-center gap-4 pl-4 border-l border-slate-200 dark:border-white/10">
          <!-- Branch -->
          <div class="relative group cursor-pointer flex items-center gap-1.5 h-6">
            <input type="hidden" id="op-filter-branch" value="All Branches">
            <span id="op-filter-branch-text" class="text-[11px] font-black text-slate-600 dark:text-white uppercase tracking-wider group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors">All Branches</span>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors"></i>
            
            <div class="absolute top-full left-0 mt-2 w-52 bg-white/90 dark:bg-[#141414]/95 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 transition-all duration-300 z-[90] overflow-hidden backdrop-blur-2xl border border-white/60 dark:border-white/10">
              <div class="py-2">
                ${['All Branches', 'Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf'].map(b => `
                  <div class="px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" 
                       onclick="document.getElementById('op-filter-branch').value='${b}'; document.getElementById('op-filter-branch-text').innerText='${b}'; document.getElementById('op-filter-branch').dispatchEvent(new Event('change'));">
                    ${b}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="w-1 h-1 rounded-full bg-slate-300 dark:bg-white/20"></div>

          <!-- Date Range -->
          <div class="relative group cursor-pointer flex items-center gap-1.5 h-6" id="op-preset-container">
             <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400 group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors"></i>
             <span id="op-preset-label" class="text-[11px] font-black text-slate-600 dark:text-white uppercase tracking-wider group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors">Last Month</span>
             <i data-lucide="chevron-down" id="op-preset-chevron" class="w-3.5 h-3.5 text-slate-400 group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors"></i>
             
             <input type="text" id="op-filter-date-range" class="absolute inset-0 opacity-0 pointer-events-none" value="lastMonthInit">
             
             <div id="op-preset-menu" class="absolute top-full left-0 mt-2 w-52 bg-white/90 dark:bg-[#141414]/95 rounded-2xl shadow-2xl opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-300 z-[80] overflow-hidden backdrop-blur-2xl border border-white/60 dark:border-white/10">
                <div class="py-2">
                   <div class="op-preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" data-value="thisMonth">This Month</div>
                   <div class="op-preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" data-value="lastMonth">Last Month</div>
                   <div class="op-preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" data-value="thisYear">This Year</div>
                   <div class="op-preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" data-value="allTime">All Time</div>
                   <div class="op-preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all border-t border-slate-100 dark:border-white/5 cursor-pointer" data-value="custom">Custom Range...</div>
                </div>
             </div>

             <!-- Custom Month Range Modal -->
             <div id="op-custom-range-modal" class="absolute top-full left-0 mt-2 w-64 bg-white/95 dark:bg-[#141414]/95 rounded-2xl shadow-2xl backdrop-blur-2xl border border-white/60 dark:border-white/10 p-5 z-[100] hidden cursor-default" onclick="event.stopPropagation()">
                <div class="flex flex-col gap-4">
                   <div>
                     <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">From Month</label>
                     <input type="month" id="op-custom-from" class="w-full mt-1.5 bg-slate-100 dark:bg-white/5 border-none rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-[#96588a]/30 cursor-pointer">
                   </div>
                   <div>
                     <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">To Month</label>
                     <input type="month" id="op-custom-to" class="w-full mt-1.5 bg-slate-100 dark:bg-white/5 border-none rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-[#96588a]/30 cursor-pointer">
                   </div>
                   <button id="op-custom-apply" class="mt-2 bg-[#96588a] text-white rounded-xl py-3 text-[10px] font-black uppercase tracking-[0.15em] hover:bg-[#7a4671] transition-all shadow-md active:scale-95 flex items-center justify-center gap-2">
                      <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Apply Filter
                   </button>
                </div>
             </div>
          </div>
        </div>
      `;
    }

    if (window.lucide) window.lucide.createIcons();

    // Bind Add Button
    document.getElementById('btn-add-opex').onclick = () => openOpexModal();

    const handleUpdate = () => {
      const branchSelect = document.getElementById('op-filter-branch');
      const rangeInput = document.getElementById('op-filter-date-range');
      const branch = branchSelect?.value || 'All Branches';
      let fromStr = '2000-01-01', toStr = '2099-12-31';

      const rangeVal = rangeInput?.value || '';
      if (rangeVal.includes(' to ')) {
        [fromStr, toStr] = rangeVal.split(' to ');
      } else if (rangeVal) {
        fromStr = toStr = rangeVal;
      }

      loadOpexData(branch, fromStr, toStr);
    };

    // Setup flatpickr and local filter events
    const rangeInput = document.getElementById('op-filter-date-range');
    const container = document.getElementById('op-preset-container');
    const label = document.getElementById('op-preset-label');

    const getRange = (type) => {
      const d = new Date();
      const fmt = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      switch (type) {
        case 'thisMonth':
          const startM = new Date(d.getFullYear(), d.getMonth(), 1);
          return `${fmt(startM)} to ${fmt(d)}`;
        case 'lastMonth':
          const lmS = new Date(d.getFullYear(), d.getMonth() - 1, 1);
          const lmE = new Date(d.getFullYear(), d.getMonth(), 0);
          return `${fmt(lmS)} to ${fmt(lmE)}`;
        case 'thisYear':
          const startY = new Date(d.getFullYear(), 0, 1);
          return `${fmt(startY)} to ${fmt(d)}`;
        case 'allTime':
          return '';
        default: return '';
      }
    };

    if (container) {
      const customModal = document.getElementById('op-custom-range-modal');
      const fromInput = document.getElementById('op-custom-from');
      const toInput = document.getElementById('op-custom-to');
      const applyBtn = document.getElementById('op-custom-apply');

      container.querySelectorAll('.op-preset-option').forEach(opt => {
        opt.onclick = (e) => {
          e.stopPropagation();
          const val = opt.dataset.value;
          if (val === 'custom') {
            customModal.classList.toggle('hidden');
          } else {
            customModal.classList.add('hidden');
            const range = getRange(val);
            label.textContent = opt.textContent;
            rangeInput.value = range;
            handleUpdate();
          }
        };
      });

      if (applyBtn) {
        applyBtn.onclick = (e) => {
          e.stopPropagation();
          if (fromInput.value && toInput.value) {
            // fromInput.value is "YYYY-MM"
            const start = `${fromInput.value}-01`;
            // to get the end of the selected toMonth
            const [y, m] = toInput.value.split('-');
            const endDate = new Date(y, m, 0);
            const endStr = endDate.toISOString().split('T')[0];
            
            const rangeStr = `${start} to ${endStr}`;
            label.textContent = `${fromInput.value} to ${toInput.value}`;
            rangeInput.value = rangeStr;
            customModal.classList.add('hidden');
            handleUpdate();
          } else {
            window.showToast("Please select both start and end months.", "warning");
          }
        };
      }
      
      // Close modal if clicked outside
      document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
          customModal.classList.add('hidden');
        }
      });
    }

    const branchEl = document.getElementById('op-filter-branch');
    if (branchEl) branchEl.addEventListener('change', handleUpdate);

    // Set initial value to Last Month before first update
    if (rangeInput && rangeInput.value === 'lastMonthInit') {
      rangeInput.value = getRange('lastMonth');
    }

    handleUpdate();

    // The modal uses 'global-filter-changed' to trigger refresh after saving.
    window.addEventListener('global-filter-changed', handleUpdate);

    const cleanup = () => {
      window.removeEventListener('global-filter-changed', handleUpdate);
    };
    window.addEventListener('cleanup-page', cleanup, { once: true });
  }, 0);

  return page;
}

// ─── Data Loading ──────────────────────────────────────────────

async function loadOpexData(branch, fromDate, toDate) {
  try {
    const fmt = n => '₱' + (parseFloat(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // OPEX records use 'month' field like 'YYYY-MM'. 
    // We convert date ranges to YYYY-MM bounds for filtering.
    const fromMonth = fromDate.substring(0, 7);
    const toMonth = toDate.substring(0, 7);

    let qConstr = [where('month', '>=', fromMonth), where('month', '<=', toMonth)];
    if (branch !== 'All Branches') qConstr.push(where('branchId', '==', branch));

    const snap = await getDocs(query(collection(db, 'opex_records'), ...qConstr));
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Sort descending by month
    records.sort((a, b) => b.month.localeCompare(a.month));

    // Calculate totals for stats
    let totalOpex = 0;
    const catSums = { labor: 0, marketing: 0, sales: 0, rental: 0, utilities: 0, management: 0, depreciation: 0, other: 0 };

    records.forEach(r => {
      totalOpex += (r.total || 0);
      catSums.labor += (r.labor || 0);
      catSums.marketing += (r.marketing || 0);
      catSums.sales += (r.sales || 0);
      catSums.rental += (r.rental || 0);
      catSums.utilities += (r.utilities || 0);
      catSums.management += (r.management || 0);
      catSums.depreciation += (r.depreciation || 0);
      catSums.other += (r.other || 0);
    });

    // Find highest category
    let highestCatName = '-';
    let highestCatVal = 0;
    Object.entries(catSums).forEach(([k, v]) => {
      if (v > highestCatVal) {
        highestCatVal = v;
        highestCatName = k;
      }
    });

    // Net Sales logic for OPEX %
    let totalNetSales = 0;
    let qSalesConstr = [where('date', '>=', fromDate), where('date', '<=', toDate)];
    if (branch !== 'All Branches') qSalesConstr.push(where('branchId', '==', branch));
    const snapSales = await getDocs(query(collection(db, 'daily_sales'), ...qSalesConstr));
    snapSales.docs.forEach(d => totalNetSales += (parseFloat(d.data()?.financials?.net) || 0));

    const pct = totalNetSales > 0 ? (totalOpex / totalNetSales) * 100 : 0;

    // Update UI Stats
    document.getElementById('opex-total-val').textContent = fmt(totalOpex);
    document.getElementById('opex-highest-name').textContent = highestCatName.toUpperCase();
    document.getElementById('opex-highest-val').textContent = fmt(highestCatVal);
    document.getElementById('opex-pct-val').textContent = pct.toFixed(1) + '%';

    // Render Table
    const tbody = document.getElementById('opex-tbody');
    if (!tbody) return;

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" class="px-6 py-10 text-center text-[11px] text-slate-400 italic">No OPEX records found for this period.</td></tr>`;
      return;
    }

    tbody.innerHTML = records.map((r, i) => `
      <tr class="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
        <td class="px-6 py-3 font-bold text-slate-700 text-[11px] dark:text-slate-300">${r.month}</td>
        <td class="px-4 py-3 text-slate-600 text-[11px] dark:text-slate-400 font-medium">${r.branchId}</td>
        <td class="px-4 py-3 text-right text-slate-500 text-[11px] tabular-nums">${fmt(r.labor)}</td>
        <td class="px-4 py-3 text-right text-slate-500 text-[11px] tabular-nums">${fmt(r.marketing)}</td>
        <td class="px-4 py-3 text-right text-slate-500 text-[11px] tabular-nums">${fmt(r.sales)}</td>
        <td class="px-4 py-3 text-right text-slate-500 text-[11px] tabular-nums">${fmt(r.rental)}</td>
        <td class="px-4 py-3 text-right text-slate-500 text-[11px] tabular-nums">${fmt(r.utilities)}</td>
        <td class="px-4 py-3 text-right text-slate-500 text-[11px] tabular-nums">${fmt(r.management)}</td>
        <td class="px-4 py-3 text-right text-slate-500 text-[11px] tabular-nums">${fmt(r.depreciation)}</td>
        <td class="px-4 py-3 text-right text-slate-500 text-[11px] tabular-nums">${fmt(r.other)}</td>
        <td class="px-6 py-3 text-right font-black text-rose-500 text-[11px] tabular-nums">${fmt(r.total)}</td>
        <td class="px-4 py-3 text-center">
           <button class="text-slate-400 hover:text-rose-500 transition-colors" onclick="deleteOpex('${r.id}')" title="Delete Record">
             <i data-lucide="trash-2" class="w-4 h-4 mx-auto"></i>
           </button>
        </td>
      </tr>
    `).join('');

    if (window.lucide) window.lucide.createIcons();

  } catch (error) {
    console.error("OPEX Load Error:", error);
    window.showToast("Failed to load OPEX data", "error");
  }
}

// ─── Modal / Form Logic ────────────────────────────────────────

let currentModal = null;

async function openOpexModal() {
  if (currentModal) currentModal.remove();

  const currentBranch = document.getElementById('op-filter-branch')?.value || 'Catholic Trade';
  const branchOptions = ['Catholic Trade', 'Pioneer Center', 'Unimart Capitol', 'Ayala Cloverleaf'];

  // Default to current month
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';

  overlay.innerHTML = `
    <div class="bg-white dark:bg-[#141414] rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
       <!-- Header -->
       <div class="px-8 py-5 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
          <div>
            <h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">New OPEX Record</h3>
            <p class="text-[10px] text-slate-400 dark:text-white/40 mt-1 uppercase tracking-[0.15em] font-bold">Monthly Fixed Costs Entry</p>
          </div>
          <button id="opex-close" class="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all text-slate-500">
             <i data-lucide="x" class="w-4 h-4"></i>
          </button>
       </div>

       <!-- Form Body -->
       <div class="p-8 overflow-y-auto space-y-6">
          
          <div class="grid grid-cols-2 gap-6">
             <div class="space-y-1">
                <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Branch</label>
                <select id="op-branch" class="w-full h-12 bg-slate-50 dark:bg-white/5 border-none rounded-2xl px-4 text-xs font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-[#96588a]/30">
                  ${branchOptions.map(b => `<option value="${b}" ${currentBranch === b ? 'selected' : ''}>${b}</option>`).join('')}
                </select>
             </div>
             <div class="space-y-1">
                <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Month (YYYY-MM)</label>
                <input type="month" id="op-month" value="${currentMonthStr}" class="w-full h-12 bg-slate-50 dark:bg-white/5 border-none rounded-2xl px-4 text-xs font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-[#96588a]/30">
             </div>
          </div>

          <div class="pt-2 border-t border-slate-100 dark:border-white/5">
             <div class="flex items-center justify-between mb-4 mt-2">
                <p class="text-[10px] font-black text-[#96588a] uppercase tracking-widest">Cost Categories (PHP)</p>
                <button id="btn-suggest" class="text-[9px] font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 px-3 py-1 rounded-full hover:bg-indigo-100 transition-colors flex items-center gap-1">
                   <i data-lucide="sparkles" class="w-3 h-3"></i> Autofill from Prev Month
                </button>
             </div>
             
             <div class="grid grid-cols-2 gap-4">
               ${['Labor', 'Marketing', 'Sales', 'Rental', 'Utilities', 'Management', 'Depreciation', 'Other'].map(f => `
                  <div class="space-y-1 relative">
                     <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em] ml-3 absolute top-1.5">${f}</label>
                     <input type="number" step="0.01" id="op-${f.toLowerCase()}" class="opex-input w-full h-12 bg-slate-50 dark:bg-white/5 border-none rounded-2xl pl-3 pr-4 pt-4 pb-1 text-xs font-black text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-[#96588a]/30 text-right" placeholder="0.00">
                  </div>
               `).join('')}
             </div>
          </div>

       </div>

       <!-- Footer -->
       <div class="px-8 py-5 border-t border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
          <div class="flex flex-col">
             <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Computed</span>
             <span id="op-total-preview" class="text-xl font-black text-rose-500 tracking-tighter">₱0.00</span>
          </div>
          <button id="op-save" class="h-12 px-8 rounded-full text-[11px] font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-95 bg-[#96588a] hover:bg-[#7a4671]">
             Save OPEX
          </button>
       </div>
    </div>
  `;

  document.body.appendChild(overlay);
  currentModal = overlay;
  if (window.lucide) window.lucide.createIcons();

  // Setup interactions
  overlay.querySelector('#opex-close').onclick = () => overlay.remove();

  const inputs = overlay.querySelectorAll('.opex-input');
  const updateTotalPreview = () => {
    let sum = 0;
    inputs.forEach(inp => sum += (parseFloat(inp.value) || 0));
    document.getElementById('op-total-preview').textContent = '₱' + sum.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  inputs.forEach(inp => inp.addEventListener('input', updateTotalPreview));

  // Suggest feature
  overlay.querySelector('#btn-suggest').onclick = async () => {
    const branch = document.getElementById('op-branch').value;
    const currentMonth = document.getElementById('op-month').value; // YYYY-MM
    if (!currentMonth) return;

    // Calculate previous month string
    let [yyyy, mm] = currentMonth.split('-');
    let date = new Date(yyyy, parseInt(mm) - 1 - 1, 1); // Subtract 1 month
    const prevMonthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    try {
      const q = query(collection(db, 'opex_records'), where('branchId', '==', branch), where('month', '==', prevMonthStr));
      const snap = await getDocs(q);
      if (snap.empty) {
        window.showToast("No data found for " + prevMonthStr, "info");
      } else {
        const data = snap.docs[0].data();
        ['labor', 'marketing', 'sales', 'rental', 'utilities', 'management', 'depreciation', 'other'].forEach(f => {
          const el = document.getElementById(`op-${f}`);
          if (el && data[f]) el.value = data[f];
        });
        updateTotalPreview();
        window.showToast("Autofilled from " + prevMonthStr, "success");
      }
    } catch (e) { console.error(e); window.showToast("Error fetching history", "error"); }
  };

  // Save
  overlay.querySelector('#op-save').onclick = async () => {
    const branch = document.getElementById('op-branch').value;
    const month = document.getElementById('op-month').value;
    if (!branch || !month) return window.showToast("Branch and Month are required", "warning");

    const btn = overlay.querySelector('#op-save');
    btn.textContent = 'SAVING...';
    btn.disabled = true;

    try {
      const record = {
        branchId: branch,
        month: month,
        labor: parseFloat(document.getElementById('op-labor').value) || 0,
        marketing: parseFloat(document.getElementById('op-marketing').value) || 0,
        sales: parseFloat(document.getElementById('op-sales').value) || 0,
        rental: parseFloat(document.getElementById('op-rental').value) || 0,
        utilities: parseFloat(document.getElementById('op-utilities').value) || 0,
        management: parseFloat(document.getElementById('op-management').value) || 0,
        depreciation: parseFloat(document.getElementById('op-depreciation').value) || 0,
        other: parseFloat(document.getElementById('op-other').value) || 0,
        createdAt: new Date().toISOString()
      };

      record.total = record.labor + record.marketing + record.sales + record.rental + record.utilities + record.management + record.depreciation + record.other;

      // Unique ID based on branch and month to prevent duplicates
      const id = `${branch.replace(/[^a-zA-Z0-9]/g, '')}_${month}`;
      await setDoc(doc(db, 'opex_records', id), record);

      window.showToast("OPEX Record Saved", "success");
      overlay.remove();

      // Trigger refresh
      window.dispatchEvent(new CustomEvent('global-filter-changed'));

    } catch (e) {
      console.error(e);
      window.showToast("Failed to save record", "error");
      btn.textContent = 'SAVE OPEX';
      btn.disabled = false;
    }
  };
}

// Attach global delete handler for OPEX
window.deleteOpex = async (id) => {
  const confirmed = await window.showConfirmModal("Delete Record", "Are you sure you want to delete this OPEX record?");
  if (confirmed) {
    try {
      await deleteDoc(doc(db, 'opex_records', id));
      window.showToast("Record deleted", "success");
      window.dispatchEvent(new CustomEvent('global-filter-changed'));
    } catch (e) {
      console.error(e);
      window.showToast("Failed to delete", "error");
    }
  }
};
