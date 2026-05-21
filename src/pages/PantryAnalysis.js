import { db } from '../firebase.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

let chartTrend = null;

// Helper for Shimmer-Snap animation
function animateValue(el, end, formatter) {
  if (!el) return;
  const newValue = formatter(end);
  if (el.textContent === newValue) return;

  el.classList.add('shimmer-text');
  setTimeout(() => {
    el.textContent = newValue;
    el.classList.remove('shimmer-text');
    el.classList.add('animate-snap');
    setTimeout(() => el.classList.remove('animate-snap'), 500);
  }, 250);
}

export function renderPantryAnalysis() {
  // Reset global chart instances for the new page instance
  if (chartTrend) { chartTrend.destroy(); chartTrend = null; }

  const page = document.createElement('div');
  page.className = 'p-5 space-y-4 page-enter min-h-full';

  page.innerHTML = `
    <!-- Top Stats Row -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <div class="channel-card-premium group">
        <div class="channel-card-accent" style="background-color: #f43f5e; opacity: 0.1;"></div>
        <div class="absolute -bottom-4 -right-4 opacity-[0.08] dark:opacity-[0.15] -rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
           <i data-lucide="wallet" class="w-24 h-24 text-slate-900 dark:text-white"></i>
        </div>
        <div class="relative z-10 flex flex-col h-full">
           <p class="text-[10px] font-black text-slate-400 dark:text-white/60 uppercase tracking-[0.15em] mb-1">Total Spend</p>
           <h2 id="pa-total-spend" class="text-2xl font-black text-rose-500 tracking-tighter">₱0.00</h2>
           <div id="pa-spend-trend" class="mt-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-100 dark:bg-white/5 text-slate-500 w-max">0%</div>
        </div>
      </div>

      <div class="channel-card-premium group">
        <div class="channel-card-accent" style="background-color: #3b82f6; opacity: 0.1;"></div>
        <div class="absolute -bottom-4 -right-4 opacity-[0.08] dark:opacity-[0.15] -rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
           <i data-lucide="shopping-cart" class="w-24 h-24 text-slate-900 dark:text-white"></i>
        </div>
        <div class="relative z-10 flex flex-col h-full">
           <p class="text-[10px] font-black text-slate-400 dark:text-white/60 uppercase tracking-[0.15em] mb-1">Transactions</p>
           <h2 id="pa-total-trans" class="text-2xl font-black text-blue-500 tracking-tighter">0</h2>
           <p class="text-[9px] text-slate-400 dark:text-white/40 font-bold mt-auto uppercase tracking-widest">In Selected Period</p>
        </div>
      </div>

      <div class="channel-card-premium group">
        <div class="channel-card-accent" style="background-color: #96588a; opacity: 0.1;"></div>
        <div class="absolute -bottom-4 -right-4 opacity-[0.08] dark:opacity-[0.15] -rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
           <i data-lucide="package" class="w-24 h-24 text-slate-900 dark:text-white"></i>
        </div>
        <div class="relative z-10 flex flex-col h-full">
           <p class="text-[10px] font-black text-slate-400 dark:text-white/60 uppercase tracking-[0.15em] mb-1">Unique Items</p>
           <h2 id="pa-total-items" class="text-2xl font-black text-[#96588a] tracking-tighter">0</h2>
           <p class="text-[9px] text-slate-400 dark:text-white/40 font-bold mt-auto uppercase tracking-widest">Purchased</p>
        </div>
      </div>

      <div class="channel-card-premium group">
        <div class="channel-card-accent" style="background-color: #8b5cf6; opacity: 0.1;"></div>
        <div class="absolute -bottom-4 -right-4 opacity-[0.08] dark:opacity-[0.15] -rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
           <i data-lucide="tag" class="w-24 h-24 text-slate-900 dark:text-white"></i>
        </div>
        <div class="relative z-10 flex flex-col h-full">
           <p class="text-[10px] font-black text-slate-400 dark:text-white/60 uppercase tracking-[0.15em] mb-1">Top Purpose</p>
           <h2 id="pa-top-purpose" class="text-lg font-black text-slate-800 dark:text-white truncate tracking-tight" title="">-</h2>
           <p id="pa-top-purpose-val" class="text-[10px] text-slate-400 dark:text-white/60 font-black mt-auto uppercase tracking-widest">₱0.00</p>
        </div>
      </div>

      <div class="channel-card-premium group">
        <div class="channel-card-accent" style="background-color: #10b981; opacity: 0.1;"></div>
        <div class="absolute -bottom-4 -right-4 opacity-[0.08] dark:opacity-[0.15] -rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
           <i data-lucide="star" class="w-24 h-24 text-slate-900 dark:text-white"></i>
        </div>
        <div class="relative z-10 flex flex-col h-full">
           <p class="text-[10px] font-black text-slate-400 dark:text-white/60 uppercase tracking-[0.15em] mb-1">Top Item</p>
           <h2 id="pa-top-item" class="text-lg font-black text-emerald-500 truncate tracking-tight" title="">-</h2>
           <p id="pa-top-item-val" class="text-[10px] text-slate-400 dark:text-white/60 font-black mt-auto uppercase tracking-widest">₱0.00</p>
        </div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div class="glass-panel p-6 lg:col-span-3">
         <div class="flex justify-between items-center mb-6">
           <div class="flex items-center gap-3">
             <div class="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center shadow-inner">
                <i data-lucide="chart-bar-big" class="w-5 h-5 text-emerald-500"></i>
             </div>
             <div>
               <p class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em] mb-0.5">Spending Dynamics</p>
               <h3 class="text-base font-black text-slate-800 dark:text-white uppercase tracking-tighter">15-Day Spending Trend</h3>
             </div>
           </div>
        </div>
        <div class="h-64"><canvas id="pa-chart-trend"></canvas></div>
      </div>

      <div class="glass-panel p-6 lg:col-span-2">
         <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center shadow-inner">
               <i data-lucide="receipt-text" class="w-5 h-5 text-indigo-500"></i>
            </div>
            <div>
              <p class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em] mb-0.5">F&B Management</p>
              <h3 class="text-base font-black text-slate-800 dark:text-white uppercase tracking-tighter">Cost Of Good Sold</h3>
            </div>
         </div>
         
         <!-- 3-Column Header -->
         <div class="grid grid-cols-3 px-3 mb-2 border-b border-slate-100 dark:border-white/5 pb-2">
            <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Category</span>
            <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Amount (PHP)</span>
            <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">% Net Sale</span>
         </div>

         <div id="pa-cogs-list" class="space-y-1 mb-4">
            <div class="py-12 text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest animate-pulse">Calculating...</div>
         </div>

         <div class="pt-4 border-t border-slate-100 dark:border-white/5">
            <p class="text-[9px] font-bold text-slate-400 dark:text-white/30 italic">Note: COGS excludes beginning and ending inventory</p>
         </div>
      </div>
    </div>

    <!-- Tables Row -->
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
      
      <!-- Detailed Items Table -->
      <div class="glass-panel lg:col-span-3 flex flex-col overflow-hidden">
         <div class="px-6 py-4 flex justify-between items-center border-b border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.02]">
           <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shadow-inner">
                 <i data-lucide="list-ordered" class="w-4 h-4 text-blue-500"></i>
              </div>
              <div>
                 <p class="text-[9px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em] mb-0.5">Inventory Breakdown</p>
                 <h3 class="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Item Performance</h3>
              </div>
           </div>
        </div>
        <div class="flex-1 overflow-auto max-h-[500px] scrollbar-hide">
          <table class="w-full text-left border-collapse">
            <thead class="sticky top-0 z-20 bg-white/90 dark:bg-[#141414]/90 backdrop-blur-md shadow-sm">
              <tr class="border-b border-slate-100 dark:border-white/5">
                <th class="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-white/30 uppercase tracking-[0.15em]">Item Name</th>
                <th class="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-white/30 uppercase tracking-[0.15em] text-right">Qty</th>
                <th class="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-white/30 uppercase tracking-[0.15em] text-center">Unit</th>
                <th class="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-white/30 uppercase tracking-[0.15em] text-right">Avg Price</th>
                <th class="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-white/30 uppercase tracking-[0.15em] text-right">Total</th>
              </tr>
            </thead>
            <tbody id="pa-items-tbody" class="divide-y divide-slate-100 dark:divide-white/5">
              <!-- Rendered via JS -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- Price Alerts Table -->
      <div class="glass-panel lg:col-span-2 flex flex-col overflow-hidden border-rose-500/20">
        <div class="px-6 py-4 border-b border-rose-500/10 bg-rose-500/5">
          <div class="flex items-center gap-3">
             <div class="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center shadow-inner">
                <i data-lucide="trending-up" class="w-4 h-4 text-rose-500"></i>
             </div>
             <div>
                <p class="text-[9px] font-black text-rose-500/60 uppercase tracking-[0.2em] mb-0.5">Critical Updates</p>
                <h3 class="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider">Price Alerts</h3>
             </div>
          </div>
        </div>
        <div class="flex-1 overflow-auto max-h-[500px] scrollbar-hide">
          <table class="w-full text-left border-collapse">
            <thead class="sticky top-0 z-20 bg-rose-50 dark:bg-rose-900/10 backdrop-blur-md">
              <tr class="border-b border-rose-500/10">
                <th class="px-6 py-3 text-[10px] font-black text-rose-400 uppercase tracking-[0.15em]">Item</th>
                <th class="px-6 py-3 text-[10px] font-black text-rose-400 uppercase tracking-[0.15em] text-right">Market Shift</th>
              </tr>
            </thead>
            <tbody id="pa-alerts-tbody" class="divide-y divide-rose-500/5">
              <!-- Rendered via JS -->
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;

  // Attach logic
  setTimeout(() => {
    const anchor = document.getElementById('header-local-filters');
    if (anchor) {
      anchor.innerHTML = `
        <div class="flex items-center gap-4 pl-4 border-l border-slate-200 dark:border-white/10">
          <!-- Branch -->
          <div class="relative group cursor-pointer flex items-center gap-1.5 h-6">
            <input type="hidden" id="pa-branch" value="All Branches">
            <span id="pa-branch-text" class="text-[11px] font-black text-slate-600 dark:text-white uppercase tracking-wider group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors">All Branches</span>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors"></i>
            
            <div class="absolute top-full left-0 mt-2 w-52 bg-white/90 dark:bg-[#141414]/95 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 transition-all duration-300 z-[90] overflow-hidden backdrop-blur-2xl border border-white/60 dark:border-white/10">
              <div class="py-2">
                ${['All Branches', 'Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf'].map(b => `
                  <div class="px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" 
                       onclick="document.getElementById('pa-branch').value='${b}'; document.getElementById('pa-branch-text').innerText='${b}'; document.getElementById('pa-branch').dispatchEvent(new Event('change'));">
                    ${b}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="w-1 h-1 rounded-full bg-slate-300 dark:bg-white/20"></div>

          <!-- Date Range -->
          <div class="relative group cursor-pointer flex items-center gap-1.5 h-6" id="pa-preset-container">
             <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400 group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors"></i>
             <span id="pa-preset-label" class="text-[11px] font-black text-slate-600 dark:text-white uppercase tracking-wider group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors">Last 7 Days</span>
             <i data-lucide="chevron-down" id="pa-preset-chevron" class="w-3.5 h-3.5 text-slate-400 group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors"></i>
             
             <input type="text" id="pa-date-range" class="absolute inset-0 opacity-0 pointer-events-none" value="">
             
             <div id="pa-preset-menu" class="absolute top-full left-0 mt-2 w-52 bg-white/90 dark:bg-[#141414]/95 rounded-2xl shadow-2xl opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-300 z-[80] overflow-hidden backdrop-blur-2xl border border-white/60 dark:border-white/10">
                <div class="py-2">
                   <div class="pa-preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" data-value="yesterday">Yesterday</div>
                   <div class="pa-preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" data-value="last7">Last 7 Days</div>
                   <div class="pa-preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" data-value="thisMonth">This Month</div>
                   <div class="pa-preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all border-t border-slate-100 dark:border-white/5 cursor-pointer" data-value="custom">Custom Range...</div>
                </div>
             </div>
          </div>
        </div>
      `;
    }

    if (window.lucide) window.lucide.createIcons();

    const handleUpdate = (force = false) => {
      // Read local filter state
      const branchSelect = document.getElementById('pa-branch');
      const rangeInput = document.getElementById('pa-date-range');

      const branch = branchSelect?.value || 'All Branches';
      const rangeVal = rangeInput?.value || '';

      const now = new Date();
      const fmt = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      let toStr = fmt(now);
      const start7 = new Date();
      start7.setDate(start7.getDate() - 6);
      let fromStr = fmt(start7);

      if (rangeVal.includes(' to ')) {
        [fromStr, toStr] = rangeVal.split(' to ');
      } else if (rangeVal) {
        fromStr = toStr = rangeVal;
      }

      loadData(branch, fromStr, toStr, force);
    };

    // Setup flatpickr and local filter events
    const rangeInput = document.getElementById('pa-date-range');
    const container = document.getElementById('pa-preset-container');
    const label = document.getElementById('pa-preset-label');

    const getRange = (type) => {
      const d = new Date();
      const fmt = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      switch (type) {
        case 'yesterday':
          const yest = new Date(); yest.setDate(yest.getDate() - 1);
          return `${fmt(yest)} to ${fmt(yest)}`;
        case 'last7':
          const start7 = new Date(); start7.setDate(start7.getDate() - 6);
          return `${fmt(start7)} to ${fmt(d)}`;
        case 'thisMonth':
          const startM = new Date(d.getFullYear(), d.getMonth(), 1);
          return `${fmt(startM)} to ${fmt(d)}`;
        default: return '';
      }
    };

    if (window.flatpickr && rangeInput && container) {
      const fp = window.flatpickr(rangeInput, {
        mode: "range",
        dateFormat: "Y-m-d",
        onClose: (selectedDates) => {
          if (selectedDates.length === 2) {
            const start = fp.formatDate(selectedDates[0], "Y-m-d");
            const end = fp.formatDate(selectedDates[1], "Y-m-d");
            const rangeStr = `${start} to ${end}`;
            label.textContent = rangeStr;
            rangeInput.value = rangeStr;
            handleUpdate();
          }
        }
      });

      container.querySelectorAll('.pa-preset-option').forEach(opt => {
        opt.onclick = (e) => {
          e.stopPropagation();
          const val = opt.dataset.value;
          if (val === 'custom') {
            fp.open();
          } else {
            const range = getRange(val);
            label.textContent = opt.textContent;
            rangeInput.value = range;
            handleUpdate();
          }
        };
      });
    }

    const branchEl = document.getElementById('pa-branch');
    if (branchEl) branchEl.addEventListener('change', handleUpdate);

    handleUpdate();

    // Listen for global filter changes
    window.addEventListener('global-filter-changed', handleUpdate);

    // Refresh button logic
    const refreshBtn = document.getElementById('db-refresh');
    if (refreshBtn) refreshBtn.onclick = (e) => { e.preventDefault(); handleUpdate(true); };

    const cleanup = () => {
      window.removeEventListener('global-filter-changed', handleUpdate);
      if (chartTrend) { chartTrend.destroy(); chartTrend = null; }
    };
    window.addEventListener('cleanup-page', cleanup, { once: true });

    if (window.lucide) window.lucide.createIcons();
  }, 0);

  return page;
}

