import { progress, missionStat, formatPercent, formatMoney } from '../utils/kpiMetrics.js';
// src/components/KPIMissionModal.js

export function showKPIMissionModal(user, branchData, onNavigateToKPIBoard, forceShow = false) {
  // Check session flag unless forceShow is explicitly requested
  if (!forceShow && sessionStorage.getItem('kpi_modal_dismissed') === 'true') {
    return;
  }

  const branchName = branchData?.branchId || user?.permissions?.allowedBranches?.[0] || 'Ayala Cloverleaf';
  const managerName = user?.displayName || 'Branch Manager';

  // KPI values from the shared loader; missing values must remain unavailable.
  const shift1Actual = branchData?.shift1Actual ?? null;
  const shift1Target = branchData?.shift1Target ?? null;
  const shift1Pct = progress(shift1Actual, shift1Target);

  const shift2Actual = branchData?.shift2Actual ?? null;
  const shift2Target = branchData?.shift2Target ?? null;
  const shift2Pct = progress(shift2Actual, shift2Target);

  const avoActual = branchData?.avoActual ?? null;
  const avoTarget = branchData?.avoTarget ?? null;
  const avoPct = progress(avoActual, avoTarget);

  const drinkActual = branchData?.drinkActual ?? null;
  const drinkTarget = branchData?.drinkTarget ?? null;
  const drinkPct = progress(drinkActual, drinkTarget);

  const incidentActual = branchData?.incidentActual ?? null;
  const incidentTarget = branchData?.incidentTarget ?? null;
  const incidentCompleted = incidentActual === null || incidentTarget === null ? null : incidentActual <= incidentTarget;

  // Gamified Mission Status & XP Calculator
  const getMissionStat = missionStat;

  const m1 = getMissionStat(shift1Pct);
  const m2 = getMissionStat(shift2Pct);
  const m3 = getMissionStat(avoPct);
  const m4 = getMissionStat(drinkPct);
  const m5 = getMissionStat(0, true, incidentCompleted);

  const missionsList = [m1, m2, m3, m4, m5];
  const completedCount = missionsList.filter(m => m.status === 'Completed').length;
  const onTrackCount = missionsList.filter(m => m.status === 'OnTrack').length;
  const lockedCount = missionsList.filter(m => m.status === 'NeedsPush').length;

  const earnedXp = missionsList.reduce((acc, m) => acc + m.xp, 0) + (completedCount === 5 ? 100 : 0);
  const overallPct = Math.round(((completedCount + onTrackCount * 0.5) / 5) * 100);

  const fmtCurrency = formatMoney;

  // Helper to render dynamic XP Badge per card
  function renderXPBadge(stat, targetHint = '') {
    if (stat.status === 'Unavailable') return '<span class="text-xs text-slate-500">No data · No XP yet</span>';
    if (stat.status === 'Completed') {
      return `
        <div class="flex items-center justify-between text-[9px]">
          <span class="font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20 flex items-center gap-1">
            <i data-lucide="check-circle-2" class="w-2.5 h-2.5"></i> +50 PROVISIONAL XP
          </span>
          <span class="text-slate-400 font-medium">Target Achieved! 🏆</span>
        </div>`;
    } else if (stat.status === 'OnTrack') {
      return `
        <div class="flex items-center justify-between text-[9px]">
          <span class="font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-500/20 flex items-center gap-1">
            <i data-lucide="zap" class="w-2.5 h-2.5"></i> +25 PROVISIONAL XP
          </span>
          <span class="text-blue-500 font-bold">Push to 100% for full +50 XP!</span>
        </div>`;
    } else {
      return `
        <div class="flex items-center justify-between text-[9px]">
          <span class="font-black text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-white/10 flex items-center gap-1">
            <i data-lucide="lock" class="w-2.5 h-2.5"></i> 0 / +50 XP (LOCKED)
          </span>
          <span class="text-amber-600 dark:text-amber-400 font-bold">Push target to unlock XP</span>
        </div>`;
    }
  }

  // Create Modal DOM
  const modal = document.createElement('div');
  modal.id = 'kpi-mission-modal-overlay';
  modal.className = 'fixed inset-0 z-[30000] flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-md animate-fade-in overflow-y-auto';

  modal.innerHTML = `
    <div class="kpi-missions-dialog luxury-card bg-white dark:bg-[#141414] w-full rounded-3xl shadow-2xl animate-scale-up border border-slate-100 dark:border-white/10 relative my-auto" role="dialog" aria-modal="true" aria-labelledby="kpi-missions-title">
      <div class="kpi-missions-content">
      
      <p role="status" class="text-xs text-amber-700 dark:text-amber-300 pr-8 mb-3">
        ${branchData?.latestBusinessDate ? `Evaluation date: ${branchData.latestBusinessDate} · Latest recorded Dine In business date` : branchData && !branchData.loadError ? 'No Dine In data for this month' : 'Could not load KPI data'}.
        XP is provisional; missing metrics earn no points.
      </p>
      <!-- Close X Button -->
      <button id="btn-close-kpi-modal" aria-label="Close KPI missions" class="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white hover:scale-110 active:scale-95 transition-all">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>

      <!-- Modal Header -->
      <div class="kpi-missions-heading flex items-center gap-3 mb-5">
        <div class="w-11 h-11 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-purple-500/25 shrink-0">
          <i data-lucide="target" class="w-6 h-6"></i>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 id="kpi-missions-title" class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Latest Recorded KPI Missions</h2>
          </div>
          <p class="text-[10px] font-bold text-slate-400 dark:text-white/60 tracking-wide uppercase">${branchName} • Branch Manager Tasks</p>
        </div>
      </div>

      <!-- Overall Mission Progress Card -->
      <div class="kpi-missions-summary grid grid-cols-1 md:grid-cols-12 gap-3 mb-5">
        <div class="md:col-span-7 bg-slate-50 dark:bg-white/5 rounded-2xl p-4 border border-slate-100 dark:border-white/10 flex items-center gap-3">
          <div class="relative w-13 h-13 shrink-0 flex items-center justify-center">
            <svg class="w-13 h-13 transform -rotate-90" viewBox="0 0 36 36">
              <path class="text-slate-200 dark:text-white/10" stroke-width="4" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path class="text-emerald-500 transition-all duration-1000 stroke-current" stroke-dasharray="${overallPct}, 100" stroke-width="4" stroke-linecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <span class="absolute font-black text-xs text-slate-800 dark:text-white font-mono">${overallPct}%</span>
          </div>
          <div>
            <h4 class="text-xs sm:text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">Mission Status Overview</h4>
            <div class="flex items-center gap-1 flex-wrap my-1">
              <span class="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">${completedCount} Completed</span>
              <span class="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300">${onTrackCount} On Track</span>
              <span class="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">${lockedCount} Locked</span>
            </div>
            <p class="text-[10px] font-bold text-slate-500 dark:text-white/60">Results use the evaluation date above; rewards are not finalized.</p>
          </div>
        </div>

        <div class="md:col-span-5 bg-gradient-to-br from-purple-900 to-indigo-900 rounded-2xl p-4 text-white flex flex-col justify-center relative overflow-hidden shadow-lg shadow-purple-900/20">
          <div class="absolute -right-3 -bottom-3 w-20 h-20 bg-white/10 rounded-full blur-lg pointer-events-none"></div>
          <div class="flex items-center gap-2.5 mb-1">
            <div class="w-8 h-8 rounded-lg bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
              <i data-lucide="trophy" class="w-4 h-4"></i>
            </div>
            <div>
              <span class="text-[8.5px] font-black uppercase tracking-widest text-purple-200">Provisional XP</span>
              <h5 class="text-lg font-black text-amber-300 tracking-tight">+${earnedXp} / 350 XP</h5>
            </div>
          </div>
          <p class="text-[9px] font-bold text-purple-200 uppercase tracking-wider">+ Branch Star Badge 🌟</p>
        </div>
      </div>

      <!-- 5 Daily Mission Cards Grid -->
      <div class="kpi-missions-grid grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-5">
        
        <!-- Mission 1: Shift 1 Sales -->
        <div class="bg-white dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-white/10 shadow-sm hover:shadow-md transition-all ${m1.status === 'Completed' ? 'border-emerald-500/30 dark:border-emerald-500/30' : ''}">
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
              </div>
              <div>
                <h5 class="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-tight">Shift 1 Sales</h5>
                <span class="text-[8.5px] font-bold text-slate-400">7:00 - 16:00</span>
              </div>
            </div>
            ${renderStatusPill(shift1Pct)}
          </div>
          <div class="flex items-center justify-between text-xs font-mono font-bold mb-1">
            <span class="text-slate-800 dark:text-white font-black">${fmtCurrency(shift1Actual)}</span>
            <span class="text-slate-400">/ ${fmtCurrency(shift1Target)}</span>
          </div>
          <div class="w-full bg-slate-100 dark:bg-white/10 rounded-full h-1.5 mb-1.5 overflow-hidden">
            <div class="bg-gradient-to-r from-orange-500 to-amber-400 h-full rounded-full transition-all duration-500" style="width: ${shift1Pct ?? 0}%"></div>
          </div>
          ${renderXPBadge(m1)}
        </div>

        <!-- Mission 2: Shift 2 Sales -->
        <div class="bg-white dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-white/10 shadow-sm hover:shadow-md transition-all ${m2.status === 'Completed' ? 'border-emerald-500/30 dark:border-emerald-500/30' : ''}">
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
              </div>
              <div>
                <h5 class="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-tight">Shift 2 Sales</h5>
                <span class="text-[8.5px] font-bold text-slate-400">17:00 - 1:00</span>
              </div>
            </div>
            ${renderStatusPill(shift2Pct)}
          </div>
          <div class="flex items-center justify-between text-xs font-mono font-bold mb-1">
            <span class="text-slate-800 dark:text-white font-black">${fmtCurrency(shift2Actual)}</span>
            <span class="text-slate-400">/ ${fmtCurrency(shift2Target)}</span>
          </div>
          <div class="w-full bg-slate-100 dark:bg-white/10 rounded-full h-1.5 mb-1.5 overflow-hidden">
            <div class="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-500" style="width: ${shift2Pct ?? 0}%"></div>
          </div>
          ${renderXPBadge(m2)}
        </div>

        <!-- Mission 3: Average Order Value (AVO) -->
        <div class="bg-white dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-white/10 shadow-sm hover:shadow-md transition-all ${m3.status === 'Completed' ? 'border-emerald-500/30 dark:border-emerald-500/30' : ''}">
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <i data-lucide="shopping-bag" class="w-3.5 h-3.5"></i>
              </div>
              <div>
                <h5 class="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-tight">Average Order Value</h5>
                <span class="text-[8.5px] font-bold text-slate-400">AVO Target</span>
              </div>
            </div>
            ${renderStatusPill(avoPct)}
          </div>
          <div class="flex items-center justify-between text-xs font-mono font-bold mb-1">
            <span class="text-slate-800 dark:text-white font-black">Current: ${fmtCurrency(avoActual)}</span>
            <span class="text-slate-400">Target: ${fmtCurrency(avoTarget)}</span>
          </div>
          <div class="w-full bg-slate-100 dark:bg-white/10 rounded-full h-1.5 mb-1.5 overflow-hidden">
            <div class="bg-gradient-to-r from-purple-500 to-emerald-400 h-full rounded-full transition-all duration-500" style="width: ${avoPct ?? 0}%"></div>
          </div>
          ${renderXPBadge(m3)}
        </div>

        <!-- Mission 4: Drink Attachment -->
        <div class="bg-white dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-white/10 shadow-sm hover:shadow-md transition-all ${m4.status === 'Completed' ? 'border-emerald-500/30 dark:border-emerald-500/30' : ''}">
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <i data-lucide="cup-soda" class="w-3.5 h-3.5"></i>
              </div>
              <div>
                <h5 class="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-tight">Drink Attachment</h5>
                <span class="text-[8.5px] font-bold text-slate-400">Drink Rate Target</span>
              </div>
            </div>
            ${renderStatusPill(drinkPct)}
          </div>
          <div class="flex items-center justify-between text-xs font-mono font-bold mb-1">
            <span class="text-slate-800 dark:text-white font-black">Current: ${formatPercent(drinkActual)}</span>
            <span class="text-slate-400">Target: ${formatPercent(drinkTarget)}</span>
          </div>
          <div class="w-full bg-slate-100 dark:bg-white/10 rounded-full h-1.5 mb-1.5 overflow-hidden">
            <div class="bg-gradient-to-r from-blue-500 to-emerald-400 h-full rounded-full transition-all duration-500" style="width: ${drinkPct ?? 0}%"></div>
          </div>
          ${renderXPBadge(m4)}
        </div>

        <!-- Mission 5: Food App Incident (Full width on sm) -->
        <div class="sm:col-span-2 bg-white dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-white/10 shadow-sm hover:shadow-md transition-all ${m5.status === 'Completed' ? 'border-emerald-500/30 dark:border-emerald-500/30' : ''}">
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <i data-lucide="shield-check" class="w-3.5 h-3.5"></i>
              </div>
              <div>
                <h5 class="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-tight">Food App Incident Rate</h5>
                <span class="text-[8.5px] font-bold text-slate-400">Control Target (Grab & FoodPanda)</span>
              </div>
            </div>
            ${incidentCompleted === null ? '<span class="text-xs text-slate-500">No data</span>' : incidentCompleted
              ? '<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><i data-lucide="check-circle" class="w-2.5 h-2.5"></i> Completed</span>'
              : '<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 flex items-center gap-1"><i data-lucide="alert-circle" class="w-2.5 h-2.5"></i> Needs Push</span>'
            }
          </div>
          <div class="flex items-center justify-between text-xs font-mono font-bold mb-1">
            <span class="text-slate-800 dark:text-white font-black">Current: ${formatPercent(incidentActual)}</span>
            <span class="text-slate-400">Target: ≤ ${formatPercent(incidentTarget)}</span>
          </div>
          <div class="w-full bg-slate-100 dark:bg-white/10 rounded-full h-1.5 mb-1.5 overflow-hidden">
            <div class="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500" style="width: ${incidentCompleted === null ? 0 : incidentCompleted ? 100 : 50}%"></div>
          </div>
          ${renderXPBadge(m5)}
        </div>

      </div>

      <!-- Footer Action Area -->
      <div class="kpi-missions-footer flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-white/10">
        <div class="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-white/60">
          <i data-lucide="gamepad-2" class="w-3.5 h-3.5 text-purple-500 shrink-0"></i>
          <span>Complete missions to keep your branch on target. Great operations create greater moments!</span>
        </div>
        <div class="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <button id="btn-remind-later" class="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white text-[10px] font-bold hover:bg-slate-200 transition-all">
            Remind Me Later
          </button>
          <button id="btn-view-kpi-board" class="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[10px] sm:text-[11px] font-black uppercase tracking-wider shadow-md shadow-purple-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-1.5">
            <span>View Full KPI Board</span>
            <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>

      </div>
    </div>
  `;

  document.body.appendChild(modal);

  if (window.lucide) {
    window.lucide.createIcons();
  }

  const dialog = modal.querySelector('.kpi-missions-dialog');
  const content = modal.querySelector('.kpi-missions-content');
  const fitModal = () => {
    const viewport = window.visualViewport;
    const scale = Math.min(1, ((viewport?.width || window.innerWidth) - 24) / 1200,
      ((viewport?.height || window.innerHeight) - 24) / 640);
    dialog.style.transform = `translate(-50%, -50%) scale(${Math.max(.1, scale)})`;
    content.style.transform = `scale(${Math.min(1, 592 / content.scrollHeight)})`;
  };
  const contentObserver = new ResizeObserver(fitModal);
  contentObserver.observe(content);
  window.addEventListener('resize', fitModal);
  window.visualViewport?.addEventListener('resize', fitModal);
  fitModal();

  // Event Handlers
  const closeModal = () => {
    contentObserver.disconnect();
    window.removeEventListener('resize', fitModal);
    window.visualViewport?.removeEventListener('resize', fitModal);
    modal.classList.add('animate-fade-out');
    setTimeout(() => modal.remove(), 200);
  };

  modal.querySelector('#btn-close-kpi-modal').onclick = () => {
    sessionStorage.setItem('kpi_modal_dismissed', 'true');
    closeModal();
  };

  modal.querySelector('#btn-remind-later').onclick = () => {
    sessionStorage.setItem('kpi_modal_dismissed', 'true');
    closeModal();
  };

  modal.querySelector('#btn-view-kpi-board').onclick = () => {
    sessionStorage.setItem('kpi_modal_dismissed', 'true');
    closeModal();
    if (onNavigateToKPIBoard) {
      onNavigateToKPIBoard();
    }
  };
}

function renderStatusPill(pct) {
  if (pct === null) return '<span class="text-xs text-slate-500">No data</span>';
  if (pct >= 100) {
    return `<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><i data-lucide="check-circle" class="w-2.5 h-2.5"></i> Completed</span>`;
  } else if (pct >= 80) {
    return `<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><i data-lucide="trending-up" class="w-2.5 h-2.5"></i> On Track</span>`;
  } else {
    return `<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center gap-1"><i data-lucide="alert-triangle" class="w-2.5 h-2.5"></i> Needs Push</span>`;
  }
}
