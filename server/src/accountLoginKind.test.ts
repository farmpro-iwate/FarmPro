import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAccountLogin } from './accountLoginKind';

test('recognizes unchanged legacy email credentials', () => {
  const old = { email:'user@example.com', passwordSalt:'salt', passwordHash:'hash' };
  assert.deepEqual(classifyAccountLogin(old), { kind:'email', credentials:old });
  assert.deepEqual(old, { email:'user@example.com', passwordSalt:'salt', passwordHash:'hash' });
});

test('recognizes LINE-only credentials without inventing email or password', () => {
  assert.deepEqual(classifyAccountLogin({ loginMethod:'line' }), {
    kind:'line', credentials:{ loginMethod:'line' }
  });
});

test('rejects ambiguous and partial account credentials', () => {
  assert.throws(() => classifyAccountLogin({loginMethod:'line',email:'fake@example.com'}),/MUST_NOT_HAVE_PASSWORD/);
  assert.throws(() => classifyAccountLogin({email:'user@example.com'}),/CREDENTIALS_INVALID/);
  assert.throws(() => classifyAccountLogin({loginMethod:'unknown'}),/METHOD_INVALID/);
});
