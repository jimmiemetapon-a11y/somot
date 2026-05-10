// src/main.js
import './style.css';
import { renderSidebar } from './components/Sidebar.js';
import { renderHeader } from './components/Header.js';
import { renderDashboard } from './pages/Dashboard.js';
import { renderChannelPage } from './pages/ChannelPage.js';
import { renderExpensesPage } from './pages/Expenses.js';
import { renderPantryAnalysis } from './pages/PantryAnalysis.js';
import { renderOPEX } from './pages/OPEX.js';
import { renderSettings } from './pages/Settings.js';
import { renderLoginPage } from './pages/Login.js';
import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Router } from './utils/Router.js';

let currentUser = null;
let isSidebarCollapsed = false;
let currentTab = 'dashboard';
let activeSubTab = null;
const router = new Router();

const PAGE_TITLES = {
  dashboard: ['Dashboard', 'Revenue overview across all channels', null, null],
  dinein: ['Dine In', 'In-house dining revenue', 'id_VcqlrDV_1777185371840.svg', 'kiotviet_dark.svg'],
  grabfood: ['GrabFood', 'GrabFood delivery channel', 'GrabFood.svg', 'Grab_dark.svg'],
  foodpanda: ['FoodPanda', 'FoodPanda delivery channel', 'Foodpanda.svg', 'panda_dark.svg'],
  online: ['Online Order', 'Direct online orders', 'WooCommerce.svg', 'woo_dark.svg'],
  expenses: ['Expenses', 'Petty cash & liquidation tracking', null, null],
  pantry_analysis: ['Pantry Analysis', 'Deep dive into ingredient costs & usage', null, null],
  opex: ['Operating Expenses', 'Monthly fixed costs & overheads tracking', null, null],
  settings: ['Settings', 'App configuration & preferences', null, null],
};

const SUB_TABS_CONFIG = {
  dinein: [
    { id: 'history', label: 'History' },
    { id: 'import', label: 'Import' }
  ],
  grabfood: [
    { id: 'history', label: 'History' },
    { id: 'import', label: 'Import' }
  ],
  foodpanda: [
    { id: 'history', label: 'History' },
    { id: 'import', label: 'Import' }
  ],
  online: [
    { id: 'history', label: 'History' },
    { id: 'import', label: 'Import' }
  ]
};

const PAGE_MAP = {
  dashboard: () => renderDashboard(currentUser),
  dinein: () => renderChannelPage('dinein', activeSubTab),
  grabfood: () => renderChannelPage('grabfood', activeSubTab),
  foodpanda: () => renderChannelPage('foodpanda', activeSubTab),
  online: () => renderChannelPage('online', activeSubTab),
  expenses: () => renderExpensesPage(activeSubTab),
  pantry_analysis: () => renderPantryAnalysis(),
  opex: () => renderOPEX(),
  settings: () => renderSettings(),
};

window.addEventListener('switch-sub-tab', (e) => {
  const subTabId = e.detail.tabId;
  let path = `/${currentTab}/${subTabId}`;

  // Special handling for Channel paths
  if (['dinein', 'grabfood', 'foodpanda', 'online'].includes(currentTab)) {
    path = `/channels/${currentTab}/${subTabId}`;
  } else if (currentTab === 'dashboard') {
    path = `/${subTabId}`;
  }
  
  router.navigate(path);
});

const yesterdayDate = new Date();
yesterdayDate.setDate(yesterdayDate.getDate() - 1);
const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

let filterState = {
  branch: 'All Branches',
  from: yesterdayStr,
  to: yesterdayStr,
  dateRange: `${yesterdayStr} to ${yesterdayStr}`
};