// ─── Data Fetching & Processing ─────────────────────────────────────────────

// Global cache for all pantry expenses
let cachedPantryExpenses = null;

// Global cache map for query results by filter keys (branch|fromDate|toDate)
const pantryCacheMap = new Map();

// Listen to custom events to clear cache when expenses or sales are updated
window.addEventListener('expenses-updated', () => {
  clearPantryCache();
});
window.addEventListener('sales-updated', () => {
  pantryCacheMap.clear();
});

export function clearPantryCache() {
  cachedPantryExpenses = null;
  pantryCacheMap.clear();
}

async function loadData(branch, fromDate, toDate, force = false) {
  try {
    const fmt = n => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const getLocalStr = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const cacheKey = `${branch}|${fromDate}|${toDate}`;
    let expenses, prevExpenses, items, chartExpenses, totalNetSales, chartFromDate;

    if (!force && pantryCacheMap.has(cacheKey)) {
      // Restore from cache map
      ({ expenses, prevExpenses, items, chartExpenses, totalNetSales, chartFromDate } = pantryCacheMap.get(cacheKey));
    } else {
      // 1. Fetch Expenses (only relevant pantry expenses, cached globally)
      if (force || !cachedPantryExpenses) {
        const qExp = query(
          collection(db, 'expenses'),
          where('category', 'in', ['Pantry', 'pantry']),
          where('status', '==', 'liquidated'),
          where('fundedBy', '==', 'accountant')
        );
        const snapExp = await getDocs(qExp);
        cachedPantryExpenses = snapExp.docs.map(d => d.data());
      }

      // Filter current period expenses from global cache
      expenses = cachedPantryExpenses.filter(e => {
        const matchesBranch = branch === 'All Branches' || e.branchId === branch;
        const matchesDate = e.date >= fromDate && e.date <= toDate;
        return matchesBranch && matchesDate;
      });

      // 2. Filter Previous Period Expenses for Trend
      const d1 = new Date(fromDate + 'T00:00:00');
      const d2 = new Date(toDate + 'T00:00:00');
      const days = Math.round((d2 - d1) / 86400000) + 1;
      const prevToDate = new Date(d1);
      prevToDate.setDate(prevToDate.getDate() - 1);
      const prevFromDate = new Date(prevToDate);
      prevFromDate.setDate(prevFromDate.getDate() - days + 1);

      const prevTo = getLocalStr(prevToDate);
      const prevFrom = getLocalStr(prevFromDate);

      prevExpenses = cachedPantryExpenses.filter(e => {
        const matchesBranch = branch === 'All Branches' || e.branchId === branch;
        const matchesDate = e.date >= prevFrom && e.date <= prevTo;
        return matchesBranch && matchesDate;
      });

      // 3. Fetch Items for the selected period
      let qItemsConstr = [where('date', '>=', fromDate), where('date', '<=', toDate)];
      if (branch !== 'All Branches') qItemsConstr.push(where('branchId', '==', branch));
      const qItems = query(collection(db, 'Pantry_Expense_Items_Detail'), ...qItemsConstr);
      const snapItems = await getDocs(qItems);
      items = snapItems.docs.map(d => d.data());

      // 4. Filter Items for 15 days ending at `toDate` for charts
      chartFromDate = new Date(d2);
      chartFromDate.setDate(chartFromDate.getDate() - 14);
      const chartFromStr = getLocalStr(chartFromDate);

      chartExpenses = cachedPantryExpenses.filter(e => {
        const matchesBranch = branch === 'All Branches' || e.branchId === branch;
        const matchesDate = e.date >= chartFromStr && e.date <= toDate;
        return matchesBranch && matchesDate;
      });

      // 5. Fetch Net Sales for % COGS Calculation
      let qSalesConstr = [where('date', '>=', fromDate), where('date', '<=', toDate)];
      if (branch !== 'All Branches') qSalesConstr.push(where('branchId', '==', branch));
      const qSales = query(collection(db, 'daily_sales'), ...qSalesConstr);
      const snapSales = await getDocs(qSales);
      totalNetSales = snapSales.docs.reduce((sum, d) => sum + (parseFloat(d.data()?.financials?.net) || 0), 0);

      // Save to cache map
      pantryCacheMap.set(cacheKey, { expenses, prevExpenses, items, chartExpenses, totalNetSales, chartFromDate });
    }

    // --- Processing Top Stats ---
    const totalSpend = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const prevSpend = prevExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const trendPct = prevSpend > 0 ? ((totalSpend - prevSpend) / prevSpend) * 100 : (totalSpend > 0 ? 100 : 0);

    animateValue(document.getElementById('pa-total-spend'), totalSpend, fmt);

    const trendEl = document.getElementById('pa-spend-trend');
    if (trendEl) {
      const isUp = trendPct >= 0;
      const newValue = `${isUp ? '+' : ''}${trendPct.toFixed(1)}% ${isUp ? '↑' : '↓'}`;
      if (trendEl.textContent !== newValue) {
        trendEl.classList.add('animate-snap');
        trendEl.textContent = newValue;
        setTimeout(() => trendEl.classList.remove('animate-snap'), 500);
      }
      trendEl.className = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold w-max ${isUp ? 'bg-rose-500/10 text-rose-600' : 'bg-emerald-500/10 text-emerald-600'}`;
    }

    animateValue(document.getElementById('pa-total-trans'), expenses.length, n => n.toLocaleString());

    // Process Items
    const itemMap = {};
    items.forEach(it => {
      const key = (it.itemName || 'Unknown').trim().toUpperCase();
      if (!itemMap[key]) itemMap[key] = { name: key, unit: it.unit || '-', qty: 0, spend: 0, prices: [] };
      itemMap[key].qty += (parseFloat(it.quantity) || 0);
      itemMap[key].spend += (parseFloat(it.lineTotal) || 0);
      itemMap[key].prices.push({ date: it.date, price: parseFloat(it.unitPrice) || 0 });
    });

    const uniqueItems = Object.keys(itemMap).length;
    animateValue(document.getElementById('pa-total-items'), uniqueItems, n => n.toLocaleString());

    // Top Item
    const sortedItems = Object.values(itemMap).sort((a, b) => b.spend - a.spend);
    const topItem = sortedItems[0];
    const topItemEl = document.getElementById('pa-top-item');
    const topItemValEl = document.getElementById('pa-top-item-val');
    if (topItemEl && topItemValEl) {
      if (topItem) {
        if (topItemEl.textContent !== topItem.name) {
          topItemEl.classList.add('animate-snap');
          topItemEl.textContent = topItem.name;
          topItemEl.title = topItem.name;
          setTimeout(() => topItemEl.classList.remove('animate-snap'), 500);
        }
        animateValue(topItemValEl, topItem.spend, fmt);
      } else {
        topItemEl.textContent = '-';
        topItemValEl.textContent = '₱0.00';
      }
    }

    // Process Purposes
    const purposeMap = {};
    expenses.forEach(e => {
      const p = e.purpose || 'Uncategorized';
      purposeMap[p] = (purposeMap[p] || 0) + (parseFloat(e.amount) || 0);
    });
    const sortedPurposes = Object.entries(purposeMap).sort((a, b) => b[1] - a[1]);
    const topPurposeEl = document.getElementById('pa-top-purpose');
    const topPurposeValEl = document.getElementById('pa-top-purpose-val');
    if (topPurposeEl && topPurposeValEl) {
      if (sortedPurposes.length > 0) {
        const pName = sortedPurposes[0][0];
        const pVal = sortedPurposes[0][1];
        if (topPurposeEl.textContent !== pName) {
          topPurposeEl.classList.add('animate-snap');
          topPurposeEl.textContent = pName;
          topPurposeEl.title = pName;
          setTimeout(() => topPurposeEl.classList.remove('animate-snap'), 500);
        }
        animateValue(topPurposeValEl, pVal, fmt);
      } else {
        topPurposeEl.textContent = '-';
        topPurposeValEl.textContent = '₱0.00';
      }
    }

    // --- Render Tables ---

    // Item Breakdown Table
    const tbodyItems = document.getElementById('pa-items-tbody');
    if (tbodyItems) {
      tbodyItems.innerHTML = sortedItems.map((it, idx) => {
        const avgPrice = it.qty > 0 ? it.spend / it.qty : 0;
        const cleanUnit = it.unit ? it.unit.toString().replace(/\s+/g, ' ').trim() : '';
        // Limit to first 20 for performance with animation
        if (idx > 20) return '';
        return `
           <tr class="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 animate-fade-in" style="animation-delay: ${idx * 0.05}s">
             <td class="px-4 py-2 font-bold text-slate-700 text-[12px] uppercase dark:text-slate-300 truncate max-w-[200px]" title="${it.name}">${it.name}</td>
             <td class="px-4 py-2 text-right font-medium text-slate-600 dark:text-slate-400 text-[12px]">${it.qty.toLocaleString()}</td>
             <td class="w-24 whitespace-nowrap px-4 py-2 text-center text-slate-500 text-[12px]">${cleanUnit}</td>
             <td class="w-44 px-4 py-2 text-right text-slate-500 text-[12px]">₱${avgPrice.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</td>
             <td class="w-44 px-4 py-2 text-right font-black text-[#96588a] text-[12px]">₱${it.spend.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
           </tr>
         `;
      }).join('') + (sortedItems.length > 20 ? `<tr class="bg-slate-50/50"><td colspan="5" class="px-4 py-2 text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">Showing top 20 items</td></tr>` : '');
    }

    // Price Alerts
    const alerts = [];
    sortedItems.forEach(it => {
      if (it.prices.length > 1) {
        it.prices.sort((a, b) => new Date(a.date) - new Date(b.date));
        const latestPrice = it.prices[it.prices.length - 1].price;
        let prevPrice = latestPrice;
        for (let i = it.prices.length - 2; i >= 0; i--) {
          if (it.prices[i].price !== latestPrice) {
            prevPrice = it.prices[i].price;
            break;
          }
        }
        if (latestPrice > prevPrice && prevPrice > 0) {
          const increasePct = ((latestPrice - prevPrice) / prevPrice) * 100;
          alerts.push({ name: it.name, old: prevPrice, new: latestPrice, pct: increasePct });
        }
      }
    });

    alerts.sort((a, b) => b.pct - a.pct);
    const tbodyAlerts = document.getElementById('pa-alerts-tbody');
    if (tbodyAlerts) {
      if (alerts.length > 0) {
        tbodyAlerts.innerHTML = alerts.map((al, idx) => `
          <tr class="border-b border-rose-50 dark:border-rose-900/10 bg-rose-50/30 dark:bg-rose-500/5 animate-fade-in" style="animation-delay: ${idx * 0.1}s">
            <td class="px-4 py-2.5 font-bold text-[11px] text-slate-700 dark:text-slate-300 truncate max-w-[120px]" title="${al.name}">${al.name}</td>
            <td class="px-4 py-2.5 text-right">
               <div class="flex flex-col items-end">
                  <span class="text-[9px] text-slate-400 line-through">₱${al.old.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span>
                  <span class="font-black text-[11px] text-rose-500">₱${al.new.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span>
                  <span class="text-[8px] font-black text-rose-600 bg-rose-100 px-1 rounded mt-0.5">+${al.pct.toFixed(0)}%</span>
               </div>
            </td>
          </tr>
        `).join('');
      } else {
        tbodyAlerts.innerHTML = `<tr><td colspan="2" class="px-4 py-6 text-center text-slate-400 italic text-xs animate-fade-in">No price increases detected in this period.</td></tr>`;
      }
    }

    // --- Charts ---

    // 1. Line Chart (15 Days)
    const dailyMap = {};
    for (let i = 0; i < 15; i++) {
      const d = new Date(chartFromDate);
      d.setDate(d.getDate() + i);
      dailyMap[getLocalStr(d)] = 0;
    }
    chartExpenses.forEach(e => {
      if (dailyMap[e.date] !== undefined) {
        dailyMap[e.date] += (parseFloat(e.amount) || 0);
      }
    });

    const dates = Object.keys(dailyMap).sort();
    const values = dates.map(d => dailyMap[d]);

    const ctxTrend = document.getElementById('pa-chart-trend');
    if (ctxTrend) {
      const labels = dates.map(d => d.slice(5));
      if (chartTrend) {
        chartTrend.data.labels = labels;
        chartTrend.data.datasets[0].data = values;
        chartTrend.update();
      } else {
        chartTrend = new Chart(ctxTrend, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Daily Spend',
              data: values,
              backgroundColor: '#f43f5e',
              borderRadius: 4
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false } },
              y: { border: { dash: [4, 4] }, ticks: { callback: v => '₱' + (v / 1000).toFixed(0) + 'K' } }
            },
            animation: {
              duration: 1000,
              easing: 'easeOutQuart'
            }
          }
        });
      }
    }

    // --- COGS List Processing (Fuzzy Matching) ---
    const cogsListEl = document.getElementById('pa-cogs-list');
    if (cogsListEl) {
      const cogsTargets = [
        { keys: ['process products'], display: 'Process products' },
        { keys: ['vegetables', 'vegtables'], display: 'Vegetables' },
        { keys: ['beverages'], display: 'Beverages' },
        { keys: ['groceries', 'grocery', 'accountant import'], display: 'Groceries' },
        { keys: ['condiments'], display: 'Condiments' },
        { keys: ['take out materials'], display: 'Take out materials' },
        { keys: ['cleaning materials'], display: 'Cleaning Materials' }
      ];

      // Sum by Fuzzy Matching
      const cogsData = cogsTargets.map(t => ({ ...t, value: 0 }));
      let otherCogsValue = 0;

      expenses.forEach(e => {
        const p = (e.purpose || '').trim().toLowerCase();
        const amt = parseFloat(e.amount) || 0;

        let matched = false;
        for (const target of cogsData) {
          if (target.keys.some(k => p.includes(k))) {
            target.value += amt;
            matched = true;
            break;
          }
        }
        if (!matched) otherCogsValue += amt;
      });

      let totalCogsValue = 0;
      let html = '';

      cogsData.forEach(target => {
        totalCogsValue += target.value;
        const pct = totalNetSales > 0 ? (target.value / totalNetSales) * 100 : 0;

        html += `
          <div class="grid grid-cols-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/[0.02] rounded-lg transition-colors items-center">
             <span class="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">${target.display}</span>
             <span class="text-[11px] font-black text-slate-900 dark:text-white text-right tabular-nums">${fmt(target.value)}</span>
             <span class="text-[11px] font-black text-indigo-500 text-right">${pct.toFixed(1)}%</span>
          </div>
        `;
      });

      // Show Other if exists
      if (otherCogsValue > 0) {
        totalCogsValue += otherCogsValue;
        const otherPct = totalNetSales > 0 ? (otherCogsValue / totalNetSales) * 100 : 0;
        html += `
          <div class="grid grid-cols-3 px-3 py-2 opacity-50 items-center">
             <span class="text-[10px] font-bold text-slate-400 uppercase italic">Other Purposes</span>
             <span class="text-[11px] font-bold text-slate-500 text-right tabular-nums">${fmt(otherCogsValue)}</span>
             <span class="text-[11px] font-bold text-slate-400 text-right">${otherPct.toFixed(1)}%</span>
          </div>
        `;
      }

      const totalCogsPct = totalNetSales > 0 ? (totalCogsValue / totalNetSales) * 100 : 0;

      html += `
        <div class="mt-4 pt-4 border-t-2 border-dashed border-slate-100 dark:border-white/5 flex items-center justify-between px-3">
           <span class="text-[12px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Total COGS</span>
           <span class="text-xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter">${totalCogsPct.toFixed(1)}%</span>
        </div>
      `;

      cogsListEl.innerHTML = html;
    }

  } catch (error) {
    console.error("Pantry Analysis Error:", error);
    window.showToast("Failed to load analysis data", "error");
  }
}
