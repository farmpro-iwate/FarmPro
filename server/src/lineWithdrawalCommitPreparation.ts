import { preflightLineWithdrawalUnderLock } from './lineWithdrawalPreflight';
import { authorizeLineWithdrawalUnderLock } from './lineWithdrawalCommitGuard';

/**
 * Internal pre-tombstone gate. Must be invoked only while lifecycleLock is held,
 * after authoritative billing/shared-farm checks and before saving the tombstone.
 * This does not perform deletion or persist the tombstone.
 */
export async function prepareLineWithdrawalCommitUnderLock(input: {
  root: string; proof: string; userId: string; farmId: string;
  previewFingerprint: string; currentFingerprint: string;
}): Promise<void> {
  await preflightLineWithdrawalUnderLock(input);
  await authorizeLineWithdrawalUnderLock(input);
}
