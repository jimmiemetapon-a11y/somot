// null means unavailable; zero is a measured value, never a fallback.
export const numberOrNull = value => value === null || value === undefined || value === ''
  ? null : Number.isFinite(Number(value)) ? Number(value) : null;

export const progress = (actual, target) => numberOrNull(actual) !== null && numberOrNull(target) > 0
  ? Math.max(0, Math.min(100, actual / target * 100)) : null;

export function missionStat(pct, isControl = false, completed = null) {
  if (isControl ? completed === null : pct === null) return { status: 'Unavailable', xp: 0 };
  if (isControl) return { status: completed ? 'Completed' : 'NeedsPush', xp: completed ? 50 : 0 };
  if (pct >= 100) return { status: 'Completed', xp: 50 };
  if (pct >= 80) return { status: 'OnTrack', xp: 25 };
  return { status: 'NeedsPush', xp: 0 };
}

export const formatPercent = value => numberOrNull(value) === null ? 'No data' : `${Number(value.toFixed(2))}%`;
export const formatMoney = value => numberOrNull(value) === null ? 'No data' : '₱' + Math.round(value).toLocaleString('en-PH');

export function emptyMetrics() {
  return Object.fromEntries(['shift1Actual', 'shift2Actual', 'avoActual', 'drinkActual', 'incidentActual',
    'monthlyNetActual', 'monthlyAvoActual', 'monthlyDrinkActual', 'monthlyIncidentActual', 'hitRateActual', 'streakDays', 'userXp']
    .map(key => [key, null]).concat([['latestBusinessDate', ''], ['evaluatedDays', 0]]));
}

function sumKnown(rows, read) {
  if (!rows.length) return null;
  const values = rows.map(row => numberOrNull(read(row)));
  return values.includes(null) ? null : values.reduce((sum, value) => sum + value, 0);
}

export function parseWindow(window) {
  const match = /^(\d{1,2}):00\s*-\s*(\d{1,2}):00$/.exec(window || '');
  if (!match || +match[1] > 23 || +match[2] > 23 || +match[1] === +match[2]) return null;
  return [+match[1], +match[2]];
}

export function shiftTotal(rows, window) {
  const hours = parseWindow(window);
  if (!hours || !rows.length) return null;
  const [start, end] = hours;
  let total = 0;
  for (const row of rows) {
    const hourly = row.hourlyNet ?? row.breakdown?.hourlyNet;
    if (!hourly || typeof hourly !== 'object' || Array.isArray(hourly) || !Object.keys(hourly).length) return null;
    // Hours belong to the business date already stored by the importer.
    // Do not shift dates again when the window crosses midnight.
    for (const [key, raw] of Object.entries(hourly)) {
      const hour = Number(key);
      const amount = numberOrNull(raw);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23 || amount === null) return null;
      if (start < end ? hour >= start && hour < end : hour >= start || hour < end) total += amount;
    }
  }
  return total;
}

export function isQualifyingIncident(record) {
  return ['wrong item', 'missing item'].includes(String(record.reasonGroup || '').trim().toLowerCase());
}

export function countIncidentOrders(adjustments) {
  const keys = new Set();
  for (const row of adjustments.filter(isQualifyingIncident)) {
    const id = row.linkedOrderId || row.transactionId || row.id;
    if (id) keys.add(`${row.channelId || 'grabfood'}|${row.date || ''}|${id}`);
  }
  return keys.size;
}

export function countDineInDrinkOrders(orderRowsMap, quantityColumn = 48) {
  let count = 0;
  for (const rows of Object.values(orderRowsMap)) {
    // AS (zero-based 44) is the SKU column in the KiotViet detail export.
    // An absent SKU column is unknown, not proof of zero beverage orders.
    if (rows.some(row => row[44] === undefined || row[44] === null || String(row[44]).trim() === '')) return null;
    if (rows.some(row => /^D/i.test(String(row[44]).trim()) && Number(row[quantityColumn]) > 0)) count++;
  }
  return count;
}