function buildShell() {
  const app = document.getElementById('app');
  if (!app) return;

  if (!currentUser) {
    app.innerHTML = '';
    app.appendChild(renderLoginPage());
    return;
  }

  // 1. Initialize Shell Containers (ONCE)
  let sidebarContainer = document.getElementById('sidebar-container');
  let mainContentContainer = document.getElementById('main-container');
  let contentArea = document.getElementById('page-content');
  let headerContainer = document.getElementById('header-container');

  if (!sidebarContainer || !mainContentContainer) {
    app.innerHTML = '';

    sidebarContainer = document.createElement('div');
    sidebarContainer.id = 'sidebar-container';
    app.appendChild(sidebarContainer);

    mainContentContainer = document.createElement('div');
    mainContentContainer.id = 'main-container';
    mainContentContainer.className = 'main-content';
    app.appendChild(mainContentContainer);

    headerContainer = document.createElement('div');
    headerContainer.id = 'header-container';
    mainContentContainer.appendChild(headerContainer);

    contentArea = document.createElement('div');
    contentArea.id = 'page-content';
    contentArea.className = 'flex-1 overflow-auto';
    mainContentContainer.appendChild(contentArea);
  }

  // 2. Persistent Sidebar (Update active state without full re-render if possible)
  // For now, we update it to ensure active tab classes match
  sidebarContainer.innerHTML = '';
  const sidebar = renderSidebar(currentTab, navigateTo, isSidebarCollapsed, toggleSidebar);
  sidebarContainer.appendChild(sidebar);

  // 3. Update Header
  const [title, subtitle, logoUrl, darkLogoUrl] = PAGE_TITLES[currentTab] || ['Dashboard', '', null, null];
  headerContainer.innerHTML = '';
  
  const currentRange = document.getElementById('db-date-range')?.value || filterState.dateRange;
  const header = renderHeader(
    title, subtitle, toggleDarkMode, logoUrl, 
    filterState.branch, currentRange, currentUser, 
    handleSignOut, SUB_TABS_CONFIG[currentTab] || [], 
    activeSubTab, darkLogoUrl
  );
  headerContainer.appendChild(header);

  // 4. Trigger Page Rendering
  renderPage(currentTab);
  attachFilterListeners();
}

async function renderPage(tabId) {
  // Dispatch cleanup event for the previous page
  window.dispatchEvent(new CustomEvent('cleanup-page'));

  const contentArea = document.getElementById('page-content');
  if (!contentArea) return;

  // Show skeleton loader instead of spinner
  contentArea.innerHTML = `
    <div class="p-8 space-y-6">
      <div class="flex justify-between items-center mb-10">
        <div class="h-8 skeleton-loading w-48"></div>
        <div class="h-10 skeleton-loading w-32 rounded-full"></div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="h-32 skeleton-loading rounded-2xl"></div>
        <div class="h-32 skeleton-loading rounded-2xl"></div>
        <div class="h-32 skeleton-loading rounded-2xl"></div>
      </div>
      <div class="h-64 skeleton-loading rounded-2xl w-full"></div>
    </div>
  `;

  const renderFn = PAGE_MAP[tabId];
  if (renderFn) {
    try {
      const pageElement = await renderFn();
      contentArea.innerHTML = '';
      contentArea.appendChild(pageElement);
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      console.error("Error rendering page:", err);
      contentArea.innerHTML = `<div class="p-10 text-rose-500 font-bold">Error loading page: ${err.message}</div>`;
    }
  }
}

function attachFilterListeners() {
  const branchSelect = document.getElementById('db-branch');
  const dateRange = document.getElementById('db-date-range');

  if (branchSelect) {
    branchSelect.addEventListener('change', (e) => {
      filterState.branch = e.target.value;
      window.dispatchEvent(new CustomEvent('global-filter-changed', { detail: filterState }));
    });
  }

  if (dateRange) {
    dateRange.addEventListener('change', (e) => {
      const val = e.target.value;
      filterState.dateRange = val;
      if (val.includes(' to ')) {
        [filterState.from, filterState.to] = val.split(' to ');
      } else {
        filterState.from = filterState.to = val;
      }
      window.dispatchEvent(new CustomEvent('global-filter-changed', { detail: filterState }));
    });
  }
}

function navigateTo(tabId, subTabId = null) {
  let path = `/${tabId}`;
  
  // Handle Channel mapping
  if (['dinein', 'grabfood', 'foodpanda', 'online'].includes(tabId)) {
    path = subTabId ? `/channels/${tabId}/${subTabId}` : `/channels/${tabId}`;
  } else if (tabId === 'pantry_analysis') {
    path = '/pantry-analysis';
  } else {
    path = subTabId ? `/${tabId}/${subTabId}` : `/${tabId}`;
  }

  router.navigate(path);
}

function toggleSidebar(collapsed) {
  isSidebarCollapsed = collapsed;
  const app = document.getElementById('app');
  const sidebar = document.querySelector('.sidebar');
  if (app && sidebar) {
    app.classList.toggle('sidebar-is-collapsed', collapsed);
    sidebar.classList.toggle('collapsed', collapsed);
  }
}

function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('darkMode', document.documentElement.classList.contains('dark') ? '1' : '0');
}

function initDarkMode() {
  const saved = localStorage.getItem('darkMode');
  const prefDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (saved === '1' || (!saved && prefDark)) {
    document.documentElement.classList.add('dark');
  }
}

