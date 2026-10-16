import { assertUnchangedWithdrawalSnapshot } from './withdrawalSnapshotGuard';
import { consumeLineWithdrawalProofUnderLock } from './lineWithdrawalProofStore';

/**
 * INTERNAL: Called with lifecycleLock already held, after authoritative
 * billing/farm eligibility checks. Do not expose as an endpoint.
 * This verifies the preview snapshot BEFORE burning the reauth proof.
 * The caller must write the durable withdrawal tombstone immediately after
 * this returns, still under the same lock.
 */
export async function authorizeLineWithdrawalUnderLock(input: {
  root: string; proof: string; userId: string; farmId: string;
  previewFingerprint: string; currentFingerprint: string;
}): Promise<void> {
  assertUnchangedWithdrawalSnapshot(input.previewFingerprint, input.currentFingerprint);
  await consumeLineWithdrawalProofUnderLock(input.root, input.proof, input.userId, input.farmId);
}
