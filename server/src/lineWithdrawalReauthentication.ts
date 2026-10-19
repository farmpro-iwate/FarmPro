import type { VerifiedLineIdentity } from './lineLoginOAuth';
import { consumeLineWithdrawalOAuthIntent } from './lineWithdrawalOAuthIntent';
import { assertNativeLineWithdrawalIdentity } from './lineWithdrawalIdentity';
import { issueLineWithdrawalConfirmation } from './lineWithdrawalConfirmation';

/**
 * Server-only withdrawal reauthentication completion.
 * The caller MUST obtain verifiedIdentity by fresh exchangeAndVerifyLineCode
 * using the nonce returned from the withdrawal-specific challenge.
 * No HTTP route invokes this function yet; it cannot delete an account.
 */
export async function completeVerifiedLineWithdrawalReauthentication(
  input: {
    state: string;
    browserSecret: string;
    actor: { id: string; farmId: string };
    target: { id: string; farmId: string };
    verifiedIdentity: VerifiedLineIdentity;
  },
): Promise<string> {
  // Consume first, even for mismatched identity: no replay or retries of a failed proof.
  // The nonce must come from this consumed intent and must have been used
  // when verifying the LINE ID token before this function is called.
  await consumeLineWithdrawalOAuthIntent(input.state, input.browserSecret, input.actor);
  await assertNativeLineWithdrawalIdentity(input.actor, input.target, input.verifiedIdentity);
  return issueLineWithdrawalConfirmation(input.actor.id, input.actor.farmId);
}
