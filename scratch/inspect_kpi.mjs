// Read-only schema/coverage check. Never prints Firebase credentials or order IDs.
import { calculateMetrics } from '../src/utils/kpiMetrics.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, getDocsFromServer as getDocs, where, getDocFromServer, doc, terminate } from 'firebase/firestore';
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
}));
const app = initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID });
const db = getFirestore(app);
const timeout = setTimeout(() => { console.error('Read timed out'); process.exit(2); }, 20000);
const datasets = {};
try {
  if (process.argv.includes('--ayala-hours')) {
    const sales = await getDocs(query(collection(db, 'daily_sales'), where('branchId', '==', 'Ayala Cloverleaf'), where('channelId', '==', 'dinein'), where('date', '==', '2026-09-20')));
    const target = await getDocFromServer(doc(db, 'kpi_targets', 'target_AyalaCloverleaf'));
    console.log(JSON.stringify({ target: target.exists() ? { shift1Time: target.data().shift1Time, shift2Time: target.data().shift2Time } : null, sales: sales.docs.map(d => { const r = d.data(); return { date: r.date, financials: r.financials, hourlyNet: r.hourlyNet, productImport: Boolean(r.productImport) }; }) }));
    clearTimeout(timeout);
    await terminate(db);
    await deleteApp(app);
    process.exit(0);
  }
  for (const name of (process.argv.includes('--drink-audit') ? ['daily_sales'] : ['daily_sales', 'grab_adjustments', 'kpi_targets', 'kpi_settings'])) {
    try {
      const q = ['daily_sales', 'grab_adjustments'].includes(name)
        ? query(collection(db, name), where('date', '>=', '2026-09-01'), where('date', '<', '2026-10-01'))
        : query(collection(db, name), limit(6));
      const snapshot = await getDocs(q);
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      datasets[name] = records;
      if (process.argv.includes('--drink-audit')) {
        const branches = [...new Set(records.filter(row => row.channelId === 'dinein').map(row => row.branchId))];
        for (const branch of branches) {
          const days = records.filter(row => row.channelId === 'dinein' && row.branchId === branch).sort((a,b) => a.date.localeCompare(b.date));
          console.log('DRINK_AUDIT', JSON.stringify({ branch, days: days.map(row => ({ date: row.date, orders: row.orders,
            drinks: row.breakdown?.kpi?.drinkOrders === undefined ? 'FIELD_ABSENT' : row.breakdown.kpi.drinkOrders,
            rule: row.breakdown?.kpi?.drinkRule ?? null, batch: row.importBatchId,
            updated: row.updatedAt?.toDate?.().toISOString() ?? null })) }));
        }
        const batches = [...new Set(records.filter(row => row.channelId === 'dinein' && row.branchId !== 'Ayala Cloverleaf').map(row => row.importBatchId))].filter(Boolean);
        for (const batch of batches) {
          const log = await getDocFromServer(doc(db, 'import_logs', batch));
          if (log.exists()) { const data = log.data(); console.log('BATCH', JSON.stringify({ id: batch, fields: Object.keys(data), type: data.type, branch: data.branchId, mode: data.mode, rowCount: data.rowCount, timestamp: data.timestamp?.toDate?.().toISOString() })); }
        }
        const batchFrequency = {};
        for (const row of records.filter(row => row.channelId === 'dinein')) if (row.importBatchId) batchFrequency[row.importBatchId] = (batchFrequency[row.importBatchId] || 0) + 1;
        const newestBatch = Object.keys(batchFrequency).sort((a,b) => batchFrequency[b] - batchFrequency[a])[0];
        const allBatch = await getDocs(query(collection(db, 'daily_sales'), where('importBatchId', '==', newestBatch)));
        const dates = {};
        for (const record of allBatch.docs) {
          const row = record.data();
          (dates[row.date] ||= []).push({ branch: row.branchId, orders: row.orders, drinks: row.breakdown?.kpi?.drinkOrders, hours: Object.keys(row.hourlyNet || {}) });
        }
        console.log('ALL_BATCH_DATES', JSON.stringify({ batch: newestBatch, documents: allBatch.size, dates }));
        continue;
      }

      if (name === 'daily_sales') {
        const groups = {};
        for (const data of records) {
          const key = data.branchId + '/' + data.channelId;
          const group = groups[key] ||= { count: 0, hourly: 0, drinks: 0, dates: [] };
          group.count++;
          if (Object.keys(data.hourlyNet || {}).length) group.hourly++;
          if (data.breakdown?.kpi?.drinkOrders !== undefined) group.drinks++;
          group.dates.push(data.date);
        }
        for (const group of Object.values(groups)) { group.latest = group.dates.sort().at(-1); delete group.dates; }
        console.log(name, JSON.stringify(groups));
      } else if (name === 'grab_adjustments') {
        const groups = {};
        for (const data of records) groups[data.reasonGroup] = (groups[data.reasonGroup] || 0) + 1;
        console.log(name, JSON.stringify(groups));
      } else console.log(name, JSON.stringify(records.map(data => ({ branch: data.id, monthlyNet: data.monthlyNet, dailyDineIn: data.daily_dinein, shift1Time: data.shift1Time, shift2Time: data.shift2Time }))));
    } catch (error) { console.error(name, error.code || error.message); }
  }
  for (const target of datasets.kpi_targets || []) {
    const branch = (datasets.kpi_settings || []).find(row => 'target_' + row.id.replace(/\s+/g, '') === target.id)?.id;
    if (!branch) continue;
    const rows = (datasets.daily_sales || []).filter(row => row.branchId === branch);
    const result = calculateMetrics(rows, target, { adjustments: datasets.grab_adjustments, incidentAvailable: Boolean(datasets.grab_adjustments),
      dailyTarget: datasets.kpi_settings.find(row => row.id === branch).daily_dinein, monthDays: 30 });
    const dineIn = rows.filter(row => row.channelId === 'dinein');
    const expectedNet = dineIn.reduce((sum, row) => sum + row.financials.net, 0);
    const expectedOrders = dineIn.reduce((sum, row) => sum + row.orders, 0);
    assert.ok(Math.abs(result.monthlyNetActual - expectedNet) < 0.01);
    assert.ok(Math.abs(result.monthlyAvoActual - expectedNet / expectedOrders) < 0.01);
    assert.equal(result.userXp, result.dailyXp + result.monthlyXp);
    console.log('VERIFIED', JSON.stringify({ branch, date: result.latestBusinessDate, dineInNet: result.monthlyNetActual,
      dineInOrders: expectedOrders, avo: result.monthlyAvoActual, shift1: result.shift1Actual, shift2: result.shift2Actual,
      drink: result.drinkActual, monthlyIncidents: result.monthlyIncidentCount, foodAppOrders: result.monthlyFoodAppOrders,
      hitRate: result.hitRateActual, provisionalXp: result.userXp }));
  }

} finally { clearTimeout(timeout); await terminate(db); await deleteApp(app); }
