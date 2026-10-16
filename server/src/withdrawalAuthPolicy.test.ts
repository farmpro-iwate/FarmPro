import assert from 'node:assert/strict';
import test from 'node:test';
import { getWithdrawalAuthPolicy } from './withdrawalAuthPolicy';

test('legacy email users retain password and email-confirmed withdrawal', () => {
  const policy = getWithdrawalAuthPolicy({email:'user@example.com',passwordSalt:'salt',passwordHash:'hash'});
  assert.deepEqual(policy,{kind:'password',requiresPassword:true,requiresEmailConfirmation:true});
});
test('LINE-only users must prove recent LINE authentication instead of synthetic password', () => {
  assert.deepEqual(getWithdrawalAuthPolicy({loginMethod:'line'}),{
    kind:'line',requiresPassword:false,requiresEmailConfirmation:false,requiresFreshLineProof:true
  });
});
test('mixed or incomplete credential records fail closed', () => {
  assert.throws(()=>getWithdrawalAuthPolicy({loginMethod:'line',email:'fake@example.com'}),/LINE_CREDENTIALS_INVALID/);
  assert.throws(()=>getWithdrawalAuthPolicy({email:'user@example.com'}),/EMAIL_CREDENTIALS_INVALID/);
});
