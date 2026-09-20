export function auditDates(records, end, start = '') {
  const dates = [...new Set(records.map(r => r.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= end))].sort();
  const from = start || dates[0];
  if (!from) return { from: null, missing: [], latest: null };
  const present = new Set(dates);
  const missing = [];
  for (let day = new Date(`${from}T00:00:00Z`); day.toISOString().slice(0, 10) <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const key = day.toISOString().slice(0, 10);
    if (!present.has(key)) missing.push(key);
  }
  return { from, missing, latest: dates.at(-1) || null };
}
