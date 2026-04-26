const IC = {
  dash: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  dinein: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h1v2"/><path d="M21 22v-3"/></svg>`,
  grab: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`,
  panda: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 11h.01"/><path d="M11 15h.01"/><path d="M16 16h.01"/><path d="m2 16 20 6-6-20A20 20 0 0 0 2 16"/><path d="M5.71 17.11a17.04 17.04 0 0 1 11.4-11.4"/></svg>`,
  online: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  settings: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`
};

export function renderSidebar(activeTab, onNavigate) {
  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.innerHTML = `
    <!-- Logo -->
    <div class="px-7 py-8">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-lg"
             style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
          S
        </div>
        <div>
          <p class="font-bold text-lg text-white tracking-tight leading-none">SO MOT</p>
          <p class="text-[10px] text-slate-500 mt-1 font-semibold uppercase tracking-[0.2em]">Dashboard</p>
        </div>
      </div>
    </div>

    <!-- Nav -->
    <nav class="flex-1 px-4 space-y-1 overflow-y-auto">
      <p class="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em] px-4 pt-4 pb-2">Navigation</p>

      <div class="nav-item ${activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">
        <span>${IC.dash}</span> <span>Dashboard</span>
      </div>

      <p class="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em] px-4 pt-6 pb-2">Channels</p>

      <div class="nav-item ${activeTab === 'dinein' ? 'active' : ''}" data-tab="dinein">
        <span>${IC.dinein}</span> <span>Dine In</span>
      </div>
      <div class="nav-item ${activeTab === 'grabfood' ? 'active' : ''}" data-tab="grabfood">
        <span>${IC.grab}</span> <span>GrabFood</span>
      </div>
      <div class="nav-item ${activeTab === 'foodpanda' ? 'active' : ''}" data-tab="foodpanda">
        <span>${IC.panda}</span> <span>FoodPanda</span>
      </div>
      <div class="nav-item ${activeTab === 'online' ? 'active' : ''}" data-tab="online">
        <span>${IC.online}</span> <span>Online Order</span>
      </div>

      <div class="pt-8 opacity-20"><div class="border-t border-slate-400"></div></div>

      <div class="nav-item ${activeTab === 'settings' ? 'active' : ''}" data-tab="settings">
        <span>${IC.settings}</span> <span>Settings</span>
      </div>
    </nav>

    <!-- Footer -->
    <div class="px-8 py-6">
      <div class="flex items-center gap-2.5">
        <div class="w-2 h-2 bg-emerald-500 rounded-full"></div>
        <span class="text-[11px] text-slate-500 font-bold uppercase tracking-widest">Live Sync</span>
      </div>
    </div>
  `;

  sidebar.querySelectorAll('.nav-item').forEach(el => {
    el.onclick = () => onNavigate(el.dataset.tab);
  });

  return sidebar;
}
