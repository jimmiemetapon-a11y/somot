export function parseAyalaProducts(rows, decodeDate) {
  const norm = v => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const aliases = { datetime: ['invoice date', 'invoice date/time'], invoice: ['invoice no.', 'invoice no'], item: ['item id'], name: ['item name'], quantity: ['qty. sold', 'qty sold'], sales: ['sales / total', 'sales/total', 'total'], type: ['item type'], category: ['menu category'] };
  const columns = {};
  for (const [key, names] of Object.entries(aliases)) {
    columns[key] = -1;
    for (const row of rows.slice(8, 10)) {
      const index = row.findIndex(v => names.includes(norm(v)));
      if (index >= 0) columns[key] = index;
    }
    if (columns[key] < 0 && !['name', 'category'].includes(key)) throw Error(`Missing column: ${names[0]}`);
  }
  const invoices = new Map();
  const details = [];
  let currentInvoice = null;
  const number = value => {
    const parsed = Number(String(value ?? '').replace(/[,₱\s]/g, ''));
    if (!Number.isFinite(parsed)) throw Error(`Invalid number: ${value}`);
    return parsed;
  };
  for (const [index, row] of rows.slice(10).entries()) {
    if (row.some(v => /^(grand total|total)(\s*:)?$/i.test(String(v ?? '').trim()))) break;
    const id = String(row[columns.invoice] ?? '').trim();
    if (!id) continue;
    const item = String(row[columns.item] ?? '').trim();
    const type = norm(row[columns.type]);
    const name = columns.name >= 0 ? String(row[columns.name] ?? '').trim() : '';
    const rawQuantity = row[columns.quantity];
    const hasQuantity = rawQuantity !== '' && rawQuantity != null && number(rawQuantity) !== 0;
    // POS combo lines can have no SKU. Item metadata still identifies a
    // detail row; only metadata-free lines can be invoice summaries.
    const isDetail = Boolean(item || name || type) || hasQuantity;
    if (!isDetail) {
      const timestamp = decodeDate(row[columns.datetime]);
      if (!timestamp) throw Error(`Invalid invoice date/time at row ${index + 11}`);
      if (row[columns.sales] === '' || row[columns.sales] == null) throw Error(`Missing invoice sales at row ${index + 11}`);
      const summary = { ...timestamp, sales: number(row[columns.sales]) };
      const key = `${timestamp.date}|${id}`;
      if (!invoices.has(key)) invoices.set(key, { id, food: false, drink: false, summary: null, row: index + 11 });
      const invoice = invoices.get(key);
      if (invoice.summary && JSON.stringify(invoice.summary) !== JSON.stringify(summary)) throw Error(`Invoice ${id} on ${timestamp.date}: conflicting summary rows ${invoice.row} and ${index + 11} (${invoice.summary.hour}:00 / ${invoice.summary.sales} vs ${summary.hour}:00 / ${summary.sales}). Please check these two rows.`);
      invoice.summary = summary;
      currentInvoice = { id, key };
    } else if (number(row[columns.quantity]) > 0) {
      const rawDate = row[columns.datetime];
      const timestamp = rawDate !== '' && rawDate != null ? decodeDate(rawDate) : null;
      if (rawDate !== '' && rawDate != null && !timestamp) throw Error(`Invalid item date/time at row ${index + 11}`);
      const drink = type === 'drink' || norm(row[columns.category]) === 'nước uống drinks';
      const food = type === 'food' || (!item && !drink);
      details.push({ id, key: timestamp ? `${timestamp.date}|${id}` : currentInvoice?.id === id ? currentInvoice.key : null, row: index + 11, food, drink });
    }
  }
  for (const detail of details) {
    const candidates = detail.key ? [invoices.get(detail.key)].filter(Boolean) : [...invoices.values()].filter(invoice => invoice.id === detail.id);
    if (candidates.length !== 1) throw Error(`Cannot identify invoice date for item row ${detail.row} (invoice ${detail.id}). Please check its summary/date.`);
    candidates[0].food ||= detail.food;
    candidates[0].drink ||= detail.drink;
  }
  const days = {};
  for (const [id, invoice] of invoices) {
    if (!invoice.summary) throw Error(`Missing summary for invoice ${id}`);
    const { date, hour, sales } = invoice.summary;
    days[date] ||= { hourlyNet: {}, hourlyBills: {}, foodBills: 0, attachedBills: 0, bills: 0 };
    const day = days[date];
    day.hourlyNet[hour] = (day.hourlyNet[hour] || 0) + sales;
    day.hourlyBills[hour] = (day.hourlyBills[hour] || 0) + 1;
    day.bills++;
    if (invoice.food) day.foodBills++;
    if (invoice.food && invoice.drink) day.attachedBills++;
  }
  if (!Object.keys(days).length) throw Error('No valid invoice records found.');
  return days;
}
