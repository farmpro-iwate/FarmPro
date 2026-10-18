import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLineOAuthPurpose } from './lineOAuthPurpose';

const expected = { purpose: 'billing-email-reauth' as const, userId: 'line-owner', farmId: 'farm-a' };

test('billing email reauthentication purpose is limited to its original account and farm', () => {
  assert.doesNotThrow(() => assertLineOAuthPurpose(expected, expected));
  assert.throws(() => assertLineOAuthPurpose({ ...expected, userId: 'other-owner' }, expected), /LINE_OAUTH_PURPOSE_MISMATCH/);
  assert.throws(() => assertLineOAuthPurpose({ ...expected, farmId: 'farm-b' }, expected), /LINE_OAUTH_PURPOSE_MISMATCH/);
  assert.throws(() => assertLineOAuthPurpose({ purpose: 'withdrawal-reauth', userId: 'line-owner', farmId: 'farm-a' }, expected), /LINE_OAUTH_PURPOSE_MISMATCH/);
  assert.throws(() => assertLineOAuthPurpose({ purpose: 'login' }, expected), /LINE_OAUTH_PURPOSE_MISMATCH/);
  assert.throws(() => assertLineOAuthPurpose(null, expected), /LINE_OAUTH_PURPOSE_MISMATCH/);
});
