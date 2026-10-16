import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeLineWithdrawalCallback } from './lineWithdrawalCallbackGuard';
import { makeLineIdentityBinding } from './lineIdentityBinding';

const user = { id: 'user-one', farmId: 'farm-one', active: true };
const purpose = { purpose: 'withdrawal-reauth' as const, userId: 'user-one', farmId: 'farm-one' };
const bindings = [makeLineIdentityBinding([], 'U123', 'user-one')];

test('allows verified withdrawal purpose for currently active linked user', () => {
  assert.deepEqual(authorizeLineWithdrawalCallback(purpose, 'U123', user, bindings), {
    userId: 'user-one', farmId: 'farm-one',
  });
});

test('rejects normal login, wrong LINE account and different farm', () => {
  assert.throws(() => authorizeLineWithdrawalCallback({ purpose: 'login' }, 'U123', user, bindings), /PURPOSE_MISMATCH/);
  assert.throws(() => authorizeLineWithdrawalCallback(purpose, 'U456', user, bindings), /IDENTITY_MISMATCH/);
  assert.throws(() => authorizeLineWithdrawalCallback(purpose, 'U123', { ...user, farmId: 'farm-two' }, bindings), /PURPOSE_MISMATCH/);
  assert.throws(() => authorizeLineWithdrawalCallback(purpose, 'U123', null, bindings), /SESSION_REQUIRED/);
  assert.throws(() => authorizeLineWithdrawalCallback(purpose, 'U123', { ...user, active: false }, bindings), /SESSION_REQUIRED/);
});
