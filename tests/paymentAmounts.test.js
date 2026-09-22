import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImportedPayments } from '../src/utils/paymentAmounts.js';
test('real zero payment values are accepted',()=>assert.doesNotThrow(()=>validateImportedPayments('dinein','UST',{paymentMethods:{cash:0,bankCard:0,bankTransfer:0}})));
test('missing or invalid payment fields are rejected',()=>{
 for(const paymentMethods of [undefined,{cash:100,bankCard:20},{cash:100,bankCard:NaN,bankTransfer:0}]) assert.throws(()=>validateImportedPayments('dinein','UST',{paymentMethods}),/Payment data is missing/);
});
test('Ayala report without payment columns remains supported',()=>assert.doesNotThrow(()=>validateImportedPayments('dinein','Ayala Cloverleaf',{})));