async function handleSignOut() {
  try {
    await signOut(auth);
    window.location.reload();
  } catch (err) { console.error(err); }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      // Fetch permissions from Firestore using email as document ID
      const permSnap = await getDoc(doc(db, 'user_permissions', user.email));
      if (permSnap.exists()) {
        user.permissions = permSnap.data();
      } else {
        // Fallback permissions if not specifically defined in DB
        user.permissions = {
          allowedBranches: ['All Branches', 'Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf']
        };
      }

      // Enforce permission on current filter state
      if (user.permissions.allowedBranches && !user.permissions.allowedBranches.includes(filterState.branch)) {
        filterState.branch = user.permissions.allowedBranches[0];
      }
    } catch (err) {
      console.error("Error fetching user permissions:", err);
    }
  }

  currentUser = user;
  if (user) {
    // Define Routes
    router
      .add('/dashboard', () => { currentTab = 'dashboard'; activeSubTab = null; buildShell(); })
      .add('/expenses', () => { currentTab = 'expenses'; activeSubTab = 'cashier'; buildShell(); })
      .add('/expenses/:tab', (params) => { currentTab = 'expenses'; activeSubTab = params.tab; buildShell(); })
      .add('/channels/:id', (params) => { currentTab = params.id; activeSubTab = 'history'; buildShell(); })
      .add('/channels/:id/:sub', (params) => { currentTab = params.id; activeSubTab = params.sub; buildShell(); })
      .add('/pantry-analysis', () => { currentTab = 'pantry_analysis'; activeSubTab = null; buildShell(); })
      .add('/opex', () => { currentTab = 'opex'; activeSubTab = null; buildShell(); })
      .add('/settings', () => { currentTab = 'settings'; activeSubTab = null; buildShell(); })
      .init();
  } else {
    buildShell();
  }
});

initDarkMode();

// --- Global Utilities (Toast & Modal) ---

window.showToast = (message, type = 'info') => {
  const container = document.getElementById('toast-container') || (() => {
    const div = document.createElement('div');
    div.id = 'toast-container';
    div.className = 'fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none';
    document.body.appendChild(div);
    return div;
  })();

  const toast = document.createElement('div');
  const bgMap = {
    success: 'bg-emerald-500',
    error: 'bg-rose-500',
    info: 'bg-[#96588a]',
    warning: 'bg-amber-500'
  };
  const iconMap = {
    success: 'check-circle',
    error: 'alert-circle',
    info: 'info',
    warning: 'alert-triangle'
  };

  toast.className = `flex items-center gap-3 px-6 py-4 rounded-2xl text-white shadow-2xl animate-toast-in pointer-events-auto backdrop-blur-md ${bgMap[type] || bgMap.info} border border-white/20`;
  toast.innerHTML = `
    <i data-lucide="${iconMap[type] || 'info'}" class="w-5 h-5"></i>
    <p class="text-[11px] font-black uppercase tracking-widest">${message}</p>
  `;

  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.classList.replace('animate-toast-in', 'animate-toast-out');
    setTimeout(() => toast.remove(), 500);
  }, 4000);
};

window.showConfirmModal = (title, message, confirmText = 'Confirm') => {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-slate-900/40 z-[10000] flex items-center justify-center p-4 animate-fade-in';
    overlay.innerHTML = `
      <div class="bg-white/50 dark:bg-[#343434]/50 p-8 rounded-[2.5rem] backdrop-blur-2xl max-w-sm w-full shadow-2xl animate-scale-up text-center space-y-6 backdrop-blur-xl">
        <div class="w-16 h-16 bg-rose-50 dark:bg-rose-500/10 rounded-full flex items-center justify-center mx-auto text-rose-500">
           <i data-lucide="help-circle" class="w-8 h-8"></i>
        </div>
        <div class="space-y-2">
           <h3 class="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white">${title}</h3>
           <p class="text-[11px] font-bold text-slate-800 dark:text-white uppercase tracking-widest leading-relaxed">${message}</p>
        </div>
        <div class="flex gap-3">
           <button id="modal-cancel" class="flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-rose-500/80 hover:bg-rose-500/70 transition-all dark:text-slate-300">Cancel</button>
           <button id="modal-confirm" class="flex-1 py-4 bg-green-500/80 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] hover:bg-green-500/70 transition-all">${confirmText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();

    overlay.querySelector('#modal-cancel').onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#modal-confirm').onclick = () => { overlay.remove(); resolve(true); };
  });
};
