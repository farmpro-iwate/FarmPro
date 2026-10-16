import { consumeDurableLineChallenge } from './lineDurableChallenges';
import { consumeLineOAuthPurpose } from './lineOAuthPurposeStore';
import { assertLineWithdrawalIdentityMatches } from './lineWithdrawalIdentity';
import type { LineIdentityBinding } from './lineIdentityBinding';

/**
 * Callback guard after server-side LINE code/ID-token verification.
 * Consumes browser-bound state before checking withdrawal-only purpose.
 * Not a live endpoint; caller must independently verify session and token.
 */
export async function completeLineWithdrawalReauthGuard(input: {
  state: string;
  browserSecret: string;
  verifiedSubject: string;
  currentUser: { id: string; farmId: string; active: boolean } | null;
  bindings: readonly LineIdentityBinding[];
}): Promise<{ userId: string; farmId: string }> {
  // Consume state even if the current session is invalid; fail closed.
  await consumeDurableLineChallenge(input.state, input.browserSecret);
  const user = input.currentUser;
  if (!user || user.active !== true) {
    throw new Error('LINE_WITHDRAWAL_CURRENT_SESSION_REQUIRED');
  }
  await consumeLineOAuthPurpose(input.state, {
    purpose: 'withdrawal-reauth', userId: user.id, farmId: user.farmId,
  });
  assertLineWithdrawalIdentityMatches(input.verifiedSubject, user.id, input.bindings);
  return { userId: user.id, farmId: user.farmId };
}
