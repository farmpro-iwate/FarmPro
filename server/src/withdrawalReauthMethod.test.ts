import assert from 'node:assert/strict';
import test from 'node:test';
import { selectWithdrawalReauthMethod } from './withdrawalReauthMethod';

test('legacy email accounts keep password withdrawal confirmation', () => {
  assert.deepEqual(selectWithdrawalReauthMethod({email:'user@example.com',passwordSalt:'salt',passwordHash:'hash'}), {
    kind:'password',requiresEmail:true,requiresPassword:true,
  });
});
test('LINE-only accounts require a separate purpose-bound proof', () => {
  assert.deepEqual(selectWithdrawalReauthMethod({loginMethod:'line'}), {
    kind:'line',requiresEmail:false,requiresPassword:false,requiresPurposeBoundProof:true,
  });
});
test('incomplete and ambiguous credentials are rejected', () => {
  assert.throws(()=>selectWithdrawalReauthMethod({loginMethod:'line',email:'invented@example.com'}),/LINE_CREDENTIALS_INVALID/);
  assert.throws(()=>selectWithdrawalReauthMethod({email:'user@example.com'}),/EMAIL_CREDENTIALS_INVALID/);
});
