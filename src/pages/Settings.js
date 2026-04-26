export function renderSettings() {
  const page = document.createElement('div');
  page.className = 'p-6 page-enter';
  page.innerHTML = `
    <div class="max-w-xl space-y-6">

      <!-- App Preferences -->
      <div class="chart-card divide-y divide-slate-100 dark:divide-slate-700/60">
        <div class="pb-4 mb-0">
          <p class="font-semibold text-slate-700 dark:text-slate-200 text-sm">App Preferences</p>
          <p class="text-xs text-slate-400 mt-0.5">Customize your dashboard experience</p>
        </div>

        <div class="flex items-center justify-between py-4">
          <div>
            <p class="text-sm font-medium text-slate-700 dark:text-slate-200">Dark Mode</p>
            <p class="text-xs text-slate-400 mt-0.5">Toggle between light and dark theme</p>
          </div>
          <div id="dark-toggle"
               class="relative w-11 h-6 rounded-full cursor-pointer transition-colors duration-300 bg-slate-200 dark:bg-indigo-600"
               onclick="document.documentElement.classList.toggle('dark');localStorage.setItem('darkMode',document.documentElement.classList.contains('dark')?'1':'0');this.querySelector('.thumb').style.transform=document.documentElement.classList.contains('dark')?'translateX(20px)':'';">
            <div class="thumb absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-300"></div>
          </div>
        </div>

        <div class="flex items-center justify-between py-4">
          <div>
            <p class="text-sm font-medium text-slate-700 dark:text-slate-200">Currency</p>
            <p class="text-xs text-slate-400 mt-0.5">All amounts displayed in</p>
          </div>
          <span class="text-sm font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-lg">₱ PHP</span>
        </div>

        <div class="flex items-center justify-between py-4">
          <div>
            <p class="text-sm font-medium text-slate-700 dark:text-slate-200">Language</p>
            <p class="text-xs text-slate-400 mt-0.5">Interface language</p>
          </div>
          <span class="text-sm font-bold text-slate-600 dark:text-slate-300">English</span>
        </div>
      </div>

      <!-- Channels -->
      <div class="chart-card divide-y divide-slate-100 dark:divide-slate-700/60">
        <div class="pb-4">
          <p class="font-semibold text-slate-700 dark:text-slate-200 text-sm">Revenue Channels</p>
          <p class="text-xs text-slate-400 mt-0.5">Enabled channels for this dashboard</p>
        </div>
        ${[
          { icon: '🍽️', label: 'Dine In' },
          { icon: '🛵', label: 'GrabFood' },
          { icon: '🐼', label: 'FoodPanda' },
          { icon: '🛒', label: 'Online Order' },
        ].map(ch => `
          <div class="flex items-center justify-between py-3">
            <div class="flex items-center gap-3">
              <span class="text-base">${ch.icon}</span>
              <span class="text-sm font-medium text-slate-700 dark:text-slate-200">${ch.label}</span>
            </div>
            <span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 px-2.5 py-0.5 rounded-full">Active</span>
          </div>
        `).join('')}
      </div>

      <!-- About -->
      <div class="chart-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">SO MOT Dashboard</p>
            <p class="text-xs text-slate-400 mt-0.5">Multi-channel revenue management</p>
          </div>
          <span class="text-indigo-600 font-mono text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-lg">v1.0.0</span>
        </div>
      </div>
    </div>
  `;
  return page;
}
