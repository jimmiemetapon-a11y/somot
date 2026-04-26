const BRANCHES = ['All Branches', 'Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf'];

export function renderHeader(title, subtitle, onToggleDark) {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today    = now.toISOString().split('T')[0];

  const header = document.createElement('header');
  header.className = 'sticky top-0 z-50 w-full backdrop-blur-md bg-white/75 dark:bg-slate-900/75 border-b border-slate-200/60 dark:border-slate-800/60 px-8 py-3 flex items-center justify-between transition-all duration-300';
  header.innerHTML = `
    <!-- Left: Filters (Moved from Dashboard) -->
    <div class="flex items-center gap-4">
      <div class="flex flex-col">
        <h1 class="text-sm font-extrabold text-slate-800 dark:text-white tracking-tight">${title}</h1>
        <p class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">${subtitle}</p>
      </div>
      
      <div class="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-2"></div>
      
      <div class="flex items-center gap-2">
        <select id="db-branch" class="pl-3 pr-8 py-1.5 rounded-lg text-xs font-bold bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 outline-none cursor-pointer hover:border-emerald-500 transition-colors appearance-none" style="background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E'); background-repeat: no-repeat; background-position: right 0.75rem center;">
          ${BRANCHES.map(b => `<option value="${b}">${b}</option>`).join('')}
        </select>
        
        <div class="flex items-center bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden group hover:border-emerald-500 transition-colors">
          <input type="date" id="db-from" value="${firstDay}" class="pl-3 pr-1 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-transparent outline-none cursor-pointer"/>
          <span class="text-slate-300 px-0.5">→</span>
          <input type="date" id="db-to" value="${today}" class="pl-1 pr-3 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-transparent outline-none cursor-pointer"/>
        </div>
        
        <button id="db-refresh" class="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all active:scale-95">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
        </button>
      </div>
    </div>

    <!-- Right: Profile & Theme -->
    <div class="flex items-center gap-4">
      <button id="dark-btn" class="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
        <svg id="icon-moon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </button>

      <div class="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>

      <div class="flex items-center gap-3 cursor-pointer group p-1 pr-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-emerald-400 flex items-center justify-center text-white text-xs font-black shadow-sm">
          AD
        </div>
        <div class="hidden sm:block">
          <p class="text-[11px] font-extrabold text-slate-700 dark:text-slate-200 leading-none">Admin User</p>
          <p class="text-[9px] text-slate-400 mt-1 uppercase font-bold tracking-tighter">Manager</p>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    document.getElementById('dark-btn')?.addEventListener('click', () => {
      onToggleDark();
    });
  }, 0);

  return header;
}
