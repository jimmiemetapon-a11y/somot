import { Chart, registerables } from 'chart.js';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
Chart.register(...registerables);

// ── SVG Icons ─────────────────────────────────────────
const IC = {
  dollar: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>`,
  trendUp: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  trendDn: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`,
  fork: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h1v2"/><path d="M21 22v-3"/></svg>`,
  bag: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  bike: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`,
  pizza: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 11h.01"/><path d="M11 15h.01"/><path d="M16 16h.01"/><path d="m2 16 20 6-6-20A20 20 0 0 0 2 16"/><path d="M5.71 17.11a17.04 17.04 0 0 1 11.4-11.4"/></svg>`,
  refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
};

const BRANCHES = ['All Branches', 'Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf'];

const CHANNELS = {
  dinein: { label: 'DINE-IN', kpi: 585000, color: '#60A5FA', bg: '#eff6ff', icon: 'id_VcqlrDV_1777185371840.svg', darkIcon: 'kiotviet_dark.svg' },
  online: { label: 'ONLINE', kpi: 135000, color: '#96588a', bg: '#fbf7fb', icon: 'WooCommerce.svg', darkIcon: 'woo_dark.svg' },
  grabfood: { label: 'GRAB', kpi: 270000, color: '#34D399', bg: '#ecfdf5', icon: 'GrabFood.svg', darkIcon: 'Grab_dark.svg' },
  foodpanda: { label: 'FOOD PANDA', kpi: 135000, color: '#F472B6', bg: '#fdf2f8', icon: 'Foodpanda.svg', darkIcon: 'panda_dark.svg' },
};

let chartMain = null, chartPie = null, chartMini = null;

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

