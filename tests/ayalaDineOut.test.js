import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as rules from '../src/utils/ayalaDineOut.js';
const date = '2026-09-01';
const dine = () => ({ channelId: 'dinein', branchId: rules.AYALA_BRANCH, date,
  financials: { gross: 1200, net: 1000, totalDeductions: 200 },
  paymentMethods: { cash: 500 }, hourlyNet: { '10': 1000 },
  breakdown: { deductions: { vatAdjustment: 200 }, kpi: { drinkOrders: 2 } } });
const grab = (amount = 100) => ({ channelId: 'grabfood', branchId: rules.AYALA_BRANCH, date, dineOutPayout: amount });

test('Ayala net deducts only same-day Grab payout; gross and payments stay intact', () => {
  const input=dine();const result=rules.reconcileAyalaDineOut(input,grab(),'grab-id');
  assert.equal(result.financials.net,900);assert.equal(result.financials.totalDeductions,300);
  assert.equal(result.financials.gross,1200);assert.equal(result.breakdown.deductions.ayalaGrabDineOut,100);
  assert.deepEqual(result.paymentMethods,input.paymentMethods);assert.deepEqual(result.hourlyNet,input.hourlyNet);
  assert.deepEqual(result.breakdown.kpi,input.breakdown.kpi);assert.equal(input.financials.net,1000);
  assert.equal(result.dineOutAdjustment.sourceId,'grab-id');
});
test('repeat, corrected payout, zero and deletion replace rather than accumulate adjustments',()=>{
 let row=rules.reconcileAyalaDineOut(dine(),grab());
 row=rules.reconcileAyalaDineOut(row,grab());assert.equal(row.financials.net,900);
 row=rules.reconcileAyalaDineOut(row,grab(150));assert.equal(row.financials.net,850);
 row=rules.reconcileAyalaDineOut(row,{...grab(0),breakdown:{incomes:{dineOutPayout:999}}});assert.equal(row.financials.net,1000);
 row=rules.reconcileAyalaDineOut(row,grab());row=rules.reconcileAyalaDineOut(row,null);
 assert.equal(row.financials.net,1000);assert.equal(row.financials.totalDeductions,200);
});
test('legacy explicit payout supported; unrelated credits are never Dine Out',()=>{
 assert.equal(rules.grabDineOutAmount({breakdown:{incomes:{dineOutPayout:100,otherIncomes:900}}}),100);
 assert.equal(rules.grabDineOutAmount({breakdown:{incomes:{otherIncomes:900}}}),0);
});
test('other branches and dates cannot receive Ayala adjustments',()=>{
 const other={...dine(),branchId:'UST'};assert.equal(rules.reconcileAyalaDineOut(other,grab()),other);
 assert.throws(()=>rules.reconcileAyalaDineOut(dine(),{...grab(),date:'2026-09-02'}));
 assert.throws(()=>rules.reconcileAyalaDineOut(dine(),{...grab(),branchId:'UST'}));
});
test('negative payout reversal and cent precision remain mathematically consistent',()=>{
 assert.equal(rules.reconcileAyalaDineOut(dine(),grab(-25)).financials.net,1025);
 assert.equal(rules.reconcileAyalaDineOut(dine(),grab(100.15)).financials.net,899.85);
});
function serviceHarness() {
 const records=new Map();
 const doc=(_,collection,id)=>({id,path:`${collection}/${id}`});
 const put=(ref,data)=>records.set(ref.path,structuredClone(data));
 const context=vm.createContext({...rules,doc,setDoc:async(ref,data)=>put(ref,data),deleteDoc:async ref=>records.delete(ref.path),
  runTransaction:async(_,callback)=>{
   const pending=[];
   const result=await callback({get:async ref=>{const value=records.get(ref.path);return {exists:()=>value!==undefined,data:()=>structuredClone(value)}},
    set:(ref,data)=>pending.push(()=>put(ref,data)),delete:ref=>pending.push(()=>records.delete(ref.path))});
   pending.forEach(apply=>apply());return result;
  }});
 vm.runInContext(readFileSync(new URL('../src/services/ayalaDineOut.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''),context);
 return {records,context,dineRef:doc(null,'daily_sales',`dinein_AyalaCloverleaf_${date}`),grabRef:doc(null,'daily_sales',`grabfood_AyalaCloverleaf_${date}`)};
}
for(const order of ['dine-first','grab-first'])test(`import order ${order}, reimport and Grab deletion reconcile saved net`,async()=>{
 const {records,context,dineRef,grabRef}=serviceHarness();
 const saveDine=()=>context.saveWithAyalaDineOut({},dineRef,dine());
 const saveGrab=()=>context.saveWithAyalaDineOut({},grabRef,grab());
 if(order==='dine-first'){await saveDine();await saveGrab()}else{await saveGrab();await saveDine()}
 assert.equal(records.get(dineRef.path).financials.net,900);
 await saveGrab();await saveDine();assert.equal(records.get(dineRef.path).financials.net,900);
 await context.saveWithAyalaDineOut({},grabRef,grab(150));assert.equal(records.get(dineRef.path).financials.net,850);
 await context.deleteWithAyalaDineOut({},grabRef,grab(150));assert.equal(records.get(dineRef.path).financials.net,1000);
});
test('historical sync is repeatable without double deductions',async()=>{
 const {records,context,dineRef,grabRef}=serviceHarness();records.set(dineRef.path,dine());records.set(grabRef.path,grab());
 await context.syncAyalaDineOut({},date);await context.syncAyalaDineOut({},date);
 assert.equal(records.get(dineRef.path).financials.net,900);
});
