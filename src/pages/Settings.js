import { db } from '../firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, orderBy, limit, deleteDoc, writeBatch } from 'firebase/firestore';

export function renderSettings() {
  const page = document.createElement('div');
  page.className = 'p-6 page-enter max-w-5xl mx-auto h-full flex flex-col';
  let expenseMappingState = [];

  const BRANCHES = ['Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf'];
  
  page.innerHTML = `
    <div class="flex flex-col md:flex-row gap-8 h-full">
      <!-- Left Menu Sidebar -->
      <div class="w-full md:w-64 shrink-0 space-y-2">
         <h2 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter mb-6 px-2">Settings</h2>
         
         <button class="settings-tab active w-full text-left px-5 py-3.5 rounded-2xl font-bold text-sm bg-purple-50 dark:bg-slate-800 text-[#96588a] dark:text-purple-400 transition-all flex items-center gap-3" data-tab="general">
            <i data-lucide="settings-2" class="w-4 h-4"></i> General
         </button>
         
         <button class="settings-tab w-full text-left px-5 py-3.5 rounded-2xl font-bold text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all flex items-center gap-3" data-tab="kpi">
            <i data-lucide="target" class="w-4 h-4"></i> KPI Targets
         </button>
         
         <button class="settings-tab w-full text-left px-5 py-3.5 rounded-2xl font-bold text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all flex items-center gap-3" data-tab="expenses">
            <i data-lucide="wallet" class="w-4 h-4"></i> Expenses Setup
         </button>
         
         <button class="settings-tab w-full text-left px-5 py-3.5 rounded-2xl font-bold text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all flex items-center gap-3" data-tab="history">
            <i data-lucide="history" class="w-4 h-4"></i> Import History
         </button>
      </div>

      <!-- Right Content Area -->
      <div class="flex-1 bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800 p-8 min-h-[500px]">
         
         <!-- IMPORT HISTORY TAB -->
         <div id="tab-history" class="settings-pane hidden space-y-6 animate-fade-in">
            <div class="mb-8">
               <h3 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">Import History & Undo</h3>
               <p class="text-xs text-slate-400 mt-1">Review recent data imports and roll back if necessary.</p>
            </div>

            <div class="overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800">
               <table class="w-full text-left border-collapse">
                  <thead>
                     <tr class="bg-slate-50 dark:bg-slate-800/50">
                        <th class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date/Time</th>
                        <th class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                        <th class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Branch</th>
                        <th class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rows</th>
                        <th class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Action</th>
                     </tr>
                  </thead>
                  <tbody id="import-history-body" class="divide-y divide-slate-50 dark:divide-slate-800/50">
                     <tr><td colspan="5" class="px-6 py-10 text-center text-xs text-slate-400 italic">Loading history...</td></tr>
                  </tbody>
               </table>
            </div>
         </div>
         
         <!-- GENERAL TAB -->
         <div id="tab-general" class="settings-pane space-y-6 animate-fade-in">
            <div class="mb-8">
               <h3 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">General Preferences</h3>
               <p class="text-xs text-slate-400 mt-1">Customize your dashboard experience.</p>
            </div>
            
            <div class="flex items-center justify-between py-4 border-b border-slate-50 dark:border-slate-800/50">
              <div>
                <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">Dark Mode</p>
                <p class="text-[10px] text-slate-400">Toggle system theme</p>
              </div>
              <button id="st-dark-toggle" class="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all">
                <i data-lucide="moon" class="w-5 h-5"></i>
              </button>
            </div>

            <div class="flex items-center justify-between py-4 border-b border-slate-50 dark:border-slate-800/50">
              <div>
                <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">System Currency</p>
                <p class="text-[10px] text-slate-400">Default symbol for financial data</p>
              </div>
              <span class="text-xs font-black text-[#96588a] bg-purple-50 dark:bg-purple-900/20 px-4 py-2 rounded-xl">₱ PHP</span>
            </div>

            <div class="flex items-center justify-between py-4">
              <div>
                <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">App Version</p>
                <p class="text-[10px] text-slate-400">SO MOT Dashboard</p>
              </div>
              <span class="text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-lg flex items-center gap-1"><i data-lucide="shield-check" class="w-3 h-3"></i> 2.0.4 Premium</span>
            </div>
         </div>

         <!-- KPI TAB -->
         <div id="tab-kpi" class="settings-pane hidden space-y-6 animate-fade-in">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
               <div>
                 <h3 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">KPI Configuration</h3>
                 <p class="text-xs text-slate-400 mt-1">Set daily revenue targets per channel.</p>
               </div>
               <div class="relative">
                 <select id="kpi-branch-select" class="pl-4 pr-10 py-2.5 rounded-xl text-xs font-black bg-slate-50 dark:bg-slate-800 border-none outline-none appearance-none cursor-pointer text-[#96588a]">
                   ${BRANCHES.map(b => `<option value="${b}">${b}</option>`).join('')}
                 </select>
                 <i data-lucide="chevron-down" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"></i>
               </div>
            </div>

            <div id="kpi-loading" class="py-12 text-center hidden">
               <div class="inline-block w-6 h-6 border-2 border-[#96588a] border-t-transparent rounded-full animate-spin mb-2"></div>
               <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading KPI...</p>
            </div>

            <div id="kpi-inputs" class="grid grid-cols-1 sm:grid-cols-2 gap-5">
               <div class="space-y-1.5 sm:col-span-2">
                 <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Net Sale KPI</label>
                 <div class="relative">
                   <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₱</span>
                   <input type="number" id="kpi-net" class="w-full pl-8 pr-4 py-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-[#96588a]/30 transition-all text-sm font-bold text-slate-700 dark:text-white outline-none">
                 </div>
               </div>
               <div class="space-y-1.5">
                 <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dine In KPI</label>
                 <input type="number" id="kpi-dinein" class="w-full px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-blue-400/30 transition-all text-sm font-bold text-slate-700 dark:text-white outline-none">
               </div>
               <div class="space-y-1.5">
                 <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">GrabFood KPI</label>
                 <input type="number" id="kpi-grab" class="w-full px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-emerald-400/30 transition-all text-sm font-bold text-slate-700 dark:text-white outline-none">
               </div>
               <div class="space-y-1.5">
                 <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">FoodPanda KPI</label>
                 <input type="number" id="kpi-panda" class="w-full px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-pink-400/30 transition-all text-sm font-bold text-slate-700 dark:text-white outline-none">
               </div>
               <div class="space-y-1.5">
                 <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Online Order KPI</label>
                 <input type="number" id="kpi-online" class="w-full px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-purple-400/30 transition-all text-sm font-bold text-slate-700 dark:text-white outline-none">
               </div>
               <div class="sm:col-span-2 pt-4">
                 <button id="save-kpi-btn" class="w-full py-4 bg-gradient-to-r from-[#96588a] to-[#7a4671] text-white rounded-xl text-xs font-black shadow-lg shadow-purple-500/20 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-2 uppercase tracking-widest">
                   <i data-lucide="save" class="w-4 h-4"></i> Save KPI Settings
                 </button>
               </div>
            </div>
         </div>

         <!-- EXPENSES TAB -->
         <div id="tab-expenses" class="settings-pane hidden space-y-6 animate-fade-in">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
               <div>
                 <h3 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">Expenses Setup</h3>
                 <p class="text-xs text-slate-400 mt-1">Configure petty cash funds and dropdown options.</p>
               </div>
               <div class="relative">
                 <select id="exp-branch-select" class="pl-4 pr-10 py-2.5 rounded-xl text-xs font-black bg-slate-50 dark:bg-slate-800 border-none outline-none appearance-none cursor-pointer text-[#96588a]">
                   ${BRANCHES.map(b => `<option value="${b}">${b}</option>`).join('')}
                 </select>
                 <i data-lucide="chevron-down" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"></i>
               </div>
            </div>

            <div id="exp-loading" class="py-12 text-center hidden">
               <div class="inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2"></div>
               <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading Setup...</p>
            </div>

            <div id="exp-inputs" class="space-y-8">
               <!-- Petty Cash Base Fund (Branch Specific) -->
               <div class="space-y-2">
                 <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <i data-lucide="coins" class="w-3.5 h-3.5 text-amber-500"></i> Petty Cash Base Fund (Selected Branch)
                 </label>
                 <div class="relative">
                   <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₱</span>
                   <input type="number" id="exp-base-fund" class="w-full pl-8 pr-4 py-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-amber-500/30 transition-all text-sm font-bold text-slate-700 dark:text-white outline-none" placeholder="0.00">
                 </div>
               </div>

               <div class="h-px w-full bg-slate-50 dark:bg-slate-800/50"></div>

               <!-- Global Options -->
               <div>
                  <h4 class="text-sm font-bold text-slate-800 dark:text-white mb-1">Global Dropdown Options</h4>
                  <p class="text-[10px] text-slate-400 mb-4">These options apply to all branches. Separate items by comma (,).</p>
                  
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div class="space-y-2">
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                           <i data-lucide="list" class="w-3.5 h-3.5 text-blue-500"></i> Categories
                        </label>
                        <textarea id="exp-categories" rows="4" class="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-blue-500/30 transition-all text-sm font-medium text-slate-700 dark:text-white outline-none resize-none" placeholder="General, Utilities, Logistics..."></textarea>
                     </div>
                     <div class="space-y-2">
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                           <i data-lucide="tag" class="w-3.5 h-3.5 text-emerald-500"></i> Purposes
                        </label>
                        <textarea id="exp-purposes" rows="4" class="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-emerald-500/30 transition-all text-sm font-medium text-slate-700 dark:text-white outline-none resize-none" placeholder="Delivery Fee, Food, Internet..."></textarea>
                     </div>
                  </div>
               </div>

               <div class="h-px w-full bg-slate-50 dark:bg-slate-800/50"></div>

               <div class="space-y-3">
                  <div class="flex items-center justify-between gap-3">
                     <div>
                        <h4 class="text-sm font-bold text-slate-800 dark:text-white mb-1">Cashier Smart Mapping (Form Builder)</h4>
                        <p class="text-[10px] text-slate-400">Category lớn -> Purpose liên quan -> Autofill mẫu (mỗi dòng là 1 mẫu).</p>
                     </div>
                     <button id="exp-add-mapping-category" type="button" class="px-3 py-2 rounded-lg bg-purple-50 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest text-[#96588a] hover:bg-purple-100 dark:hover:bg-slate-700 transition-all">
                        + Add Category
                     </button>
                  </div>
                  <div id="exp-mapping-builder" class="space-y-4"></div>
               </div>

               <div class="pt-4">
                 <button id="save-exp-btn" class="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-500/20 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-2 uppercase tracking-widest">
                   <i data-lucide="save" class="w-4 h-4"></i> Save Expenses Setup
                 </button>
               </div>
            </div>
         </div>

      </div>
    </div>
  `;

  setTimeout(() => {
    // --- TAB SWITCHING LOGIC ---
    const tabs = page.querySelectorAll('.settings-tab');
    const panes = page.querySelectorAll('.settings-pane');

    tabs.forEach(t => {
       t.onclick = () => {
          const target = t.dataset.tab;
          
          tabs.forEach(btn => {
             btn.classList.remove('bg-purple-50', 'dark:bg-slate-800', 'text-[#96588a]', 'dark:text-purple-400');
             btn.classList.add('text-slate-500');
          });
          t.classList.remove('text-slate-500');
          t.classList.add('bg-purple-50', 'dark:bg-slate-800', 'text-[#96588a]', 'dark:text-purple-400');

          panes.forEach(p => p.classList.add('hidden'));
          page.querySelector(`#tab-${target}`).classList.remove('hidden');

          if (target === 'kpi') loadKPI(page.querySelector('#kpi-branch-select').value);
          if (target === 'expenses') loadExpenses(page.querySelector('#exp-branch-select').value);
          if (target === 'history') loadImportHistory();
       };
    });

    // Handle Undo button clicks (delegation)
    const historyBody = page.querySelector('#import-history-body');
    if (historyBody) {
       historyBody.onclick = async (e) => {
          const btn = e.target.closest('.undo-btn');
          if (!btn) return;
          const batchId = btn.dataset.batchId;
          const type = btn.dataset.type;
          const rowCount = btn.dataset.rowCount;
          
          if (confirm(`Are you sure you want to UNDO this import?\n\nType: ${type}\nRows: ${rowCount}\n\nThis will permanently delete these records from the database.`)) {
             await undoImport(batchId, btn);
          }
       };
    }

    // --- GENERAL LOGIC ---
    const dmToggle = page.querySelector('#st-dark-toggle');
    if(dmToggle) {
        dmToggle.onclick = () => {
           if (typeof window.toggleDarkMode === 'function') window.toggleDarkMode();
        };
    }

    // --- KPI LOGIC ---
    const kpiSelect = page.querySelector('#kpi-branch-select');
    if(kpiSelect) {
        kpiSelect.onchange = (e) => loadKPI(e.target.value);
    }
    const saveKpiBtn = page.querySelector('#save-kpi-btn');
    if(saveKpiBtn) {
        saveKpiBtn.onclick = () => saveKPI(kpiSelect.value);
    }

    // --- EXPENSES LOGIC ---
    const expSelect = page.querySelector('#exp-branch-select');
    if(expSelect) {
        expSelect.onchange = (e) => loadExpenses(e.target.value);
    }
    const saveExpBtn = page.querySelector('#save-exp-btn');
    if(saveExpBtn) {
        saveExpBtn.onclick = () => saveExpenses(expSelect.value);
    }
    const addCategoryBtn = page.querySelector('#exp-add-mapping-category');
    if (addCategoryBtn) {
      addCategoryBtn.onclick = () => {
        expenseMappingState.push({ name: '', defaultDescription: '', purposes: [{ name: '', templatesText: '' }] });
        renderMappingBuilder();
      };
    }

    const mappingBuilder = page.querySelector('#exp-mapping-builder');
    if (mappingBuilder) {
      mappingBuilder.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const cIdx = Number(target.dataset.categoryIndex);
        const pIdx = Number(target.dataset.purposeIndex);

        if (target.dataset.action === 'remove-category' && Number.isInteger(cIdx)) {
          expenseMappingState.splice(cIdx, 1);
          renderMappingBuilder();
        }

        if (target.dataset.action === 'add-purpose' && Number.isInteger(cIdx)) {
          expenseMappingState[cIdx].purposes.push({ name: '', templatesText: '' });
          renderMappingBuilder();
        }

        if (target.dataset.action === 'remove-purpose' && Number.isInteger(cIdx) && Number.isInteger(pIdx)) {
          expenseMappingState[cIdx].purposes.splice(pIdx, 1);
          if (expenseMappingState[cIdx].purposes.length === 0) {
            expenseMappingState[cIdx].purposes.push({ name: '', templatesText: '' });
          }
          renderMappingBuilder();
        }
      });

      mappingBuilder.addEventListener('input', (e) => {
        const target = e.target;
        const cIdx = Number(target.dataset.categoryIndex);
        const pIdx = Number(target.dataset.purposeIndex);
        if (!Number.isInteger(cIdx) || !expenseMappingState[cIdx]) return;

        if (target.dataset.field === 'category-name') expenseMappingState[cIdx].name = target.value;
        if (target.dataset.field === 'category-default') expenseMappingState[cIdx].defaultDescription = target.value;
        if (target.dataset.field === 'purpose-name' && Number.isInteger(pIdx) && expenseMappingState[cIdx].purposes[pIdx]) {
          expenseMappingState[cIdx].purposes[pIdx].name = target.value;
        }
        if (target.dataset.field === 'purpose-templates' && Number.isInteger(pIdx) && expenseMappingState[cIdx].purposes[pIdx]) {
          expenseMappingState[cIdx].purposes[pIdx].templatesText = target.value;
        }
      });
    }

  }, 0);

  // === DATA FUNCTIONS ===
  async function loadKPI(branchId) {
    const loader = page.querySelector('#kpi-loading');
    const inputs = page.querySelector('#kpi-inputs');
    if(loader) loader.classList.remove('hidden');
    if(inputs) inputs.classList.add('hidden');

    try {
      const docSnap = await getDoc(doc(db, 'kpi_settings', branchId));
      const data = docSnap.exists() ? docSnap.data() : {
        daily_net: 0, daily_dinein: 0, daily_grab: 0, daily_panda: 0, daily_online: 0
      };

      page.querySelector('#kpi-net').value = data.daily_net || '';
      page.querySelector('#kpi-dinein').value = data.daily_dinein || '';
      page.querySelector('#kpi-grab').value = data.daily_grab || '';
      page.querySelector('#kpi-panda').value = data.daily_panda || '';
      page.querySelector('#kpi-online').value = data.daily_online || '';
    } catch (err) {
      console.error('Error loading KPI:', err);
    } finally {
      if(loader) loader.classList.add('hidden');
      if(inputs) inputs.classList.remove('hidden');
    }
  }

  async function saveKPI(branchId) {
    const btn = page.querySelector('#save-kpi-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Saving...';

    try {
      const payload = {
        daily_net: parseFloat(page.querySelector('#kpi-net').value) || 0,
        daily_dinein: parseFloat(page.querySelector('#kpi-dinein').value) || 0,
        daily_grab: parseFloat(page.querySelector('#kpi-grab').value) || 0,
        daily_panda: parseFloat(page.querySelector('#kpi-panda').value) || 0,
        daily_online: parseFloat(page.querySelector('#kpi-online').value) || 0,
      };
      // Notice: we merge so we don't overwrite petty_base if it exists here!
      await setDoc(doc(db, 'kpi_settings', branchId), payload, { merge: true });
      
      btn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Saved!';
      btn.classList.remove('from-[#96588a]', 'to-[#7a4671]');
      btn.classList.add('from-emerald-500', 'to-emerald-600');
      
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.add('from-[#96588a]', 'to-[#7a4671]');
        btn.classList.remove('from-emerald-500', 'to-emerald-600');
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
      }, 2000);
    } catch (err) {
      console.error('Error saving KPI:', err);
      btn.innerHTML = 'Error';
      btn.disabled = false;
    }
  }

  async function loadExpenses(branchId) {
    const loader = page.querySelector('#exp-loading');
    const inputs = page.querySelector('#exp-inputs');
    if(loader) loader.classList.remove('hidden');
    if(inputs) inputs.classList.add('hidden');

    try {
      // 1. Load Petty Cash Base Fund (from kpi_settings > petty_base)
      const branchSnap = await getDoc(doc(db, 'kpi_settings', branchId));
      const branchData = branchSnap.exists() ? branchSnap.data() : { petty_base: 0 };
      page.querySelector('#exp-base-fund').value = branchData.petty_base || '';

      // 2. Load Global Categories & Purposes (from settings > expenses_master)
      const globalSnap = await getDoc(doc(db, 'settings', 'expenses_master'));
      const globalData = globalSnap.exists() ? globalSnap.data() : { categories: [], purposes: [] };
      page.querySelector('#exp-categories').value = (globalData.categories || []).join(', ');
      page.querySelector('#exp-purposes').value = (globalData.purposes || []).join(', ');
      expenseMappingState = mappingToState(globalData.categoryMappings || globalData.cashierMappings || {});
      renderMappingBuilder();

    } catch (err) {
      console.error('Error loading Expenses Settings:', err);
    } finally {
      if(loader) loader.classList.add('hidden');
      if(inputs) inputs.classList.remove('hidden');
    }
  }

  async function saveExpenses(branchId) {
    const btn = page.querySelector('#save-exp-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Saving...';

    try {
      // 1. Save Petty Cash Base Fund to kpi_settings
      const baseFund = parseFloat(page.querySelector('#exp-base-fund').value) || 0;
      await setDoc(doc(db, 'kpi_settings', branchId), { petty_base: baseFund }, { merge: true });

      // 2. Save Global Categories & Purposes
      const categoriesRaw = page.querySelector('#exp-categories').value;
      const purposesRaw = page.querySelector('#exp-purposes').value;
      
      const categories = categoriesRaw.split(',').map(s => s.trim()).filter(s => s);
      const purposes = purposesRaw.split(',').map(s => s.trim()).filter(s => s);
      const categoryMappings = stateToMapping(expenseMappingState);
      const mappedCategories = Object.keys(categoryMappings);
      const mappedPurposes = mappedCategories.flatMap(cat => categoryMappings[cat]?.purposeOptions || []);
      const mergedCategories = [...new Set([...categories, ...mappedCategories])];
      const mergedPurposes = [...new Set([...purposes, ...mappedPurposes])];

      await setDoc(doc(db, 'settings', 'expenses_master'), {
         categories: mergedCategories,
         purposes: mergedPurposes,
         categoryMappings
      }, { merge: true });

      btn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Saved!';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
      }, 2000);
    } catch (err) {
      console.error('Error saving Expenses Settings:', err);
      btn.innerHTML = 'Error';
      btn.disabled = false;
    }
  }

  function mappingToState(mappingObj) {
    const entries = Object.entries(mappingObj || {});
    if (entries.length === 0) {
      return [{ name: '', defaultDescription: '', purposes: [{ name: '', templatesText: '' }] }];
    }

    return entries.map(([categoryName, cfg]) => {
      const purposeOptions = Array.isArray(cfg?.purposeOptions) ? cfg.purposeOptions : [];
      const purposeAutoFill = cfg?.purposeAutoFill || {};
      const purposes = purposeOptions.length
        ? purposeOptions.map(name => {
            const raw = purposeAutoFill[name];
            const templates = Array.isArray(raw) ? raw : (raw ? [raw] : []);
            return { name, templatesText: templates.join('\n') };
          })
        : [{ name: '', templatesText: '' }];
      return {
        name: categoryName,
        defaultDescription: cfg?.defaultDescription || '',
        purposes
      };
    });
  }

  function stateToMapping(state) {
    const out = {};
    (state || []).forEach(cat => {
      const catName = (cat.name || '').trim();
      if (!catName) return;
      const validPurposes = (cat.purposes || [])
        .map(p => ({
          name: (p.name || '').trim(),
          templates: (p.templatesText || '').split('\n').map(x => x.trim()).filter(Boolean)
        }))
        .filter(p => p.name);
      const purposeOptions = validPurposes.map(p => p.name);
      const purposeAutoFill = {};
      validPurposes.forEach(p => {
        if (p.templates.length) purposeAutoFill[p.name] = p.templates;
      });

      out[catName] = {
        purposeOptions,
        defaultDescription: (cat.defaultDescription || '').trim(),
        purposeAutoFill
      };
    });
    return out;
  }

  function renderMappingBuilder() {
    const host = page.querySelector('#exp-mapping-builder');
    if (!host) return;
    if (!expenseMappingState.length) {
      expenseMappingState = [{ name: '', defaultDescription: '', purposes: [{ name: '', templatesText: '' }] }];
    }

    host.innerHTML = expenseMappingState.map((cat, cIdx) => `
      <div class="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/70 dark:bg-slate-800/30 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div class="flex-1">
            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category lớn</label>
            <input type="text" data-field="category-name" data-category-index="${cIdx}" value="${cat.name || ''}" class="mt-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-white outline-none" placeholder="e.g. Utilities">
          </div>
          <button type="button" data-action="remove-category" data-category-index="${cIdx}" class="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-500 text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all">Remove</button>
        </div>
        <div>
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Default Description (optional)</label>
          <input type="text" data-field="category-default" data-category-index="${cIdx}" value="${cat.defaultDescription || ''}" class="mt-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-white outline-none" placeholder="Default text when category selected">
        </div>
        <div class="space-y-3">
          ${(cat.purposes || []).map((pur, pIdx) => `
            <div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white/80 dark:bg-slate-900/40 space-y-2">
              <div class="flex items-center justify-between gap-2">
                <input type="text" data-field="purpose-name" data-category-index="${cIdx}" data-purpose-index="${pIdx}" value="${pur.name || ''}" class="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-white outline-none" placeholder="Purpose liên quan ${pIdx + 1}">
                <button type="button" data-action="remove-purpose" data-category-index="${cIdx}" data-purpose-index="${pIdx}" class="px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Remove</button>
              </div>
              <div>
                <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Autofill templates (mỗi dòng 1 mẫu)</label>
                <textarea rows="3" data-field="purpose-templates" data-category-index="${cIdx}" data-purpose-index="${pIdx}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-white outline-none resize-y" placeholder="REFILL WATER GALOON 1PC\nREFILL WATER GALOON 2PCS">${pur.templatesText || ''}</textarea>
              </div>
            </div>
          `).join('')}
        </div>
        <button type="button" data-action="add-purpose" data-category-index="${cIdx}" class="px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all">+ Add Purpose</button>
      </div>
    `).join('');
  }

  async function loadImportHistory() {
     const body = page.querySelector('#import-history-body');
     if (!body) return;
     body.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-xs text-slate-400 italic">Fetching logs...</td></tr>';

     try {
        const q = query(collection(db, "import_logs"), orderBy("timestamp", "desc"), limit(20));
        const snap = await getDocs(q);
        
        if (snap.empty) {
           body.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-xs text-slate-400 italic">No import history found.</td></tr>';
           return;
        }

        body.innerHTML = snap.docs.map(doc => {
           const log = doc.data();
           const date = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 'Just now';
           const isDeleted = log.status === 'deleted';
           
           return `
              <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all ${isDeleted ? 'opacity-40 grayscale' : ''}">
                 <td class="px-6 py-4">
                    <p class="text-xs font-bold text-slate-700 dark:text-slate-200">${date}</p>
                    <p class="text-[9px] text-slate-400 font-medium font-mono uppercase">${log.batchId}</p>
                 </td>
                 <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[9px] font-black uppercase text-slate-500">${log.type}</span>
                 </td>
                 <td class="px-6 py-4 text-xs font-semibold text-slate-500">${log.branchId}</td>
                 <td class="px-6 py-4 text-xs font-black text-[#96588a]">${log.rowCount}</td>
                 <td class="px-6 py-4 text-right">
                    ${isDeleted ? 
                       '<span class="text-[9px] font-black uppercase text-rose-500 bg-rose-50 dark:bg-rose-900/20 px-2 py-1 rounded-md">Rolled Back</span>' : 
                       `<button class="undo-btn px-4 py-1.5 rounded-lg border border-rose-200 text-rose-500 text-[9px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all shadow-sm" 
                         data-batch-id="${log.batchId}" data-type="${log.type}" data-row-count="${log.rowCount}">Undo</button>`
                    }
                 </td>
              </tr>
           `;
        }).join('');

     } catch (err) {
        console.error("Error loading import history:", err);
        body.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-xs text-rose-400 font-bold italic">Error: ${err.message}</td></tr>`;
     }
  }

  async function undoImport(batchId, btn) {
     const originalText = btn.innerText;
     btn.disabled = true;
     btn.innerText = 'Deleting...';
     
     try {
        const logSnap = await getDoc(doc(db, "import_logs", batchId));
        if (!logSnap.exists()) throw new Error("Log entry not found.");
        
        const log = logSnap.data();
        const collections = log.collections || ["daily_sales"]; // fallback
        
        let totalDeleted = 0;
        
        for (const colName of collections) {
           const q = query(collection(db, colName), where("importBatchId", "==", batchId));
           const snap = await getDocs(q);
           
           if (!snap.empty) {
              const batch = writeBatch(db);
              snap.docs.forEach(d => {
                 batch.delete(d.ref);
                 totalDeleted++;
              });
              await batch.commit();
           }
        }
        
        // Mark log as deleted instead of removing it (for audit trail)
        await setDoc(doc(db, "import_logs", batchId), { status: 'deleted' }, { merge: true });
        
        window.showToast(`Successfully rolled back ${totalDeleted} records.`, 'success');
        loadImportHistory(); // Refresh table
        
     } catch (err) {
        console.error("Undo Error:", err);
        window.showToast("Failed to undo: " + err.message, "error");
        btn.disabled = false;
        btn.innerText = originalText;
     }
  }

  return page;
}
