import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLineSignupNotAlreadyLinked } from './lineSignupGuard';
import { makeLineIdentityBinding } from './lineIdentityBinding';

test('permits verified LINE subject when no binding exists', () => {
  assert.doesNotThrow(() => assertLineSignupNotAlreadyLinked([], 'U123'));
});

test('rejects already registered LINE identity without creating another farm', () => {
  const binding = makeLineIdentityBinding([], 'U123', 'existing-user');
  assert.throws(() => assertLineSignupNotAlreadyLinked([binding], 'U123'), /LINE_SIGNUP_ALREADY_REGISTERED/);
});

test('rejects duplicate corrupt stored binding rather than picking a user', () => {
  const binding = makeLineIdentityBinding([], 'U123', 'existing-user');
  assert.throws(() => assertLineSignupNotAlreadyLinked([binding, { ...binding, userId: 'other-user' }], 'U123'), /DUPLICATE_LINE_IDENTITY/);
});

test('rejects untrusted email-shaped identity', () => {
  assert.throws(() => assertLineSignupNotAlreadyLinked([], 'user@example.com'), /INVALID_LINE_SUBJECT/);
});
