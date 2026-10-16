import assert from 'node:assert/strict';
import test from 'node:test';
import { findLineIdentityBinding, makeLineIdentityBinding, normalizeLineSubject } from './lineIdentityBinding';

test('LINE subject is opaque and rejects unsafe or empty values', () => {
  assert.equal(normalizeLineSubject('U012345abcdef'), 'U012345abcdef');
  assert.throws(() => normalizeLineSubject(''), /INVALID_LINE_SUBJECT/);
  assert.throws(() => normalizeLineSubject('foo@example.com'), /INVALID_LINE_SUBJECT/);
});

test('a LINE identity cannot be linked twice or assigned to another user', () => {
  const binding = makeLineIdentityBinding([], 'U123', 'user-1', new Date('2026-10-14T00:00:00Z'));
  assert.equal(findLineIdentityBinding([binding], 'U123')?.userId, 'user-1');
  assert.throws(() => makeLineIdentityBinding([binding], 'U123', 'user-2'), /LINE_IDENTITY_ALREADY_LINKED/);
  assert.throws(() => makeLineIdentityBinding([binding], 'U456', 'user-1'), /FARMPRO_USER_ALREADY_LINKED/);
});

test('conflicting stored mappings fail closed rather than choosing a farm', () => {
  const one = makeLineIdentityBinding([], 'U123', 'user-1');
  assert.throws(
    () => findLineIdentityBinding([one, { ...one, userId: 'user-2' }], 'U123'),
    /DUPLICATE_LINE_IDENTITY/,
  );
});

test('invalid user and date cannot create identity mappings', () => {
  assert.throws(() => makeLineIdentityBinding([], 'U123', ''), /INVALID_FARMPRO_USER/);
  assert.throws(() => makeLineIdentityBinding([], 'U123', 'user-1', new Date(NaN)), /INVALID_LINK_DATE/);
});
