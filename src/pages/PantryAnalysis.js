import { db } from '../firebase.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

let chartTrend = null;
let chartPie = null;

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
  if (chartPie) { chartPie.destroy(); chartPie = null; }

  const page = document.createElement('div');
  page.className = 'p-5 space-y-5 page-enter min-h-full';

  page.innerHTML = `
    <!-- Top Stats Row -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-slate-50 dark:border-slate-800 flex flex-col space-y-2">
        <p class="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Total Spend</p>
        <h2 id="pa-total-spend" class="text-2xl font-black text-rose-500">₱0.00</h2>
        <div id="pa-spend-trend" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold w-max">0%</div>
      </div>
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-slate-50 dark:border-slate-800 flex flex-col space-y-2">
        <p class="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Transactions</p>
        <h2 id="pa-total-trans" class="text-2xl font-black text-blue-500">0</h2>
        <p class="text-[10px] text-slate-400 font-medium">In selected period</p>
      </div>
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-slate-50 dark:border-slate-800 flex flex-col space-y-2">
        <p class="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Unique Items</p>
        <h2 id="pa-total-items" class="text-2xl font-black text-[#96588a]">0</h2>
        <p class="text-[10px] text-slate-400 font-medium">Purchased</p>
      </div>
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-slate-50 dark:border-slate-800 flex flex-col space-y-2">
        <p class="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Top Purpose</p>
        <h2 id="pa-top-purpose" class="text-lg font-black text-slate-800 dark:text-white truncate" title="">-</h2>
        <p id="pa-top-purpose-val" class="text-[10px] text-slate-400 font-medium font-bold">₱0.00</p>
      </div>
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-slate-50 dark:border-slate-800 flex flex-col space-y-2">
        <p class="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Top Item</p>
        <h2 id="pa-top-item" class="text-lg font-black text-emerald-500 truncate" title="">-</h2>
        <p id="pa-top-item-val" class="text-[10px] text-slate-400 font-medium font-bold">₱0.00</p>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-slate-50 dark:border-slate-800 lg:col-span-2">
        <div class="mb-4">
         <div class="flex items-center gap-3">
           <div class="bg-emerald-100 dark:bg-emerald-500/10 p-2 rounded-full flex items-center justify-center"><i data-lucide="chart-bar-big" class="w-5 h-5 text-emerald-600 dark:text-emerald-400"></i></div>
            <div class="flex flex-col">
              <p class="font-bold text-slate-800 dark:text-white text-sm">15-Day Spending Trend</p>
              <p class="text-[10px] text-slate-400 mt-1">Fixed to 15 days ending at selected end date</p>
            </div>
         </div>
        </div>
        <div class="h-56"><canvas id="pa-chart-trend"></canvas></div>
      </div>
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-slate-50 dark:border-slate-800">
        <div class="mb-4">
         <div class="flex items-center gap-3">
           <div class="bg-indigo-100 dark:bg-indigo-500/10 p-2 rounded-full flex items-center justify-center"><i data-lucide="wallet" class="w-5 h-5 text-indigo-500"></i></div>
           <div class="flex flex-col">
             <p class="font-bold text-slate-800 dark:text-white text-sm">Spend by Purpose</p>
             <p class="text-[10px] text-slate-400 mt-1">Purpose that most spent on</p>
           </div>
         </div>
        </div>
        <div class="h-44 flex items-center justify-center"><canvas id="pa-chart-pie"></canvas></div>
      </div>
    </div>

    <!-- Tables Row -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      
      <!-- Detailed Items Table -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-slate-50 dark:border-slate-800 lg:col-span-2 overflow-hidden flex flex-col">
        <div class="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
         <div class="flex items-center gap-3">
             <div class="bg-blue-100 dark:bg-blue-500/10 p-2 rounded-full flex items-center justify-center"><i data-lucide="list-ordered" class="w-5 h-5 text-blue-500"></i></div>
             <div class="flex flex-col">              
                <p class="font-bold text-slate-800 dark:text-white text-sm">Item Breakdown</p>
                <p class="text-[10px] text-slate-400 mt-1">Sorted by total spend</p>
             </div>
          </div>
        </div>
        <div class="flex-1 overflow-auto max-h-[400px] scrollbar-thin">
          <table class="w-full text-left border-collapse text-xs">
            <thead class="sticky top-0 bg-white dark:bg-slate-900 shadow-sm z-10">
              <tr class="border-b border-slate-100 dark:border-slate-800 text-[12px]">
                <th class="w-full px-4 py-3 uppercase font-black text-slate-400 tracking-wider">Item Name</th>
                <th class="w-20 px-4 py-3 font-black text-slate-400 uppercase tracking-wider text-right">Qty</th>
                <th class="whitespace-nowrap w-24 px-4 py-3 uppercase font-black text-slate-400 uppercase tracking-wider text-center">Unit</th>
                <th class="whitespace-nowrap w-44 px-4 py-3 font-black text-slate-400 uppercase tracking-wider text-right">Price</th>
                <th class="whitespace-nowrap w-44 px-4 py-3 font-black text-slate-400 uppercase tracking-wider text-right">Total Spend</th>
              </tr>
            </thead>
            <tbody id="pa-items-tbody">
              <!-- Rendered via JS -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- Price Alerts Table -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col">
        <div class="p-4 border-b border-rose-100 dark:border-rose-900/30 bg-rose-50/50 dark:bg-rose-500/5">
          <div class="flex items-center gap-3">
             <i data-lucide="trending-up" class="w-4 h-4 text-rose-500"></i>
             <div class="flex flex-col">              
                <p class="font-bold text-rose-600 dark:text-rose-400 text-sm">Price Alerts</p>
             <p class="text-[10px] text-rose-400/80 mt-1">Items with unit price increases</p>
             </div>
          </div>
        </div>
        <div class="flex-1 overflow-auto max-h-[400px] scrollbar-thin">
          <table class="w-full text-left border-collapse text-[12px]">
            <thead class="sticky top-0 bg-white dark:bg-slate-900 shadow-sm z-10">
              <tr class="border-b border-slate-100 dark:border-slate-800 text-[12px]">
                <th class="px-4 py-3 font-black text-slate-400 uppercase tracking-wider">Item</th>
                <th class="px-4 py-3 font-black text-slate-400 uppercase tracking-wider text-right">Old → New</th>
              </tr>
            </thead>
            <tbody id="pa-alerts-tbody">
              <!-- Rendered via JS -->
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;

  // Attach logic
  setTimeout(() => {
    if (window.lucide) window.lucide.createIcons();

    const handleUpdate = () => {
      // Read global filter state directly from the DOM elements
      const branchSelect = document.getElementById('db-branch');
      const rangeInput = document.getElementById('db-date-range');

      const branch = branchSelect?.value || 'All Branches';
      const rangeVal = rangeInput?.value || '';

      const now = new Date();
      let toStr = now.toISOString().split('T')[0];
      let fromStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

      if (rangeVal.includes(' to ')) {
        [fromStr, toStr] = rangeVal.split(' to ');
      } else if (rangeVal) {
        fromStr = toStr = rangeVal;
      }

      loadData(branch, fromStr, toStr);
    };

    handleUpdate();

    // Listen for global filter changes
    window.addEventListener('global-filter-changed', handleUpdate);

    // Refresh button logic
    const refreshBtn = document.getElementById('db-refresh');
    if (refreshBtn) refreshBtn.onclick = (e) => { e.preventDefault(); handleUpdate(); };

    const cleanup = () => {
      window.removeEventListener('global-filter-changed', handleUpdate);
      if (chartTrend) { chartTrend.destroy(); chartTrend = null; }
      if (chartPie) { chartPie.destroy(); chartPie = null; }
    };
    window.addEventListener('cleanup-page', cleanup, { once: true });

    if (window.lucide) window.lucide.createIcons();
  }, 0);

  return page;
}

// ─── Data Fetching & Processing ─────────────────────────────────────────────

async function loadData(branch, fromDate, toDate) {
  try {
    const fmt = n => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const filterPantry = (e) => {
      const cat = (e.category || '').trim().toLowerCase();
      const status = (e.status || '').trim().toLowerCase();
      return cat === 'pantry' && status === 'liquidated';
    };

    // 1. Fetch Expenses for the selected period
    let qExpConstr = [where('date', '>=', fromDate), where('date', '<=', toDate)];
    if (branch !== 'All Branches') qExpConstr.push(where('branchId', '==', branch));
    const qExp = query(collection(db, 'expenses'), ...qExpConstr);
    const snapExp = await getDocs(qExp);
    let expenses = snapExp.docs.map(d => d.data());
    expenses = expenses.filter(filterPantry);

    // 2. Fetch Previous Period Expenses for Trend
    const d1 = new Date(fromDate + 'T00:00:00');
    const d2 = new Date(toDate + 'T00:00:00');
    const days = Math.round((d2 - d1) / 86400000) + 1;
    const prevToDate = new Date(d1);
    prevToDate.setDate(prevToDate.getDate() - 1);
    const prevFromDate = new Date(prevToDate);
    prevFromDate.setDate(prevFromDate.getDate() - days + 1);
    const prevTo = prevToDate.toISOString().split('T')[0];
    const prevFrom = prevFromDate.toISOString().split('T')[0];

    let qPrevExpConstr = [where('date', '>=', prevFrom), where('date', '<=', prevTo)];
    if (branch !== 'All Branches') qPrevExpConstr.push(where('branchId', '==', branch));
    const qPrevExp = query(collection(db, 'expenses'), ...qPrevExpConstr);
    const snapPrevExp = await getDocs(qPrevExp);
    let prevExpenses = snapPrevExp.docs.map(d => d.data());
    prevExpenses = prevExpenses.filter(filterPantry);

    // 3. Fetch Items for the selected period
    let qItemsConstr = [where('date', '>=', fromDate), where('date', '<=', toDate)];
    if (branch !== 'All Branches') qItemsConstr.push(where('branchId', '==', branch));
    const qItems = query(collection(db, 'Pantry_Expense_Items_Detail'), ...qItemsConstr);
    const snapItems = await getDocs(qItems);
    let items = snapItems.docs.map(d => d.data());

    // 4. Fetch Items for 15 days ending at `toDate` for charts
    const chartFromDate = new Date(d2);
    chartFromDate.setDate(chartFromDate.getDate() - 14);
    const chartFromStr = chartFromDate.toISOString().split('T')[0];

    let qChartConstr = [where('date', '>=', chartFromStr), where('date', '<=', toDate)];
    if (branch !== 'All Branches') qChartConstr.push(where('branchId', '==', branch));
    const qChart = query(collection(db, 'expenses'), ...qChartConstr);
    const snapChart = await getDocs(qChart);
    let chartExpenses = snapChart.docs.map(d => d.data());
    chartExpenses = chartExpenses.filter(filterPantry);

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
      purposeMap[p] = (purposeMap[p] || 0) + (e.amount || 0);
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
    // We need to check if an item's most recent price is significantly higher than its previous price
    // Since we only fetched `fromDate` to `toDate`, the alert is contextual to the selected period.
    // For a deeper alert, we could fetch historical, but let's compare within the fetched data first.
    const alerts = [];
    sortedItems.forEach(it => {
      if (it.prices.length > 1) {
        // Sort by date asc
        it.prices.sort((a, b) => new Date(a.date) - new Date(b.date));
        const latestPrice = it.prices[it.prices.length - 1].price;
        // Find the earliest different price to show the jump, or just the previous price
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

    alerts.sort((a, b) => b.pct - a.pct); // Highest increase first
    const tbodyAlerts = document.getElementById('pa-alerts-tbody');
    if (tbodyAlerts) {
      if (alerts.length > 0) {
        tbodyAlerts.innerHTML = alerts.map((al, idx) => `
          <tr class="border-b border-rose-50 dark:border-rose-900/10 bg-rose-50/30 dark:bg-rose-500/5 animate-fade-in" style="animation-delay: ${idx * 0.1}s">
            <td class="px-4 py-3 font-bold text-slate-700 dark:text-slate-300 truncate max-w-[120px]" title="${al.name}">${al.name}</td>
            <td class="px-4 py-3 text-right">
               <div class="flex flex-col items-end">
                  <span class="text-[10px] text-slate-400 line-through">₱${al.old.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span>
                  <span class="font-black text-rose-500">₱${al.new.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span>
                  <span class="text-[9px] font-bold text-rose-600 bg-rose-100 px-1 rounded mt-0.5">+${al.pct.toFixed(0)}%</span>
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
    // Initialize 15 days
    for (let i = 0; i < 15; i++) {
      const d = new Date(chartFromDate);
      d.setDate(d.getDate() + i);
      dailyMap[d.toISOString().split('T')[0]] = 0;
    }
    chartExpenses.forEach(e => {
      if (dailyMap[e.date] !== undefined) {
        dailyMap[e.date] += (e.amount || 0);
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
              backgroundColor: '#f43f5e', // rose-500
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

    // 2. Pie Chart
    const ctxPie = document.getElementById('pa-chart-pie');
    if (ctxPie) {
      // Limit to top 5 purposes, group rest into "Others"
      let pieLabels = [];
      let pieData = [];
      if (sortedPurposes.length > 5) {
        pieLabels = sortedPurposes.slice(0, 4).map(p => p[0]);
        pieData = sortedPurposes.slice(0, 4).map(p => p[1]);
        const others = sortedPurposes.slice(4).reduce((sum, p) => sum + p[1], 0);
        pieLabels.push('Others');
        pieData.push(others);
      } else {
        pieLabels = sortedPurposes.map(p => p[0]);
        pieData = sortedPurposes.map(p => p[1]);
      }

      if (chartPie) {
        chartPie.data.labels = pieLabels;
        chartPie.data.datasets[0].data = pieData;
        chartPie.update();
      } else {
        chartPie = new Chart(ctxPie, {
          type: 'doughnut',
          data: {
            labels: pieLabels,
            datasets: [{
              data: pieData,
              backgroundColor: ['#96588a', '#3b82f6', '#10b981', '#f59e0b', '#64748b', '#cbd5e1'],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '70%',
            plugins: {
              legend: { position: 'right', labels: { font: { size: 10, family: 'Nunito' }, boxWidth: 10 } }
            },
            animation: {
              animateScale: true,
              animateRotate: true,
              duration: 1000,
              easing: 'easeOutQuart'
            }
          }
        });
      }
    }

  } catch (error) {
    console.error("Pantry Analysis Error:", error);
    window.showToast("Failed to load analysis data", "error");
  }
}
