import { db, storage } from '../firebase.js';
import { collection, getDocs, query, where, orderBy, addDoc, serverTimestamp, doc, getDoc, setDoc, limit, writeBatch, updateDoc, increment, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { animateValue, formatDateDDMMYYYY, standardizeDate, cleanNumber, getLocalDateString } from './expenses/utils.js';
import { showExcelPreviewModal, showPromptModal } from './expenses/modals.js';

// Module-level cache for master data (Categories, Purposes, etc.)
let masterCache = {
   data: null,
   branchFunds: {}, // branchName -> fundAmount
   timestamp: 0
};

export async function renderExpensesPage(activeTab = 'cashier') {
   const APPROVAL_TEMPLATE_URL = '/templates/liquidation-approval-template.xlsx';
   const container = document.createElement('div');
   container.className = 'p-6 space-y-6 pb-20 page-enter';

   let currentTab = activeTab || 'cashier';
   const _localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
   const yesterday = new Date();
   yesterday.setDate(yesterday.getDate() - 1);
   const yesterdayStr = _localDate(yesterday);
   let categories = [];
   let purposes = [];
   let categoryMappings = {};
   let selectedFile = null;
   let currentBranch = document.getElementById('exp-header-branch')?.value || document.getElementById('db-branch')?.value || 'Pioneer Center';
   let baseFund = 0;
   let historyLimit = 10;
   let unliquidatedTotal = 0;
   let pendingTotal = 0;

   container.innerHTML = `
    <div id="expense-content" class="min-h-[400px]"></div>
  `;

   // --- Inject Local Filter into Header ---
   setTimeout(() => {
      const anchor = document.getElementById('header-local-filters');
      if (anchor) {
         // Determine which tab is active for the label
         const tabLabels = { 'cashier': 'Cashier', 'ledger': 'Ledger', 'audit': 'Audit' };
         const activeLabel = tabLabels[currentTab] || 'Cashier';

         anchor.innerHTML = `
         <div class="flex items-center gap-4 pl-4 border-l border-slate-200 dark:border-white/10">
           <!-- Branch -->
           <div class="relative group cursor-pointer flex items-center gap-1.5 h-6">
             <input type="hidden" id="exp-header-branch" value="${currentBranch}">
             <span id="exp-header-branch-text" class="text-[11px] font-black text-slate-600 dark:text-white uppercase tracking-wider group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors">${currentBranch}</span>
             <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors"></i>
             
             <div class="absolute top-full left-0 mt-2 w-52 bg-white/90 dark:bg-[#141414]/95 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 transition-all duration-300 z-[90] overflow-hidden backdrop-blur-2xl border border-white/60 dark:border-white/10">
               <div class="py-2">
                 ${['All Branches', 'Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf'].map(b => `
                   <div class="px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" 
                        onclick="document.getElementById('exp-header-branch').value='${b}'; document.getElementById('exp-header-branch-text').innerText='${b}'; document.getElementById('exp-header-branch').dispatchEvent(new Event('change'));">
                     ${b}
                   </div>
                 `).join('')}
               </div>
             </div>
           </div>

           <div class="w-1 h-1 rounded-full bg-slate-300 dark:bg-white/20"></div>

           <!-- View/Tab Switcher (Replaces Date Range) -->
           <div class="relative group cursor-pointer flex items-center gap-1.5 h-6" id="exp-tab-dropdown">
              <i data-lucide="layers" class="w-3.5 h-3.5 text-slate-400 group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors"></i>
              <span id="exp-tab-label" class="text-[11px] font-black text-slate-600 dark:text-white uppercase tracking-wider group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors">${activeLabel}</span>
              <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 group-hover:text-[#96588a] dark:group-hover:text-[#d4afcd] transition-colors"></i>
              
              <div class="absolute top-full left-0 mt-2 w-52 bg-white/90 dark:bg-[#141414]/95 rounded-2xl shadow-2xl opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-300 z-[80] overflow-hidden backdrop-blur-2xl border border-white/60 dark:border-white/10">
                 <div class="py-2">
                    <div class="exp-tab-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" data-tab="cashier">Cashier Dashboard</div>
                    <div class="exp-tab-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" data-tab="ledger">Expenses Ledger</div>
                    <div class="exp-tab-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" data-tab="audit">Audit & Verification</div>
                 </div>
              </div>
           </div>
         </div>
       `;
      }

      if (window.lucide) window.lucide.createIcons();

      // Listen for Branch Changes
      const branchEl = document.getElementById('exp-header-branch');
      if (branchEl) {
         branchEl.addEventListener('change', () => {
            currentBranch = branchEl.value;
            loadTabContent(currentTab, true);
         });
      }

      // Listen for Tab Changes
      const tabMenu = document.getElementById('exp-tab-dropdown');
      if (tabMenu) {
         tabMenu.querySelectorAll('.exp-tab-option').forEach(opt => {
            opt.onclick = (e) => {
               e.stopPropagation();
               const tab = opt.dataset.tab;
               const label = document.getElementById('exp-tab-label');
               if (label) label.textContent = opt.textContent.replace(' Dashboard', '').replace(' Ledger', '').replace(' & Verification', '');
               window.dispatchEvent(new CustomEvent('switch-sub-tab', { detail: { tabId: tab } }));
            };
         });
      }

      // Listen for global filter changes
      const handleGlobalFilter = () => {
         const globalBranch = document.getElementById('db-branch')?.value;
         if (globalBranch && branchEl) {
            branchEl.value = globalBranch;
            const branchText = document.getElementById('exp-header-branch-text');
            if (branchText) branchText.innerText = globalBranch;
            currentBranch = globalBranch;
            loadTabContent(currentTab, true);
         }
      };
      window.addEventListener('global-filter-changed', handleGlobalFilter);

      const cleanup = () => {
         window.removeEventListener('global-filter-changed', handleGlobalFilter);
      };
      window.addEventListener('cleanup-page', cleanup, { once: true });

   }, 0);

   // Initial Load
   loadTabContent(currentTab);

   async function loadMasterData() {
      const freshBranch = document.getElementById('exp-header-branch')?.value;
      if (freshBranch && freshBranch !== 'All Branches') {
         currentBranch = freshBranch;
      }

      try {
         // Load Categories & Purposes (Cached)
         if (!masterCache.data || (Date.now() - masterCache.timestamp > 300000)) { // 5 min cache
            const masterSnap = await getDoc(doc(db, 'settings', 'expenses_master'));
            if (masterSnap.exists()) {
               masterCache.data = masterSnap.data();
               masterCache.timestamp = Date.now();
            }
         }

         if (masterCache.data) {
            categories = masterCache.data.categories || [];
            purposes = masterCache.data.purposes || [];
            categoryMappings = masterCache.data.categoryMappings || masterCache.data.cashierMappings || {};
         }

         // Load Base Fund (Cached per branch)
         if (masterCache.branchFunds[currentBranch]) {
            baseFund = masterCache.branchFunds[currentBranch];
         } else {
            const branchSnap = await getDoc(doc(db, 'kpi_settings', currentBranch));
            if (branchSnap.exists()) {
               baseFund = branchSnap.data().petty_base || 0;
               masterCache.branchFunds[currentBranch] = baseFund;
            }
         }

         // Calculate spent unliquidated
         const q = query(
            collection(db, 'expenses'),
            where('branchId', '==', currentBranch),
            where('status', 'in', ['pending', 'requested', 'rejected'])
         );
         const snap = await getDocs(q);
         const docs = snap.docs.map(d => d.data());
         const unliquidatedDocs = docs.filter(d => (d.fundedBy === 'petty_cash' || d.fundedBy === 'pettyCash'));
         unliquidatedTotal = unliquidatedDocs.reduce((acc, d) => acc + (d.amount || 0), 0);
         pendingTotal = unliquidatedDocs.filter(d => d.status === 'pending').reduce((acc, d) => acc + (d.amount || 0), 0);
      } catch (err) {
         console.error("Load Master Data Error:", err);
      }
   }

   async function loadTabContent(tabName, silent = false) {
      const content = container.querySelector('#expense-content');
      if (!content) return;

      // Only show skeleton if NOT a silent update and content is empty or different tab
      if (!silent || !content.innerHTML.trim() || currentTab !== tabName) {
         content.innerHTML = `
           <div class="space-y-6 animate-pulse p-2">
             <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
               <div class="h-24 bg-slate-100 dark:bg-[#343434]/60 rounded-3xl"></div>
               <div class="h-24 bg-slate-100 dark:bg-[#343434]/60 rounded-3xl"></div>
               <div class="h-24 bg-slate-100 dark:bg-[#343434]/60 rounded-3xl"></div>
               <div class="h-24 bg-slate-100 dark:bg-[#343434]/60 rounded-3xl"></div>
             </div>
             <div class="space-y-3">
               ${Array(6).fill(0).map(() => `
                  <div class="h-16 bg-slate-100 dark:bg-[#343434]/40 rounded-2xl w-full"></div>
               `).join('')}
             </div>
           </div>
         `;
      }

      try {
         await loadMasterData();

         currentTab = tabName;
         if (tabName === 'cashier') {
            content.innerHTML = renderCashierTab();
            attachCashierListeners();
            await loadHistoryData();
         } else if (tabName === 'ledger') {
            content.innerHTML = renderLedgerTab();
            attachLedgerListeners();
            loadLedgerData();
         } else if (tabName === 'audit') {
            content.innerHTML = renderAuditTab();
            await loadAuditData();
            await loadAuditLogData();
            await loadHistoryData();
            attachAuditLogListeners();
         } else {
            // Fallback
            content.innerHTML = renderCashierTab();
            attachCashierListeners();
            await loadHistoryData();
         }
      } catch (err) {
         console.error("Load Tab Content Error:", err);
         content.innerHTML = `<div class="p-12 text-center text-rose-500 font-black uppercase text-xs">Error loading ${tabName} data. Please check your connection.</div>`;
      }

      if (window.lucide) window.lucide.createIcons();
      if (tabName === 'cashier') initAddTransactionModal();
   }


   function renderCashierTab() {
      const fmt = n => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
      return `
      <div class="animate-fade-in space-y-3">
         <!-- TOP ROW: Action & Status -->
         <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            <!-- Current Batch (Restored to Top Left 2/3) -->
            <div class="lg:col-span-2 bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-[2.5rem] p-8 border-t border-white/60 dark:border-white/10 shadow-xl h-[527px] flex flex-col">
               <div class="flex items-center justify-between mb-8 shrink-0">
                  <div class="flex items-center gap-4">
                     <div class="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500">
                        <i data-lucide="shopping-bag" class="w-5 h-5"></i>
                     </div>
                     <div>
                        <h4 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Current Batch</h4>
                        <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Draft items for liquidation</p>
                     </div>
                  </div>
                  
                  <div class="flex items-center gap-6">
                     <div class="text-right">
                        <p id="batch-total" class="text-2xl font-black text-slate-900 dark:text-white tabular-nums">₱0.00</p>
                        <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total to replenish</p>
                     </div>
                     <!-- Add Icon Button Linked to Modal -->
                     <button id="add-exp-btn" class="w-10 h-10 bg-[#96588a] text-white rounded-full flex items-center justify-center shadow-lg shadow-[#96588a]/20 hover:scale-110 transition-all">
                        <i data-lucide="plus" class="w-5 h-5"></i>
                     </button>
                  </div>
               </div>
               
               <div id="cashier-items-list" class="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-hide min-h-0"></div>

               <!-- Request Button Restored at Bottom -->
               <button id="request-liquidation-btn" class="mt-6 shrink-0 w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 group">
                  <i data-lucide="send" class="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"></i> Request Liquidation
               </button>
            </div>

            <!-- RIGHT COLUMN: Dual Card Stack (1/3) -->
            <div class="lg:col-span-1 flex flex-col gap-4">
               <!-- ATM Card: Deep Onyx Glassmorphism -->
               <div class="relative group aspect-[1.58/1] cursor-pointer">
                  <div class="relative h-full bg-gradient-to-br from-[#050505] via-[#0a0a0a] to-black backdrop-blur-3xl rounded-[2.5rem] p-8 text-white overflow-hidden flex flex-col justify-between border border-white/[0.03] group-hover:border-white/10 transition-all duration-700 group-hover:scale-[1.03] shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                     <!-- Concentrated Powerful Glow (Top-Left Only) -->
                     <div class="absolute -top-40 -left-40 w-[30rem] h-[30rem] bg-[#96588a]/30 rounded-full blur-[110px] group-hover:bg-[#96588a]/40 transition-all duration-700 animate-pulse"></div>
                     
                     <div class="flex justify-between items-start relative z-10">
                        <div class="flex flex-col gap-4">
                           <!-- Chip: Polished Gold -->
                           <div class="w-12 h-9 bg-gradient-to-br from-yellow-200 via-yellow-600 to-yellow-400 rounded-lg relative overflow-hidden shadow-2xl border border-yellow-300/30">
                              <div class="absolute inset-x-0 top-1/2 h-px bg-black/30"></div>
                              <div class="absolute inset-y-0 left-1/4 w-px bg-black/30"></div>
                              <div class="absolute inset-y-0 left-2/4 w-px bg-black/30"></div>
                              <div class="absolute inset-y-0 left-3/4 w-px bg-black/30"></div>
                           </div>
                           <!-- Contactless Icon -->
                           <div class="text-white/30 group-hover:text-white/60 transition-colors">
                              <i data-lucide="rss" class="w-5 h-5 rotate-90"></i>
                           </div>
                        </div>
                        <div class="text-right">
                           <div class="flex items-center gap-1 justify-end">
                              <div class="w-8 h-8 border-2 border-white/10 rounded-full"></div>
                              <div class="w-8 h-8 bg-white/5 rounded-full -ml-4 backdrop-blur-md border border-white/10"></div>
                           </div>
                           <p class="text-[8px] font-black tracking-[0.4em] text-white/30 mt-3 uppercase font-mono">${currentBranch}</p>
                        </div>
                     </div>

                     <div class="relative z-10">
                        <p class="text-[9px] font-black text-[#d4afcd]/60 uppercase tracking-[0.5em] mb-1">Available Balance</p>
                        <div class="flex items-baseline gap-1">
                           <h2 id="cashier-balance-display" class="text-4xl font-black tracking-tighter tabular-nums text-white drop-shadow-[0_4px_3px_rgba(0,0,0,0.8)]">${fmt(baseFund - unliquidatedTotal)}</h2>
                        </div>
                        <p class="text-[7px] font-mono text-white/20 tracking-[0.2em] mt-2 uppercase italic">Exclusive Ayala Platinum Access</p>
                     </div>

                     <!-- Subtle Security Logo Overlay -->
                     <div class="absolute bottom-6 right-10 opacity-[0.02] group-hover:opacity-5 transition-all duration-700 scale-150 group-hover:rotate-12">
                        <i data-lucide="shield-check" class="w-24 h-24"></i>
                     </div>
                  </div>
               </div>

               <!-- Stats Card: Luxury Analytics -->
               <div class="luxury-card relative bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-[2.5rem] p-8 border-t border-white/60 dark:border-white/10 shadow-lg flex-1 flex flex-col justify-between overflow-hidden group">
                  <div class="luxury-shine"></div>
                  <!-- Subtle corner glow to match Platinum Card -->
                  <div class="absolute -top-20 -left-20 w-40 h-40 bg-[#96588a]/10 rounded-full blur-[80px]"></div>

                  <div class="relative z-10">
                     <div class="grid grid-cols-3 gap-3">
                        <div class="bg-slate-200/50 dark:bg-white/5 rounded-2xl p-3 text-center transition-all hover:bg-white/30 dark:hover:bg-white/10">
                           <p class="text-[7px] font-black text-amber-500 uppercase tracking-widest mb-1">Pending</p>
                           <p id="count-pending" class="text-xl font-black text-slate-800 dark:text-white tabular-nums">-</p>
                        </div>
                        <div class="bg-slate-200/50 dark:bg-white/5 rounded-2xl p-3 text-center transition-all hover:bg-white/30 dark:hover:bg-white/10">
                           <p class="text-[7px] font-black text-emerald-500 uppercase tracking-widest mb-1">Approved</p>
                           <p id="count-approved" class="text-xl font-black text-slate-800 dark:text-white tabular-nums">-</p>
                        </div>
                        <div class="bg-slate-200/50 dark:bg-white/5 rounded-2xl p-3 text-center transition-all hover:bg-white/30 dark:hover:bg-white/10">
                           <p class="text-[7px] font-black text-rose-500 uppercase tracking-widest mb-1">Rejected</p>
                           <p id="count-rejected" class="text-xl font-black text-slate-800 dark:text-white tabular-nums">-</p>
                        </div>
                     </div>
                  </div>

                  <div class="relative z-10 mt-6">
                     <div class="flex justify-between items-end mb-2">
                        <p class="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Spent this month</p>
                        <p id="cashier-spent-display" class="text-2xl font-black text-[#96588a] dark:text-white tabular-nums">${fmt(unliquidatedTotal)}</p>
                     </div>
                     <!-- Micro Progress Bar -->
                     <div class="h-1 w-full bg-slate-200/50 dark:bg-white/5 rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-[#96588a] to-rose-500 w-2/3 rounded-full opacity-80"></div>
                     </div>
                  </div>
               </div>
            </div>
         </div>

         <!-- Modal placeholder -->

         <!-- HISTORY SECTION -->
         <div class="pt-10 border-t border-slate-200/30 dark:border-white/10 mt-8">
            <div class="flex items-center justify-between mb-8">
               <div class="flex items-center gap-4">
                  <div class="w-12 h-12 flex items-center justify-center bg-[#96588a]/10 dark:bg-[#96588a]/20 text-[#96588a] rounded-2xl shadow-sm">
                     <i data-lucide="clock" class="w-6 h-6"></i>
                  </div>
                  <div>
                     <h4 class="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Recent History</h4>
                     <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Showing last recorded requests</p>
                  </div>
               </div>
               <div class="h-px flex-1 mx-8 bg-slate-200/30 dark:bg-white/5"></div>
            </div>
            <div class="bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-3xl border border-white/60 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[600px]">
               <div class="sticky top-0 z-20 grid grid-cols-12 gap-2 px-8 py-6 border-b border-slate-100 dark:border-white/5 bg-white/80 dark:bg-[#1a1a1a]/90 backdrop-blur-md">
                  <span class="col-span-3 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em]">Request ID</span>
                  <span class="col-span-3 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em]">Period</span>
                  <span class="col-span-2 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em]">Branch</span>
                  <span class="col-span-2 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em] text-right">Total Amount</span>
                  <span class="col-span-2 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em] text-right">Status</span>
               </div>
               <div id="history-list-container" class="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5 scrollbar-hide"></div>
            </div>
         </div>
      </div>
    `;
   }

   // Track editing state
   let currentEditingId = null;

   function attachCashierListeners() {
      const form = document.querySelector('#expense-form');
      const dropzone = document.querySelector('#file-dropzone');
      const fileInput = document.querySelector('#exp-file');
      const preview = document.querySelector('#file-preview');
      const categorySelect = document.querySelector('#exp-category');
      const purposeSelect = document.querySelector('#exp-purpose');
      const subCategoryWrap = document.querySelector('#exp-subcategory-wrap');
      const subCategorySelect = document.querySelector('#exp-subcategory');
      const descInput = document.querySelector('#exp-desc');
      const modalTitle = document.querySelector('#expense-modal h4');
      const submitBtn = document.querySelector('#save-exp-btn');
      const addModal = document.querySelector('#expense-modal');

      const resetForm = () => {
         if (form) form.reset();
         currentEditingId = null;
         selectedFile = null;
         if (fileInput) fileInput.value = '';
         if (preview) preview.classList.add('hidden');
         if (subCategoryWrap) subCategoryWrap.classList.add('hidden');
         if (modalTitle) modalTitle.textContent = 'Add Transaction';
         if (submitBtn) {
            submitBtn.textContent = 'Confirm & Save Transaction';
            submitBtn.className = "w-full py-5 bg-gradient-to-r from-[#96588a] to-[#7a4671] text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] transition-all shadow-xl shadow-[#96588a]/20 hover:shadow-[#96588a]/40 hover:-translate-y-0.5 active:scale-95";
         }
      };

      const normalizeMapping = (raw) => {
         if (!raw || typeof raw !== 'object') return { purposes: [], description: '', subcategories: {}, purposeAutoFill: {} };
         return {
            purposes: raw.purposeOptions || raw.purposes || [],
            description: raw.descriptionTemplate || raw.defaultDescription || raw.autoDescription || '',
            subcategories: raw.subcategories || {},
            purposeAutoFill: raw.purposeAutoFill || raw.purposeAutofill || {}
         };
      };

      const renderPurposeOptions = (options = []) => {
         if (!purposeSelect) return;
         const unique = [...new Set(options.filter(Boolean))];
         const fallback = purposes || [];
         const source = unique.length ? unique : fallback;
         purposeSelect.innerHTML = `<option value="">Select Purpose</option>${source.map(p => `<option value="${p}">${p}</option>`).join('')}`;
         if (source.length === 1) purposeSelect.value = source[0];
      };

      const applyAutoDescription = (text) => {
         if (!text || !descInput) return;
         const canOverwrite = !descInput.value.trim() || descInput.dataset.autofilled === 'true';
         if (canOverwrite) {
            descInput.value = text;
            descInput.dataset.autofilled = 'true';
         }
      };

      const getPurposeTemplate = (cfg, purpose) => {
         if (!cfg || !purpose) return '';
         const raw = cfg.purposeAutoFill?.[purpose];
         if (Array.isArray(raw)) return raw.find(Boolean) || '';
         return raw || '';
      };

      const getActiveConfig = () => {
         const cat = categorySelect?.value;
         const sub = subCategorySelect?.value;
         const catCfg = normalizeMapping(categoryMappings?.[cat]);
         if (!sub) return catCfg;
         const subCfg = normalizeMapping(catCfg.subcategories?.[sub]);
         return {
            ...catCfg,
            ...subCfg,
            purposes: subCfg.purposes.length ? subCfg.purposes : catCfg.purposes,
            purposeAutoFill: { ...(catCfg.purposeAutoFill || {}), ...(subCfg.purposeAutoFill || {}) }
         };
      };

      const applyCategoryRules = () => {
         if (!categorySelect) return;
         const cat = categorySelect.value;
         const cfg = normalizeMapping(categoryMappings?.[cat]);
         const subKeys = Object.keys(cfg.subcategories || {});

         if (subKeys.length) {
            if (subCategoryWrap) subCategoryWrap.classList.remove('hidden');
            if (subCategorySelect) {
               subCategorySelect.innerHTML = `<option value="">Select Sub Category</option>${subKeys.map(k => `<option value="${k}">${k}</option>`).join('')}`;
               subCategorySelect.value = '';
            }
            renderPurposeOptions(cfg.purposes);
            applyAutoDescription(cfg.description);
            applyPurposeAutoFill();
         } else {
            if (subCategoryWrap) subCategoryWrap.classList.add('hidden');
            if (subCategorySelect) subCategorySelect.innerHTML = '<option value="">Select Sub Category</option>';
            renderPurposeOptions(cfg.purposes);
            applyAutoDescription(cfg.description);
            applyPurposeAutoFill();
         }
      };

      const applySubCategoryRules = () => {
         const cfg = getActiveConfig();
         renderPurposeOptions(cfg.purposes);
         applyAutoDescription(cfg.description);
         applyPurposeAutoFill();
      };

      const applyPurposeAutoFill = () => {
         const cfg = getActiveConfig();
         if (purposeSelect) {
            const template = getPurposeTemplate(cfg, purposeSelect.value);
            if (template) applyAutoDescription(template);
         }
      };

      if (descInput) {
         descInput.addEventListener('input', () => {
            descInput.dataset.autofilled = 'false';
         });
      }
      if (categorySelect) categorySelect.addEventListener('change', applyCategoryRules);
      if (subCategorySelect) subCategorySelect.addEventListener('change', applySubCategoryRules);
      if (purposeSelect) purposeSelect.addEventListener('change', applyPurposeAutoFill);
      applyCategoryRules();

      if (dropzone && fileInput) dropzone.onclick = () => fileInput.click();

      if (fileInput) {
         fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
               selectedFile = file;
               const reader = new FileReader();
               reader.onload = (ev) => {
                  if (preview) {
                     const img = preview.querySelector('img');
                     if (img) img.src = ev.target.result;
                     preview.classList.remove('hidden');
                  }
                  if (window.lucide) window.lucide.createIcons();
               };
               reader.readAsDataURL(file);
            }
         };
      }

      const removeFileBtn = document.querySelector('#remove-file');
      if (removeFileBtn) {
         removeFileBtn.onclick = (e) => {
            e.stopPropagation();
            selectedFile = null;
            if (fileInput) fileInput.value = '';
            if (preview) preview.classList.add('hidden');
         };
      }

      if (form) {
         form.onsubmit = async (e) => {
            e.preventDefault();
            const dateVal = document.querySelector('#exp-date')?.value;
            const catVal = document.querySelector('#exp-category')?.value;
            const purVal = document.querySelector('#exp-purpose')?.value;
            const subCatVal = document.querySelector('#exp-subcategory')?.value || '';
            const amtVal = parseFloat(document.querySelector('#exp-amount')?.value || '0');
            const descVal = document.querySelector('#exp-desc')?.value;
            const invoiceVal = (document.querySelector('#exp-invoice')?.value || '').trim().toUpperCase();

            if (!amtVal || amtVal <= 0) { window.showToast("Amount must be greater than zero.", "error"); return; }

            if (!currentEditingId && !selectedFile) {
               window.showToast("Please attach a receipt image.", "error");
               return;
            }

            const btn = document.querySelector('#save-exp-btn');
            if (!btn) return;
            const originalText = btn.innerHTML;
            const originalClassName = btn.className;
            btn.disabled = true;
            btn.innerHTML = `
               <div class="flex items-center justify-center w-full gap-3">
                 <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                 <span class="font-black">Saving...</span>
               </div>
            `;

            try {
               let downloadUrl = null;
               if (selectedFile) {
                  const fileRef = ref(storage, `expenses_receipts/${Date.now()}_${selectedFile.name}`);
                  const uploadSnap = await uploadBytes(fileRef, selectedFile);
                  downloadUrl = await getDownloadURL(uploadSnap.ref);
               }

               const payload = {
                  branchId: currentBranch,
                  date: dateVal,
                  category: catVal,
                  subCategory: subCatVal || null,
                  purpose: purVal,
                  invoiceNo: invoiceVal || null,
                  amount: amtVal,
                  description: descVal,
                  fundedBy: 'petty_cash',
                  status: 'pending'
               };

               if (downloadUrl) payload.receiptUrl = downloadUrl;

               if (currentEditingId) {
                  await updateDoc(doc(db, 'expenses', currentEditingId), payload);
                  window.showToast('Transaction updated!', 'success');
               } else {
                  payload.createdAt = serverTimestamp();
                  await addDoc(collection(db, 'expenses'), payload);
                  window.showToast('Transaction saved!', 'success');
               }

               btn.className = originalClassName;
               btn.classList.remove('bg-slate-900', 'dark:bg-white', 'dark:text-slate-900');
               btn.classList.add('bg-emerald-500', 'hover:bg-emerald-600', 'dark:bg-emerald-500');
               btn.innerHTML = `
                 <div class="flex items-center justify-center w-full gap-3">
                   <span class="w-5 h-5 rounded-full bg-white/20 text-white flex items-center justify-center font-black">✓</span>
                   <span class="font-black">Done ${currentEditingId ? 'Updated' : 'Saved'}</span>
                 </div>
               `;

               setTimeout(async () => {
                  form.reset();
                  if (preview) {
                     preview.classList.add('hidden');
                     const img = preview.querySelector('img');
                     if (img) img.src = '';
                  }
                  selectedFile = null;

                  btn.disabled = false;
                  btn.innerHTML = originalText;
                  btn.className = originalClassName;

                  if (addModal) addModal.classList.add('hidden');

                  await loadMasterData();

                  const balanceEl = document.querySelector('#cashier-balance-display');
                  const spentEl = document.querySelector('#cashier-spent-display');
                  const fmt = n => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });

                  if (balanceEl) animateValue(balanceEl, (baseFund - unliquidatedTotal), fmt);
                  if (spentEl) animateValue(spentEl, unliquidatedTotal, fmt);

                  if (typeof loadCashierData === 'function') await loadCashierData();
                  if (typeof loadHistoryData === 'function') await loadHistoryData();
               }, 1000);
            } catch (err) {
               console.error(err);
               window.showToast("Failed to save: " + err.message, "error");
               if (btn) {
                  btn.disabled = false;
                  btn.innerHTML = originalText;
                  btn.className = originalClassName;
               }
            }
         };
      }

      const requestLiqBtn = container.querySelector('#request-liquidation-btn');
      if (requestLiqBtn) {
         requestLiqBtn.onclick = async () => {
            if (pendingTotal <= 0) { window.showToast('No pending expenses to liquidate.', 'error'); return; }
            if (pendingTotal > 4000) {
               const proceed = await window.showConfirmModal(
                  'Limit Warning',
                  `Total ₱${pendingTotal.toLocaleString()} exceeds the ₱4,000 petty cash limit. Proceed anyway?`,
                  'Proceed'
               );
               if (!proceed) return;
            }

            const confirmed = await window.showConfirmModal(
               'Request Liquidation',
               `Submit request for <strong>₱${pendingTotal.toLocaleString()}</strong>?`,
               'Send Request'
            );
            if (!confirmed) return;

            try {
               const q = query(collection(db, 'expenses'),
                  where('branchId', '==', currentBranch),
                  where('status', '==', 'pending'),
                  where('fundedBy', '==', 'petty_cash')
               );
               const snap = await getDocs(q);

               const expenseDates = snap.docs.map(d => d.data().date).sort();
               const startDate = expenseDates[0] || '---';
               const endDate = expenseDates[expenseDates.length - 1] || '---';

               const balanceAtRequest = baseFund - unliquidatedTotal;

               const liqRef = await addDoc(collection(db, 'liquidation_requests'), {
                  branchId: currentBranch,
                  totalAmount: pendingTotal,
                  status: 'pending',
                  itemCount: snap.docs.length,
                  startDate,
                  endDate,
                  balanceAtRequest: balanceAtRequest,
                  createdAt: serverTimestamp(),
                  createdBy: 'jimmiemetapon@gmail.com'
               });

               const batch = writeBatch(db);
               snap.docs.forEach(d => batch.update(d.ref, { status: 'requested', liquidationId: liqRef.id }));
               await batch.commit();

               // Audit Log: Submit Request
               await addDoc(collection(db, 'audit_logs'), {
                  action: 'submit_request',
                  requestId: liqRef.id,
                  branchId: currentBranch,
                  actor: 'jimmiemetapon@gmail.com',
                  totalAmount: pendingTotal,
                  balanceAtRequest: balanceAtRequest,
                  itemCount: snap.docs.length,
                  comment: `Submitted liquidation request for ₱${pendingTotal.toLocaleString()}`,
                  timestamp: serverTimestamp()
               });

               window.showToast('Liquidation request sent!', 'success');
               setTimeout(() => loadTabContent('cashier'), 1000);
            } catch (err) { console.error(err); }
         };
      }

      // Modal Triggers
      const addBtn = container.querySelector('#add-exp-btn');
      const closeBtn = document.querySelector('#close-exp-modal-btn');

      const closeAddModal = () => {
         if (!addModal) return;
         const inner = addModal.querySelector('.relative');
         addModal.classList.add('animate-fade-out');
         if (inner) inner.classList.add('animate-scale-down');
         setTimeout(() => {
            addModal.classList.add('hidden');
            addModal.classList.remove('animate-fade-out');
            if (inner) inner.classList.remove('animate-scale-down');
            resetForm();
         }, 200);
      };

      if (addBtn) addBtn.onclick = () => {
         resetForm();
         if (addModal) addModal.classList.remove('hidden');
      };
      if (closeBtn) closeBtn.onclick = () => closeAddModal();
      if (addModal) {
         addModal.onclick = (e) => {
            if (e.target === addModal) closeAddModal();
         };
      }


      loadCashierData();
   }

   // Function to initialize and move Add Transaction Modal to body
   function initAddTransactionModal() {
      if (document.getElementById('expense-modal')) return;
      const modalHtml = `
         <div id="expense-modal" class="fixed inset-0 z-[9999] hidden flex items-start justify-center p-1 sm:p-1 animate-fade-in bg-slate-900/10">
           <div class="relative w-full max-w-2xl mt-10">
            <!-- Layer 1: Dark Atmospheric Layer -->
            <div class="absolute inset-0 rounded-[2.5rem] bg-white/60 dark:bg-[#141414]/60 backdrop-blur-2xl shadow-2xl"></div>
            <!-- Layer 2: Main Glass Modal -->
            <div class="relative max-h-[95vh] overflow-y-auto rounded-[2.5rem] bg-white/[0.6] dark:bg-[#343434]/[0.4] backdrop-blur-[40px] backdrop-saturate-150 p-8">
               <div class="luxury-shine"></div>
               <button id="close-exp-modal-btn" class="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 rounded-full flex items-center justify-center transition-all z-20">
                  <i data-lucide="x" class="w-6 h-6"></i>
               </button>
               <div class="relative z-10 flex items-center gap-3 mb-8">
                  <div class="w-10 h-10 bg-[#96588a]/20 rounded-full flex items-center justify-center text-[#96588a]">
                     <i data-lucide="plus-circle" class="w-5 h-5"></i>
                  </div>
                  <h4 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">Add Transaction</h4>
               </div>
               <form id="expense-form" class="relative z-10 flex-1 flex flex-col justify-between gap-8">
                  <div class="grid grid-cols-1 lg:grid-cols-2 gap-10">
                     <div class="space-y-5">
                        <div class="space-y-1.5">
                           <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                           <select id="exp-category" required class="w-full bg-[#343434]/5 dark:bg-[#141414] dark:text-white/80 rounded-xl px-4 py-3.5 text-xs font-bold focus:ring-2 focus:ring-[#96588a] transition-all cursor-pointer">
                              <option value="">Select Category</option>
                              ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                           </select>
                        </div>
                        <div class="space-y-1.5">
                           <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Purpose</label>
                           <select id="exp-purpose" required class="w-full bg-[#343434]/5 dark:bg-[#141414] text-slate-700 dark:text-white border-none rounded-xl px-4 py-3.5 text-xs font-bold focus:ring-2 focus:ring-[#96588a] transition-all cursor-pointer">
                              <option value="">Select Purpose</option>
                              ${purposes.map(p => `<option value="${p}">${p}</option>`).join('')}
                           </select>
                        </div>
                        <div id="exp-subcategory-wrap" class="space-y-1.5 hidden">
                           <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Sub Category</label>
                           <select id="exp-subcategory" class="w-full bg-[#343434]/5 dark:bg-black/20 text-slate-700 dark:text-white border-none rounded-xl px-4 py-3.5 text-xs font-bold focus:ring-2 focus:ring-[#96588a] transition-all cursor-pointer">
                              <option value="">Select Sub Category</option>
                           </select>
                        </div>
                        <div class="space-y-1.5">
                           <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Detail Description</label>
                           <textarea id="exp-desc" required placeholder="Describe the expense..." rows="2" class="w-full bg-[#343434]/5 dark:bg-black/20 text-slate-700 dark:text-white border-none rounded-xl px-4 py-3.5 text-xs font-bold focus:ring-2 focus:ring-[#96588a] transition-all resize-none"></textarea>
                        </div>
                     </div>
                     <div class="space-y-5">
                        <div class="grid grid-cols-2 gap-4">
                           <div class="space-y-1.5">
                              <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount</label>
                              <div class="relative">
                                 <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/60 font-bold text-xs">₱</span>
                                 <input type="number" id="exp-amount" required step="0.01" placeholder="0.00" class="w-full bg-[#343434]/5 dark:bg-black/20 text-slate-700 dark:text-white border-none rounded-xl pl-8 pr-4 py-3.5 text-xs font-bold focus:ring-2 focus:ring-[#96588a] transition-all">
                              </div>
                           </div>
                           <div class="space-y-1.5">
                              <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Date</label>
                              <input type="date" id="exp-date" required value="${_localDate(new Date())}" class="w-full bg-[#343434]/5 dark:bg-black/20 text-slate-700 dark:text-white border-none rounded-xl px-4 py-3.5 text-xs font-bold focus:ring-2 focus:ring-[#96588a] transition-all cursor-pointer">
                           </div>
                        </div>
                        <div class="space-y-1.5">
                           <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Invoice No. (Optional)</label>
                           <input type="text" id="exp-invoice" placeholder="e.g. INV-2026-001" class="w-full bg-[#343434]/5 dark:bg-black/20 text-slate-700 dark:text-white border-none rounded-xl px-4 py-3.5 text-xs font-bold focus:ring-2 focus:ring-[#96588a] transition-all uppercase">
                        </div>
                        <div class="space-y-1.5">
                           <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Receipt Attachment</label>
                           <input type="file" id="exp-file" class="hidden" accept="image/*">
                           <div id="file-dropzone" class="border-2 border-dashed border-white/20 dark:border-white/10 rounded-2xl px-4 py-3.5 flex flex-row items-center justify-center gap-3 hover:bg-[#96588a]/5 hover:border-[#96588a]/40 transition-all cursor-pointer relative overflow-hidden group/zone">
                              <div id="file-preview" class="hidden absolute inset-0 bg-white dark:bg-slate-900 z-10 flex items-center justify-center">
                                 <img src="" class="h-full w-auto object-contain">
                                 <button type="button" id="remove-file" class="absolute top-2 right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
                              </div>
                              <div class="w-8 h-8 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center text-slate-400 group-hover/zone:text-[#96588a] transition-colors">
                                 <i data-lucide="camera" class="w-4 h-4"></i>
                               </div>
                              <span class="text-[9px] font-black text-slate-400 group-hover/zone:text-[#96588a] uppercase tracking-widest">Attach Receipt</span>
                           </div>
                        </div>
                     </div>
                  </div>
                  <button type="submit" id="save-exp-btn" class="w-full py-5 bg-gradient-to-r from-[#96588a] to-[#7a4671] text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] transition-all shadow-xl shadow-[#96588a]/20 hover:shadow-[#96588a]/40 hover:-translate-y-0.5 active:scale-95">
                     Confirm & Save Transaction
                  </button>
               </form>
            </div>
         </div>
         </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      if (window.lucide) window.lucide.createIcons();
   }


   async function showLiquidationDetailModal(reqData, onActionDone) {
      if (document.getElementById('liquidation-detail-overlay')) return;

      const overlay = document.createElement('div');
      overlay.id = 'liquidation-detail-overlay';
      overlay.className = 'fixed inset-0 z-[9999] bg-slate-900/20 animate-fade-in flex items-start justify-center p-1 sm:p-4';

      overlay.innerHTML = `
         <div class="relative w-full max-w-md mt-10 animate-scale-up">
            <!-- Layer 1: Dark Atmospheric Layer -->
            <div class="absolute inset-0 rounded-[2.5rem] bg-white/60 dark:bg-[#141414]/60 backdrop-blur-2xl shadow-2xl"></div>
            <!-- Layer 2: Main Glass Modal -->
            <div id="liquidation-modal-inner" class="relative max-h-[85vh] flex flex-col overflow-hidden rounded-[2.5rem] bg-white/[0.6] dark:bg-[#343434]/[0.4] backdrop-blur-[40px] backdrop-saturate-150">
               <!-- Content will be injected here -->
            </div>
         </div>
      `;
      document.body.appendChild(overlay);

      const modalContainer = overlay.querySelector('#liquidation-modal-inner');

      await renderLiquidationDetailContent(modalContainer, reqData, () => {
         overlay.remove();
         if (onActionDone) onActionDone();
      }, false);

      const closeBtn = modalContainer.querySelector('#detail-close');
      if (closeBtn) closeBtn.onclick = () => overlay.remove();
      const dismissBtn = modalContainer.querySelector('#detail-close-btn');
      if (dismissBtn) dismissBtn.onclick = () => overlay.remove();

      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
   }

   async function renderLiquidationDetailContent(targetContainer, reqData, onActionDone, isInline = false) {
      // Identify Context
      const isAuditMode = reqData.status === 'pending' && currentTab === 'audit';
      const isEditMode = reqData.status === 'rejected' || reqData.status === 'partially_rejected';

      targetContainer.innerHTML = `
            <!-- Modal Header -->
            <div class="p-6 flex items-center justify-between dark:bg-transparent flex-shrink-0 relative z-20">
               <div class="flex items-center gap-3">
                  <div class="w-8 h-8 flex items-center justify-center text-purple-700 bg-purple-50 dark:bg-purple-500/10 rounded-full">
                     <i data-lucide="building-2" class="w-4 h-4"></i>
                  </div>
                  <div>
                     <h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tighter leading-none">${reqData.branchId}</h3>
                     <p class="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">Financial Breakdown</p>
                  </div>
               </div>
               
               <div class="flex items-center gap-6">
                  <div class="text-right">
                     <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Requested</p>
                     <h2 class="text-base font-black text-[#96588a] dark:text-white tracking-tighter leading-none">₱${reqData.totalAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</h2>
                  </div>
                  ${isInline ? '' : `
                  <button id="detail-close" class="w-8 h-8 rounded-full bg-slate-50 dark:bg-white dark:bg-white/10 flex items-center justify-center text-slate-500 dark:text-white/90 hover:bg-rose-500 hover:text-white transition-all shadow-sm">
                     <i data-lucide="x" class="w-4 h-4"></i>
                  </button>
                  `}
               </div>
            </div>

            <div class="px-8 py-2 flex-shrink-0 flex items-center justify-between relative z-20">
               <p class="text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-[0.2em] pl-2 border-l-2 border-purple-500">Expenses List</p>
               <p class="text-[9px] text-slate-500 font-black uppercase tracking-widest italic">ID: ${reqData.id.substring(0, 8).toUpperCase()}</p>
            </div>

            <!-- Items List Area (Scrollable) -->
            <div id="detail-body" class="flex-1 overflow-y-auto px-6 py-2 space-y-1 custom-scrollbar min-h-[200px] relative z-10">
               <div class="space-y-1 animate-pulse">
                  ${Array(5).fill(0).map(() => `
                     <div class="flex items-center gap-3 px-4 py-2.5 rounded-xl border-b border-white/5">
                        <div class="w-6 h-6 bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
                        <div class="w-8 h-2.5 bg-slate-100 dark:bg-slate-800 rounded"></div>
                        <div class="flex-1 h-3 bg-slate-100 dark:bg-slate-800 rounded-md mx-2"></div>
                        <div class="w-12 h-3 bg-slate-100 dark:bg-slate-800 rounded"></div>
                     </div>
                  `).join('')}
               </div>
            </div>

            <!-- Action Footer (Fixed at bottom) -->
            <div class="px-8 pb-8 pt-4 flex-shrink-0 bg-transparent dark:bg-transparent backdrop-blur-md relative z-20">
               <div class="flex gap-2">
                  ${(reqData.status === 'pending' && currentTab === 'audit') ? `
                      <button id="detail-complete-review" class="w-full py-4 rounded-2xl bg-slate-900 dark:bg-white/10 dark:text-white text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 dark:hover:bg-white/20 transition-all shadow-xl">Complete Review</button>
                  ` : (reqData.status === 'pending') ? `
                      <button id="detail-cancel-request" class="w-full py-4 rounded-2xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-xl">Cancel Request</button>
                  ` : isEditMode ? `
                     <button id="detail-resubmit" class="w-full py-4 rounded-2xl bg-purple-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg">Submit Corrections</button>
                  ` : `
                     <button id="detail-close-btn" class="w-full py-4 rounded-2xl bg-slate-900 dark:bg-white/10 dark:text-white text-white text-[10px] font-black uppercase tracking-widest">Dismiss Detail</button>
                  `}
               </div>
            </div>
         </div>
         `;

      const detailBody = targetContainer.querySelector('#detail-body');
      try {
         const snap = await getDocs(query(collection(db, 'expenses'), where('liquidationId', '==', reqData.id), limit(500)));
         const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
         const resubmitFiles = {}; // Store new files for resubmission

         // Expenses List Header
         const headerContainer = targetContainer.querySelector('.px-8.py-2');
         if (isAuditMode && items.length > 0) {
            headerContainer.innerHTML = `
               <div class="flex items-center gap-4">
                  <p class="text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-[0.2em] pl-2 border-l-2 border-purple-500">Expenses List</p>
               </div>
               <p class="text-[9px] text-slate-500 font-black uppercase tracking-widest italic">ID: ${reqData.id.substring(0, 8).toUpperCase()}</p>
            `;
         }

         if (items.length === 0) {
            detailBody.innerHTML = `
               <div class="flex flex-col items-center justify-center py-16 opacity-40 animate-fade-in">
                  <i data-lucide="package-search" class="w-10 h-10 mb-2"></i>
                  <p class="text-[10px] font-black uppercase tracking-widest">No associated records</p>
               </div>
            `;
         } else {
            detailBody.innerHTML = `
               <div class="animate-fade-in space-y-1">
                  ${items.map(item => `
                     <div class="item-row group flex items-center gap-3 px-4 py-1.5 rounded-xl transition-all hover:bg-black/10 dark:hover:bg-white/10 cursor-default border-b border-white/5" data-id="${item.id}">
                        <div style="width: 45px;" class="flex-shrink-0">
                           <p class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase leading-none">${item.date.split('-').slice(1).join('/')}</p>
                        </div>
                        <div style="flex: 1; min-width: 0;" class="min-w-0">
                           <div class="flex items-center gap-2">
                              <p class="text-[11px] font-black text-black dark:text-white uppercase whitespace-nowrap overflow-hidden text-ellipsis">${item.purpose}</p>
                              ${item.auditorNote ? '<i data-lucide="alert-circle" class="w-3 h-3 text-rose-500 flex-shrink-0"></i>' : ''}
                           </div>
                        </div>
                        <div style="width: 90px;" class="text-right flex-shrink-0">
                           <p class="text-[13px] font-black text-rose-500 tracking-tighter">₱${item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                        </div>
                         <div style="width: 48px;" class="flex items-center justify-end gap-1.5">
                            ${isAuditMode ? `
                               <button class="flag-comment-btn text-slate-400 hover:text-rose-500 transition-all" data-id="${item.id}" title="Toggle feedback">
                                  <i data-lucide="message-square" class="w-3.5 h-3.5"></i>
                               </button>
                            ` : ''}
                            ${item.receiptUrl ? `
                               <button class="receipt-eye-btn text-slate-400 hover:text-purple-600 transition-all" data-url="${item.receiptUrl}">
                                  <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                               </button>
                            ` : ''}
                         </div>
                     </div>
                     ${isAuditMode ? `<div class="reject-reason-box hidden mx-4 mb-2 animate-fade-in" data-for="${item.id}">
                        <input type="text" class="reject-note w-full bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-[10px] font-bold text-rose-700 placeholder-rose-300" placeholder="Reason for rejection (required)">
                     </div>` : ''}
                     ${isEditMode && item.auditorNote ? `
                        <div class="mx-4 mb-4 p-4 bg-white/80 dark:bg-[#343434]/50 rounded-2xl space-y-3 animate-fade-in shadow-sm">
                           <p class="text-[9px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-1.5">
                              <i data-lucide="message-square" class="w-3 h-3"></i> Feedback: ${item.auditorNote}
                           </p>
                           <div class="grid grid-cols-2 gap-3">
                              <div class="space-y-1">
                                 <label class="text-[8px] font-black text-slate-400 uppercase ml-1">Correct Amount</label>
                                 <input type="number" class="edit-amount w-full bg-slate-50 border-none rounded-xl px-3 py-2 text-[11px] font-black text-black" value="${item.amount}">
                              </div>
                              <div class="space-y-1">
                                 <label class="text-[8px] font-black text-slate-400 uppercase ml-1">Correct Purpose</label>
                                 <input type="text" class="edit-purpose w-full bg-slate-50 border-none rounded-xl px-3 py-2 text-[11px] font-black text-black" value="${item.purpose}">
                              </div>
                           </div>
                           <div class="pt-1">
                              <input type="file" class="resubmit-file-input hidden" data-id="${item.id}" accept="image/*">
                              <button class="resubmit-file-btn w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-[9px] font-black uppercase text-slate-400 hover:border-purple-300 hover:text-purple-500 transition-all flex items-center justify-center gap-2">
                                 <i data-lucide="camera" class="w-3 h-3"></i> Change Receipt
                              </button>
                           </div>
                        </div>
                     ` : ''}
                  `).join('')}
               </div>
            `;
         }

         if (window.lucide) window.lucide.createIcons();


         detailBody.querySelectorAll('.flag-comment-btn').forEach(btn => {
            btn.onclick = () => {
               const reasonBox = detailBody.querySelector(`.reject-reason-box[data-for="${btn.dataset.id}"]`);
               if (reasonBox) reasonBox.classList.toggle('hidden');
            };
         });

         detailBody.querySelectorAll('.item-row').forEach(row => {
            row.onclick = (e) => {
               // If clicking an input or button inside, don't trigger the image
               if (e.target.closest('button') || e.target.closest('input')) return;

               const eyeBtn = row.querySelector('.receipt-eye-btn');
               const url = eyeBtn?.dataset.url;
               if (!url) return;

               // If we are in the Audit Workspace (isInline), show in Sidebar
               if (isInline && window.showAuditReceiptInSidebar) {
                  // Highlight row
                  detailBody.querySelectorAll('.item-row').forEach(r => r.classList.remove('bg-purple-50/50', 'dark:bg-purple-500/5', 'ring-1', 'ring-purple-500/20'));
                  row.classList.add('bg-purple-50/50', 'dark:bg-purple-500/5', 'ring-1', 'ring-purple-500/20');

                  window.showAuditReceiptInSidebar(url);
               } else {
                  // Otherwise (History Modal), show the classic Lightbox
                  const lb = document.createElement('div');
                  lb.className = 'fixed inset-0 bg-[#141414]/50 z-[10005] flex items-center justify-center p-6 cursor-zoom-out animate-fade-in';
                  lb.innerHTML = `<img src="${url}" class="max-w-full max-h-full object-contain rounded-3xl shadow-2xl animate-scale-up">`;
                  lb.onclick = () => lb.remove();
                  document.body.appendChild(lb);
               }
            };
         });

         detailBody.querySelectorAll('.receipt-eye-btn').forEach(btn => {
            btn.onclick = (e) => {
               e.stopPropagation(); // Stop from doubling the row click
               // The row click logic above will handle the actual display
            };
         });

         if (targetContainer.querySelector('#detail-cancel-request')) {
            targetContainer.querySelector('#detail-cancel-request').onclick = async () => {
               const confirmed = await window.showConfirmModal('Cancel Request', 'Are you sure you want to cancel this liquidation? Items will be returned to your pending list.');
               if (!confirmed) return;

               const btn = targetContainer.querySelector('#detail-cancel-request');
               const originalText = btn.innerHTML;
               btn.disabled = true;
               btn.innerHTML = `<div class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>`;

               try {
                  const batch = writeBatch(db);
                  const q = query(collection(db, 'expenses'), where('liquidationId', '==', reqData.id));
                  const snap = await getDocs(q);
                  snap.docs.forEach(d => batch.update(d.ref, { status: 'pending', liquidationId: null }));
                  batch.update(doc(db, 'liquidation_requests', reqData.id), { status: 'cancelled', cancelledAt: serverTimestamp() });
                  await batch.commit();

                  await addDoc(collection(db, 'audit_logs'), {
                     action: 'cancel_request',
                     requestId: reqData.id,
                     branchId: reqData.branchId,
                     actor: 'jimmiemetapon@gmail.com',
                     comment: `Request cancelled by cashier. Items reverted to pending.`,
                     timestamp: serverTimestamp()
                  });

                  const showSuccessTransition = () => {
                     const trans = document.createElement('div');
                     trans.className = 'absolute inset-0 z-[100] flex flex-col items-center justify-center bg-white/60 dark:bg-[#0D0D0D]/80 backdrop-blur-md transition-all duration-500 opacity-0';
                     trans.innerHTML = `
                        <div class="success-icon-container transform scale-50 opacity-0 transition-all duration-500 ease-out">
                           <div class="w-20 h-20 bg-rose-500 text-white rounded-3xl flex items-center justify-center shadow-2xl shadow-rose-500/20">
                              <i data-lucide="x-circle" class="w-10 h-10"></i>
                           </div>
                        </div>
                        <div class="success-text mt-4 text-center transform translate-y-4 opacity-0 transition-all duration-700 delay-100">
                           <h4 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tighter leading-none">Request Cancelled</h4>
                           <p class="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">Items returned to pending list</p>
                        </div>
                     `;

                     targetContainer.style.position = 'relative';
                     targetContainer.appendChild(trans);
                     if (window.lucide) window.lucide.createIcons();

                     requestAnimationFrame(() => {
                        trans.classList.remove('opacity-0');
                        trans.querySelector('.success-icon-container').classList.remove('scale-50', 'opacity-0');
                        trans.querySelector('.success-text').classList.remove('translate-y-4', 'opacity-0');
                     });

                     setTimeout(() => {
                        trans.classList.add('opacity-0');
                        setTimeout(() => {
                           if (isInline) {
                              targetContainer.innerHTML = `
                                 <div class="flex-1 flex flex-col items-center justify-center text-slate-400 opacity-60">
                                    <i data-lucide="mouse-pointer-click" class="w-12 h-12 mb-4"></i>
                                    <h3 class="text-xl font-black uppercase tracking-widest">Review Pane</h3>
                                    <p class="text-xs font-bold uppercase tracking-tighter">Select a request to start auditing</p>
                                 </div>
                              `;
                              if (window.lucide) window.lucide.createIcons();
                           }
                           onActionDone();
                        }, 500);
                     }, 1200);
                  };

                  showSuccessTransition();
                  window.showToast('Request cancelled successfully', 'info');
               } catch (err) {
                  console.error(err);
                  btn.disabled = false;
                  btn.innerHTML = originalText;
                  window.showToast('Error cancelling request', 'error');
               }
            };
         }

         if (isAuditMode && targetContainer.querySelector('#detail-complete-review')) {
            targetContainer.querySelector('#detail-complete-review').onclick = async () => {
               // Gather per-item decisions (Comment = Rejected, No Comment = Approved)
               const approvedItems = [];
               const rejectedItems = [];

               items.forEach(item => {
                  const noteInput = detailBody.querySelector(`.reject-reason-box[data-for="${item.id}"] .reject-note`);
                  const note = noteInput?.value?.trim();
                  if (note) {
                     rejectedItems.push({ id: item.id, note });
                  } else {
                     approvedItems.push(item.id);
                  }
               });

               const batch = writeBatch(db);
               const approvedAmount = items.filter(i => approvedItems.includes(i.id)).reduce((sum, i) => sum + i.amount, 0);

               // Update individual expense statuses
               approvedItems.forEach(id => batch.update(doc(db, 'expenses', id), { status: 'liquidated', auditorNote: null }));
               rejectedItems.forEach(r => batch.update(doc(db, 'expenses', r.id), { status: 'rejected', auditorNote: r.note }));

               // Determine request status
               let reqStatus, logAction, logComment;
               if (rejectedItems.length === 0) {
                  reqStatus = 'approved';
                  logAction = 'approve_request';
                  logComment = `Approved all ${items.length} items — ₱${approvedAmount.toLocaleString()} replenished`;
               } else {
                  reqStatus = 'rejected';
                  logAction = 'reject_request';
                  logComment = `Rejected ${rejectedItems.length} item(s) — Request sent back for correction. No funds replenished yet.`;
               }

               batch.update(doc(db, 'liquidation_requests', reqData.id), {
                  status: reqStatus,
                  approvedAmount: reqStatus === 'approved' ? approvedAmount : 0,
                  rejectedCount: rejectedItems.length,
                  approvedCount: approvedItems.length,
                  reviewedAt: serverTimestamp()
               });
               await batch.commit();

               // Replenish petty cash naturally by marking items as liquidated
               // (No need to increment petty_base in DB as the display formula already handles it)
               // The balance will jump back because items are no longer in unliquidatedTotal.

               // Audit Log
               await addDoc(collection(db, 'audit_logs'), {
                  action: logAction,
                  requestId: reqData.id,
                  branchId: reqData.branchId,
                  actor: 'jimmiemetapon@gmail.com',
                  approvedAmount,
                  approvedCount: approvedItems.length,
                  rejectedCount: rejectedItems.length,
                  rejectedItems: rejectedItems.map(r => ({ id: r.id, note: r.note })),
                  comment: logComment,
                  timestamp: serverTimestamp()
               });

               if (reqStatus === 'approved') {
                  const approvedRows = items.filter(i => approvedItems.includes(i.id));
                  try {
                     await exportApprovedRequestTemplate(reqData, approvedRows);
                     window.showToast('Approval form downloaded.', 'success');
                  } catch (templateErr) {
                     console.error('Template export failed:', templateErr);
                     window.showToast('Approved, but template download failed. Check template path.', 'error');
                  }
               }

               const showSuccessTransition = () => {
                  const trans = document.createElement('div');
                  trans.className = 'absolute inset-0 z-[100] flex flex-col items-center justify-center bg-white/60 dark:bg-[#0D0D0D]/80 backdrop-blur-md transition-all duration-500 opacity-0';
                  trans.innerHTML = `
                     <div class="success-icon-container transform scale-50 opacity-0 transition-all duration-500 ease-out">
                        <div class="w-20 h-20 bg-[#96588a] text-white rounded-3xl flex items-center justify-center shadow-2xl shadow-purple-500/20">
                           <i data-lucide="shield-check" class="w-10 h-10"></i>
                        </div>
                     </div>
                     <div class="success-text mt-4 text-center transform translate-y-4 opacity-0 transition-all duration-700 delay-100">
                        <h4 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tighter leading-none">Review Processed</h4>
                        <p class="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">Queue updated successfully</p>
                     </div>
                  `;

                  targetContainer.style.position = 'relative';
                  targetContainer.appendChild(trans);
                  if (window.lucide) window.lucide.createIcons();

                  requestAnimationFrame(() => {
                     trans.classList.remove('opacity-0');
                     trans.querySelector('.success-icon-container').classList.remove('scale-50', 'opacity-0');
                     trans.querySelector('.success-text').classList.remove('translate-y-4', 'opacity-0');
                  });

                  setTimeout(() => {
                     trans.classList.add('opacity-0');
                     setTimeout(() => {
                        if (isInline) {
                           targetContainer.innerHTML = `
                              <div class="flex-1 flex flex-col items-center justify-center text-slate-400 opacity-60">
                                 <i data-lucide="mouse-pointer-click" class="w-12 h-12 mb-4"></i>
                                 <h3 class="text-xl font-black uppercase tracking-widest">Review Pane</h3>
                                 <p class="text-xs font-bold uppercase tracking-tighter">Select a request to start auditing</p>
                              </div>
                           `;
                           if (window.lucide) window.lucide.createIcons();
                        }
                        onActionDone();
                     }, 500);
                  }, 1200);
               };

               showSuccessTransition();
               window.showToast(reqStatus === 'approved' ? 'Liquidation approved!' : `Review complete — ${rejectedItems.length} item(s) rejected`, reqStatus === 'approved' ? 'success' : 'info');
            };
         }

         if (isEditMode) {
            // Edit mode listeners for file changes
            detailBody.querySelectorAll('.resubmit-file-btn').forEach(btn => {
               const input = btn.parentElement.querySelector('.resubmit-file-input');
               const nameLabel = btn.parentElement.querySelector('.resubmit-file-name');
               btn.onclick = () => input.click();
               input.onchange = (e) => {
                  const file = e.target.files[0];
                  if (file) {
                     resubmitFiles[input.dataset.id] = file;
                     nameLabel.textContent = `New: ${file.name}`;
                     nameLabel.classList.remove('hidden');
                     btn.classList.add('border-purple-300', 'text-purple-500');
                  }
               };
            });

            const resubmitBtn = targetContainer.querySelector('#detail-resubmit');
            if (resubmitBtn) resubmitBtn.onclick = async () => {
               const btn = resubmitBtn;
               const originalText = btn.innerText;
               btn.disabled = true;
               btn.innerHTML = `<div class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Processing...`;

               try {
                  const batch = writeBatch(db);
                  let total = 0;

                  // Process rows
                  const rows = Array.from(detailBody.querySelectorAll('.item-row'));
                  for (const row of rows) {
                     const itemId = row.dataset.id;
                     const amtInput = row.parentElement.querySelector(`.item-row[data-id="${itemId}"] + * .edit-amount`);
                     const purInput = row.parentElement.querySelector(`.item-row[data-id="${itemId}"] + * .edit-purpose`);

                     if (amtInput && purInput) {
                        const amt = parseFloat(amtInput.value);
                        const updateData = { amount: amt, purpose: purInput.value, auditorNote: null };

                        // Handle image replacement if any
                        if (resubmitFiles[itemId]) {
                           const file = resubmitFiles[itemId];
                           const fileRef = ref(storage, `expenses_receipts/${Date.now()}_${file.name}`);
                           const uploadSnap = await uploadBytes(fileRef, file);
                           updateData.receiptUrl = await getDownloadURL(uploadSnap.ref);
                        }

                        batch.update(doc(db, 'expenses', itemId), updateData);
                        total += amt;
                     } else {
                        total += items.find(i => i.id === itemId).amount;
                     }
                  }

                  batch.update(doc(db, 'liquidation_requests', reqData.id), { status: 'pending', totalAmount: total, resubmittedAt: serverTimestamp() });
                  await batch.commit();

                  // Audit Log: Resubmit
                  await addDoc(collection(db, 'audit_logs'), {
                     action: 'resubmit_request',
                     requestId: reqData.id,
                     branchId: reqData.branchId,
                     actor: 'jimmiemetapon@gmail.com',
                     totalAmount: total,
                     comment: `Resubmitted with corrections — new total ₱${total.toLocaleString()}`,
                     timestamp: serverTimestamp()
                  });

                  onActionDone();
                  window.showToast('Request resubmitted!', 'success');
               } catch (err) {
                  console.error(err);
                  btn.disabled = false;
                  btn.innerText = originalText;
                  window.showToast('Error during resubmission', 'error');
               }
            };
         }

         if (window.lucide) window.lucide.createIcons();
      } catch (err) { console.error(err); }
   }

   function renderLedgerTab() {
      return `
      <div class="space-y-8 animate-fade-in">
         <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 class="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Financial Ledgers</h3>
            <div class="flex items-center gap-2">
               <input type="file" id="import-excel-file" class="hidden" accept=".xlsx, .xls">
               <button id="import-excel-btn" class="px-5 py-2.5 bg-slate-100 dark:bg-[#343434] shadow-sm rounded-full text-[10px] text-blue-500 font-bold uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm">
                  <i data-lucide="file-up" class="w-4 h-4 text-blue-500"></i> Import Excel
               </button>
               <button id="export-ledger-btn" class="px-5 py-2.5 bg-[#96588a] text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-[#96588a]/20 flex items-center gap-2">
                  <i data-lucide="download" class="w-4 h-4"></i> Export
               </button>
            </div>
         </div>

         <div class="luxury-card relative bg-white/40 dark:bg-[#141414]/60 rounded-[2.5rem] shadow-2xl backdrop-blur-3xl border-t border-white/60 dark:border-white/20 group overflow-hidden">
            <div class="luxury-shine"></div>
            <div class="channel-card-accent" style="background-color: #96588a; opacity: 0.15; transform: scale(2.5); filter: blur(100px); top: -20%; left: -10%;"></div>

            <div class="relative z-10 flex flex-col">
               <!-- Unified Header with Sub-tabs -->
               <!-- Subdued Header Area -->
               <div class="px-8 pt-8 pb-2 flex justify-between items-center">
                  <p class="text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em]">Transaction Records</p>
                  <div class="flex items-center gap-3">
                     <!-- Accountant Advanced Import (Round) -->
                     <input type="file" id="import-accountant-file" class="hidden" accept=".xlsx, .xls">
                     <button id="import-accountant-btn" class="hidden w-10 h-10 flex items-center justify-center bg-[#96588a] text-white rounded-full hover:bg-[#7a4671] transition-all shadow-lg shadow-[#96588a]/20" title="Import Accountant Advanced Excel">
                        <i data-lucide="file-up" class="w-5 h-5"></i>
                     </button>
                  </div>
               </div>

               <div class="p-8">
                  <!-- Ledger Filters (Search + Date) -->
                  <div class="mb-6">
                     <div class="flex flex-col lg:flex-row lg:items-end gap-3 justify-between">
                        <div class="flex-1 flex flex-col sm:flex-row items-end gap-3">
                           <div class="w-full sm:w-44 space-y-1">
                              <label class="text-[9px] font-black text-slate-400 dark:text-white uppercase tracking-widest">Fund Source</label>
                              <div class="group/fund relative">
                                 <div id="ledger-type-trigger" class="w-full bg-slate-100 dark:bg-[#343434] border-none rounded-full px-5 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-700 dark:text-white cursor-pointer flex justify-between items-center transition-all hover:bg-slate-200 dark:hover:bg-[#444444]">
                                    <span id="ledger-type-label">Petty Cash Fund</span>
                                    <i data-lucide="chevron-down" class="w-3 h-3 opacity-40 group-hover/fund:rotate-180 transition-transform duration-300"></i>
                                 </div>
                                 <!-- Bridge padding (pt-2) to prevent "dead zone" gap -->
                                 <div class="absolute top-full left-0 w-full pt-2 hidden group-hover/fund:block z-50">
                                    <div class="overflow-hidden rounded-2xl bg-white/70 dark:bg-[#2a2a2a]/90 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-2xl animate-fade-in origin-top">
                                       <div class="ledger-type-opt px-5 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-white hover:bg-[#96588a] hover:text-white cursor-pointer transition-all" data-value="petty-view">Petty Cash Fund</div>
                                       <div class="ledger-type-opt px-5 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-white hover:bg-[#96588a] hover:text-white cursor-pointer transition-all border-t border-slate-100 dark:border-white/5" data-value="accountant-view">Accountant (HO)</div>
                                    </div>
                                 </div>
                              </div>
                           </div>
                           <div class="flex-1 w-full space-y-1">
                              <label class="text-[9px] font-black text-slate-400 dark:text-white uppercase tracking-widest">Search</label>
                              <input id="ledger-search" type="text" placeholder="Purpose / Description / Category / Invoice No."
                                class="w-full bg-slate-100 dark:bg-[#343434] border-none rounded-full px-4 py-3 text-[10px] font-bold focus:ring-2 focus:ring-[#96588a] transition-all">
                           </div>
                           <div class="w-full sm:w-44 space-y-1">
                              <label class="text-[9px] font-black text-slate-400 dark:text-white uppercase tracking-widest">Date Range</label>
                              <div class="relative group/date">
                                 <i data-lucide="calendar" class="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#96588a] dark:text-white pointer-events-none"></i>
                                 <input id="ledger-range" type="text" placeholder="Select Date Range" readonly
                                   class="w-full bg-slate-100 dark:bg-[#343434] border-none rounded-full pl-11 pr-4 py-3 text-[10px] dark:text-white font-bold focus:ring-2 focus:ring-[#96588a] transition-all cursor-pointer"
                                   value="${yesterdayStr} to ${yesterdayStr}">
                              </div>
                           </div>
                        </div>
                        <div class="flex gap-2">
                           <button id="ledger-apply-btn"
                             class="px-5 py-3 bg-green-500 dark:bg-green-500/50 rounded-full text-[10px] font-black text-white uppercase tracking-widest dark:hover:bg-[#141414] dark:hover:bg-[#141414] transition-all shadow-sm">
                              Apply
                           </button>
                           <button id="ledger-clear-btn"
                             class="px-5 py-3 bg-rose-500 dark:bg-rose-500/50 rounded-full text-[10px] font-black text-white uppercase tracking-widest dark:hover:bg-[#141414] dark:hover:bg-[#141414] transition-all shadow-sm">
                              Clear
                           </button>
                        </div>
                     </div>
                  </div>

                  <!-- Petty Cash View -->
                  <div id="petty-view" class="ledger-view animate-fade-in">
                     <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                           <thead>
                              <tr class="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-transparent">
                                 <th class="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em]">Date</th>
                                 <th class="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em]">Purpose & Detail</th>
                                 <th class="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em]">Category</th>
                                 <th class="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-right">Amount</th>
                                 <th class="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-center">Actions</th>
                              </tr>
                           </thead>
                           <tbody id="petty-table-body" class="divide-y divide-slate-100 dark:divide-white/5">
                              <tr><td colspan="5" class="px-8 py-12 text-center text-[11px] text-slate-400 italic">Loading records...</td></tr>
                           </tbody>
                        </table>
                     </div>
                  </div>

                  <!-- Accountant View -->
                  <div id="accountant-view" class="ledger-view hidden animate-fade-in">
                     <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                           <thead>
                              <tr class="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-transparent">
                                 <th class="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em]">Date</th>
                                 <th class="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em]">Purpose & Detail</th>
                                 <th class="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em]">Category</th>
                                 <th class="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-right">Amount</th>
                                 <th class="px-8 py-5 text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.15em] text-center">Actions</th>
                              </tr>
                           </thead>
                           <tbody id="accountant-table-body" class="divide-y divide-slate-100 dark:divide-white/5">
                              <tr><td colspan="5" class="px-8 py-12 text-center text-[11px] text-slate-400 italic">Loading records...</td></tr>
                           </tbody>
                        </table>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </div>
      `;
   }

   async function loadLedgerData() {
      const pettyBody = container.querySelector('#petty-table-body');
      const accountantBody = container.querySelector('#accountant-table-body');
      if (!pettyBody) return;

      try {
         const searchText = (container.querySelector('#ledger-search')?.value || '').trim().toLowerCase();
         const rangeVal = container.querySelector('#ledger-range')?.value || '';
         let fromDate = '', toDate = '';
         if (rangeVal.includes(' to ')) {
            [fromDate, toDate] = rangeVal.split(' to ');
         } else if (rangeVal) {
            fromDate = toDate = rangeVal;
         }

         let docs = [];
         try {
            const constraints = [];
            if (currentBranch && currentBranch !== 'All Branches') {
               constraints.push(where('branchId', '==', currentBranch));
            }
            if (fromDate) constraints.push(where('date', '>=', fromDate));
            if (toDate) constraints.push(where('date', '<=', toDate));
            constraints.push(orderBy('date', 'desc'), limit(500));

            const q = query(collection(db, 'expenses'), ...constraints);
            const snap = await getDocs(q);
            docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
         } catch (qErr) {
            console.warn('Ledger query fallback:', qErr);
            let constraints = [orderBy('date', 'desc'), limit(300)];
            if (currentBranch && currentBranch !== 'All Branches') {
               constraints.unshift(where('branchId', '==', currentBranch));
            }
            const q = query(collection(db, 'expenses'), ...constraints);
            const snap = await getDocs(q);
            docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
         }

         // Client-side filtering
         if (fromDate) docs = docs.filter(d => (d.date || '') >= fromDate);
         if (toDate) docs = docs.filter(d => (d.date || '') <= toDate);
         if (searchText) {
            docs = docs.filter(d => {
               const fields = [d.purpose, d.description, d.category, d.invoiceNo];
               return fields.some(v => (v || '').toString().toLowerCase().includes(searchText));
            });
         }

         const renderRows = (data) => data.map(d => `
            <tr class="group border-b border-slate-100 dark:border-white/5 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-all">
               <td class="px-8 py-5">
                  <p class="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight">${d.date}</p>
               </td>
               <td class="px-8 py-5">
                  <div class="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight">${d.purpose || '---'}</div>
                  <div class="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1 opacity-60 line-clamp-1">${d.description || '---'}</div>
               </td>
               <td class="px-8 py-5">
                  <span class="inline-flex px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-[10px] font-black uppercase text-slate-600 dark:text-white/60">
                     ${d.category}
                  </span>
               </td>
               <td class="px-8 py-5 text-right">
                  <p class="text-[11px] font-black text-[#96588a] dark:text-white">₱${(d.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
               </td>
               <td class="px-8 py-5">
                  <div class="flex items-center justify-center gap-2.5">
                     <button class="view-ledger-btn w-8 h-8 flex items-center justify-center rounded-full hover:bg-white dark:hover:bg-white/10 hover:shadow-md transition-all opacity-0 group-hover:opacity-100 text-slate-400"
                       data-id="${d.id}" title="View Details">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                     </button>
                     <button class="edit-ledger-btn w-8 h-8 flex items-center justify-center rounded-full bg-indigo-50/50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 dark:hover:bg-indigo-500 hover:text-white transition-all opacity-0 group-hover:opacity-100" data-id='${JSON.stringify(d).replace(/'/g, "&#39;")}' title="Edit Entry">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                     </button>
                     <button class="delete-ledger-btn w-8 h-8 flex items-center justify-center rounded-full bg-rose-50/50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 hover:bg-rose-500 hover:text-white transition-all opacity-0 group-hover:opacity-100" data-id="${d.id}" title="Delete Entry">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                     </button>
                  </div>
               </td>
            </tr>
            <tr id="ledger-detail-${d.id}" class="ledger-detail-row hidden bg-slate-50/50 dark:bg-white/[0.01]">
               <td colspan="5" class="px-8 py-6">
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                     <div class="space-y-4">
                        <div>
                           <p class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5">Invoice No.</p>
                           <p class="text-[11px] font-black text-slate-900 dark:text-white uppercase">${d.invoiceNo || '---'}</p>
                        </div>
                        <div>
                           <p class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5">Receipt</p>
                           ${d.receiptUrl ? `
                              <a href="${d.receiptUrl}" target="_blank" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#96588a]/10 text-[#96588a] text-[10px] font-black uppercase tracking-widest hover:bg-[#96588a] hover:text-white transition-all">
                                 <i data-lucide="external-link" class="w-3 h-3"></i> View Receipt
                              </a>
                           ` : '<p class="text-[11px] font-black text-slate-400 uppercase">NO IMAGE</p>'}
                        </div>
                     </div>
                     <div class="md:col-span-2">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5">Full Description</p>
                        <p class="text-[11px] font-bold text-slate-700 dark:text-slate-300 leading-relaxed">${d.description || 'No detailed description provided.'}</p>
                     </div>
                  </div>
               </td>
            </tr>
         `).join('');

         pettyBody.innerHTML = renderRows(docs.filter(d => d.fundedBy === 'petty_cash')) || '<tr><td colspan="5" class="py-8 text-center text-xs italic">No records</td></tr>';
         accountantBody.innerHTML = renderRows(docs.filter(d => d.fundedBy === 'accountant')) || '<tr><td colspan="5" class="py-8 text-center text-xs italic">No records</td></tr>';
         if (window.lucide) window.lucide.createIcons();
      } catch (err) { console.error("Ledger Load Error:", err); }
   }

   function attachLedgerListeners() {
      const pettyTable = container.querySelector('#petty-table-body');
      const accountantTable = container.querySelector('#accountant-table-body');

      if (pettyTable) pettyTable.onclick = (e) => handleLedgerAction(e);
      if (accountantTable) accountantTable.onclick = (e) => handleLedgerAction(e);

      async function handleLedgerAction(e) {
         const viewBtn = e.target.closest('.view-ledger-btn');
         const editBtn = e.target.closest('.edit-ledger-btn');
         const deleteBtn = e.target.closest('.delete-ledger-btn');

         if (viewBtn) {
            const id = viewBtn.getAttribute('data-id');
            const detailRow = container.querySelector(`#ledger-detail-${id}`);
            if (!detailRow) return;

            container.querySelectorAll('.ledger-detail-row').forEach(r => {
               if (r !== detailRow) r.classList.add('hidden');
            });
            detailRow.classList.toggle('hidden');
            return;
         }

         if (deleteBtn) {
            const id = deleteBtn.getAttribute('data-id');
            const confirmed = await window.showConfirmModal('Delete Record', 'Are you sure you want to permanently delete this record?');
            if (confirmed) {
               try {
                  await deleteDoc(doc(db, 'expenses', id));
                  window.showToast('Record deleted', 'success');
                  loadLedgerData();
               } catch (err) {
                  console.error(err);
                  window.showToast('Delete failed', 'error');
               }
            }
         }

         if (editBtn) {
            try {
               const item = JSON.parse(editBtn.getAttribute('data-id'));
               showEditLedgerModal(item);
            } catch (err) { console.error(err); }
         }
      }

      // Fund Type Dropdown Handler (Custom UI)
      const typeOpts = container.querySelectorAll('.ledger-type-opt');
      const typeLabel = container.querySelector('#ledger-type-label');
      typeOpts.forEach(opt => {
         opt.onclick = () => {
            const val = opt.dataset.value;
            if (typeLabel) typeLabel.textContent = opt.textContent;

            // Toggle Views
            container.querySelectorAll('.ledger-view').forEach(v => v.classList.add('hidden'));
            const targetView = container.querySelector(`#${val}`);
            if (targetView) targetView.classList.remove('hidden');

            // Toggle Accountant Import Button visibility
            const accImp = container.querySelector('#import-accountant-btn');
            if (accImp) {
               if (val === 'accountant-view') accImp.classList.remove('hidden');
               else accImp.classList.add('hidden');
            }
         };
      });

      // Filters
      const ledgerSearch = container.querySelector('#ledger-search');
      const ledgerFrom = container.querySelector('#ledger-from');
      const ledgerTo = container.querySelector('#ledger-to');
      const ledgerApply = container.querySelector('#ledger-apply-btn');
      const ledgerClear = container.querySelector('#ledger-clear-btn');

      let ledgerDebounce = null;
      if (ledgerSearch) {
         ledgerSearch.oninput = () => {
            clearTimeout(ledgerDebounce);
            ledgerDebounce = setTimeout(() => loadLedgerData(), 250);
         };
      }
      const ledgerRange = container.querySelector('#ledger-range');
      if (ledgerRange && window.flatpickr) {
         window.flatpickr(ledgerRange, {
            mode: "range",
            dateFormat: "Y-m-d",
            onClose: () => loadLedgerData()
         });
      }
      if (ledgerApply) ledgerApply.onclick = () => loadLedgerData();
      if (ledgerClear) {
         ledgerClear.onclick = () => {
            if (ledgerSearch) ledgerSearch.value = '';
            if (ledgerFrom) ledgerFrom.value = '';
            if (ledgerTo) ledgerTo.value = '';
            loadLedgerData();
         };
      }

      // --- ADVANCED ACCOUNTANT IMPORT LOGIC ---
      const importAccBtn = container.querySelector('#import-accountant-btn');
      const importAccFile = container.querySelector('#import-accountant-file');

      if (importAccBtn) importAccBtn.onclick = () => {
         if (currentBranch === 'All Branches') { alert('Select a specific branch first.'); return; }
         importAccFile.click();
      };

      if (importAccFile) {
         importAccFile.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            window.showToast('Loading advanced parser...', 'info');

            try {
               const XLSX = await import('xlsx');
               const reader = new FileReader();
               reader.onload = async (ev) => {
                  try {
                     const data = new Uint8Array(ev.target.result);
                     const workbook = XLSX.read(data, { type: 'array' });
                     const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                     const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });


                     // Grouping Logic (Starting from Row 2)
                     const invoiceMap = {};
                     let totalRows = 0;

                     for (let i = 1; i < rows.length; i++) {
                        const r = rows[i];
                        if (!r || !r[1]) continue; // Skip if Transaction ID (Col B) is empty

                        const transId = String(r[1]).trim();
                        const date = standardizeDate(r[2]); // Col C
                        if (!date) continue;

                        if (!invoiceMap[transId]) {
                           invoiceMap[transId] = {
                              transId: transId,
                              date: date,
                              purpose: r[8] || 'Accountant Import', // Col I
                              totalBill: cleanNumber(r[30]), // Col AE
                              items: []
                           };
                        }

                        invoiceMap[transId].items.push({
                           itemName: String(r[45] || '').trim().toUpperCase(), // Col AT
                           unit: String(r[46] || '').trim(), // Col AU
                           quantity: cleanNumber(r[48]), // Col AW
                           unitPrice: cleanNumber(r[52]), // Col BA
                           lineTotal: cleanNumber(r[53]) // Col BB
                        });
                        totalRows++;
                     }

                     const invoiceIds = Object.keys(invoiceMap);
                     if (invoiceIds.length === 0) {
                        window.showToast('No valid Transaction IDs found!', 'error');
                        return;
                     }

                     // Rich Detailed Preview
                     const totalAmount = invoiceIds.reduce((sum, id) => sum + invoiceMap[id].totalBill, 0);
                     const previewHtml = `
                         <div class="space-y-6">
                            <div class="grid grid-cols-3 gap-3">
                               <div class="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                                  <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Invoices</p>
                                  <p class="text-lg font-black text-[#96588a]">${invoiceIds.length}</p>
                               </div>
                               <div class="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                                  <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Items</p>
                                  <p class="text-lg font-black text-blue-500">${totalRows}</p>
                               </div>
                               <div class="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                                  <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Value</p>
                                  <p class="text-lg font-black text-emerald-500">₱${totalAmount.toLocaleString()}</p>
                               </div>
                            </div>
                            
                            <div class="rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                               <div class="max-h-[350px] overflow-y-auto scrollbar-thin">
                                  <table class="w-full text-left border-collapse text-[10px]">
                                     <thead class="sticky top-0 bg-white dark:bg-slate-900 z-10">
                                        <tr class="border-b border-slate-100 dark:border-slate-800">
                                           <th class="px-4 py-3 font-black text-slate-400 uppercase">Trans ID</th>
                                           <th class="px-4 py-3 font-black text-slate-400 uppercase">Date</th>
                                           <th class="px-4 py-3 font-black text-slate-400 uppercase text-center">Items</th>
                                           <th class="px-4 py-3 font-black text-slate-400 uppercase text-right">Amount</th>
                                        </tr>
                                     </thead>
                                     <tbody>
                                        ${invoiceIds.map(id => {
                        const inv = invoiceMap[id];
                        return `
                                              <tr class="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                 <td class="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">${inv.transId}</td>
                                                 <td class="px-4 py-3 text-slate-500">${inv.date}</td>
                                                 <td class="px-4 py-3 text-center font-bold text-blue-400">${inv.items.length}</td>
                                                 <td class="px-4 py-3 text-right font-black text-slate-900 dark:text-white">₱${inv.totalBill.toLocaleString()}</td>
                                              </tr>
                                           `;
                     }).join('')}
                                     </tbody>
                                  </table>
                               </div>
                            </div>
                            <p class="text-[9px] text-slate-400 italic text-center">Please verify the summary above before confirming the import.</p>
                         </div>
                      `;

                     const confirmed = await window.showConfirmModal('Accountant Import Preview', previewHtml);

                     if (!confirmed) { importAccFile.value = ''; return; }

                     // Batch Processing (Max 500 per batch)
                     const batchId = `BATCH_ACC_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                     const allOperations = [];
                     invoiceIds.forEach(id => {
                        const inv = invoiceMap[id];
                        const masterId = `ACC_${inv.transId}_${inv.date.replace(/-/g, '')}`;

                        // Master Record
                        allOperations.push({
                           collection: 'expenses',
                           id: masterId,
                           data: {
                              branchId: currentBranch,
                              date: inv.date,
                              category: 'Pantry',
                              amount: inv.totalBill,
                              purpose: inv.purpose,
                              description: inv.transId,
                              fundedBy: 'accountant',
                              status: 'liquidated',
                              importBatchId: batchId,
                              createdAt: serverTimestamp()
                           }
                        });

                        // Detail Records
                        inv.items.forEach(item => {
                           allOperations.push({
                              collection: 'Pantry_Expense_Items_Detail',
                              data: {
                                 transactionId: inv.transId,
                                 branchId: currentBranch,
                                 itemName: item.itemName,
                                 unit: item.unit,
                                 quantity: item.quantity,
                                 unitPrice: item.unitPrice,
                                 lineTotal: item.lineTotal,
                                 date: inv.date,
                                 importBatchId: batchId,
                                 createdAt: serverTimestamp()
                              }
                           });
                        });
                     });

                     window.showToast(`Importing ${allOperations.length} records...`, 'info');

                     // Execute in Chunks of 500
                     for (let i = 0; i < allOperations.length; i += 500) {
                        const chunk = allOperations.slice(i, i + 500);

                        const batch = writeBatch(db);

                        chunk.forEach(op => {
                           if (op.id) {
                              batch.set(doc(db, op.collection, op.id), op.data, { merge: true });
                           } else {
                              batch.set(doc(collection(db, op.collection)), op.data);
                           }
                        });

                        await batch.commit();

                        // Create log entry for Undo
                        await setDoc(doc(db, "import_logs", batchId), {
                           batchId,
                           timestamp: serverTimestamp(),
                           type: 'ledger_import',
                           branchId: currentBranch,
                           rowCount: invoiceIds.length,
                           collections: ["expenses"],
                           status: "active"
                        });
                     }

                     window.showToast(`Imported ${invoiceIds.length} invoices successfully!`, 'success');
                     importAccFile.value = '';
                     loadLedgerData();

                  } catch (err) {
                     console.error(err);
                     window.showToast('Import failed. Check console for details.', 'error');
                  }
               };
               reader.readAsArrayBuffer(file);
            } catch (err) { console.error(err); }
         };
      }

      const importBtn = container.querySelector('#import-excel-btn');
      const importFile = container.querySelector('#import-excel-file');
      if (importBtn) importBtn.onclick = () => {
         const activeBranch = currentBranch;
         if (activeBranch === 'All Branches') { alert('Select a specific branch first.'); return; }
         importFile.click();
      };

      if (importFile) {
         importFile.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            window.showToast('Loading parser...', 'info');

            try {
               const XLSX = await import('xlsx');
               const reader = new FileReader();
               reader.onload = async (ev) => {
                  try {
                     const data = new Uint8Array(ev.target.result);
                     const workbook = XLSX.read(data, { type: 'array' });
                     const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                     const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                     const rawData = rows.slice(2).filter(r => r.length > 0 && (r[8] !== undefined || r[2] !== undefined));

                     if (rawData.length === 0) {
                        window.showToast('No valid data found in Excel', 'error');
                        return;
                     }

                     const jsonData = rawData.map(r => {
                        return {
                           'Date': standardizeDate(r[0]) || getLocalDateString(new Date()),
                           'Category': r[1] || 'Other',
                           'Purpose': r[2] || 'Imported',
                           'Detail Description': r[3] || '',
                           'Amount': cleanNumber(r[8]),
                           'Funded by': r[9] || 'Petty cash'
                        };
                     });

                     const confirmed = await showExcelPreviewModal(jsonData);
                     if (!confirmed) { importFile.value = ''; return; }

                     const batchId = `BATCH_LEDGER_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                     const batch = writeBatch(db);
                     const activeBranch = currentBranch;
                     window.showToast(`Importing ${jsonData.length} records...`, 'info');

                     jsonData.forEach(row => {
                        const fundRaw = (row['Funded by'] || '').toString().toLowerCase();
                        const expData = {
                           branchId: activeBranch,
                           date: row.Date,
                           category: row.Category,
                           amount: parseFloat(row.Amount || 0),
                           purpose: row.Purpose,
                           description: row['Detail Description'] || '',
                           invoiceNo: row['Invoice No.'] || row['Invoice No'] || '',
                           fundedBy: fundRaw.includes('petty') ? 'petty_cash' : 'accountant',
                           status: 'liquidated',
                           importBatchId: batchId,
                           createdAt: serverTimestamp()
                        };
                        const newDoc = doc(collection(db, 'expenses'));
                        batch.set(newDoc, expData);
                     });

                     await batch.commit();

                     // Log for Undo
                     await setDoc(doc(db, "import_logs", batchId), {
                        batchId,
                        timestamp: serverTimestamp(),
                        type: 'ledger_import',
                        branchId: activeBranch,
                        rowCount: jsonData.length,
                        collections: ["expenses"],
                        status: "active"
                     });

                     window.showToast(`Successfully imported ${jsonData.length} records!`, 'success');
                     importFile.value = '';
                     loadLedgerData();
                  } catch (err) {
                     console.error('Import Error:', err);
                     window.showToast('Error parsing Excel', 'error');
                  }
               };
               reader.readAsArrayBuffer(file);
            } catch (err) {
               console.error('Lazy Load Error:', err);
               window.showToast('Failed to load Excel parser', 'error');
            }
         };
      }

      const exportBtn = container.querySelector('#export-ledger-btn');
      if (exportBtn) {
         exportBtn.onclick = async () => {
            window.showToast('Preparing Export...', 'info');
            const activeBranch = currentBranch;
            try {
               let constraints = [orderBy('date', 'desc')];
               if (activeBranch && activeBranch !== 'All Branches') constraints.unshift(where('branchId', '==', activeBranch));

               const snap = await getDocs(query(collection(db, 'expenses'), ...constraints));

               // Lazy Load XLSX
               const XLSX = await import('xlsx');

               const data = snap.docs.map(d => {
                  const r = d.data();
                  return {
                     'Date': r.date,
                     'Category': r.category,
                     'Purpose': r.purpose,
                     'Invoice No.': r.invoiceNo || '',
                     'Detail Description': r.description || '',
                     'Amount': r.amount,
                     'Funded By': r.fundedBy === 'petty_cash' ? 'Petty Cash' : 'Accountant',
                     'Branch': r.branchId,
                     'Status': r.status
                  };
               });

               const ws = XLSX.utils.json_to_sheet(data);
               const wb = XLSX.utils.book_new();
               XLSX.utils.book_append_sheet(wb, ws, "Ledger");
               XLSX.writeFile(wb, `Ledger_${activeBranch}_${getLocalDateString(new Date())}.xlsx`);
               window.showToast('Export successful!', 'success');
            } catch (err) {
               console.error(err);
               window.showToast('Export failed', 'error');
            }
         };
      }
   }

   function renderAuditTab() {
      return `
      <div class="animate-fade-in h-full flex flex-col gap-6">
         <div class="flex flex-col xl:flex-row bg-white/40 dark:bg-[#141414]/60 backdrop-blur-xl rounded-3xl border-t border-white/20 shadow-2xl overflow-hidden h-[600px]">
             <!-- Left Side: Sidebar Area (1/4) -->
             <div id="audit-sidebar" class="w-full xl:w-1/4 flex flex-col border-r border-slate-100 dark:border-white/5 h-full min-h-0 relative overflow-hidden">
                 
                 <!-- Layer 1: Queue List -->
                 <div id="sidebar-queue-layer" class="absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out z-10">
                    <div class="p-6 flex items-center justify-between dark:bg-transparent flex-shrink-0">
                       <div class="flex items-center gap-3">
                          <div class="w-8 h-8 flex items-center justify-center text-amber-700 bg-amber-50 dark:bg-amber-500/10 rounded-full">
                             <i data-lucide="shield-check" class="w-4 h-4"></i>
                          </div>
                          <div>
                             <h4 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tighter leading-none">QUEUE</h4>
                             <p class="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">Pending verification</p>
                          </div>
                       </div>
                    </div>
                    <div id="audit-queue-container" class="flex-1 overflow-y-auto scrollbar-hide">
                       <div class="flex items-center justify-center py-20"><div class="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin"></div></div>
                    </div>
                 </div>

                 <!-- Layer 2: Receipt Viewer -->
                 <div id="sidebar-viewer-layer" class="absolute inset-0 flex flex-col translate-x-full transition-transform duration-300 ease-in-out z-20 bg-slate-50/50 dark:bg-black/20 backdrop-blur-md">
                    <div class="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-white/50 dark:bg-transparent">
                       <div class="flex items-center gap-2">
                          <button id="close-sidebar-viewer" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 transition-all">
                             <i data-lucide="arrow-left" class="w-4 h-4"></i>
                          </button>
                          <span class="text-[9px] font-black text-slate-800 dark:text-white uppercase tracking-widest">Receipt View</span>
                       </div>
                       <div class="flex items-center gap-1">
                          <button id="sidebar-full-view" class="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-purple-600 transition-all" title="Open Full Screen">
                             <i data-lucide="maximize-2" class="w-3.5 h-3.5"></i>
                          </button>
                          <button id="sidebar-zoom-reset" class="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-slate-400 transition-all" title="Reset Zoom">
                             <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                          </button>
                       </div>
                    </div>

                    <div id="sidebar-display-area" class="flex-1 relative overflow-hidden flex items-center justify-center p-4 cursor-grab active:cursor-grabbing select-none">
                       <div id="sidebar-img-container" class="w-full h-full flex items-center justify-center transition-transform duration-200 origin-center will-change-transform">
                          <img id="sidebar-active-img" src="" class="max-w-full max-h-full object-contain rounded-xl shadow-2xl pointer-events-none">
                       </div>
                    </div>

                    <div class="p-4 bg-white/50 dark:bg-transparent border-t border-slate-100 dark:border-white/5">
                       <p class="text-[8px] text-center font-black text-slate-400 uppercase tracking-widest">Click image to zoom • Drag to move</p>
                    </div>
                 </div>

             </div>

             <!-- Right Side: Detail Pane (3/4) -->
             <div id="audit-detail-pane" class="hidden xl:flex w-full xl:w-3/4 flex-col h-full min-h-0 bg-white/10 dark:bg-transparent overflow-y-auto scrollbar-hide">
                <div class="flex-1 flex flex-col items-center justify-center text-slate-400 opacity-60">
                   <i data-lucide="mouse-pointer-click" class="w-12 h-12 mb-4"></i>
                   <h3 class="text-xl font-black uppercase tracking-widest">Review Pane</h3>
                   <p class="text-xs font-bold uppercase tracking-tighter">Select a request to start auditing</p>
                </div>
             </div>
          </div>
       </div>

         <!-- History in Audit Tab -->
         <div class="pt-10 border-t border-slate-200/30 dark:border-white/10 mt-8">
            <div class="flex items-center justify-between mb-8">
               <div class="flex items-center gap-4">
                  <div class="w-12 h-12 flex items-center justify-center bg-[#96588a]/10 dark:bg-[#96588a]/20 text-[#96588a] rounded-2xl shadow-sm">
                     <i data-lucide="history" class="w-6 h-6"></i>
                  </div>
                  <div>
                     <h4 class="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Recent History</h4>
                     <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Showing last recorded requests</p>
                  </div>
               </div>
               <button id="open-audit-logs-btn" class="flex items-center gap-2.5 px-5 py-2.5 bg-white dark:bg-white/5 hover:bg-[#96588a] hover:text-white text-slate-600 dark:text-white/60 rounded-2xl transition-all group shadow-sm border border-slate-100 dark:border-white/5">
                  <i data-lucide="scroll-text" class="w-4 h-4 group-hover:scale-110 transition-transform"></i>
                  <span class="text-[10px] font-black uppercase tracking-[0.1em]">View Audit Logs</span>
               </button>
            </div>
            
            <div class="bg-white/40 dark:bg-[#141414]/60 backdrop-blur-3xl rounded-3xl border border-white/60 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[600px]">
               <div class="sticky top-0 z-20 grid grid-cols-12 gap-2 px-8 py-6 border-b border-slate-100 dark:border-white/5 bg-white/80 dark:bg-[#1a1a1a]/90 backdrop-blur-md">
                  <span class="col-span-3 text-[10px] text-left font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em]">Request ID</span>
                  <span class="col-span-3 text-[10px] text-left font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em]">Period</span>
                  <span class="col-span-2 text-[10px] text-left font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em]">Branch</span>
                  <span class="col-span-2 text-[10px] text-right font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em]">Amount</span>
                  <span class="col-span-2 text-[10px] text-right font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em]">Status</span>
               </div>
               <div id="history-list-container" class="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5 scrollbar-hide"></div>
            </div>
         </div>
      </div>
      `;
   }

   async function loadAuditData() {
      const auditContent = container.querySelector('#audit-queue-container');
      try {
         let constraints = [where('status', '==', 'pending'), orderBy('createdAt', 'desc')];
         const activeBranch = currentBranch;
         if (activeBranch && activeBranch !== 'All Branches') constraints.unshift(where('branchId', '==', activeBranch));

         const q = query(collection(db, 'liquidation_requests'), ...constraints);
         const snap = await getDocs(q);
         const pendingDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

         if (pendingDocs.length === 0) {
            auditContent.innerHTML = `<div class="text-center py-20 text-slate-400 font-black uppercase tracking-widest text-[10px]">Queue is empty</div>`;
            return;
         }


         auditContent.innerHTML = pendingDocs.map(data => {
            const createdAtMs = data.createdAt?.seconds ? data.createdAt.seconds * 1000 : 0;
            const isNew = createdAtMs && (Date.now() - createdAtMs) < (15 * 60 * 1000);
            return `
            <div class="audit-item group border-b border-slate-100 dark:border-white/5 hover:bg-amber-50/50 dark:hover:bg-amber-500/[0.02] transition-all cursor-pointer px-6 py-4" data-id="${data.id}">
               <div class="flex flex-col gap-1">
                  <div class="flex items-center justify-between">
                     <h4 class="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight">REQ-${data.id.substring(0, 8).toUpperCase()}</h4>
                     ${isNew ? '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>' : ''}
                  </div>
                  <div class="flex items-center justify-between">
                     <p class="text-[10px] font-bold text-slate-500 dark:text-white/40 uppercase truncate">${data.branchId}</p>
                     <p class="text-[11px] font-black text-[#96588a] dark:text-white">₱${data.totalAmount.toLocaleString('en-PH')}</p>
                  </div>
                  <p class="text-[8px] text-slate-400 uppercase tracking-widest font-bold opacity-60">${data.createdBy?.split('@')[0] || 'admin'}</p>
               </div>
            </div>
            `;
         }).join('');

         auditContent.querySelectorAll('.audit-item').forEach(btn => {
            btn.onclick = async () => {
               // Highlight active
               auditContent.querySelectorAll('.audit-item').forEach(i => i.classList.remove('bg-amber-50', 'dark:bg-amber-500/10', 'border-l-4', 'border-amber-500'));
               btn.classList.add('bg-amber-50', 'dark:bg-amber-500/10', 'border-l-4', 'border-amber-500');

               const req = pendingDocs.find(d => d.id === btn.dataset.id);
               const detailPane = container.querySelector('#audit-detail-pane');
               if (detailPane) {
                  detailPane.classList.remove('hidden');
                  detailPane.innerHTML = `<div class="flex items-center justify-center h-full"><div class="w-8 h-8 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div></div>`;
                  await renderLiquidationDetailContent(detailPane, req, () => loadAuditData(), true);
               }
            };
         });
         // Sidebar Viewer Setup
         const sidebar = container.querySelector('#audit-sidebar');
         if (sidebar) {
            const queueLayer = sidebar.querySelector('#sidebar-queue-layer');
            const viewerLayer = sidebar.querySelector('#sidebar-viewer-layer');
            const closeBtn = sidebar.querySelector('#close-sidebar-viewer');
            const activeImg = sidebar.querySelector('#sidebar-active-img');
            const imgContainer = sidebar.querySelector('#sidebar-img-container');
            const displayArea = sidebar.querySelector('#sidebar-display-area');
            const zoomReset = sidebar.querySelector('#sidebar-zoom-reset');
            const fullViewBtn = sidebar.querySelector('#sidebar-full-view');

            let scale = 1, isDragging = false, startX, startY, tx = 0, ty = 0;
            let dragStarted = false;

            const updateXform = () => imgContainer.style.transform = `scale(${scale}) translate(${tx}px, ${ty}px)`;
            const resetView = () => { scale = 1; tx = 0; ty = 0; updateXform(); };

            window.showAuditReceiptInSidebar = (url) => {
               activeImg.src = url;
               queueLayer.style.transform = 'translateX(-100%)';
               viewerLayer.style.transform = 'translateX(0)';
               resetView();
            };

            const closeViewer = () => {
               queueLayer.style.transform = 'translateX(0)';
               viewerLayer.style.transform = 'translateX(100%)';
            };

            closeBtn.onclick = closeViewer;

            // Full View Logic
            if (fullViewBtn) {
               fullViewBtn.onclick = (e) => {
                  e.stopPropagation();
                  const url = activeImg.src;
                  if (!url) return;
                  const lb = document.createElement('div');
                  lb.className = 'fixed inset-0 bg-slate-900/90 z-[10005] flex items-center justify-center p-6 cursor-zoom-out animate-fade-in';
                  lb.innerHTML = `<img src="${url}" class="max-w-full max-h-full object-contain rounded-3xl shadow-2xl animate-scale-up">`;
                  lb.onclick = () => lb.remove();
                  document.body.appendChild(lb);
               };
            }

            // Pan & Zoom with Drag Detection
            displayArea.onmousedown = (e) => {
               dragStarted = false;
               if (scale > 1) {
                  isDragging = true;
                  startX = e.clientX - tx;
                  startY = e.clientY - ty;
               }
            };

            const moveH = (e) => {
               if (isDragging) {
                  const dx = Math.abs(e.clientX - (startX + tx));
                  const dy = Math.abs(e.clientY - (startY + ty));
                  if (dx > 5 || dy > 5) dragStarted = true;
                  tx = e.clientX - startX;
                  ty = e.clientY - startY;
                  updateXform();
               }
            };

            const stopH = () => { isDragging = false; };

            displayArea.onclick = () => {
               if (dragStarted) return; // Don't zoom if we were dragging
               scale = (scale === 1) ? 2.5 : 1;
               if (scale === 1) resetView();
               updateXform();
            };

            window.addEventListener('mousemove', moveH);
            window.addEventListener('mouseup', stopH);

            if (zoomReset) zoomReset.onclick = (e) => { e.stopPropagation(); resetView(); };
         }

         if (window.lucide) window.lucide.createIcons();
      } catch (err) { console.error(err); }
   }


   async function exportApprovedRequestTemplate(reqData, approvedRows) {
      const res = await fetch(APPROVAL_TEMPLATE_URL);
      if (!res.ok) throw new Error('Template file not found');
      const fileData = await res.arrayBuffer();

      window.showToast('Loading Excel engine...', 'info');
      const ExcelJSModule = await import('exceljs');
      const ExcelJS = ExcelJSModule.default || ExcelJSModule;

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileData);
      const ws = workbook.worksheets[0];
      if (!ws) throw new Error('Template worksheet missing');
      const startRow = 9;
      const today = new Date().toLocaleDateString('en-GB');

      ws.getCell('C2').value = `SO MOT ${reqData.branchId || ''}`.trim();
      ws.getCell('D3').value = today;
      ws.getCell('B5').value = formatDateDDMMYYYY(reqData.startDate);
      ws.getCell('D5').value = formatDateDDMMYYYY(reqData.endDate);

      approvedRows.forEach((row, idx) => {
         const r = startRow + idx;
         ws.getCell(`A${r}`).value = formatDateDDMMYYYY(row.date);
         ws.getCell(`B${r}`).value = row.category || '';
         ws.getCell(`C${r}`).value = row.description || row.purpose || '';
         ws.getCell(`D${r}`).value = row.invoiceNo || '';
         ws.getCell(`E${r}`).value = Number(row.amount || 0);
      });

      let totalRow = startRow + approvedRows.length;
      for (let r = totalRow; r <= totalRow + 120; r++) {
         const label = ws.getCell(`D${r}`).value || ws.getCell(`C${r}`).value || '';
         if (String(label).toUpperCase().includes('TOTAL EXPENSES PER VOUCHER')) {
            totalRow = r;
            break;
         }
      }

      ws.getCell(`D${totalRow}`).value = 'TOTAL EXPENSES PER VOUCHER AND RECEIPT ATTACHED ►';
      ws.getCell(`E${totalRow}`).value = approvedRows.reduce((sum, x) => sum + Number(x.amount || 0), 0);

      const filename = `Liquidation_${(reqData.branchId || 'Branch').replace(/\s+/g, '_')}_${reqData.id.substring(0, 8).toUpperCase()}_${getLocalDateString(new Date())}.xlsx`;
      const outBuffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
   }

   async function loadAuditLogData(filters = {}, targetContainer = null) {
      const logBody = targetContainer ? targetContainer.querySelector('#audit-log-body') : container.querySelector('#audit-log-body');
      if (!logBody) return;

      try {
         let constraints = [orderBy('timestamp', 'desc'), limit(50)];
         const activeBranch = currentBranch;
         if (activeBranch && activeBranch !== 'All Branches') {
            constraints.unshift(where('branchId', '==', activeBranch));
         }

         const q = query(collection(db, 'audit_logs'), ...constraints);
         const snap = await getDocs(q);
         let logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

         // Client-side filters
         if (filters.requestId) {
            const search = filters.requestId.toLowerCase();
            logs = logs.filter(l => l.requestId?.toLowerCase().includes(search));
         }
         if (filters.date) {
            logs = logs.filter(l => {
               if (!l.timestamp) return false;
               const ld = new Date(l.timestamp.seconds * 1000);
               const logDate = `${ld.getFullYear()}-${String(ld.getMonth() + 1).padStart(2, '0')}-${String(ld.getDate()).padStart(2, '0')}`;
               return logDate === filters.date;
            });
         }

         if (logs.length === 0) {
            logBody.innerHTML = '<div class="flex items-center justify-center py-20 text-slate-400 italic text-[10px] uppercase font-black tracking-widest">No audit logs found</div>';
            return;
         }

         const actionBadge = (action) => {
            const map = {
               'submit_request': 'bg-blue-100 text-blue-700',
               'approve_request': 'bg-emerald-100 text-emerald-700',
               'reject_request': 'bg-rose-100 text-rose-700',
               'partial_reject_request': 'bg-amber-100 text-amber-700',
               'resubmit_request': 'bg-purple-100 text-purple-700'
            };
            const label = (action || '').replace(/_/g, ' ');
            return `<span class="px-2 py-1 rounded-lg text-[8px] font-black uppercase ${map[action] || 'bg-slate-100 text-slate-600'}">${label}</span>`;
         };

         logBody.innerHTML = logs.map(log => {
            const ts = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '---';
            return `
               <div class="grid grid-cols-12 gap-2 px-6 py-3 items-center hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-all">
                  <div class="col-span-2 text-[10px] font-bold text-slate-500 whitespace-nowrap">${ts}</div>
                  <div class="col-span-2">${actionBadge(log.action)}</div>
                  <div class="col-span-2 text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate pr-2">${log.actor || '---'}</div>
                  <div class="col-span-2"><span class="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md uppercase">${log.requestId ? log.requestId.substring(0, 8).toUpperCase() : '---'}</span></div>
                  <div class="col-span-4 text-[10px] font-medium text-slate-500 dark:text-slate-400 line-clamp-1 italic">${log.comment || '---'}</div>
               </div>
            `;
         }).join('');
      } catch (err) { console.error('Audit log error:', err); }
   }

   function attachAuditLogListeners() {
      const openLogsBtn = container.querySelector('#open-audit-logs-btn');
      if (openLogsBtn) openLogsBtn.onclick = () => showAuditLogsModal();

      const filterBtn = container.querySelector('#audit-filter-btn');
      const clearBtn = container.querySelector('#audit-clear-btn');

      if (filterBtn) {
         filterBtn.onclick = () => {
            const reqId = container.querySelector('#audit-filter-reqid')?.value?.trim();
            const date = container.querySelector('#audit-filter-date')?.value;
            loadAuditLogData({ requestId: reqId || null, date: date || null });
         };
      }

      if (clearBtn) {
         clearBtn.onclick = () => {
            const reqIdInput = container.querySelector('#audit-filter-reqid');
            const dateInput = container.querySelector('#audit-filter-date');
            if (reqIdInput) reqIdInput.value = '';
            if (dateInput) dateInput.value = '';
            loadAuditLogData();
         };
      }
   }



   // Global Switcher
   container.addEventListener('click', (e) => {
      // Future global listeners can go here
   });

   // Global Refresh Handler
   setTimeout(() => {
      const refreshBtn = document.getElementById('db-refresh');
      if (refreshBtn) {
         refreshBtn.onclick = async () => {
            loadTabContent(currentTab);
         };
      }
   }, 100);

   await loadMasterData();

   // Global functions for separate scopes
   async function loadCashierData() {
      const contentArea = container.querySelector('#expense-content');
      const listContainer = contentArea?.querySelector('#cashier-items-list');
      const batchTotalEl = contentArea?.querySelector('#batch-total');
      if (!listContainer) return;
      const activeBranch = currentBranch;

      try {
         const q = query(collection(db, 'expenses'),
            where('branchId', '==', activeBranch),
            where('status', 'in', ['pending', 'requested']),
            orderBy('createdAt', 'desc')
         );
         const snap = await getDocs(q);
         const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

         if (items.length === 0) {
            listContainer.innerHTML = `<div class="text-center py-12 text-slate-300 dark:text-white text-[10px] font-black uppercase">Empty Batch</div>`;
            if (batchTotalEl) batchTotalEl.innerText = '₱0.00';
         } else {
            const pendingTotal = items.filter(i => i.status === 'pending').reduce((acc, i) => acc + (i.amount || 0), 0);
            if (batchTotalEl) batchTotalEl.innerText = '₱' + pendingTotal.toLocaleString();

            listContainer.innerHTML = items.map(item => `
            <div class="batch-item-wrapper group bg-white/30 dark:bg-white/[0.02] rounded-2xl border border-white/50 dark:border-white/5 transition-all hover:bg-white/50 dark:hover:bg-white/[0.05] hover:border-[#96588a]/30 mb-1" data-id="${item.id}">
               <div class="flex items-center justify-between px-4 py-3.5 transition-all">
                  <div class="flex items-center gap-3">
                     <div class="w-8 h-8 rounded-lg bg-[#96588a]/10 flex items-center justify-center text-[#96588a]">
                        <i data-lucide="receipt" class="w-4 h-4"></i>
                     </div>
                     <div>
                        <p class="text-[10px] font-black text-slate-800 dark:text-white uppercase truncate max-w-[120px]">${item.purpose}</p>
                        <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">${item.status === 'requested' ? 'Awaiting Audit' : item.date}</p>
                     </div>
                  </div>
                  
                  <div class="flex items-center gap-4">
                     <!-- Hover Actions (Edit/Delete) -->
                     <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        ${item.status !== 'requested' ? `
                           <button class="edit-item-btn p-2 hover:bg-[#96588a]/10 text-[#96588a] rounded-lg transition-colors" title="Edit Transaction">
                              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                           </button>
                           <button class="delete-item-btn p-2 hover:bg-rose-500/10 text-rose-500 rounded-lg transition-colors" title="Remove Item">
                              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                           </button>
                        ` : ''}
                     </div>

                     <div class="text-right dark:text-white">
                        <p class="text-xs font-black">₱${(item.amount || 0).toLocaleString()}</p>
                        ${item.auditorNote ? `<p class="text-[7px] font-black text-rose-500 uppercase tracking-tighter">Needs Correction</p>` : ''}
                     </div>
                  </div>
               </div>
            </div>
         `).join('');

            // Attach Listeners
            if (window.lucide) window.lucide.createIcons();

            listContainer.querySelectorAll('.batch-item-wrapper').forEach(wrapper => {
               const itemId = wrapper.dataset.id;
               const item = items.find(i => i.id === itemId);

               // Edit Item
               const editBtn = wrapper.querySelector('.edit-item-btn');
               if (editBtn) {
                  editBtn.onclick = (e) => {
                     e.stopPropagation();
                     currentEditingId = itemId;

                     // Populate Modal Inputs
                     const modal = document.querySelector('#expense-modal');
                     if (!modal) {
                        console.error('Expense modal not found in body');
                        return;
                     }

                     modal.querySelector('#exp-amount').value = item.amount || '';
                     modal.querySelector('#exp-category').value = item.category || '';
                     modal.querySelector('#exp-date').value = item.date || '';
                     modal.querySelector('#exp-invoice').value = item.invoiceNo || '';
                     modal.querySelector('#exp-desc').value = item.description || '';

                     // Trigger category change logic to load subcategories
                     const catSelect = modal.querySelector('#exp-category');
                     if (catSelect) catSelect.dispatchEvent(new Event('change'));

                     // Set subcategory and purpose after a brief delay
                     setTimeout(() => {
                        const subSelect = modal.querySelector('#exp-subcategory');
                        if (subSelect) subSelect.value = item.subCategory || '';
                        const purSelect = modal.querySelector('#exp-purpose');
                        if (purSelect) purSelect.value = item.purpose || '';
                     }, 50);

                     // Update Modal UI
                     const modalTitle = modal.querySelector('h4');
                     const submitBtn = modal.querySelector('#save-exp-btn');
                     if (modalTitle) modalTitle.textContent = 'Edit Transaction';
                     if (submitBtn) submitBtn.textContent = 'Update Transaction';
                     modal.classList.remove('hidden');
                  };
               }

               // Delete Item
               const delBtn = wrapper.querySelector('.delete-item-btn');
               if (delBtn) {
                  delBtn.onclick = async (e) => {
                     e.stopPropagation();
                     const confirmed = await window.showConfirmModal('Delete Item', 'Are you sure you want to remove this item from your current batch?');
                     if (confirmed) {
                        await deleteDoc(doc(db, 'expenses', itemId));
                        window.showToast('Item deleted', 'info');
                        loadCashierData();
                     }
                  };
               }
            });
         }
      } catch (err) { console.error(err); }

      // Load summary card counts
      try {
         const liqSnap = await getDocs(query(collection(db, 'liquidation_requests'), where('branchId', '==', currentBranch)));
         const liqDocs = liqSnap.docs.map(d => d.data());
         const pending = liqDocs.filter(d => d.status === 'pending').length;
         const approved = liqDocs.filter(d => d.status === 'approved').length;
         const rejected = liqDocs.filter(d => d.status === 'rejected' || d.status === 'partially_rejected').length;

         const countPending = document.getElementById('count-pending');
         const countApproved = document.getElementById('count-approved');
         const countRejected = document.getElementById('count-rejected');
         if (countPending) countPending.textContent = pending;
         if (countApproved) countApproved.textContent = approved;
         if (countRejected) countRejected.textContent = rejected;
      } catch (err) { console.error('Summary cards error:', err); }
   }

   // Load history data Bảng Lịch Sử   
   async function loadHistoryData() {
      const historyContent = document.getElementById('history-list-container');
      const activeBranch = currentBranch;
      if (!historyContent) return;

      try {
         let constraints = [where('status', 'in', ['pending', 'approved', 'rejected', 'partially_rejected', 'cancelled']), orderBy('createdAt', 'desc'), limit(historyLimit)];
         if (activeBranch && activeBranch !== 'All Branches') constraints.unshift(where('branchId', '==', activeBranch));

         const q = query(collection(db, 'liquidation_requests'), ...constraints);
         const snap = await getDocs(q);
         const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

         if (docs.length === 0) {
            historyContent.innerHTML = `<div class="px-4 py-10 text-center text-slate-300 text-[10px] font-black uppercase">No records found</div>`;
            return;
         }

         let rowsHtml = docs.map(data => {
            const isApp = data.status === 'approved';
            const isPartial = data.status === 'partially_rejected';
            const isPending = data.status === 'pending';
            const isCancelled = data.status === 'cancelled';
            const isRejected = data.status === 'rejected';

            const badgeCls = isApp ? 'bg-emerald-100 text-emerald-700' :
               isPending ? 'bg-blue-100 text-blue-700' :
                  isPartial ? 'bg-amber-100 text-amber-700' :
                     isCancelled ? 'bg-slate-100 text-slate-500' :
                        'bg-rose-100 text-rose-700';
            const statusLabel = isPartial ? 'Partial' : isPending ? 'Pending' :
               data.status.charAt(0).toUpperCase() + data.status.slice(1);
            const dateStr = data.createdAt
               ? new Date(data.createdAt.seconds * 1000).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')
               : '---';
            const period = `${data.startDate ? data.startDate.split('-').reverse().join('/') : '---'} – ${data.endDate ? data.endDate.split('-').reverse().join('/') : '---'}`;
            const isClickable = isRejected || isPartial || isPending || isApp;

            return `
            <div class="history-row ${isClickable ? 'history-detail-btn cursor-pointer hover:bg-slate-50/50 dark:hover:bg-white/[0.02]' : 'cursor-default'} group border-b border-slate-100 dark:border-white/5 transition-all" data-id="${data.id}">
               <div class="grid grid-cols-12 gap-2 items-center px-8 py-5">
                  <div class="col-span-3">
                     <p class="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight">REQ-${data.id.substring(0, 8).toUpperCase()}</p>
                     <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1 opacity-60">${dateStr}</p>
                  </div>
                  <div class="col-span-3">
                     <p class="text-[10px] font-bold text-slate-800 dark:text-white/80 uppercase tracking-tight">${period}</p>
                     <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1 opacity-60">${data.itemCount || 0} ITEMS</p>
                  </div>
                  <div class="col-span-2">
                     <span class="inline-flex px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-[10px] font-black uppercase text-slate-600 dark:text-white/60">
                        ${data.branchId || '---'}
                     </span>
                  </div>
                  <div class="col-span-2 text-right">
                     <p class="text-[11px] font-black text-slate-900 dark:text-white">₱${(data.totalAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div class="col-span-2 text-right">
                     <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${badgeCls}">${statusLabel}</span>
                  </div>
               </div>
            </div>
         `}).join('');

         // Load More Button
         if (docs.length >= historyLimit) {
            rowsHtml += `
               <div class="p-6 text-center">
                  <button id="load-more-history-btn" class="px-6 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-[#96588a] hover:text-white text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm">
                     Load More Records
                  </button>
               </div>
            `;
         }

         historyContent.innerHTML = rowsHtml;

         const loadMoreBtn = historyContent.querySelector('#load-more-history-btn');
         if (loadMoreBtn) {
            loadMoreBtn.onclick = () => {
               historyLimit += 10;
               loadHistoryData();
            };
         }

         historyContent.querySelectorAll('.history-detail-btn').forEach(btn => {
            btn.onclick = () => {
               const reqData = docs.find(d => d.id === btn.dataset.id);
               if (reqData) {
                  showLiquidationDetailModal(reqData, () => loadTabContent(currentTab));
               }
            };
         });
      } catch (err) { console.error(err); }
   }



   async function showEditLedgerModal(item) {
      const editModal = document.createElement('div');
      editModal.id = 'edit-expense-modal';
      editModal.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fade-in bg-slate-900/20';

      editModal.innerHTML = `
         <div class="bg-white/50 dark:bg-[#343434]/60 p-8 rounded-[2.5rem] max-w-md w-full space-y-6 animate-scale-up shadow-2xl backdrop-blur-xl">
            <div class="flex items-center justify-between">
               <h3 class="text-xl font-black dark:text-white uppercase tracking-tighter">Edit Transaction</h3>
               <button id="close-edit-modal" class="text-slate-400 hover:text-slate-600 transition-colors"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            
            <div class="space-y-4">
               <div class="space-y-1">
                  <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Date</label>
                  <input type="date" id="edit-date" class="w-full bg-slate-50 dark:bg-[#343434] border-none rounded-xl px-4 py-3 text-slate-400 dark:text-white text-xs font-bold" value="${item.date}">
               </div>
               <div class="space-y-1">
                  <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Purpose</label>
                  <input type="text" id="edit-purpose" class="w-full bg-slate-50 dark:bg-[#343434] border-none rounded-xl px-4 py-3 text-slate-400 dark:text-white text-xs font-bold" value="${item.purpose || ''}">
               </div>
               <div class="space-y-1">
                  <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount</label>
                  <input type="number" id="edit-amount" class="w-full bg-slate-50 dark:bg-[#343434] border-none rounded-xl px-4 py-3 text-slate-400 dark:text-white text-xs font-bold" value="${item.amount}">
               </div>
               <div class="space-y-1">
                  <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                  <select id="edit-category" class="w-full bg-slate-50 dark:bg-[#343434] border-none rounded-xl px-4 py-3 text-slate-400 dark:text-white text-xs font-bold">
                     ${categories.map(c => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`).join('')}
                  </select>
               </div>
            </div>

            <button id="save-edit-btn" class="w-full py-4 bg-[#96588a] text-white rounded-xl font-black uppercase tracking-[0.2em] text-[10px] transition-all shadow-lg hover:shadow-[#96588a]/30">
               Save Changes
            </button>
         </div>
      `;
      document.body.appendChild(editModal);
      if (window.lucide) window.lucide.createIcons();

      const closeEditModal = () => {
         const inner = editModal.querySelector('.bg-white\\/95') || editModal.firstElementChild;
         editModal.classList.add('animate-fade-out');
         if (inner) inner.classList.add('animate-scale-down');
         setTimeout(() => editModal.remove(), 200);
      };

      editModal.querySelector('#close-edit-modal').onclick = () => closeEditModal();

      editModal.querySelector('#save-edit-btn').onclick = async () => {
         const btn = editModal.querySelector('#save-edit-btn');
         const date = editModal.querySelector('#edit-date').value;
         const purpose = editModal.querySelector('#edit-purpose').value;
         const amount = parseFloat(editModal.querySelector('#edit-amount').value);
         const category = editModal.querySelector('#edit-category').value;

         if (!date || isNaN(amount)) { window.showToast('Please fill required fields', 'error'); return; }

         btn.disabled = true;
         btn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>`;

         try {
            await updateDoc(doc(db, 'expenses', item.id), {
               date, purpose, amount: amount, category
            });
            window.showToast('Transaction updated', 'success');
            closeEditModal();
            loadLedgerData();
         } catch (err) {
            console.error(err);
            window.showToast('Update failed', 'error');
            btn.disabled = false;
            btn.textContent = 'Save Changes';
         }
      };

   }

   function showAuditLogsModal() {
      const ov = document.createElement('div');
      ov.className = "fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-fade-in";
      ov.innerHTML = `
      <div class="bg-white/90 dark:bg-[#141414]/90 backdrop-blur-3xl w-full max-w-6xl h-[90vh] rounded-[2.5rem] border-t border-white/60 dark:border-white/10 shadow-2xl flex flex-col overflow-hidden animate-slide-up">
         <div class="p-8 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-white/50 dark:bg-white/[0.02]">
            <div class="flex items-center gap-4">
               <div class="w-12 h-12 bg-slate-900 dark:bg-white/10 rounded-2xl flex items-center justify-center text-white">
                  <i data-lucide="scroll-text" class="w-6 h-6"></i>
               </div>
               <div>
                  <h3 class="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">System Audit Trail</h3>
                  <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Full sequence of actions and events</p>
               </div>
            </div>
            
            <div class="flex items-center gap-3">
               <div class="flex items-center gap-2 bg-slate-100/50 dark:bg-[#343434]/80 p-1.5 rounded-2xl">
                  <input type="text" id="modal-audit-filter-reqid" placeholder="Request ID..." class="bg-transparent border-none px-4 py-2 text-[10px] font-bold w-36 text-slate-700 dark:text-white focus:ring-0">
                  <input type="date" id="modal-audit-filter-date" class="bg-transparent border-none px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-white focus:ring-0 cursor-pointer">
                  <button id="modal-audit-filter-btn" class="px-5 py-2.5 bg-[#96588a] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-purple-500/20">Filter</button>
               </div>
               <button id="close-audit-modal" class="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-white/10 hover:bg-rose-500 hover:text-white rounded-full transition-all group">
                  <i data-lucide="x" class="w-5 h-5 group-hover:rotate-90 transition-transform"></i>
               </button>
            </div>
         </div>
         
         <div class="flex-1 overflow-hidden flex flex-col p-8">
            <div class="bg-white/40 dark:bg-black/20 rounded-2xl border border-slate-100 dark:border-white/5 flex-1 flex flex-col min-h-0 overflow-hidden">
               <div class="grid grid-cols-12 gap-2 px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                  <span class="col-span-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">Timestamp</span>
                  <span class="col-span-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">Action</span>
                  <span class="col-span-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">Actor</span>
                  <span class="col-span-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">Request ID</span>
                  <span class="col-span-4 text-[8px] font-black text-slate-400 uppercase tracking-widest">Comment / Details</span>
               </div>
               <div id="audit-log-body" class="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-50 dark:divide-white/[0.03]">
                  <div class="flex items-center justify-center py-20 text-slate-400 italic text-[10px]">Initialising audit logs...</div>
               </div>
            </div>
         </div>
      </div>
      `;

      document.body.appendChild(ov);
      if (window.lucide) window.lucide.createIcons();

      const closeBtn = ov.querySelector('#close-audit-modal');
      closeBtn.onclick = () => {
         ov.classList.add('animate-fade-out');
         ov.querySelector('.animate-slide-up').classList.replace('animate-slide-up', 'animate-slide-down');
         setTimeout(() => ov.remove(), 400);
      };

      const filterBtn = ov.querySelector('#modal-audit-filter-btn');
      filterBtn.onclick = () => {
         const reqId = ov.querySelector('#modal-audit-filter-reqid').value.trim();
         const date = ov.querySelector('#modal-audit-filter-date').value;
         loadAuditLogData({ reqId, date }, ov);
      };

      loadAuditLogData({}, ov);
   }

   // Initialize Page
   setTimeout(() => loadTabContent(currentTab), 0);

   // Listen for global filter changes
   const globalFilterHandler = () => loadTabContent(currentTab, true);
   window.addEventListener('global-filter-changed', globalFilterHandler);

   // Cleanup mechanism
   window.addEventListener('cleanup-page', () => {
      window.removeEventListener('global-filter-changed', globalFilterHandler);
   }, { once: true });

   return container;
}
