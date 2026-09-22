const PAYMENT_KEYS = ['cash', 'bankCard', 'bankTransfer'];
export function validateImportedPayments(channel, branch, result) {
  if (channel !== 'dinein' || branch === 'Ayala Cloverleaf') return;
  if (PAYMENT_KEYS.some(key => typeof result.paymentMethods?.[key] !== 'number' || !Number.isFinite(result.paymentMethods[key]))) {
    throw new Error(`Payment data is missing for ${branch}. Reload the page and import the original KiotViet file again. No incomplete payment record will be saved.`);
  }
}
