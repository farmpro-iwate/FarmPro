import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBillingEmailCode, issueBillingEmailCode } from './lineBillingEmailCode';

const person = { userId: 'line-a', farmId: 'farm-a', lineSubject: 'Uline-a' };
test('billing email challenge is bound to one LINE identity and expires after 10 minutes', () => {
  const { code, challenge } = issueBillingEmailCode(person, ' OWNER@example.invalid ', 1000);
  assert.equal(challenge.email, 'owner@example.invalid');
  assert.equal(challenge.codeHash.includes(code), false);
  assert.equal(checkBillingEmailCode(challenge, person, code, 599999).accepted, true);
  assert.throws(() => checkBillingEmailCode(challenge, person, code, 601000), /EXPIRED/);
  assert.throws(() => checkBillingEmailCode(challenge, { ...person, farmId: 'other' }, code, 1000), /IDENTITY_MISMATCH/);
  assert.throws(() => checkBillingEmailCode(challenge, { ...person, lineSubject: 'other' }, code, 1000), /IDENTITY_MISMATCH/);
});
test('failed verification locks after five attempts', () => {
  const { challenge } = issueBillingEmailCode(person, 'x@example.invalid', 1000);
  let next = challenge;
  for (let i = 1; i <= 5; i++) {
    const result = checkBillingEmailCode(next, person, '000000', 1001);
    assert.equal(result.accepted, false);
    assert.equal(result.locked, i === 5);
    next = result.next;
  }
  assert.throws(() => checkBillingEmailCode(next, person, '000000', 1002), /EXPIRED/);
});
