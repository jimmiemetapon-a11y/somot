export function showExcelPreviewModal(data, onConfirm) {
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
                     <th class="py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Supplier</th>
                     <th class="py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                     <th class="py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Funded By</th>
                  </tr>
               </thead>
               <tbody>
                  ${data.slice(0, 100).map(r => `
                     <tr class="border-b border-slate-50 dark:border-slate-800">
                        <td class="py-3 text-[10px] font-bold text-slate-500">${r.Date || '---'}</td>
                        <td class="py-3 text-[10px] font-black text-slate-800 dark:text-white uppercase">${r.Category || '---'}</td>
                        <td class="py-3 text-[10px] font-medium text-slate-500 truncate max-w-[200px]">${r.Purpose || r.Supplier || '---'}</td>
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

export function showPromptModal(title, body) {
   return new Promise(res => {
      const ov = document.createElement('div');
      ov.className = 'fixed inset-0 bg-transparent z-[10001] flex items-center justify-center p-4 animate-fade-in';
      ov.innerHTML = `<div class="bg-white/95 dark:bg-slate-900/95 p-8 rounded-[2.5rem] max-w-sm w-full space-y-6 animate-scale-up shadow-2xl border border-slate-200 dark:border-slate-700/80"><h3 class="text-xl font-black uppercase text-center dark:text-white">${title}</h3><p class="text-slate-500 text-sm font-bold uppercase text-center">${body}</p><textarea id="p-input" class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl p-4 text-xs font-bold dark:text-white" rows="3"></textarea><div class="flex gap-3"><button id="p-no" class="flex-1 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black uppercase dark:text-slate-200">Cancel</button><button id="p-yes" class="flex-1 py-3 bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-widest">Flag Item</button></div></div>`;
      document.body.appendChild(ov);
      ov.querySelector('#p-no').onclick = () => { ov.remove(); res(null); };
      ov.querySelector('#p-yes').onclick = () => { const v = ov.querySelector('#p-input').value; ov.remove(); res(v); };
   });
}
