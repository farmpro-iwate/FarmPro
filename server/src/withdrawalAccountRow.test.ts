import assert from 'node:assert/strict';
import test from 'node:test';
import { validWithdrawalAccountRow } from './withdrawalAccountRow';
const base={id:'user-one',farmId:'farm-one',farmName:'農場',name:'利用者',active:true,role:'owner',plan:'free'};
test('recognizes legacy email account without changing stored shape',()=>{
  assert.equal(validWithdrawalAccountRow({...base,email:'user@example.com',passwordSalt:'salt',passwordHash:'hash'}),true);
});
test('recognizes separate LINE-only credential shape without invented email',()=>{
  assert.equal(validWithdrawalAccountRow({...base,loginMethod:'line'}),true);
});
test('rejects malformed and mixed credentials',()=>{
  assert.equal(validWithdrawalAccountRow({...base,loginMethod:'line',email:'fake@example.com'}),false);
  assert.equal(validWithdrawalAccountRow({...base,email:'user@example.com'}),false);
  assert.equal(validWithdrawalAccountRow({...base,loginMethod:'line',farmId:'invalid farm'}),false);
});
