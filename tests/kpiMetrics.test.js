import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as metrics from '../src/utils/kpiMetrics.js';
import * as journey from '../src/components/KPIJourney.js';

const target = { shift1: 100, shift2: 100, avo: 50, drink: 50, incident: 0, monthlyNet: 1000,
  shift1Time: '9:00 - 15:00', shift2Time: '17:00 - 2:00' };
const sale = (overrides = {}) => ({ branchId: 'UST', channelId: 'dinein', date: '2026-09-17',
  financials: { net: 200 }, orders: 4, hourlyNet: { '09': 100, '17': 60, '01': 40 },
  breakdown: { kpi: { drinkOrders: 0 } }, ...overrides });

test('empty data cannot earn incident or mission XP', () => {
  const result = metrics.calculateMetrics([], target);
  assert.equal(result.monthlyNetActual, null);
  assert.equal(result.incidentActual, null);
  assert.equal(metrics.missionStat(null).xp, 0);
  assert.equal(metrics.missionStat(0, true, null).status, 'Unavailable');
});

test('measured zero revenue and zero drink orders are preserved', () => {
  const result = metrics.calculateMetrics([sale({ financials: { net: 0 }, hourlyNet: { '09': 0 } })], target);
  assert.equal(result.monthlyNetActual, 0);
  assert.equal(result.avoActual, 0);
  assert.equal(result.drinkActual, 0);
  assert.equal(result.shift1Actual, 0);
});

test('partial or missing data never become fabricated complete totals', () => {
  const result = metrics.calculateMetrics([sale(), sale({ hourlyNet: null, breakdown: {}, financials: {} })], target);
  assert.equal(result.monthlyNetActual, null);
  assert.equal(result.drinkActual, null);
  assert.equal(result.shift1Actual, null);
  assert.equal(metrics.calculateMetrics([sale({ orders: 0 })], target).avoActual, null);
});

test('branch shift windows use actual top-level hourly data and exclude the end hour', () => {
  const result = metrics.calculateMetrics([sale({ hourlyNet: { '08': 1000, '09': 100, '14': 20, '15': 500, '17': 60, '01': 40, '02': 900 } })], target);
  assert.equal(result.shift1Actual, 120);
  assert.equal(result.shift2Actual, 100);
});

test('non-Dine-In channels cannot contaminate KPI dates, sales, order values or shifts', () => {
  const result = metrics.calculateMetrics([sale(), sale({ channelId: 'grabfood', date: '2026-09-18', financials: { net: 999999 }, orders: 200 })], target);
  assert.equal(result.latestBusinessDate, '2026-09-17');
  assert.equal(result.monthlyNetActual, 200);
  assert.equal(result.monthlyAvoActual, 50);
  assert.equal(result.shift2Actual, 100);
});

test('latest recorded date is explicit and monthly AVO is weighted by orders', () => {
  const result = metrics.calculateMetrics([sale(), sale({ date: '2026-09-18', financials: { net: 300 }, orders: 1 })], target);
  assert.equal(result.latestBusinessDate, '2026-09-18');
  assert.equal(result.avoActual, 300);
  assert.equal(result.monthlyAvoActual, 100);
  assert.equal(result.userXp, result.dailyXp + result.monthlyXp);
  assert.equal(result.streakDays, 0);
});

test('rounding does not promote a near miss to a completed mission', () => {
  assert.equal(metrics.missionStat(metrics.progress(99.5, 100)).xp, 25);
  assert.equal(metrics.missionStat(metrics.progress(79.9, 100)).xp, 0);
  assert.equal(metrics.missionStat(metrics.progress(100, 100)).xp, 50);
  assert.equal(metrics.progress(1, 0), null);
});

test('invalid drink counts and hourly amounts are unavailable', () => {
  assert.equal(metrics.calculateMetrics([sale({ breakdown: { kpi: { drinkOrders: 5 } } })], target).drinkActual, null);
  assert.equal(metrics.shiftTotal([sale({ hourlyNet: { '09': 'bad' } })], target.shift1Time), null);
});

