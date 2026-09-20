// src/pages/KPITracking.js
import { renderKPIJourney, renderKPIPoints, renderDailySnapshot } from '../components/KPIJourney.js';
import '../components/kpiJourney.css';
import { db } from '../firebase.js';
import { doc, getDoc, setDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';

import { calculateMetrics, emptyMetrics, progress, missionStat, formatPercent, formatMoney, parseWindow } from '../utils/kpiMetrics.js';

// Defaults apply only when no saved branch target exists.
const BRANCH_TARGETS = {
  'Pioneer Center': { shift1: 26000, shift2: 45000, avo: 750, drink: 50, incident: 0.25, monthlyNet: 2130000, shift1Time: '7:00 - 16:00', shift2Time: '17:00 - 1:00' },
  'Catholic Trade': { shift1: 7000, shift2: 10000, avo: 750, drink: 45, incident: 0.25, monthlyNet: 510000, shift1Time: '9:00 - 15:00', shift2Time: '16:00 - 22:00' },
  'Unimart Capitol': { shift1: 10000, shift2: 6000, avo: 650, drink: 45, incident: 0.25, monthlyNet: 480000, shift1Time: '9:00 - 15:00', shift2Time: '16:00 - 21:00' },
  'Ayala Cloverleaf': { shift1: 12000, shift2: 15000, avo: 650, drink: 45, incident: 0.25, monthlyNet: 810000, shift1Time: '10:00 - 16:00', shift2Time: '17:00 - 22:00' },
  'UST': { shift1: 25000, shift2: 33000, avo: 750, drink: 45, incident: 0.25, monthlyNet: 1740000, shift1Time: '8:00 - 16:00', shift2Time: '17:00 - 2:00' }
};


export function renderKPITrackingPage(user) {
  const page = document.createElement('div');
  page.className = 'p-3 sm:p-4 space-y-4 page-enter relative min-h-full';

  const DEFAULT_BRANCHES = ['Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf', 'UST'];
  const isAdmin = user?.permissions?.isAdmin === true || ['jimmie.somot@gmail.com'].includes(user?.email);
  const configuredBranches = user?.permissions?.allowedBranches || [];
  const allowedBranches = isAdmin || configuredBranches.includes('All Branches') ? [...DEFAULT_BRANCHES] : configuredBranches.filter(b => DEFAULT_BRANCHES.includes(b));
  if (!allowedBranches.length) { page.textContent = 'No KPI branch access has been assigned.'; return page; }

  const headerControls = document.getElementById('kpi-header-controls');
  const viewNavigation = document.createElement('nav');
  viewNavigation.className = 'kpi-view-buttons';
  viewNavigation.setAttribute('aria-label', 'KPI views');
  page.kpiViewNavigation = viewNavigation;
  const headerBranch = headerControls?.dataset.initialBranch || document.getElementById('db-branch')?.value;
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

  // A mounted KPI header owns its filters; never subscribe to global changes.
  if (!headerControls) window.addEventListener('global-filter-changed', handleGlobalFilter);
  window.addEventListener('cleanup-page', () => {
    window.removeEventListener('global-filter-changed', handleGlobalFilter);
    if (headerControls) headerControls.innerHTML = '';
  }, { once: true });


  // State data
  let currentTarget = { ...(BRANCH_TARGETS[selectedBranch] || BRANCH_TARGETS['Pioneer Center']) };
  let liveData = emptyMetrics();
  let leaderboardData = [];
  let loadState = 'loading';
  let activeView = 'overview';
  let journeyDate = '';
  let pointFilters = { date: '', kind: '', status: '', page: 0 };
  let loadVersion = 0;
  window.addEventListener('cleanup-page', () => { loadVersion++; }, { once: true });

  async function loadBranchData() {
    const version = ++loadVersion;
    const branch = selectedBranch;
    liveData = emptyMetrics();
    journeyDate = '';
    pointFilters = { date: '', kind: '', status: '', page: 0 };
    leaderboardData = [];
    loadState = 'loading';
    renderContent();
    try {
      const loaded = await loadBranchKPI(branch, selectedYear, selectedMonth);
      if (version !== loadVersion) return;
      currentTarget = loaded.target;
      liveData = loaded.metrics;
      loadState = liveData.latestBusinessDate ? 'ready' : 'empty';
      renderContent();
      const ranks = await Promise.allSettled(allowedBranches.map(async name => {
        const data = name === branch ? loaded : await loadBranchKPI(name, selectedYear, selectedMonth);
        return { branch: name, xp: data.metrics.userXp, date: data.metrics.latestBusinessDate };
      }));
      if (version !== loadVersion) return;
      leaderboardData = ranks.filter(item => item.status === 'fulfilled' && item.value.xp !== null)
        .map(item => item.value).sort((a, b) => b.xp - a.xp || a.branch.localeCompare(b.branch));
    } catch (err) {
      if (version !== loadVersion) return;
      console.error('Error loading KPI data from Firestore:', err);
      liveData = emptyMetrics();
      loadState = 'error';
    }
    renderContent();
  }

  function renderContent() {
    const target = currentTarget;

    // ------------------------------
    // KPI calculations (Daily Missions)
    // ------------------------------
    const shift1Pct = progress(liveData.shift1Actual, target.shift1);
    const shift2Pct = progress(liveData.shift2Actual, target.shift2);
    const avoPct = progress(liveData.avoActual, target.avo);
    const drinkPct = progress(liveData.drinkActual, target.drink);
    const incidentCompleted = liveData.incidentActual === null ? null : liveData.incidentActual <= target.incident;

    const getMissionStat = missionStat;

    const m1 = getMissionStat(shift1Pct);
    const m2 = getMissionStat(shift2Pct);
    const m3 = getMissionStat(avoPct);
    const m4 = getMissionStat(drinkPct);
    const m5 = getMissionStat(0, true, incidentCompleted);

    const missionsList = [m1, m2, m3, m4, m5];
    const completedCount = missionsList.filter(m => m.status === 'Completed').length;
    const earnedXpToday = missionsList.reduce((acc, m) => acc + m.xp, 0) + (completedCount === 5 ? 100 : 0);

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
                <span class="px-2.5 py-1 rounded-full bg-[#FCD34D] text-[#2E2354] text-[9.5px] font-black whitespace-nowrap shadow-sm">⭐ +100 PROVISIONAL XP</span>
                <span class="px-2.5 py-1 rounded-full bg-white/14 border border-white/20 text-white text-[9.5px] font-black whitespace-nowrap">🔥 DAILY STREAK</span>
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
                  <div class="text-[9.5px] text-white/75 font-medium mt-0.5">4 missions complete. This recorded date qualifies for the streak; complete one more for the provisional bonus.</div>
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
    const monthlyAvoActual = liveData.monthlyAvoActual;
    const monthlyDrinkActual = liveData.monthlyDrinkActual;

    const monthlyNetPct = progress(liveData.monthlyNetActual, target.monthlyNet);
    const hitRatePct = progress(liveData.hitRateActual, 80);
    const monthlyAvoPct = progress(monthlyAvoActual, target.avo);
    const monthlyDrinkPct = progress(monthlyDrinkActual, target.drink);
    const monthlyIncidentCompleted = liveData.monthlyIncidentActual === null ? null : liveData.monthlyIncidentActual <= target.incident;

    const monthlyMissionStates = {
      revenue: monthlyNetPct === null ? null : monthlyNetPct >= 100,
      hitRate: liveData.hitRateActual === null ? null : liveData.hitRateActual >= 80,
      avo: monthlyAvoPct === null ? null : monthlyAvoPct >= 100,
      drink: monthlyDrinkPct === null || !liveData.monthlyDrinkComplete ? null : monthlyDrinkPct >= 100,
      incident: monthlyIncidentCompleted
    };

    const monthlyCompletedCount = Object.values(monthlyMissionStates).filter(Boolean).length;
    const isPerfectMonth = monthlyCompletedCount === 5;

    function renderMonthlyReward(completed, xp) {
      if (completed === null) return '<span class="text-xs text-slate-500">No data</span>';
      if (completed) {
        return `
          <span class="inline-flex items-center justify-center w-[132px] min-h-[28px] px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-400/15 via-emerald-500/15 to-emerald-400/20 border border-amber-400/40 text-amber-700 dark:text-amber-300 text-[9.5px] font-black whitespace-nowrap justify-self-end shrink-0 shadow-[0_0_12px_rgba(250,204,21,0.22)]">
            🏆 +${xp} PROVISIONAL XP
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
              <span class="px-2.5 py-1 rounded-full bg-amber-400 text-slate-900 text-[9.5px] font-black whitespace-nowrap shadow-sm">⭐ +500 PROVISIONAL XP</span>
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
      'Platinum': '/assets/Platinum.png',
      'Diamond': '/assets/diamond.png'
    };

    const incidentPct = incidentCompleted === null ? null : incidentCompleted
      ? 100
      : Math.max(0, Math.min(99, Math.round((target.incident / Math.max(liveData.incidentActual, 0.01)) * 100)));

    const monthlyIncidentPct = liveData.monthlyIncidentActual === null ? null : monthlyIncidentCompleted ? 100
      : Math.max(0, Math.min(99, target.incident / liveData.monthlyIncidentActual * 100));
    const userXp = liveData.userXp ?? 0;
    let rankName = 'Gold III';
    let rankBadge = '\u{1F451}';
    let rankStart = 2000;
    let rankNext = 3000;
    let nextRankName = 'Platinum';

    if (userXp >= 4000) {
      rankName = 'Diamond'; rankStart = 4000; rankNext = 4000; nextRankName = 'Diamond';
    } else if (userXp >= 3000) {
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

    const rankProgress = Math.min(100, Math.max(0, userXp / 4000 * 100));
    const displayTier = rankName.startsWith('Gold') ? 'Gold' : rankName;

    const xpToNext = Math.max(0, rankNext - userXp);

    // Leaderboard calculation helper
    const myRankIdx = leaderboardData.findIndex(item => item.branch === selectedBranch);
    const myRank = myRankIdx >= 0 ? myRankIdx + 1 : '—';
    const leaderObj = leaderboardData[0] || { branch: '', xp: 0 };
    const gapToLeader = Math.max(0, leaderObj.xp - userXp);
    const leaderLead = leaderboardData[1] ? Math.max(0, userXp - leaderboardData[1].xp) : 0;

    const leaderboardCallout = !leaderboardData.length ? 'No ranked data yet' : leaderboardData.filter(item => item.xp === leaderObj.xp).length > 1 && userXp === leaderObj.xp ? 'TIED FOR #1' : myRank === 1
      ? `\u{1F451} YOU'RE LEADING BY ${leaderLead} XP`
      : `\u{26A1} ${gapToLeader} XP BEHIND #1`;

    const fmt = formatMoney;
    const monthLabel = new Date(selectedYear, selectedMonth - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();

    const latestDateLabel = liveData.latestBusinessDate
      ? new Date(`${liveData.latestBusinessDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Waiting for import';

    function getStatusMeta(stat) {
      if (stat.status === 'Unavailable') return { label: 'No data', icon: 'circle-help', badge: 'text-slate-500', reward: 'text-slate-500', rewardIcon: 'lock', rewardText: 'No XP yet' };
      if (stat.status === 'Completed') {
        return {
          label: 'Completed',
          icon: 'check-circle-2',
          badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
          reward: 'bg-gradient-to-r from-amber-400/15 via-emerald-500/15 to-emerald-400/20 border border-amber-400/40 text-amber-700 dark:text-amber-300 font-black shadow-[0_0_12px_rgba(250,204,21,0.22)] animate-pop-in',
          rewardIcon: 'trophy',
          rewardText: '+50 PROVISIONAL XP'
        };
      }
      if (stat.status === 'OnTrack') {
        return {
          label: 'On Track',
          icon: 'trending-up',
          badge: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
          reward: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-bold',
          rewardIcon: 'zap',
          rewardText: '+25 PROVISIONAL XP'
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
            </div>
            <p class="text-[10px] text-[#94A0B4] dark:text-white/45 font-medium truncate">${subtitle}</p>
          </div>

          <div class="min-w-0">
            <div class="flex items-baseline justify-between gap-2 mb-1.5">
              <div class="min-w-0 whitespace-nowrap">
                <span class="font-mono text-xs sm:text-[13px] font-extrabold text-[#182338] dark:text-white">${actual}</span>
                <span class="text-[10px] text-[#A3ADC0] dark:text-white/40 font-semibold"> / ${targetText}</span>
              </div>
              <span class="text-[10px] font-black text-[#44506A] dark:text-white/70 shrink-0">${formatPercent(pct)}</span>
            </div>
            <div class="h-2 rounded-full bg-[#EDF1F6] dark:bg-white/10 overflow-hidden">
              <div class="h-full rounded-full transition-all duration-700" style="width:${Math.max(0, pct ?? 0)}%; background:${gradient};"></div>
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
              <span class="text-[9px] font-black text-[#59657A] dark:text-white/70">${formatPercent(pct)}</span>
            </div>
            <div class="h-1.5 rounded-full bg-[#EDF1F6] dark:bg-white/10 overflow-hidden">
              <div class="h-full rounded-full" style="width:${Math.max(0, pct ?? 0)}%; background:${gradient};"></div>
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
        subtitle: 'Dine In net sales / Dine In orders',
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
        subtitle: 'Orders containing D/DR SKU / Dine In orders',
        actual: `${formatPercent(liveData.drinkActual)}`,
        targetText: `${target.drink}%`,
        pct: drinkPct,
        stat: m4,
        gradient: 'linear-gradient(90deg,#3B82F6 0%,#64C99B 100%)'
      },
      {
        icon: 'shield-check',
        iconClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
        title: 'Food App Incident',
        subtitle: `${liveData.dailyIncidentCount ?? '—'} wrong/missing orders / ${liveData.dailyFoodAppOrders ?? '—'} Grab orders`,
        actual: `${formatPercent(liveData.incidentActual)}`,
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
        title: 'Dine In Net Revenue Goal',
        subtitle: 'Monthly Dine In net sales',
        pct: monthlyNetPct,
        actualText: `${fmt(liveData.monthlyNetActual)} / ${fmt(target.monthlyNet)}`,
        reward: renderMonthlyReward(monthlyMissionStates.revenue, 500),
        gradient: 'linear-gradient(90deg,#3FB477,#65C98D)'
      },
      {
        icon: 'target',
        iconClass: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
        title: 'KPI Hit Rate ≥ 80%',
        subtitle: `Recorded days meeting the Dine In daily target (${fmt(liveData.dailyTarget)})`,
        pct: hitRatePct,
        actualText: `${formatPercent(liveData.hitRateActual)} / 80% target`,
        reward: renderMonthlyReward(monthlyMissionStates.hitRate, 300),
        gradient: 'linear-gradient(90deg,#7C3AED,#8B5CF6)'
      },
      {
        icon: 'shopping-basket',
        iconClass: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
        title: 'Average Order Value',
        subtitle: 'Monthly Dine In net sales / Dine In orders',
        pct: monthlyAvoPct,
        actualText: `${fmt(monthlyAvoActual)} / ${fmt(target.avo)}`,
        reward: renderMonthlyReward(monthlyMissionStates.avo, 200),
        gradient: 'linear-gradient(90deg,#3B82F6,#5BC0BE)'
      },
      {
        icon: 'cup-soda',
        iconClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300',
        title: 'Drink Attachment',
        subtitle: `${liveData.monthlyDrinkComplete ? 'Coverage' : 'Partial'}: ${liveData.monthlyDrinkDays ?? 0}/${liveData.monthlyDrinkTotalDays ?? 0} imported days · Dine In orders only`,
        pct: monthlyDrinkPct,
        actualText: `${formatPercent(monthlyDrinkActual)} / ${target.drink}%`,
        reward: monthlyDrinkActual !== null && !liveData.monthlyDrinkComplete
          ? '<span class="text-xs text-slate-500">Pending complete data</span>'
          : renderMonthlyReward(monthlyMissionStates.drink, 200),
        gradient: 'linear-gradient(90deg,#4F74F9,#56C4B6)'
      },
      {
        icon: 'shield-check',
        iconClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
        title: 'Food App Incident',
        subtitle: `${liveData.monthlyIncidentCount ?? '—'} recorded wrong/missing orders / ${liveData.monthlyFoodAppOrders ?? '—'} Grab orders`,
        pct: monthlyIncidentPct,
        actualText: `${formatPercent(liveData.monthlyIncidentActual)} / ≤ ${target.incident}%`,
        reward: renderMonthlyReward(monthlyMissionStates.incident, 300),
        gradient: 'linear-gradient(90deg,#46B87B,#70CFA1)'
      }
    ];

    const views = [['overview', 'Overview'], ['journey', 'Journey'], ['points', 'Points']];
    viewNavigation.innerHTML = views.map(([id, label]) => `<button type="button" class="kpi-view-button" data-view="${id}" aria-pressed="${activeView === id}">${label}</button>`).join('');
    viewNavigation.onclick = event => {
      const button = event.target.closest('[data-view]');
      if (!button) return;
      activeView = button.dataset.view;
      renderContent();
      viewNavigation.querySelector(`[data-view="${activeView}"]`)?.focus();
    };
    const chevron = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>';
    const dropdown = (label, name, options, extra = '') => `<div class="kj-dropdown"><button type="button" class="kj-dropdown-trigger" aria-label="Choose KPI ${name}">${label}${chevron}</button><div class="kj-dropdown-menu">${options.map(([value, text, selected]) => `<button type="button" class="kj-dropdown-option ${selected ? 'is-current' : ''}" data-kpi-choice="${name}" data-value="${value}" ${selected ? 'aria-current="true"' : ''}>${text}</button>`).join('')}${extra}</div></div>`;
    const monthValue = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    const headerMonthLabel = new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const controlsHTML = `
      <div class="kj-toolbar ${headerControls ? 'kj-header-toolbar' : ''}">
        <select hidden id="kpi-branch-select" aria-label="KPI branch">${allowedBranches.map(branch => `<option value="${branch}" ${branch === selectedBranch ? 'selected' : ''}>${branch}</option>`).join('')}</select>
        ${dropdown(selectedBranch, 'Branch', allowedBranches.map(branch => [branch, branch, branch === selectedBranch]))}
        <span class="kj-header-dot" aria-hidden="true">•</span>
        ${dropdown(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg><span>${headerMonthLabel}</span>`, 'Month', Array.from({ length: 12 }, (_, i) => [`${selectedYear}-${String(i + 1).padStart(2, '0')}`, new Date(selectedYear, i, 1).toLocaleDateString('en-US', { month: 'long' }), i + 1 === selectedMonth]), `<div class="kj-custom-month"><input id="kpi-month" aria-label="Choose KPI month and year" type="month" value="${monthValue}" /></div>`)}
        <select hidden id="kpi-view-select" aria-label="KPI view">${views.map(([id, label]) => `<option value="${id}" ${activeView === id ? 'selected' : ''}>${label}</option>`).join('')}</select>
      </div>`;
    if (headerControls) headerControls.innerHTML = controlsHTML;
    page.innerHTML = `
      ${headerControls ? '' : controlsHTML}
      ${loadState !== 'ready' ? `
        <div role="status" class="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200">
          ${loadState === 'loading' ? 'Loading KPI data…' : loadState === 'error' ? 'Could not load KPI data. Please retry.' : 'No Dine In sales for this month.'}
          ${loadState === 'error' ? '<button id="kpi-retry" class="ml-2 underline font-bold">Retry</button>' : ''}
        </div>
      ` : ''}

      <style>
        .kpi-ui {
          --kpi-ink: #172033;
          --kpi-muted: #98A2B3;
          --kpi-purple: #6D35F2;
          --kpi-purple-2: #4F38E9;
        }
        .kpi-panel {
          background: #FFFFFF;
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
          background-color: #FFFFFF;
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
          background-color: #101018;
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

      <div id="kpi-panel-overview" role="region" aria-label="KPI overview" ${activeView !== 'overview' ? 'hidden' : ''}><div class="kpi-ui space-y-4">
        
        <!-- TOP HERO AREA: RANK PROGRESSION & BRANCH RACE MINI LEADERBOARD -->
        <section class="kpi-hero-panel p-4 sm:p-5">
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            
            <!-- LEFT 7 COLS: YOUR PROGRESS THIS MONTH & RANK PROGRESSION -->
            <div class="lg:col-span-7 min-w-0">
              <div class="kpi-hero-layout">
                <div class="kpi-hero-main">
                  <span class="text-[11px] font-black uppercase text-[#7C3AED] dark:text-purple-300 tracking-wider">YOUR PROGRESS THIS MONTH</span>
                  <h1 class="text-2xl sm:text-3xl font-black text-[#172033] dark:text-white uppercase tracking-tight">#${myRank} ${selectedBranch.toUpperCase()}</h1>
                  <div class="kpi-tier-track" role="progressbar" aria-label="Monthly tier progress" aria-valuemin="0" aria-valuemax="4000" aria-valuenow="${Math.min(4000, userXp)}" aria-valuetext="${liveData.userXp === null ? 'No calculated XP' : `${userXp} XP, ${displayTier}`}">
                    <div class="kpi-tier-rail"><div class="kpi-tier-fill" style="width:${rankProgress}%"></div></div>
                    ${['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'].map((tier, i) => `<div class="kpi-tier-stop ${liveData.userXp !== null && userXp >= i * 1000 ? 'is-reached' : ''}" style="left:${i * 25}%"><span class="kpi-tier-dot"></span><strong>${tier}</strong><small>${(i * 1000).toLocaleString()}</small></div>`).join('')}
                  </div>
                  <p class="text-xs font-bold text-purple-600 dark:text-purple-300">${liveData.userXp === null ? 'No calculated XP yet' : userXp >= 4000 ? 'Diamond unlocked — keep building your lead!' : `${xpToNext.toLocaleString()} XP to ${nextRankName}`}</p>
                </div>
              <!-- Actions align with the branch title and progress track. -->
              <div class="kpi-hero-actions">
                <div class="flex flex-wrap items-center gap-2">
                  <button id="btn-open-daily-modal" class="h-8 px-3 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#5637EA] text-white text-[10px] font-black uppercase tracking-wide shadow-sm hover:scale-105 active:scale-95 transition-all inline-flex items-center gap-1">
                    <i data-lucide="bell-ring" class="w-3 h-3"></i> View daily missions
                  </button>
                  ${isAdmin ? `
                    <button id="btn-edit-targets" class="h-8 px-2.5 rounded-lg border border-[#DDCEF9] dark:border-purple-500/20 bg-[#F9F6FF] dark:bg-purple-500/10 text-[#6D35F2] dark:text-purple-300 text-[10px] font-black uppercase tracking-wide hover:bg-[#F3ECFF] transition-colors inline-flex items-center gap-1">
                      <i data-lucide="sliders-horizontal" class="w-3 h-3"></i> Targets
                    </button>
                  ` : ''}
                </div>
              </div>
              </div>
            </div>

            <!-- RIGHT 5 COLS: BRANCH RACE MINI LEADERBOARD -->
            <div class="kpi-branch-race lg:col-span-5 bg-gradient-to-br from-[#29263F] via-[#332D4D] to-[#46345F] text-white rounded-2xl p-3.5 border border-purple-500/20 shadow-xl relative overflow-hidden">
              <div class="kpi-hero-emblem">
                ${liveData.userXp === null ? '<span class="kpi-hero-badge kpi-diamond-emblem" aria-label="Unranked">◇</span>' : `<img src="${TIER_IMAGES[rankName] || '/assets/bronze.png'}" class="kpi-hero-badge" alt="${displayTier} tier" />`}
                <span class="kpi-emblem-label">${liveData.userXp === null ? 'Unranked' : displayTier}</span>
              </div>
              <div class="kpi-race-content space-y-2">
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
                ${leaderboardData.slice(0, 3).map((item, i) => {
      const isMe = item.branch === selectedBranch;
      const rankBadgeImg = i === 0 ? '/assets/gold.png' : (i === 1 ? '/assets/Silver.png' : '/assets/bronze.png');
      return `
                    <div class="flex items-center justify-between px-2.5 py-1.5 rounded-xl ${isMe ? 'bg-purple-400/15 border border-purple-300/30 text-white font-black shadow-sm' : 'bg-white/5 text-slate-300'}">
                      <div class="flex items-center gap-2 min-w-0">
                        <img src="${rankBadgeImg}" class="w-4 h-4 object-contain shrink-0 drop-shadow-sm" alt="Rank ${i + 1}" />
                        <span class="truncate ${isMe ? 'font-black text-amber-300' : 'font-bold'}">#${i + 1} ${item.branch}</span>
                        ${isMe ? '<span class="text-[8px] bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded font-black">YOU</span>' : ''}
                      </div>
                      <span class="font-mono font-extrabold text-xs shrink-0">${item.xp.toLocaleString()} XP</span>
                    </div>
                  `;
    }).join('')}
              </div>

              <div class="text-[8.5px] text-purple-200/70 font-semibold text-center pt-0.5 border-t border-white/10">
                Provisional standings · This month
              </div>
              </div>
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
                      <p class="text-[10px] sm:text-[11px] font-semibold text-[#9AA5B8] dark:text-white/40 truncate">${latestDateLabel}</p>
                    </div>
                  </div>
                  <div class="flex flex-col items-end gap-1.5 shrink-0">
                    <span class="px-2.5 py-1 rounded-full bg-[#F5F0FF] dark:bg-purple-500/10 text-[#6D35F2] dark:text-purple-300 border border-[#E5D9FF] dark:border-purple-500/20 text-[9px] font-black">${completedCount} / 5 COMPLETED</span>
                    ${liveData.latestBusinessDate ? `<button class="kj-link-button text-xs" data-kpi-day="${liveData.latestBusinessDate}">View day →</button>` : ''}
                  </div>
                </div>

                <div class="flex items-center gap-1 my-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5" role="list" aria-label="Daily mission progress: ${completedCount} of 5 completed">
                  ${missionsList.map((mission, index) => {
                    const done = mission.status === 'Completed';
                    const onTrack = mission.status === 'OnTrack';
                    const nodeColor = done
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-white ring-2 ring-emerald-200 dark:ring-emerald-500/30'
                      : onTrack ? 'bg-amber-400 text-slate-900 ring-2 ring-amber-200 dark:ring-amber-500/20'
                      : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/50';
                    const label = `${dailyRows[index].title}: ${getStatusMeta(mission).label}`;
                    return `<div class="flex items-center ${index < 4 ? 'flex-1' : ''} min-w-0" role="listitem" aria-label="${label}" title="${label}">
                      <span class="w-6 h-6 rounded-full ${nodeColor} flex items-center justify-center text-[10px] font-black shrink-0 transition-all duration-300">
                        ${done ? '<i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]" aria-hidden="true"></i>' : index + 1}
                      </span>
                      ${index < 4 ? `<span class="h-1 flex-1 mx-1 rounded-full ${done ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-slate-200 dark:bg-white/10'}" aria-hidden="true"></span>` : ''}
                    </div>`;
                  }).join('')}
                </div>
                ${renderDailySnapshot(liveData, true)}
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
                    <div class="min-w-0"><h2 class="text-sm sm:text-base font-black text-[#19243A] dark:text-white tracking-tight">MONTHLY CHALLENGES (BOSS QUEST)</h2><p class="text-[10px] sm:text-[11px] font-semibold text-[#9AA5B8] dark:text-white/40">${monthLabel} · +${liveData.monthlyXp ?? '—'} XP · Provisional</p></div>
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
                    <div class="h-full rounded-full bg-gradient-to-r from-purple-600 via-indigo-500 to-amber-400 transition-all duration-700 shadow-[0_0_10px_rgba(124,58,237,0.3)]" style="width:${Math.round((monthlyCompletedCount / 5) * 100)}%"></div>
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
              <span class="text-[10px] font-black text-[#6D35F2] dark:text-purple-300">${liveData.userXp === null ? 'UNRANKED' : rankName.toUpperCase()} • ${liveData.userXp === null ? '—' : userXp.toLocaleString()} XP</span>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-4 gap-2.5">
            ${[
        ['/assets/bronze.png', 'Bronze', '0–999 XP', 'Build the habit', '#FFF8ED', '#B45309'],
        ['/assets/Silver.png', 'Silver', '1,000–1,999 XP', 'Consistent momentum', '#F4F7FA', '#64748B'],
        ['/assets/gold.png', 'Gold', '2,000–2,999 XP', 'High performance', '#FFF9E8', '#B7791F'],
        ['/assets/Platinum.png', 'Platinum', '3,000–3,999 XP', 'Outstanding branch', '#F6F0FF', '#7C3AED']
      ].map(([imgSrc, name, range, desc, bg, color]) => `
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
            <div class="rounded-xl bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10 p-3"><div class="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 text-[10px] font-black"><i data-lucide="flame" class="w-3.5 h-3.5"></i> STREAK MILESTONES</div><p class="text-[9px] text-[#6C7484] dark:text-white/45 mt-1.5 leading-relaxed">Planned rules, not awarded yet: 3-day streak +50 XP; 7-day streak +150 XP.</p></div>
            <div class="rounded-xl bg-purple-50 dark:bg-purple-500/5 border border-purple-100 dark:border-purple-500/10 p-3"><div class="flex items-center gap-1.5 text-purple-700 dark:text-purple-300 text-[10px] font-black"><i data-lucide="award" class="w-3.5 h-3.5"></i> BRANCH CHAMPION</div><p class="text-[9px] text-[#6C7484] dark:text-white/45 mt-1.5 leading-relaxed">Recognize normalized target achievement and overall KPI consistency—not raw revenue alone.</p></div>
            <div class="rounded-xl bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10 p-3"><div class="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-[10px] font-black"><i data-lucide="shield-check" class="w-3.5 h-3.5"></i> QUALITY GATE</div><p class="text-[9px] text-[#6C7484] dark:text-white/45 mt-1.5 leading-relaxed">Food App Incident remains a control KPI so strong sales never hide operational quality issues.</p></div>
          </div>
        </section>
      </div>
      </div>
      <div id="kpi-panel-journey" role="region" aria-label="KPI journey" ${activeView !== 'journey' ? 'hidden' : ''}>${activeView === 'journey' ? renderKPIJourney(liveData, { year: selectedYear, month: selectedMonth, selectedDate: journeyDate }) : ''}</div>
      <div id="kpi-panel-points" role="region" aria-label="KPI points" ${activeView !== 'points' ? 'hidden' : ''}>${activeView === 'points' ? renderKPIPoints(liveData, pointFilters) : ''}</div>
    `;

    page.querySelector('#kpi-retry')?.addEventListener('click', loadBranchData);
    const controlsRoot = headerControls || page;
    controlsRoot.onclick = event => {
      const option = event.target.closest?.('[data-kpi-choice]');
      if (!option) return;
      const id = { Branch: 'kpi-branch-select', Month: 'kpi-month', View: 'kpi-view-select' }[option.dataset.kpiChoice];
      const input = controlsRoot.querySelector(`#${id}`);
      if (!input) return;
      input.value = option.dataset.value;
      input.dispatchEvent(new Event('change'));
    };
    controlsRoot.querySelector('#kpi-view-select')?.addEventListener('change', event => {
      if (!['overview', 'journey', 'points'].includes(event.target.value)) return;
      activeView = event.target.value;
      renderContent();
      (headerControls || page).querySelector('#kpi-view-select')?.focus?.();
    });
    controlsRoot.querySelector('#kpi-month')?.addEventListener('change', event => {
      const match = /^(\d{4})-(\d{2})$/.exec(event.target.value);
      if (!match || +match[2] < 1 || +match[2] > 12) return;
      selectedYear = +match[1]; selectedMonth = +match[2];
      loadBranchData();
    });
    const branchSelect = controlsRoot.querySelector('#kpi-branch-select');
    if (branchSelect) {
      branchSelect.onchange = (e) => {
        if (!allowedBranches.includes(e.target.value)) return;
        selectedBranch = e.target.value;
        currentTarget = { ...(BRANCH_TARGETS[selectedBranch] || BRANCH_TARGETS['Pioneer Center']) };
        loadBranchData();
      };
    }

    const openModalBtn = page.querySelector('#btn-open-daily-modal');
    if (openModalBtn) {
      openModalBtn.onclick = () => {
        window.dispatchEvent(new CustomEvent('open-kpi-modal', { detail: { branch: selectedBranch, year: selectedYear, month: selectedMonth } }));
      };
    }

    const editBtn = page.querySelector('#btn-edit-targets');
    if (editBtn) {
      editBtn.disabled = !['ready', 'empty'].includes(loadState);
      editBtn.onclick = () => {
        const editingBranch = selectedBranch;
        const originalTarget = { ...currentTarget };
        showTargetModal(editingBranch, originalTarget, async (newTargets) => {
          const updatedTarget = { ...originalTarget, ...newTargets };
          const targetDocId = `target_${editingBranch.replace(/\s+/g, '')}`;
          await setDoc(doc(db, 'kpi_targets', targetDocId), {
            ...updatedTarget,
            updatedAt: serverTimestamp()
          });
          if (window.showToast) window.showToast(`Targets updated for ${editingBranch}`, 'success');
          if (selectedBranch === editingBranch) await loadBranchData();
        });
      };
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // Delegate history controls so rerenders never accumulate event handlers.
  page.addEventListener('click', event => {
    const control = event.target.closest?.('[data-kpi-view], [data-kpi-day], [data-kpi-points-date], [data-kpi-points-page], [data-kpi-points-reset]');
    if (!control || control.disabled) return;
    const data = control.dataset;
    if (data.kpiView) {
      if (!['overview', 'journey', 'points'].includes(data.kpiView)) return;
      activeView = data.kpiView;
    } else if (data.kpiDay) {
      const prefix = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-`;
      const day = Number(data.kpiDay.slice(-2));
      if (!data.kpiDay.startsWith(prefix) || day < 1 || day > new Date(selectedYear, selectedMonth, 0).getDate()) return;
      journeyDate = data.kpiDay;
      activeView = 'journey';
    } else if (data.kpiPointsDate) {
      pointFilters = { date: data.kpiPointsDate, kind: 'daily', status: '', page: 0 };
      activeView = 'points';
    } else if (data.kpiPointsPage !== undefined) {
      pointFilters.page = Math.max(0, Number(data.kpiPointsPage) || 0);
    } else {
      pointFilters = { date: '', kind: '', status: '', page: 0 };
    }
    renderContent();
    if (data.kpiView) (headerControls || page).querySelector('#kpi-view-select')?.focus?.();
    if (data.kpiDay) page.querySelector(`[data-kpi-day="${journeyDate}"][aria-pressed="true"]`)?.focus?.();
  });
  page.addEventListener('change', event => {
    const field = event.target.dataset?.kpiPointFilter;
    if (!['date', 'kind', 'status'].includes(field)) return;
    pointFilters[field] = event.target.value;
    pointFilters.page = 0;
    renderContent();
    page.querySelector(`[data-kpi-point-filter="${field}"]`)?.focus?.();
  });

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
        <label class="block text-xs text-slate-600 dark:text-slate-300">Monthly Net Target (₱)<input id="input-monthlyNet" type="number" value="${currentTargets.monthlyNet}" class="w-full p-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10" /></label>
        <label class="block text-xs text-slate-600 dark:text-slate-300">Shift 1 hours (start included, end excluded)<input id="input-shift1Time" type="text" value="${currentTargets.shift1Time}" class="w-full p-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10" /></label>
        <label class="block text-xs text-slate-600 dark:text-slate-300">Shift 2 hours (supports midnight crossing)<input id="input-shift2Time" type="text" value="${currentTargets.shift2Time}" class="w-full p-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10" /></label>
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

  modal.querySelector('#btn-save-target').onclick = async () => {
    const button = modal.querySelector('#btn-save-target');
    const values = {};
    for (const field of ['shift1', 'shift2', 'avo', 'drink', 'incident', 'monthlyNet']) {
      const raw = modal.querySelector(`#input-${field}`).value.trim();
      const value = Number(raw);
      if (!raw || !Number.isFinite(value) || (field === 'incident' ? value < 0 : value <= 0) || (['drink', 'incident'].includes(field) && value > 100)) {
        window.showToast?.('Targets must be positive numbers; incident may be zero and percentages cannot exceed 100.', 'error');
        return;
      }
      values[field] = value;
    }
    for (const field of ['shift1Time', 'shift2Time']) {
      values[field] = modal.querySelector(`#input-${field}`).value.trim();
      if (!parseWindow(values[field])) {
        window.showToast?.('Use whole-hour windows, e.g. 17:00 - 2:00. Start and end must differ.', 'error');
        return;
      }
    }
    const windows = [parseWindow(values.shift1Time), parseWindow(values.shift2Time)];
    const contains = ([start, end], hour) => start < end ? hour >= start && hour < end : hour >= start || hour < end;
    if (Array.from({ length: 24 }, (_, hour) => hour).some(hour => windows.every(window => contains(window, hour)))) {
      window.showToast?.('Shift windows must not overlap.', 'error');
      return;
    }
    button.disabled = true;
    try {
      await onSave(values);
      modal.remove();
    } catch (err) {
      console.error('Failed to save KPI targets:', err);
      window.showToast?.('Could not save targets. Please retry.', 'error');
    } finally {
      button.disabled = false;
    }
  };
}

async function loadBranchKPI(branch, year, month) {
  if (!BRANCH_TARGETS[branch]) throw new Error('Invalid KPI branch');
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const [targetSnap, settingsSnap, salesSnap, incidentResult] = await Promise.all([
    getDoc(doc(db, 'kpi_targets', `target_${branch.replace(/\s+/g, '')}`)),
    getDoc(doc(db, 'kpi_settings', branch)),
    getDocs(query(collection(db, 'daily_sales'), where('branchId', '==', branch), where('date', '>=', monthStart), where('date', '<', nextMonth))),
    getDocs(query(collection(db, 'grab_adjustments'), where('date', '>=', monthStart), where('date', '<', nextMonth)))
      .then(snapshot => ({ snapshot }), error => ({ error }))
  ]);
  const target = { ...BRANCH_TARGETS[branch], ...(targetSnap.exists() ? targetSnap.data() : {}) };
  const rows = salesSnap.docs.map(snap => snap.data());
  const adjustments = incidentResult.snapshot?.docs.map(snap => ({ ...snap.data(), id: snap.id })) || [];
  const metrics = calculateMetrics(rows, target, {
    adjustments, incidentAvailable: !incidentResult.error,
    dailyTarget: settingsSnap.exists() ? settingsSnap.data().daily_dinein : null,
    monthDays: new Date(year, month, 0).getDate()
  });
  metrics.incidentSourceError = Boolean(incidentResult.error);
  return { target, metrics };
}

export async function fetchTodayBranchKPI(branchName, period = {}) {
  const now = new Date();
  const { target, metrics } = await loadBranchKPI(branchName, period.year || now.getFullYear(), period.month || now.getMonth() + 1);
  return {
    ...metrics, branchId: branchName, shift1Target: target.shift1, shift2Target: target.shift2,
    avoTarget: target.avo, drinkTarget: target.drink, incidentTarget: target.incident,
    shift1Time: target.shift1Time, shift2Time: target.shift2Time, monthlyNetTarget: target.monthlyNet
  };
}
