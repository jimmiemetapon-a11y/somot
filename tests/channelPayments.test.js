import { validateImportedPayments } from '../src/utils/paymentAmounts.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { countDineInDrinkOrders } from '../src/utils/kpiMetrics.js';

function harness(existing) {
  const writes = new Map();
  const firestore = {
    doc: (_, collection, id) => `${collection}/${id}`,
    getDoc: async () => ({ exists: () => existing !== undefined, data: () => existing }),
  };
  const context = vm.createContext({
    firestore, ...firestore, db: {}, Date, countDineInDrinkOrders, validateImportedPayments,
    saveWithAyalaDineOut: async (_, ref, data) => writes.set(ref, JSON.parse(JSON.stringify(data))),
    setDoc: async (ref, data) => writes.set(ref, JSON.parse(JSON.stringify(data))),
    serverTimestamp: () => 'timestamp',
    window: { dispatchEvent() {} }, CustomEvent: class {},
  });
  const source = readFileSync(new URL('../src/pages/ChannelPage.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace('Chart.register(...registerables);', '')
    .replace(/export /g, '')
    .replace("await import('firebase/firestore')", 'firestore');
  vm.runInContext(source, context);
  return { context, writes };
}

function calculate(context) {
  const row = (id, cash, card, transfer) => {
    const r = [];
    r[1] = id; r[5] = '2026-09-17 10:00'; r[36] = cash; r[37] = card; r[38] = transfer;
    r[44] = 'FOOD'; r[48] = 1; r[49] = 100;
    return r;
  };
  // Tender totals repeat on item rows; they must be counted once per invoice.
  return context.calculateDineIn([
    row('A', 120, 50, 30), row('A', 120, 50, 30), row('B', 0, 0, 100),
  ], vm.runInContext('CHANNEL_CONFIG.dinein', context));
}

for (const scenario of [
  { name: 'new overwrite', mode: 'overwrite' },
  { name: 'overwrite replaces old payments', mode: 'overwrite', existing: { paymentMethods: { cash: 900, bankCard: 900, bankTransfer: 900 } } },
  { name: 'merge creates missing day', mode: 'merge' },
  { name: 'merge adds existing payments', mode: 'merge', existing: { paymentMethods: { cash: 10, bankCard: 20, bankTransfer: 30 } }, expected: { cash: 130, bankCard: 70, bankTransfer: 160 } },
  { name: 'merge handles legacy missing payments', mode: 'merge', existing: {} },
]) {
  test(`Dine In import persists export fields: ${scenario.name}`, async () => {
    const { context, writes } = harness(scenario.existing);
    const result = calculate(context);
    await context.saveToDatabase('dinein', 'UST', { '2026-09-17': result }, scenario.mode);
    const saved = writes.get('daily_sales/dinein_UST_2026-09-17');
    assert.deepEqual(saved.paymentMethods, scenario.expected || { cash: 120, bankCard: 50, bankTransfer: 130 });
    assert.equal(saved.breakdown.deductions.bankCardFee, 1);
    assert.ok(Number.isFinite(saved.financials.net));
  });
}

test('zero payments remain measured zeros', async () => {
  const { context, writes } = harness();
  const result = calculate(context);
  result.paymentMethods = { cash: 0, bankCard: 0, bankTransfer: 0 };
  await context.saveToDatabase('dinein', 'UST', { '2026-09-17': result });
  assert.deepEqual(writes.get('daily_sales/dinein_UST_2026-09-17').paymentMethods, result.paymentMethods);
});

test('missing KiotViet tender totals fail before writing any day', async () => {
  const { context, writes } = harness();
  const valid = calculate(context);
  const missing = calculate(context);
  delete missing.paymentMethods;
  await assert.rejects(context.saveToDatabase('dinein', 'UST', { '2026-09-20': valid, '2026-09-21': missing }), /Payment data is missing/);
  assert.equal(writes.size, 0);
});

test('Grab merge preserves all income components and accumulated actual payout', async () => {
  const existing = {orders:1,financials:{gross:100,net:80,totalDeductions:20},adjustments:-5,dineOutPayout:10,
    breakdown:{deductions:{adjustmentFee:5},incomes:{adjustmentCredits:0,dineOutPayout:10,otherIncomes:3}}};
  const {context,writes}=harness(existing);
  await context.saveToDatabase('grabfood','UST',{'2026-09-17':{
    orders:1,gross:200,net:150,totalDed:50,actualNetPayout:150,adjustments:7,dineOutPayout:20,
    breakdown:{deductions:{adjustmentFee:0},incomes:{adjustmentCredits:7,dineOutPayout:20,otherIncomes:4}}
  }},'merge');
  const saved=writes.get('daily_sales/grabfood_UST_2026-09-17');
  assert.equal(saved.actualNetPayout,230);assert.equal(saved.financials.net,230);assert.equal(saved.adjustments,2);
  assert.equal(saved.dineOutPayout,30);
  assert.deepEqual(saved.breakdown.incomes,{adjustmentCredits:7,dineOutPayout:30,otherIncomes:7});
});

test('All Branches KiotViet import keeps each branch payment totals through grouping and saving',async()=>{
 const {context,writes}=harness();
 const row=(branch,id,cash,card,transfer)=>{const r=[];r[0]=branch;r[1]=id;r[5]='2026-09-21 10:00';r[36]=cash;r[37]=card;r[38]=transfer;r[44]='FOOD';r[48]=1;r[49]=cash+card+transfer;return r};
 const rows=[[],row('PC','A',100,200,300),row('UST','B',400,500,600)];
 const result=context.groupDataByBranchAndDate(rows,'dinein',vm.runInContext('CHANNEL_CONFIG.dinein',context));
 await context.saveToDatabase('dinein','All Branches',result);
 assert.deepEqual(writes.get('daily_sales/dinein_PioneerCenter_2026-09-21').paymentMethods,{cash:100,bankCard:200,bankTransfer:300});
 assert.deepEqual(writes.get('daily_sales/dinein_UST_2026-09-21').paymentMethods,{cash:400,bankCard:500,bankTransfer:600});
});
