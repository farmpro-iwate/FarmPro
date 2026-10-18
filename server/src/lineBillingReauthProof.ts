/** Validate a purpose-specific, recent LINE OAuth reauthentication result.
 * Ordinary LINE login is never sufficient to authorize billing email changes.
 * This is a pure guard, not a proof issuer or HTTP endpoint.
 */
export type BillingReauthProof = Readonly<{
  purpose: 'billing-email-reauth';
  userId: string;
  farmId: string;
  lineSubject: string;
  verifiedAt: number;
  expiresAt: number;
  consumed: boolean;
}>;
export function assertRecentBillingReauth(
  proof: BillingReauthProof | null,
  actor: { userId: string; farmId: string; lineSubject: string },
  now = Date.now(),
): void {
  if (!proof || proof.purpose !== 'billing-email-reauth' || proof.consumed !== false ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(actor.userId) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(actor.farmId) ||
      !/^[a-zA-Z0-9_-]{1,255}$/.test(actor.lineSubject) ||
      proof.userId !== actor.userId || proof.farmId !== actor.farmId ||
      proof.lineSubject !== actor.lineSubject ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(proof.verifiedAt) ||
      !Number.isSafeInteger(proof.expiresAt) || proof.verifiedAt > now ||
      proof.expiresAt <= now || now - proof.verifiedAt > 5 * 60_000 ||
      proof.expiresAt - proof.verifiedAt > 5 * 60_000) {
    throw new Error('LINE_BILLING_REAUTH_REQUIRED');
  }
}
