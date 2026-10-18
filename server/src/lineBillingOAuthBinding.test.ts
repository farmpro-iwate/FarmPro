import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { verifyBillingOAuthBinding } from './lineBillingOAuthBinding';

const secret='test-server-secret';
const state='a'.repeat(64);
const make=(user='user-1',farm='farm-1',s=state,time=1000)=>{
 const p=[user,farm,s,time].join('.');
 return p+'.'+crypto.createHmac('sha256',secret).update(p).digest('hex');
};
test('requires exact verified account, state and valid signature',()=>{
 assert.deepEqual(verifyBillingOAuthBinding(make(),state,secret,1001),{userId:'user-1',farmId:'farm-1'});
 assert.throws(()=>verifyBillingOAuthBinding(make('user-2'),'b'.repeat(64),secret,1001),/INVALID/);
 assert.throws(()=>verifyBillingOAuthBinding(make()+'.extra',state,secret,1001),/INVALID/);
 assert.throws(()=>verifyBillingOAuthBinding(make().replace('user-1','user-2'),state,secret,1001),/INVALID/);
 assert.throws(()=>verifyBillingOAuthBinding(make(),state,'wrong-secret',1001),/INVALID/);
 assert.throws(()=>verifyBillingOAuthBinding(make('user-1','farm-1',state,1000.5),state,secret,1001),/INVALID/);
});
test('rejects expired or future browser bindings',()=>{
 assert.throws(()=>verifyBillingOAuthBinding(make(),state,secret,301000),/EXPIRED/);
 assert.throws(()=>verifyBillingOAuthBinding(make(),state,secret,999),/EXPIRED/);
});
