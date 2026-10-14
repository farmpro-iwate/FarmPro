import assert from 'node:assert/strict';
import test from 'node:test';
import { LineLoginChallenges } from './lineLoginChallenges';

test('challenge contains random one-time values', () => {
  const store = new LineLoginChallenges();
  const a = store.issue(100);
  const b = store.issue(100);
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.nonce, b.nonce);
  assert.equal(store.consume(a.state, 200), a.nonce);
  assert.throws(() => store.consume(a.state, 200), /LINE_STATE_EXPIRED_OR_USED/);
});

test('invalid and expired states fail closed', () => {
  const store = new LineLoginChallenges();
  const a = store.issue(0);
  assert.throws(() => store.consume('bad', 1), /LINE_STATE_INVALID/);
  assert.throws(() => store.consume(a.state, 600_000), /LINE_STATE_EXPIRED_OR_USED/);
  assert.throws(() => store.consume(a.state, 1), /LINE_STATE_EXPIRED_OR_USED/);
});
