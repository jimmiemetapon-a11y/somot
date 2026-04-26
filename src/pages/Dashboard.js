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
  dinein: { label: 'DINE-IN', kpi: 585000, color: '#60A5FA', bg: '#eff6ff', icon: 'id_VcqlrDV_1777185371840.svg' },
  online: { label: 'ONLINE', kpi: 135000, color: '#96588a', bg: '#fbf7fb', icon: 'WooCommerce.svg' }, // Woo Purple
  grabfood: { label: 'GRAB', kpi: 270000, color: '#34D399', bg: '#ecfdf5', icon: 'GrabFood.svg' },
  foodpanda: { label: 'FOOD PANDA', kpi: 135000, color: '#F472B6', bg: '#fdf2f8', icon: 'Foodpanda.svg' },
};

let chartMain = null, chartPie = null, chartMini = null;

function animateValue(el, end, formatter, duration = 800) {
  if (!el) return;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatter(end * eased);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function renderDashboard() {
  const page = document.createElement('div');
  page.className = 'p-5 space-y-5 page-enter relative min-h-full';

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  page.innerHTML = `
    <!-- Loading State -->
    <div id="db-loading" class="hidden absolute inset-0 bg-white/50 dark:bg-slate-950/50 backdrop-blur-[2px] z-20 flex items-center justify-center">
      <div class="flex items-center gap-3 bg-white dark:bg-slate-900 px-6 py-3 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800">
        <div class="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">Syncing Data...</p>
      </div>
    </div>

    <!-- Hero Stats Grid (Modern SaaS Style) -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
      
      <!-- Card 1: Total Net Revenue -->
      <div class="relative bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 text-white shadow-lg h-40 flex flex-col space-y-3 group">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white">
            <i data-lucide="wallet" class="w-4 h-4"></i>
          </div>
          <p class="text-white/80 text-[11px] font-extrabold tracking-tight">Total Net Revenue</p>
        </div>
        <div class="flex flex-col items-start text-left">
          <h2 id="hero-net" class="text-[22px] font-bold tracking-tight mb-0.5">₱0.00</h2>
          <div id="hero-net-trend-text" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold text-white">
             0% ↑
          </div>
        </div>
        <div class="w-full pt-1">
          <div class="w-full h-1 bg-white/20 rounded-full overflow-hidden mb-1.5">
            <div id="hero-net-bar" class="h-full bg-white transition-all duration-1000" style="width:0%"></div>
          </div>
          <p id="hero-net-pct" class="text-[9px] text-white/60 font-bold uppercase tracking-widest">0% of target</p>
        </div>
      </div>

      <!-- Card 2: Total Gross Sale -->
      <div class="relative bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-50 dark:border-slate-800/50 h-40 flex flex-col space-y-3 group">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 bg-slate-100 dark:bg-slate-800/50 rounded-full flex items-center justify-center text-slate-900 dark:text-white">
            <i data-lucide="trending-up" class="w-4 h-4"></i>
          </div>
          <p class="text-slate-400 text-[11px] font-extrabold tracking-tight">Total Gross Sale</p>
        </div>
        <div class="flex flex-col items-start text-left">
          <h2 id="hero-gross" class="text-[22px] font-bold text-slate-800 dark:text-white tracking-tight mb-0.5">₱0.00</h2>
          <div id="hero-gross-trend" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold">
            +0% ↑
          </div>
        </div>
      </div>

      <!-- Card 3: Total Deduction -->
      <div class="relative bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-50 dark:border-slate-800/50 h-40 flex flex-col space-y-3 group">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 bg-slate-100 dark:bg-slate-800/50 rounded-full flex items-center justify-center text-slate-900 dark:text-white">
            <i data-lucide="scissors" class="w-4 h-4"></i>
          </div>
          <p class="text-slate-400 text-[11px] font-extrabold tracking-tight">Total Deduction</p>
        </div>
        <div class="flex flex-col items-start text-left">
          <h2 id="hero-ded" class="text-[22px] font-bold text-slate-800 dark:text-white tracking-tight mb-0.5">₱0.00</h2>
          <p class="text-[10px] text-slate-400 font-medium">Platform fees applied</p>
        </div>
      </div>

      <!-- Card 4: Total Expenses -->
      <div class="relative bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-50 dark:border-slate-800/50 h-40 flex flex-col space-y-3 group">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 bg-slate-100 dark:bg-slate-800/50 rounded-full flex items-center justify-center text-slate-900 dark:text-white">
            <i data-lucide="receipt" class="w-4 h-4"></i>
          </div>
          <p class="text-slate-400 text-[11px] font-extrabold tracking-tight">Total Expenses</p>
        </div>
        <div class="flex flex-col items-start text-left">
          <h2 id="hero-expenses" class="text-[22px] font-bold text-slate-800 dark:text-white tracking-tight mb-0.5">₱0.00</h2>
          <p class="text-[10px] text-slate-400 font-medium">Fixed & Variable costs</p>
        </div>
      </div>

      <!-- Card 5: Net Profit -->
      <div class="relative bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-50 dark:border-slate-800/50 h-40 flex flex-col space-y-3 group">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 bg-slate-100 dark:bg-slate-800/50 rounded-full flex items-center justify-center text-slate-900 dark:text-white">
            <i data-lucide="dollar-sign" class="w-4 h-4"></i>
          </div>
          <p class="text-slate-400 text-[11px] font-extrabold tracking-tight">Net Profit / Loss</p>
        </div>
        <div class="flex flex-col items-start text-left">
          <h2 id="hero-profit" class="text-[22px] font-bold text-slate-800 dark:text-white tracking-tight mb-0.5">₱0.00</h2>
          <div id="hero-efficiency-text" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 text-[10px] font-bold">
            0% Margin
          </div>
        </div>
      </div>

    </div>

    <!-- Channel Cards Grid (Integrated Header Style - Top Aligned) -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      ${Object.entries(CHANNELS).map(([id, ch]) => `
        <div class="relative bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm border-2 border-transparent h-52 flex flex-col group transition-all cursor-pointer"
             onmouseover="this.style.borderColor='${ch.color}44'" 
             onmouseout="this.style.borderColor='transparent'">
          
          <!-- Integrated Header Banner (Top Aligned) -->
          <div class="px-4 py-3 flex justify-between items-start relative z-10" style="background: ${ch.bg}">
            <div class="flex-1">
              <p class="text-[11px] font-extrabold tracking-tight mb-1" style="color: ${ch.color}">${ch.label}</p>
              <h3 id="card-${id}-net" class="text-xl font-extrabold" style="color: ${ch.color}">₱0.00</h3>
            </div>
            <div class="w-16 h-8 flex items-center justify-end overflow-hidden transition-transform duration-300 group-hover:scale-110">
              <img src="/src/assets/${ch.icon}" class="w-full h-full object-contain object-right-top" alt="${ch.label}">
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
              <div class="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div id="card-${id}-bar" class="h-full rounded-full transition-all duration-1000" style="width:0%; background:${ch.color};"></div>
              </div>
              <div class="flex justify-between items-center mt-1.5">
                <span id="card-${id}-pct" class="text-[9px] font-bold text-gray-400 uppercase tracking-tight">0% achieved</span>
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 lg:col-span-2">
        <div class="mb-5">
          <p class="font-bold text-slate-800 dark:text-white text-sm font-nunito">Net Revenue Trend</p>
          <p class="text-xs text-slate-500 mt-0.5 font-nunito">Daily breakdown across all channels</p>
        </div>
        <div class="h-64"><canvas id="chart-main"></canvas></div>
      </div>
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
        <div class="mb-4">
          <p class="font-bold text-slate-800 dark:text-white text-sm font-nunito">Channel Mix</p>
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
    const getVal = (id) => document.getElementById(id);
    const branch = getVal('db-branch');
    const from = getVal('db-from');
    const to = getVal('db-to');
    const refresh = getVal('db-refresh');

    if (refresh && branch && from && to) {
      loadAndRender(page, branch.value, from.value, to.value);
      refresh.onclick = () => {
        loadAndRender(page, branch.value, from.value, to.value);
      };
    } else {
      // Fallback if header not ready (though it should be)
      loadAndRender(page, 'All Branches', firstDay, today);
    }

    if (window.lucide) window.lucide.createIcons();
  }, 0);

  return page;
}

