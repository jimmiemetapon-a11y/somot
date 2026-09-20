export function sparklineRange(from, to) {
  const end = new Date(`${to}T00:00:00Z`);
  const start = new Date(`${from}T00:00:00Z`);
  const sevenDayStart = new Date(end);
  sevenDayStart.setUTCDate(end.getUTCDate() - 6);
  return { from: (start < sevenDayStart ? start : sevenDayStart).toISOString().slice(0, 10), to };
}

export function revenueSparkline(docs, from, to) {
  const totals = new Map();
  for (const row of docs) {
    if (row.date < from || row.date > to) continue;
    const value = row.financials ? row.financials.net : (row.net ?? 0);
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    totals.set(row.date, (totals.get(row.date) ?? 0) + value);
  }
  const values = [...totals.values()];
  if (!values.length) return '';
  const low = Math.min(...values), high = Math.max(...values);
  const start = new Date(`${from}T00:00:00Z`);
  const count = Math.round((new Date(`${to}T00:00:00Z`) - start) / 86400000) + 1;
  const segments = [], points = [];
  let segment = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + i);
    const value = totals.get(date.toISOString().slice(0, 10));
    if (value === undefined) {
      if (segment.length) segments.push(segment);
      segment = [];
      continue;
    }
    const x = 8 + i / Math.max(1, count - 1) * 784;
    const y = high === low ? 70 : 112 - (value - low) / (high - low) * 84;
    const point = `${x.toFixed(2)},${y.toFixed(2)}`;
    segment.push(point);
    points.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.5"/>`);
  }
  if (segment.length) segments.push(segment);
  return segments.map(points => `<polyline points="${points.join(' ')}"/>`).join('') + points.join('');
}
