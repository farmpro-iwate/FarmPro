import assert from 'node:assert/strict';
import test from 'node:test';
import { canStartLineBillingEmailEnrollment } from './lineBillingEmailEligibility';

const actor = {
  id: 'line-owner',
  farmId: 'line-farm',
  role: 'owner',
  active: true,
  loginMethod: 'line',
  lineSubject: 'UlineSubject',
};

test('only active LINE-only owner may begin billing email enrollment', () => {
  assert.equal(canStartLineBillingEmailEnrollment(actor), true);
  assert.equal(canStartLineBillingEmailEnrollment(null), false);
  assert.equal(canStartLineBillingEmailEnrollment({ ...actor, role: 'member' }), false);
  assert.equal(canStartLineBillingEmailEnrollment({ ...actor, active: false }), false);
  assert.equal(canStartLineBillingEmailEnrollment({ ...actor, loginMethod: 'email' }), false);
  assert.equal(canStartLineBillingEmailEnrollment({ ...actor, lineSubject: '' }), false);
  assert.equal(canStartLineBillingEmailEnrollment({ ...actor, email: 'payer@example.invalid' }), false);
  assert.equal(canStartLineBillingEmailEnrollment({ ...actor, farmId: '../other-farm' }), false);
  assert.equal(canStartLineBillingEmailEnrollment({ ...actor, id: '' }), false);
});
