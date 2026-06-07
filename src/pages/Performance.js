import { db } from '../firebase.js';
import { collection, getDocs, query, where, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// Helper to get day name and check if it's weekend (Saturday = 6, Sunday = 0)
function getDayType(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  return (day === 0 || day === 6) ? 'Weekend' : 'Weekday';
}

const DEFAULT_BRANCH_KPIS = {
  'Pioneer Center': {
    all: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 21000, lunchWeekendTarget: 30000, afternoonWeekdayTarget: 10000, afternoonWeekendTarget: 11000, dinnerWeekdayTarget: 30000, dinnerWeekendTarget: 60000
    },
    dinein: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 9000, lunchWeekendTarget: 12000, afternoonWeekdayTarget: 3000, afternoonWeekendTarget: 3600, dinnerWeekdayTarget: 12600, dinnerWeekendTarget: 25000
    },
    grabfood: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 6000, lunchWeekendTarget: 9000, afternoonWeekdayTarget: 3600, afternoonWeekendTarget: 3900, dinnerWeekdayTarget: 10500, dinnerWeekendTarget: 20000
    },
    foodpanda: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 3000, lunchWeekendTarget: 4800, afternoonWeekdayTarget: 1800, afternoonWeekendTarget: 2100, dinnerWeekdayTarget: 4200, dinnerWeekendTarget: 10000
    },
    online: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 3000, lunchWeekendTarget: 4200, afternoonWeekdayTarget: 1599, afternoonWeekendTarget: 1398, dinnerWeekdayTarget: 2695, dinnerWeekendTarget: 5000
    }
  },
  'Catholic Trade': {
    all: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 21000, lunchWeekendTarget: 30000, afternoonWeekdayTarget: 10000, afternoonWeekendTarget: 11000, dinnerWeekdayTarget: 30000, dinnerWeekendTarget: 60000
    },
    dinein: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 9000, lunchWeekendTarget: 12000, afternoonWeekdayTarget: 3000, afternoonWeekendTarget: 3600, dinnerWeekdayTarget: 12600, dinnerWeekendTarget: 25000
    },
    grabfood: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 6000, lunchWeekendTarget: 9000, afternoonWeekdayTarget: 3600, afternoonWeekendTarget: 3900, dinnerWeekdayTarget: 10500, dinnerWeekendTarget: 20000
    },
    foodpanda: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 3000, lunchWeekendTarget: 4800, afternoonWeekdayTarget: 1800, afternoonWeekendTarget: 2100, dinnerWeekdayTarget: 4200, dinnerWeekendTarget: 10000
    },
    online: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 3000, lunchWeekendTarget: 4200, afternoonWeekdayTarget: 1599, afternoonWeekendTarget: 1398, dinnerWeekdayTarget: 2695, dinnerWeekendTarget: 5000
    }
  },
  'Unimart Capitol': {
    all: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 21000, lunchWeekendTarget: 30000, afternoonWeekdayTarget: 10000, afternoonWeekendTarget: 11000, dinnerWeekdayTarget: 30000, dinnerWeekendTarget: 60000
    },
    dinein: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 9000, lunchWeekendTarget: 12000, afternoonWeekdayTarget: 3000, afternoonWeekendTarget: 3600, dinnerWeekdayTarget: 12600, dinnerWeekendTarget: 25000
    },
    grabfood: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 6000, lunchWeekendTarget: 9000, afternoonWeekdayTarget: 3600, afternoonWeekendTarget: 3900, dinnerWeekdayTarget: 10500, dinnerWeekendTarget: 20000
    },
    foodpanda: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 3000, lunchWeekendTarget: 4800, afternoonWeekdayTarget: 1800, afternoonWeekendTarget: 2100, dinnerWeekdayTarget: 4200, dinnerWeekendTarget: 10000
    },
    online: {
      lunchStart: 7, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 23, dinnerEndWeekend: 2,
      lunchWeekdayTarget: 3000, lunchWeekendTarget: 4200, afternoonWeekdayTarget: 1599, afternoonWeekendTarget: 1398, dinnerWeekdayTarget: 2695, dinnerWeekendTarget: 5000
    }
  },
  'Ayala Cloverleaf': {
    all: {
      lunchStart: 10, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 21, dinnerEndWeekend: 22,
      lunchWeekdayTarget: 21000, lunchWeekendTarget: 30000, afternoonWeekdayTarget: 10000, afternoonWeekendTarget: 11000, dinnerWeekdayTarget: 30000, dinnerWeekendTarget: 60000
    },
    dinein: {
      lunchStart: 10, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 21, dinnerEndWeekend: 22,
      lunchWeekdayTarget: 9000, lunchWeekendTarget: 12000, afternoonWeekdayTarget: 3000, afternoonWeekendTarget: 3600, dinnerWeekdayTarget: 12600, dinnerWeekendTarget: 25000
    },
    grabfood: {
      lunchStart: 10, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 21, dinnerEndWeekend: 22,
      lunchWeekdayTarget: 6000, lunchWeekendTarget: 9000, afternoonWeekdayTarget: 3600, afternoonWeekendTarget: 3900, dinnerWeekdayTarget: 10500, dinnerWeekendTarget: 20000
    },
    foodpanda: {
      lunchStart: 10, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 21, dinnerEndWeekend: 22,
      lunchWeekdayTarget: 3000, lunchWeekendTarget: 4800, afternoonWeekdayTarget: 1800, afternoonWeekendTarget: 2100, dinnerWeekdayTarget: 4200, dinnerWeekendTarget: 10000
    },
    online: {
      lunchStart: 10, lunchEnd: 13, afternoonStart: 13, afternoonEnd: 16, dinnerStart: 16, dinnerEndWeekday: 21, dinnerEndWeekend: 22,
      lunchWeekdayTarget: 3000, lunchWeekendTarget: 4200, afternoonWeekdayTarget: 1599, afternoonWeekendTarget: 1398, dinnerWeekdayTarget: 2695, dinnerWeekendTarget: 5000
    }
  }
};

const CHANNELS = {
  all: 'All Channels (Net Sales)',
  dinein: 'Dine In',
  grabfood: 'GrabFood',
  foodpanda: 'FoodPanda',
  online: 'Online Order'
};

// Helper to sum actual sales in a window, supporting midnight crossing
function getWindowActual(hourlyNet, startHour, endHour) {
  let sum = 0;
  const cleanNum = v => typeof v === 'number' && !isNaN(v) ? v : 0;
  
  if (startHour <= endHour) {
    // Normal window (e.g. 07:00 to 13:00)
    for (let h = startHour; h < endHour; h++) {
      const hrKey = String(h).padStart(2, '0');
      sum += cleanNum(hourlyNet[hrKey]);
    }
  } else {
    // Midnight crossing window (e.g. 16:00 to 02:00)
    for (let h = startHour; h <= 23; h++) {
      const hrKey = String(h).padStart(2, '0');
      sum += cleanNum(hourlyNet[hrKey]);
    }
    for (let h = 0; h < endHour; h++) {
      const hrKey = String(h).padStart(2, '0');
      sum += cleanNum(hourlyNet[hrKey]);
    }
  }
  return sum;
}

