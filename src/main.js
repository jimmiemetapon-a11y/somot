// src/main.js
import './style.css';
import { renderSidebar } from './components/Sidebar.js';
import { renderHeader } from './components/Header.js';
import { renderDashboard } from './pages/Dashboard.js';
import { renderChannelPage } from './pages/ChannelPage.js';
import { renderSettings } from './pages/Settings.js';
import './firebase.js';

function initDarkMode() {
  const saved = localStorage.getItem('darkMode');
  const prefDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (saved === '1' || (!saved && prefDark)) {
    document.documentElement.classList.add('dark');
  }
}

function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('darkMode', document.documentElement.classList.contains('dark') ? '1' : '0');
}

const PAGE_MAP = {
  dashboard: () => renderDashboard(),
  dinein:    () => renderChannelPage('dinein'),
  grabfood:  () => renderChannelPage('grabfood'),
  foodpanda: () => renderChannelPage('foodpanda'),
  online:    () => renderChannelPage('online'),
  settings:  () => renderSettings(),
};

const PAGE_TITLES = {
  dashboard: ['Dashboard',    'Revenue overview across all channels'],
  dinein:    ['Dine In',      'In-house dining revenue'],
  grabfood:  ['GrabFood',     'GrabFood delivery channel'],
  foodpanda: ['FoodPanda',    'FoodPanda delivery channel'],
  online:    ['Online Order', 'Direct online orders'],
  settings:  ['Settings',     'App configuration & preferences'],
};

let currentTab = 'dashboard';
let filterState = {
  branch: 'All Branches',
  from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
  to: new Date().toISOString().split('T')[0]
};

function buildShell() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';

  const sidebar = renderSidebar(currentTab, navigateTo);
  app.appendChild(sidebar);

  const main = document.createElement('div');
  main.className = 'main-content';

  const [title, subtitle] = PAGE_TITLES[currentTab] || ['Dashboard', ''];
  const header = renderHeader(title, subtitle, toggleDarkMode);
  main.appendChild(header);

  // Restore filter values and attach listeners
  setTimeout(() => {
    const b = document.getElementById('db-branch');
    const f = document.getElementById('db-from');
    const t = document.getElementById('db-to');
    if (b) {
      b.value = filterState.branch;
      b.onchange = (e) => filterState.branch = e.target.value;
    }
    if (f) {
      f.value = filterState.from;
      f.onchange = (e) => filterState.from = e.target.value;
    }
    if (t) {
      t.value = filterState.to;
      t.onchange = (e) => filterState.to = e.target.value;
    }
  }, 0);

  const contentArea = document.createElement('div');
  contentArea.id = 'page-content';
  contentArea.className = 'flex-1 overflow-auto bg-slate-50 dark:bg-slate-950';
  main.appendChild(contentArea);

  app.appendChild(main);
  renderPage(currentTab);
}

function renderPage(tabId) {
  const contentArea = document.getElementById('page-content');
  if (!contentArea) return;
  contentArea.innerHTML = '';
  const renderFn = PAGE_MAP[tabId];
  if (renderFn) {
    contentArea.appendChild(renderFn());
    setTimeout(() => {
      if (window.lucide) window.lucide.createIcons();
    }, 0);
  }
}

function navigateTo(tabId) {
  currentTab = tabId;
  buildShell();
}

initDarkMode();
buildShell();
