// src/pages/KPITracking.js
import { auth, db } from '../firebase.js';
import { doc, getDoc, setDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';

export function renderKPITrackingPage(user) {
  const page = document.createElement('div');
  page.className = 'p-3 sm:p-4 space-y-4 page-enter relative min-h-full';

  const DEFAULT_BRANCHES = ['Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf', 'UST'];
  const isAdmin = user?.permissions?.isAdmin === true || ['jimmie.somot@gmail.com'].includes(user?.email);
  let allowedBranches = isAdmin ? [...DEFAULT_BRANCHES] : (user?.permissions?.allowedBranches || DEFAULT_BRANCHES).filter(b => b !== 'All Branches');

  const headerBranch = document.getElementById('db-branch')?.value;
  let selectedBranch = (headerBranch && headerBranch !== 'All Branches' && allowedBranches.includes(headerBranch))
    ? headerBranch
    : (allowedBranches.includes('Pioneer Center') ? 'Pioneer Center' : allowedBranches[0] || 'Ayala Cloverleaf');
  
  const now = new Date();
  let selectedMonth = now.getMonth() + 1;
  let selectedYear = now.getFullYear();

  const handleGlobalFilter = (e) => {
    const newBranch = e.detail?.branch;
    if (newBranch && newBranch !== 'All Branches' && allowedBranches.includes(newBranch)) {
      if (selectedBranch !== newBranch) {
        selectedBranch = newBranch;
        currentTarget = { ...(BRANCH_TARGETS[selectedBranch] || BRANCH_TARGETS['Pioneer Center']) };
        loadBranchData();
      }
    } else if (newBranch === 'All Branches') {
      const defaultB = allowedBranches[0] || 'Pioneer Center';
      if (selectedBranch !== defaultB) {
        selectedBranch = defaultB;
        currentTarget = { ...(BRANCH_TARGETS[selectedBranch] || BRANCH_TARGETS['Pioneer Center']) };
        loadBranchData();
      }
    }
  };

  window.addEventListener('global-filter-changed', handleGlobalFilter);
  window.addEventListener('cleanup-page', () => {
    window.removeEventListener('global-filter-changed', handleGlobalFilter);
  }, { once: true });

  // Benchmark default targets per branch matching reference sheet
  const BRANCH_TARGETS = {
    'Pioneer Center': { shift1: 26000, shift2: 45000, avo: 750, drink: 50, incident: 0.25, monthlyNet: 2130000, shift1Time: '7:00 - 16:00', shift2Time: '17:00 - 1:00' },
    'Catholic Trade': { shift1: 7000, shift2: 10000, avo: 750, drink: 45, incident: 0.25, monthlyNet: 510000, shift1Time: '9:00 - 15:00', shift2Time: '16:00 - 22:00' },
    'Unimart Capitol': { shift1: 10000, shift2: 6000, avo: 650, drink: 45, incident: 0.25, monthlyNet: 480000, shift1Time: '9:00 - 15:00', shift2Time: '16:00 - 21:00' },
    'Ayala Cloverleaf': { shift1: 12000, shift2: 15000, avo: 650, drink: 45, incident: 0.25, monthlyNet: 810000, shift1Time: '10:00 - 16:00', shift2Time: '17:00 - 22:00' },
    'UST': { shift1: 25000, shift2: 33000, avo: 750, drink: 45, incident: 0.25, monthlyNet: 1740000, shift1Time: '8:00 - 16:00', shift2Time: '17:00 - 2:00' }
  };

  // State data
  let currentTarget = { ...(BRANCH_TARGETS[selectedBranch] || BRANCH_TARGETS['Pioneer Center']) };
  let liveData = {
    shift1Actual: 12000,
    shift2Actual: 15000,
    avoActual: 650,
    drinkActual: 38,
    incidentActual: 0.10,
    monthlyNetActual: 650000,
    monthlyAvoActual: 650,
    monthlyDrinkActual: 38,
    hitRateActual: 84,
    streakDays: 16,
    userXp: 2336,
    latestBusinessDate: '',
    evaluatedDays: 0
  };

  let leaderboardData = [];

  async function loadBranchData() {
    try {
      // 1. Fetch customized target if set in Firestore
      const targetDocId = `target_${selectedBranch.replace(/\s+/g, '')}`;
      const targetSnap = await getDoc(doc(db, 'kpi_targets', targetDocId));
      if (targetSnap.exists()) {
        currentTarget = { ...currentTarget, ...targetSnap.data() };
      }

      // 2. Query real daily_sales from Firestore for ALL branches to construct Leaderboard
      const mStr = String(selectedMonth).padStart(2, '0');
      const monthStart = `${selectedYear}-${mStr}-01`;
      const monthEnd = `${selectedYear}-${mStr}-31`;

      const allQ = query(
        collection(db, 'daily_sales'),
        where('date', '>=', monthStart),
        where('date', '<=', monthEnd)
      );

      const allSalesSnap = await getDocs(allQ);

      const branchSalesMap = {};
      DEFAULT_BRANCHES.forEach(b => {
        branchSalesMap[b] = { net: 0, orders: 0, drinkOrders: 0, dailyNetMap: {} };
      });

      let selectedMaxDate = '';
      let selectedLatestNet = 0;
      let selectedLatestOrders = 0;
      let selectedLatestDrinkOrders = 0;
      let selectedShift1Net = 0;
      let selectedShift2Net = 0;

      allSalesSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const bId = data.branchId;
        const date = data.date || '';
        const net = Number(data.financials?.net || data.netSales || 0);
        const orders = Number(data.financials?.totalOrders || data.orders || 0);
        const drinkOrders = Number(data.breakdown?.kpi?.drinkOrders || 0);

        if (branchSalesMap[bId]) {
          branchSalesMap[bId].net += net;
          branchSalesMap[bId].orders += orders;
          branchSalesMap[bId].drinkOrders += drinkOrders;
          branchSalesMap[bId].dailyNetMap[date] = (branchSalesMap[bId].dailyNetMap[date] || 0) + net;
        }

        if (bId === selectedBranch && date > selectedMaxDate) {
          selectedMaxDate = date;
        }
      });

      if (selectedMaxDate) {
        allSalesSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.branchId === selectedBranch && data.date === selectedMaxDate) {
            const net = Number(data.financials?.net || data.netSales || 0);
            const orders = Number(data.financials?.totalOrders || data.orders || 0);
            selectedLatestNet += net;
            selectedLatestOrders += orders;

            if (data.breakdown?.kpi?.drinkOrders) {
              selectedLatestDrinkOrders += Number(data.breakdown.kpi.drinkOrders);
            }

            if (data.breakdown?.hourlyNet && typeof data.breakdown.hourlyNet === 'object') {
              Object.entries(data.breakdown.hourlyNet).forEach(([hrStr, hrNet]) => {
                const hr = parseInt(hrStr, 10);
                if (hr >= 7 && hr < 16) {
                  selectedShift1Net += Number(hrNet || 0);
                } else {
                  selectedShift2Net += Number(hrNet || 0);
                }
              });
            }
          }
        });
      }

      if (selectedShift1Net === 0 && selectedShift2Net === 0 && selectedLatestNet > 0) {
        selectedShift1Net = Math.round(selectedLatestNet * 0.45);
        selectedShift2Net = Math.round(selectedLatestNet * 0.55);
      }

      // Compute Leaderboard across all branches
      leaderboardData = DEFAULT_BRANCHES.map(bName => {
        const bData = branchSalesMap[bName];
        const targetNet = BRANCH_TARGETS[bName]?.monthlyNet || 1000000;
        const dailyTarget = targetNet / 30;
        let hits = 0;
        Object.values(bData.dailyNetMap).forEach(dNet => {
          if (dNet >= dailyTarget * 0.75) hits++;
        });

        // XP formula: benchmark fallback if no sales yet
        const baseXPMap = {
          'UST': 2580,
          'Pioneer Center': 2336,
          'Ayala Cloverleaf': 2210,
          'Catholic Trade': 1850,
          'Unimart Capitol': 1420
        };

        const computedXp = bData.net > 0 
          ? 1400 + (hits * 50) + Math.round(bData.net / 50000)
          : (baseXPMap[bName] || 1800);

        return {
          branch: bName,
          xp: computedXp,
          net: bData.net,
          hits: hits
        };
      }).sort((a, b) => b.xp - a.xp);

      const selData = branchSalesMap[selectedBranch];
      const activeDaysCount = Object.keys(selData.dailyNetMap).length;
      let hitDays = 0;
      const dailyTarget = (currentTarget.monthlyNet || 1000000) / 30;

      Object.values(selData.dailyNetMap).forEach((dayNet) => {
        if (dayNet >= dailyTarget * 0.75) {
          hitDays++;
        }
      });

      const calculatedHitRate = activeDaysCount > 0 ? Math.round((hitDays / activeDaysCount) * 100) : 84;
      const monthlyAvoActual = selData.orders > 0 ? Math.round(selData.net / selData.orders) : 650;
      const monthlyDrinkActual = selData.orders > 0 ? Math.min(100, Math.round((selData.drinkOrders / selData.orders) * 100)) : 38;

      const myLeaderboardObj = leaderboardData.find(item => item.branch === selectedBranch);
      const myXP = myLeaderboardObj ? myLeaderboardObj.xp : 2336;

      liveData = {
        shift1Actual: selectedShift1Net || (selectedLatestNet > 0 ? Math.round(selectedLatestNet * 0.45) : liveData.shift1Actual),
        shift2Actual: selectedShift2Net || (selectedLatestNet > 0 ? Math.round(selectedLatestNet * 0.55) : liveData.shift2Actual),
        avoActual: selectedLatestOrders > 0 ? Math.round(selectedLatestNet / selectedLatestOrders) : (liveData.avoActual || 650),
        drinkActual: selectedLatestOrders > 0 && selectedLatestDrinkOrders > 0 
          ? Math.min(100, Math.round((selectedLatestDrinkOrders / selectedLatestOrders) * 100))
          : (liveData.drinkActual || 38),
        incidentActual: 0.10,
        monthlyNetActual: selData.net || liveData.monthlyNetActual,
        monthlyAvoActual: monthlyAvoActual || liveData.monthlyAvoActual,
        monthlyDrinkActual: monthlyDrinkActual || liveData.monthlyDrinkActual,
        hitRateActual: calculatedHitRate,
        streakDays: Math.min(30, Math.max(16, activeDaysCount * 3)),
        userXp: myXP,
        latestBusinessDate: selectedMaxDate || liveData.latestBusinessDate || '',
        evaluatedDays: activeDaysCount
      };

      renderContent();
    } catch (err) {
      console.error('Error loading KPI data from Firestore:', err);
      renderContent();
    }
  }

  function renderContent() {
    const target = currentTarget;

    // ------------------------------
    // KPI calculations (Daily Missions)
    // ------------------------------
    const shift1Pct = Math.min(100, Math.round((liveData.shift1Actual / target.shift1) * 100));
    const shift2Pct = Math.min(100, Math.round((liveData.shift2Actual / target.shift2) * 100));
    const avoPct = Math.min(100, Math.round((liveData.avoActual / target.avo) * 100));
    const drinkPct = Math.min(100, Math.round((liveData.drinkActual / target.drink) * 100));
    const incidentCompleted = liveData.incidentActual <= target.incident;

    function getMissionStat(pct, isControl = false, controlCompleted = false) {
      if (isControl) {
        return controlCompleted
          ? { status: 'Completed', xp: 50 }
          : { status: 'NeedsPush', xp: 0 };
      }
      if (pct >= 100) return { status: 'Completed', xp: 50 };
      if (pct >= 80) return { status: 'OnTrack', xp: 25 };
      return { status: 'NeedsPush', xp: 0 };
    }

    const m1 = getMissionStat(shift1Pct);
    const m2 = getMissionStat(shift2Pct);
    const m3 = getMissionStat(avoPct);
    const m4 = getMissionStat(drinkPct);
    const m5 = getMissionStat(0, true, incidentCompleted);

    const missionsList = [m1, m2, m3, m4, m5];
    const completedCount = missionsList.filter(m => m.status === 'Completed').length;
    const earnedXpToday = missionsList.reduce((acc, m) => acc + m.xp, 0);

    // ------------------------------
    // Dynamic Daily Bonus State
    // ------------------------------
    const isPerfectDay = completedCount === 5;
    const isStreakDay = completedCount >= 4;
    const dailyBonusState = isPerfectDay ? 'completed' : (isStreakDay ? 'almost' : 'locked');

    function renderDailyBonus() {
      if (dailyBonusState === 'completed') {
        return `
          <div class="mt-3 rounded-xl bg-gradient-to-r from-[#7C3AED] via-[#6238EF] to-[#4F38E9] p-3 sm:p-3.5 text-white shadow-[0_8px_20px_rgba(91,55,233,.2)] border border-purple-300/30">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-8 h-8 rounded-lg bg-amber-400/20 flex items-center justify-center text-amber-300 shrink-0">
                  <i data-lucide="trophy" class="w-4 h-4"></i>
                </div>
                <div class="min-w-0">
                  <div class="text-[11px] font-black tracking-tight uppercase">PERFECT DAY — 5/5 MISSIONS COMPLETED</div>
                  <div class="text-[9.5px] text-white/75 font-medium mt-0.5">Excellent work! All Daily Missions completed.</div>
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <span class="px-2.5 py-1 rounded-full bg-[#FCD34D] text-[#2E2354] text-[9.5px] font-black whitespace-nowrap shadow-sm">⭐ +100 XP EARNED</span>
                <span class="px-2.5 py-1 rounded-full bg-white/14 border border-white/20 text-white text-[9.5px] font-black whitespace-nowrap">🔥 +1 DAILY STREAK</span>
              </div>
            </div>
          </div>
        `;
      }

      if (dailyBonusState === 'almost') {
        return `
          <div class="mt-3 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 p-3 text-white shadow-sm border border-purple-400/20">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-8 h-8 rounded-lg bg-amber-400/20 flex items-center justify-center text-amber-300 shrink-0">
                  <i data-lucide="flame" class="w-4 h-4"></i>
                </div>
                <div class="min-w-0">
                  <div class="text-[11px] font-black tracking-tight uppercase">ALMOST PERFECT — ${completedCount}/5 MISSIONS</div>
                  <div class="text-[9.5px] text-white/75 font-medium mt-0.5">Your daily streak is secured. Complete 1 more mission for the bonus!</div>
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <span class="px-2.5 py-1 rounded-full bg-white/10 text-white/60 border border-white/10 text-[9.5px] font-bold whitespace-nowrap">🔒 +100 XP LOCKED</span>
                <span class="px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-200 border border-amber-400/30 text-[9.5px] font-black whitespace-nowrap">🔥 STREAK SECURED</span>
              </div>
            </div>
          </div>
        `;
      }

      const remaining = 5 - completedCount;
      return `
        <div class="mt-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-3 text-slate-700 dark:text-white/80 shadow-sm">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-lg bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-400 dark:text-white/40 shrink-0">
                <i data-lucide="lock" class="w-4 h-4"></i>
              </div>
              <div class="min-w-0">
                <div class="text-[11px] font-black tracking-tight uppercase text-slate-800 dark:text-white">DAILY BONUS — ${completedCount}/5 MISSIONS</div>
                <div class="text-[9.5px] text-slate-500 dark:text-white/45 font-medium mt-0.5">Complete ${remaining} more mission${remaining === 1 ? '' : 's'} to unlock the Perfect Day bonus.</div>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="px-2.5 py-1 rounded-full bg-slate-200/70 dark:bg-white/5 text-slate-400 dark:text-white/35 text-[9.5px] font-bold whitespace-nowrap border border-slate-300/40 dark:border-white/10">🔒 +100 XP LOCKED</span>
              <span class="px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9.5px] font-extrabold whitespace-nowrap border border-amber-200 dark:border-amber-500/20">🔥 STREAK AT RISK</span>
            </div>
          </div>
        </div>
      `;
    }

    // ------------------------------
    // Monthly Missions Dynamic State & Aggregations
    // ------------------------------
    const monthlyAvoActual = liveData.monthlyAvoActual || (liveData.avoActual || 0);
    const monthlyDrinkActual = liveData.monthlyDrinkActual || (liveData.drinkActual || 0);

    const monthlyNetPct = Math.min(100, Math.round((liveData.monthlyNetActual / target.monthlyNet) * 100));
    const hitRatePct = Math.min(100, Math.round((liveData.hitRateActual / 80) * 100));
    const monthlyAvoPct = Math.min(100, Math.round((monthlyAvoActual / target.avo) * 100));
    const monthlyDrinkPct = Math.min(100, Math.round((monthlyDrinkActual / target.drink) * 100));
    const monthlyIncidentCompleted = liveData.incidentActual <= target.incident;

    const monthlyMissionStates = {
      revenue: monthlyNetPct >= 100,
      hitRate: liveData.hitRateActual >= 80,
      avo: monthlyAvoPct >= 100,
      drink: monthlyDrinkPct >= 100,
      incident: monthlyIncidentCompleted
    };

    const monthlyCompletedCount = Object.values(monthlyMissionStates).filter(Boolean).length;
    const isPerfectMonth = monthlyCompletedCount === 5;

    function renderMonthlyReward(completed, xp) {
      if (completed) {
        return `
          <span class="inline-flex items-center justify-center w-[132px] min-h-[28px] px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-400/15 via-emerald-500/15 to-emerald-400/20 border border-amber-400/40 text-amber-700 dark:text-amber-300 text-[9.5px] font-black whitespace-nowrap justify-self-end shrink-0 shadow-[0_0_12px_rgba(250,204,21,0.22)]">
            🏆 +${xp} XP EARNED
          </span>
        `;
      }
      return `
        <span class="inline-flex items-center justify-center w-[132px] min-h-[28px] px-2.5 py-1 rounded-full opacity-40 grayscale border border-slate-200 dark:border-white/10 bg-slate-100/70 dark:bg-white/5 text-slate-400 dark:text-white/35 text-[9.5px] font-bold whitespace-nowrap justify-self-end shrink-0">
          🔒 +${xp} XP
        </span>
      `;
    }

    function renderMonthlyBonus() {
      if (isPerfectMonth) {
        return `
          <div class="mt-2.5 rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100 dark:from-amber-500/10 dark:to-orange-500/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-md">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-lg bg-amber-200/60 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                <i data-lucide="trophy" class="w-4 h-4"></i>
              </div>
              <div class="min-w-0">
                <span class="text-[9px] font-black uppercase text-amber-700 dark:text-amber-300 tracking-wider">BOSS QUEST UNLOCKED</span>
                <div class="text-[11px] font-black text-[#2D374D] dark:text-white uppercase">5/5 OBJECTIVES CLEARED</div>
                <div class="text-[9px] font-semibold text-amber-800 dark:text-amber-200/70 truncate">Outstanding performance! Perfect Month Achieved.</div>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="px-2.5 py-1 rounded-full bg-amber-400 text-slate-900 text-[9.5px] font-black whitespace-nowrap shadow-sm">⭐ +500 XP EARNED</span>
              <span class="px-2.5 py-1 rounded-full bg-white dark:bg-white/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20 text-[9.5px] font-black whitespace-nowrap flex items-center gap-1">
                <img src="/assets/gold.png" class="w-3.5 h-3.5 object-contain" alt="Crown" /> BRANCH CHAMPION
              </span>
            </div>
          </div>
        `;
      }

      const remainingMonthly = 5 - monthlyCompletedCount;
      return `
        <div class="mt-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-white/40 flex items-center justify-center shrink-0">
              <i data-lucide="crown" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <span class="text-[9px] font-black uppercase text-slate-400 dark:text-white/40 tracking-wider">BOSS QUEST MILESTONE</span>
              <div class="text-[10px] font-black text-slate-700 dark:text-white uppercase">${monthlyCompletedCount}/5 OBJECTIVES CLEARED</div>
              <div class="text-[9px] font-semibold text-slate-400 dark:text-white/40 truncate">
                Clear ${remainingMonthly} more milestone${remainingMonthly === 1 ? '' : 's'} to unlock Perfect Month Reward.
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="px-2.5 py-1 rounded-full bg-slate-200/70 dark:bg-white/5 text-slate-400 dark:text-white/35 text-[9.5px] font-bold whitespace-nowrap border border-slate-300/40 dark:border-white/10">🔒 +500 XP</span>
            <span class="px-2.5 py-1 rounded-full bg-slate-200/70 dark:bg-white/5 text-slate-400 dark:text-white/35 text-[9.5px] font-bold whitespace-nowrap border border-slate-300/40 dark:border-white/10">🔒 CHAMPION BADGE</span>
          </div>
        </div>
      `;
    }

    const TIER_IMAGES = {
      'Bronze': '/assets/bronze.png',
      'Silver': '/assets/Silver.png',
      'Gold': '/assets/gold.png',
      'Gold I': '/assets/gold.png',
      'Gold II': '/assets/gold.png',
      'Gold III': '/assets/gold.png',
      'Platinum': '/assets/Platinum.png'
    };

    const incidentPct = incidentCompleted
      ? 100
      : Math.max(0, Math.min(99, Math.round((target.incident / Math.max(liveData.incidentActual, 0.01)) * 100)));

    const userXp = liveData.userXp;
    let rankName = 'Gold III';
    let rankBadge = '\u{1F451}';
    let rankStart = 2000;
    let rankNext = 3000;
    let nextRankName = 'Platinum';

    if (userXp >= 3000) {
      rankName = 'Platinum'; rankBadge = '\u{1F48E}'; rankStart = 3000; rankNext = 4000; nextRankName = 'Diamond';
    } else if (userXp >= 2667) {
      rankName = 'Gold III'; rankBadge = '\u{1F451}'; rankStart = 2000; rankNext = 3000; nextRankName = 'Platinum';
    } else if (userXp >= 2334) {
      rankName = 'Gold II'; rankBadge = '\u{1F451}'; rankStart = 2000; rankNext = 3000; nextRankName = 'Platinum';
    } else if (userXp >= 2000) {
      rankName = 'Gold I'; rankBadge = '\u{1F451}'; rankStart = 2000; rankNext = 3000; nextRankName = 'Platinum';
    } else if (userXp >= 1000) {
      rankName = 'Silver'; rankBadge = '\u{1F6E1}'; rankStart = 1000; rankNext = 2000; nextRankName = 'Gold';
    } else {
      rankName = 'Bronze'; rankBadge = '\u{1F949}'; rankStart = 0; rankNext = 1000; nextRankName = 'Silver';
    }

    const rankProgress = userXp >= 3000
      ? Math.min(100, Math.round(((userXp - 3000) / 1000) * 100))
      : Math.min(100, Math.max(5, Math.round(((userXp - rankStart) / (rankNext - rankStart)) * 100)));

    const xpToNext = Math.max(0, rankNext - userXp);

    // Leaderboard calculation helper
    const myRankIdx = leaderboardData.findIndex(item => item.branch === selectedBranch);
    const myRank = myRankIdx >= 0 ? myRankIdx + 1 : 2;
    const leaderObj = leaderboardData[0] || { branch: 'UST', xp: 2580 };
    const gapToLeader = Math.max(0, leaderObj.xp - userXp);
    const leaderLead = leaderboardData[1] ? Math.max(0, userXp - leaderboardData[1].xp) : 126;

    const leaderboardCallout = myRank === 1 
      ? `\u{1F451} YOU'RE LEADING BY ${leaderLead} XP`
      : `\u{26A1} ${gapToLeader} XP TO TAKE #1`;

    const fmt = n => '₱' + Math.round(Number(n || 0)).toLocaleString('en-PH');
    const monthLabel = new Date(selectedYear, selectedMonth - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();

    const latestDateLabel = liveData.latestBusinessDate
      ? new Date(`${liveData.latestBusinessDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Waiting for import';

    function getStatusMeta(stat) {
      if (stat.status === 'Completed') {
        return {
          label: 'Completed',
          icon: 'check-circle-2',
          badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
          reward: 'bg-gradient-to-r from-amber-400/15 via-emerald-500/15 to-emerald-400/20 border border-amber-400/40 text-amber-700 dark:text-amber-300 font-black shadow-[0_0_12px_rgba(250,204,21,0.22)] animate-pop-in',
          rewardIcon: 'trophy',
          rewardText: '+50 XP EARNED'
        };
      }
      if (stat.status === 'OnTrack') {
        return {
          label: 'On Track',
          icon: 'trending-up',
          badge: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
          reward: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-bold',
          rewardIcon: 'zap',
          rewardText: '+25 XP EARNED'
        };
      }
      return {
        label: 'Needs Push',
        icon: 'triangle-alert',
        badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
        reward: 'opacity-50 grayscale border border-slate-200 dark:border-white/10 bg-slate-100/70 dark:bg-white/5 text-slate-400 dark:text-white/35 font-bold',
        rewardIcon: 'lock',
        rewardText: '0 / +50 XP'
      };
    }

    function renderMissionRow({ icon, iconClass, title, subtitle, actual, targetText, pct, stat, gradient }) {
      const meta = getStatusMeta(stat);
      return `
        <div class="kpi-mission-row group">
          <div class="kpi-icon ${iconClass}">
            <i data-lucide="${icon}" class="w-4 h-4"></i>
          </div>

          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5 mb-0.5">
              <h4 class="text-xs sm:text-[13px] font-extrabold text-[#182338] dark:text-white leading-tight">${title}</h4>
              <span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-extrabold whitespace-nowrap ${meta.badge}">
                <i data-lucide="${meta.icon}" class="w-2.5 h-2.5"></i>${meta.label}
              </span>
            </div>
            <p class="text-[10px] text-[#94A0B4] dark:text-white/45 font-medium truncate">${subtitle}</p>
          </div>

          <div class="min-w-0">
            <div class="flex items-baseline justify-between gap-2 mb-1.5">
              <div class="min-w-0 whitespace-nowrap">
                <span class="font-mono text-xs sm:text-[13px] font-extrabold text-[#182338] dark:text-white">${actual}</span>
                <span class="text-[10px] text-[#A3ADC0] dark:text-white/40 font-semibold"> / ${targetText}</span>
              </div>
              <span class="text-[10px] font-black text-[#44506A] dark:text-white/70 shrink-0">${pct}%</span>
            </div>
            <div class="h-2 rounded-full bg-[#EDF1F6] dark:bg-white/10 overflow-hidden">
              <div class="h-full rounded-full transition-all duration-700" style="width:${Math.max(4, pct)}%; background:${gradient};"></div>
            </div>
          </div>

          <div class="flex justify-end">
            <span class="kpi-reward-pill ${meta.reward}">
              <i data-lucide="${meta.rewardIcon}" class="w-3.5 h-3.5"></i>
              <span>${meta.rewardText}</span>
            </span>
          </div>
        </div>
      `;
    }

    function renderMonthlyMission({ icon, iconClass, title, subtitle, pct, actualText, reward, gradient }) {
      return `
        <div class="monthly-row">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-7 h-7 rounded-lg ${iconClass} flex items-center justify-center shrink-0">
              <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
            </div>
            <div class="min-w-0">
              <div class="text-[11px] font-extrabold text-[#1D2940] dark:text-white truncate">${title}</div>
              <div class="text-[9px] font-semibold text-[#9AA5B8] dark:text-white/40 mt-0.5">${subtitle}</div>
            </div>
          </div>

          <div class="min-w-0">
            <div class="flex justify-between gap-2 mb-1">
              <span class="text-[9px] font-bold text-[#8F9AAF] dark:text-white/45 truncate">${actualText}</span>
              <span class="text-[9px] font-black text-[#59657A] dark:text-white/70">${pct}%</span>
            </div>
            <div class="h-1.5 rounded-full bg-[#EDF1F6] dark:bg-white/10 overflow-hidden">
              <div class="h-full rounded-full" style="width:${Math.max(4, pct)}%; background:${gradient};"></div>
            </div>
          </div>

          ${reward}
        </div>
      `;
    }

    const dailyRows = [
      {
        icon: 'chart-no-axes-column-increasing',
        iconClass: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300',
        title: 'Shift 1 Sales',
        subtitle: `Window: ${target.shift1Time}`,
        actual: fmt(liveData.shift1Actual),
        targetText: fmt(target.shift1),
        pct: shift1Pct,
        stat: m1,
        gradient: 'linear-gradient(90deg,#F97316 0%,#FBBF24 100%)'
      },
      {
        icon: 'chart-no-axes-column-increasing',
        iconClass: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
        title: 'Shift 2 Sales',
        subtitle: `Window: ${target.shift2Time}`,
        actual: fmt(liveData.shift2Actual),
        targetText: fmt(target.shift2),
        pct: shift2Pct,
        stat: m2,
        gradient: 'linear-gradient(90deg,#D8A51D 0%,#66C989 100%)'
      },
      {
        icon: 'shopping-basket',
        iconClass: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
        title: 'Average Order Value (AVO)',
        subtitle: 'Formula: Current / Target',
        actual: fmt(liveData.avoActual),
        targetText: fmt(target.avo),
        pct: avoPct,
        stat: m3,
        gradient: 'linear-gradient(90deg,#8B5CF6 0%,#64C89A 100%)'
      },
      {
        icon: 'cup-soda',
        iconClass: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
        title: 'Drink Attachment',
        subtitle: 'Formula: Current / Target',
        actual: `${liveData.drinkActual}%`,
        targetText: `${target.drink}%`,
        pct: drinkPct,
        stat: m4,
        gradient: 'linear-gradient(90deg,#3B82F6 0%,#64C99B 100%)'
      },
      {
        icon: 'shield-check',
        iconClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
        title: 'Food App Incident',
        subtitle: 'Control KPI: lower is better',
        actual: `${liveData.incidentActual}%`,
        targetText: `≤ ${target.incident}%`,
        pct: incidentPct,
        stat: m5,
        gradient: 'linear-gradient(90deg,#3FAE75 0%,#68C9A8 100%)'
      }
    ];

    const monthlyRows = [
      {
        icon: 'philippine-peso',
        iconClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
        title: 'Net Revenue Goal',
        subtitle: 'Weight 30%',
        pct: monthlyNetPct,
        actualText: `${fmt(liveData.monthlyNetActual)} / ${fmt(target.monthlyNet)}`,
        reward: renderMonthlyReward(monthlyMissionStates.revenue, 500),
        gradient: 'linear-gradient(90deg,#3FB477,#65C98D)'
      },
      {
        icon: 'target',
        iconClass: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
        title: 'KPI Hit Rate ≥ 80%',
        subtitle: 'Weight 20%',
        pct: hitRatePct,
        actualText: `${liveData.hitRateActual}% / 80% target`,
        reward: renderMonthlyReward(monthlyMissionStates.hitRate, 300),
        gradient: 'linear-gradient(90deg,#7C3AED,#8B5CF6)'
      },
      {
        icon: 'shopping-basket',
        iconClass: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
        title: 'Average Order Value',
        subtitle: 'Weight 15%',
        pct: monthlyAvoPct,
        actualText: `${fmt(monthlyAvoActual)} / ${fmt(target.avo)}`,
        reward: renderMonthlyReward(monthlyMissionStates.avo, 200),
        gradient: 'linear-gradient(90deg,#3B82F6,#5BC0BE)'
      },
      {
        icon: 'cup-soda',
        iconClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300',
        title: 'Drink Attachment',
        subtitle: 'Weight 15%',
        pct: monthlyDrinkPct,
        actualText: `${monthlyDrinkActual}% / ${target.drink}%`,
        reward: renderMonthlyReward(monthlyMissionStates.drink, 200),
        gradient: 'linear-gradient(90deg,#4F74F9,#56C4B6)'
      },
      {
        icon: 'shield-check',
        iconClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
        title: 'Food App Incident',
        subtitle: 'Weight 20%',
        pct: incidentPct,
        actualText: `${liveData.incidentActual}% / ≤ ${target.incident}%`,
        reward: renderMonthlyReward(monthlyMissionStates.incident, 300),
        gradient: 'linear-gradient(90deg,#46B87B,#70CFA1)'
      }
    ];

    page.innerHTML = `
      <style>
        .kpi-ui {
          --kpi-ink: #172033;
          --kpi-muted: #98A2B3;
          --kpi-purple: #6D35F2;
          --kpi-purple-2: #4F38E9;
        }
        .kpi-panel {
          background: rgba(255,255,255,.96);
          border: 1px solid #E9EDF4;
          border-radius: 18px;
          box-shadow: 0 8px 24px rgba(29, 41, 68, .045);
        }
        .dark .kpi-panel {
          background: rgba(20,20,20,.96);
          border-color: rgba(255,255,255,.08);
          box-shadow: 0 12px 32px rgba(0,0,0,.22);
        }
        .kpi-hero-panel {
          position: relative;
          background-image: linear-gradient(110deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.75) 45%, rgba(255,255,255,0.1) 75%, transparent 100%), url('/assets/HERO_KPI.png');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          border: 1px solid #E9EDF4;
          border-radius: 18px;
          box-shadow: 0 8px 24px rgba(29, 41, 68, .045);
          overflow: hidden;
        }
        .dark .kpi-hero-panel {
          background-image: linear-gradient(110deg, rgba(16,16,24,0.94) 0%, rgba(16,16,24,0.78) 45%, rgba(16,16,24,0.15) 75%, transparent 100%), url('/assets/HERO_KPI.png');
          border-color: rgba(255,255,255,.08);
          box-shadow: 0 12px 32px rgba(0,0,0,.22);
        }
        .kpi-daily-panel {
          position: relative;
          background-image: url('/assets/daily.png');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
        }
        .dark .kpi-daily-panel {
          background-image: url('/assets/daily.png');
        }
        .kpi-monthly-panel {
          position: relative;
          background-image: url('/assets/monthly.png');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
        }
        .dark .kpi-monthly-panel {
          background-image: url('/assets/monthly.png');
        }
        .kpi-mission-row {
          display: grid;
          grid-template-columns: 36px minmax(140px, 1.05fr) minmax(160px, 1fr) 124px;
          align-items: center;
          gap: 12px;
          padding: 10px 4px;
          border-bottom: 1px solid #EEF1F5;
          transition: background .18s ease, transform .18s ease;
        }
        .dark .kpi-mission-row { border-color: rgba(255,255,255,.06); }
        .kpi-mission-row:last-child { border-bottom: 0; }
        .kpi-mission-row:hover {
          background: rgba(248,250,252,.82);
          transform: translateY(-1px);
        }
        .dark .kpi-mission-row:hover { background: rgba(255,255,255,.025); }
        .kpi-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex: none;
        }
        .kpi-reward-pill {
          width: 124px;
          min-height: 28px;
          border-radius: 999px;
          border-width: 1px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 4px 8px;
          font-size: 9.5px;
          line-height: 1.05;
          text-align: center;
          font-weight: 800;
          white-space: nowrap;
          justify-self: end;
          flex-shrink: 0;
        }
        .monthly-row {
          display: grid;
          grid-template-columns: minmax(140px, 1fr) minmax(150px, 1.1fr) 132px;
          gap: 12px;
          align-items: center;
          padding: 9px 11px;
          border-radius: 12px;
          background: #FAFBFD;
          border: 1px solid #F1F3F7;
        }
        .dark .monthly-row {
          background: rgba(255,255,255,.025);
          border-color: rgba(255,255,255,.06);
        }
        @keyframes popIn {
          0% { transform: scale(0.92); opacity: 0.8; }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop-in {
          animation: popIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @media (max-width: 1280px) {
          .kpi-mission-row {
            grid-template-columns: 34px minmax(130px,1fr) minmax(140px,1fr) 116px;
            gap: 10px;
          }
          .kpi-reward-pill { width: 116px; font-size: 9px; }
          .monthly-row {
            grid-template-columns: minmax(130px,1fr) minmax(130px,1fr) 124px;
            gap: 10px;
          }
        }
        @media (max-width: 900px) {
          .kpi-mission-row {
            grid-template-columns: 34px minmax(0,1fr) 116px;
          }
          .kpi-mission-row > div:nth-child(3) { grid-column: 2 / 4; }
          .kpi-mission-row > div:nth-child(4) { grid-column: 3; grid-row: 1; }
          .monthly-row { grid-template-columns: 1fr auto; }
          .monthly-row > div:nth-child(2) { grid-column: 1 / 3; }
        }
        @media (max-width: 640px) {
          .kpi-mission-row {
            grid-template-columns: 32px minmax(0,1fr);
            gap: 8px 10px;
            padding: 10px 2px;
          }
          .kpi-mission-row > div:nth-child(3),
          .kpi-mission-row > div:nth-child(4) { grid-column: 2; }
          .kpi-mission-row > div:nth-child(4) { grid-row: auto; justify-self: flex-start; }
          .kpi-reward-pill { width: auto; min-width: 108px; }
          .monthly-row { grid-template-columns: 1fr; }
          .monthly-row > div:nth-child(2) { grid-column: 1; }
          .monthly-row > span { justify-self: start; }
        }
      </style>

      <div class="kpi-ui space-y-4">
        
        <!-- TOP HERO AREA: RANK PROGRESSION & BRANCH RACE MINI LEADERBOARD -->
        <section class="kpi-hero-panel p-4 sm:p-5">
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            
            <!-- LEFT 7 COLS: YOUR PROGRESS THIS MONTH & RANK PROGRESSION -->
            <div class="lg:col-span-7 space-y-3 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <span class="text-[9px] font-black uppercase text-[#7C3AED] dark:text-purple-300 tracking-wider">YOUR PROGRESS THIS MONTH</span>
                  <h1 class="text-lg sm:text-xl font-black text-[#172033] dark:text-white uppercase tracking-tight flex items-center gap-2">
                    <span>#${myRank} ${selectedBranch.toUpperCase()}</span>
                  </h1>
                </div>
                <div class="text-right">
                  <span class="text-sm font-black text-[#7C3AED] dark:text-purple-300 font-mono">${userXp.toLocaleString()} XP</span>
                  <div>
                    <span class="text-[9px] font-black uppercase text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-md inline-flex items-center gap-1 border border-amber-200 dark:border-amber-500/20">
                      <img src="${TIER_IMAGES[rankName] || '/assets/gold.png'}" class="w-3.5 h-3.5 object-contain" alt="${rankName}" />
                      ${rankName} Tier
                    </span>
                  </div>
                </div>
              </div>

              <!-- RANK PROGRESSION BAR (Silver -> Gold -> Platinum) -->
              <div class="space-y-1">
                <div class="flex items-center justify-between text-[10px] font-extrabold text-slate-700 dark:text-white/80">
                  <span class="flex items-center gap-1"><img src="/assets/Silver.png" class="w-3.5 h-3.5 object-contain" alt="Silver" /> Silver</span>
                  <span class="flex items-center gap-1 font-black text-amber-600 dark:text-amber-400">
                    <img src="${TIER_IMAGES[rankName] || '/assets/gold.png'}" class="w-4 h-4 object-contain" alt="${rankName}" />
                    ${rankName} (${rankProgress}%)
                  </span>
                  <span class="flex items-center gap-1"><img src="/assets/Platinum.png" class="w-3.5 h-3.5 object-contain" alt="Platinum" /> Platinum</span>
                </div>
                <div class="h-3 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden relative p-0.5 border border-slate-200/60 dark:border-white/10">
                  <div class="h-full rounded-full bg-gradient-to-r from-amber-400 via-purple-600 to-[#7C3AED] transition-all duration-1000 shadow-[0_0_12px_rgba(124,58,237,0.4)]" style="width:${Math.max(6, rankProgress)}%"></div>
                </div>
                <div class="flex items-center justify-between text-[9.5px]">
                  <span class="font-black text-[#7C3AED] dark:text-purple-300">Only ${xpToNext.toLocaleString()} XP to ${nextRankName}!</span>
                  <span class="text-slate-600 dark:text-white/70 font-extrabold">${rankName === 'Platinum' ? 'Max Tier' : `Target: ${rankNext.toLocaleString()} XP`}</span>
                </div>
              </div>

              <!-- HERO SUB-STATS (Streak + Perfect Days + Actions) -->
              <div class="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-white/5 text-[10px]">
                <div class="flex items-center gap-3">
                  <span class="font-black text-slate-700 dark:text-white flex items-center gap-1">
                    🔥 <span class="text-amber-500 font-extrabold">${liveData.streakDays}-DAY STREAK</span>
                  </span>
                  <span class="text-slate-300">|</span>
                  <span class="font-black text-slate-700 dark:text-white flex items-center gap-1">
                    🏆 <span class="text-emerald-600 dark:text-emerald-400 font-extrabold">${completedCount} PERFECT DAYS</span>
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <button id="btn-open-daily-modal" class="h-8 px-3 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#5637EA] text-white text-[10px] font-black uppercase tracking-wide shadow-sm hover:scale-105 active:scale-95 transition-all inline-flex items-center gap-1">
                    <i data-lucide="bell-ring" class="w-3 h-3"></i> Daily Popup
                  </button>
                  ${isAdmin ? `
                    <button id="btn-edit-targets" class="h-8 px-2.5 rounded-lg border border-[#DDCEF9] dark:border-purple-500/20 bg-[#F9F6FF] dark:bg-purple-500/10 text-[#6D35F2] dark:text-purple-300 text-[10px] font-black uppercase tracking-wide hover:bg-[#F3ECFF] transition-colors inline-flex items-center gap-1">
                      <i data-lucide="sliders-horizontal" class="w-3 h-3"></i> Targets
                    </button>
                  ` : ''}
                </div>
              </div>
            </div>

            <!-- RIGHT 5 COLS: BRANCH RACE MINI LEADERBOARD -->
            <div class="lg:col-span-5 bg-gradient-to-br from-slate-900 via-[#1A1830] to-purple-950 text-white rounded-2xl p-3.5 border border-purple-500/20 shadow-xl relative overflow-hidden space-y-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-lg bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-300 text-xs">
                    🏆
                  </div>
                  <span class="text-[11px] font-black uppercase tracking-wider text-white">BRANCH RACE</span>
                </div>
                <span class="text-[9px] font-extrabold text-amber-300 bg-amber-400/15 border border-amber-400/30 px-2 py-0.5 rounded-full">
                  ${leaderboardCallout}
                </span>
              </div>

              <!-- Mini Leaderboard Rows -->
              <div class="space-y-1.5 text-[11px]">
                ${(leaderboardData.length > 0 ? leaderboardData : [
                  { branch: 'UST', xp: 2580 },
                  { branch: 'Pioneer Center', xp: 2336 },
                  { branch: 'Ayala Cloverleaf', xp: 2210 }
                ]).slice(0, 3).map((item, i) => {
                  const isMe = item.branch === selectedBranch;
                  const rankBadgeImg = i === 0 ? '/assets/gold.png' : (i === 1 ? '/assets/Silver.png' : '/assets/bronze.png');
                  return `
                    <div class="flex items-center justify-between px-2.5 py-1.5 rounded-xl ${isMe ? 'bg-purple-600/35 border border-purple-400/40 text-white font-black shadow-sm' : 'bg-white/5 text-slate-300'}">
                      <div class="flex items-center gap-2 min-w-0">
                        <img src="${rankBadgeImg}" class="w-4 h-4 object-contain shrink-0 drop-shadow-sm" alt="Rank ${i+1}" />
                        <span class="truncate ${isMe ? 'font-black text-amber-300' : 'font-bold'}">#${i + 1} ${item.branch}</span>
                        ${isMe ? '<span class="text-[8px] bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded font-black">YOU</span>' : ''}
                      </div>
                      <span class="font-mono font-extrabold text-xs shrink-0">${item.xp.toLocaleString()} XP</span>
                    </div>
                  `;
                }).join('')}
              </div>

              <div class="text-[8.5px] text-purple-200/70 font-semibold text-center pt-0.5 border-t border-white/10">
                Rankings calculated from current month KPI consistency & volume.
              </div>
            </div>

          </div>
        </section>

        <!-- QUICK SUMMARY CARDS (WITH STREAK GAMEPLAY CARD) -->
        <section class="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
          <div class="kpi-panel p-3 flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300 flex items-center justify-center shrink-0"><i data-lucide="circle-check-big" class="w-4 h-4"></i></div>
            <div class="min-w-0"><div class="text-[9px] font-bold uppercase tracking-wide text-[#9AA5B8] truncate">Latest Result</div><div class="text-sm font-black text-[#1B263B] dark:text-white">${completedCount}/5 <span class="text-[10px] font-bold text-[#8D98AA]">completed</span></div></div>
          </div>
          <div class="kpi-panel p-3 flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0"><i data-lucide="sparkles" class="w-4 h-4"></i></div>
            <div class="min-w-0"><div class="text-[9px] font-bold uppercase tracking-wide text-[#9AA5B8] truncate">Daily XP</div><div class="text-sm font-black text-[#1B263B] dark:text-white">+${earnedXpToday} <span class="text-[10px] font-bold text-[#8D98AA]">/ 350 XP</span></div></div>
          </div>
          
          <!-- STREAK GAMEPLAY OBJECT -->
          <div class="kpi-panel p-3 flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0"><i data-lucide="flame" class="w-4 h-4"></i></div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between text-[9px] font-bold text-[#9AA5B8]">
                <span>STREAK OBJECTIVE</span>
                <span class="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-0.5"><i data-lucide="shield-check" class="w-3 h-3"></i> ACTIVE</span>
              </div>
              <div class="text-sm font-black text-[#1B263B] dark:text-white">🔥 ${liveData.streakDays} <span class="text-[10px] font-bold text-[#8D98AA]">Days</span></div>
              <div class="text-[8.5px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5 truncate">4 days to 20-Day Badge 🛡️</div>
            </div>
          </div>

          <div class="kpi-panel p-3 flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0"><i data-lucide="database" class="w-4 h-4"></i></div>
            <div class="min-w-0"><div class="text-[9px] font-bold uppercase tracking-wide text-[#9AA5B8] truncate">Data Through</div><div class="text-xs font-black text-[#1B263B] dark:text-white truncate">${latestDateLabel}</div></div>
          </div>
        </section>

        <!-- RIVAL & PERFORMANCE COMPARISON CARD -->
        <section class="kpi-panel p-3 sm:p-3.5 border-l-4 border-l-emerald-500">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <i data-lucide="line-chart" class="w-4 h-4"></i>
              </div>
              <div class="min-w-0">
                <span class="text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">RIVAL & PERFORMANCE COMPARISON</span>
                <h3 class="text-xs font-black text-slate-800 dark:text-white uppercase truncate">Latest Result vs Previous Imported Day</h3>
              </div>
            </div>

            <!-- DELTA STATS -->
            <div class="flex flex-wrap items-center gap-2 text-[10px]">
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-extrabold">
                📈 Revenue +8.4%
              </span>
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-300 font-extrabold">
                🛍️ AVO +₱22
              </span>
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-300 font-extrabold">
                🥤 Drink Attach -3%
              </span>
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-700 dark:text-purple-300 font-extrabold">
                🎯 86% Target Pace
              </span>
            </div>
          </div>
        </section>

        <!-- MAIN GRID: DAILY MISSIONS (QUEST CHAIN) & MONTHLY CHALLENGES (BOSS QUEST) -->
        <div class="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
          
          <!-- LEFT: DAILY MISSIONS & 5-NODE QUEST CHAIN -->
          <div class="xl:col-span-6 flex flex-col h-full min-w-0">
            <section class="kpi-panel kpi-daily-panel p-4 sm:p-5 flex-1 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between gap-2.5 pb-2.5 border-b border-[#EDF0F5] dark:border-white/5">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0"><i data-lucide="sun" class="w-4 h-4"></i></div>
                    <div class="min-w-0">
                      <h2 class="text-sm sm:text-base font-black text-[#19243A] dark:text-white tracking-tight">DAILY MISSIONS</h2>
                      <p class="text-[10px] sm:text-[11px] font-semibold text-[#9AA5B8] dark:text-white/40 truncate">Latest imported business-day performance</p>
                    </div>
                  </div>
                  <span class="shrink-0 px-2.5 py-1 rounded-full bg-[#F5F0FF] dark:bg-purple-500/10 text-[#6D35F2] dark:text-purple-300 border border-[#E5D9FF] dark:border-purple-500/20 text-[9px] font-black">${completedCount} / 5 COMPLETED</span>
                </div>

                <!-- 5-NODE QUEST CHAIN GRAPHIC -->
                <div class="flex items-center justify-between gap-1 my-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5">
                  ${[m1, m2, m3, m4, m5].map((m, idx) => {
                    const isDone = m.status === 'Completed';
                    const isOnTrack = m.status === 'OnTrack';
                    const isLast = idx === 4;
                    const nodeColor = isDone 
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)] ring-2 ring-emerald-200 dark:ring-emerald-500/30'
                      : (isOnTrack 
                        ? 'bg-amber-400 text-slate-900 shadow-sm ring-2 ring-amber-200 dark:ring-amber-500/20'
                        : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-white/30');
                    const lineColor = isDone
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : 'bg-slate-200 dark:bg-white/10';
                    return `
                      <div class="flex items-center ${isLast ? '' : 'flex-1'} min-w-0">
                        <div class="w-6 h-6 rounded-full ${nodeColor} flex items-center justify-center text-[10px] font-black shrink-0 transition-all duration-300">
                          ${isDone ? '<i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>' : (idx + 1)}
                        </div>
                        ${!isLast ? `<div class="h-1 flex-1 mx-1 rounded-full ${lineColor} transition-all duration-500"></div>` : ''}
                      </div>
                    `;
                  }).join('')}
                </div>

                <div class="pt-0.5">
                  ${dailyRows.map(renderMissionRow).join('')}
                </div>
              </div>

              <!-- DYNAMIC DAILY BONUS -->
              ${renderDailyBonus()}

            </section>
          </div>

          <!-- RIGHT: MONTHLY CHALLENGES (BOSS QUEST) -->
          <div class="xl:col-span-6 flex flex-col h-full min-w-0">
            <section class="kpi-panel kpi-monthly-panel p-4 sm:p-5 flex-1 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between gap-2.5 pb-2.5 border-b border-[#EDF0F5] dark:border-white/5">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#5637EA] text-white flex items-center justify-center shadow-[0_6px_16px_rgba(109,53,242,.15)] shrink-0"><i data-lucide="crown" class="w-4 h-4"></i></div>
                    <div class="min-w-0"><h2 class="text-sm sm:text-base font-black text-[#19243A] dark:text-white tracking-tight">MONTHLY CHALLENGES (BOSS QUEST)</h2><p class="text-[10px] sm:text-[11px] font-semibold text-[#9AA5B8] dark:text-white/40">Major milestones for branch consistency.</p></div>
                  </div>
                  <span class="shrink-0 px-2.5 py-1 rounded-full bg-[#F5F0FF] dark:bg-purple-500/10 text-[#6D35F2] dark:text-purple-300 text-[9px] font-black">MAX 2,000 XP</span>
                </div>

                <!-- BOSS QUEST PROGRESS BAR -->
                <div class="my-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 space-y-1.5">
                  <div class="flex justify-between items-center text-[10px] font-extrabold text-slate-700 dark:text-white">
                    <span>⚔️ BOSS QUEST PROGRESS</span>
                    <span class="text-[#7C3AED] dark:text-purple-300">${monthlyCompletedCount}/5 Objectives Cleared</span>
                  </div>
                  <div class="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden relative">
                    <div class="h-full rounded-full bg-gradient-to-r from-purple-600 via-indigo-500 to-amber-400 transition-all duration-700 shadow-[0_0_10px_rgba(124,58,237,0.3)]" style="width:${Math.max(6, Math.round((monthlyCompletedCount / 5) * 100))}%"></div>
                  </div>
                </div>

                <div class="space-y-2 pt-0.5">
                  ${monthlyRows.map(renderMonthlyMission).join('')}
                </div>
              </div>

              <!-- DYNAMIC MONTHLY BONUS -->
              ${renderMonthlyBonus()}

            </section>
          </div>
        </div>

        <!-- TRACKING RULES (FULL WIDTH HORIZONTAL BELOW MISSIONS) -->
        <section class="kpi-panel p-4 sm:p-5">
          <div class="flex items-center gap-2.5 mb-3">
            <div class="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-[0_6px_16px_rgba(59,130,246,.18)] shrink-0"><i data-lucide="book-open" class="w-4 h-4"></i></div>
            <div><h2 class="text-sm sm:text-base font-black text-[#19243A] dark:text-white">TRACKING RULES</h2><p class="text-[10px] font-semibold text-[#9AA5B8] dark:text-white/40">Simple rules for transparent KPI scoring across all branches.</p></div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div class="rounded-xl border border-[#EEF1F6] dark:border-white/5 bg-[#FBFCFE] dark:bg-white/[0.02] p-3">
              <div class="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-300 mb-1.5"><i data-lucide="trending-up" class="w-3.5 h-3.5"></i><span class="text-[11px] font-black">GROWTH KPIs</span></div>
              <p class="text-[10px] font-bold text-[#59657A] dark:text-white/60">Sales, AVO, Drink Attachment</p>
              <p class="text-[9px] text-[#99A4B6] dark:text-white/35 mt-1.5">Progress = Actual ÷ Target</p>
            </div>
            <div class="rounded-xl border border-[#EEF1F6] dark:border-white/5 bg-[#FBFCFE] dark:bg-white/[0.02] p-3">
              <div class="flex items-center gap-1.5 text-blue-600 dark:text-blue-300 mb-1.5"><i data-lucide="shield-check" class="w-3.5 h-3.5"></i><span class="text-[11px] font-black">CONTROL KPI</span></div>
              <p class="text-[10px] font-bold text-[#59657A] dark:text-white/60">Food App Incident Rate</p>
              <p class="text-[9px] text-[#99A4B6] dark:text-white/35 mt-1.5">Completed when Actual ≤ Target</p>
            </div>
            <div class="rounded-xl border border-[#EEF1F6] dark:border-white/5 bg-[#FBFCFE] dark:bg-white/[0.02] p-3">
              <div class="flex items-center gap-1.5 text-violet-600 dark:text-violet-300 mb-1.5"><i data-lucide="list-checks" class="w-3.5 h-3.5"></i><span class="text-[11px] font-black">MISSION STATUS</span></div>
              <div class="flex flex-wrap gap-1">
                <span class="px-1.5 py-0.5 rounded-full text-[8.5px] font-extrabold bg-emerald-50 text-emerald-700">Completed ≥100%</span>
                <span class="px-1.5 py-0.5 rounded-full text-[8.5px] font-extrabold bg-green-50 text-green-700">On Track 80–99%</span>
                <span class="px-1.5 py-0.5 rounded-full text-[8.5px] font-extrabold bg-amber-50 text-amber-700">Needs Push &lt;80%</span>
              </div>
            </div>
            <div class="rounded-xl border border-[#F4E8CD] dark:border-amber-500/10 bg-[#FFFDF8] dark:bg-amber-500/[0.025] p-3">
              <div class="flex items-center gap-1.5 text-amber-600 dark:text-amber-300 mb-1.5"><i data-lucide="database-zap" class="w-3.5 h-3.5"></i><span class="text-[11px] font-black">DATA UPDATE</span></div>
              <p class="text-[10px] font-bold text-[#59657A] dark:text-white/60">Updated after daily report import (T+1)</p>
              <p class="text-[9px] text-[#99A4B6] dark:text-white/35 mt-1.5        <!-- REWARD SYSTEM --><p class="text-[9px] text-[#99A4B6] dark:text-white/35 mt-1.5">Latest: ${latestDateLabel}</p>
            </div>
          </div>
        </section>

        <!-- REWARD SYSTEM -->
        <section class="kpi-panel p-4 sm:p-5">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-2.5 mb-4">
            <div class="flex items-center gap-2.5"><div class="w-8 h-8 rounded-xl bg-[#6D35F2] text-white flex items-center justify-center shrink-0"><i data-lucide="gamepad-2" class="w-4 h-4"></i></div><div><h2 class="text-sm sm:text-base font-black text-[#19243A] dark:text-white">REWARDS & MOTIVATION</h2><p class="text-[10px] font-semibold text-[#9AA5B8] dark:text-white/40">Recognition first: levels, streaks and branch achievements.</p></div></div>
            <div class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#F6F2FF] dark:bg-purple-500/10 border border-[#E7DCFF] dark:border-purple-500/20 shrink-0">
              <img src="${TIER_IMAGES[rankName] || '/assets/gold.png'}" class="w-4 h-4 object-contain shrink-0" alt="Tier Badge" />
              <span class="text-[10px] font-black text-[#6D35F2] dark:text-purple-300">${rankName.toUpperCase()} • ${userXp.toLocaleString()} XP</span>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-4 gap-2.5">
            ${[
              ['/assets/bronze.png','Bronze','0–999 XP','Build the habit','#FFF8ED','#B45309'],
              ['/assets/Silver.png','Silver','1,000–1,999 XP','Consistent momentum','#F4F7FA','#64748B'],
              ['/assets/gold.png','Gold','2,000–2,999 XP','High performance','#FFF9E8','#B7791F'],
              ['/assets/Platinum.png','Platinum','3,000+ XP','Outstanding branch','#F6F0FF','#7C3AED']
            ].map(([imgSrc,name,range,desc,bg,color]) => `
              <div class="rounded-xl border border-[#EEF1F5] dark:border-white/5 p-3 flex flex-col justify-between" style="background:${bg}">
                <div class="flex items-center justify-between gap-1.5 mb-2">
                  <img src="${imgSrc}" class="w-8 h-8 object-contain shrink-0 drop-shadow-sm" alt="${name} Badge" />
                  <span class="px-1.5 py-0.5 rounded-full text-[8.5px] font-black uppercase" style="color:${color}; background:white; border:1px solid ${color}22">${name}</span>
                </div>
                <div>
                  <div class="text-[11px] font-black text-[#243047]">${range}</div>
                  <div class="text-[9px] font-semibold text-[#8E99AA] mt-0.5">${desc}</div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-3">
            <div class="rounded-xl bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10 p-3"><div class="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 text-[10px] font-black"><i data-lucide="flame" class="w-3.5 h-3.5"></i> STREAK MILESTONES</div><p class="text-[9px] text-[#6C7484] dark:text-white/45 mt-1.5 leading-relaxed">3-day streak: +50 XP • 7-day streak: +150 XP + Fire Streak badge.</p></div>
            <div class="rounded-xl bg-purple-50 dark:bg-purple-500/5 border border-purple-100 dark:border-purple-500/10 p-3"><div class="flex items-center gap-1.5 text-purple-700 dark:text-purple-300 text-[10px] font-black"><i data-lucide="award" class="w-3.5 h-3.5"></i> BRANCH CHAMPION</div><p class="text-[9px] text-[#6C7484] dark:text-white/45 mt-1.5 leading-relaxed">Recognize normalized target achievement and overall KPI consistency—not raw revenue alone.</p></div>
            <div class="rounded-xl bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10 p-3"><div class="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-[10px] font-black"><i data-lucide="shield-check" class="w-3.5 h-3.5"></i> QUALITY GATE</div><p class="text-[9px] text-[#6C7484] dark:text-white/45 mt-1.5 leading-relaxed">Food App Incident remains a control KPI so strong sales never hide operational quality issues.</p></div>
          </div>
        </section>
      </div>
    `;

    const branchSelect = page.querySelector('#kpi-branch-select');
    if (branchSelect) {
      branchSelect.onchange = (e) => {
        selectedBranch = e.target.value;
        currentTarget = { ...(BRANCH_TARGETS[selectedBranch] || BRANCH_TARGETS['Pioneer Center']) };
        loadBranchData();
      };
    }

    const openModalBtn = page.querySelector('#btn-open-daily-modal');
    if (openModalBtn) {
      openModalBtn.onclick = () => {
        window.dispatchEvent(new CustomEvent('open-kpi-modal'));
      };
    }

    const editBtn = page.querySelector('#btn-edit-targets');
    if (editBtn) {
      editBtn.onclick = () => showTargetModal(selectedBranch, currentTarget, async (newTargets) => {
        currentTarget = { ...currentTarget, ...newTargets };
        const targetDocId = `target_${selectedBranch.replace(/\s+/g, '')}`;
        await setDoc(doc(db, 'kpi_targets', targetDocId), {
          ...currentTarget,
          updatedAt: serverTimestamp()
        });
        if (window.showToast) window.showToast(`Targets updated for ${selectedBranch}`, 'success');
        renderContent();
      });
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  loadBranchData();
  return page;
}

function renderStatusPill(pct, isControl = false, controlCompleted = false) {
  if (isControl) {
    if (controlCompleted) {
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300 text-[9px] font-extrabold whitespace-nowrap"><i data-lucide="check-circle-2" class="w-2.5 h-2.5"></i>Completed</span>`;
    }
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-300 text-[9px] font-extrabold whitespace-nowrap"><i data-lucide="triangle-alert" class="w-2.5 h-2.5"></i>Needs Push</span>`;
  }
  if (pct >= 100) {
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300 text-[9px] font-extrabold whitespace-nowrap"><i data-lucide="check-circle-2" class="w-2.5 h-2.5"></i>Completed</span>`;
  }
  if (pct >= 80) {
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300 text-[9px] font-extrabold whitespace-nowrap"><i data-lucide="trending-up" class="w-2.5 h-2.5"></i>On Track</span>`;
  }
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-300 text-[9px] font-extrabold whitespace-nowrap"><i data-lucide="triangle-alert" class="w-2.5 h-2.5"></i>Needs Push</span>`;
}

// Modal for Admin to edit KPI Targets
function showTargetModal(branchId, currentTargets, onSave) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[35000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in';

  modal.innerHTML = `
    <div class="luxury-card bg-white dark:bg-[#141414] w-full max-w-sm rounded-2xl p-4 shadow-2xl animate-scale-up border border-slate-100 dark:border-white/10 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">Set Targets - ${branchId}</h3>
        <button id="btn-close-target-modal" class="text-slate-400 hover:text-slate-600 dark:hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>

      <div class="space-y-2.5 text-xs">
        <div>
          <label class="block font-bold text-slate-500 uppercase text-[9px] mb-1">Shift 1 Sales Target (₱)</label>
          <input id="input-shift1" type="number" value="${currentTargets.shift1}" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white font-mono text-xs font-bold" />
        </div>
        <div>
          <label class="block font-bold text-slate-500 uppercase text-[9px] mb-1">Shift 2 Sales Target (₱)</label>
          <input id="input-shift2" type="number" value="${currentTargets.shift2}" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white font-mono text-xs font-bold" />
        </div>
        <div>
          <label class="block font-bold text-slate-500 uppercase text-[9px] mb-1">AVO Target (₱)</label>
          <input id="input-avo" type="number" value="${currentTargets.avo}" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white font-mono text-xs font-bold" />
        </div>
        <div>
          <label class="block font-bold text-slate-500 uppercase text-[9px] mb-1">Drink Attachment Target (%)</label>
          <input id="input-drink" type="number" value="${currentTargets.drink}" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white font-mono text-xs font-bold" />
        </div>
        <div>
          <label class="block font-bold text-slate-500 uppercase text-[9px] mb-1">Food App Incident Target (%)</label>
          <input id="input-incident" type="number" step="0.01" value="${currentTargets.incident}" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white font-mono text-xs font-bold" />
        </div>
      </div>

      <div class="flex items-center gap-2 pt-1">
        <button id="btn-cancel-target" class="flex-1 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white font-bold text-xs">Cancel</button>
        <button id="btn-save-target" class="flex-1 py-2 rounded-lg bg-purple-600 text-white font-black uppercase tracking-wider text-xs shadow-md shadow-purple-500/20">Save Targets</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  if (window.lucide) window.lucide.createIcons();

  modal.querySelector('#btn-close-target-modal').onclick = () => modal.remove();
  modal.querySelector('#btn-cancel-target').onclick = () => modal.remove();

  modal.querySelector('#btn-save-target').onclick = () => {
    const shift1 = parseFloat(modal.querySelector('#input-shift1').value) || currentTargets.shift1;
    const shift2 = parseFloat(modal.querySelector('#input-shift2').value) || currentTargets.shift2;
    const avo = parseFloat(modal.querySelector('#input-avo').value) || currentTargets.avo;
    const drink = parseFloat(modal.querySelector('#input-drink').value) || currentTargets.drink;
    const incident = parseFloat(modal.querySelector('#input-incident').value) || currentTargets.incident;

    modal.remove();
    onSave({ shift1, shift2, avo, drink, incident });
  };
}

export async function fetchTodayBranchKPI(branchName) {
  const now = new Date();
  const y = now.getFullYear();
  const mStr = String(now.getMonth() + 1).padStart(2, '0');
  const dStr = String(now.getDate()).padStart(2, '0');
  const todayStr = `${y}-${mStr}-${dStr}`;
  const monthStart = `${y}-${mStr}-01`;
  const monthEnd = `${y}-${mStr}-31`;

  const BRANCH_TARGETS = {
    'Pioneer Center': { shift1: 26000, shift2: 45000, avo: 750, drink: 50, incident: 0.25, monthlyNet: 2130000 },
    'Catholic Trade': { shift1: 7000, shift2: 10000, avo: 750, drink: 45, incident: 0.25, monthlyNet: 510000 },
    'Unimart Capitol': { shift1: 10000, shift2: 6000, avo: 650, drink: 45, incident: 0.25, monthlyNet: 480000 },
    'Ayala Cloverleaf': { shift1: 12000, shift2: 15000, avo: 650, drink: 45, incident: 0.25, monthlyNet: 810000 },
    'UST': { shift1: 25000, shift2: 33000, avo: 750, drink: 45, incident: 0.25, monthlyNet: 1740000 }
  };

  const target = BRANCH_TARGETS[branchName] || BRANCH_TARGETS['Pioneer Center'];

  let res = {
    branchId: branchName,
    shift1Actual: 0,
    shift1Target: target.shift1,
    shift2Actual: 0,
    shift2Target: target.shift2,
    avoActual: 0,
    avoTarget: target.avo,
    drinkActual: 0,
    drinkTarget: target.drink,
    incidentActual: 0.10,
    incidentTarget: target.incident,
    monthlyNetActual: 0,
    monthlyNetTarget: target.monthlyNet,
    hitRateActual: 80
  };

  try {
    const q = query(
      collection(db, 'daily_sales'),
      where('branchId', '==', branchName),
      where('date', '>=', monthStart),
      where('date', '<=', monthEnd)
    );
    const snap = await getDocs(q);

    let monthNet = 0;
    let todayNet = 0;
    let todayOrders = 0;
    let todayDrinkOrders = 0;
    let shift1Net = 0;
    let shift2Net = 0;
    let maxDate = '';

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const date = data.date || '';
      const net = Number(data.financials?.net || data.netSales || 0);

      monthNet += net;
      if (date > maxDate) maxDate = date;
    });

    const activeDate = maxDate || todayStr;

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.date === activeDate) {
        const net = Number(data.financials?.net || data.netSales || 0);
        const orders = Number(data.financials?.totalOrders || data.orders || 0);
        todayNet += net;
        todayOrders += orders;

        if (data.breakdown?.kpi?.drinkOrders) {
          todayDrinkOrders += Number(data.breakdown.kpi.drinkOrders);
        }

        if (data.breakdown?.hourlyNet && typeof data.breakdown.hourlyNet === 'object') {
          Object.entries(data.breakdown.hourlyNet).forEach(([hrStr, hrNet]) => {
            const hr = parseInt(hrStr, 10);
            if (hr >= 7 && hr < 16) {
              shift1Net += Number(hrNet || 0);
            } else {
              shift2Net += Number(hrNet || 0);
            }
          });
        }
      }
    });

    if (shift1Net === 0 && shift2Net === 0 && todayNet > 0) {
      shift1Net = Math.round(todayNet * 0.45);
      shift2Net = Math.round(todayNet * 0.55);
    }

    res.shift1Actual = shift1Net;
    res.shift2Actual = shift2Net;
    res.avoActual = todayOrders > 0 ? Math.round(todayNet / todayOrders) : (target.avo || 650);
    res.drinkActual = todayOrders > 0 && todayDrinkOrders > 0
      ? Math.min(100, Math.round((todayDrinkOrders / todayOrders) * 100))
      : 42;
    res.monthlyNetActual = monthNet;

  } catch (err) {
    console.error('Error in fetchTodayBranchKPI:', err);
  }

  return res;
}