// ── Data Handling ────────────────────────────────────────────────────────────
async function loadAndRender(page, branch, fromDate, toDate) {
  const loading = page.querySelector('#db-loading');
  loading.classList.remove('hidden');
  try {
    const docs = await fetchSalesData(branch, fromDate, toDate);

    // Fetch previous period data for trend comparison
    const d1 = new Date(fromDate + 'T00:00:00');
    const d2 = new Date(toDate + 'T00:00:00');
    const days = Math.round((d2 - d1) / 86400000) + 1;

    const prevToDate = new Date(d1);
    prevToDate.setDate(prevToDate.getDate() - 1);
    const prevFromDate = new Date(prevToDate);
    prevFromDate.setDate(prevFromDate.getDate() - days + 1);

    const prevTo = prevToDate.toISOString().split('T')[0];
    const prevFrom = prevFromDate.toISOString().split('T')[0];
    const prevDocs = await fetchSalesData(branch, prevFrom, prevTo);

    updateCards(page, docs, prevDocs);
    updateCharts(docs);
  } catch (err) {
    console.error('Dashboard error:', err);
  } finally {
    loading.classList.add('hidden');
  }
}

async function fetchSalesData(branch, fromDate, toDate) {
  const q = query(collection(db, 'daily_sales'), where('date', '>=', fromDate), where('date', '<=', toDate));
  const snap = await getDocs(q);
  const all = snap.docs.map(d => d.data());
  return branch === 'All Branches' ? all : all.filter(d => d.branchId === branch);
}