// Isolated rendering harness: no Firebase connection or production writes.
function harness(getSales = async () => ({ docs: [] }), withHeader = false) {
  const elements = [];
  const listeners = new Map();
  const createElement = () => {
    const controls = new Map();
    const el = { innerHTML: '', listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; }, classList: { add() {} }, remove() {},
      querySelector(selector) {
        if (!controls.has(selector)) controls.set(selector, { listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } });
        return controls.get(selector);
      } };
    elements.push(el);
    return el;
  };
  const header = withHeader ? createElement() : null;
  if (header) header.dataset = { initialBranch: 'UST' };
  const context = vm.createContext({ ...metrics, ...journey, db: {}, console: { error() {} }, Date, setTimeout,
    document: { createElement, getElementById: id => id === 'kpi-header-controls' ? header : null, body: { appendChild() {} } },
    window: { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    doc: (...args) => args, collection: (...args) => args, where: (...args) => args, query: (...args) => args,
    getDoc: async () => ({ exists: () => true, data: () => target }), getDocs: q => q[0][1] === 'grab_adjustments' ? Promise.resolve({ docs: [] }) : getSales(q),
    setDoc: async () => {}, serverTimestamp: () => null });
  for (const file of ['src/pages/KPITracking.js', 'src/components/KPIMissionModal.js']) {
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8')
      .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
    vm.runInContext(source, context);
  }
  return { context, elements, listeners, header };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const user = { permissions: { allowedBranches: ['UST', 'Pioneer Center'] } };

test('daily snapshot computes real deltas and handles missing values and zero baselines', () => {
  const prior = { date: '2026-09-15', revenue: 200, avo: 50, drink: 50, completed: 0, xp: 75, missions: [{ status: 'OnTrack' }, { status: 'Unavailable' }] };
  const latest = { ...prior, date: '2026-09-17', revenue: 250, avo: 55, drink: 40 };
  const html = journey.renderDailySnapshot({ dailyResults: [prior, latest], streakDays: 0 });
  assert.match(html, /↑ 25%/);
  assert.match(html, /↑ ₱5/);
  assert.match(html, /↓ 10 pp/);
  assert.match(html, /1 partially achieved · 1 unavailable/);
  assert.match(html, /data-kpi-day="2026-09-17"/);
  assert.match(html, /Sep 15/);
  const missing = journey.renderDailySnapshot({ dailyResults: [{ ...prior, revenue: 0, avo: null, drink: null }, latest] });
  assert.equal((missing.match(/Not available/g) || []).length, 3);
  assert.doesNotMatch(journey.renderDailySnapshot({}), /NaN|undefined|data-kpi-day/);
});

test('KPI header owns branch, month and view without using global filter events', async () => {
  const { context, header, listeners } = harness(async () => ({ docs: [{ data: () => sale() }] }), true);
  const page = context.renderKPITrackingPage(user);
  await settle();
  assert.match(header.innerHTML, /kpi-branch-select/);
  assert.doesNotMatch(header.innerHTML, /db-branch|db-date-range|header-subtab-option/);
  assert.doesNotMatch(page.innerHTML, /id="kpi-month"|id="kpi-view-select"/);
  assert.equal(listeners.has('global-filter-changed'), false);
  header.querySelector('#kpi-view-select').listeners.change({ target: { value: 'journey' } });
  assert.match(page.innerHTML, /Your journey/);
  header.querySelector('#kpi-month').listeners.change({ target: { value: '2026-08' } });
  await settle();
  assert.match(header.innerHTML, /value="2026-08"/);
  header.querySelector('#kpi-branch-select').onchange({ target: { value: 'Pioneer Center' } });
  await settle();
  assert.match(header.innerHTML, /value="Pioneer Center" selected/);
});

test('page and popup share saved targets and calculated values', async () => {
  const { context, elements } = harness(async () => ({ docs: [{ data: () => sale() }] }));
  const popupData = await context.fetchTodayBranchKPI('UST');
  assert.equal(popupData.shift1Target, 100);
  assert.equal(popupData.shift1Actual, 100);
  assert.equal(popupData.drinkActual, 0);
  assert.equal(popupData.incidentActual, null);
  const page = context.renderKPITrackingPage(user);
  await settle();
  context.showKPIMissionModal(user, popupData, () => {}, true);
  assert.match(page.innerHTML, /2026|Sep 17/);
  assert.match(elements.at(-1).innerHTML, /2026-09-17/);
  for (const html of [page.innerHTML, elements.at(-1).innerHTML]) {
    assert.match(html, /0%/);
    assert.doesNotMatch(html, /NaN|undefined|null%|650,000|XP EARNED|[\u1EA0-\u1EF9]/);
  }
});

test('failed fetch renders an error with no fabricated performance', async () => {
  const { context } = harness(async () => { throw new Error('offline'); });
  const page = context.renderKPITrackingPage(user);
  await settle();
  assert.match(page.innerHTML, /Could not load KPI data/);
  assert.doesNotMatch(page.innerHTML, /650,000|2,336|16-DAY/);
});

test('late response from previous branch cannot overwrite a newer empty result', async () => {
  const pending = [];
  const { context, listeners } = harness(() => new Promise(resolve => pending.push(resolve)));
  const page = context.renderKPITrackingPage(user);
  listeners.get('global-filter-changed')({ detail: { branch: 'UST' } });
  pending[1]({ docs: [] });
  await settle();
  pending[0]({ docs: [{ data: () => sale({ financials: { net: 999999 } }) }] });
  await settle();
  assert.match(page.innerHTML, /No Dine In sales/);
  assert.doesNotMatch(page.innerHTML, /999,999/);
});


test('incident rates use wrong/missing orders only, deduplicated per order and period', () => {
  const rows = [sale(), sale({ date: '2026-09-18' }),
    sale({ channelId: 'grabfood', orders: 10 }), sale({ channelId: 'foodpanda', orders: 30 }),
    sale({ channelId: 'grabfood', date: '2026-09-18', orders: 20 })];
  const adjustment = (reasonGroup, linkedOrderId, date = '2026-09-17') => ({ branch: 'UST', date, reasonGroup, linkedOrderId });
  const adjustments = [adjustment('Wrong Item', 'A'), adjustment('Missing Item', 'A'),
    adjustment('Adjustment', 'B'), adjustment('Unclassified', 'C'), adjustment('Food Quality', 'D'),
    adjustment('Missing Item', 'E', '2026-09-18'), { ...adjustment('Wrong Item', 'F'), branch: 'Other Branch' },
    { ...adjustment('Wrong Item', 'P'), channelId: 'foodpanda' }];
  const result = metrics.calculateMetrics(rows, target, { adjustments, incidentAvailable: true, dailyTarget: 200, monthDays: 30 });
  assert.equal(result.dailyIncidentCount, 1);
  assert.equal(result.incidentActual, 5);
  assert.equal(result.monthlyIncidentCount, 2);
  assert.equal(result.monthlyIncidentActual, 2 / 30 * 100);
  assert.equal(result.dailyResults[0].incident.rate, 10);
  assert.equal(result.monthlyFoodAppOrders, 30);
  assert.equal(result.hitRateActual, 100);
  assert.equal(result.dailyFoodAppOrders, 20);
  const failedSource = metrics.calculateMetrics(rows, target, { adjustments, incidentAvailable: false });
  assert.equal(failedSource.incidentActual, null);
  assert.equal(failedSource.monthlyNetActual, 400);
});

test('streak uses consecutive stored business dates and XP reconciles with mission totals', () => {
  const day = date => sale({ date, breakdown: { kpi: { drinkOrders: 4 } } });
  const result = metrics.calculateMetrics([day('2026-09-15'), day('2026-09-17'), day('2026-09-18')], target, { dailyTarget: 200 });
  assert.equal(result.streakDays, 2);
  assert.equal(result.dailyXp, 600);
  assert.equal(result.userXp, result.dailyResults.reduce((sum, row) => sum + row.xp, 0) + result.monthlyXp);
});

test('D and DR SKU prefixes in AS count distinct beverage orders, not item quantities', () => {
  const row = (sku, qty = 1) => { const value = []; value[44] = sku; value[48] = qty; return value; };
  assert.equal(metrics.countDineInDrinkOrders({ A: [row('D001', 3), row('DR002', 2)], B: [row('FOOD')], C: [row(' dr003 ')], D: [row('D004', 0)] }), 2);
  assert.equal(metrics.countDineInDrinkOrders({ A: [row('FOOD')] }), 0);
  assert.equal(metrics.countDineInDrinkOrders({ A: [row(undefined)] }), null);
});

test('KiotViet import writes beverage KPI into the existing breakdown', () => {
  const context = vm.createContext({ ...metrics, Date });
  const source = readFileSync(new URL('../src/pages/ChannelPage.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInContext(source, context);
  const row = (id, sku) => { const r = []; r[1] = id; r[5] = '2026-09-17 10:00'; r[36] = 100; r[44] = sku; r[48] = 1; r[49] = 100; return r; };
  const result = context.calculateDineIn([row('A', 'D001'), row('A', 'DR002'), row('B', 'FOOD')], vm.runInContext('CHANNEL_CONFIG.dinein', context));
  assert.equal(result.orders, 2);
  assert.equal(result.breakdown.kpi.drinkOrders, 1);
  assert.equal(result.breakdown.kpi.drinkRule, 'sku-AS-D-DR-v1');
});


test('no incidents passes only with Grab sales in the evaluated period', () => {
  for (const extra of [[], [sale({ channelId: 'foodpanda' })]]) {
    const rows = [sale(), sale({ channelId: 'grabfood' }), ...extra];
    const result = metrics.calculateMetrics(rows, target, { incidentAvailable: true, adjustments: [] });
    assert.equal(result.incidentActual, 0);
    assert.equal(result.monthlyIncidentActual, 0);
    assert.equal(result.dailyResults[0].missions.find(m => m.id === 'incident').xp, 50);
    assert.equal(result.monthlyRewards.find(m => m.id === 'incident').xp, 300);
  }
});

test('absent, zero, unknown, Foodpanda-only or other-branch Grab orders cannot earn incident rewards', () => {
  for (const extra of [[], [sale({ channelId: 'foodpanda' })], [sale({ channelId: 'grabfood', orders: 0 }), sale({ channelId: 'foodpanda' })],
    [sale({ channelId: 'grabfood', orders: null })],
    [sale({ channelId: 'grabfood', branchId: 'Other Branch' })]]) {
    const result = metrics.calculateMetrics([sale({ breakdown: { kpi: { drinkOrders: 4 } } }), ...extra], target, { incidentAvailable: true });
    assert.equal(result.incidentActual, null);
    assert.equal(result.monthlyIncidentActual, null);
    assert.equal(result.dailyResults[0].missions.find(m => m.id === 'incident').xp, 0);
    assert.equal(result.monthlyRewards.find(m => m.id === 'incident').xp, 0);
    assert.equal(result.dailyResults[0].bonusXp, 0);
    assert.equal(result.monthlyBonusXp, 0);
  }
});

test('Grab sales on an earlier day qualify monthly rewards but Foodpanda on a later day cannot qualify daily', () => {
  const result = metrics.calculateMetrics([sale(), sale({ channelId: 'grabfood' }), sale({ date: '2026-09-18' }), sale({ channelId: 'foodpanda', date: '2026-09-18' })], target, { incidentAvailable: true });
  assert.equal(result.dailyResults[0].missions.find(m => m.id === 'incident').xp, 50);
  assert.equal(result.incidentActual, null);
  assert.equal(result.dailyResults[1].missions.find(m => m.id === 'incident').xp, 0);
  assert.equal(result.monthlyIncidentActual, 0);
  assert.equal(result.monthlyRewards.find(m => m.id === 'incident').xp, 300);
});


test('monthly drink attachment shows covered data without diluting or rewarding incomplete months', () => {
  const completeDay = sale({ breakdown: { kpi: { drinkOrders: 2 } } });
  const missingDay = sale({ date: '2026-09-18', orders: 100, breakdown: {} });
  const partial = metrics.calculateMetrics([completeDay, missingDay], target);
  assert.equal(partial.monthlyDrinkActual, 50); // 2 / 4, not 2 / 104.
  assert.equal(partial.monthlyDrinkDays, 1);
  assert.equal(partial.monthlyDrinkTotalDays, 2);
  assert.equal(partial.monthlyDrinkComplete, false);
  assert.equal(partial.drinkActual, null); // Latest daily mission remains unknown.
  const full = metrics.calculateMetrics([completeDay, { ...missingDay, breakdown: { kpi: { drinkOrders: 50 } } }], target);
  assert.equal(full.monthlyDrinkActual, 50);
  assert.equal(full.monthlyDrinkComplete, true);
  assert.equal(full.monthlyXp - partial.monthlyXp, 200);
  const zero = metrics.calculateMetrics([sale(), missingDay], target);
  assert.equal(zero.monthlyDrinkActual, 0);
  assert.equal(metrics.calculateMetrics([missingDay], target).monthlyDrinkActual, null);
});


test('journey shows incomplete dates separately and reconciles every displayed XP row', () => {
  const data = metrics.calculateMetrics([sale(), sale({ date: '2026-09-18', breakdown: {} })], target);
  assert.equal(journey.journeyDayStatus(data.dailyResults[0]).label, 'Incomplete data');
  assert.equal(journey.pointRows(data).reduce((sum, row) => sum + row.xp, 0), data.userXp);
  const calendar = journey.renderKPIJourney(data, { year: 2026, month: 9, selectedDate: '2026-09-18', today: '2026-09-19' });
  assert.match(calendar, /2026-09-18: Incomplete data/);
  assert.match(calendar, /2026-09-20: Upcoming/);
  assert.match(calendar, /How this is calculated/);
  assert.match(calendar, /not a locked award history/);
  const points = journey.renderKPIPoints(data, { date: '2026-09-17', kind: 'daily' });
  assert.match(points, /6 results/);
  assert.doesNotMatch(points, /NaN|undefined|null%/);
});

test('journey distinguishes complete perfect days and partial days without awarding missing missions', () => {
  const full = sale({ breakdown: { kpi: { drinkOrders: 4 } } });
  const data = metrics.calculateMetrics([full, sale({ channelId: 'grabfood' })], target, { incidentAvailable: true });
  assert.equal(journey.journeyDayStatus(data.dailyResults[0]).label, 'Perfect day');
  assert.equal(data.dailyResults[0].xp, 350);
  assert.equal(journey.pointRows(data).reduce((sum, row) => sum + row.xp, 0), data.userXp);
});

test('users can switch views, inspect a historical day and open its filtered point breakdown', async () => {
  const { context } = harness(async () => ({ docs: [{ data: () => sale() }] }));
  const page = context.renderKPITrackingPage(user);
  await settle();
  const click = dataset => page.listeners.click({ target: { closest: () => ({ dataset }) } });
  click({ kpiView: 'journey' });
  assert.match(page.innerHTML, /Your journey/);
  const date = '2026-09-17';
  click({ kpiDay: date });
  assert.match(page.innerHTML, /Sep 17 results/);
  click({ kpiPointsDate: date });
  assert.match(page.innerHTML, /Your points/);
  assert.match(page.innerHTML, /6 results/);
  click({ kpiPointsReset: '' });
  assert.match(page.innerHTML, /12 results/);
});
