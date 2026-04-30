const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/Expenses.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace audit card HTML: add Details button + view-detail-btn listener
const OLD = `         auditContent.innerHTML = pendingDocs.map(data => \`
             <div class="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div class="space-y-1">
                   <div class="flex items-center gap-2">
                      <span class="px-3 py-1 bg-purple-500/10 text-purple-500 rounded-full text-[10px] font-black uppercase tracking-widest">\${data.branchId}</span>
                      <span class="text-[10px] text-slate-400 font-bold">\${data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : 'Just now'}</span>
                   </div>
                   <h4 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">₱\${data.totalAmount.toLocaleString()}</h4>
                   <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">\${data.itemCount} pending items to be liquidated</p>
                </div>
                <div class="flex items-center gap-3">
                   <button data-id="\${data.id}" class="approve-liq px-8 py-3 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all">Approve</button>
                   <button data-id="\${data.id}" class="reject-liq px-8 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 transition-all">Reject</button>
                </div>
             </div>
          \`).join('');`;

const NEW = `         auditContent.innerHTML = pendingDocs.map(data => \`
             <div class="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 hover:shadow-lg transition-all">
                <div class="space-y-1 flex-1">
                   <div class="flex items-center gap-2">
                      <span class="px-3 py-1 bg-purple-500/10 text-purple-500 rounded-full text-[10px] font-black uppercase tracking-widest">\${data.branchId}</span>
                      <span class="text-[10px] text-slate-400 font-bold">\${data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : 'Just now'}</span>
                   </div>
                   <h4 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">₱\${data.totalAmount.toLocaleString()}</h4>
                   <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">\${data.itemCount} items · Click to view receipts & details</p>
                </div>
                <div class="flex items-center gap-2 flex-wrap justify-end">
                   <button data-id="\${data.id}" class="view-detail-btn px-5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-500/10 hover:text-purple-600 transition-all flex items-center gap-2"><i data-lucide="eye" class="w-3.5 h-3.5"></i> Details</button>
                   <button data-id="\${data.id}" class="approve-liq px-8 py-3 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all">Approve</button>
                   <button data-id="\${data.id}" class="reject-liq px-8 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 transition-all">Reject</button>
                </div>
             </div>
          \`).join('');

         // View Details listener
         auditContent.querySelectorAll('.view-detail-btn').forEach(btn => {
            btn.onclick = (e) => {
               e.stopPropagation();
               const id = btn.dataset.id;
               const reqData = pendingDocs.find(d => d.id === id);
               if (reqData) showLiquidationDetailModal(reqData, loadAuditData);
            };
         });`;

// Normalize line endings for comparison
const contentNorm = content.replace(/\r\n/g, '\n');
const oldNorm = OLD.replace(/\r\n/g, '\n');

if (contentNorm.includes(oldNorm)) {
  const patched = contentNorm.replace(oldNorm, NEW.replace(/\r\n/g, '\n'));
  fs.writeFileSync(filePath, patched.replace(/\n/g, '\r\n'), 'utf8');
  console.log('SUCCESS: Audit card patched!');
} else {
  console.log('FAIL: Target block not found in file.');
  // Find partial match for debug
  const lines = oldNorm.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!contentNorm.includes(lines[i]) && lines[i].trim()) {
      console.log('First missing line:', JSON.stringify(lines[i]));
      break;
    }
  }
}
