import assert from 'node:assert/strict';
import test from 'node:test';
import { planLineSignupLedgerCommit } from './lineSignupLedgerPlan';
import type { LineSignupCandidate } from './lineSignupCandidate';

const user: LineSignupCandidate = {
  id: 'user-new', farmId: 'farm-new', farmName: '青空農場', name: '利用者',
  loginMethod: 'line', role: 'owner', active: true, plan: 'free',
};
const empty = { version: 1 as const, entries: [] };

test('stages user and identity in a single immutable ledger snapshot', () => {
  const next = planLineSignupLedgerCommit(empty, 'request-one', 'U123', user);
  assert.equal(next.entries.length, 1);
  assert.equal(next.entries[0].user.id, user.id);
  assert.equal(next.entries[0].subject, 'U123');
  assert.equal(empty.entries.length, 0);
  assert.equal('email' in next.entries[0].user, false);
});

test('rejects replay and repeated subject', () => {
  const once = planLineSignupLedgerCommit(empty, 'request-one', 'U123', user);
  assert.throws(() => planLineSignupLedgerCommit(once, 'request-one', 'U456', { ...user, id: 'another', farmId: 'another-farm' }), /ALREADY_COMMITTED/);
  assert.throws(() => planLineSignupLedgerCommit(once, 'request-two', 'U123', { ...user, id: 'another', farmId: 'another-farm' }), /ALREADY_COMMITTED/);
  assert.throws(() => planLineSignupLedgerCommit(once, 'request-two', 'U456', user), /ID_ALREADY_USED/);
});

test('rejects corrupt ledger instead of overwriting identities', () => {
  const once = planLineSignupLedgerCommit(empty, 'request-one', 'U123', user);
  assert.throws(() => planLineSignupLedgerCommit({version:1,entries:[once.entries[0],once.entries[0]]},'request-two','U456',{ ...user,id:'another',farmId:'another-farm'}),/LEDGER_CORRUPT/);
});

test('rejects historical ledger with an invalid LINE-only account', () => {
  const once = planLineSignupLedgerCommit(empty, 'request-one', 'U123', user);
  const corrupted = { ...once.entries[0], user: { ...user, email: 'fake@example.com' } };
  assert.throws(
    () => planLineSignupLedgerCommit(
      { version: 1, entries: [corrupted as typeof once.entries[number]] },
      'request-two', 'U456', { ...user, id: 'another', farmId: 'another-farm' },
    ),
    /LEDGER_CORRUPT/,
  );
});

test('rejects malformed historical request IDs and missing farm profiles', () => {
  const once = planLineSignupLedgerCommit(empty, 'request-one', 'U123', user);
  const malformedRequest = { ...once.entries[0], requestId: 'bad request' };
  assert.throws(() => planLineSignupLedgerCommit(
    { version: 1, entries: [malformedRequest] }, 'next-request', 'U456',
    { ...user, id: 'next-user', farmId: 'next-farm' },
  ), /LEDGER_CORRUPT/);
  const missingName = { ...once.entries[0], user: { ...user, farmName: '' } };
  assert.throws(() => planLineSignupLedgerCommit(
    { version: 1, entries: [missingName] }, 'next-request', 'U456',
    { ...user, id: 'next-user', farmId: 'next-farm' },
  ), /LEDGER_CORRUPT/);
});
