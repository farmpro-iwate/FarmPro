import assert from 'node:assert/strict';
import test from 'node:test';
import { assertWithdrawalRequestMethod } from './withdrawalRequestMethod';
const email={email:'user@example.com',passwordSalt:'salt',passwordHash:'hash'};
const line={loginMethod:'line'};
test('legacy email withdrawal keeps password credentials',()=>{
  assert.equal(assertWithdrawalRequestMethod(email,{email:'user@example.com',password:'a-password'}),'password');
  assert.throws(()=>assertWithdrawalRequestMethod(email,{lineProof:'a'.repeat(64)}),/PASSWORD_CONFIRMATION_REQUIRED/);
});
test('LINE-only withdrawal cannot use legacy email/password confirmation',()=>{
  assert.equal(assertWithdrawalRequestMethod(line,{lineProof:'a'.repeat(64)}),'line');
  assert.throws(()=>assertWithdrawalRequestMethod(line,{email:'user@example.com',password:'a-password'}),/LINE_REAUTH_REQUIRED/);
  assert.throws(()=>assertWithdrawalRequestMethod(line,{lineProof:'bad'}),/LINE_REAUTH_REQUIRED/);
});
