import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLineWithdrawalIdentityMatches } from './lineWithdrawalIdentity';
import { makeLineIdentityBinding } from './lineIdentityBinding';

const bindings = [makeLineIdentityBinding([], 'U123', 'user-one')];
test('verified LINE subject must belong to withdrawing account', () => {
  assert.doesNotThrow(() => assertLineWithdrawalIdentityMatches('U123', 'user-one', bindings));
  assert.throws(() => assertLineWithdrawalIdentityMatches('U123', 'user-two', bindings), /IDENTITY_MISMATCH/);
  assert.throws(() => assertLineWithdrawalIdentityMatches('U456', 'user-one', bindings), /IDENTITY_MISMATCH/);
});
test('invalid and conflicting identities cannot authorize a withdrawal', () => {
  assert.throws(() => assertLineWithdrawalIdentityMatches('user@example.com', 'user-one', bindings), /INVALID_LINE_SUBJECT/);
  assert.throws(() => assertLineWithdrawalIdentityMatches('U123', 'user-one', [
    ...bindings, makeLineIdentityBinding([], 'U456', 'user-one'),
  ]), /IDENTITY_MISMATCH/);
});