export function dailyMissionDetails(day, target) {
  const specs = [
    ['shift1', 'Shift 1 Sales', day.shift1, target.shift1, 'money', `Dine In net sales, ${target.shift1Time}`],
    ['shift2', 'Shift 2 Sales', day.shift2, target.shift2, 'money', `Dine In net sales, ${target.shift2Time}`],
    ['avo', 'Average Order Value', day.avo, target.avo, 'money', `${formatMoney(day.revenue)} Dine In net / ${day.orders ?? 'unknown'} Dine In orders`],
    ['drink', 'Drink Attachment', day.drink, target.drink, 'percent', 'Dine In orders containing a D/DR SKU / Dine In orders × 100'],
    ['incident', 'Food App Incident', day.incident.rate, target.incident, 'percent', day.incident.count === 0 ? 'Grab sales recorded with no wrong/missing incidents: 0% and mission achieved' : `${day.incident.count ?? 'Unknown'} recorded wrong/missing orders / ${day.incident.orders ?? 'unknown'} Grab orders × 100`]
  ];
  return specs.map(([id, label, actual, goal, unit, formula]) => {
    const pct = progress(actual, goal);
    const stat = id === 'incident' ? missionStat(0, true, actual === null ? null : actual <= goal) : missionStat(pct);
    return { id, label, actual, target: goal, unit, formula, progress: pct, ...stat };
  });
}

