import { db, storage } from '../firebase.js';
import { collection, getDocs, query, where, orderBy, addDoc, serverTimestamp, doc, getDoc, setDoc, limit, writeBatch, updateDoc, increment, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

export async function renderExpensesPage() {
   const APPROVAL_TEMPLATE_URL = '/templates/liquidation-approval-template.xlsx';
   const container = document.createElement('div');
   container.className = 'p-6 space-y-6 pb-20 page-enter';

   let categories = [];
   let purposes = [];
   let categoryMappings = {};
   let selectedFile = null;
   let currentBranch = document.getElementById('db-branch')?.value || 'Pioneer Center';
   let baseFund = 0;
   let unliquidatedTotal = 0;
   let pendingTotal = 0;

   container.innerHTML = `
    <div class="flex items-center justify-between mb-8 border-b border-slate-100 dark:border-slate-800/50 pb-5">
      <div class="flex flex-col">
        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-[0.25em]">Cashier Fund & Accountant Ledger</p>
      </div>
      
      <div class="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-full shadow-inner border border-slate-200/50 dark:border-slate-700/30">
         <button class="expense-tab active px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all bg-[#96588a] text-white shadow-lg shadow-[#96588a]/20" data-tab="cashier">Cashier</button>
         <button class="expense-tab px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all text-slate-400 hover:text-slate-600" data-tab="ledger">Ledger</button>
         <button class="expense-tab px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all text-slate-400 hover:text-slate-600" data-tab="audit">Audit</button>
      </div>
    </div>

    <div id="expense-content" class="min-h-[400px]"></div>
  `;

   async function loadMasterData() {
      const freshBranch = document.getElementById('db-branch')?.value;
      if (freshBranch && freshBranch !== 'All Branches') {
         currentBranch = freshBranch;
      }

      try {
         // Load Categories & Purposes from settings/expenses_master
         const masterSnap = await getDoc(doc(db, 'settings', 'expenses_master'));
         if (masterSnap.exists()) {
            const m = masterSnap.data();
            categories = m.categories || [];
            purposes = m.purposes || [];
            categoryMappings = m.categoryMappings || m.cashierMappings || {};
         }

         // Load Base Fund from kpi_settings/branch
         const branchSnap = await getDoc(doc(db, 'kpi_settings', currentBranch));
         if (branchSnap.exists()) {
            baseFund = branchSnap.data().petty_base || 0;
         }

         // Calculate spent unliquidated
         const q = query(collection(db, 'expenses'), where('branchId', '==', currentBranch));
         const snap = await getDocs(q);
         const docs = snap.docs.map(d => d.data());
         const unliquidatedDocs = docs.filter(d => (d.fundedBy === 'petty_cash' || d.fundedBy === 'pettyCash') && ['pending', 'requested', 'rejected'].includes(d.status));
         unliquidatedTotal = unliquidatedDocs.reduce((acc, d) => acc + (d.amount || 0), 0);
         pendingTotal = unliquidatedDocs.filter(d => d.status === 'pending').reduce((acc, d) => acc + (d.amount || 0), 0);
      } catch (err) {
         console.error("Load Master Data Error:", err);
      }
   }

   async function loadTabContent(tabName) {
      const content = container.querySelector('#expense-content');
      if (!content) return;
      content.innerHTML = `<div class="flex items-center justify-center h-64"><div class="w-8 h-8 border-4 border-[#96588a]/20 border-t-[#96588a] rounded-full animate-spin"></div></div>`;

      try {
         await loadMasterData();

         if (tabName === 'cashier') {
            content.innerHTML = renderCashierTab();
            attachCashierListeners();
            await loadHistoryData();
         } else if (tabName === 'ledger') {
            content.innerHTML = renderLedgerTab();
            attachLedgerListeners();
            loadLedgerData();
         } else {
            content.innerHTML = renderAuditTab();
            await loadAuditData();
            await loadAuditLogData();
            await loadHistoryData();
            attachAuditLogListeners();
         }
      } catch (err) {
         console.error("Load Tab Content Error:", err);
         content.innerHTML = `<div class="p-12 text-center text-rose-500 font-black uppercase text-xs">Error loading ${tabName} data. Please check your connection.</div>`;
      }

      if (window.lucide) window.lucide.createIcons();
   }

   function renderCashierTab() {
      const fmt = n => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
      return `
      <div class="animate-fade-in space-y-8">
         <!-- TOP ROW: Action & Status -->
         <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            <!-- Form Center (2/3) -->
            <div class="lg:col-span-2 bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 shadow-sm border border-slate-100 dark:border-slate-800 h-full flex flex-col justify-between min-h-[420px]">
               <div class="flex items-center gap-3 mb-6">
                  <div class="w-10 h-10 bg-[#96588a]/10 rounded-2xl flex items-center justify-center text-[#96588a]">
                     <i data-lucide="plus-circle" class="w-5 h-5"></i>
                  </div>
                  <h4 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">Add Transaction</h4>
               </div>

               <form id="expense-form" class="flex-1 flex flex-col justify-between space-y-6">
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-9 gap-4">
                     <div class="lg:col-span-2 space-y-1.5">
                        <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                        <select id="exp-category" required class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-[#96588a] transition-all cursor-pointer">
                           <option value="">Select Category</option>
                           ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                     </div>
                     <div class="lg:col-span-2 space-y-1.5">
                        <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount</label>
                        <div class="relative">
                           <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₱</span>
                           <input type="number" id="exp-amount" required step="0.01" placeholder="0.00" class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl pl-8 pr-4 py-3 text-xs font-bold focus:ring-2 focus:ring-[#96588a] transition-all">
                        </div>
                     </div>
                     <div class="lg:col-span-2 space-y-1.5">
                        <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Purpose</label>
                        <select id="exp-purpose" required class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-[#96588a] transition-all cursor-pointer">
                           <option value="">Select Purpose</option>
                           ${purposes.map(p => `<option value="${p}">${p}</option>`).join('')}
                        </select>
                     </div>
                     <div id="exp-subcategory-wrap" class="space-y-1.5 hidden">
                        <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Sub Category</label>
                        <select id="exp-subcategory" class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-[#96588a] transition-all cursor-pointer">
                           <option value="">Select Sub Category</option>
                        </select>
                     </div>
                     <div class="lg:col-span-2 space-y-1.5">
                        <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Date</label>
                        <input type="date" id="exp-date" required value="${new Date().toISOString().split('T')[0]}" class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-[#96588a] transition-all cursor-pointer">
                     </div>
                  </div>

                  <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
                     <div class="lg:col-span-2 space-y-1.5">
                        <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Detail Description</label>
                        <input type="text" id="exp-desc" required placeholder="Describe the expense..." class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-[#96588a] transition-all">
                     </div>
                     <div class="lg:col-span-1 space-y-1.5">
                        <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Invoice No. (Optional)</label>
                        <input type="text" id="exp-invoice" placeholder="e.g. INV-2026-001" class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-[#96588a] transition-all uppercase">
                     </div>
                     <div class="lg:col-span-1 space-y-1.5">
                        <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Receipt Attachment</label>
                        <input type="file" id="exp-file" class="hidden" accept="image/*">
                        <div id="file-dropzone" class="border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl px-4 py-2.5 flex items-center justify-center gap-3 hover:bg-slate-50 transition-all cursor-pointer relative overflow-hidden group">
                           <div id="file-preview" class="hidden absolute inset-0 bg-white dark:bg-slate-900 z-10 flex items-center justify-center">
                              <img src="" class="h-full w-auto object-contain">
                              <button type="button" id="remove-file" class="absolute top-1 right-1 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg"><i data-lucide="x" class="w-3 h-3"></i></button>
                           </div>
                           <i data-lucide="camera" class="w-4 h-4 text-slate-400"></i>
                           <span class="text-[9px] font-black text-slate-400 uppercase">Attach</span>
                        </div>
                     </div>
                  </div>

                  <button type="submit" id="save-exp-btn" class="w-full py-5 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all shadow-xl hover:scale-[1.01] active:scale-95">
                     Save Transaction to Batch
                  </button>
               </form>
            </div>

            <!-- RIGHT COLUMN: Dual Card Stack (1/3) -->
            <div class="lg:col-span-1 flex flex-col gap-4">
               <!-- ATM Card: Deep Onyx Glassmorphism -->
               <div class="relative group aspect-[1.58/1] cursor-pointer">
                  <div class="relative h-full bg-gradient-to-br from-black via-slate-900/90 to-black backdrop-blur-3xl rounded-[2.5rem] p-8 text-white overflow-hidden flex flex-col justify-between border border-white/5 group-hover:border-white/20 transition-all duration-500 group-hover:scale-[1.02] shadow-inner">
                     <!-- Minimal Glow -->
                     <div class="absolute -top-24 -left-24 w-80 h-80 bg-[#96588a]/10 rounded-full blur-[120px] group-hover:bg-[#96588a]/15 transition-all duration-700"></div>
                     
                     <div class="flex justify-between items-start relative z-10">
                        <!-- Chip: Dark Metallic Look -->
                        <div class="w-12 h-9 bg-gradient-to-br from-slate-400 via-slate-600 to-slate-500 rounded-lg relative overflow-hidden shadow-inner opacity-80">
                           <div class="absolute inset-x-0 top-1/2 h-px bg-black/40"></div>
                           <div class="absolute inset-y-0 left-1/2 w-px bg-black/40"></div>
                        </div>
                        <div class="text-right">
                           <div class="flex items-center gap-1 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                              <div class="w-6 h-6 border-2 border-white/20 rounded-full"></div>
                              <div class="w-6 h-6 bg-white/20 rounded-full -ml-3 backdrop-blur-md"></div>
                           </div>
                           <p class="text-[7px] font-black tracking-[0.4em] text-white/30 mt-2 uppercase">${currentBranch}</p>
                        </div>
                     </div>

                     <div class="relative z-10">
                        <p class="text-[9px] font-black text-[#d4afcd] uppercase tracking-[0.5em] mb-2 opacity-80">Fund Balance</p>
                        <div class="flex items-baseline gap-1">
                           <h2 id="cashier-balance-display" class="text-4xl font-black tracking-tighter tabular-nums text-white">${fmt(baseFund - unliquidatedTotal)}</h2>
                        </div>
                     </div>

                     <!-- Subtle Security Logo Overlay -->
                     <div class="absolute bottom-6 right-10 opacity-[0.03] group-hover:opacity-5 transition-opacity duration-700 scale-125">
                        <i data-lucide="verified" class="w-20 h-20 rotate-6"></i>
                     </div>
                  </div>
               </div>

               <!-- Stats Card -->
               <div class="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-100 dark:border-slate-800 shadow-sm flex-1 flex flex-col justify-center">
                  <div class="grid grid-cols-3 gap-4">
                     <div class="text-center space-y-1">
                        <p class="text-[7px] font-black text-amber-500 uppercase tracking-widest">Pending</p>
                        <p id="count-pending" class="text-xl font-black text-slate-800 dark:text-white">-</p>
                     </div>
                     <div class="text-center space-y-1 border-x border-slate-100 dark:border-slate-800">
                        <p class="text-[7px] font-black text-emerald-500 uppercase tracking-widest">Approved</p>
                        <p id="count-approved" class="text-xl font-black text-slate-800 dark:text-white">-</p>
                     </div>
                     <div class="text-center space-y-1">
                        <p class="text-[7px] font-black text-rose-500 uppercase tracking-widest">Rejected</p>
                        <p id="count-rejected" class="text-xl font-black text-slate-800 dark:text-white">-</p>
                     </div>
                  </div>
                  <div class="mt-6 pt-6 border-t border-slate-50 dark:border-slate-800 flex justify-between items-center">
                     <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Spent this month</p>
                     <p id="cashier-spent-display" class="text-sm font-black text-slate-800 dark:text-white">${fmt(unliquidatedTotal)}</p>
                  </div>
               </div>
            </div>
         </div>

         <!-- MIDDLE ROW: Batch Items -->
         <div class="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-100 dark:border-slate-800 shadow-sm">
            <div class="flex items-center justify-between mb-8">
               <div class="flex items-center gap-4">
                  <div class="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
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
                  <button id="request-liquidation-btn" class="px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl shadow-emerald-500/20 flex items-center gap-3 group">
                     <i data-lucide="send" class="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"></i> Request
                  </button>
               </div>
            </div>
            
            <div id="cashier-items-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar min-h-[100px]"></div>
         </div>

         <!-- HISTORY SECTION -->
         <div class="pt-8 border-t border-slate-100 dark:border-slate-800">
            <div class="flex items-center justify-between mb-6">
               <h4 class="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter flex items-center gap-3"><i data-lucide="clock" class="w-7 h-7 text-[#96588a]"></i> Recent History</h4>
               <div class="h-px flex-1 mx-8 bg-slate-100 dark:bg-slate-800/50"></div>
            </div>
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
               <div class="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40">
                  <span class="col-span-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Request ID</span>
                  <span class="col-span-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Period</span>
                  <span class="col-span-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">Branch</span>
                  <span class="col-span-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">Status</span>
                  <span class="col-span-2 text-[8px] font-black text-slate-400 uppercase tracking-widest text-right">Total</span>
               </div>
               <div id="history-list-container" class="divide-y divide-slate-50 dark:divide-slate-800"></div>
            </div>
         </div>
      </div>
    `;
   }

   function attachCashierListeners() {
      const form = container.querySelector('#expense-form');
      const dropzone = container.querySelector('#file-dropzone');
      const fileInput = container.querySelector('#exp-file');
      const preview = container.querySelector('#file-preview');
      const categorySelect = container.querySelector('#exp-category');
      const purposeSelect = container.querySelector('#exp-purpose');
      const subCategoryWrap = container.querySelector('#exp-subcategory-wrap');
      const subCategorySelect = container.querySelector('#exp-subcategory');
      const descInput = container.querySelector('#exp-desc');

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
         const unique = [...new Set(options.filter(Boolean))];
         const fallback = purposes || [];
         const source = unique.length ? unique : fallback;
         purposeSelect.innerHTML = `<option value="">Select Purpose</option>${source.map(p => `<option value="${p}">${p}</option>`).join('')}`;
         if (source.length === 1) purposeSelect.value = source[0];
      };

      const applyAutoDescription = (text) => {
         if (!text) return;
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
         const cat = categorySelect.value;
         const sub = subCategorySelect.value;
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
         const cat = categorySelect.value;
         const cfg = normalizeMapping(categoryMappings?.[cat]);
         const subKeys = Object.keys(cfg.subcategories || {});

         if (subKeys.length) {
            subCategoryWrap.classList.remove('hidden');
            subCategorySelect.innerHTML = `<option value="">Select Sub Category</option>${subKeys.map(k => `<option value="${k}">${k}</option>`).join('')}`;
            subCategorySelect.value = '';
            renderPurposeOptions(cfg.purposes);
            applyAutoDescription(cfg.description);
            applyPurposeAutoFill();
         } else {
            subCategoryWrap.classList.add('hidden');
            subCategorySelect.innerHTML = '<option value="">Select Sub Category</option>';
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
         const template = getPurposeTemplate(cfg, purposeSelect.value);
         if (template) applyAutoDescription(template);
      };

      descInput.addEventListener('input', () => {
         descInput.dataset.autofilled = 'false';
      });
      categorySelect.addEventListener('change', applyCategoryRules);
      subCategorySelect.addEventListener('change', applySubCategoryRules);
      purposeSelect.addEventListener('change', applyPurposeAutoFill);
      applyCategoryRules();

      dropzone.onclick = () => fileInput.click();

      fileInput.onchange = (e) => {
         const file = e.target.files[0];
         if (file) {
            selectedFile = file;
            const reader = new FileReader();
            reader.onload = (ev) => {
               preview.querySelector('img').src = ev.target.result;
               preview.classList.remove('hidden');
               if (window.lucide) window.lucide.createIcons();
            };
            reader.readAsDataURL(file);
         }
      };

      container.querySelector('#remove-file').onclick = (e) => {
         e.stopPropagation();
         selectedFile = null;
         fileInput.value = '';
         preview.classList.add('hidden');
      };

      form.onsubmit = async (e) => {
         e.preventDefault();
         const dateVal = container.querySelector('#exp-date').value;
         const catVal = container.querySelector('#exp-category').value;
         const purVal = container.querySelector('#exp-purpose').value;
         const subCatVal = container.querySelector('#exp-subcategory')?.value || '';
         const amtVal = parseFloat(container.querySelector('#exp-amount').value);
         const descVal = container.querySelector('#exp-desc').value;
         const invoiceVal = (container.querySelector('#exp-invoice')?.value || '').trim().toUpperCase();

         if (!amtVal || amtVal <= 0) { window.showToast("Amount must be greater than zero.", "error"); return; }
         if (!selectedFile) { window.showToast("Please attach a receipt image.", "error"); return; }

         const btn = container.querySelector('#save-exp-btn');
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
            const fileRef = ref(storage, `expenses_receipts/${Date.now()}_${selectedFile.name}`);
            const uploadSnap = await uploadBytes(fileRef, selectedFile);
            const downloadUrl = await getDownloadURL(uploadSnap.ref);

            await addDoc(collection(db, 'expenses'), {
               branchId: currentBranch,
               date: dateVal,
               category: catVal,
               subCategory: subCatVal || null,
               purpose: purVal,
               invoiceNo: invoiceVal || null,
               amount: amtVal,
               description: descVal,
               receiptUrl: downloadUrl,
               fundedBy: 'petty_cash',
               status: 'pending',
               createdAt: serverTimestamp()
            });

            window.showToast('Transaction saved!', 'success');

            // Success: convert the button to green + check icon (do not change DB logic).
            btn.className = originalClassName;
            btn.classList.remove('bg-slate-900', 'dark:bg-white', 'dark:text-slate-900');
            btn.classList.add('bg-emerald-500', 'hover:bg-emerald-600', 'dark:bg-emerald-500');
            btn.innerHTML = `
              <div class="flex items-center justify-center w-full gap-3">
                <span class="w-5 h-5 rounded-full bg-white/20 text-white flex items-center justify-center font-black">✓</span>
                <span class="font-black">Done Saved</span>
              </div>
            `;

            setTimeout(async () => {
               // 1. Reset Form & Button
               form.reset();
               preview.classList.add('hidden');
               preview.querySelector('img').src = '';
               selectedFile = null;

               btn.disabled = false;
               btn.innerHTML = originalText;
               btn.className = originalClassName;

               // 2. Refresh Master Data
               await loadMasterData();

               // 3. Directly update summary figures via ID
               const balanceEl = container.querySelector('#cashier-balance-display');
               const spentEl = container.querySelector('#cashier-spent-display');
               if (balanceEl) balanceEl.innerText = '₱' + (baseFund - unliquidatedTotal).toLocaleString('en-PH', { minimumFractionDigits: 2 });
               if (spentEl) spentEl.innerText = '₱' + unliquidatedTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 });

               // 4. Silently refresh lists
               if (typeof loadCashierData === 'function') await loadCashierData();
               if (typeof loadHistoryData === 'function') await loadHistoryData();
            }, 1000);
         } catch (err) {
            console.error(err);
            btn.disabled = false;
            btn.innerHTML = originalText;
            btn.className = originalClassName;
         }
      };

      container.querySelector('#request-liquidation-btn').onclick = async () => {
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

      loadCashierData();
   }

   async function showLiquidationDetailModal(reqData, onActionDone) {
      if (document.getElementById('liquidation-detail-overlay')) return; // Prevent double-clicks

      const overlay = document.createElement('div');
      overlay.id = 'liquidation-detail-overlay';
      overlay.className = 'fixed inset-0 z-[10000] bg-transparent animate-fade-in flex items-center justify-center p-4';

      // Identify Context
      const isAuditMode = reqData.status === 'pending' && container.querySelector('.expense-tab.active')?.dataset.tab === 'audit';
      const isEditMode = reqData.status === 'rejected' || reqData.status === 'partially_rejected';

      overlay.innerHTML = `
         <div class="bg-white/95 dark:bg-slate-950/95 w-full max-w-md max-h-[85vh] flex flex-col shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] rounded-[2.5rem] border-2 border-slate-200/90 dark:border-slate-700/80 animate-scale-up overflow-hidden">
            <!-- Modal Header -->
            <div class="px-8 pt-8 pb-4 flex items-center justify-between flex-shrink-0">
               <div>
                  <h3 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter leading-none">${reqData.branchId}</h3>
                  <p class="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Financial Breakdown</p>
               </div>
               <button id="detail-close" class="w-8 h-8 rounded-full bg-white/50 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-rose-500 hover:text-white transition-all text-xl font-light">&times;</button>
            </div>

            <!-- Summary Grid (Glass Style) -->
            <div class="px-8 pb-4 grid grid-cols-2 gap-3 flex-shrink-0">
               <div class="p-4 bg-white/80 dark:bg-slate-900/80 rounded-[1.5rem] border border-white dark:border-slate-800 shadow-sm flex items-center justify-between">
                  <div>
                     <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Requested</p>
                     <h2 class="text-xl font-black text-slate-800 dark:text-white tracking-tighter">₱${reqData.totalAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</h2>
                  </div>
                  <i data-lucide="wallet" class="w-4 h-4 text-purple-400"></i>
               </div>
               <div class="p-4 bg-[#96588a] rounded-[1.5rem] text-white shadow-lg shadow-[#96588a]/20 flex flex-col justify-center">
                  <p class="text-[8px] font-black opacity-60 uppercase tracking-widest mb-0.5">Status</p>
                  <div class="flex items-center gap-2">
                     <div class="w-1.5 h-1.5 rounded-full bg-white animate-[pulse_2s_ease-in-out_2]"></div>
                     <h3 class="text-xs font-black uppercase tracking-widest">${reqData.status}</h3>
                  </div>
               </div>
            </div>

            <div class="px-8 py-2 flex-shrink-0 flex items-center justify-between">
               <p class="text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-[0.2em] pl-2 border-l-2 border-purple-500">Expenses List</p>
               <p class="text-[9px] text-slate-500 font-black uppercase tracking-widest italic">ID: ${reqData.id.substring(0, 8).toUpperCase()}</p>
            </div>

            <!-- Items List Area -->
            <div id="detail-body" class="flex-1 overflow-y-auto px-6 py-2 space-y-1 custom-scrollbar">
               <div class="flex flex-col items-center justify-center py-10 gap-3">
                  <div class="w-6 h-6 border-3 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
               </div>
            </div>

            <!-- Action Footer -->
            <div class="px-8 pb-8 pt-4 flex-shrink-0">
               <div class="flex gap-2">
                  ${(reqData.status === 'pending' && container.querySelector('.expense-tab.active')?.dataset.tab === 'audit') ? `
                      <button id="detail-complete-review" class="w-full py-3.5 rounded-2xl bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl">Complete Review</button>
                  ` : (reqData.status === 'pending') ? `
                      <button id="detail-cancel-request" class="w-full py-3.5 rounded-2xl bg-rose-500 text-white text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-xl">Cancel Request</button>
                  ` : isEditMode ? `
                     <button id="detail-resubmit" class="w-full py-4 rounded-2xl bg-purple-500 text-white text-[9px] font-black uppercase tracking-widest shadow-lg">Submit Corrections</button>
                  ` : `
                     <button id="detail-close-btn" class="w-full py-3.5 rounded-2xl bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest">Dismiss Detail</button>
                  `}
               </div>
            </div>
         </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector('#detail-close').onclick = () => overlay.remove();
      const closeBtn = overlay.querySelector('#detail-close-btn');
      if (closeBtn) closeBtn.onclick = () => overlay.remove();

      const detailBody = overlay.querySelector('#detail-body');
      try {
         const snap = await getDocs(query(collection(db, 'expenses'), where('liquidationId', '==', reqData.id)));
         const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
         const resubmitFiles = {}; // Store new files for resubmission

         detailBody.innerHTML = items.map(item => `
            <div class="item-row group flex items-center gap-3 px-4 py-1.5 rounded-xl transition-all hover:bg-white dark:hover:bg-slate-900 cursor-default border-b border-white/5" data-id="${item.id}">
               ${isAuditMode ? `
               <!-- Toggle: Approve/Reject -->
               <div style="width: 28px;" class="flex-shrink-0">
                  <button class="item-toggle w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black transition-all border-2 border-emerald-300 bg-emerald-50 text-emerald-600" data-id="${item.id}" data-status="approved" title="Click to reject">
                     ✓
                  </button>
               </div>
               ` : ''}
               <!-- Column 1: Date -->
               <div style="width: 45px;" class="flex-shrink-0">
                  <p class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase leading-none">${item.date.split('-').slice(1).join('/')}</p>
               </div>
               
               <!-- Column 2: Purpose -->
               <div style="flex: 1; min-width: 0;" class="min-w-0">
                  <div class="flex items-center gap-2">
                     <p class="text-[11px] font-black text-black dark:text-white uppercase whitespace-nowrap overflow-hidden text-ellipsis">${item.purpose}</p>
                     ${item.auditorNote ? '<i data-lucide="alert-circle" class="w-3 h-3 text-rose-500 flex-shrink-0"></i>' : ''}
                  </div>
               </div>

               <!-- Column 3: Amount -->
               <div style="width: 90px;" class="text-right flex-shrink-0">
                  <p class="text-[13px] font-black text-rose-500 tracking-tighter">₱${item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
               </div>

               <!-- Column 4: Actions -->
               <div style="width: 24px;" class="flex items-center justify-end">
                  ${item.receiptUrl ? `
                     <button class="receipt-eye-btn text-slate-400 hover:text-purple-600 transition-colors" data-url="${item.receiptUrl}">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                     </button>
                  ` : ''}
               </div>
            </div>

            <!-- Reject reason input (hidden by default, shown when item toggled to reject) -->
            ${isAuditMode ? `<div class="reject-reason-box hidden mx-4 mb-2 animate-fade-in" data-for="${item.id}">
               <input type="text" class="reject-note w-full bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-[10px] font-bold text-rose-700 placeholder-rose-300" placeholder="Reason for rejection (required)">
            </div>` : ''}
            
            ${isEditMode && item.auditorNote ? `
               <div class="mx-4 mb-4 p-4 bg-white/80 rounded-2xl border border-rose-100 space-y-3 animate-fade-in shadow-sm">
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
                     <p class="resubmit-file-name hidden text-[8px] text-purple-500 font-bold mt-1 text-center truncate"></p>
                  </div>
               </div>
            ` : ''}
         `).join('');

         if (window.lucide) window.lucide.createIcons();

         // Per-item toggle listeners (Audit Mode)
         detailBody.querySelectorAll('.item-toggle').forEach(btn => {
            btn.onclick = () => {
               const currentStatus = btn.dataset.status;
               const reasonBox = detailBody.querySelector(`.reject-reason-box[data-for="${btn.dataset.id}"]`);
               if (currentStatus === 'approved') {
                  btn.dataset.status = 'rejected';
                  btn.textContent = '✕';
                  btn.className = 'item-toggle w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black transition-all border-2 border-rose-300 bg-rose-50 text-rose-600';
                  btn.title = 'Click to approve';
                  if (reasonBox) reasonBox.classList.remove('hidden');
               } else {
                  btn.dataset.status = 'approved';
                  btn.textContent = '✓';
                  btn.className = 'item-toggle w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black transition-all border-2 border-emerald-300 bg-emerald-50 text-emerald-600';
                  btn.title = 'Click to reject';
                  if (reasonBox) { reasonBox.classList.add('hidden'); reasonBox.querySelector('.reject-note').value = ''; }
               }
            };
         });

         detailBody.querySelectorAll('.receipt-eye-btn').forEach(btn => {
            btn.onclick = () => {
               const lb = document.createElement('div');
               lb.className = 'fixed inset-0 bg-slate-900/90 z-[10005] flex items-center justify-center p-6 cursor-zoom-out animate-fade-in';
               lb.innerHTML = `<img src="${btn.dataset.url}" class="max-w-full max-h-full object-contain rounded-3xl shadow-2xl animate-scale-up">`;
               lb.onclick = () => lb.remove();
               document.body.appendChild(lb);
            };
         });

         if (overlay.querySelector('#detail-cancel-request')) {
            overlay.querySelector('#detail-cancel-request').onclick = async () => {
               const confirmed = await window.showConfirmModal('Cancel Request', 'Are you sure you want to cancel this liquidation? Items will be returned to your pending list.');
               if (!confirmed) return;

               const btn = overlay.querySelector('#detail-cancel-request');
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

                  overlay.remove();
                  onActionDone();
                  window.showToast('Request cancelled successfully', 'info');
               } catch (err) {
                  console.error(err);
                  btn.disabled = false;
                  btn.innerHTML = originalText;
                  window.showToast('Error cancelling request', 'error');
               }
            };
         }

         if (isAuditMode) {
            overlay.querySelector('#detail-complete-review').onclick = async () => {
               // Gather per-item decisions
               const toggles = detailBody.querySelectorAll('.item-toggle');
               const approvedItems = [];
               const rejectedItems = [];

               for (const toggle of toggles) {
                  const itemId = toggle.dataset.id;
                  const status = toggle.dataset.status;
                  if (status === 'rejected') {
                     const reasonBox = detailBody.querySelector(`.reject-reason-box[data-for="${itemId}"]`);
                     const note = reasonBox?.querySelector('.reject-note')?.value?.trim();
                     if (!note) {
                        window.showToast('Please provide a reason for all rejected items.', 'error');
                        reasonBox?.querySelector('.reject-note')?.focus();
                        return;
                     }
                     rejectedItems.push({ id: itemId, note });
                  } else {
                     approvedItems.push(itemId);
                  }
               }

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

               overlay.remove();
               onActionDone();
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

            overlay.querySelector('#detail-resubmit').onclick = async () => {
               const btn = overlay.querySelector('#detail-resubmit');
               const originalText = btn.innerText;
               btn.disabled = true;
               btn.innerHTML = `<div class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Processing...`;

               try {
                  const batch = writeBatch(db);
                  let total = 0;

                  // Process rows
                  const rows = Array.from(overlay.querySelectorAll('.item-row'));
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

                  overlay.remove();
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

      } catch (err) { console.error(err); }
   }

   function renderLedgerTab() {
      return `
      <div class="space-y-8 animate-fade-in">
         <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 class="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Financial Ledgers</h3>
            <div class="flex items-center gap-2">
               <input type="file" id="import-excel-file" class="hidden" accept=".xlsx, .xls">
               <button id="import-excel-btn" class="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm">
                  <i data-lucide="file-up" class="w-4 h-4 text-blue-500"></i> Import Excel
               </button>
               <button id="export-ledger-btn" class="px-5 py-2.5 bg-[#96588a] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-[#96588a]/20 flex items-center gap-2">
                  <i data-lucide="download" class="w-4 h-4"></i> Export
               </button>
            </div>
         </div>

         <div class="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
            <!-- Unified Header with Sub-tabs -->
            <div class="px-8 py-6 border-b border-slate-50 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
               <div class="flex items-center gap-4 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl w-fit">
                  <button class="ledger-subtab active px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 bg-white dark:bg-slate-900 shadow-sm text-slate-800 dark:text-white" data-target="petty-view">
                     <i data-lucide="wallet" class="w-3.5 h-3.5 text-rose-500"></i> Petty Cash
                  </button>
                  <button class="ledger-subtab px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 text-slate-400 hover:text-slate-600" data-target="accountant-view">
                     <i data-lucide="landmark" class="w-3.5 h-3.5 text-blue-500"></i> Accountant
                  </button>
               </div>
               <div class="flex items-center gap-2">
                  <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Branch:</span>
                  <span class="px-3 py-1 bg-slate-50 dark:bg-slate-800 rounded-lg text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase">${document.getElementById('db-branch')?.value || 'Current'}</span>
               </div>
            </div>

            <div class="p-8">
               <!-- Ledger Filters (Search + Date) -->
               <div class="mb-6">
                  <div class="flex flex-col lg:flex-row lg:items-end gap-3 justify-between">
                     <div class="flex-1 flex flex-col sm:flex-row items-end gap-3">
                        <div class="flex-1 w-full space-y-1">
                           <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Search</label>
                           <input id="ledger-search" type="text" placeholder="Purpose / Description / Category / Invoice No."
                             class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-[10px] font-bold focus:ring-2 focus:ring-[#96588a] transition-all">
                        </div>
                         <div class="w-full sm:w-auto space-y-1">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest">From</label>
                            <input id="ledger-from" type="date"
                              class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-[10px] font-bold focus:ring-2 focus:ring-[#96588a] transition-all cursor-pointer"
                              value="${new Date(Date.now() - 86400000).toISOString().split('T')[0]}">
                         </div>
                         <div class="w-full sm:w-auto space-y-1">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest">To</label>
                            <input id="ledger-to" type="date"
                              class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-[10px] font-bold focus:ring-2 focus:ring-[#96588a] transition-all cursor-pointer"
                              value="${new Date(Date.now() - 86400000).toISOString().split('T')[0]}">
                         </div>
                     </div>
                     <div class="flex gap-2">
                        <button id="ledger-apply-btn"
                          class="px-5 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm">
                           Apply
                        </button>
                        <button id="ledger-clear-btn"
                          class="px-5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-sm">
                           Clear
                        </button>
                     </div>
                  </div>
               </div>

               <!-- Petty Cash View -->
               <div id="petty-view" class="ledger-view animate-fade-in">
                  <div class="overflow-x-auto">
                     <table class="w-full text-left border-collapse">
                        <thead class="sticky top-0 z-10">
                           <tr class="border-b border-slate-50 dark:border-slate-800">
                              <th class="px-2 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                              <th class="px-2 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Purpose & Detail</th>
                              <th class="px-2 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                              <th class="px-2 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                              <th class="px-2 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Actions</th>
                           </tr>
                        </thead>
                        <tbody id="petty-table-body">
                           <tr><td colspan="5" class="px-2 py-12 text-center text-[10px] text-slate-300 italic font-black uppercase tracking-widest">Loading records...</td></tr>
                        </tbody>
                     </table>
                  </div>
               </div>

               <!-- Accountant View -->
               <div id="accountant-view" class="ledger-view hidden animate-fade-in">
                  <div class="overflow-x-auto">
                     <table class="w-full text-left border-collapse">
                        <thead>
                           <tr class="border-b border-slate-50 dark:border-slate-800">
                              <th class="px-2 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                              <th class="px-2 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Purpose & Detail</th>
                              <th class="px-2 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                              <th class="px-2 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                              <th class="px-2 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Actions</th>
                           </tr>
                        </thead>
                        <tbody id="accountant-table-body">
                           <tr><td colspan="5" class="px-2 py-12 text-center text-[10px] text-slate-300 italic font-black uppercase tracking-widest">Loading records...</td></tr>
                        </tbody>
                     </table>
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
         const fromDate = container.querySelector('#ledger-from')?.value || '';
         const toDate = container.querySelector('#ledger-to')?.value || '';

         let docs = [];
         try {
            const constraints = [];
            if (currentBranch && currentBranch !== 'All Branches') {
               constraints.push(where('branchId', '==', currentBranch));
            }
            if (fromDate) constraints.push(where('date', '>=', fromDate));
            if (toDate) constraints.push(where('date', '<=', toDate));
            constraints.push(orderBy('date', 'desc'), limit(200));

            const q = query(collection(db, 'expenses'), ...constraints);
            const snap = await getDocs(q);
            docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
         } catch (qErr) {
            // If Firestore composite index for date-range query isn't configured yet, fallback.
            console.warn('Ledger query fallback:', qErr);
            let constraints = [orderBy('date', 'desc'), limit(300)];
            if (currentBranch && currentBranch !== 'All Branches') {
               constraints.unshift(where('branchId', '==', currentBranch));
            }
            const q = query(collection(db, 'expenses'), ...constraints);
            const snap = await getDocs(q);
            docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
         }

         // Client-side filtering (safe + avoids query coupling).
         if (fromDate) docs = docs.filter(d => (d.date || '') >= fromDate);
         if (toDate) docs = docs.filter(d => (d.date || '') <= toDate);
         if (searchText) {
            docs = docs.filter(d => {
               const fields = [
                  d.purpose,
                  d.description,
                  d.category,
                  d.invoiceNo
               ];
               return fields.some(v => (v || '').toString().toLowerCase().includes(searchText));
            });
         }

         const renderRows = (data) => data.map(d => `
            <tr class="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 transition-all group">
               <td class="px-2 py-4 text-[10px] font-bold text-slate-500">${d.date}</td>
               <td class="px-2 py-4">
                  <div class="text-[10px] font-black text-slate-800 dark:text-white uppercase">${d.purpose || '---'}</div>
                  <div class="text-[8px] text-slate-400 font-bold italic">${d.description || '---'}</div>
               </td>
               <td class="px-2 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">${d.category}</td>
               <td class="px-2 py-4 text-[10px] font-black text-slate-900 dark:text-white text-right">₱${(d.amount || 0).toLocaleString()}</td>
               <td class="px-2 py-4">
                  <div class="flex items-center justify-center gap-2">
                     <button class="view-ledger-btn w-7 h-7 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-sm"
                       data-id="${d.id}" title="View Details">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                     </button>
                     <button class="edit-ledger-btn w-7 h-7 bg-[#96588a]/10 text-[#96588a] rounded-lg flex items-center justify-center hover:bg-[#96588a] hover:text-white transition-all shadow-sm" data-id='${JSON.stringify(d).replace(/'/g, "&#39;")}' title="Edit Entry">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                     </button>
                     <button class="delete-ledger-btn w-7 h-7 bg-rose-50 text-rose-500 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all shadow-sm" data-id="${d.id}" title="Delete Entry">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                     </button>
                  </div>
               </td>
            </tr>
            <tr id="ledger-detail-${d.id}" class="ledger-detail-row hidden">
               <td colspan="5" class="px-2 py-3">
                  <div class="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/40 p-4">
                     <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div class="space-y-1">
                           <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Invoice No.</p>
                           <p class="text-[12px] font-black text-slate-900 dark:text-white">${d.invoiceNo || '---'}</p>
                           <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">Receipt</p>
                           <p class="text-[12px] font-bold text-slate-700 dark:text-slate-200">
                              ${d.receiptUrl ? `<a href="${d.receiptUrl}" target="_blank" rel="noreferrer" class="text-[#96588a] hover:underline">Open</a>` : '---'}
                           </p>
                        </div>
                        <div class="sm:text-right">
                           <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</p>
                           <p class="text-[12px] font-black text-slate-900 dark:text-white">${d.status || '---'}</p>
                        </div>
                     </div>
                     <div class="mt-3">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Detail Description</p>
                        <p class="text-[12px] text-slate-700 dark:text-slate-200">${d.description || '---'}</p>
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

            // Close other expanded rows
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
      if (ledgerFrom) ledgerFrom.onchange = () => loadLedgerData();
      if (ledgerTo) ledgerTo.onchange = () => loadLedgerData();
      if (ledgerApply) ledgerApply.onclick = () => loadLedgerData();
      if (ledgerClear) {
         ledgerClear.onclick = () => {
            if (ledgerSearch) ledgerSearch.value = '';
            if (ledgerFrom) ledgerFrom.value = '';
            if (ledgerTo) ledgerTo.value = '';
            loadLedgerData();
         };
      }

      const importBtn = container.querySelector('#import-excel-btn');
      const importFile = container.querySelector('#import-excel-file');
      if (importBtn) importBtn.onclick = () => {
         const activeBranch = document.getElementById('db-branch')?.value;
         if (activeBranch === 'All Branches') { alert('Select a specific branch first.'); return; }
         importFile.click();
      };

      if (importFile) {
         importFile.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            window.showToast('Parsing Excel...', 'info');

            const reader = new FileReader();
            reader.onload = async (ev) => {
               try {
                  const data = new Uint8Array(ev.target.result);
                  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                  const rawData = rows.slice(2).filter(r => r.length > 0 && (r[8] !== undefined || r[2] !== undefined));

                  if (rawData.length === 0) {
                     window.showToast('No valid data found in Excel', 'error');
                     return;
                  }

                  const jsonData = rawData.map(r => {
                     let d = r[0];
                     if (d instanceof Date) d = d.toISOString().split('T')[0];
                     else if (typeof d === 'number') {
                        const dateObj = new Date(Math.round((d - 25569) * 86400 * 1000));
                        d = dateObj.toISOString().split('T')[0];
                     }
                     return {
                        'Date': d || new Date().toISOString().split('T')[0],
                        'Category': r[1] || 'Other',
                        'Purpose': r[2] || 'Imported',
                        'Detail Description': r[3] || '',
                        'Amount': r[8] || 0,
                        'Funded by': r[9] || 'Petty cash'
                     };
                  });

                  const confirmed = await showExcelPreviewModal(jsonData);
                  if (!confirmed) { importFile.value = ''; return; }

                  const batch = writeBatch(db);
                  const activeBranch = document.getElementById('db-branch')?.value;
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
                        createdAt: serverTimestamp()
                     };
                     const newDoc = doc(collection(db, 'expenses'));
                     batch.set(newDoc, expData);
                  });

                  await batch.commit();
                  window.showToast(`Successfully imported ${jsonData.length} records!`, 'success');
                  importFile.value = '';
                  loadLedgerData();
               } catch (err) {
                  console.error('Import Error:', err);
                  window.showToast('Error parsing Excel', 'error');
               }
            };
            reader.readAsArrayBuffer(file);
         };
      }

      const exportBtn = container.querySelector('#export-ledger-btn');
      if (exportBtn) {
         exportBtn.onclick = async () => {
            window.showToast('Preparing Export...', 'info');
            const activeBranch = document.getElementById('db-branch')?.value;
            try {
               let constraints = [orderBy('date', 'desc')];
               if (activeBranch && activeBranch !== 'All Branches') constraints.unshift(where('branchId', '==', activeBranch));

               const snap = await getDocs(query(collection(db, 'expenses'), ...constraints));
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
               XLSX.writeFile(wb, `Ledger_${activeBranch}_${new Date().toISOString().split('T')[0]}.xlsx`);
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
      <div class="space-y-8 animate-fade-in">
         <div class="grid grid-cols-1 xl:grid-cols-5 gap-6 items-stretch">
            <div class="xl:col-span-2 flex flex-col gap-5 h-full">
               <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                     <div class="w-10 h-10 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-md shadow-amber-500/20">
                        <i data-lucide="shield-check" class="w-5 h-5"></i>
                     </div>
                     <div>
                        <h4 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">REVIEW QUEUE</h4>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Pending requests for verification</p>
                     </div>
                  </div>
                  <span id="audit-queue-count" class="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-widest">0 Pending</span>
               </div>
               <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm shadow-slate-900/5 dark:shadow-black/20 overflow-hidden flex-1 min-h-0">
                  <div class="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40">
                     <span class="col-span-5 text-[8px] font-black text-slate-400 uppercase tracking-widest">Request</span>
                     <span class="col-span-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Branch</span>
                     <span class="col-span-4 text-[8px] font-black text-slate-400 uppercase tracking-widest text-right">Total</span>
                  </div>
                  <div id="audit-queue-container" class="h-[560px] overflow-y-auto pr-1">
                     <div class="flex items-center justify-center py-20"><div class="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin"></div></div>
                  </div>
               </div>
            </div>

            <div class="xl:col-span-3 flex flex-col h-full">
               <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                  <div class="flex items-center gap-3">
                     <div class="w-10 h-10 bg-slate-800 rounded-2xl flex items-center justify-center text-white">
                        <i data-lucide="scroll-text" class="w-5 h-5"></i>
                     </div>
                     <div>
                        <h4 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">Audit Trail</h4>
                        <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Full action history</p>
                     </div>
                  </div>
                  <div class="flex items-center gap-2">
                     <input type="text" id="audit-filter-reqid" placeholder="Request ID..." class="bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-[10px] font-bold w-36 focus:ring-2 focus:ring-purple-500">
                     <input type="date" id="audit-filter-date" class="bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-[10px] font-bold focus:ring-2 focus:ring-purple-500 cursor-pointer">
                     <button id="audit-filter-btn" class="px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all">Filter</button>
                     <button id="audit-clear-btn" class="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Clear</button>
                  </div>
               </div>
               <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm shadow-slate-900/5 dark:shadow-black/20 overflow-hidden flex-1 min-h-0">
                  <div class="h-[560px] overflow-auto">
                     <table class="w-full text-left border-collapse">
                        <thead>
                           <tr class="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                              <th class="px-4 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Timestamp</th>
                              <th class="px-4 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                              <th class="px-4 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Actor</th>
                              <th class="px-4 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Request ID</th>
                              <th class="px-4 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Comment</th>
                           </tr>
                        </thead>
                        <tbody id="audit-log-body">
                           <tr><td colspan="5" class="px-4 py-12 text-center text-[10px] text-slate-300 italic">Loading...</td></tr>
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
         </div>

         <!-- History in Audit Tab -->
         <div class="pt-10 border-t border-slate-100 dark:border-slate-800 mt-4">
            <div class="flex items-center justify-between mb-6">
               <div>
                  <h4 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter flex items-center gap-3"><i data-lucide="history" class="w-6 h-6 text-purple-500"></i> Recent History</h4>
                  <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Last 20 processed requests</p>
               </div>
            </div>
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
               <div class="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40">
                  <span class="col-span-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Request ID</span>
                  <span class="col-span-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Period</span>
                  <span class="col-span-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">Branch</span>
                  <span class="col-span-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">Status</span>
                  <span class="col-span-2 text-[8px] font-black text-slate-400 uppercase tracking-widest text-right">Total</span>
               </div>
               <div id="history-list-container" class="divide-y divide-slate-50 dark:divide-slate-800"></div>
            </div>
         </div>
      </div>
      `;
   }

   async function loadAuditData() {
      const auditContent = container.querySelector('#audit-queue-container');
      try {
         let constraints = [where('status', '==', 'pending'), orderBy('createdAt', 'desc')];
         const activeBranch = document.getElementById('db-branch')?.value;
         if (activeBranch && activeBranch !== 'All Branches') constraints.unshift(where('branchId', '==', activeBranch));

         const q = query(collection(db, 'liquidation_requests'), ...constraints);
         const snap = await getDocs(q);
         const pendingDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

         if (pendingDocs.length === 0) {
            const queueCount = container.querySelector('#audit-queue-count');
            if (queueCount) queueCount.textContent = '0 Pending';
            auditContent.innerHTML = `<div class="text-center py-20 text-slate-400 font-black uppercase tracking-widest text-[10px]">Queue is empty</div>`;
            return;
         }

         const queueCount = container.querySelector('#audit-queue-count');
         if (queueCount) queueCount.textContent = `${pendingDocs.length} Pending`;

         auditContent.innerHTML = pendingDocs.map(data => {
            const createdAtMs = data.createdAt?.seconds ? data.createdAt.seconds * 1000 : 0;
            const isNew = createdAtMs && (Date.now() - createdAtMs) < (15 * 60 * 1000);
            return `
            <div class="view-detail-btn group border-b border-slate-100 dark:border-slate-800 hover:bg-amber-50/50 dark:hover:bg-amber-500/5 transition-all cursor-pointer px-4 py-3" data-id="${data.id}">
               <div class="grid grid-cols-12 gap-2 items-start">
                  <div class="col-span-8">
                     <div class="flex items-center gap-2 mb-1">
                        <h4 class="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">REQ-${data.id.substring(0, 6).toUpperCase()}</h4>
                        ${isNew ? '<span class="px-2 py-0.5 rounded-md bg-amber-400 text-white text-[8px] font-black uppercase tracking-wider animate-[pulse_2s_ease-in-out_2]">New</span>' : '<span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 text-[8px] font-black uppercase tracking-wider">Pending</span>'}
                     </div>
                     <p class="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Items: <span class="text-slate-700 dark:text-slate-300">${data.itemCount}</span> • Period: <span class="text-slate-700 dark:text-slate-300">${data.startDate ? data.startDate.split('-').reverse().join('/') : '---'} to ${data.endDate ? data.endDate.split('-').reverse().join('/') : '---'}</span></p>
                     <p class="text-[9px] text-slate-400 mt-1">${data.createdBy || 'jimmiemetapon@gmail.com'} • ${data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '---'}</p>
                  </div>
                  <div class="col-span-4 text-right">
                     <span class="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-slate-900 text-white mb-2">${data.branchId}</span>
                     <p class="text-[8px] font-black text-amber-600 uppercase tracking-widest">Total</p>
                     <p class="text-sm font-black text-slate-900 dark:text-white">₱${data.totalAmount.toLocaleString()}</p>
                  </div>
               </div>
            </div>
         `;
         }).join('');

         auditContent.querySelectorAll('.view-detail-btn').forEach(btn => {
            btn.onclick = () => {
               const req = pendingDocs.find(d => d.id === btn.dataset.id);
               showLiquidationDetailModal(req, () => loadTabContent('audit'));
            };
         });
         if (window.lucide) window.lucide.createIcons();
      } catch (err) { console.error(err); }
   }

   function formatDateDDMMYYYY(value) {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      return d.toLocaleDateString('en-GB');
   }

   async function exportApprovedRequestTemplate(reqData, approvedRows) {
      const res = await fetch(APPROVAL_TEMPLATE_URL);
      if (!res.ok) throw new Error('Template file not found');
      const fileData = await res.arrayBuffer();
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

      const filename = `Liquidation_${(reqData.branchId || 'Branch').replace(/\s+/g, '_')}_${reqData.id.substring(0, 8).toUpperCase()}_${new Date().toISOString().split('T')[0]}.xlsx`;
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

   async function loadAuditLogData(filters = {}) {
      const logBody = container.querySelector('#audit-log-body');
      if (!logBody) return;

      try {
         let constraints = [orderBy('timestamp', 'desc'), limit(50)];
         const activeBranch = document.getElementById('db-branch')?.value;
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
               const logDate = new Date(l.timestamp.seconds * 1000).toISOString().split('T')[0];
               return logDate === filters.date;
            });
         }

         if (logs.length === 0) {
            logBody.innerHTML = '<tr><td colspan="5" class="px-4 py-12 text-center text-[10px] text-slate-300 font-black uppercase">No audit logs found</td></tr>';
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
               <tr class="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all">
                  <td class="px-4 py-3 text-[10px] font-bold text-slate-500 whitespace-nowrap">${ts}</td>
                  <td class="px-4 py-3">${actionBadge(log.action)}</td>
                  <td class="px-4 py-3 text-[10px] font-bold text-slate-600 dark:text-slate-300">${log.actor || '---'}</td>
                  <td class="px-4 py-3"><span class="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">${log.requestId ? log.requestId.substring(0, 8).toUpperCase() : '---'}</span></td>
                  <td class="px-4 py-3 text-[10px] font-medium text-slate-500 max-w-[250px] truncate">${log.comment || '---'}</td>
               </tr>
            `;
         }).join('');
      } catch (err) { console.error('Audit log error:', err); }
   }

   function attachAuditLogListeners() {
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
      // Main Tab Switcher
      const tabBtn = e.target.closest('.expense-tab');
      if (tabBtn && !tabBtn.classList.contains('active')) {
         container.querySelectorAll('.expense-tab').forEach(b => {
            b.classList.remove('bg-[#96588a]', 'text-white', 'shadow-lg', 'shadow-[#96588a]/20', 'active');
            b.classList.add('text-slate-400');
         });
         tabBtn.classList.remove('text-slate-400');
         tabBtn.classList.add('bg-[#96588a]', 'text-white', 'shadow-lg', 'shadow-[#96588a]/20', 'active');
         loadTabContent(tabBtn.dataset.tab);
         return;
      }

      // Ledger Sub-tab Switcher
      const subBtn = e.target.closest('.ledger-subtab');
      if (subBtn && !subBtn.classList.contains('active')) {
         const targetId = subBtn.dataset.target;
         // Toggle Buttons
         container.querySelectorAll('.ledger-subtab').forEach(b => {
            b.classList.remove('active', 'bg-white', 'dark:bg-slate-900', 'shadow-sm', 'text-slate-800', 'dark:text-white');
            b.classList.add('text-slate-400', 'hover:text-slate-600');
         });
         subBtn.classList.add('active', 'bg-white', 'dark:bg-slate-900', 'shadow-sm', 'text-slate-800', 'dark:text-white');
         subBtn.classList.remove('text-slate-400', 'hover:text-slate-600');

         // Toggle Views
         container.querySelectorAll('.ledger-view').forEach(v => v.classList.add('hidden'));
         container.querySelector(`#${targetId}`).classList.remove('hidden');
      }
   });

   // Global Refresh Handler
   setTimeout(() => {
      const refreshBtn = document.getElementById('db-refresh');
      if (refreshBtn) {
         refreshBtn.onclick = async () => {
            const activeTab = container.querySelector('.expense-tab.active')?.dataset.tab || 'cashier';
            loadTabContent(activeTab);
         };
      }
   }, 100);

   // Removed buggy global event listener for open-liquidation-detail

   await loadMasterData();
   // Initial load happens at the very end


   // UI Helpers moved to main.js


   function showExcelPreviewModal(data, onConfirm) {
      return new Promise(res => {
         const ov = document.createElement('div');
         ov.className = 'fixed inset-0 bg-transparent z-[10001] flex items-center justify-center p-4 animate-fade-in';

         const total = data.reduce((sum, r) => sum + (parseFloat(r.Amount || 0)), 0);

         ov.innerHTML = `
         <div class="bg-white/95 dark:bg-slate-900/95 p-8 rounded-[2.5rem] max-w-4xl w-full max-h-[85vh] flex flex-col space-y-6 animate-scale-up shadow-2xl border border-slate-200 dark:border-slate-700/80">
            <div class="flex items-center justify-between">
               <div>
                  <h3 class="text-2xl font-black uppercase tracking-tighter">Import Preview</h3>
                  <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Verify ${data.length} records before importing</p>
               </div>
               <div class="text-right">
                  <p class="text-[10px] font-black text-slate-400 uppercase">Total Amount</p>
                  <p class="text-2xl font-black text-emerald-500">₱${total.toLocaleString()}</p>
               </div>
            </div>

            <div class="flex-1 overflow-y-auto pr-2 custom-scrollbar border-y border-slate-50 dark:border-slate-800">
               <table class="w-full text-left border-collapse">
                  <thead class="sticky top-0 bg-white dark:bg-slate-900 z-10">
                     <tr class="border-b border-slate-50 dark:border-slate-800">
                        <th class="py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                        <th class="py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                        <th class="py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Purpose</th>
                        <th class="py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                        <th class="py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Funded By</th>
                     </tr>
                  </thead>
                  <tbody>
                     ${data.slice(0, 100).map(r => `
                        <tr class="border-b border-slate-50 dark:border-slate-800">
                           <td class="py-3 text-[10px] font-bold text-slate-500">${r.Date || '---'}</td>
                           <td class="py-3 text-[10px] font-black text-slate-800 dark:text-white uppercase">${r.Category || '---'}</td>
                           <td class="py-3 text-[10px] font-medium text-slate-500 truncate max-w-[200px]">${r.Purpose || '---'}</td>
                           <td class="py-3 text-[10px] font-black text-right">₱${(parseFloat(r.Amount || 0)).toLocaleString()}</td>
                           <td class="py-3 text-center">
                              <span class="px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${(r['Funded by'] || '').toLowerCase().includes('petty') ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}">
                                 ${r['Funded by'] || '---'}
                              </span>
                           </td>
                        </tr>
                     `).join('')}
                     ${data.length > 100 ? `<tr><td colspan="5" class="py-4 text-center text-[10px] font-bold text-slate-400 italic">... and ${data.length - 100} more rows</td></tr>` : ''}
                  </tbody>
               </table>
            </div>

            <div class="flex gap-4">
               <button id="p-cancel" class="flex-1 py-4 border-2 border-slate-100 dark:border-slate-800 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all">Cancel</button>
               <button id="p-confirm" class="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl">Confirm Import</button>
            </div>
         </div>
      `;
         document.body.appendChild(ov);
         ov.querySelector('#p-cancel').onclick = () => { ov.remove(); res(false); };
         ov.querySelector('#p-confirm').onclick = () => { ov.remove(); res(true); };
      });
   }

   function showPromptModal(title, body) {
      return new Promise(res => {
         const ov = document.createElement('div');
         ov.className = 'fixed inset-0 bg-transparent z-[10001] flex items-center justify-center p-4 animate-fade-in';
         ov.innerHTML = `<div class="bg-white/95 dark:bg-slate-900/95 p-8 rounded-[2.5rem] max-w-sm w-full space-y-6 animate-scale-up shadow-2xl border border-slate-200 dark:border-slate-700/80"><h3 class="text-xl font-black uppercase text-center dark:text-white">${title}</h3><p class="text-slate-500 text-sm font-bold uppercase text-center">${body}</p><textarea id="p-input" class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl p-4 text-xs font-bold dark:text-white" rows="3"></textarea><div class="flex gap-3"><button id="p-no" class="flex-1 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black uppercase dark:text-slate-200">Cancel</button><button id="p-yes" class="flex-1 py-3 bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-widest">Flag Item</button></div></div>`;
         document.body.appendChild(ov);
         ov.querySelector('#p-no').onclick = () => { ov.remove(); res(null); };
         ov.querySelector('#p-yes').onclick = () => { const v = ov.querySelector('#p-input').value; ov.remove(); res(v); };
      });
   }

   // Global functions for separate scopes
   async function loadCashierData() {
      const contentArea = container.querySelector('#expense-content');
      const listContainer = contentArea?.querySelector('#cashier-items-list');
      const batchTotalEl = contentArea?.querySelector('#batch-total');
      if (!listContainer) return;
      const currentBranch = document.getElementById('db-branch')?.value || 'Pioneer Center';

      try {
         const q = query(collection(db, 'expenses'),
            where('branchId', '==', currentBranch),
            where('status', 'in', ['pending', 'requested']),
            orderBy('createdAt', 'desc')
         );
         const snap = await getDocs(q);
         const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

         if (items.length === 0) {
            listContainer.innerHTML = `<div class="text-center py-12 text-slate-300 text-[10px] font-black uppercase">Empty Batch</div>`;
            if (batchTotalEl) batchTotalEl.innerText = '₱0.00';
         } else {
            const pendingTotal = items.filter(i => i.status === 'pending').reduce((acc, i) => acc + (i.amount || 0), 0);
            if (batchTotalEl) batchTotalEl.innerText = '₱' + pendingTotal.toLocaleString();

            const batchResubmitFiles = {};

            listContainer.innerHTML = items.map(item => `
            <div class="batch-item-wrapper group border-b border-slate-100 dark:border-slate-800 last:border-0" data-id="${item.id}">
               <!-- Item Header (Trigger) -->
               <div class="batch-item-header flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all rounded-xl">
                  <div class="flex items-center gap-3">
                     <div class="w-8 h-8 rounded-lg bg-[#96588a]/10 flex items-center justify-center text-[#96588a]">
                        <i data-lucide="receipt" class="w-4 h-4"></i>
                     </div>
                     <div>
                        <p class="text-[10px] font-black text-slate-800 dark:text-white uppercase truncate max-w-[150px]">${item.purpose}</p>
                        <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">${item.status === 'requested' ? 'Awaiting Audit' : item.date}${item.invoiceNo ? ` • ${item.invoiceNo}` : ''}</p>
                     </div>
                  </div>
                  <div class="flex items-center gap-4">
                     <div class="text-right">
                        <p class="text-xs font-black">₱${(item.amount || 0).toLocaleString()}</p>
                        ${item.auditorNote ? `<p class="text-[7px] font-black text-rose-500 uppercase tracking-tighter">Needs Correction</p>` : ''}
                     </div>
                     <i data-lucide="chevron-down" class="w-4 h-4 text-slate-300 transition-transform group-[.is-expanded]:rotate-180"></i>
                  </div>
               </div>

               <!-- Item Drawer (Expandable) -->
               <div class="batch-item-drawer overflow-hidden max-h-0 transition-all duration-300 ease-in-out">
                  <div class="px-4 pb-5 pt-2 space-y-4">
                     ${item.auditorNote ? `
                     <div class="p-3 bg-rose-50 dark:bg-rose-500/10 rounded-xl border border-rose-100 dark:border-rose-500/20 mb-3">
                        <p class="text-[9px] font-bold text-rose-600 uppercase flex items-center gap-2">
                           <i data-lucide="info" class="w-3 h-3"></i> Auditor: ${item.auditorNote}
                        </p>
                     </div>
                     ` : ''}

                     <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1">
                           <label class="text-[8px] font-black text-slate-400 uppercase ml-1">Amount</label>
                           <input type="number" step="0.01" class="edit-batch-amount w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-xs font-black" value="${item.amount}" ${item.status === 'requested' ? 'disabled' : ''}>
                        </div>
                        <div class="space-y-1">
                           <label class="text-[8px] font-black text-slate-400 uppercase ml-1">Purpose</label>
                           <input type="text" class="edit-batch-purpose w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-xs font-black" value="${item.purpose}" ${item.status === 'requested' ? 'disabled' : ''}>
                        </div>
                        <div class="space-y-1 col-span-2">
                           <label class="text-[8px] font-black text-slate-400 uppercase ml-1">Invoice No.</label>
                           <input type="text" class="edit-batch-invoice w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-xs font-black uppercase" value="${item.invoiceNo || ''}" placeholder="INV-..." ${item.status === 'requested' ? 'disabled' : ''}>
                        </div>
                     </div>

                     ${item.status === 'pending' ? `
                     <div class="flex items-center gap-2">
                        <input type="file" class="edit-batch-file hidden" accept="image/*" data-id="${item.id}">
                        <button class="edit-batch-file-btn flex-1 py-2.5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-[9px] font-black uppercase text-slate-400 hover:border-purple-300 hover:text-[#96588a] transition-all flex items-center justify-center gap-2">
                           <i data-lucide="camera" class="w-3 h-3"></i> Change Receipt
                        </button>
                        <button class="delete-batch-item w-10 h-10 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all shadow-sm" data-id="${item.id}" title="Delete Item">
                           <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                     </div>
                     <p class="batch-file-name hidden text-[8px] text-[#96588a] font-bold text-center truncate mt-1"></p>
                     
                     <button class="save-batch-item w-full py-3 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg" data-id="${item.id}">
                        Save Changes
                     </button>
                     ` : `
                     <p class="text-[9px] font-black text-slate-400 uppercase text-center py-2 italic">Awaiting auditor review — editing locked</p>
                     `}
                  </div>
               </div>
            </div>
         `).join('');

            // Attach Listeners
            listContainer.querySelectorAll('.batch-item-wrapper').forEach(wrapper => {
               const header = wrapper.querySelector('.batch-item-header');
               const drawer = wrapper.querySelector('.batch-item-drawer');
               const itemId = wrapper.dataset.id;

               header.onclick = () => {
                  const isExp = wrapper.classList.contains('is-expanded');
                  // Close others
                  listContainer.querySelectorAll('.batch-item-wrapper').forEach(w => {
                     w.classList.remove('is-expanded');
                     w.querySelector('.batch-item-drawer').style.maxHeight = '0';
                  });
                  if (!isExp) {
                     wrapper.classList.add('is-expanded');
                     drawer.style.maxHeight = drawer.scrollHeight + 'px';
                  }
               };

               // File selection
               const fileBtn = wrapper.querySelector('.edit-batch-file-btn');
               const fileInput = wrapper.querySelector('.edit-batch-file');
               const fileName = wrapper.querySelector('.batch-file-name');
               if (fileBtn) {
                  fileBtn.onclick = (e) => { e.stopPropagation(); fileInput.click(); };
                  fileInput.onchange = (e) => {
                     const file = e.target.files[0];
                     if (file) {
                        batchResubmitFiles[itemId] = file;
                        fileName.textContent = `New: ${file.name}`;
                        fileName.classList.remove('hidden');
                        fileBtn.classList.add('border-purple-300', 'text-[#96588a]');
                     }
                  };
               }

               // Save changes
               const saveBtn = wrapper.querySelector('.save-batch-item');
               if (saveBtn) {
                  saveBtn.onclick = async (e) => {
                     e.stopPropagation();
                     const amt = parseFloat(wrapper.querySelector('.edit-batch-amount').value);
                     const pur = wrapper.querySelector('.edit-batch-purpose').value;
                     const invoiceNo = wrapper.querySelector('.edit-batch-invoice')?.value?.trim()?.toUpperCase() || '';
                     if (!amt || amt <= 0) { window.showToast('Invalid amount', 'error'); return; }

                     saveBtn.disabled = true;
                     saveBtn.innerHTML = `<div class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>`;

                     try {
                        const updateData = { amount: amt, purpose: pur, invoiceNo, auditorNote: null };
                        if (batchResubmitFiles[itemId]) {
                           const file = batchResubmitFiles[itemId];
                           const fileRef = ref(storage, `expenses_receipts/${Date.now()}_${file.name}`);
                           const uploadSnap = await uploadBytes(fileRef, file);
                           updateData.receiptUrl = await getDownloadURL(uploadSnap.ref);
                        }
                        await updateDoc(doc(db, 'expenses', itemId), updateData);
                        window.showToast('Item updated', 'success');
                        loadCashierData();
                     } catch (err) {
                        console.error(err);
                        window.showToast('Update failed', 'error');
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Save Changes';
                     }
                  };
               }

               // Delete item
               const delBtn = wrapper.querySelector('.delete-batch-item');
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

   async function loadHistoryData() {
      const historyContent = document.getElementById('history-list-container');
      const activeBranch = document.getElementById('db-branch')?.value;
      if (!historyContent) return;

      try {
         let constraints = [where('status', 'in', ['pending', 'approved', 'rejected', 'partially_rejected', 'cancelled']), orderBy('createdAt', 'desc'), limit(20)];
         if (activeBranch && activeBranch !== 'All Branches') constraints.unshift(where('branchId', '==', activeBranch));

         const q = query(collection(db, 'liquidation_requests'), ...constraints);
         const snap = await getDocs(q);
         const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

         if (docs.length === 0) {
            historyContent.innerHTML = `<div class="px-4 py-10 text-center text-slate-300 text-[10px] font-black uppercase">No records found</div>`;
            return;
         }

         historyContent.innerHTML = docs.map(data => {
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
            <div class="history-row ${isClickable ? 'history-detail-btn cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : 'cursor-default'} transition-all" data-id="${data.id}">
               <div class="grid grid-cols-12 gap-2 items-center px-4 py-3">
                  <div class="col-span-3">
                     <p class="text-[10px] font-black text-slate-800 dark:text-white uppercase">REQ-${data.id.substring(0, 6).toUpperCase()}</p>
                     <p class="text-[8px] text-slate-400 font-bold mt-0.5">${dateStr}</p>
                  </div>
                  <div class="col-span-3">
                     <p class="text-[9px] font-bold text-slate-600 dark:text-slate-300">${period}</p>
                     <p class="text-[8px] text-slate-400 font-bold mt-0.5">${data.itemCount || 0} items</p>
                  </div>
                  <div class="col-span-2">
                     <span class="px-2 py-0.5 rounded-md bg-slate-900 dark:bg-slate-700 text-white text-[8px] font-black uppercase">${data.branchId || '---'}</span>
                  </div>
                  <div class="col-span-2">
                     <span class="px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${badgeCls}">${statusLabel}</span>
                  </div>
                  <div class="col-span-2 text-right">
                     <p class="text-[11px] font-black text-slate-900 dark:text-white">₱${(data.totalAmount || 0).toLocaleString()}</p>
                     ${isClickable ? `<p class="text-[8px] text-[#96588a] font-black uppercase mt-0.5">View →</p>` : ''}
                  </div>
               </div>
            </div>
         `}).join('');

         historyContent.querySelectorAll('.history-detail-btn').forEach(btn => {
            btn.onclick = () => {
               const reqData = docs.find(d => d.id === btn.dataset.id);
               if (reqData) {
                  const activeTab = container.querySelector('.expense-tab.active')?.dataset.tab || 'cashier';
                  showLiquidationDetailModal(reqData, () => loadTabContent(activeTab));
               }
            };
         });
      } catch (err) { console.error(err); }
   }



   async function showEditLedgerModal(item) {
      const ov = document.createElement('div');
      ov.className = 'fixed inset-0 bg-transparent z-[10001] flex items-center justify-center p-4 animate-fade-in';
      ov.innerHTML = `
         <div class="bg-white/95 dark:bg-slate-900/95 p-8 rounded-[2.5rem] max-w-md w-full space-y-6 animate-scale-up shadow-2xl border border-slate-200 dark:border-slate-700/80">
            <div class="flex items-center justify-between">
               <h3 class="text-xl font-black uppercase tracking-tighter">Edit Transaction</h3>
               <button id="close-edit-modal" class="text-slate-400 hover:text-slate-600 transition-colors"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            
            <div class="space-y-4">
               <div class="space-y-1">
                  <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Date</label>
                  <input type="date" id="edit-date" class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold" value="${item.date}">
               </div>
               <div class="space-y-1">
                  <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Purpose</label>
                  <input type="text" id="edit-purpose" class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold" value="${item.purpose || ''}">
               </div>
               <div class="space-y-1">
                  <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount</label>
                  <input type="number" id="edit-amount" class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold" value="${item.amount}">
               </div>
               <div class="space-y-1">
                  <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                  <select id="edit-category" class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold">
                     ${categories.map(c => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`).join('')}
                  </select>
               </div>
            </div>

            <button id="save-edit-btn" class="w-full py-4 bg-[#96588a] text-white rounded-xl font-black uppercase tracking-[0.2em] text-[10px] transition-all shadow-lg hover:shadow-[#96588a]/30">
               Save Changes
            </button>
         </div>
      `;
      document.body.appendChild(ov);
      if (window.lucide) window.lucide.createIcons();

      ov.querySelector('#close-edit-modal').onclick = () => ov.remove();

      ov.querySelector('#save-edit-btn').onclick = async () => {
         const btn = ov.querySelector('#save-edit-btn');
         const date = ov.querySelector('#edit-date').value;
         const purpose = ov.querySelector('#edit-purpose').value;
         const amount = parseFloat(ov.querySelector('#edit-amount').value);
         const category = ov.querySelector('#edit-category').value;

         if (!date || isNaN(amount)) { window.showToast('Please fill required fields', 'error'); return; }

         btn.disabled = true;
         btn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>`;

         try {
            await updateDoc(doc(db, 'expenses', item.id), {
               date, purpose, amount: amount, category
            });
            window.showToast('Transaction updated', 'success');
            ov.remove();
            loadLedgerData();
         } catch (err) {
            console.error(err);
            window.showToast('Update failed', 'error');
            btn.disabled = false;
            btn.textContent = 'Save Changes';
         }
      };
   }

   // Initialize Page
   setTimeout(() => loadTabContent('cashier'), 0);

   return container;
}
