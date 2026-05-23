import logoImg from '../assets/logo-so-mot-new-01.png';

const IC = {
  dash: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  dinein: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h1v2"/><path d="M21 22v-3"/></svg>`,
  grab: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`,
  panda: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 11h.01"/><path d="M11 15h.01"/><path d="M16 16h.01"/><path d="m2 16 20 6-6-20A20 20 0 0 0 2 16"/><path d="M5.71 17.11a17.04 17.04 0 0 1 11.4-11.4"/></svg>`,
  online: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  expenses: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17V7"/></svg>`,
  analytics: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  opex: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  pnl: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
  settings: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  admin: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`
};


export function renderSidebar(activeTab, onNavigate, isCollapsed, onToggle, user = null) {
  const DEFAULT_TABS = ['dashboard', 'dinein', 'grabfood', 'foodpanda', 'online', 'expenses', 'pantry_analysis', 'opex', 'pnl', 'settings'];
  const allowedTabs = user?.permissions?.allowedTabs || DEFAULT_TABS;
  const isAdmin = user?.permissions?.isAdmin === true || ['jimmie.somot@gmail.com'].includes(user?.email);

  const sidebar = document.createElement('aside');
  sidebar.className = `sidebar ${isCollapsed ? 'collapsed' : ''}`;
  sidebar.innerHTML = `
    <!-- Logo Header Area -->
    <div class="flex items-center justify-center h-[70px] border-b border-slate-100 dark:border-white/5 overflow-hidden shrink-0">
      <img src="${logoImg}" class="object-contain transition-all duration-300 ${isCollapsed ? 'h-7 w-auto max-w-[40px]' : 'h-11 w-auto max-w-[180px]'}" alt="App Logo" />
    </div>

    <!-- Nav -->
    <nav class="flex-1 pl-0 pr-2 py-10 space-y-1 overflow-y-auto scrollbar-hide nav-scroll-mask">
      ${allowedTabs.includes('dashboard') ? `
      <div class="nav-item ${activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard" title="Dashboard">
        <span class="icon-box">${IC.dash}</span> <span class="nav-text font-bold transition-opacity duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}">Dashboard</span>
      </div>
      ` : ''}

      ${allowedTabs.includes('dinein') ? `
      <div class="nav-item ${activeTab === 'dinein' ? 'active' : ''}" data-tab="dinein" title="Dine In">
        <span class="icon-box">${IC.dinein}</span> <span class="nav-text transition-opacity duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}">Dine In</span>
      </div>
      ` : ''}
      
      ${allowedTabs.includes('grabfood') ? `
      <div class="nav-item ${activeTab === 'grabfood' ? 'active' : ''}" data-tab="grabfood" title="GrabFood">
        <span class="icon-box">${IC.grab}</span> <span class="nav-text transition-opacity duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}">GrabFood</span>
      </div>
      ` : ''}
      
      ${allowedTabs.includes('foodpanda') ? `
      <div class="nav-item ${activeTab === 'foodpanda' ? 'active' : ''}" data-tab="foodpanda" title="FoodPanda">
        <span class="icon-box">${IC.panda}</span> <span class="nav-text transition-opacity duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}">FoodPanda</span>
      </div>
      ` : ''}
      
      ${allowedTabs.includes('online') ? `
      <div class="nav-item ${activeTab === 'online' ? 'active' : ''}" data-tab="online" title="Online Order">
        <span class="icon-box">${IC.online}</span> <span class="nav-text transition-opacity duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}">Online Order</span>
      </div>
      ` : ''}

      ${(allowedTabs.some(t => ['dashboard', 'dinein', 'grabfood', 'foodpanda', 'online'].includes(t)) && 
         (allowedTabs.some(t => ['expenses', 'pantry_analysis', 'opex', 'pnl', 'settings'].includes(t)) || allowedTabs.some(t => t.startsWith('expenses/')) || isAdmin)) ? `
        <div class="pt-4 opacity-20"><div class="border-t border-slate-400"></div></div>
      ` : ''}

      ${(allowedTabs.includes('expenses') || allowedTabs.some(t => t.startsWith('expenses/'))) ? `
      <div class="nav-item ${activeTab === 'expenses' ? 'active' : ''}" data-tab="expenses" title="Expenses">
        <span class="icon-box">${IC.expenses}</span> <span class="nav-text transition-opacity duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}">Expenses</span>
      </div>
      ` : ''}
      
      ${allowedTabs.includes('pantry_analysis') ? `
      <div class="nav-item ${activeTab === 'pantry_analysis' ? 'active' : ''}" data-tab="pantry_analysis" title="Pantry Analysis">
        <span class="icon-box">${IC.analytics}</span> <span class="nav-text transition-opacity duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}">Pantry Analysis</span>
      </div>
      ` : ''}
      
      ${allowedTabs.includes('opex') ? `
      <div class="nav-item ${activeTab === 'opex' ? 'active' : ''}" data-tab="opex" title="Operating Expenses">
        <span class="icon-box">${IC.opex}</span> <span class="nav-text transition-opacity duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}">OPEX</span>
      </div>
      ` : ''}
      
      ${allowedTabs.includes('pnl') ? `
      <div class="nav-item ${activeTab === 'pnl' ? 'active' : ''}" data-tab="pnl" title="P&L Statement">
        <span class="icon-box">${IC.pnl}</span> <span class="nav-text transition-opacity duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}">P&L</span>
      </div>
      ` : ''}

      ${allowedTabs.includes('settings') ? `
      <div class="nav-item ${activeTab === 'settings' ? 'active' : ''}" data-tab="settings" title="Settings">
        <span class="icon-box">${IC.settings}</span> <span class="nav-text transition-opacity duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}">Settings</span>
      </div>
      ` : ''}

      ${isAdmin ? `
      <div class="nav-item ${activeTab === 'admin' ? 'active' : ''}" data-tab="admin" title="Admin Panel">
        <span class="icon-box">${IC.admin}</span> <span class="nav-text transition-opacity duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}">Admin Panel</span>
      </div>
      ` : ''}
    </nav>

    <!-- Footer -->
    <div class="px-6 py-6 mt-auto sidebar-footer overflow-hidden transition-all duration-300">
      <div class="flex items-center gap-2.5">
        <div class="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse shrink-0"></div>
        <span class="text-[11px] text-slate-400 dark:text-purple-300/40 font-bold uppercase tracking-widest transition-all duration-300 ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}">Live Sync</span>
      </div>
    </div>
  `;

  sidebar.querySelectorAll('.nav-item').forEach(el => {
    el.onclick = () => onNavigate(el.dataset.tab);
  });

  return sidebar;
}
