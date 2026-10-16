import crypto from 'node:crypto';

/**
 * Bind the LINE-only withdrawal confirmation to the same server-verified
 * contract/farm snapshot used during preview. Never accept a browser-created
 * fingerprint as authoritative. This check alone does not consume a proof or
 * authorize a destructive operation.
 */
export function assertUnchangedWithdrawalSnapshot(
  previewFingerprint: string,
  freshFingerprint: string,
): void {
  const hex = /^[a-f0-9]{64}$/;
  if (!hex.test(previewFingerprint) || !hex.test(freshFingerprint)) {
    throw new Error('WITHDRAWAL_SNAPSHOT_INVALID');
  }
  if (!crypto.timingSafeEqual(
    Buffer.from(previewFingerprint, 'hex'),
    Buffer.from(freshFingerprint, 'hex'),
  )) {
    throw new Error('WITHDRAWAL_STATE_CHANGED');
  }
}
