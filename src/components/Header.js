export function renderHeader(title, subtitle, onToggleDark, logoUrl, branch = 'All Branches', dateRange = null, user = null, onSignOut = null, subTabs = [], activeSubTab = null, darkLogoUrl = null) {
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

  const header = document.createElement('header');
  header.className = 'topbar transition-all duration-300';

  const isDashboard = title === 'Dashboard';
  const hideGlobalFilters = ['Expenses', 'Pantry Analysis', 'Operating Expenses', 'Settings'].includes(title);

  // Define options based on user permissions
  const DEFAULT_BRANCHES = ['All Branches', 'Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf'];
  const allowedBranches = user?.permissions?.allowedBranches || DEFAULT_BRANCHES;

  header.innerHTML = `
    <!-- Left: Title / Partner Logo + SubTabs -->
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-1.5">
        ${(isDashboard || !logoUrl) ? `
          <h1 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest ml-2">${title}</h1>
        ` : `
          <div class="h-6 flex items-center pr-4 ml-1">
             <img src="/src/assets/${logoUrl}" class="h-full w-auto object-contain ${darkLogoUrl ? 'dark:hidden' : 'dark:brightness-0 dark:invert'}" alt="${title} Logo" />
             ${darkLogoUrl ? `<img src="/src/assets/${darkLogoUrl}" class="h-full w-auto object-contain hidden dark:block" alt="${title} Logo" />` : ''}
          </div>
        `}
        
        <!-- Sub Tabs Breadcrumbs -->
        ${subTabs.length > 0 ? `
          <div class="flex items-center gap-3 ml-2">
            <span class="text-slate-900 dark:text-white/20 font-medium text-sm">/</span>
            <div class="flex items-center gap-4 bg-slate-200 dark:bg-[#242424] px-4 py-1.5 rounded-full border border-slate-400/20 dark:border-white/5 shadow-inner">
              ${subTabs.map((tab, idx) => `
                ${idx > 0 ? '<span class="w-1 h-1 rounded-full bg-slate-400 dark:bg-white/20"></span>' : ''}
                <button class="sub-tab-link text-[10px] font-black uppercase tracking-[0.15em] transition-all ${activeSubTab === tab.id ? 'text-[#96588a]' : 'text-slate-900 dark:text-white hover:opacity-70'}" 
                        data-tab-id="${tab.id}">
                  ${tab.label}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Local Filters Anchor -->
        <div id="header-local-filters" class="flex items-center gap-4 ml-2"></div>
      </div>
    </div>

    <!-- Right: Profile & Theme -->
    <div class="flex items-center gap-3">
      ${hideGlobalFilters ? '' : `
      <!-- Pill 1: Branch Picker -->
      <div class="relative h-10 group" id="branch-dropdown-wrapper">
        <input type="hidden" id="db-branch" value="${branch}">
        
        <div id="branch-display" class="h-full pl-4 pr-10 rounded-full text-[11px] font-black bg-[#96588a] dark:bg-white/10 text-white flex items-center cursor-pointer hover:bg-[#834d78] dark:hover:bg-white/5 transition-all shadow-md relative border-none">
          <span id="current-branch-text" class="uppercase dark:text-white transition-colors">${branch}</span>
          <div class="absolute right-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-opacity="0.8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="text-white"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
        </div>

        <div id="branch-options" class="absolute top-full left-0 mt-2 w-52 bg-white/60 dark:bg-black/60 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 transition-all duration-300 z-[70] overflow-hidden ultra-blur border-none">
          <div class="py-2">
            ${allowedBranches.map(b => `
              <div class="branch-item px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white uppercase tracking-[0.15em] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all cursor-pointer" 
                   onclick="document.getElementById('db-branch').value='${b}'; document.getElementById('current-branch-text').innerText='${b}'; document.getElementById('db-branch').dispatchEvent(new Event('change'));">
                ${b}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      
      <!-- Pill 2: Date Picker -->
      <div class="flex items-center h-10 bg-white dark:bg-white/10 rounded-full px-5 hover:bg-slate-50 dark:hover:bg-white/20 transition-all shadow-md group relative cursor-pointer border-none" id="custom-preset-container">
         <i data-lucide="calendar" class="w-3.5 h-3.5 text-[#96588a] mr-2.5"></i>
         <input type="text" id="db-date-range" class="absolute inset-0 opacity-0 pointer-events-none" value="${dateRange || ''}">
         
         <div class="flex items-center gap-2.5">
            <span id="preset-label" class="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-tight">Yesterday</span>
            <i data-lucide="chevron-down" id="preset-chevron" class="w-3 h-3 text-slate-400 dark:text-white/60 transition-transform duration-300 group-hover:rotate-180"></i>
         </div>

         <div id="preset-menu" class="absolute top-full left-0 mt-2 w-52 bg-white/60 dark:bg-black/60 rounded-2xl shadow-2xl opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-300 z-[60] overflow-hidden ultra-blur border-none">
            <div class="py-2">
               <div class="preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all" data-value="yesterday">Yesterday</div>
               <div class="preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all" data-value="last7">Last 7 Days</div>
               <div class="preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all" data-value="thisMonth">This Month</div>
               <div class="preset-option px-5 py-3 text-[10px] font-black text-slate-600 dark:text-white/80 uppercase tracking-[0.15em] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#96588a] dark:hover:text-white transition-all border-t border-slate-100 dark:border-white/5" data-value="custom">Custom Range...</div>
            </div>
         </div>
      </div>
      `}
      
      <!-- Pill 3: Refresh -->
      <button id="db-refresh" class="w-10 h-10 flex items-center justify-center rounded-full bg-[#96588a] hover:bg-[#7a4671] text-white shadow-lg shadow-purple-200 dark:shadow-none transition-all active:scale-90 group">
        <i data-lucide="rotate-cw" class="w-4 h-4 group-hover:rotate-180 transition-transform duration-500"></i>
      </button>

      <div class="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>

      <button id="dark-btn" class="p-2 rounded-lg text-[#141414] dark:text-white/60 hover:bg-grey-100 dark:hover:bg-[#141414] transition-colors">
        <i data-lucide="moon" id="icon-moon" class="w-5 h-5"></i>
      </button>

      <!-- User Profile (Click to Logout) -->
      <div id="user-profile-btn" class="flex items-center gap-3 cursor-pointer group pl-1 pr-4 py-1 rounded-full bg-slate-300/40 dark:bg-slate-800/40 dark:border-slate-700/50 transition-all shadow-sm relative overflow-hidden" title="Click to Sign Out">
        <!-- Sliding Switch Background (Rounded Pill) -->
        <div class="absolute inset-0 bg-rose-400 -translate-x-[102%] group-hover:translate-x-0 transition-transform duration-500 ease-out rounded-full"></div>

        <!-- Content Area -->
        <div class="relative z-10 flex items-center gap-3">
          ${photoUrl ? `
            <img src="${photoUrl}" alt="Profile" class="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 object-cover shadow-sm group-hover:scale-90 transition-transform duration-500">
          ` : `
            <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-[#96588a] to-[#7a4671] flex items-center justify-center text-white text-[10px] font-black shadow-sm border-2 border-white dark:border-slate-900 group-hover:scale-90 transition-transform duration-500">
              ${initials}
            </div>
          `}
          
          <!-- Horizontal Sliding Text Wrapper -->
          <div class="hidden lg:block relative h-8 overflow-hidden min-w-[120px]">
             <!-- Profile Info (Slides out to the right) -->
             <div class="absolute inset-0 flex flex-col justify-center transition-all duration-500 ease-in-out group-hover:translate-x-[120%] group-hover:opacity-0">
                <p class="text-[11px] font-black text-slate-700 dark:text-white leading-tight">${displayName}</p>
                <p class="text-[9px] text-slate-400 font-medium leading-tight">${email}</p>
             </div>
             <!-- Sign Out (Slides in from the left) -->
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

  setTimeout(() => {
    if (window.lucide) window.lucide.createIcons();

    const rangeInput = document.getElementById('db-date-range');
    const container = document.getElementById('custom-preset-container');
    const menu = document.getElementById('preset-menu');
    const label = document.getElementById('preset-label');
    const chevron = document.getElementById('preset-chevron');

    // Toggle Menu (REMOVED: Now handled by group-hover in CSS)
    // Close on click outside (REMOVED: Now handled by group-hover in CSS)

    // Date Helpers
    const getRange = (type) => {
      const d = new Date();
      const fmt = (date) => date.toISOString().split('T')[0];

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

  return header;
}
