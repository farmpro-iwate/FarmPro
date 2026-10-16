import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyWithdrawalAccountReadiness } from './withdrawalAccountReadiness';

test('legacy email account still uses original withdrawal flow', () => {
  assert.deepEqual(classifyWithdrawalAccountReadiness({email:'user@example.com',passwordSalt:'salt',passwordHash:'hash'}),{method:'password',readyForLegacyFlow:true});
});
test('LINE-only account does not enter password-based withdrawal', () => {
  assert.deepEqual(classifyWithdrawalAccountReadiness({loginMethod:'line'}),{method:'line',readyForLegacyFlow:false,requiresDedicatedFlow:true});
});
test('mixed credentials fail closed', () => {
  assert.throws(()=>classifyWithdrawalAccountReadiness({loginMethod:'line',passwordHash:'hash'}),/LINE_CREDENTIALS_INVALID/);
});