function formatAbbreviated(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(3) + 'M';
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function renderDashboard(user) {
  const page = document.createElement('div');
  page.className = 'p-5 space-y-5 page-enter relative min-h-full';

  function getGreetingInfo() {
    const hour = new Date().getHours();
    if (hour < 12) return { text: 'Good Morning', icon: 'sun' };
    if (hour < 18) return { text: 'Good Afternoon', icon: 'cloud-sun' };
    return { text: 'Good Evening', icon: 'moon' };
  }

  const userName = user?.displayName?.split(' ')[0] || 'Admin';
  const { text: greeting, icon: weatherIcon } = getGreetingInfo();
  const dateStr = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date());

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  page.innerHTML = `
    <!-- Floating Typographic Greeting (Option A - Borderless) -->
    <div class="card-stagger relative mb-8 mt-0 px-2" style="animation-delay: 0.1s">
      <!-- Atmospheric Background Element -->
      <div class="absolute -top-10 -left-6 opacity-[0.08] dark:opacity-[0.08] pointer-events-none select-none text-slate-800/80 dark:text-white/100">
        <i data-lucide="${weatherIcon}" class="w-32 h-32 -rotate-12"></i>
      </div>

      <div class="relative z-10 flex flex-col gap-2">
        <div class="flex items-center gap-3 text-slate-400 dark:text-white/20 text-[9px] font-black uppercase tracking-[0.3em]">
          <i data-lucide="calendar" class="w-3 h-3"></i>
          <span>${dateStr}</span>
        </div>

        <h1 class="text-3xl md:text-4xl font-black tracking-tighter text-slate-800 dark:text-white leading-tight whitespace-nowrap">
          ${greeting}, 
          <span class="whitespace-nowrap bg-gradient-to-r from-orange-500 to-rose-500 bg-clip-text text-transparent">
            ${userName}
          </span>
        </h1>

        <p class="text-slate-400 dark:text-white/30 text-xs font-medium tracking-wide">
          Welcome to <span class="text-slate-600 dark:text-white/50 font-bold">So Mot Vietnamese Cuisine!</span>
        </p>
      </div>
    </div>

  <!-- Unified Command Center (Compact Single Glass Panel) -->
  <div class="card-stagger luxury-card relative bg-white/40 dark:bg-[#141414]/60 rounded-[2.5rem] p-6 mb-8 text-white shadow-xl dark:shadow-2xl backdrop-blur-3xl border-t border-white/60 dark:border-white/10 group overflow-hidden" style="animation-delay: 0.2s">
    <div class="luxury-shine"></div>
    <div class="channel-card-accent" style="background-color: #f97316; opacity: 0.15; transform: scale(2.5); filter: blur(100px); top: -20%; left: -10%;"></div>
    
    <div class="relative z-10 flex flex-col lg:flex-row items-center gap-10">
      
      <!-- Primary Section: Net Revenue -->
      <div class="flex-1 w-full lg:w-auto">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
              <i data-lucide="zap" class="w-4 h-4"></i>
            </div>
            <p class="text-slate-500 dark:text-white/60 text-[9px] font-black uppercase tracking-[0.2em]">Net Revenue</p>
          </div>
          <div id="hero-net-trend-text" class="text-[9px] font-bold px-2 py-0.5 rounded-md bg-emerald-600 text-white">0% ^</div>
        </div>
        
        <div class="flex items-baseline gap-3 mb-4">
          <h2 id="hero-net" class="text-4xl font-black text-slate-900 dark:text-white tracking-tighter transition-all duration-500">₱0.00</h2>
        </div>

        <div class="w-full">
          <div class="flex justify-between items-end mb-2">
            <p id="hero-net-pct" class="text-[8px] text-slate-400 dark:text-white/40 font-black uppercase tracking-widest">0% of daily target</p>
            <span class="text-[8px] text-orange-600 dark:text-orange-500 font-black uppercase tracking-tighter">Target: ₱1.125M</span>
          </div>
          <div class="w-full h-2 bg-slate-200/50 dark:bg-white/10 rounded-full relative overflow-hidden">
            <div id="hero-net-bar" class="h-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-1000 relative rounded-full" style="width:0%">
              <div class="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)] animate-[shimmer_2s_infinite]"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Secondary Section: Nested Dark Hub (Adaptive Colors) -->
      <div class="flex-1 w-full lg:w-auto bg-slate-100/50 dark:bg-[#1c1c1c]/70 backdrop-blur-2xl rounded-[1.5rem] p-5 shadow-sm dark:shadow-lg border border-slate-200/50 dark:border-white/[0.08] grid grid-cols-2 gap-x-8 gap-y-5">
        
        <!-- Gross Sale -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-slate-400 dark:text-white/60">
              <i data-lucide="trending-up" class="w-3 h-3"></i>
              <span class="text-[9px] font-black uppercase tracking-widest">Gross</span>
            </div>
            <div id="hero-gross-trend" class="text-[7px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-600 text-white leading-none">0% ^</div>
          </div>
          <h3 id="hero-gross" class="text-lg font-black text-slate-900 dark:text-white tracking-tight">₱0.00</h3>
        </div>

        <!-- Net Profit -->
        <div class="flex items-center justify-between gap-4">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-1.5 text-slate-400 dark:text-white/60">
              <i data-lucide="bar-chart-3" class="w-3 h-3"></i>
              <span class="text-[9px] font-black uppercase tracking-widest">Profit</span>
            </div>
            <h3 id="hero-profit" class="text-lg font-black text-slate-900 dark:text-white tracking-tight">₱0.00</h3>
          </div>
          <!-- Apple-style Circular Progress (Larger, Minimalist) -->
          <div class="relative flex items-center justify-center w-10 h-10 shrink-0">
            <svg class="w-full h-full -rotate-90" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="16" stroke="currentColor" stroke-width="4" fill="transparent" class="text-slate-200 dark:text-white/5" />
              <circle id="profit-ring" cx="20" cy="20" r="16" stroke="currentColor" stroke-width="4" fill="transparent" stroke-dasharray="100.5" stroke-dashoffset="100.5" stroke-linecap="round" class="text-emerald-500 transition-all duration-1000" />
            </svg>
          </div>
        </div>

        <!-- Expenses -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-slate-400 dark:text-white/60">
              <i data-lucide="receipt" class="w-3 h-3"></i>
              <span class="text-[9px] font-black uppercase tracking-widest">Expenses</span>
            </div>
            <div id="hero-expenses-trend" class="text-[7px] font-bold px-1.5 py-0.5 rounded-md bg-rose-600 text-white leading-none">0% v</div>
          </div>
          <h3 id="hero-expenses" class="text-lg font-black text-rose-600 dark:text-rose-500 tracking-tight">₱0.00</h3>
        </div>

        <!-- Deduction -->
        <div class="flex items-center justify-between gap-4">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-1.5 text-slate-400 dark:text-white/60">
              <i data-lucide="scissors" class="w-3 h-3"></i>
              <span class="text-[9px] font-black uppercase tracking-widest">Deduction</span>
            </div>
            <h3 id="hero-ded" class="text-lg font-black text-rose-600 dark:text-rose-500 tracking-tight">₱0.00</h3>
          </div>
          <!-- Apple-style Circular Progress (Larger, Minimalist) -->
          <div class="relative flex items-center justify-center w-10 h-10 shrink-0">
            <svg class="w-full h-full -rotate-90" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="16" stroke="currentColor" stroke-width="4" fill="transparent" class="text-slate-200 dark:text-white/5" />
              <circle id="ded-ring" cx="20" cy="20" r="16" stroke="currentColor" stroke-width="4" fill="transparent" stroke-dasharray="100.5" stroke-dashoffset="100.5" stroke-linecap="round" class="text-rose-500 transition-all duration-1000" />
            </svg>
          </div>
        </div>

      </div>

      </div>

      <!-- Channel Management Row (Integrated into Unified Surface) -->
      <div class="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        ${Object.entries(CHANNELS).map(([id, ch]) => `
          <div class="card-stagger relative bg-white/80 dark:bg-[#1c1c1c]/70 backdrop-blur-md rounded-2xl overflow-hidden shadow-lg border border-white/20 dark:border-white/5 h-52 flex flex-col group transition-all cursor-pointer"
               style="animation-delay: ${0.5 + (Object.keys(CHANNELS).indexOf(id) * 0.1)}s"
               onmouseover="this.style.borderColor='${ch.color}44'" 
               onmouseout="this.style.borderColor='transparent'">
            
            <!-- Integrated Header Banner (Glass Tint Style) -->
            <div class="channel-card-header px-4 py-3 flex justify-between items-start relative z-10 transition-colors" 
                 style="background-color: ${ch.bg}; --header-tint: ${ch.color}26">
              <div class="flex-1">
                <p class="text-[11px] font-extrabold tracking-tight mb-1" style="color: ${ch.color}">${ch.label}</p>
                <h3 id="card-${id}-net" class="text-xl font-extrabold" style="color: ${ch.color}">₱0.00</h3>
              </div>
              <div class="w-16 h-8 flex items-center justify-end overflow-hidden transition-transform duration-300 group-hover:scale-110">
                <img src="/src/assets/${ch.icon}" class="w-full h-full object-contain object-right-top dark:hidden" alt="${ch.label}">
                <img src="/src/assets/${ch.darkIcon}" class="w-full h-full object-contain object-right-top hidden dark:block" alt="${ch.label}">
              </div>
            </div>

            <!-- Content Body -->
            <div class="p-4 flex flex-col flex-1 relative z-10">
              <div class="space-y-1 mb-3 font-nunito text-[12px]">
                <div class="flex justify-between items-center">
                  <span class="text-gray-400 font-medium">Deduction</span>
                  <span id="card-${id}-ded" class="font-bold text-rose-500">0.00</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-400 font-medium">Gross Sales</span>
                  <span id="card-${id}-gross" class="font-bold text-slate-600 dark:text-slate-300">0.00</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-400 font-medium">KPI Target</span>
                  <span id="card-${id}-kpi" class="font-bold text-slate-600 dark:text-slate-300">${(ch.kpi).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              
              <div class="mt-auto">
                <div class="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full relative">
                  <div id="card-${id}-bar" class="h-full rounded-full transition-all duration-1000 relative" style="width:0%; background:${ch.color};">
                    <div class="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 rounded-full shadow-md translate-x-1/2 transition-all duration-300" style="border-color: ${ch.color}"></div>
                  </div>
                </div>
                <div class="flex justify-between items-center mt-1.5">
                  <span id="card-${id}-pct" class="text-[9px] font-bold text-gray-400 uppercase tracking-tight">0% achieved</span>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>

    </div>
  </div>

    <!-- Charts Row -->
    <div class="card-stagger grid grid-cols-1 lg:grid-cols-3 gap-6" style="animation-delay: 0.9s">
      <div class="bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-[2.5rem] p-7 shadow-xl dark:shadow-2xl border-t border-white/60 dark:border-white/10 lg:col-span-2 transition-all">
        <div class="mb-5">
          <p class="font-black text-slate-800 dark:text-white/80 text-sm font-nunito uppercase tracking-widest">Net Revenue Trend</p>
          <p class="text-[10px] text-slate-400 dark:text-white/30 mt-1 font-nunito font-bold uppercase tracking-tight">Daily breakdown across all channels</p>
        </div>
        <div class="h-64"><canvas id="chart-main"></canvas></div>
      </div>
      <div class="bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-[2.5rem] p-7 shadow-xl dark:shadow-2xl border-t border-white/60 dark:border-white/10 transition-all">
        <div class="mb-5">
          <p class="font-black text-slate-800 dark:text-white/80 text-sm font-nunito uppercase tracking-widest">Channel Mix</p>
          <p class="text-[10px] text-slate-400 dark:text-white/30 mt-1 font-nunito font-bold uppercase tracking-tight">Revenue distribution</p>
        </div>
        <div class="h-44 flex items-center justify-center"><canvas id="chart-pie"></canvas></div>
        <div class="mt-4 space-y-2.5">
          ${Object.entries(CHANNELS).map(([id, ch]) => `
            <div class="flex items-center justify-between text-xs font-nunito">
              <div class="flex items-center gap-2.5">
                <div class="w-2.5 h-2.5 rounded-full" style="background:${ch.color};"></div>
                <span class="font-semibold text-slate-600 dark:text-slate-300">${ch.label}</span>
              </div>
              <span id="pie-pct-${id}" class="font-bold text-slate-800 dark:text-white font-oswald">—</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const branchSelect = document.getElementById('db-branch');
    const rangeInput = document.getElementById('db-date-range');
    const refreshBtn = document.getElementById('db-refresh');

    const handleUpdate = () => {
      const branch = branchSelect?.value || 'All Branches';
      const rangeVal = rangeInput?.value || '';

      let from = firstDay, to = today;
      if (rangeVal.includes(' to ')) {
        [from, to] = rangeVal.split(' to ');
      } else if (rangeVal) {
        from = to = rangeVal;
      }

      loadAndRender(page, branch, from, to);
    };

    // Initial load
    handleUpdate();

    // Listen for global filter changes
    window.addEventListener('global-filter-changed', handleUpdate);

    // Cleanup logic to prevent memory leaks
    const cleanup = () => {
      window.removeEventListener('global-filter-changed', handleUpdate);
      if (chartMain) { chartMain.destroy(); chartMain = null; }
      if (chartPie) { chartPie.destroy(); chartPie = null; }
      if (chartMini) { chartMini.destroy(); chartMini = null; }
    };
    window.addEventListener('cleanup-page', cleanup, { once: true });

    if (refreshBtn) refreshBtn.onclick = (e) => { e.preventDefault(); handleUpdate(); };
    if (window.lucide) window.lucide.createIcons();
  }, 0);

  return page;
}

// ── Data Handling ────────────────────────────────────────────────────────────
async function loadAndRender(page, branch, fromDate, toDate) {
  try {
    // Calculate previous period for trend comparison
    const d1 = new Date(fromDate + 'T00:00:00');
    const d2 = new Date(toDate + 'T00:00:00');
    const days = Math.round((d2 - d1) / 86400000) + 1;

    const prevToDate = new Date(d1);
    prevToDate.setDate(prevToDate.getDate() - 1);
    const prevFromDate = new Date(prevToDate);
    prevFromDate.setDate(prevFromDate.getDate() - days + 1);

    const prevTo = prevToDate.toISOString().split('T')[0];
    const prevFrom = prevFromDate.toISOString().split('T')[0];

    const [salesDocs, prevSalesDocs, expenseDocs, prevExpenseDocs] = await Promise.all([
      fetchSalesData(branch, fromDate, toDate),
      fetchSalesData(branch, prevFrom, prevTo),
      fetchExpenseData(branch, fromDate, toDate),
      fetchExpenseData(branch, prevFrom, prevTo)
    ]);

    updateCards(page, salesDocs, prevSalesDocs, expenseDocs, prevExpenseDocs);
    updateCharts(salesDocs);
  } catch (err) {
    console.error('Dashboard error:', err);
  }
}

async function fetchSalesData(branch, fromDate, toDate) {
  let q = collection(db, 'daily_sales');
  let constraints = [where('date', '>=', fromDate), where('date', '<=', toDate)];

  if (branch && branch !== 'All Branches') {
    constraints.push(where('branchId', '==', branch));
  }

  const snap = await getDocs(query(q, ...constraints));
  return snap.docs.map(d => d.data());
}

async function fetchExpenseData(branch, fromDate, toDate) {
  let q = collection(db, 'expenses');
  let constraints = [where('date', '>=', fromDate), where('date', '<=', toDate)];

  if (branch && branch !== 'All Branches') {
    constraints.push(where('branchId', '==', branch));
  }

  const snap = await getDocs(query(q, ...constraints));
  return snap.docs.map(d => d.data());
}

function getNet(d) { return d.financials ? d.financials.net : (d.net || 0); }
function getGross(d) { return d.financials ? d.financials.gross : (d.gross || 0); }
function getDed(d) { return d.financials ? d.financials.totalDeductions : (d.totalDeductions || 0); }

function updateCards(page, docs, prevDocs, expenseDocs = [], prevExpenseDocs = []) {
  const fmt = n => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtAbbr = n => '₱' + formatAbbreviated(n);
  const fmtNum = n => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let totalNet = 0, totalGross = 0, totalDed = 0;
  const ch = {};
  Object.keys(CHANNELS).forEach(k => { ch[k] = { net: 0, gross: 0, ded: 0 }; });

  docs.forEach(d => {
    const net = getNet(d), gross = getGross(d), ded = getDed(d);
    totalNet += net; totalGross += gross; totalDed += ded;
    if (ch[d.channelId]) { ch[d.channelId].net += net; ch[d.channelId].gross += gross; ch[d.channelId].ded += ded; }
  });

  // Calculate REAL total expenses
  const totalExpenses = (expenseDocs || []).reduce((sum, e) => sum + (e.amount || 0), 0);
  const prevTotalExpenses = (prevExpenseDocs || []).reduce((sum, e) => sum + (e.amount || 0), 0);

  // Update Card 1: Total Net
  animateValue(page.querySelector('#hero-net'), totalNet, fmtAbbr);

  const prevTotalNet = prevDocs ? prevDocs.reduce((sum, d) => sum + getNet(d), 0) : 0;
  const netTrendPct = prevTotalNet > 0 ? ((totalNet - prevTotalNet) / prevTotalNet) * 100 : (totalNet > 0 ? 100 : 0);
  const trendEl = page.querySelector('#hero-net-trend-text');
  if (trendEl) {
    const isUp = netTrendPct >= 0;
    trendEl.innerHTML = `${isUp ? '+' : ''}${netTrendPct.toFixed(1)}% ${isUp ? '^' : 'v'}`;
    trendEl.className = `text-[9px] font-bold px-2 py-0.5 rounded-md text-white ${isUp ? 'bg-emerald-600' : 'bg-rose-600'}`;
  }

  // Update Card 2: Gross
  animateValue(page.querySelector('#hero-gross'), totalGross, fmtAbbr);
  const prevTotalGross = prevDocs ? prevDocs.reduce((sum, d) => sum + getGross(d), 0) : 0;
  const grossTrend = prevTotalGross > 0 ? ((totalGross - prevTotalGross) / prevTotalGross) * 100 : 0;
  const grossTrendEl = page.querySelector('#hero-gross-trend');
  if (grossTrendEl) {
    const isUp = grossTrend >= 0;
    grossTrendEl.innerHTML = `${isUp ? '+' : ''}${grossTrend.toFixed(1)}% ${isUp ? '^' : 'v'}`;
    grossTrendEl.className = `text-[8px] font-bold px-1.5 py-0.5 rounded-md text-white leading-none ${isUp ? 'bg-emerald-600' : 'bg-rose-600'}`;
  }

  // Update Card 3: Deduction
  animateValue(page.querySelector('#hero-ded'), totalDed, (n) => '-₱' + formatAbbreviated(n));

  // Update Card 4: REAL Expenses
  animateValue(page.querySelector('#hero-expenses'), totalExpenses, (n) => '-₱' + formatAbbreviated(n));
  const expTrendPct = prevTotalExpenses > 0 ? ((totalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100 : 0;
  const expTrendEl = page.querySelector('#hero-expenses-trend');
  if (expTrendEl) {
    const isUp = expTrendPct >= 0;
    // For expenses: UP is generally bad (Rose), DOWN is good (Emerald)
    expTrendEl.innerHTML = `${isUp ? '+' : ''}${expTrendPct.toFixed(1)}% ${isUp ? '^' : 'v'}`;
    expTrendEl.className = `text-[8px] font-bold px-1.5 py-0.5 rounded-md text-white leading-none ${isUp ? 'bg-rose-600' : 'bg-emerald-600'}`;
  }

  // Update Card 5: Profit & Margin Ring
  const profit = totalNet - totalExpenses;
  const profitEl = page.querySelector('#hero-profit');
  animateValue(profitEl, profit, (n) => (n < 0 ? '-' : '') + '₱' + formatAbbreviated(Math.abs(n)));
  if (profitEl) profitEl.className = `text-lg font-black ${profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`;

  const efficiency = totalNet > 0 ? (profit / totalNet) * 100 : 0;
  const ring = page.querySelector('#profit-ring');
  if (ring) {
    const val = Math.max(0, Math.min(100, Math.round(efficiency)));
    const offset = 100.5 - (100.5 * val) / 100;
    ring.style.strokeDashoffset = offset;
    ring.className.baseVal = `transition-all duration-1000 ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`;
  }

  // Update Deduction Ring
  const dedRatio = totalGross > 0 ? (totalDed / totalGross) * 100 : 0;
  const dRing = page.querySelector('#ded-ring');
  if (dRing) {
    const val = Math.max(0, Math.min(100, Math.round(dedRatio)));
    const offset = 100.5 - (100.5 * val) / 100;
    dRing.style.strokeDashoffset = offset;
  }



  // Card 1 KPI bar
  const totalKpi = Object.values(CHANNELS).reduce((acc, c) => acc + c.kpi, 0);
  const kpiPct = totalKpi > 0 ? (totalNet / totalKpi) * 100 : 0;
  const heroBar = page.querySelector('#hero-net-bar');
  const heroPct = page.querySelector('#hero-net-pct');
  if (heroBar) heroBar.style.width = Math.min(kpiPct, 100) + '%';
  if (heroPct) heroPct.textContent = Math.round(kpiPct) + '% OF KPI (₱' + formatAbbreviated(totalKpi) + ')';

  // Animate Channels
  Object.entries(CHANNELS).forEach(([id, cfg]) => {
    const data = ch[id];
    animateValue(page.querySelector(`#card-${id}-net`), data.net, fmtAbbr);
    animateValue(page.querySelector(`#card-${id}-gross`), data.gross, fmtAbbr);
    page.querySelector(`#card-${id}-ded`).textContent = '-' + fmt(data.ded);

    const pct = cfg.kpi > 0 ? (data.net / cfg.kpi) * 100 : 0;
    const barEl = page.querySelector(`#card-${id}-bar`);
    const pctText = page.querySelector(`#card-${id}-pct`);
    setTimeout(() => {
      if (barEl) barEl.style.width = Math.min(pct, 100) + '%';
      if (pctText) pctText.textContent = Math.round(pct) + '% achieved';
    }, 100);
  });

  // Update Legend
  Object.entries(CHANNELS).forEach(([id]) => {
    const el = page.querySelector(`#pie-pct-${id}`);
    if (el) el.textContent = totalNet > 0 ? ((ch[id].net / totalNet) * 100).toFixed(1) + '%' : '0.0%';
  });
}

function updateCharts(docs) {
  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const lblColor = '#64748b'; // slate-500

  // Aggregate by Date and Channel
  const dailyData = {}; // { date: { chId: netVal } }
  docs.forEach(d => {
    if (!dailyData[d.date]) {
      dailyData[d.date] = {};
      Object.keys(CHANNELS).forEach(k => dailyData[d.date][k] = 0);
    }
    if (dailyData[d.date][d.channelId] !== undefined) {
      dailyData[d.date][d.channelId] += getNet(d);
    }
  });

  const dates = Object.keys(dailyData).sort();

  // Build Datasets for each Channel
  const mainCtx = document.getElementById('chart-main');
  let datasets = [];

  if (mainCtx) {
    const ctx = mainCtx.getContext('2d');
    datasets = Object.entries(CHANNELS).map(([id, cfg]) => {
      // Create individual gradient for each channel
      const grad = ctx.createLinearGradient(0, 0, 0, 250);
      grad.addColorStop(0, cfg.color + '33'); // ~20% opacity
      grad.addColorStop(1, cfg.color + '00'); // 0% opacity

      return {
        label: cfg.label,
        data: dates.map(d => dailyData[d][id]),
        borderColor: cfg.color,
        backgroundColor: grad,
        borderWidth: 2.5,
        tension: 0.4,
        fill: true,
        pointRadius: dates.length > 15 ? 0 : 3,
        pointHoverRadius: 6,
        borderCapStyle: 'round',
        borderJoinStyle: 'round'
      };
    });
  }

  if (mainCtx) {
    if (chartMain) chartMain.destroy();
    chartMain = new Chart(mainCtx, {
      type: 'line',
      data: {
        labels: dates.map(d => d.slice(5)), // MM-DD
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 20,
              color: lblColor,
              font: { family: 'Plus Jakarta Sans', size: 10, weight: 'bold' }
            }
          },
          tooltip: {
            backgroundColor: isDark ? '#1e293b' : '#fff',
            titleColor: isDark ? '#fff' : '#1e293b',
            bodyColor: isDark ? '#cbd5e1' : '#64748b',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            borderWidth: 1,
            padding: 12,
            boxPadding: 6,
            usePointStyle: true,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ₱${ctx.parsed.y.toLocaleString()}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: lblColor, font: { family: 'Plus Jakarta Sans', size: 10 } }
          },
          y: {
            grid: { color: gridColor, drawBorder: false },
            ticks: {
              color: lblColor,
              font: { family: 'Plus Jakarta Sans', size: 10 },
              callback: v => '₱' + (v / 1000).toFixed(0) + 'K'
            }
          },
        },
      },
    });
  }

  // Donut
  const chanMap = {};
  Object.keys(CHANNELS).forEach(k => { chanMap[k] = 0; });
  docs.forEach(d => { if (chanMap[d.channelId] !== undefined) chanMap[d.channelId] += getNet(d); });

  const pieCtx = document.getElementById('chart-pie');
  if (pieCtx) {
    if (chartPie) chartPie.destroy();
    const pieData = Object.keys(CHANNELS).map(k => Math.max(chanMap[k], 0));
    chartPie = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: Object.values(CHANNELS).map(c => c.label),
        datasets: [{
          data: pieData.every(v => v === 0) ? [1, 1, 1, 1] : pieData,
          backgroundColor: Object.values(CHANNELS).map(c => c.color), borderWidth: 0, hoverOffset: 4
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } },
    });
  }

  // Mini Bar Chart (Last 7 days trend)
  const miniCtx = document.getElementById('chart-mini-trend');
  if (miniCtx) {
    if (chartMini) chartMini.destroy();
    const recentDates = dates.slice(-7);
    const recentValues = recentDates.map(d => dailyMap[d]);

    chartMini = new Chart(miniCtx, {
      type: 'bar',
      data: {
        labels: recentDates,
        datasets: [{
          data: recentValues,
          backgroundColor: 'rgba(34, 197, 94, 0.8)', // green-500 with opacity
          hoverBackgroundColor: 'rgba(21, 128, 61, 1)', // green-700
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.7
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false, min: 0 }
        },
        animation: { duration: 1000 }
      }
    });
  }
}

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
}
