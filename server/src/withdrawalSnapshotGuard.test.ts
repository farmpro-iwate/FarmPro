import assert from 'node:assert/strict';
import test from 'node:test';
import { assertUnchangedWithdrawalSnapshot } from './withdrawalSnapshotGuard';
const previous='a'.repeat(64);
test('identical valid snapshot allows further independent withdrawal checks',()=>{
  assert.doesNotThrow(()=>assertUnchangedWithdrawalSnapshot(previous,previous));
});
test('contract or farm snapshot change blocks withdrawal',()=>{
  assert.throws(()=>assertUnchangedWithdrawalSnapshot(previous,'b'.repeat(64)),/STATE_CHANGED/);
  assert.throws(()=>assertUnchangedWithdrawalSnapshot('untrusted',previous),/SNAPSHOT_INVALID/);
});
