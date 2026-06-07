import logoImg from '../assets/logo-so-mot-new-01.png';

const IC = {
  dash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  dinein: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h1v2"/><path d="M21 22v-3"/></svg>`,
  grab: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`,
  panda: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 11h.01"/><path d="M11 15h.01"/><path d="M16 16h.01"/><path d="m2 16 20 6-6-20A20 20 0 0 0 2 16"/><path d="M5.71 17.11a17.04 17.04 0 0 1 11.4-11.4"/></svg>`,
  online: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  expenses: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17V7"/></svg>`,
  analytics: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  opex: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  pnl: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
  settings: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  admin: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  performance: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15a8 8 0 0 1 16 0"/><circle cx="12" cy="14" r="2"/><path d="M12 8v4"/></svg>`
};

export function renderHeader(title, subtitle, onToggleDark, logoUrl, branch = 'All Branches', dateRange = null, user = null, onSignOut = null, subTabs = [], activeSubTab = null, darkLogoUrl = null, activeTab = 'dashboard', onNavigate = null) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const finalDateRange = dateRange || [yesterdayStr, yesterdayStr];

  // Process User Info
  const displayName = user?.displayName || 'Admin User';
  const email = user?.email || 'admin@somot.com';
  const photoUrl = user?.photoURL || null;
  const initials = displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'AD';

  // Topbar Header Element
  const header = document.createElement('header');
  header.className = 'topbar transition-all duration-300';

  const isDashboard = title === 'Dashboard';
  const hideGlobalFilters = ['Expenses', 'Pantry Analysis', 'Operating Expenses', 'Settings', 'P&L Statement', 'Performance'].includes(title);

  // Define options based on user permissions
  const DEFAULT_BRANCHES = ['All Branches', 'Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf'];
  const isAdmin = user?.permissions?.isAdmin === true || ['jimmie.somot@gmail.com'].includes(user?.email);
  const allowedBranches = isAdmin ? DEFAULT_BRANCHES : (user?.permissions?.allowedBranches || DEFAULT_BRANCHES);

  header.innerHTML = `
    <!-- Left: Hamburger + Title / Partner Logo + Global Filters -->
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-1.5">
        <!-- Hamburger Menu Button -->
        <button id="hamburger-btn" class="hamburger-btn" aria-label="Toggle Navigation Menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
        </button>
        ${(isDashboard || !logoUrl) ? `
          <h1 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest ml-2">${title}</h1>
        ` : `
          <div class="h-6 flex items-center pr-4 ml-1">
             <img src="/assets/${logoUrl}" class="h-full w-auto object-contain ${darkLogoUrl ? 'dark:hidden' : 'dark:brightness-0 dark:invert'}" alt="${title} Logo" />
             ${darkLogoUrl ? `<img src="/assets/${darkLogoUrl}" class="h-full w-auto object-contain hidden dark:block" alt="${title} Logo" />` : ''}
          </div>
        `}
        
        <!-- Global Filters (Left-Aligned) -->
        ${hideGlobalFilters ? '' : `
        <div class="flex items-center gap-6 ml-4 border-l border-slate-200 dark:border-white/10 pl-4">
          <!-- Branch Picker -->
          <div class="relative group cursor-pointer flex items-center gap-1.5 h-6" id="branch-dropdown-wrapper">
            <input type="hidden" id="db-branch" value="${branch}">
            <span id="current-branch-text" class="text-[11px] font-black text-slate-600 dark:text-white uppercase tracking-wider group-hover:text-[#96588a] transition-colors">${branch}</span>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 group-hover:text-[#96588a] transition-colors"></i>
 
            <div id="branch-options" class="absolute top-full left-0 mt-2 w-52 bg-white/95 dark:bg-[#141414]/95 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 transition-all duration-300 z-[100] overflow-hidden backdrop-blur-3xl border border-white/60 dark:border-white/10">
              <div class="py-2">
                ${allowedBranches.map(b => `
                  <div class="branch-item px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" 
                       onclick="document.getElementById('db-branch').value='${b}'; document.getElementById('current-branch-text').innerText='${b}'; document.getElementById('db-branch').dispatchEvent(new Event('change'));">
                     ${b}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
 
          <div class="w-1 h-1 rounded-full bg-slate-300 dark:bg-white/20"></div>
          
          <!-- Date Picker -->
          <div class="relative group cursor-pointer flex items-center gap-1.5 h-6" id="custom-preset-container">
             <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400 group-hover:text-[#96588a] transition-colors"></i>
             <input type="text" id="db-date-range" aria-label="Select Date Range" class="absolute inset-0 opacity-0 pointer-events-none" value="${dateRange || ''}">
             
             <div class="flex items-center gap-1.5">
                 <span id="preset-label" class="text-[11px] font-black text-slate-600 dark:text-white uppercase tracking-wider group-hover:text-[#96588a] transition-colors">Yesterday</span>
                 <i data-lucide="chevron-down" id="preset-chevron" class="w-3 h-3 text-slate-400 dark:text-white/60 transition-transform duration-300 group-hover:rotate-180"></i>
             </div>
     
             <div id="preset-menu" class="absolute top-full left-0 mt-2 w-52 bg-white/95 dark:bg-[#141414]/95 rounded-2xl shadow-2xl opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-300 z-[100] overflow-hidden backdrop-blur-3xl border border-white/60 dark:border-white/10">
                 <div class="py-2">
                    <div class="preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all" data-value="yesterday">Yesterday</div>
                    <div class="preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all" data-value="last7">Last 7 Days</div>
                    <div class="preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all" data-value="thisMonth">This Month</div>
                    <div class="preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all border-t border-slate-100 dark:border-white/5" data-value="custom">Custom Range...</div>
                 </div>
             </div>
          </div>
        </div>
        `}
 
        <!-- Local Filters Anchor -->
        <div id="header-local-filters" class="flex items-center gap-4 ml-2"></div>
      </div>
    </div>
 
    <!-- Right: Profile & Theme -->
    <div class="flex items-center gap-3">
      <!-- Refresh -->
      <button id="db-refresh" aria-label="Refresh Data" class="w-10 h-10 flex items-center justify-center rounded-full bg-[#96588a] hover:bg-[#7a4671] text-white shadow-lg shadow-purple-200 dark:shadow-none transition-all active:scale-90 group">
        <i data-lucide="rotate-cw" class="w-4 h-4 group-hover:rotate-180 transition-transform duration-500"></i>
      </button>
 
      <div class="h-8 w-px bg-slate-200 dark:bg-white/10 mx-1"></div>
 
      <!-- Theme Toggle -->
      <button id="dark-btn" aria-label="Toggle Dark Mode" class="p-2 rounded-lg text-[#141414] dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
        <i data-lucide="moon" id="icon-moon" class="w-5 h-5"></i>
      </button>
 
      <!-- User Profile (Sign Out) -->
      <div id="user-profile-btn" class="flex items-center gap-3 cursor-pointer group pl-1 pr-4 py-1 rounded-full bg-slate-300/40 dark:bg-slate-800/40 transition-all shadow-sm relative overflow-hidden" title="Click to Sign Out">
        <div class="absolute inset-0 bg-rose-400 -translate-x-[102%] group-hover:translate-x-0 transition-transform duration-500 ease-out rounded-full"></div>
 
        <div class="relative z-10 flex items-center gap-3">
          ${photoUrl ? `
            <img src="${photoUrl}" alt="Profile" class="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 object-cover shadow-sm group-hover:scale-90 transition-transform duration-500">
          ` : `
            <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-[#96588a] to-[#7a4671] flex items-center justify-center text-white text-[10px] font-black shadow-sm border-2 border-white dark:border-slate-900 group-hover:scale-90 transition-transform duration-500">
              ${initials}
            </div>
          `}
          
          <div class="hidden lg:block relative h-8 overflow-hidden min-w-[120px]">
             <div class="absolute inset-0 flex flex-col justify-center transition-all duration-500 ease-in-out group-hover:translate-x-[120%] group-hover:opacity-0">
                <p class="text-[11px] font-black text-slate-700 dark:text-white leading-tight">${displayName}</p>
                <p class="text-[9px] text-slate-400 font-medium leading-tight">${email}</p>
             </div>
             <div class="absolute inset-0 flex items-center transition-all duration-500 ease-in-out -translate-x-full opacity-0 group-hover:translate-x-0 group-hover:opacity-100">
                <span class="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                   <i data-lucide="log-out" class="w-3.5 h-3.5"></i> Sign Out
                </span>
             </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Sidebar Island Navigation Element
  const DEFAULT_TABS = ['dashboard', 'performance', 'dinein', 'grabfood', 'foodpanda', 'online', 'expenses', 'pantry_analysis', 'opex', 'pnl', 'settings'];
  const allowedTabs = isAdmin ? DEFAULT_TABS : (user?.permissions?.allowedTabs || DEFAULT_TABS);
  const TAB_LABELS = {
    dashboard: 'Dashboard',
    performance: 'Performance',
    dinein: 'Dine In',
    grabfood: 'GrabFood',
    foodpanda: 'FoodPanda',
    online: 'Online Order',
    expenses: 'Expenses',
    pantry_analysis: 'Pantry Analysis',
    opex: 'OPEX',
    pnl: 'P&L',
    settings: 'Settings',
    admin: 'Admin Panel'
  };
  const TAB_ICONS = {
    dashboard: IC.dash,
    performance: IC.performance,
    dinein: IC.dinein,
    grabfood: IC.grab,
    foodpanda: IC.panda,
    online: IC.online,
    expenses: IC.expenses,
    pantry_analysis: IC.analytics,
    opex: IC.opex,
    pnl: IC.pnl,
    settings: IC.settings,
    admin: IC.admin
  };

  const subheader = document.createElement('nav');
  subheader.id = 'subheader-nav';
  subheader.className = 'subheader-nav transition-all duration-300';

  let subheaderHTML = `
    <!-- Island Logo Header -->
    <div class="flex items-center h-[70px] shrink-0 justify-center px-6 overflow-hidden">
      <img src="${logoImg}" class="object-contain h-10 w-auto dark:brightness-0 dark:invert dark:opacity-80" alt="App Logo" />
    </div>

    <!-- Island Scrollable Item List -->
    <div class="subheader-container">
  `;

  allowedTabs.forEach(tabId => {
    if (TAB_ICONS[tabId]) {
      const isActive = activeTab === tabId;
      subheaderHTML += `
        <button class="subheader-item ${isActive ? 'active' : ''}" data-tab="${tabId}" aria-label="${TAB_LABELS[tabId]}">
          <span class="subheader-icon">${TAB_ICONS[tabId]}</span>
          <span class="subheader-text">${TAB_LABELS[tabId]}</span>
        </button>
      `;
    }
  });

  if (isAdmin && !allowedTabs.includes('admin')) {
    const isActive = activeTab === 'admin';
    subheaderHTML += `
      <button class="subheader-item ${isActive ? 'active' : ''}" data-tab="admin" aria-label="Admin Panel">
        <span class="subheader-icon">${IC.admin}</span>
        <span class="subheader-text">Admin Panel</span>
      </button>
    `;
  }

  subheaderHTML += `</div>`;
  subheader.innerHTML = subheaderHTML;

  setTimeout(() => {
    if (window.lucide) window.lucide.createIcons();

    // Toggle sub-header navigation with Hamburger Button
    const hamburgerBtn = document.getElementById('hamburger-btn');

    // Sub-header active state sync from localStorage
    const isSubheaderOpen = localStorage.getItem('subheader_open') !== '0'; // Default to open
    if (isSubheaderOpen) {
      subheader.classList.add('open');
    }

    hamburgerBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      subheader.classList.toggle('open');
      const nowOpen = subheader.classList.contains('open');
      localStorage.setItem('subheader_open', nowOpen ? '1' : '0');
    });

    // Sub-header tab navigation click actions
    subheader.querySelectorAll('.subheader-item').forEach(btn => {
      btn.onclick = () => {
        const tab = btn.dataset.tab;
        if (onNavigate && tab) {
          onNavigate(tab);
        }
      };
    });

    const rangeInput = document.getElementById('db-date-range');
    const container = document.getElementById('custom-preset-container');
    const menu = document.getElementById('preset-menu');
    const label = document.getElementById('preset-label');
    const chevron = document.getElementById('preset-chevron');

    // Date Helpers
    const getRange = (type) => {
      const d = new Date();
      const fmt = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      switch (type) {
        case 'yesterday':
          const yest = new Date();
          yest.setDate(yest.getDate() - 1);
          return `${fmt(yest)} to ${fmt(yest)}`;
        case 'last7':
          const start7 = new Date();
          start7.setDate(start7.getDate() - 7);
          return `${fmt(start7)} to ${fmt(d)}`;
        case 'thisMonth':
          const startM = new Date(d.getFullYear(), d.getMonth(), 1);
          return `${fmt(startM)} to ${fmt(d)}`;
        case 'lastMonth':
          const lmS = new Date(d.getFullYear(), d.getMonth() - 1, 1);
          const lmE = new Date(d.getFullYear(), d.getMonth(), 0);
          return `${fmt(lmS)} to ${fmt(lmE)}`;
        default: return '';
      }
    };

    if (window.flatpickr && rangeInput && container) {
      const fp = window.flatpickr(rangeInput, {
        mode: "range",
        dateFormat: "Y-m-d",
        onClose: (selectedDates) => {
          if (selectedDates.length === 2) {
            const start = fp.formatDate(selectedDates[0], "Y-m-d");
            const end = fp.formatDate(selectedDates[1], "Y-m-d");
            const rangeStr = `${start} to ${end}`;
            label.textContent = rangeStr;
            rangeInput.value = rangeStr;
            rangeInput.dispatchEvent(new Event('change'));
          }
        }
      });

      container.querySelectorAll('.preset-option').forEach(opt => {
        opt.onclick = (e) => {
          e.stopPropagation();
          const val = opt.dataset.value;

          if (val === 'custom') {
            fp.open();
          } else {
            const range = getRange(val);
            label.textContent = opt.textContent;
            rangeInput.value = range;
            rangeInput.dispatchEvent(new Event('change'));
          }

          menu.classList.add('opacity-0', 'invisible', 'translate-y-2');
          chevron.classList.remove('rotate-180');
        };
      });

      // Default / Sync state
      if (dateRange) {
        const yesterdayStr = getRange('yesterday');
        const last7Str = getRange('last7');
        const thisMonthStr = getRange('thisMonth');
        const lastMonthStr = getRange('lastMonth');

        rangeInput.value = dateRange; // Ensure input has the value

        if (dateRange === yesterdayStr) label.textContent = 'Yesterday';
        else if (dateRange === last7Str) label.textContent = 'Last 7 Days';
        else if (dateRange === thisMonthStr) label.textContent = 'This Month';
        else if (dateRange === lastMonthStr) label.textContent = 'Last Month';
        else if (typeof dateRange === 'string' && dateRange.includes(' to ')) {
          label.textContent = dateRange;
        } else {
          const opt = container.querySelector(`.preset-option[data-value="${dateRange}"]`);
          if (opt) label.textContent = opt.textContent;
          else label.textContent = dateRange;
        }
      } else {
        label.textContent = 'Yesterday';
        rangeInput.value = getRange('yesterday');
      }
    }

    document.getElementById('dark-btn')?.addEventListener('click', () => {
      onToggleDark();
    });

    const profileBtn = document.getElementById('user-profile-btn');
    if (profileBtn && onSignOut) {
      profileBtn.addEventListener('click', onSignOut);
    }

    if (window.lucide) window.lucide.createIcons();
  }, 100);

  header.querySelectorAll('.sub-tab-link').forEach(btn => {
    btn.onclick = () => {
      const tabId = btn.dataset.tabId;
      window.dispatchEvent(new CustomEvent('switch-sub-tab', { detail: { tabId } }));
    };
  });

  return { header, subheader };
}
