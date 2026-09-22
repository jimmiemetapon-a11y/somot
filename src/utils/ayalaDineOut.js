export const AYALA_BRANCH = 'Ayala Cloverleaf';
export const AYALA_DINE_OUT_KEY = 'ayalaGrabDineOut';

export function grabDineOutAmount(grab) {
  if (!grab) return 0;
  // An explicit zero overrides older breakdown values. Never include other incomes.
  const raw = grab.dineOutPayout ?? grab.breakdown?.incomes?.dineOutPayout ?? 0;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error('Invalid Grab Dine Out payout');
  return value;
}

export function reconcileAyalaDineOut(dinein, grab, sourceId = null) {
  if (dinein.branchId !== AYALA_BRANCH || dinein.channelId !== 'dinein') return dinein;
  if (grab && (grab.branchId !== AYALA_BRANCH || grab.channelId !== 'grabfood' || grab.date !== dinein.date)) {
    throw new Error('Grab Dine Out must match the Ayala sales date');
  }
  const prior = Number(dinein.breakdown?.deductions?.[AYALA_DINE_OUT_KEY] ?? 0);
  const amount = grabDineOutAmount(grab);
  const net = Number(dinein.financials?.net);
  const deductions = Number(dinein.financials?.totalDeductions);
  if (![prior, net, deductions].every(Number.isFinite)) throw new Error('Invalid Ayala sales totals');
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  return {
    ...dinein,
    financials: { ...dinein.financials, net: round(net + prior - amount), totalDeductions: round(deductions - prior + amount) },
    breakdown: { ...dinein.breakdown, deductions: { ...dinein.breakdown?.deductions, [AYALA_DINE_OUT_KEY]: amount } },
    dineOutAdjustment: { amount, sourceId: grab ? sourceId : null, date: dinein.date, sourceChannel: 'grabfood' },
  };
}
