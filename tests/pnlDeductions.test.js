import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileInstoreDeductions } from '../src/utils/pnlDeductions.js';
const sale = (total, deductions) => ({financials:{totalDeductions:total},breakdown:{deductions}});
test('reported figures leave a visible unexplained residual rather than inventing Dine Out',()=>{
 const value=reconcileInstoreDeductions(sale(36148.69,{otherDiscount:32285.93,ayalaGrabDineOut:1761.84}));
 assert.equal(value.instore,36148.69);assert.equal(value.details.ayalaGrabDineOut,1761.84);assert.equal(value.details.unreconciled,2100.92);
});
test('bank fees remain separate and are not counted twice',()=>{
 const value=reconcileInstoreDeductions(sale(36148.69,{otherDiscount:32285.93,ayalaGrabDineOut:1761.84,bankCardFee:2100.92}));
 assert.equal(value.instore,34047.77);assert.equal(value.bank,2100.92);assert.equal(value.details.unreconciled,0);
 assert.equal(Math.round((value.instore+value.bank)*100),3614869);
});
test('voids and KiotViet Dine Out excluded from gross are not additional deductions',()=>{
 const value=reconcileInstoreDeductions(sale(50,{productDiscount:30,tax:20,voidInvoice:100,grabDineOut:200}));
 assert.equal(value.instore,50);assert.equal(value.details.unreconciled,0);
});
test('stored zero is authoritative; negative mismatches remain visible',()=>{
 const value=reconcileInstoreDeductions(sale(0,{otherDiscount:10}));
 assert.equal(value.instore,0);assert.equal(value.details.unreconciled,-10);
});
test('missing legacy total falls back only to known deduction fields',()=>{
 const value=reconcileInstoreDeductions(sale(undefined,{otherDiscount:100,ayalaGrabDineOut:20,bankCardFee:5}));
 assert.equal(value.total,125);assert.equal(value.instore,120);assert.equal(value.details.unreconciled,0);
});
