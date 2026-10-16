/** Pure verification of a recent LINE reauthentication proof for sensitive withdrawal.
 * A token from ordinary LINE sign-in does not qualify. The OAuth callback must
 * separately issue a short-lived, single-use, server-backed purpose-bound proof.
 * This validator does not mint or persist such proofs.
 */
export type RecentLineWithdrawalProof = Readonly<{
  purpose: 'account-withdrawal';
  userId: string;
  farmId: string;
  verifiedAt: number;
  expiresAt: number;
  consumed: boolean;
}>;

export function assertRecentLineWithdrawalProof(
  proof: RecentLineWithdrawalProof | null,
  userId: string,
  farmId: string,
  now = Date.now(),
): void {
  if (!proof || proof.purpose !== 'account-withdrawal' ||
      proof.consumed !== false || proof.userId !== userId || proof.farmId !== farmId ||
      !Number.isFinite(proof.verifiedAt) || !Number.isFinite(proof.expiresAt) ||
      proof.verifiedAt > now || proof.expiresAt <= now ||
      proof.expiresAt - proof.verifiedAt > 5 * 60_000 ||
      now - proof.verifiedAt > 5 * 60_000) {
    throw new Error('LINE_WITHDRAWAL_REAUTH_REQUIRED');
  }
}
