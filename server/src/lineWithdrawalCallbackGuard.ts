import { assertLineOAuthPurpose, type LineOAuthPurpose } from './lineOAuthPurpose';
import { assertLineWithdrawalIdentityMatches } from './lineWithdrawalIdentity';
import type { LineIdentityBinding } from './lineIdentityBinding';

/**
 * Fail-closed, side-effect-free callback authorization for withdrawal reauth.
 * Call ONLY after an actual server-side LINE token exchange and verification,
 * single-use state/nonce consumption, and current FarmPro session verification.
 * This neither issues a withdrawal proof nor deletes an account.
 */
export function authorizeLineWithdrawalCallback(
  storedPurpose: LineOAuthPurpose | null,
  verifiedLineSubject: string,
  currentUser: { id: string; farmId: string; active: boolean } | null,
  bindings: readonly LineIdentityBinding[],
): { userId: string; farmId: string } {
  if (!currentUser || currentUser.active !== true ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(currentUser.id) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(currentUser.farmId)) {
    throw new Error('LINE_WITHDRAWAL_CURRENT_SESSION_REQUIRED');
  }
  assertLineOAuthPurpose(storedPurpose, {
    purpose: 'withdrawal-reauth', userId: currentUser.id, farmId: currentUser.farmId,
  });
  assertLineWithdrawalIdentityMatches(verifiedLineSubject, currentUser.id, bindings);
  return { userId: currentUser.id, farmId: currentUser.farmId };
}
