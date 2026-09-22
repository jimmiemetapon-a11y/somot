const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const pick = (...values) => {
  const value = values.find(value => value !== undefined && value !== null);
  return value === undefined ? undefined : number(value);
};

export function getGrabPayoutBreakdown(item) {
  const d = item.breakdown?.deductions || {};
  const i = item.breakdown?.incomes || {};
  const gross = pick(item.financials?.gross, item.gross) ?? 0;
  const actualNetPayout = pick(item.financials?.net, item.actualNetPayout) ?? 0;
  let product = pick(d.merchantProductDiscount, item.merchantProductDiscount);
  let delivery = pick(d.merchantDeliveryDiscount, item.merchantDeliveryDiscount, d.deliveryDiscount);
  const savedPromo = pick(d.merchantDiscount, item.merchantPromo);
  // Older reports store the total only. Recover a missing component from that total.
  if (product === undefined) product = savedPromo === undefined ? 0 : savedPromo - (delivery ?? 0);
  if (delivery === undefined) delivery = savedPromo === undefined ? 0 : savedPromo - product;
  const promo = product + delivery;
  const marketing = pick(d.marketingSuccessFee, item.marketingSuccessFee, d.marketingFee) ?? 0;
  const orderCommission = pick(d.orderCommission, item.orderCommission) ?? 0;
  const commissionTotal = pick(item.commissionAndSuccessFees, d.commission);
  const channelCommission = pick(d.channelCommission, item.channelCommission) ??
    (commissionTotal === undefined ? 0 : commissionTotal - marketing - orderCommission);
  const commission = marketing + channelCommission + orderCommission;
  const ads = pick(d.adsFee, item.adsInclVAT) ?? 0;
  const adsExVAT = pick(d.adsExVAT, item.adsExVAT) ?? ads * 100 / 112;
  const adVAT = pick(d.adVAT, item.adVAT) ?? ads - adsExVAT;
  const adjustments = pick(item.adjustments) ?? (number(i.adjustmentCredits) - number(d.adjustmentFee));
  const dineOut = pick(item.dineOutPayout, i.dineOutPayout, d.dineOutPromo) ?? 0;
  const other = pick(item.otherPayoutImpact) ?? (number(i.otherIncomes) - number(d.otherBaFees));
  // Saved Grab gross includes positive non-order payouts. Add them back only below order payout.
  const adjustmentCredits = pick(i.adjustmentCredits) ?? Math.max(0, adjustments);
  const otherCredits = pick(i.otherIncomes) ?? Math.max(0, other);
  const paymentGross = gross - Math.max(0, dineOut) - adjustmentCredits - otherCredits;
  const orderPayout = paymentGross - promo - commission;
  return { gross, paymentGross, actualNetPayout, product, delivery, promo, marketing, channelCommission,
    orderCommission, commission, ads, adsExVAT, adVAT, adjustments, dineOut, other, orderPayout,
    feeTax: pick(item.feeTax, d.feeTax) ?? 0,
    calculatedNetPayout: orderPayout - ads + adjustments + dineOut + other };
}
