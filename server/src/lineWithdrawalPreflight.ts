import { strictRead } from './accountLifecycle';
import { assertUnchangedWithdrawalSnapshot } from './withdrawalSnapshotGuard';

/**
 * Read-only check under the existing lifecycle lock.
 * Do not consume the proof or delete data at this stage.
 * This is useful for fail-closed checks before an eventual durable tombstone.
 */
export async function preflightLineWithdrawalUnderLock(input: {
  root: string;
  previewFingerprint: string;
  currentFingerprint: string;
  userId: string;
  farmId: string;
}): Promise<void> {
  assertUnchangedWithdrawalSnapshot(input.previewFingerprint, input.currentFingerprint);
  const raw = await strictRead(input.root, 'users.json');
  if (!Array.isArray(raw)) throw new Error('LINE_WITHDRAWAL_USERS_UNAVAILABLE');
  const users = raw.filter((row: any) => row?.id === input.userId && row?.farmId === input.farmId && row?.active === true);
  if (users.length !== 1 || users[0].loginMethod !== 'line') {
    throw new Error('LINE_WITHDRAWAL_ACCOUNT_UNAVAILABLE');
  }
}
