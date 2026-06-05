import { db } from '../firebase';
import { doc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';

export function renderAdminPage() {
  const page = document.createElement('div');
  page.className = 'p-6 page-enter max-w-6xl mx-auto h-full flex flex-col space-y-6';

  const ALL_BRANCHES = ['Pioneer Center', 'Catholic Trade', 'Unimart Capitol', 'Ayala Cloverleaf'];
  const ALL_TABS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'dinein', label: 'Dine In' },
    { id: 'grabfood', label: 'GrabFood' },
    { id: 'foodpanda', label: 'FoodPanda' },
    { id: 'online', label: 'Online Order' },
    { id: 'expenses', label: 'Expenses (All)' },
    { id: 'expenses/cashier', label: 'Expenses - Cashier' },
    { id: 'expenses/ledger', label: 'Expenses - Ledger' },
    { id: 'expenses/audit', label: 'Expenses - Audit' },
    { id: 'pantry_analysis', label: 'Pantry Analysis' },
    { id: 'opex', label: 'OPEX' },
    { id: 'pnl', label: 'P&L' },
    { id: 'settings', label: 'Settings' }
  ];

  let rawUsers = [];
  let searchQuery = '';
  let roleFilter = 'all'; // 'all', 'admin', 'manager'

  page.innerHTML = `
    <!-- Filter, Search & Action Toolbar -->
    <div class="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 p-4 rounded-[1.8rem] bg-slate-50/50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 shrink-0 shadow-sm">
      <div class="flex flex-col sm:flex-row flex-1 items-stretch sm:items-center gap-3">
        <!-- Search Input -->
        <div class="relative flex-1 group">
          <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#96588a] transition-colors">
            <i data-lucide="search" class="w-4 h-4"></i>
          </span>
          <input type="text" id="admin-search" placeholder="Search user by email..." class="w-full pl-11 pr-4 py-3.5 bg-white dark:bg-black/20 border-2 border-transparent focus:border-[#96588a]/20 rounded-2xl text-xs font-bold text-slate-700 dark:text-white outline-none shadow-sm transition-all">
        </div>

        <!-- Segmented Role Filter -->
        <div class="flex bg-slate-100 dark:bg-black/30 p-1 rounded-2xl shrink-0 select-none">
          <button class="role-filter-btn px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[#96588a] dark:text-purple-400 bg-white dark:bg-white/10 shadow-sm transition-all" data-role="all">All Roles</button>
          <button class="role-filter-btn px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 dark:hover:text-white transition-all" data-role="admin">Admins</button>
          <button class="role-filter-btn px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 dark:hover:text-white transition-all" data-role="manager">Managers</button>
        </div>
      </div>

      <!-- Add User Action Button -->
      <button id="add-user-btn" class="px-6 py-4 bg-gradient-to-r from-[#96588a] to-[#7a4671] hover:scale-[1.02] active:scale-95 text-white rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-purple-500/10 flex items-center justify-center gap-2 shrink-0">
        <i data-lucide="user-plus" class="w-4 h-4"></i> Add User Permission
      </button>
    </div>

    <!-- Scrollable Cards Grid Container -->
    <div class="flex-1 overflow-y-auto pr-2 custom-scrollbar">
      <div id="admin-loading" class="py-20 text-center">
        <div class="inline-block w-8 h-8 border-3 border-[#96588a] border-t-transparent rounded-full animate-spin mb-3"></div>
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading User Permissions...</p>
      </div>

      <div id="users-grid" class="hidden grid grid-cols-1 gap-4 pb-8">
        <!-- Dynamically populated cards -->
      </div>
    </div>
  `;

  // Attach search listeners
  const searchInput = page.querySelector('#admin-search');
  if (searchInput) {
    searchInput.oninput = (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      filterAndRenderUsers();
    };
  }

  // Attach filter buttons
  page.querySelectorAll('.role-filter-btn').forEach(btn => {
    btn.onclick = () => {
      page.querySelectorAll('.role-filter-btn').forEach(b => {
        b.className = 'role-filter-btn flex-1 sm:flex-none text-center px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 dark:hover:text-white transition-all';
      });
      btn.className = 'role-filter-btn flex-1 sm:flex-none text-center px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest text-[#96588a] dark:text-purple-400 bg-white dark:bg-white/10 shadow-sm transition-all';
      roleFilter = btn.dataset.role;
      filterAndRenderUsers();
    };
  });

  // Attach Add User
  const addBtn = page.querySelector('#add-user-btn');
  if (addBtn) addBtn.onclick = () => openPermissionModal();

  // Load user data
  loadUsers();

  async function loadUsers() {
    const loader = page.querySelector('#admin-loading');
    const grid = page.querySelector('#users-grid');

    if (loader) loader.classList.remove('hidden');
    if (grid) grid.classList.add('hidden');

    try {
      const snap = await getDocs(collection(db, 'user_permissions'));
      rawUsers = [];
      snap.forEach(doc => {
        rawUsers.push({ email: doc.id, ...doc.data() });
      });

      // Sort alphabetically by email
      rawUsers.sort((a, b) => a.email.localeCompare(b.email));

      filterAndRenderUsers();

      if (loader) loader.classList.add('hidden');
      if (grid) grid.classList.remove('hidden');

    } catch (err) {
      console.error("Error loading permissions:", err);
      if (grid) {
        grid.innerHTML = `<div class="p-10 text-center text-xs text-rose-500 font-bold uppercase tracking-widest">Error: ${err.message}</div>`;
      }
      if (loader) loader.classList.add('hidden');
      if (grid) grid.classList.remove('hidden');
    }
  }

  function filterAndRenderUsers() {
    const grid = page.querySelector('#users-grid');
    if (!grid) return;

    // Filter list
    const filtered = rawUsers.filter(user => {
      const matchesSearch = user.email.toLowerCase().includes(searchQuery);
      const matchesRole = roleFilter === 'all'
        ? true
        : roleFilter === 'admin' ? !!user.isAdmin : !user.isAdmin;
      return matchesSearch && matchesRole;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="py-20 text-center border border-dashed border-slate-200 dark:border-white/5 rounded-[2rem] bg-slate-50/10 dark:bg-white/[0.005]">
          <i data-lucide="users" class="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3"></i>
          <p class="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">No users match your criteria</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    grid.innerHTML = filtered.map(user => {
      const branches = Array.isArray(user.allowedBranches) ? user.allowedBranches : [];
      const tabs = Array.isArray(user.allowedTabs) ? user.allowedTabs : [];
      const isAdmin = !!user.isAdmin;

      // Initials for avatar
      const initials = user.email.substring(0, 2).toUpperCase();

      // Branch Badges logic
      let branchBadges = '';
      if (isAdmin || branches.length === ALL_BRANCHES.length || branches.includes('All Branches')) {
        branchBadges = `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20"><span class="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>All Branches</span>`;
      } else if (branches.length === 0) {
        branchBadges = `<span class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider italic">No Branch Access</span>`;
      } else {
        branchBadges = branches.map(b => `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-[9px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/15">${b}</span>`).join('');
      }

      // Tab Badges logic
      let tabBadges = '';
      if (isAdmin || tabs.length === ALL_TABS.length) {
        tabBadges = `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20"><span class="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>Full Access</span>`;
      } else if (tabs.length === 0) {
        tabBadges = `<span class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider italic">No Tab Access</span>`;
      } else {
        tabBadges = tabs.map(t => {
          const label = ALL_TABS.find(x => x.id === t)?.label || t;
          return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-500/10 text-[9px] font-black uppercase tracking-wider text-[#96588a] dark:text-purple-400 border border-purple-100 dark:border-purple-500/15">${label}</span>`;
        }).join('');
      }

      // Role badge
      const roleBadge = isAdmin
        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-500/10 text-[8px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400 border border-rose-100 dark:border-rose-500/20">Admin</span>`
        : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/5">Manager</span>`;

      return `
        <div class="p-6 rounded-[2rem] bg-white/50 dark:bg-white/[0.01] border border-slate-100 dark:border-white/5 backdrop-blur-xl hover:bg-white dark:hover:bg-white/[0.03] hover:shadow-xl hover:shadow-purple-500/[0.01] transition-all duration-300 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          
          <!-- Profile & Role -->
          <div class="flex items-center gap-4 shrink-0">
            <div class="w-12 h-12 rounded-full bg-gradient-to-tr from-[#96588a] to-[#c78ab9] text-white flex items-center justify-center text-sm font-black uppercase tracking-wider shrink-0 shadow-md">
              ${initials}
            </div>
            <div class="space-y-1">
              <h4 class="text-sm font-black text-slate-800 dark:text-slate-100 tracking-tight leading-none">${user.email}</h4>
              <div class="flex items-center gap-2 mt-1">
                ${roleBadge}
              </div>
            </div>
          </div>

          <!-- Configuration Details -->
          <div class="flex-1 flex flex-col gap-3 min-w-0 w-full md:border-l md:border-slate-100 md:dark:border-white/5 md:pl-6 py-1">
            <!-- Allowed Branches -->
            <div class="flex flex-col sm:flex-row sm:items-center gap-2">
              <span class="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] w-24 shrink-0">Branches:</span>
              <div class="flex flex-wrap gap-1.5 min-w-0">
                ${branchBadges}
              </div>
            </div>

            <!-- Allowed Tabs -->
            <div class="flex flex-col sm:flex-row sm:items-center gap-2">
              <span class="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] w-24 shrink-0">Page Tabs:</span>
              <div class="flex flex-wrap gap-1.5 min-w-0">
                ${tabBadges}
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end border-t border-slate-100 dark:border-white/5 pt-4 md:pt-0 md:border-t-0">
            <button class="edit-user-btn px-4 py-3 bg-slate-100 hover:bg-[#96588a] hover:text-white dark:bg-white/5 dark:hover:bg-[#96588a] text-slate-700 dark:text-slate-300 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 hover:scale-[1.03] active:scale-95 shadow-sm" data-email="${user.email}">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Edit
            </button>
            <button class="delete-user-btn px-4 py-3 bg-rose-50 dark:bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest border border-rose-100 dark:border-rose-500/20 transition-all flex items-center gap-1.5 hover:scale-[1.03] active:scale-95 shadow-sm" data-email="${user.email}">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete
            </button>
          </div>

        </div>
      `;
    }).join('');

    // Attach Action Listeners
    grid.querySelectorAll('.edit-user-btn').forEach(btn => {
      btn.onclick = () => {
        const email = btn.dataset.email;
        const targetUser = rawUsers.find(u => u.email === email);
        if (targetUser) openPermissionModal(targetUser);
      };
    });

    grid.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.onclick = async () => {
        const email = btn.dataset.email;
        if (await window.showConfirmModal('Delete User Permission', `Are you sure you want to remove permissions config for ${email}? They will reset to default access values.`, 'Delete')) {
          try {
            await deleteDoc(doc(db, 'user_permissions', email));
            window.showToast(`Deleted permissions for ${email}`, 'success');
            loadUsers();
          } catch (err) {
            console.error("Error deleting user:", err);
            window.showToast("Failed to delete user permissions: " + err.message, "error");
          }
        }
      };
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function openPermissionModal(user = null) {
    const isEdit = !!user;
    const email = isEdit ? user.email : '';
    const userBranches = isEdit && Array.isArray(user.allowedBranches) ? user.allowedBranches : [];
    const userTabs = isEdit && Array.isArray(user.allowedTabs) ? user.allowedTabs : [];
    const isAdmin = isEdit ? !!user.isAdmin : false;

    // Create Modal Overlay
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-slate-900/40 z-[10000] flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm';
    overlay.innerHTML = `
      <div class="bg-white/95 dark:bg-[#1a1a1a]/95 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-2xl max-w-xl w-full animate-scale-up space-y-6 flex flex-col max-h-[90vh] overflow-hidden backdrop-blur-xl">
        <div class="flex justify-between items-start">
          <div>
            <h3 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter leading-none">${isEdit ? 'Edit Permissions' : 'Create User Permission'}</h3>
            <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-2">Adjust branch and dashboard page privileges</p>
          </div>
          <button id="modal-close-btn" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white transition-all">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6 py-2">
          <!-- Email Input -->
          <div class="space-y-2">
            <label class="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1">User Email Address</label>
            <input type="email" id="modal-email" value="${email}" ${isEdit ? 'disabled' : ''} class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-white/5 border-2 border-transparent focus:bg-white dark:focus:bg-black/20 focus:border-[#96588a]/30 transition-all text-xs font-bold text-slate-700 dark:text-white outline-none shadow-sm disabled:opacity-50 disabled:cursor-not-allowed" placeholder="manager@example.com">
          </div>

          <!-- Role Toggle -->
          <div class="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 group hover:bg-slate-100/50 dark:hover:bg-white/[0.04] transition-all">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center text-rose-500">
                <i data-lucide="shield" class="w-4 h-4"></i>
              </div>
              <div>
                <p class="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight leading-none">Administrator Account</p>
                <p class="text-[8px] text-slate-400 font-semibold uppercase tracking-wider mt-1.5">Bypasses all restrictions (full branch, tab, & admin panel access)</p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="modal-admin" class="sr-only peer" ${isAdmin ? 'checked' : ''}>
              <div class="w-9 h-5 bg-slate-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <!-- Allowed Branches Checklist -->
          <div class="space-y-2">
            <label class="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1">Allowed Branches Access</label>
            <div class="grid grid-cols-2 gap-3">
              ${ALL_BRANCHES.map((branch) => {
      const checked = userBranches.includes(branch) ? 'checked' : '';
      return `
                  <label class="relative flex items-center gap-3 p-4 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01] cursor-pointer hover:bg-slate-100/50 dark:hover:bg-white/5 transition-all select-none group">
                    <input type="checkbox" name="modal-branch" value="${branch}" ${checked} class="peer sr-only">
                    <!-- Custom Checkbox -->
                    <div class="w-4.5 h-4.5 rounded-lg border-2 border-slate-300 dark:border-white/10 peer-checked:bg-[#96588a] peer-checked:border-[#96588a] flex items-center justify-center transition-all">
                      <i data-lucide="check" class="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity"></i>
                    </div>
                    <span class="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 peer-checked:text-[#96588a] dark:peer-checked:text-purple-400 transition-colors">${branch}</span>
                  </label>
                `;
    }).join('')}
            </div>
          </div>

          <!-- Allowed Tabs Checklist -->
          <div class="space-y-2">
            <label class="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1">Allowed Tabs Access</label>
            <div class="grid grid-cols-2 gap-3">
              ${ALL_TABS.map((tab) => {
      const checked = userTabs.includes(tab.id) ? 'checked' : '';
      return `
                  <label class="relative flex items-center gap-3 p-4 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01] cursor-pointer hover:bg-slate-100/50 dark:hover:bg-white/5 transition-all select-none group">
                    <input type="checkbox" name="modal-tab" value="${tab.id}" ${checked} class="peer sr-only">
                    <!-- Custom Checkbox -->
                    <div class="w-4.5 h-4.5 rounded-lg border-2 border-slate-300 dark:border-white/10 peer-checked:bg-[#96588a] peer-checked:border-[#96588a] flex items-center justify-center transition-all">
                      <i data-lucide="check" class="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity"></i>
                    </div>
                    <span class="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 peer-checked:text-[#96588a] dark:peer-checked:text-purple-400 transition-colors">${tab.label}</span>
                  </label>
                `;
    }).join('')}
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="flex gap-3 border-t border-slate-100 dark:border-white/5 pt-4 shrink-0">
          <button id="modal-cancel-btn" class="flex-1 py-4 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Cancel</button>
          <button id="modal-save-btn" class="flex-1 py-4 bg-gradient-to-r from-[#96588a] to-[#7a4671] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2">
            <i data-lucide="save" class="w-4 h-4"></i> Save Permissions
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();

    // Close handlers
    const closeBtn = overlay.querySelector('#modal-close-btn');
    if (closeBtn) closeBtn.onclick = () => overlay.remove();
    const cancelBtn = overlay.querySelector('#modal-cancel-btn');
    if (cancelBtn) cancelBtn.onclick = () => overlay.remove();

    // Save handler
    const saveBtn = overlay.querySelector('#modal-save-btn');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const inputEmail = overlay.querySelector('#modal-email').value.trim().toLowerCase();
        if (!inputEmail) {
          window.showToast("Email address is required", "error");
          return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(inputEmail)) {
          window.showToast("Please enter a valid email address", "error");
          return;
        }

        const isUserAdmin = overlay.querySelector('#modal-admin').checked;

        const selectedBranches = [];
        overlay.querySelectorAll('input[name="modal-branch"]:checked').forEach(cb => {
          selectedBranches.push(cb.value);
        });

        const selectedTabs = [];
        overlay.querySelectorAll('input[name="modal-tab"]:checked').forEach(cb => {
          selectedTabs.push(cb.value);
        });

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Saving...';

        try {
          const payload = {
            allowedBranches: selectedBranches,
            allowedTabs: selectedTabs,
            isAdmin: isUserAdmin
          };

          await setDoc(doc(db, 'user_permissions', inputEmail), payload);

          window.showToast(`Permissions saved for ${inputEmail}`, "success");
          overlay.remove();
          loadUsers();
        } catch (err) {
          console.error("Error saving user permissions:", err);
          window.showToast("Failed to save permissions: " + err.message, "error");
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Save Permissions';
          if (window.lucide) window.lucide.createIcons();
        }
      };
    }
  }

  return page;
}
