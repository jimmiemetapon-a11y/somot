import test from 'node:test';
import assert from 'node:assert/strict';
import { getGrabPayoutBreakdown } from '../src/utils/grabPayout.js';
const stored = () => ({financials:{gross:1150,net:765},breakdown:{deductions:{
 merchantProductDiscount:100,merchantDeliveryDiscount:20,merchantDiscount:120,
 marketingSuccessFee:30,channelCommission:150,orderCommission:25,commission:205,
 adsFee:56,adsExVAT:50,adVAT:6,otherBaFees:4},incomes:{dineOutPayout:100,adjustmentCredits:20,otherIncomes:30}}});
test('saved nested schema preserves each payout line and matches recorded payout',()=>{
 const p=getGrabPayoutBreakdown(stored());
 assert.equal(p.product,100);assert.equal(p.delivery,20);assert.equal(p.marketing,30);
 assert.equal(p.channelCommission,150);assert.equal(p.orderCommission,25);assert.equal(p.commission,205);
 assert.equal(p.ads,56);assert.equal(p.adsExVAT,50);assert.equal(p.adVAT,6);
 assert.equal(p.adjustments,20);assert.equal(p.dineOut,100);assert.equal(p.other,26);
 assert.equal(p.paymentGross,1000);assert.equal(p.calculatedNetPayout,765);assert.equal(p.actualNetPayout,765);
});
test('explicit zero overrides fallback values',()=>{
 const row=stored();row.breakdown.deductions.merchantDeliveryDiscount=0;row.merchantDeliveryDiscount=999;
 row.dineOutPayout=0;row.adjustments=0;row.financials.net=0;row.actualNetPayout=999;
 const p=getGrabPayoutBreakdown(row);assert.equal(p.delivery,0);assert.equal(p.dineOut,0);assert.equal(p.adjustments,0);assert.equal(p.actualNetPayout,0);
});
test('other income never becomes Dine Out',()=>{
 const p=getGrabPayoutBreakdown({financials:{gross:1030,net:1030},breakdown:{incomes:{otherIncomes:30}}});
 assert.equal(p.dineOut,0);assert.equal(p.other,30);assert.equal(p.paymentGross,1000);assert.equal(p.calculatedNetPayout,1030);
});
test('combined commission fallback does not count components twice',()=>{
 const p=getGrabPayoutBreakdown({financials:{gross:1000},breakdown:{deductions:{commission:205,marketingFee:30,orderCommission:25}}});
 assert.equal(p.channelCommission,150);assert.equal(p.commission,205);assert.equal(p.orderPayout,795);
});
test('legacy aggregate promo is recovered without losing delivery discount',()=>{
 const p=getGrabPayoutBreakdown({breakdown:{deductions:{merchantDiscount:120,deliveryDiscount:20}}});
 assert.equal(p.product,100);assert.equal(p.delivery,20);assert.equal(p.promo,120);
});
test('positive payouts are excluded from payment gross before the waterfall adds them once',()=>{
 const row=stored();row.breakdown.deductions.otherBaFees=0;row.financials.net=769;
 const p=getGrabPayoutBreakdown(row);assert.equal(p.paymentGross,1000);assert.equal(p.orderPayout,675);
 assert.equal(p.calculatedNetPayout,769);assert.equal(p.actualNetPayout,769);
});
