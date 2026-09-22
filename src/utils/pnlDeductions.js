const STORE_KEYS = ['productDiscount', 'invoiceDiscount', 'discount100', 'discount', 'tax', 'vatAdjustment', 'seniorCitizenDiscount', 'pwdDiscount', 'otherDiscount', 'ayalaGrabDineOut'];
const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const cents = value => Math.round((value + Number.EPSILON) * 100) / 100;

// Match the dashboard's recorded total, while keeping bank fees on their own P&L row.
export function reconcileInstoreDeductions(sale) {
  const deductions = sale.breakdown?.deductions || {};
  const details = Object.fromEntries(STORE_KEYS.map(key => [key, amount(deductions[key])]));
  const known = Object.values(details).reduce((sum, value) => sum + value, 0);
  const bank = amount(deductions.bankCardFee);
  const rawTotal = sale.financials?.totalDeductions;
  const hasTotal = rawTotal !== undefined && rawTotal !== null && rawTotal !== '' && Number.isFinite(Number(rawTotal));
  const total = hasTotal ? Number(rawTotal) : known + bank;
  const instore = cents(total - bank);
  details.unreconciled = cents(instore - known);
  // Void invoices and KiotViet Grab Dine Out are already excluded from gross, not extra deductions.
  return { total: cents(total), instore, bank, details };
}