function getNet(d) { return d.financials ? d.financials.net : (d.net || 0); }
function getGross(d) { return d.financials ? d.financials.gross : (d.gross || 0); }
function getDed(d) { return d.financials ? d.financials.totalDeductions : (d.totalDeductions || 0); }

function updateCards(page, docs, prevDocs) {
  const fmt = n => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtNum = n => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let totalNet = 0, totalGross = 0, totalDed = 0;
  const ch = {};
  Object.keys(CHANNELS).forEach(k => { ch[k] = { net: 0, gross: 0, ded: 0 }; });

  docs.forEach(d => {
    const net = getNet(d), gross = getGross(d), ded = getDed(d);
    totalNet += net; totalGross += gross; totalDed += ded;
    if (ch[d.channelId]) { ch[d.channelId].net += net; ch[d.channelId].gross += gross; ch[d.channelId].ded += ded; }
  });

  // Update Card 1: Total Net
  animateValue(page.querySelector('#hero-net'), totalNet, fmt);

  const prevTotalNet = prevDocs ? prevDocs.reduce((sum, d) => sum + getNet(d), 0) : 0;
  const netTrendPct = prevTotalNet > 0 ? ((totalNet - prevTotalNet) / prevTotalNet) * 100 : (totalNet > 0 ? 100 : 0);
  const trendEl = page.querySelector('#hero-net-trend-text');
  if (trendEl) {
    const isUp = netTrendPct >= 0;
    trendEl.innerHTML = `${isUp ? '+' : ''}${netTrendPct.toFixed(1)}% ${isUp ? '↑' : '↓'}`;
    trendEl.className = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isUp ? 'bg-white/20 text-white' : 'bg-rose-500/20 text-white'}`;
  }

  // Update Card 2: Gross
  animateValue(page.querySelector('#hero-gross'), totalGross, fmt);
  const prevTotalGross = prevDocs ? prevDocs.reduce((sum, d) => sum + getGross(d), 0) : 0;
  const grossTrend = prevTotalGross > 0 ? ((totalGross - prevTotalGross) / prevTotalGross) * 100 : 0;
  const grossTrendEl = page.querySelector('#hero-gross-trend');
  if (grossTrendEl) {
    const isUp = grossTrend >= 0;
    grossTrendEl.innerHTML = `${isUp ? '+' : ''}${grossTrend.toFixed(1)}% ${isUp ? '↑' : '↓'}`;
    grossTrendEl.className = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isUp ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`;
  }

  // Update Card 3: Deduction
  animateValue(page.querySelector('#hero-ded'), totalDed, fmt);

  // Update Card 4: Expenses (Mocked to 15% for now)
  const totalExpenses = totalGross * 0.15;
  animateValue(page.querySelector('#hero-expenses'), totalExpenses, fmt);

  // Update Card 5: Profit
  const profit = totalNet - totalExpenses;
  const profitEl = page.querySelector('#hero-profit');
  animateValue(profitEl, profit, fmt);
  if (profitEl) profitEl.className = `text-[22px] font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`;

  // Update Margin Pill
  const efficiency = totalNet > 0 ? (profit / totalNet) * 100 : 0;
  const effText = page.querySelector('#hero-efficiency-text');
  if (effText) {
    effText.textContent = Math.round(efficiency) + '% Margin';
    effText.className = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${profit >= 0 ? 'bg-orange-500/10 text-orange-600' : 'bg-rose-500/10 text-rose-600'}`;
  }

  // Card 1 KPI bar
  const totalKpi = Object.values(CHANNELS).reduce((acc, c) => acc + c.kpi, 0);
  const kpiPct = totalKpi > 0 ? (totalNet / totalKpi) * 100 : 0;
  const heroBar = page.querySelector('#hero-net-bar');
  const heroPct = page.querySelector('#hero-net-pct');
  if (heroBar) heroBar.style.width = Math.min(kpiPct, 100) + '%';
  if (heroPct) heroPct.textContent = Math.round(kpiPct) + '% OF KPI';

  // Animate Channels
  Object.entries(CHANNELS).forEach(([id, cfg]) => {
    const data = ch[id];
    animateValue(page.querySelector(`#card-${id}-net`), data.net, fmt);
    animateValue(page.querySelector(`#card-${id}-gross`), data.gross, fmt);
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

  const dailyMap = {};
  docs.forEach(d => {
    if (!dailyMap[d.date]) dailyMap[d.date] = 0;
    dailyMap[d.date] += getNet(d);
  });
  const dates = Object.keys(dailyMap).sort();
  const values = dates.map(d => dailyMap[d]);

  // Main Bar/Line Chart (Now Green to match theme)
  const mainCtx = document.getElementById('chart-main');
  if (mainCtx) {
    if (chartMain) chartMain.destroy();
    const grad = mainCtx.getContext('2d').createLinearGradient(0, 0, 0, 250);
    grad.addColorStop(0, 'rgba(21,128,61,0.2)'); // green-700
    grad.addColorStop(1, 'rgba(21,128,61,0)');

    chartMain = new Chart(mainCtx, {
      type: 'line',
      data: {
        labels: dates.map(d => d.slice(5)), // MM-DD
        datasets: [{
          label: 'Net Revenue', data: values, borderColor: '#15803d', backgroundColor: grad,
          borderWidth: 2.5, tension: 0.4, fill: true, pointBackgroundColor: '#15803d',
          pointRadius: dates.length > 15 ? 0 : 3, pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: lblColor, font: { family: 'Plus Jakarta Sans', size: 11 } } },
          y: { grid: { color: gridColor }, ticks: { color: lblColor, font: { family: 'Plus Jakarta Sans', size: 11 }, callback: v => '₱' + (v / 1000).toFixed(0) + 'K' } },
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
