import { db } from '../firebase.js';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auditDates } from '../utils/salesAudit.js';

const channels = { dinein: 'Dine In', grabfood: 'GrabFood', foodpanda: 'FoodPanda', online: 'Online Order' };
export function showSalesAuditModal(user, branches) {
  if (document.querySelector('.sales-audit-dialog')) return;
  const admin = user?.permissions?.isAdmin || user?.email === 'jimmie.somot@gmail.com';
  const allowed = Object.keys(channels).filter(c => admin || !user?.permissions?.allowedTabs || user.permissions.allowedTabs.includes(c));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const end = yesterday.toISOString().slice(0, 10);
  const opener = document.activeElement;
  const modal = document.createElement('dialog');
  modal.className = 'sales-audit-dialog';
  modal.setAttribute('aria-labelledby', 'sales-audit-title');
  modal.innerHTML = `<header><div><h2 id="sales-audit-title">Sales Data Check</h2><p>Check missing reports through ${end} · Philippine time</p></div><button type="button" data-close aria-label="Close">✕</button></header>
    <div class="sales-audit-filters"><label>Branch<select data-branch><option value="">All permitted branches</option></select></label><label>Channel<select data-channel><option value="">All permitted channels</option></select></label><label>Audit from<input type="date" data-from max="${end}" aria-label="Audit start date"></label><button type="button" data-refresh>Refresh</button></div>
    <p class="sales-audit-note">Default: first recorded report per channel → yesterday. Choose a start date to check earlier days. Missing records need review; closed days and days with no sales may be valid. This checks report presence, not import accuracy.</p>
    <p data-status role="status"></p><div class="sales-audit-results"></div>`;
  const branchSelect = modal.querySelector('[data-branch]');
  const channelSelect = modal.querySelector('[data-channel]');
  branches.forEach(b => branchSelect.add(new Option(b, b)));
  allowed.forEach(c => channelSelect.add(new Option(channels[c], c)));
  let generation = 0;
  let rows = [];
  const status = modal.querySelector('[data-status]');
  const results = modal.querySelector('.sales-audit-results');
  const startInput = modal.querySelector('[data-from]');
  function render() {
    results.replaceChildren();
    if (!startInput.checkValidity()) { status.textContent = 'Choose a valid start date no later than yesterday.'; return; }
    let missingCount = 0, unknown = 0;
    const visible = rows.filter(r => (!branchSelect.value || r.branch === branchSelect.value) && (!channelSelect.value || r.channel === channelSelect.value));
    visible.forEach(row => {
      const audit = auditDates(row.records || [], end, startInput.value);
      const uncertain = row.error || !audit.from;
      if (uncertain) unknown++;
      else missingCount += audit.missing.length;
      const card = document.createElement('article');
      card.className = 'sales-audit-row';
      const heading = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `${row.branch} · ${channels[row.channel]}`;
      const detail = document.createElement('p');
      detail.textContent = row.error ? 'Could not check. Refresh to retry.' : !audit.from ? 'No history — choose an audit start date.' : `${audit.missing.length ? `${audit.missing.length} missing reports` : 'No missing dates'} · ${audit.from} → ${end} · Latest: ${audit.latest || 'None'}`;
      heading.append(title, detail);
      const action = document.createElement('button');
      action.type = 'button';
      action.textContent = 'Open Sales Data ↗';
      action.onclick = () => {
        modal.close();
        window.dispatchEvent(new CustomEvent('open-sales-audit-channel', { detail: { channel: row.channel, branch: row.branch, from: audit.missing[0] || audit.from || end, to: audit.missing.at(-1) || end } }));
      };
      card.append(heading, action);
      if (!row.error && audit.missing.length) {
        const dates = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'View missing dates';
        const list = document.createElement('p');
        list.className = 'sales-audit-dates';
        list.textContent = audit.missing.join(' · ');
        dates.append(summary, list);
        card.append(dates);
      }
      results.append(card);
    });
    status.textContent = `${missingCount} missing reports · ${visible.length} branch/channel pairs${unknown ? ` · ${unknown} need verification` : ''}`;
  }
  async function load() {
    const request = ++generation;
    rows = [];
    results.replaceChildren();
    status.textContent = 'Checking report history…';
    const loaded = await Promise.all(branches.flatMap(branch => allowed.map(async channel => {
      try {
        const snap = await getDocs(query(collection(db, 'daily_sales'), where('branchId', '==', branch), where('channelId', '==', channel)));
        return { branch, channel, records: snap.docs.map(d => ({ date: d.data().date })) };
      } catch (error) {
        console.warn('Sales audit query failed', branch, channel, error);
        return { branch, channel, error: true };
      }
    })));
    if (request !== generation || !modal.open) return;
    rows = loaded;
    render();
  }
  modal.querySelector('[data-close]').onclick = () => modal.close();
  modal.querySelector('[data-refresh]').onclick = load;
  [branchSelect, channelSelect, startInput].forEach(input => input.onchange = () => { if (rows.length) render(); });
  const cleanup = () => modal.close();
  window.addEventListener('cleanup-page', cleanup);
  modal.addEventListener('close', () => { generation++; window.removeEventListener('cleanup-page', cleanup); modal.remove(); opener?.focus(); }, { once: true });
  document.body.append(modal);
  modal.showModal();
  load();
}
