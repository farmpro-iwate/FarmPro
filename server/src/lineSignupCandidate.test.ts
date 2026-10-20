import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareLineSignup } from './lineSignupCandidate';
import { makeLineIdentityBinding } from './lineIdentityBinding';

const profile = { farmName:'青空農場', name:'利用者', plan:'free' as const, role:'owner' as const };

test('prepares an email-free LINE owner without changing caller arrays', () => {
  const users = [{id:'old',farmId:'farm-old'}];
  const bindings = [makeLineIdentityBinding([], 'U-old', 'old')];
  const proposal = prepareLineSignup(users, bindings, 'U-new', profile, 'new', 'farm-new');
  assert.equal(proposal.user.loginMethod, 'line');
  assert.equal('email' in proposal.user, false);
  assert.equal('passwordHash' in proposal.user, false);
  assert.equal(proposal.binding.subject, 'U-new');
  assert.equal(users.length, 1);
  assert.equal(bindings.length, 1);
});

test('blocks reused subjects, user IDs and farm IDs', () => {
  const users = [{id:'old',farmId:'farm-old'}];
  const bindings = [makeLineIdentityBinding([], 'U-old', 'old')];
  assert.throws(()=>prepareLineSignup(users, bindings, 'U-old', profile, 'new', 'farm-new'),/ALREADY_REGISTERED/);
  assert.throws(()=>prepareLineSignup(users, bindings, 'U-new', profile, 'old', 'farm-new'),/ID_ALREADY_USED/);
  assert.throws(()=>prepareLineSignup(users, bindings, 'U-new', profile, 'new', 'farm-old'),/ID_ALREADY_USED/);
});

test('rejects invalid profile and fabricated provider identity', () => {
  assert.throws(()=>prepareLineSignup([], [], 'U-new', {...profile, plan:'pro' as 'free'}, 'new', 'farm-new'),/INVALID_PROFILE/);
  assert.throws(()=>prepareLineSignup([], [], 'user@example.com', profile, 'new', 'farm-new'),/INVALID_LINE_SUBJECT/);
});
