import { db } from '../firebase.js';
import { collection, query, where, getDocsFromServer, writeBatch, serverTimestamp } from 'firebase/firestore';
import { parseAyalaProducts } from '../utils/ayalaProducts.js';

export function showAyalaProductImport(onSaved) {
  const modal = document.createElement('dialog');
  modal.className = 'sales-audit-dialog';
  modal.innerHTML = `<header><h2>Ayala · Product Import</h2><button data-close aria-label="Close">✕</button></header><p class="sales-audit-note">Import a complete product report for each day. Replaces hourly sales and drink attachment only; daily revenue and orders stay unchanged. Import the daily sales report first.</p><input type="file" accept=".xlsx,.xls,.csv" aria-label="Product report"><p data-status role="status"></p><div class="sales-audit-results"></div><button data-save disabled>Save Product Data</button>`;
  let days = null;
  let busy = false;
  const status = modal.querySelector('[data-status]');
  const save = modal.querySelector('[data-save]');
  const input = modal.querySelector('input');
  const footer = document.createElement('footer');
  footer.className = 'product-import-footer';
  footer.append(status, save);
  modal.append(footer);
  save.type = 'button';
  modal.querySelector('[data-close]').type = 'button';
  modal.querySelector('[data-close]').onclick = () => { if (!busy) modal.close(); };
  modal.oncancel = e => { if (busy) e.preventDefault(); };
  modal.onclose = () => modal.remove();
  input.onchange = async () => {
    days = null; save.disabled = true;
    modal.querySelector('.sales-audit-results').replaceChildren();
    if (!input.files[0]) return;
    input.disabled = true;
    status.textContent = 'Reading product report…';
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await input.files[0].arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '', blankrows: true });
      const decode = value => {
        let parts;
        if (typeof value === 'number') parts = XLSX.SSF.parse_date_code(value);
        else {
          const match = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::\d{2})?$/);
          const us = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
          if (match) parts = { y: +match[1], m: +match[2], d: +match[3], H: +match[4], M: +match[5] };
          else if (us) parts = { y: +us[3], m: +us[1], d: +us[2], H: us[6] ? +us[4] % 12 + (us[6].toUpperCase() === 'PM' ? 12 : 0) : +us[4], M: +us[5] };
        }
        if (!parts || parts.H > 23 || parts.M > 59) return null;
        const date = `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
        const checked = new Date(`${date}T00:00:00Z`);
        if (Number.isNaN(+checked) || checked.toISOString().slice(0, 10) !== date) return null;
        return { date, hour: String(parts.H).padStart(2, '0') };
      };
      days = parseAyalaProducts(rows, decode);
      for (const [date, day] of Object.entries(days).sort()) {
        const row = document.createElement('article');
        row.className = 'sales-audit-row';
        row.textContent = `${date} · ${day.bills} bills · Food: ${day.foodBills} · Food + Drink: ${day.attachedBills} · Rate: ${day.foodBills ? (day.attachedBills / day.foodBills * 100).toFixed(1) + '%' : 'N/A'}`;
        modal.querySelector('.sales-audit-results').append(row);
      }
      status.textContent = 'Preview ready. Dates in text use MM/DD/YYYY or YYYY-MM-DD.';
      save.disabled = false;
    } catch (error) { status.textContent = error.message; }
    finally { input.disabled = false; }
  };
  save.onclick = async () => {
    if (!days || busy) return;
    busy = true; save.disabled = true; input.disabled = true;
    save.textContent = 'Checking sales reports…';
    status.textContent = 'Checking saved daily sales reports before updating product data…';
    let slowSaveTimer;
    try {
      const entries = Object.entries(days);
      if (entries.length > 450) throw Error('Please import at most 450 days per file.');
      let readTimer;
      const snapshot = await Promise.race([
        getDocsFromServer(query(collection(db, 'daily_sales'), where('branchId', '==', 'Ayala Cloverleaf'), where('channelId', '==', 'dinein'))),
        new Promise((_, reject) => { readTimer = setTimeout(() => reject(Error('Could not reach the server within 20 seconds. Check your connection and retry. No product data has been sent.')), 20000); })
      ]).finally(() => clearTimeout(readTimer));
      const recordsByDate = new Map();
      snapshot.forEach(record => {
        const date = record.data().date;
        if (!recordsByDate.has(date)) recordsByDate.set(date, []);
        recordsByDate.get(date).push(record.ref);
      });
      const missing = entries.filter(([date]) => !recordsByDate.has(date)).map(([date]) => date);
      if (missing.length) throw Error(`Import daily sales first: ${missing.join(', ')}`);
      const duplicates = entries.filter(([date]) => recordsByDate.get(date).length > 1).map(([date]) => date);
      if (duplicates.length) throw Error(`Multiple daily sales records found for ${duplicates.join(', ')}. Resolve duplicate daily reports before saving to avoid counting product data twice.`);
      const refs = entries.map(([date]) => recordsByDate.get(date)[0]);
      const batch = writeBatch(db);
      entries.forEach(([date, day], i) => batch.update(refs[i], {
        hourlyNet: day.hourlyNet, hourlyBills: day.hourlyBills,
        'breakdown.kpi.drinkOrders': day.attachedBills,
        'breakdown.kpi.foodOrders': day.foodBills,
        'breakdown.kpi.drinkRule': 'ayala-food-drink-v1',
        productImport: { date, bills: day.bills, importedAt: serverTimestamp() }
      }));
      save.textContent = 'Saving…';
      status.textContent = `Saving product data for ${entries.length} day(s)…`;
      slowSaveTimer = setTimeout(() => {
        status.textContent = 'Still waiting for server confirmation. Keep this window open; do not import again while this save is pending.';
      }, 15000);
      await batch.commit();
      clearTimeout(slowSaveTimer);
      status.textContent = `Saved product data for ${entries.length} day(s) successfully.`;
      save.textContent = 'Saved ✓';
      days = null;
      Promise.resolve().then(() => onSaved?.()).catch(error => console.warn('Product data saved, but history refresh failed:', error));
    } catch (error) {
      console.error('Ayala Product Import save failed:', error);
      status.textContent = `Not saved: ${error.message}${error.code ? ` (${error.code})` : ''}`;
      save.textContent = 'Retry Save';
      save.disabled = false;
    }
    finally { clearTimeout(slowSaveTimer); busy = false; input.disabled = false; }
  };
  document.body.append(modal);
  modal.showModal();
}
