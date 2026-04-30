// src/main.js
import './style.css';
import { renderSidebar } from './components/Sidebar.js';
import { renderHeader } from './components/Header.js';
import { renderDashboard } from './pages/Dashboard.js';
import { renderChannelPage } from './pages/ChannelPage.js';
import { renderExpensesPage } from './pages/Expenses.js';
import { renderSettings } from './pages/Settings.js';
import { renderLoginPage } from './pages/Login.js';
import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';

let currentUser = null;
let isSidebarCollapsed = false;
let currentTab = 'dashboard';

const PAGE_TITLES = {
  dashboard: ['Dashboard',    'Revenue overview across all channels', null],
  dinein:    ['Dine In',      'In-house dining revenue', 'id_VcqlrDV_1777185371840.svg'],
  grabfood:  ['GrabFood',     'GrabFood delivery channel', 'GrabFood.svg'],
  foodpanda: ['FoodPanda',    'FoodPanda delivery channel', 'Foodpanda.svg'],
  online:    ['Online Order', 'Direct online orders', 'WooCommerce.svg'],
  expenses:  ['Expenses',     'Petty cash & liquidation tracking', null],
  settings:  ['Settings',     'App configuration & preferences', null],
};

const PAGE_MAP = {
  dashboard: () => renderDashboard(currentUser),
  dinein:    () => renderChannelPage('dinein'),
  grabfood:  () => renderChannelPage('grabfood'),
  foodpanda: () => renderChannelPage('foodpanda'),
  online:    () => renderChannelPage('online'),
  expenses:  () => renderExpensesPage(),
  settings:  () => renderSettings(),
};

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

  // 1. If shell already exists, don't recreate it (prevents flickering)
  let sidebarContainer = document.getElementById('sidebar-container');
  let mainContentContainer = document.getElementById('main-container');

  if (!sidebarContainer || !mainContentContainer) {
    app.innerHTML = '';
    
    sidebarContainer = document.createElement('div');
    sidebarContainer.id = 'sidebar-container';
    app.appendChild(sidebarContainer);

    mainContentContainer = document.createElement('div');
    mainContentContainer.id = 'main-container';
    mainContentContainer.className = 'main-content flex flex-col min-h-screen transition-all duration-300';
    app.appendChild(mainContentContainer);
  }

  // 2. Update Sidebar (only if tab changed or first load)
  sidebarContainer.innerHTML = '';
  const sidebar = renderSidebar(currentTab, navigateTo, isSidebarCollapsed, toggleSidebar);
  sidebarContainer.appendChild(sidebar);

  // 3. Update Header
  const [title, subtitle, logoUrl] = PAGE_TITLES[currentTab] || ['Dashboard', '', null];
  const headerContainer = document.getElementById('header-container') || document.createElement('div');
  headerContainer.id = 'header-container';
  headerContainer.innerHTML = '';
  
  const currentRange = document.getElementById('db-date-range')?.value || filterState.dateRange;
  const header = renderHeader(title, subtitle, toggleDarkMode, logoUrl, filterState.branch, currentRange, currentUser, handleSignOut);
  headerContainer.appendChild(header);

  if (!mainContentContainer.contains(headerContainer)) {
    mainContentContainer.appendChild(headerContainer);
  }

  // 4. Content Area
  let contentArea = document.getElementById('page-content');
  if (!contentArea) {
    contentArea = document.createElement('div');
    contentArea.id = 'page-content';
    contentArea.className = 'flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 pt-[64px]';
    mainContentContainer.appendChild(contentArea);
  }

  renderPage(currentTab);
  attachFilterListeners();
}

async function renderPage(tabId) {
  const contentArea = document.getElementById('page-content');
  if (!contentArea) return;
  
  // Show loading spinner
  contentArea.innerHTML = '<div class="flex items-center justify-center h-full"><div class="w-12 h-12 border-4 border-[#96588a]/20 border-t-[#96588a] rounded-full animate-spin"></div></div>';
  
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
      renderPage(currentTab);
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
      renderPage(currentTab);
    });
  }
}

function navigateTo(tabId) {
  if (currentTab === tabId) return;
  currentTab = tabId;
  buildShell();
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

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  buildShell();
});

initDarkMode();