export function renderPerformancePage(user) {
  const page = document.createElement('div');
  page.className = 'p-5 space-y-6 page-enter relative min-h-full';

  // State
  const DEFAULT_BRANCHES = ['Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf'];
  const isAdmin = user?.permissions?.isAdmin === true || ['jimmie.somot@gmail.com'].includes(user?.email);
  let allowedBranches = isAdmin ? [...DEFAULT_BRANCHES] : (user?.permissions?.allowedBranches || DEFAULT_BRANCHES).filter(b => b !== 'All Branches');

  if (isAdmin || allowedBranches.length > 1) {
    allowedBranches = ['All Branches', ...allowedBranches];
  }

  let selectedBranch = allowedBranches.includes('All Branches') ? 'All Branches' : (allowedBranches.includes('Pioneer Center') ? 'Pioneer Center' : allowedBranches[0] || 'Pioneer Center');
  let selectedChannel = 'all';
  
  const now = new Date();
  // Default to June 2026 for demonstration to match user's spreadsheet, otherwise current month/year
  let selectedMonth = now.getFullYear() === 2026 && now.getMonth() === 5 ? 6 : (now.getMonth() + 1);
  let selectedYear = now.getFullYear();

  let kpiRates = { ...DEFAULT_BRANCH_KPIS['Pioneer Center'].all };
  let loadedBranchKpis = {}; // Store loaded branch KPIs: { [branch]: { [channel]: kpiRates } }
  let dayTypeOverrides = {}; // { [branch]: { [dateStr]: 'Weekday' | 'Weekend' } }
  let salesDocs = []; // Array of sales docs for the month

  // Render Skeleton initially
  page.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div class="space-y-1">
        <h2 class="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Performance Dashboard</h2>
        <p class="text-xs text-slate-400 font-bold uppercase tracking-widest">Sales Progress Analysis Center</p>
      </div>
    </div>
    <div class="py-12 text-center">
      <div class="inline-block w-8 h-8 border-4 border-[#96588a] border-t-transparent rounded-full animate-spin mb-4"></div>
      <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading performance dashboard...</p>
    </div>
  `;

  async function loadData() {
    try {
      // 1. Fetch Hourly KPI Settings for loaded branches and channels
      const branchesToLoad = selectedBranch === 'All Branches'
        ? allowedBranches.filter(b => b !== 'All Branches')
        : [selectedBranch];

      const channelsToLoad = selectedChannel === 'all'
        ? ['dinein', 'grabfood', 'foodpanda', 'online']
        : [selectedChannel];

      loadedBranchKpis = {};

      await Promise.all(
        branchesToLoad.map(async (br) => {
          loadedBranchKpis[br] = {};
          await Promise.all(
            channelsToLoad.map(async (ch) => {
              const kpiDocId = `kpi_${br.replace(/\s+/g, '')}_${ch}`;
              const kpiSnap = await getDoc(doc(db, 'hourly_kpi_settings', kpiDocId));
              const branchDefaults = DEFAULT_BRANCH_KPIS[br] || DEFAULT_BRANCH_KPIS['Pioneer Center'];
              const channelDefaults = branchDefaults[ch] || branchDefaults['all'];

              if (kpiSnap.exists()) {
                loadedBranchKpis[br][ch] = { ...channelDefaults, ...kpiSnap.data() };
              } else {
                loadedBranchKpis[br][ch] = { ...channelDefaults };
              }
            })
          );
        })
      );

      // Compute kpiRates for reference target display on the page
      if (selectedBranch === 'All Branches' || selectedChannel === 'all') {
        const firstBr = branchesToLoad[0] || 'Pioneer Center';
        const firstCh = channelsToLoad[0] || 'dinein';
        const templateKpi = loadedBranchKpis[firstBr]?.[firstCh] || DEFAULT_BRANCH_KPIS[firstBr]?.[firstCh] || DEFAULT_BRANCH_KPIS['Pioneer Center'].all;

        kpiRates = {
          lunchStart: selectedBranch === 'All Branches' ? 'Branch Specific' : templateKpi.lunchStart,
          lunchEnd: selectedBranch === 'All Branches' ? 'Branch Specific' : templateKpi.lunchEnd,
          afternoonStart: selectedBranch === 'All Branches' ? 'Branch Specific' : templateKpi.afternoonStart,
          afternoonEnd: selectedBranch === 'All Branches' ? 'Branch Specific' : templateKpi.afternoonEnd,
          dinnerStart: selectedBranch === 'All Branches' ? 'Branch Specific' : templateKpi.dinnerStart,
          dinnerEndWeekday: selectedBranch === 'All Branches' ? 'Branch Specific' : templateKpi.dinnerEndWeekday,
          dinnerEndWeekend: selectedBranch === 'All Branches' ? 'Branch Specific' : templateKpi.dinnerEndWeekend,
          
          lunchWeekdayTarget: 0,
          lunchWeekendTarget: 0,
          afternoonWeekdayTarget: 0,
          afternoonWeekendTarget: 0,
          dinnerWeekdayTarget: 0,
          dinnerWeekendTarget: 0
        };

        branchesToLoad.forEach(br => {
          channelsToLoad.forEach(ch => {
            const brChKpi = loadedBranchKpis[br]?.[ch];
            if (brChKpi) {
              kpiRates.lunchWeekdayTarget += brChKpi.lunchWeekdayTarget || 0;
              kpiRates.lunchWeekendTarget += brChKpi.lunchWeekendTarget || 0;
              kpiRates.afternoonWeekdayTarget += brChKpi.afternoonWeekdayTarget || 0;
              kpiRates.afternoonWeekendTarget += brChKpi.afternoonWeekendTarget || 0;
              kpiRates.dinnerWeekdayTarget += brChKpi.dinnerWeekdayTarget || 0;
              kpiRates.dinnerWeekendTarget += brChKpi.dinnerWeekendTarget || 0;
            }
          });
        });
      } else {
        kpiRates = loadedBranchKpis[selectedBranch]?.[selectedChannel] || { ...DEFAULT_BRANCH_KPIS[selectedBranch]?.[selectedChannel] };
      }

      // 2. Fetch Day Type Overrides
      let overrideQuery;
      if (selectedBranch === 'All Branches') {
        overrideQuery = query(
          collection(db, 'day_type_overrides'),
          where('branchId', 'in', branchesToLoad)
        );
      } else {
        overrideQuery = query(
          collection(db, 'day_type_overrides'),
          where('branchId', '==', selectedBranch)
        );
      }
      
      const overrideSnap = await getDocs(overrideQuery);
      dayTypeOverrides = {};
      overrideSnap.forEach(d => {
        const data = d.data();
        const bId = data.branchId || selectedBranch;
        if (data.date && data.dayType) {
          if (!dayTypeOverrides[bId]) {
            dayTypeOverrides[bId] = {};
          }
          dayTypeOverrides[bId][data.date] = data.dayType;
        }
      });

      // 3. Fetch Sales Docs
      const startMonthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const endMonthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-31`;
      
      const salesQueryConstraints = [
        where('date', '>=', startMonthStr),
        where('date', '<=', endMonthStr)
      ];

      const salesSnap = await getDocs(query(collection(db, 'daily_sales'), ...salesQueryConstraints));
      const allDocs = salesSnap.docs.map(d => d.data());
      
      // Filter by branchesToLoad in-memory
      const branchFiltered = allDocs.filter(d => branchesToLoad.includes(d.branchId));
      
      if (selectedChannel !== 'all') {
        salesDocs = branchFiltered.filter(d => d.channelId === selectedChannel);
      } else {
        salesDocs = branchFiltered;
      }

      renderPageContent();
    } catch (err) {
      console.error('Error loading Performance data:', err);
      page.innerHTML = `
        <div class="p-6 rounded-[2rem] bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 text-center space-y-4">
          <p class="text-rose-600 dark:text-rose-400 font-bold text-sm">Failed to load Performance Dashboard: ${err.message}</p>
          <button id="btn-retry-perf" class="px-6 py-2.5 bg-gradient-to-r from-[#96588a] to-[#7a4671] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all">Retry</button>
        </div>
      `;
      const retryBtn = page.querySelector('#btn-retry-perf');
      if (retryBtn) retryBtn.onclick = () => loadData();
    }
  }

  function renderPageContent() {
    const isAyalaDineIn = selectedBranch === 'Ayala Cloverleaf' && selectedChannel === 'dinein';
    const isAyalaAll = selectedBranch === 'Ayala Cloverleaf' && selectedChannel === 'all';
    const showHourlyNA = isAyalaDineIn;
    
    const branchesToLoad = selectedBranch === 'All Branches'
      ? allowedBranches.filter(b => b !== 'All Branches')
      : [selectedBranch];

    // Prepare monthly dates
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const dateList = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const monthStr = String(selectedMonth).padStart(2, '0');
      const dateKey = `${selectedYear}-${monthStr}-${dayStr}`; // YYYY-MM-DD
      const dateDisplay = `${dayStr}/${monthStr}/${selectedYear}`; // DD/MM/YYYY
      dateList.push({ dateKey, dateDisplay });
    }

    // Map sales docs by date for easy lookup
    const salesByDate = {}; // { YYYY-MM-DD: [docs] }
    salesDocs.forEach(doc => {
      if (!salesByDate[doc.date]) salesByDate[doc.date] = [];
      salesByDate[doc.date].push(doc);
    });

    // Money formatter matching Excel sheet suffix " PHP" and rounding
    const fmtExcel = n => {
      return Math.round(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' PHP';
    };
    const cleanNum = v => typeof v === 'number' && !isNaN(v) ? v : 0;

    // Build the Monthly Report Data
    let cumulativeActualLunch = 0;
    let cumulativeActualAfternoon = 0;
    let cumulativeActualDinner = 0;
    let cumulativeActualDaily = 0;
    let cumulativeTargetDaily = 0;

    const tableRowsHTML = dateList.map(item => {
      const dateKey = item.dateKey;
      const dayTypeDefault = getDayType(dateKey);
      
      const displayDayType = selectedBranch === 'All Branches'
        ? (dayTypeOverrides[branchesToLoad[0]]?.[dateKey] || dayTypeDefault)
        : (dayTypeOverrides[selectedBranch]?.[dateKey] || dayTypeDefault);

      const docs = salesByDate[dateKey] || [];
      
      // Hourly Sales & Target Aggregation using dynamically configured branch time frames
      let actualLunch = 0;
      let actualAfternoon = 0;
      let actualDinner = 0;
      let actualDaily = 0;

      let targetLunch = 0;
      let targetAfternoon = 0;
      let targetDinner = 0;
      let targetDaily = 0;

      branchesToLoad.forEach(br => {
        const brDocs = docs.filter(d => d.branchId === br);
        const brDayType = dayTypeOverrides[br]?.[dateKey] || dayTypeDefault;
        
        // Target calculations
        let brLunchTarget = 0;
        let brAfternoonTarget = 0;
        let brDinnerTarget = 0;

        const channelsToLoad = selectedChannel === 'all'
          ? ['dinein', 'grabfood', 'foodpanda', 'online']
          : [selectedChannel];

        channelsToLoad.forEach(ch => {
          const brChKpi = loadedBranchKpis[br]?.[ch] || DEFAULT_BRANCH_KPIS[br]?.[ch] || DEFAULT_BRANCH_KPIS['Pioneer Center'].all;
          brLunchTarget += brDayType === 'Weekday' ? (brChKpi.lunchWeekdayTarget || 0) : (brChKpi.lunchWeekendTarget || 0);
          brAfternoonTarget += brDayType === 'Weekday' ? (brChKpi.afternoonWeekdayTarget || 0) : (brChKpi.afternoonWeekendTarget || 0);
          brDinnerTarget += brDayType === 'Weekday' ? (brChKpi.dinnerWeekdayTarget || 0) : (brChKpi.dinnerWeekendTarget || 0);
        });

        targetLunch += brLunchTarget;
        targetAfternoon += brAfternoonTarget;
        targetDinner += brDinnerTarget;
        targetDaily += (brLunchTarget + brAfternoonTarget + brDinnerTarget);

        if (brDocs.length > 0) {
          // Define hourly vs non-hourly channels for this branch
          const isAyala = br === 'Ayala Cloverleaf';
          const hourlyChannels = isAyala
            ? ['grabfood', 'foodpanda']
            : ['dinein', 'grabfood', 'foodpanda'];

          let brLunch = 0;
          let brAfternoon = 0;
          let brDinner = 0;
          
          const brChannelsMap = loadedBranchKpis[br] || {};
          const firstCh = Object.keys(brChannelsMap)[0] || 'dinein';
          const brKpi = brChannelsMap[firstCh] || DEFAULT_BRANCH_KPIS[br]?.all || DEFAULT_BRANCH_KPIS['Pioneer Center'].all;

          if (selectedChannel === 'all') {
            // Calculate hourly windows for channels that support it
            const hourlyDocs = brDocs.filter(d => hourlyChannels.includes(d.channelId));
            hourlyDocs.forEach(d => {
              const hourlyNet = d.hourlyNet || {};
              brLunch += getWindowActual(hourlyNet, brKpi.lunchStart, brKpi.lunchEnd);
              brAfternoon += getWindowActual(hourlyNet, brKpi.afternoonStart, brKpi.afternoonEnd);
              if (brDayType === 'Weekday') {
                brDinner += getWindowActual(hourlyNet, brKpi.dinnerStart, brKpi.dinnerEndWeekday);
              } else {
                brDinner += getWindowActual(hourlyNet, brKpi.dinnerStart, brKpi.dinnerEndWeekend);
              }
            });

            // Calculate online channel sales and distribute based on online targets
            const onlineDocs = brDocs.filter(d => d.channelId === 'online');
            const onlineNet = onlineDocs.reduce((sum, d) => sum + cleanNum(d.financials?.net || d.net), 0);
            if (onlineNet > 0) {
              const onlineKpi = loadedBranchKpis[br]?.['online'] || DEFAULT_BRANCH_KPIS[br]?.['online'] || DEFAULT_BRANCH_KPIS['Pioneer Center'].online;
              const tLunch = brDayType === 'Weekday' ? (onlineKpi.lunchWeekdayTarget || 0) : (onlineKpi.lunchWeekendTarget || 0);
              const tAfternoon = brDayType === 'Weekday' ? (onlineKpi.afternoonWeekdayTarget || 0) : (onlineKpi.afternoonWeekendTarget || 0);
              const tDinner = brDayType === 'Weekday' ? (onlineKpi.dinnerWeekdayTarget || 0) : (onlineKpi.dinnerWeekendTarget || 0);
              const tTotal = tLunch + tAfternoon + tDinner;

              let onlineLunch = 0;
              let onlineAfternoon = 0;
              let onlineDinner = 0;
              if (tTotal > 0) {
                onlineLunch = onlineNet * (tLunch / tTotal);
                onlineAfternoon = onlineNet * (tAfternoon / tTotal);
                onlineDinner = onlineNet * (tDinner / tTotal);
              } else {
                onlineLunch = onlineNet / 3;
                onlineAfternoon = onlineNet / 3;
                onlineDinner = onlineNet / 3;
              }

              brLunch += onlineLunch;
              brAfternoon += onlineAfternoon;
              brDinner += onlineDinner;
            }

            // Process Ayala Cloverleaf Dine-In: non-hourly, added directly to daily total (no hourly windows)
            let ayalaDineInNet = 0;
            if (isAyala) {
              const dineInDocs = brDocs.filter(d => d.channelId === 'dinein');
              ayalaDineInNet = dineInDocs.reduce((sum, d) => sum + cleanNum(d.financials?.net || d.net), 0);
            }

            actualLunch += brLunch;
            actualAfternoon += brAfternoon;
            actualDinner += brDinner;
            actualDaily += brLunch + brAfternoon + brDinner + ayalaDineInNet;

          } else if (selectedChannel === 'online') {
            // Online channel selected specifically - distribute daily total to hourly windows
            const onlineNet = brDocs.reduce((sum, d) => sum + cleanNum(d.financials?.net || d.net), 0);
            if (onlineNet > 0) {
              const onlineKpi = loadedBranchKpis[br]?.['online'] || DEFAULT_BRANCH_KPIS[br]?.['online'] || DEFAULT_BRANCH_KPIS['Pioneer Center'].online;
              const tLunch = brDayType === 'Weekday' ? (onlineKpi.lunchWeekdayTarget || 0) : (onlineKpi.lunchWeekendTarget || 0);
              const tAfternoon = brDayType === 'Weekday' ? (onlineKpi.afternoonWeekdayTarget || 0) : (onlineKpi.afternoonWeekendTarget || 0);
              const tDinner = brDayType === 'Weekday' ? (onlineKpi.dinnerWeekdayTarget || 0) : (onlineKpi.dinnerWeekendTarget || 0);
              const tTotal = tLunch + tAfternoon + tDinner;

              if (tTotal > 0) {
                brLunch = onlineNet * (tLunch / tTotal);
                brAfternoon = onlineNet * (tAfternoon / tTotal);
                brDinner = onlineNet * (tDinner / tTotal);
              } else {
                brLunch = onlineNet / 3;
                brAfternoon = onlineNet / 3;
                brDinner = onlineNet / 3;
              }
            }
            actualLunch += brLunch;
            actualAfternoon += brAfternoon;
            actualDinner += brDinner;
            actualDaily += onlineNet;

          } else {
            // Single hourly channel (or Ayala dinein)
            if (hourlyChannels.includes(selectedChannel)) {
              brDocs.forEach(d => {
                const hourlyNet = d.hourlyNet || {};
                brLunch += getWindowActual(hourlyNet, brKpi.lunchStart, brKpi.lunchEnd);
                brAfternoon += getWindowActual(hourlyNet, brKpi.afternoonStart, brKpi.afternoonEnd);
                if (brDayType === 'Weekday') {
                  brDinner += getWindowActual(hourlyNet, brKpi.dinnerStart, brKpi.dinnerEndWeekday);
                } else {
                  brDinner += getWindowActual(hourlyNet, brKpi.dinnerStart, brKpi.dinnerEndWeekend);
                }
              });
              actualLunch += brLunch;
              actualAfternoon += brAfternoon;
              actualDinner += brDinner;
              actualDaily += brLunch + brAfternoon + brDinner;
            } else {
              // Ayala Cloverleaf Dine-In
              const dailyNet = brDocs.reduce((sum, d) => sum + cleanNum(d.financials?.net || d.net), 0);
              actualDaily += dailyNet;
            }
          }
        }
      });

      // KPI Percentage
      const kpiPct = targetDaily > 0 ? (actualDaily / targetDaily) * 100 : 0;
      const hasActualSales = docs.length > 0;

      // Cumulative calculations (only add to sum if there are actual sales / data imported for this date)
      if (hasActualSales) {
        cumulativeActualLunch += actualLunch;
        cumulativeActualAfternoon += actualAfternoon;
        cumulativeActualDinner += actualDinner;
        cumulativeActualDaily += actualDaily;
      }
      cumulativeTargetDaily += targetDaily;

      // Color coding styling for KPI (%) - matching spreadsheet colors
      const kpiStyleClass = kpiPct >= 100 ? 'excel-kpi-good' : 'excel-kpi-bad';
      const formattedKpiPct = `${kpiPct.toFixed(1)}%`;

      // Select dynamic inline styling based on Day Type
      const selectStyle = displayDayType === 'Weekday'
        ? 'background-color: #e2f0d9; color: #385723; border: none;'
        : 'background-color: #ddebf7; color: #1f4e78; border: none;';

      const isLockedMode = selectedBranch === 'All Branches' || selectedChannel === 'all';

      return `
        <tr class="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-all" data-date="${dateKey}">
          <td class="px-2 py-1 text-center font-bold font-nunito ${kpiStyleClass}">
             ${formattedKpiPct}
          </td>
          <td class="px-2 py-1 text-center text-slate-800 dark:text-white font-mono">
             ${item.dateDisplay}
          </td>
          <td class="px-2 py-1 text-center">
             <select class="day-type-select font-bold text-[9px] uppercase px-2 py-0.5 rounded outline-none transition-all text-center" 
                     style="${selectStyle}"
                     data-date="${dateKey}"
                     ${isLockedMode ? 'disabled' : ''}>
                <option value="Weekday" ${displayDayType === 'Weekday' ? 'selected' : ''}>Weekday</option>
                <option value="Weekend" ${displayDayType === 'Weekend' ? 'selected' : ''}>Weekend</option>
             </select>
          </td>
          <td class="px-2 py-1 text-right text-slate-700 dark:text-slate-300 font-mono">
             ${showHourlyNA ? '<span class="text-slate-400 italic">N/A</span>' : fmtExcel(actualLunch)}
          </td>
          <td class="px-2 py-1 text-right text-slate-700 dark:text-slate-300 font-mono">
             ${showHourlyNA ? '<span class="text-slate-400 italic">N/A</span>' : fmtExcel(actualAfternoon)}
          </td>
          <td class="px-2 py-1 text-right text-slate-700 dark:text-slate-300 font-mono">
             ${showHourlyNA ? '<span class="text-slate-400 italic">N/A</span>' : fmtExcel(actualDinner)}
          </td>
          <td class="px-2 py-1 text-right text-slate-900 dark:text-white font-black font-mono" style="background-color: rgba(150,88,138, 0.02)">
             ${fmtExcel(actualDaily)}
          </td>
          <td class="px-2 py-1 text-right text-slate-500 dark:text-slate-400 font-mono">
             ${fmtExcel(targetDaily)}
          </td>
        </tr>
      `;
    }).join('');

    const monthlyKpiPct = cumulativeTargetDaily > 0 ? (cumulativeActualDaily / cumulativeTargetDaily) * 100 : 0;
    const monthlyKpiClass = monthlyKpiPct >= 100 ? 'excel-kpi-good' : 'excel-kpi-bad';

    const managerName = user?.displayName || 'Jimmie';
    const reportTitleMonthYear = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
      .format(new Date(selectedYear, selectedMonth - 1, 1)).toUpperCase();

    // Helper to format hour ranges nicely (e.g. 7, 13 -> 07:00 - 13:00)
    const fmtHr = h => typeof h === 'number' ? String(h).padStart(2, '0') + ':00' : h;

    // Generate hour select options for the drawer
    const getHourOptions = currentVal => {
      return Array.from({ length: 24 }, (_, i) => {
        const display = String(i).padStart(2, '0') + ':00';
        return `<option value="${i}" ${i === currentVal ? 'selected' : ''}>${display}</option>`;
      }).join('');
    };

    // Page DOM layout with custom Excel styling classes overrides
    page.innerHTML = `
      <style>
        .excel-sheet {
          background-color: #ffffff;
          color: #333333;
          font-family: 'Segoe UI', Calibri, Arial, sans-serif;
          padding: 24px;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.02), 0 4px 6px -2px rgba(0, 0, 0, 0.01);
        }
        .dark .excel-sheet {
          background-color: #161616;
          color: #e2e8f0;
          border: 1px solid #2d2d2d;
        }
        
        .excel-table-container {
          border-radius: 1rem;
          overflow: hidden;
          border: none;
        }
        
        .excel-table {
          border-collapse: separate;
          border-spacing: 0;
          width: 100%;
          border: none;
          background-color: #ffffff;
        }
        .dark .excel-table {
          background-color: #141414;
        }
        
        .excel-table th {
          border: none;
          font-size: 11px;
          padding: 10px 14px;
          text-align: center;
          font-weight: bold;
        }

        .excel-th-primary {
          background-color: #1b331b;
          color: #ffffff;
        }
        .dark .excel-th-primary {
          background-color: #0c1f0c;
          color: #e2e8f0;
        }

        .excel-th-secondary {
          background-color: #254525;
          color: #ffffff;
        }
        .dark .excel-th-secondary {
          background-color: #132c13;
          color: #e2e8f0;
        }

        .excel-table td {
          border: none;
          font-size: 11px;
          padding: 8px 12px;
          vertical-align: middle;
        }

        .excel-table tr:nth-child(even) td {
          background-color: #f6f9f6;
        }
        .dark .excel-table tr:nth-child(even) td {
          background-color: #1a1e1a;
        }
        .excel-table tr:nth-child(odd) td {
          background-color: #ffffff;
        }
        .dark .excel-table tr:nth-child(odd) td {
          background-color: #141414;
        }

        .excel-kpi-bad {
          background-color: #fadbd8 !important;
          color: #922b21 !important;
        }
        .dark .excel-kpi-bad {
          background-color: #582421 !important;
          color: #f5b7b1 !important;
        }

        .excel-kpi-good {
          background-color: #d5f5e3 !important;
          color: #196f3d !important;
        }
        .dark .excel-kpi-good {
          background-color: #183e29 !important;
          color: #abebc6 !important;
        }

        .excel-total-row th {
          background-color: #2e542e;
          color: #ffffff;
          font-weight: 900;
          font-size: 11px;
          padding: 10px 14px;
          border: none;
        }
        .dark .excel-total-row th {
          background-color: #163316;
          border: none;
        }
        .excel-total-row th.excel-kpi-bad {
          background-color: #2e542e !important;
          color: #ff9e9e !important;
        }
        .dark .excel-total-row th.excel-kpi-bad {
          background-color: #163316 !important;
          color: #f5b7b1 !important;
        }
        .excel-total-row th.excel-kpi-good {
          background-color: #2e542e !important;
          color: #a3ffa3 !important;
        }
        .dark .excel-total-row th.excel-kpi-good {
          background-color: #163316 !important;
          color: #abebc6 !important;
        }

        .excel-minimal-select {
          border: none;
          background: transparent;
          padding: 2px 18px 2px 4px;
          font-weight: 800;
          color: inherit;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          font-family: inherit;
          font-size: inherit;
          text-transform: uppercase;
          border-bottom: 1px dashed #7a9c7a;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e");
          background-repeat: no-repeat;
          background-position: right center;
          background-size: 8px;
        }
        .dark .excel-minimal-select {
          border-bottom: 1px dashed #555555;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e");
        }
        
        .excel-minimal-btn {
          border: none;
          background: transparent;
          padding: 2px 4px;
          font-weight: bold;
          font-size: 11px;
          text-transform: uppercase;
          color: #96588a;
          cursor: pointer;
          border-bottom: 1px dashed #96588a;
          font-family: inherit;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: all 0.2s;
        }
        .excel-minimal-btn:hover {
          color: #7a4671;
          border-bottom-style: solid;
        }
        .dark .excel-minimal-btn {
          color: #c78ab9;
          border-bottom-color: #c78ab9;
        }
      </style>

      <!-- Ayala / All Branches Warning Banners -->
      ${isAyalaDineIn ? `
        <div class="card-stagger flex items-center gap-4 p-4 rounded-2xl border border-amber-200 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 relative z-10" style="animation-delay: 0.1s">
          <i data-lucide="alert-triangle" class="w-5 h-5 shrink-0"></i>
          <p class="text-xs font-bold uppercase tracking-wide">Ayala Cloverleaf Dine-In data does not contain an hourly breakdown. Only the daily totals are available. Hourly windows are marked as N/A.</p>
        </div>
      ` : ''}
      ${isAyalaAll ? `
        <div class="card-stagger flex items-center gap-4 p-4 rounded-2xl border border-amber-200 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 relative z-10" style="animation-delay: 0.1s">
          <i data-lucide="alert-triangle" class="w-5 h-5 shrink-0"></i>
          <p class="text-xs font-bold uppercase tracking-wide">Ayala Cloverleaf Dine-In hourly data is not available. Dine-In sales are excluded from the Hourly Window columns, but are included in the Total Daily Revenue.</p>
        </div>
      ` : ''}
      ${selectedBranch === 'All Branches' && (selectedChannel === 'dinein' || selectedChannel === 'all') ? `
        <div class="card-stagger flex items-center gap-4 p-4 rounded-2xl border border-amber-200 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 relative z-10" style="animation-delay: 0.1s">
          <i data-lucide="alert-triangle" class="w-5 h-5 shrink-0"></i>
          <p class="text-xs font-bold uppercase tracking-wide">Ayala Cloverleaf Dine-In hourly data is not available. Ayala's Dine-In sales are excluded from the Hourly Window columns, but are included in the Total Daily Revenue.</p>
        </div>
      ` : ''}
      ${selectedChannel === 'online' ? `
        <div class="card-stagger flex items-center gap-4 p-4 rounded-2xl border border-[#96588a]/30 bg-[#96588a]/5 dark:border-[#96588a]/20 dark:bg-[#96588a]/10 text-[#96588a] dark:text-purple-300 relative z-10" style="animation-delay: 0.1s">
          <i data-lucide="info" class="w-5 h-5 shrink-0"></i>
          <p class="text-xs font-bold uppercase tracking-wide">Online Order revenue has no hourly breakdown. It is automatically distributed to the hourly windows based on the target ratios.</p>
        </div>
      ` : ''}

      <!-- Clean Excel Sheet Panel -->
      <div class="excel-sheet card-stagger" style="animation-delay: 0.15s">
        <!-- Sheet Header Info with Title & Prepared By above divider -->
        <div class="mb-4 pb-4 border-b border-slate-100 dark:border-white/5">
          <h1 class="text-xl font-black text-slate-800 dark:text-white tracking-tight uppercase">
            SALES PROGRESS REPORT - ${reportTitleMonthYear}
          </h1>
          <p class="text-xs text-slate-500 dark:text-slate-400 font-bold mt-1">
             Branch: ${selectedBranch} &nbsp;&bull;&nbsp; Prepared by: ${managerName} (Sale Leader)
          </p>
        </div>
        
        <!-- Controls block below divider, left-aligned -->
        <div class="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-bold text-slate-600 dark:text-slate-300">
           <div class="flex items-center gap-1.5">
              <span>Branch:</span>
              <select id="perf-branch" class="excel-minimal-select text-xs font-bold text-slate-700 dark:text-slate-200">
                 ${allowedBranches.map(b => `<option value="${b}" ${selectedBranch === b ? 'selected' : ''}>${b}</option>`).join('')}
              </select>
           </div>
           
           <div class="flex items-center gap-1.5">
              <span>Channel:</span>
              <select id="perf-channel" class="excel-minimal-select text-xs font-extrabold text-[#96588a] dark:text-purple-400">
                 ${Object.entries(CHANNELS).map(([id, label]) => `<option value="${id}" ${selectedChannel === id ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
           </div>

           <div class="flex items-center gap-1.5">
              <span>Period:</span>
              <select id="perf-month" class="excel-minimal-select text-xs font-bold">
                 ${Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                   const mName = new Date(0, m - 1).toLocaleString('en-US', { month: 'short' });
                   return `<option value="${m}" ${selectedMonth === m ? 'selected' : ''}>${mName.toUpperCase()}</option>`;
                 }).join('')}
              </select>
              <select id="perf-year" class="excel-minimal-select text-xs font-bold">
                 ${[2025, 2026, 2027, 2028].map(y => `<option value="${y}" ${selectedYear === y ? 'selected' : ''}>${y}</option>`).join('')}
              </select>
           </div>

           ${selectedBranch !== 'All Branches' && selectedChannel !== 'all' ? `
           <button id="btn-edit-perf-kpi" class="excel-minimal-btn font-bold text-[#96588a] dark:text-purple-400">
              <i data-lucide="sliders" class="w-3.5 h-3.5"></i> Targets
           </button>
           ` : ''}
        </div>

        <!-- Reference KPI Target Table (Displays Custom Time Windows & Total Target Goals) -->
        <div class="mb-8">
           <h3 class="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Reference Time Frame Targets:</h3>
           <div class="max-w-xl excel-table-container shadow-sm rounded-2xl overflow-hidden">
             <table class="excel-table">
                <thead>
                   <tr>
                      <th class="excel-th-primary">Target Window</th>
                      <th class="excel-th-primary">Time Frame</th>
                      <th class="excel-th-primary">Weekday Target (Total)</th>
                      <th class="excel-th-primary">Weekend Target (Total)</th>
                   </tr>
                </thead>
                <tbody>
                   <tr class="font-bold">
                      <td>Lunch</td>
                      <td class="font-mono text-center">
                         ${selectedBranch === 'All Branches' ? 'Branch Specific' : `${fmtHr(kpiRates.lunchStart)} - ${fmtHr(kpiRates.lunchEnd)}`}
                      </td>
                      <td class="text-right font-mono">${fmtExcel(kpiRates.lunchWeekdayTarget)}</td>
                      <td class="text-right font-mono">${fmtExcel(kpiRates.lunchWeekendTarget)}</td>
                   </tr>
                   <tr class="font-bold">
                      <td>Afternoon</td>
                      <td class="font-mono text-center">
                         ${selectedBranch === 'All Branches' ? 'Branch Specific' : `${fmtHr(kpiRates.afternoonStart)} - ${fmtHr(kpiRates.afternoonEnd)}`}
                      </td>
                      <td class="text-right font-mono">${fmtExcel(kpiRates.afternoonWeekdayTarget)}</td>
                      <td class="text-right font-mono">${fmtExcel(kpiRates.afternoonWeekendTarget)}</td>
                   </tr>
                   <tr class="font-bold">
                      <td>Dinner/Night</td>
                      <td class="font-mono text-center">
                         ${selectedBranch === 'All Branches' ? 'Branch Specific' : `
                            ${fmtHr(kpiRates.dinnerStart)} - ${fmtHr(kpiRates.dinnerEndWeekday)} / ${fmtHr(kpiRates.dinnerEndWeekend)}
                         `}
                      </td>
                      <td class="text-right font-mono">${fmtExcel(kpiRates.dinnerWeekdayTarget)}</td>
                      <td class="text-right font-mono">${fmtExcel(kpiRates.dinnerWeekendTarget)}</td>
                   </tr>
                </tbody>
             </table>
           </div>
        </div>

        <!-- Main Progression Table -->
        <div class="overflow-x-auto custom-scrollbar rounded-2xl">
           <div class="excel-table-container shadow-sm border-none">
              <table class="excel-table">
                 <thead>
                    <tr>
                       <th class="excel-th-primary">KPI (%)</th>
                       <th class="excel-th-primary">Date</th>
                       <th class="excel-th-primary">Day Type</th>
                       <th class="excel-th-primary">Lunch</th>
                       <th class="excel-th-primary">Afternoon</th>
                       <th class="excel-th-primary">Dinner</th>
                       <th class="excel-th-primary">Total Daily Revenue</th>
                       <th class="excel-th-primary">Target KPI</th>
                    </tr>
                    
                    <!-- Cumulative Totals Row (Excel Header style) -->
                    <tr class="excel-total-row">
                       <th class="${monthlyKpiClass}">
                          ${monthlyKpiPct.toFixed(1)}%
                       </th>
                       <th class="font-black uppercase">MONTH TOTAL</th>
                       <th class="font-black uppercase text-center">—</th>
                       <th class="text-right font-mono">${showHourlyNA ? '<span class="text-slate-300 italic">N/A</span>' : fmtExcel(cumulativeActualLunch)}</th>
                       <th class="text-right font-mono">${showHourlyNA ? '<span class="text-slate-300 italic">N/A</span>' : fmtExcel(cumulativeActualAfternoon)}</th>
                       <th class="text-right font-mono">${showHourlyNA ? '<span class="text-slate-300 italic">N/A</span>' : fmtExcel(cumulativeActualDinner)}</th>
                       <th class="text-right font-mono">${fmtExcel(cumulativeActualDaily)}</th>
                       <th class="text-right font-mono">${fmtExcel(cumulativeTargetDaily)}</th>
                    </tr>
                 </thead>
                 <tbody>
                    ${tableRowsHTML}
                 </tbody>
              </table>
           </div>
        </div>
      </div>

      <!-- KPI setup Drawer (Allows configuration of custom hour bounds and Flat target numbers) -->
      <div id="perf-kpi-drawer" class="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-white dark:bg-[#141414] shadow-2xl z-[500] transform translate-x-full transition-transform duration-300 ease-out border-l border-slate-200 dark:border-white/5 flex flex-col">
         <div class="p-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shadow-sm">
            <div>
               <h3 class="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white">Configure Time Frames & KPI Targets</h3>
               <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">${selectedBranch} - ${CHANNELS[selectedChannel]}</p>
            </div>
            <button id="perf-kpi-drawer-close" class="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-slate-400 hover:text-slate-700 dark:hover:text-white">
               <i data-lucide="x" class="w-5 h-5"></i>
            </button>
         </div>
         
         <div class="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            <div class="px-4 py-3 mb-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider">
               Note: KPI targets are flat totals for the entire time frame duration (e.g. 21,000 PHP total for Lunch), NOT hourly rates.
            </div>

            <!-- Lunch Window -->
            <div class="space-y-4 rounded-2xl bg-slate-50/50 dark:bg-white/[0.01] p-4 border border-slate-100 dark:border-white/5">
               <h4 class="text-[10px] font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-blue-500"></span> Lunch Window
               </h4>
               <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-1">
                     <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Start Time</label>
                     <select id="inp-lunch-start" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-white">
                        ${getHourOptions(kpiRates.lunchStart)}
                     </select>
                  </div>
                  <div class="space-y-1">
                     <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">End Time</label>
                     <select id="inp-lunch-end" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-white">
                        ${getHourOptions(kpiRates.lunchEnd)}
                     </select>
                  </div>
                  <div class="space-y-1">
                     <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Weekday Target (Flat Total)</label>
                     <input type="number" id="inp-lunch-weekday" class="w-full px-4 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-white outline-none" value="${kpiRates.lunchWeekdayTarget || 0}">
                  </div>
                  <div class="space-y-1">
                     <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Weekend Target (Flat Total)</label>
                     <input type="number" id="inp-lunch-weekend" class="w-full px-4 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-white outline-none" value="${kpiRates.lunchWeekendTarget || 0}">
                  </div>
               </div>
            </div>

            <!-- Afternoon Window -->
            <div class="space-y-4 rounded-2xl bg-slate-50/50 dark:bg-white/[0.01] p-4 border border-slate-100 dark:border-white/5">
               <h4 class="text-[10px] font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-amber-500"></span> Afternoon Window
               </h4>
               <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-1">
                     <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Start Time</label>
                     <select id="inp-afternoon-start" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-white">
                        ${getHourOptions(kpiRates.afternoonStart)}
                     </select>
                  </div>
                  <div class="space-y-1">
                     <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">End Time</label>
                     <select id="inp-afternoon-end" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-white">
                        ${getHourOptions(kpiRates.afternoonEnd)}
                     </select>
                  </div>
                  <div class="space-y-1">
                     <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Weekday Target (Flat Total)</label>
                     <input type="number" id="inp-afternoon-weekday" class="w-full px-4 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-white outline-none" value="${kpiRates.afternoonWeekdayTarget || 0}">
                  </div>
                  <div class="space-y-1">
                     <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Weekend Target (Flat Total)</label>
                     <input type="number" id="inp-afternoon-weekend" class="w-full px-4 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-white outline-none" value="${kpiRates.afternoonWeekendTarget || 0}">
                  </div>
               </div>
            </div>

            <!-- Dinner Window -->
            <div class="space-y-4 rounded-2xl bg-slate-50/50 dark:bg-white/[0.01] p-4 border border-slate-100 dark:border-white/5">
               <h4 class="text-[10px] font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-purple-500"></span> Dinner Window
               </h4>
               <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-1 col-span-2">
                     <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Start Time</label>
                     <select id="inp-dinner-start" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-white">
                        ${getHourOptions(kpiRates.dinnerStart)}
                     </select>
                  </div>
                  <div class="space-y-1">
                     <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">End Time (Weekday)</label>
                     <select id="inp-dinner-end-weekday" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-white">
                        ${getHourOptions(kpiRates.dinnerEndWeekday)}
                     </select>
                  </div>
                  <div class="space-y-1">
                     <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">End Time (Weekend)</label>
                     <select id="inp-dinner-end-weekend" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-white">
                        ${getHourOptions(kpiRates.dinnerEndWeekend)}
                     </select>
                  </div>
                  <div class="space-y-1">
                     <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Weekday Target (Flat Total)</label>
                     <input type="number" id="inp-dinner-weekday" class="w-full px-4 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-white outline-none" value="${kpiRates.dinnerWeekdayTarget || 0}">
                  </div>
                  <div class="space-y-1">
                     <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Weekend Target (Flat Total)</label>
                     <input type="number" id="inp-dinner-weekend" class="w-full px-4 py-2 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-white outline-none" value="${kpiRates.dinnerWeekendTarget || 0}">
                  </div>
               </div>
            </div>
         </div>

         <div class="p-6 border-t border-slate-100 dark:border-white/5 shrink-0 bg-slate-50/50 dark:bg-black/20">
            <button id="btn-save-perf-kpi" class="w-full py-4 bg-gradient-to-r from-[#96588a] to-[#7a4671] text-white rounded-[1.2rem] text-[10px] font-black shadow-lg shadow-purple-500/20 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-3 uppercase tracking-[0.25em]">
               <i data-lucide="save" class="w-4 h-4"></i> Save Target configuration
            </button>
         </div>
      </div>
      
      <!-- Drawer Overlay -->
      <div id="perf-kpi-overlay" class="fixed inset-0 bg-slate-900/40 z-[490] opacity-0 pointer-events-none transition-opacity duration-300"></div>
    `;

    setTimeout(() => {
      bindEvents();
      if (window.lucide) window.lucide.createIcons();
    }, 100);
  }

  function bindEvents() {
    const branchSel = page.querySelector('#perf-branch');
    const channelSel = page.querySelector('#perf-channel');
    const monthSel = page.querySelector('#perf-month');
    const yearSel = page.querySelector('#perf-year');

    const handleFilterChange = () => {
      selectedBranch = branchSel.value;
      selectedChannel = channelSel.value;
      selectedMonth = parseInt(monthSel.value);
      selectedYear = parseInt(yearSel.value);
      
      // Re-trigger reload
      loadData();
    };

    if (branchSel) branchSel.onchange = handleFilterChange;
    if (channelSel) channelSel.onchange = handleFilterChange;
    if (monthSel) monthSel.onchange = handleFilterChange;
    if (yearSel) yearSel.onchange = handleFilterChange;

    // Day Type Select overrides listener
    page.querySelectorAll('.day-type-select').forEach(select => {
      select.onchange = async (e) => {
        if (selectedBranch === 'All Branches' || selectedChannel === 'all') return;

        const dateKey = select.dataset.date;
        const newDayType = select.value;

        // Optimistically update local cache
        if (!dayTypeOverrides[selectedBranch]) {
          dayTypeOverrides[selectedBranch] = {};
        }
        dayTypeOverrides[selectedBranch][dateKey] = newDayType;

        try {
          const docId = `override_${selectedBranch.replace(/\s+/g, '')}_${dateKey}`;
          await setDoc(doc(db, 'day_type_overrides', docId), {
            branchId: selectedBranch,
            date: dateKey,
            dayType: newDayType,
            updatedAt: serverTimestamp()
          });
          
          window.showToast(`Day type for ${dateKey} updated to ${newDayType}`, 'success');
          // Re-render only to reflect calculation change
          renderPageContent();
        } catch (err) {
          console.error('Error saving day type override:', err);
          window.showToast('Failed to save day type change.', 'error');
        }
      };
    });

    // Drawer Setup
    const openDrawerBtn = page.querySelector('#btn-edit-perf-kpi');
    const closeDrawerBtn = page.querySelector('#perf-kpi-drawer-close');
    const drawer = page.querySelector('#perf-kpi-drawer');
    const overlay = page.querySelector('#perf-kpi-overlay');
    const saveKpiBtn = page.querySelector('#btn-save-perf-kpi');

    const toggleDrawer = (open) => {
      if (open) {
        drawer.classList.remove('translate-x-full');
        overlay.classList.remove('opacity-0', 'pointer-events-none');
      } else {
        drawer.classList.add('translate-x-full');
        overlay.classList.add('opacity-0', 'pointer-events-none');
      }
    };

    if (openDrawerBtn) openDrawerBtn.onclick = () => toggleDrawer(true);
    if (closeDrawerBtn) closeDrawerBtn.onclick = () => toggleDrawer(false);
    if (overlay) overlay.onclick = () => toggleDrawer(false);

    if (saveKpiBtn) {
      saveKpiBtn.onclick = async () => {
        const payload = {
          lunchStart: parseInt(page.querySelector('#inp-lunch-start').value),
          lunchEnd: parseInt(page.querySelector('#inp-lunch-end').value),
          afternoonStart: parseInt(page.querySelector('#inp-afternoon-start').value),
          afternoonEnd: parseInt(page.querySelector('#inp-afternoon-end').value),
          dinnerStart: parseInt(page.querySelector('#inp-dinner-start').value),
          dinnerEndWeekday: parseInt(page.querySelector('#inp-dinner-end-weekday').value),
          dinnerEndWeekend: parseInt(page.querySelector('#inp-dinner-end-weekend').value),
          
          lunchWeekdayTarget: parseFloat(page.querySelector('#inp-lunch-weekday').value) || 0,
          lunchWeekendTarget: parseFloat(page.querySelector('#inp-lunch-weekend').value) || 0,
          afternoonWeekdayTarget: parseFloat(page.querySelector('#inp-afternoon-weekday').value) || 0,
          afternoonWeekendTarget: parseFloat(page.querySelector('#inp-afternoon-weekend').value) || 0,
          dinnerWeekdayTarget: parseFloat(page.querySelector('#inp-dinner-weekday').value) || 0,
          dinnerWeekendTarget: parseFloat(page.querySelector('#inp-dinner-weekend').value) || 0,
        };

        const originalText = saveKpiBtn.innerHTML;
        saveKpiBtn.disabled = true;
        saveKpiBtn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Saving...';

        try {
          const kpiDocId = `kpi_${selectedBranch.replace(/\s+/g, '')}_${selectedChannel}`;
          await setDoc(doc(db, 'hourly_kpi_settings', kpiDocId), {
            ...payload,
            branchId: selectedBranch,
            channelId: selectedChannel,
            updatedAt: serverTimestamp()
          });

          saveKpiBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Saved!';
          setTimeout(() => {
            saveKpiBtn.innerHTML = originalText;
            saveKpiBtn.disabled = false;
            if (window.lucide) window.lucide.createIcons();
            toggleDrawer(false);
            loadData(); // Reload report with new KPI rates
          }, 1000);
        } catch (err) {
          console.error('Error saving hourly KPIs:', err);
          window.showToast('Failed to save KPI settings', 'error');
          saveKpiBtn.innerHTML = 'Error';
          saveKpiBtn.disabled = false;
        }
      };
    }
  }

  // Load initial data
  loadData();

  return page;
}