export function calculateMetrics(rows, target, options = {}) {
  const result = emptyMetrics();
  const dineIn = rows.filter(row => row.channelId === 'dinein');
  if (!dineIn.length) return result;
  const dates = [...new Set(dineIn.map(row => row.date))].sort();
  const businessDate = dates.at(-1);
  const branch = dineIn[0].branchId;
  const net = row => row.financials?.net ?? row.netSales;
  const orders = row => row.financials?.totalOrders ?? row.orders;
  const adjustments = (options.adjustments || []).filter(row => (row.branch ?? row.branchId) === branch);
  const drinkBase = row => row.breakdown?.kpi?.drinkRule === 'ayala-food-drink-v1' ? row.breakdown.kpi.foodOrders : orders(row);
  function aggregate(group) {
    const revenue = sumKnown(group, net);
    const count = sumKnown(group, orders);
    const drinks = sumKnown(group, row => row.breakdown?.kpi?.drinkOrders);
    const drinkDenominator = sumKnown(group, drinkBase);
    const validCounts = group.every(row => numberOrNull(orders(row)) !== null && Number(orders(row)) >= 0);
    const validDrinks = group.every(row => {
      const value = numberOrNull(row.breakdown?.kpi?.drinkOrders);
      return value !== null && value >= 0 && numberOrNull(drinkBase(row)) !== null && value <= Number(drinkBase(row));
    });
    return { revenue, orders: validCounts ? count : null,
      avo: validCounts && count > 0 && revenue !== null ? revenue / count : null,
      drink: validDrinks && drinkDenominator > 0 && drinks !== null ? drinks / drinkDenominator * 100 : null };
  }
  function incidentRate(date) {
    if (options.incidentAvailable === false) return { rate: null, count: null, orders: null };
    const grabRows = rows.filter(row => row.branchId === branch && row.channelId === 'grabfood' && (!date || row.date === date));
    const orderCount = sumKnown(grabRows, orders);
    // Incident rewards require actual Grab orders in the evaluated period.
    if (!(orderCount > 0)) return { rate: null, count: null, orders: orderCount };
    const incidents = adjustments.filter(row => (!date || row.date === date) && grabRows.some(sale =>
      sale.date === row.date && sale.channelId === (row.channelId || 'grabfood') &&
      (!sale.importBatchId || !row.importBatchId || sale.importBatchId === row.importBatchId)));
    const count = countIncidentOrders(incidents);
    return { rate: count / orderCount * 100, count, orders: orderCount };
  }
  const dailyTarget = numberOrNull(options.dailyTarget) > 0 ? Number(options.dailyTarget)
    : numberOrNull(target.monthlyNet) > 0 ? target.monthlyNet / (options.monthDays || 30) : null;
  const dailyResults = dates.map(date => {
    const group = dineIn.filter(row => row.date === date);
    const data = aggregate(group);
    const incident = incidentRate(date);
    const shift1 = shiftTotal(group, target.shift1Time);
    const shift2 = shiftTotal(group, target.shift2Time);
    const missions = dailyMissionDetails({ ...data, shift1, shift2, incident }, target);
    const completed = missions.filter(m => m.status === 'Completed').length;
    return { date, ...data, shift1, shift2, incident, completed, missions,
      bonusXp: completed === 5 ? 100 : 0,
      hit: data.revenue !== null && dailyTarget !== null ? data.revenue >= dailyTarget : null,
      xp: missions.reduce((sum, m) => sum + m.xp, 0) + (completed === 5 ? 100 : 0) };
  });
  const latest = dailyResults.at(-1);
  const monthly = aggregate(dineIn);
  // Monthly drink coverage may be incomplete after historical re-imports.
  // Use matching numerator/denominator from covered records, never count
  // missing drink counts as zero or dilute them with uncovered orders.
  const coveredDrinkRows = dineIn.filter(row => {
    const count = numberOrNull(drinkBase(row));
    const drinks = numberOrNull(row.breakdown?.kpi?.drinkOrders);
    return count !== null && count >= 0 && drinks !== null && drinks >= 0 && drinks <= count;
  });
  const coveredDrinkOrders = sumKnown(coveredDrinkRows, drinkBase);
  const coveredDrinks = sumKnown(coveredDrinkRows, row => row.breakdown.kpi.drinkOrders);
  const monthlyDrinkActual = coveredDrinkOrders > 0 ? coveredDrinks / coveredDrinkOrders * 100 : null;
  const monthlyDrinkComplete = coveredDrinkRows.length === dineIn.length;
  const monthlyDrinkDays = dates.filter(date => dineIn.filter(row => row.date === date).every(row => coveredDrinkRows.includes(row))).length;
  const monthlyIncident = incidentRate();
  const evaluated = dailyResults.filter(day => day.hit !== null);
  const hitRate = evaluated.length ? evaluated.filter(day => day.hit).length / evaluated.length * 100 : null;
  // Count consecutive imported business dates, starting at the evaluation date.
  let streak = 0;
  let expectedDate = businessDate;
  for (const day of [...dailyResults].reverse()) {
    if (day.date !== expectedDate || day.completed < 4) break;
    streak++;
    const previous = new Date(`${expectedDate}T12:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    expectedDate = previous.toISOString().slice(0, 10);
  }
  const monthlyAwards = [
    [progress(monthly.revenue, target.monthlyNet) >= 100, 500],
    [hitRate !== null && hitRate >= 80, 300],
    [progress(monthly.avo, target.avo) >= 100, 200],
    [monthlyDrinkComplete && progress(monthlyDrinkActual, target.drink) >= 100, 200],
    [monthlyIncident.rate !== null && monthlyIncident.rate <= target.incident, 300]
  ];
  const monthlyXp = monthlyAwards.reduce((sum, [met, xp]) => sum + (met ? xp : 0), 0)
    + (monthlyAwards.every(([met]) => met) ? 500 : 0);
  const dailyXp = dailyResults.reduce((sum, day) => sum + day.xp, 0);
  const monthlySpecs = [
    ['revenue', 'Dine In Revenue', monthly.revenue, target.monthlyNet, 'money'],
    ['hitRate', 'KPI Hit Rate', hitRate, 80, 'percent'],
    ['avo', 'Average Order Value', monthly.avo, target.avo, 'money'],
    ['drink', 'Drink Attachment', monthlyDrinkActual, target.drink, 'percent'],
    ['incident', 'Food App Incident', monthlyIncident.rate, target.incident, 'percent']
  ];
  const monthlyRewards = monthlySpecs.map(([id, label, actual, goal, unit], index) => ({
    id, label, actual, target: goal, unit, maxXp: monthlyAwards[index][1],
    xp: monthlyAwards[index][0] ? monthlyAwards[index][1] : 0,
    status: actual === null || (id === 'drink' && !monthlyDrinkComplete) ? 'Unavailable' : monthlyAwards[index][0] ? 'Completed' : 'NeedsPush'
  }));
  return { ...result, latestBusinessDate: businessDate, evaluatedDays: evaluated.length,
    shift1Actual: latest.shift1, shift2Actual: latest.shift2, avoActual: latest.avo, drinkActual: latest.drink,
    incidentActual: latest.incident.rate, monthlyIncidentActual: monthlyIncident.rate,
    monthlyNetActual: monthly.revenue, monthlyAvoActual: monthly.avo, monthlyDrinkActual,
    monthlyDrinkComplete, monthlyDrinkDays, monthlyDrinkTotalDays: dates.length,
    hitRateActual: hitRate, streakDays: streak, userXp: dailyXp + monthlyXp,
    dailyXp, monthlyXp, dailyResults, dailyTarget, monthlyRewards,
    monthlyBonusXp: monthlyAwards.every(([met]) => met) ? 500 : 0,
    dailyIncidentCount: latest.incident.count, dailyFoodAppOrders: latest.incident.orders,
    monthlyIncidentCount: monthlyIncident.count, monthlyFoodAppOrders: monthlyIncident.orders };
}
