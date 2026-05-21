import { db } from '../firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, orderBy, limit, deleteDoc, writeBatch } from 'firebase/firestore';

export function renderSettings() {
  const page = document.createElement('div');
  page.className = 'p-6 page-enter max-w-5xl mx-auto h-full flex flex-col';
  let expenseMappingState = [];

  const BRANCHES = ['Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf'];
  
  page.innerHTML = `
    <div class="flex flex-col md:flex-row h-full">
      <!-- Left Menu Sidebar -->
      <div class="w-full md:w-72 shrink-0 border-r border-slate-100 dark:border-white/5 pr-8 py-4">
         <div class="px-4 h-[60px] flex flex-col justify-center mb-10">
            <h2 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter leading-none">Settings</h2>
            <p class="text-[8px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1.5">System Config</p>
         </div>
         
         <div class="space-y-1">
            <button class="settings-tab active w-full text-left px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-purple-50 dark:bg-purple-500/10 text-[#96588a] dark:text-purple-400 transition-all flex items-center gap-4 group" data-tab="general">
               <div class="w-8 h-8 rounded-xl bg-white dark:bg-black/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                  <i data-lucide="settings-2" class="w-3.5 h-3.5"></i>
               </div> 
               General
            </button>
            
            <button class="settings-tab w-full text-left px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all flex items-center gap-4 group" data-tab="kpi">
               <div class="w-8 h-8 rounded-xl bg-slate-100 dark:bg-black/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <i data-lucide="target" class="w-3.5 h-3.5"></i>
               </div>
               KPI Targets
            </button>
            
            <button class="settings-tab w-full text-left px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all flex items-center gap-4 group" data-tab="expenses">
               <div class="w-8 h-8 rounded-xl bg-slate-100 dark:bg-black/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <i data-lucide="wallet" class="w-3.5 h-3.5"></i>
               </div>
               Expenses
            </button>
            
            <button class="settings-tab w-full text-left px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all flex items-center gap-4 group" data-tab="history">
               <div class="w-8 h-8 rounded-xl bg-slate-100 dark:bg-black/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <i data-lucide="history" class="w-3.5 h-3.5"></i>
               </div>
               History
            </button>
         </div>
      </div>

      <!-- Right Content Area (Flat Divider Style) -->
      <div class="flex-1 pl-12 py-4 flex flex-col h-full overflow-hidden">
         <!-- Fixed Header Container (Aligned with Left) -->
         <div class="h-[60px] flex flex-col justify-center mb-10 shrink-0">
            <div id="content-header-area">
               <!-- Dynamic titles will be aligned here -->
               <h3 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter leading-none" id="active-tab-title">General Preferences</h3>
               <p class="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1.5" id="active-tab-subtitle">System configuration and theme</p>
            </div>
         </div>

         <!-- Scrollable Content -->
         <div class="flex-1 overflow-y-auto pr-4 custom-scrollbar pb-10">
         
         <!-- IMPORT HISTORY TAB -->
         <div id="tab-history" class="settings-pane hidden space-y-6 animate-fade-in">
            <div class="overflow-hidden rounded-3xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
               <table class="w-full text-left border-collapse">
                  <thead>
                     <tr class="bg-slate-50/80 dark:bg-white/5 border-b border-slate-100 dark:border-white/5">
                        <th class="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Date/Time</th>
                        <th class="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Type</th>
                        <th class="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Branch</th>
                        <th class="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Rows</th>
                        <th class="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Action</th>
                     </tr>
                  </thead>
                  <tbody id="import-history-body" class="divide-y divide-slate-50 dark:divide-white/5">
                     <tr><td colspan="5" class="px-6 py-20 text-center text-xs text-slate-400 italic">Loading history...</td></tr>
                  </tbody>
               </table>
            </div>
         </div>
         
         <!-- GENERAL TAB -->
         <div id="tab-general" class="settings-pane space-y-6 animate-fade-in">
            <div class="space-y-1.5">
               <div class="flex items-center justify-between p-5 rounded-[1.5rem] bg-slate-50/50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 group hover:bg-white dark:hover:bg-white/[0.05] transition-all">
                 <div class="flex items-center gap-4">
                    <div class="w-9 h-9 rounded-xl bg-white dark:bg-black/20 flex items-center justify-center text-slate-400 group-hover:text-purple-500 transition-colors shadow-sm">
                       <i data-lucide="moon" class="w-4 h-4"></i>
                    </div>
                    <div>
                       <p class="text-[13px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight">Dark Mode</p>
                    </div>
                 </div>
                 <button id="st-dark-toggle" class="w-12 h-12 flex items-center justify-center rounded-xl bg-white dark:bg-black/40 hover:scale-105 active:scale-95 text-slate-600 dark:text-slate-300 transition-all shadow-sm ring-1 ring-slate-100 dark:ring-white/10">
                   <i data-lucide="sun" class="w-4 h-4 hidden dark:block"></i>
                   <i data-lucide="moon" class="w-4 h-4 block dark:hidden"></i>
                 </button>
               </div>

               <div class="flex items-center justify-between p-5 rounded-[1.5rem] bg-slate-50/50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 group hover:bg-white dark:hover:bg-white/[0.05] transition-all">
                 <div class="flex items-center gap-4">
                    <div class="w-9 h-9 rounded-xl bg-white dark:bg-black/20 flex items-center justify-center text-slate-400 group-hover:text-amber-500 transition-colors shadow-sm">
                       <i data-lucide="banknote" class="w-4 h-4"></i>
                    </div>
                    <div>
                       <p class="text-[13px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight">System Currency</p>
                    </div>
                 </div>
                 <span class="text-[10px] font-black text-[#96588a] dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 px-4 py-2 rounded-xl uppercase tracking-widest">₱ PHP</span>
               </div>

               <div class="flex items-center justify-between p-5 rounded-[1.5rem] bg-slate-50/50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 group hover:bg-white dark:hover:bg-white/[0.05] transition-all">
                 <div class="flex items-center gap-4">
                    <div class="w-9 h-9 rounded-xl bg-white dark:bg-black/20 flex items-center justify-center text-slate-400 group-hover:text-emerald-500 transition-colors shadow-sm">
                       <i data-lucide="shield-check" class="w-4 h-4"></i>
                    </div>
                    <div>
                       <p class="text-[13px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight">App Version</p>
                    </div>
                 </div>
                 <span class="text-[8px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-lg flex items-center gap-2 uppercase tracking-widest">2.0.4 Premium</span>
               </div>
            </div>
         </div>

         <!-- KPI TAB -->
         <div id="tab-kpi" class="settings-pane hidden space-y-6 animate-fade-in">
            <div class="flex justify-end mb-4">
               <div class="relative group">
                 <select id="kpi-branch-select" class="pl-5 pr-12 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-slate-100/50 dark:bg-white/5 border-none outline-none appearance-none cursor-pointer text-[#96588a] dark:text-purple-400 transition-all hover:bg-slate-100 dark:hover:bg-white/10 ring-1 ring-transparent focus:ring-purple-500/30">
                   ${BRANCHES.map(b => `<option value="${b}">${b}</option>`).join('')}
                 </select>
                 <i data-lucide="chevron-down" class="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-purple-500 transition-colors"></i>
               </div>
            </div>

            <div id="kpi-loading" class="py-12 text-center hidden">
               <div class="inline-block w-6 h-6 border-2 border-[#96588a] border-t-transparent rounded-full animate-spin mb-2"></div>
               <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading KPI...</p>
            </div>

            <div id="kpi-inputs" class="grid grid-cols-1 sm:grid-cols-2 gap-6">
               <div class="space-y-1.5 sm:col-span-2">
                 <label class="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1">Total Net Sale KPI</label>
                 <div class="relative group">
                   <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold group-focus-within:text-purple-500 transition-colors">₱</div>
                   <input type="number" id="kpi-net" class="w-full pl-9 pr-5 py-4 rounded-[1.2rem] bg-slate-50/50 dark:bg-white/5 border-2 border-transparent focus:bg-white dark:focus:bg-black/20 focus:border-purple-500/20 transition-all text-xs font-bold text-slate-700 dark:text-white outline-none shadow-sm" placeholder="0.00">
                 </div>
               </div>
               <div class="space-y-1.5">
                 <label class="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1">Dine In KPI</label>
                 <input type="number" id="kpi-dinein" class="w-full px-5 py-3.5 rounded-[1.2rem] bg-slate-50/50 dark:bg-white/5 border-2 border-transparent focus:bg-white dark:focus:bg-black/20 focus:border-blue-500/20 transition-all text-xs font-bold text-slate-700 dark:text-white outline-none shadow-sm" placeholder="0.00">
               </div>
               <div class="space-y-1.5">
                 <label class="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1">GrabFood KPI</label>
                 <input type="number" id="kpi-grab" class="w-full px-5 py-3.5 rounded-[1.2rem] bg-slate-50/50 dark:bg-white/5 border-2 border-transparent focus:bg-white dark:focus:bg-black/20 focus:border-emerald-500/20 transition-all text-xs font-bold text-slate-700 dark:text-white outline-none shadow-sm" placeholder="0.00">
               </div>
               <div class="space-y-1.5">
                 <label class="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1">FoodPanda KPI</label>
                 <input type="number" id="kpi-panda" class="w-full px-5 py-3.5 rounded-[1.2rem] bg-slate-50/50 dark:bg-white/5 border-2 border-transparent focus:bg-white dark:focus:bg-black/20 focus:border-pink-500/20 transition-all text-xs font-bold text-slate-700 dark:text-white outline-none shadow-sm" placeholder="0.00">
               </div>
               <div class="space-y-1.5">
                 <label class="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1">Online Order KPI</label>
                 <input type="number" id="kpi-online" class="w-full px-5 py-3.5 rounded-[1.2rem] bg-slate-50/50 dark:bg-white/5 border-2 border-transparent focus:bg-white dark:focus:bg-black/20 focus:border-purple-500/20 transition-all text-xs font-bold text-slate-700 dark:text-white outline-none shadow-sm" placeholder="0.00">
               </div>
               <div class="sm:col-span-2 pt-4">
                 <button id="save-kpi-btn" class="w-full py-4 bg-gradient-to-r from-[#96588a] to-[#7a4671] text-white rounded-[1.2rem] text-[10px] font-black shadow-2xl shadow-purple-500/20 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-3 uppercase tracking-[0.2em]">
                   <i data-lucide="save" class="w-4 h-4"></i> Save KPI Settings
                 </button>
               </div>
            </div>
         </div>

         <!-- EXPENSES TAB -->
         <div id="tab-expenses" class="settings-pane hidden space-y-8 animate-fade-in">
            <div class="flex justify-end">
               <div class="relative group">
                 <select id="exp-branch-select" class="pl-5 pr-12 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-slate-100/50 dark:bg-white/5 border-none outline-none appearance-none cursor-pointer text-[#96588a] dark:text-purple-400 transition-all hover:bg-slate-100 dark:hover:bg-white/10 ring-1 ring-transparent focus:ring-purple-500/30">
                   ${BRANCHES.map(b => `<option value="${b}">${b}</option>`).join('')}
                 </select>
                 <i data-lucide="chevron-down" class="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-purple-500 transition-colors"></i>
               </div>
            </div>

            <div id="exp-loading" class="py-12 text-center hidden">
               <div class="inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2"></div>
               <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading Setup...</p>
            </div>             <div id="exp-inputs" class="space-y-10">
               <!-- Petty Cash Base Fund (Branch Specific) -->
               <div class="space-y-3">
                 <label class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                    <i data-lucide="coins" class="w-3.5 h-3.5 text-amber-500"></i> Petty Cash Base Fund (Branch)
                 </label>
                 <div class="relative group">
                   <div class="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold group-focus-within:text-amber-500 transition-colors">₱</div>
                   <input type="number" id="exp-base-fund" class="w-full pl-10 pr-6 py-5 rounded-[1.8rem] bg-slate-50/50 dark:bg-white/5 border-2 border-transparent focus:bg-white dark:focus:bg-black/20 focus:border-amber-500/20 transition-all text-sm font-bold text-slate-700 dark:text-white outline-none shadow-sm" placeholder="0.00">
                 </div>
               </div>

               <div class="h-px w-full bg-slate-100 dark:bg-white/5"></div>

               <!-- Global Options -->
               <div class="space-y-6">
                  <div class="px-1">
                     <h4 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">Global Dropdown Options</h4>
                     <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Common items for all branches (comma separated)</p>
                  </div>
                  
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div class="space-y-3">
                        <label class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                           <i data-lucide="list" class="w-3.5 h-3.5 text-blue-500"></i> Categories
                        </label>
                        <textarea id="exp-categories" rows="4" class="w-full p-5 rounded-[1.5rem] bg-slate-50/50 dark:bg-white/5 border-2 border-transparent focus:bg-white dark:focus:bg-black/20 focus:border-blue-500/20 transition-all text-xs font-bold text-slate-700 dark:text-white outline-none resize-none shadow-sm" placeholder="General, Utilities..."></textarea>
                     </div>
                     <div class="space-y-3">
                        <label class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                           <i data-lucide="tag" class="w-3.5 h-3.5 text-emerald-500"></i> Purposes
                        </label>
                        <textarea id="exp-purposes" rows="4" class="w-full p-5 rounded-[1.5rem] bg-slate-50/50 dark:bg-white/5 border-2 border-transparent focus:bg-white dark:focus:bg-black/20 focus:border-emerald-500/20 transition-all text-xs font-bold text-slate-700 dark:text-white outline-none resize-none shadow-sm" placeholder="Internet, Logistics..."></textarea>
                     </div>
                  </div>
               </div>

               <div class="h-px w-full bg-slate-100 dark:bg-white/5"></div>

               <div class="space-y-6">
                  <div class="flex items-center justify-between gap-4 px-1">
                     <div>
                        <h4 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">Smart Mapping Builder</h4>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Category & Purpose autofill configuration</p>
                     </div>
                     <button id="exp-add-mapping-category" type="button" class="px-5 py-3 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-[10px] font-black uppercase tracking-[0.2em] text-[#96588a] dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-all shadow-sm">
                        + Add Category
                     </button>
                  </div>
                  <div id="exp-mapping-builder" class="space-y-6"></div>
               </div>

               <div class="pt-6">
                 <button id="save-exp-btn" class="w-full py-5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-[1.8rem] text-[11px] font-black shadow-2xl shadow-emerald-500/20 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-3 uppercase tracking-[0.2em]">
                   <i data-lucide="save" class="w-4 h-4"></i> Save Expenses Setup
                 </button>
               </div>

               <div class="h-px w-full bg-slate-100 dark:bg-white/5 my-4"></div>

               <!-- DANGER ZONE -->
               <div class="p-6 rounded-[2rem] bg-rose-50/50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/10 space-y-4">
                  <div class="flex items-center gap-3 text-rose-500">
                     <i data-lucide="alert-triangle" class="w-5 h-5"></i>
                     <h4 class="text-sm font-black uppercase tracking-tight">Danger Zone</h4>
                  </div>
                  <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                     Resetting will permanently delete all expense records, batches, and history for the selected branch. This will restore the card balance to the base fund amount.
                  </p>
                  <button id="reset-branch-data-btn" class="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-rose-500/20 active:scale-95">
                     Reset Petty Cash Data
                  </button>
               </div>
            </div>
         </div>
         </div> <!-- End Scrollable Area -->
      </div>
    </div>
  `;

    // --- TAB SWITCHING LOGIC ---
    const tabs = page.querySelectorAll('.settings-tab');
    const panes = page.querySelectorAll('.settings-pane');
    const contentTitle = page.querySelector('#active-tab-title');
    const contentSubtitle = page.querySelector('#active-tab-subtitle');

    const tabMeta = {
       general: { title: "General Preferences", subtitle: "System configuration and theme" },
       kpi: { title: "KPI Targets", subtitle: "Daily revenue targets per channel" },
       expenses: { title: "Expenses Setup", subtitle: "Configure petty cash funds and mapping" },
       history: { title: "Import History", subtitle: "Review recent data imports and roll back" }
    };

    tabs.forEach(t => {
       t.onclick = () => {
          const target = t.dataset.tab;
          
          if (tabMeta[target]) {
             contentTitle.innerText = tabMeta[target].title;
             contentSubtitle.innerText = tabMeta[target].subtitle;
          }

          tabs.forEach(btn => {
             btn.classList.remove('active', 'bg-purple-50', 'dark:bg-purple-500/10', 'text-[#96588a]', 'dark:text-purple-400');
             btn.classList.add('text-slate-500');
          });
          t.classList.remove('text-slate-500');
          t.classList.add('active', 'bg-purple-50', 'dark:bg-purple-500/10', 'text-[#96588a]', 'dark:text-purple-400');

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
      // --- RESET BRANCH DATA ---
      const resetBtn = page.querySelector('#reset-branch-data-btn');
      if (resetBtn) {
         resetBtn.onclick = async () => {
            const branchId = page.querySelector('#exp-branch-select').value;
            if (!confirm(`Are you sure you want to RESET ALL Petty Cash data for ${branchId}? This action is permanent and cannot be undone.`)) return;

            const originalText = resetBtn.innerText;
            resetBtn.disabled = true;
            resetBtn.innerText = 'Resetting...';

            try {
               const collectionsToPurge = ['expenses', 'expense_batches'];
               let totalDeleted = 0;

               for (const colName of collectionsToPurge) {
                  const q = query(collection(db, colName), where("branchId", "==", branchId));
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
               window.dispatchEvent(new CustomEvent('expenses-updated'));

               alert(`Success! Successfully cleared ${totalDeleted} records for ${branchId}. The card balance is now reset to its base fund.`);
               resetBtn.innerText = 'Reset Complete!';
               setTimeout(() => {
                  resetBtn.innerText = originalText;
                  resetBtn.disabled = false;
               }, 2000);
            } catch (err) {
               console.error("Error resetting branch data:", err);
               alert("Error: " + err.message);
               resetBtn.innerText = originalText;
               resetBtn.disabled = false;
            }
         };
      }
    }

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
      <div class="rounded-[2rem] border border-slate-100 dark:border-white/5 p-6 bg-slate-50/50 dark:bg-white/[0.02] space-y-5 shadow-sm">
        <div class="flex items-center justify-between gap-4">
          <div class="flex-1">
            <label class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1">Major Category</label>
            <input type="text" data-field="category-name" data-category-index="${cIdx}" value="${cat.name || ''}" class="mt-1.5 w-full px-4 py-3 rounded-xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-white outline-none shadow-sm focus:ring-2 focus:ring-purple-500/20 transition-all" placeholder="e.g. Utilities">
          </div>
          <button type="button" data-action="remove-category" data-category-index="${cIdx}" class="px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 text-[9px] font-black uppercase tracking-widest hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all mt-6">Remove</button>
        </div>
        <div>
          <label class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1">Default Description (optional)</label>
          <input type="text" data-field="category-default" data-category-index="${cIdx}" value="${cat.defaultDescription || ''}" class="mt-1.5 w-full px-4 py-3 rounded-xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xs font-bold text-slate-700 dark:text-white outline-none shadow-sm focus:ring-2 focus:ring-purple-500/20 transition-all" placeholder="Default text when category selected">
        </div>
        <div class="space-y-4">
          ${(cat.purposes || []).map((pur, pIdx) => `
            <div class="rounded-2xl border border-slate-100 dark:border-white/5 p-5 bg-white/80 dark:bg-black/20 space-y-3 shadow-sm relative">
              <div class="flex items-center justify-between gap-3">
                <div class="flex-1">
                   <label class="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">Sub-Purpose ${pIdx + 1}</label>
                   <input type="text" data-field="purpose-name" data-category-index="${cIdx}" data-purpose-index="${pIdx}" value="${pur.name || ''}" class="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 text-xs font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/10" placeholder="Purpose name">
                </div>
                <button type="button" data-action="remove-purpose" data-category-index="${cIdx}" data-purpose-index="${pIdx}" class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-rose-500 transition-all mt-5 flex items-center justify-center">
                   <i data-lucide="x" class="w-3.5 h-3.5"></i>
                </button>
              </div>
              <div>
                <label class="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">Autofill templates (one per line)</label>
                <textarea rows="3" data-field="purpose-templates" data-category-index="${cIdx}" data-purpose-index="${pIdx}" class="mt-1 w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 text-xs font-medium text-slate-700 dark:text-white outline-none resize-none shadow-inner" placeholder="Template 1\nTemplate 2">${pur.templatesText || ''}</textarea>
              </div>
            </div>
          `).join('')}
        </div>
        <button type="button" data-action="add-purpose" data-category-index="${cIdx}" class="w-full py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-widest hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2">
           <i data-lucide="plus" class="w-3.5 h-3.5"></i> Add Purpose
        </button>
      </div>
    `).join('');
    if (window.lucide) window.lucide.createIcons();
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
              <tr class="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-all group ${isDeleted ? 'opacity-40 grayscale' : ''}">
                 <td class="px-6 py-5">
                    <p class="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight">${date}</p>
                    <p class="text-[8px] text-slate-400 font-bold font-mono uppercase tracking-widest mt-0.5">${log.batchId}</p>
                 </td>
                 <td class="px-6 py-5">
                    <span class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-white/5">${log.type}</span>
                 </td>
                 <td class="px-6 py-5">
                    <p class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">${log.branchId}</p>
                 </td>
                 <td class="px-6 py-5">
                    <p class="text-xs font-black text-[#96588a] dark:text-purple-400">${log.rowCount || 0} rows</p>
                 </td>
                 <td class="px-6 py-5 text-right">
                    ${isDeleted ? 
                       '<span class="text-[8px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 dark:bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-100 dark:border-rose-500/20">Rolled Back</span>' : 
                       `<button class="undo-btn px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-[8px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm" 
                         data-batch-id="${log.batchId}" data-type="${log.type}" data-row-count="${log.rowCount}">Undo Import</button>`
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
           const q = query(collection(db, colName), where("importBatchId", "==", batchId), limit(500));
           const snap = await getDocs(q);
           
           if (!snap.empty) {
              const batch = writeBatch(db);
              snap.docs.forEach(d => {
                 batch.delete(d.ref);
                 totalDeleted++;
              });
              await batch.commit();
           }
         
         window.dispatchEvent(new CustomEvent('expenses-updated'));
         window.dispatchEvent(new CustomEvent('sales-updated'));
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
