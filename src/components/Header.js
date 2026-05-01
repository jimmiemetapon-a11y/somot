export function renderHeader(title, subtitle, onToggleDark, logoUrl, branch = 'All Branches', dateRange = null, user = null, onSignOut = null, subTabs = [], activeSubTab = null) {
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

  // Define options based on user permissions
  const DEFAULT_BRANCHES = ['All Branches', 'Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf'];
  const allowedBranches = user?.permissions?.allowedBranches || DEFAULT_BRANCHES;

  header.innerHTML = `
    <!-- Left: Title / Partner Logo + SubTabs -->
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-1.5">
        ${(isDashboard || !logoUrl) ? `
          <h1 class="text-sm font-black text-slate-400 uppercase tracking-widest ml-2">${title}</h1>
        ` : `
          <div class="h-6 flex items-center border-r border-slate-200 dark:border-slate-800/60 pr-4 ml-1">
             <img src="/src/assets/${logoUrl}" class="h-full w-auto object-contain dark:brightness-0 dark:invert" alt="${title} Logo" />
          </div>
        `}
        
        <!-- Sub Tabs Breadcrumbs -->
        ${subTabs.length > 0 ? `
          <div class="flex items-center gap-3 ml-2">
            <span class="text-slate-300 dark:text-slate-600 font-medium text-sm">/</span>
            <div class="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 px-4 py-1.5 rounded-full border border-slate-100 dark:border-slate-800/50">
              ${subTabs.map((tab, idx) => `
                ${idx > 0 ? '<span class="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>' : ''}
                <button class="sub-tab-link text-[10px] font-black uppercase tracking-[0.15em] transition-all ${activeSubTab === tab.id ? 'text-[#96588a]' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}" 
                        data-tab-id="${tab.id}">
                  ${tab.label}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>

    <!-- Right: Profile & Theme -->
    <div class="flex items-center gap-3">
<!-- Pill 1: Branch Custom UI -->
<div class="relative h-10 group" id="branch-dropdown-wrapper">
    <!-- Hidden input để giữ giá trị cho Logic cũ -->
    <input type="hidden" id="db-branch" value="${branch}">
    
        <!-- Button hiển thị thay cho select cũ -->
        <div id="branch-display" class="h-full pl-4 pr-10 rounded-full text-[11px] font-black bg-[#96588a] text-white flex items-center cursor-pointer hover:bg-[#7a4671] transition-all shadow-md relative">
            <span id="current-branch-text">${branch}</span>
            <!-- Icon mũi tên -->
            <div class="absolute right-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
        </div>

          <!-- Danh sách chi nhánh hiệu ứng Kính Mờ -->
          <div id="branch-options" class="absolute top-full left-0 mt-2 w-48 bg-white/70 dark:bg-slate-900/70 border border-white/20 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 transition-all duration-300 z-[70] overflow-hidden backdrop-blur-md">
              <div class="py-2">
                  ${allowedBranches.map(b => `
                      <div class="branch-item px-4 py-2.5 text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest hover:bg-white/40 hover:text-[#96588a] transition-all cursor-pointer" 
                          onclick="document.getElementById('db-branch').value='${b}'; document.getElementById('current-branch-text').innerText='${b}'; document.getElementById('db-branch').dispatchEvent(new Event('change'));">
                          ${b}
                      </div>
                  `).join('')}
              </div>
          </div>
      </div>
      
      <!-- Pill 2: Date Selector (Custom Dropdown + Flatpickr) -->
      <div class="flex items-center h-10 bg-white dark:bg-slate-800 border-2 border-[#96588a]/40 rounded-full px-4 hover:border-[#96588a] transition-all shadow-sm group relative cursor-pointer" id="custom-preset-container">
         <i data-lucide="calendar" class="w-4 h-4 text-[#96588a] mr-2"></i>
         
         <!-- Hidden Input for Flatpickr logic -->
         <input type="text" id="db-date-range" class="absolute inset-0 opacity-0 pointer-events-none" value="${dateRange || ''}">
         
         <!-- Custom Dropdown Trigger -->
         <div class="flex items-center gap-2">
            <span id="preset-label" class="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight">Yesterday</span>
            <i data-lucide="chevron-down" id="preset-chevron" class="w-3 h-3 text-slate-400 transition-transform duration-300 group-hover:rotate-180"></i>
         </div>

         <!-- Custom Dropdown Menu -->
         <div id="preset-menu" class="absolute top-full left-0 mt-2 w-48 bg-white/80 dark:bg-slate-900/80 border border-white/20 dark:border-slate-800/50 rounded-2xl shadow-2xl opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-300 z-[60] overflow-hidden backdrop-blur-xl">
            <div class="py-2">
               <div class="preset-option px-4 py-2.5 text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-[#96588a] transition-all" data-value="yesterday">Yesterday</div>
               <div class="preset-option px-4 py-2.5 text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-[#96588a] transition-all" data-value="last7">Last 7 Days</div>
               <div class="preset-option px-4 py-2.5 text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-[#96588a] transition-all" data-value="thisMonth">This Month</div>
               <div class="preset-option px-4 py-2.5 text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-[#96588a] transition-all" data-value="lastMonth">Last Month</div>
               <div class="border-t border-slate-50 dark:border-slate-800 my-1"></div>
               <div class="preset-option px-4 py-2.5 text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-[#96588a] transition-all flex items-center justify-between" data-value="custom">
                  Custom Range
                  <i data-lucide="edit-3" class="w-3 h-3 opacity-40"></i>
               </div>
            </div>
         </div>
      </div>
      
      <!-- Pill 3: Refresh -->
      <button id="db-refresh" class="w-10 h-10 flex items-center justify-center rounded-full bg-[#96588a] hover:bg-[#7a4671] text-white shadow-lg shadow-purple-200 dark:shadow-none transition-all active:scale-90 group">
        <i data-lucide="rotate-cw" class="w-4 h-4 group-hover:rotate-180 transition-transform duration-500"></i>
      </button>

      <div class="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>

      <button id="dark-btn" class="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
        <i data-lucide="moon" id="icon-moon" class="w-5 h-5"></i>
      </button>

      <!-- User Profile (Click to Logout) -->
      <div id="user-profile-btn" class="flex items-center gap-3 cursor-pointer group pl-1 pr-4 py-1 rounded-full bg-white dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50 hover:bg-rose-50 dark:hover:bg-rose-900/30 hover:border-rose-200 dark:hover:border-rose-800/50 transition-all shadow-sm relative overflow-hidden" title="Click to Sign Out">
        ${photoUrl ? `
          <img src="${photoUrl}" alt="Profile" class="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 object-cover shadow-sm group-hover:opacity-50 transition-opacity">
        ` : `
          <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-[#96588a] to-[#7a4671] flex items-center justify-center text-white text-[10px] font-black shadow-sm border-2 border-white dark:border-slate-900 group-hover:opacity-50 transition-opacity">
            ${initials}
          </div>
        `}
        
        <div class="hidden lg:block text-left group-hover:opacity-10 transition-opacity">
          <p class="text-[11px] font-black text-slate-700 dark:text-white leading-tight">${displayName}</p>
          <p class="text-[9px] text-slate-400 font-medium leading-tight">${email}</p>
        </div>
        
        <!-- Hover Sign Out Text -->
        <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
           <span class="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest flex items-center gap-1">
              <i data-lucide="log-out" class="w-3 h-3"></i> Sign Out
           </span>
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

    if (window.flatpickr) {
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
