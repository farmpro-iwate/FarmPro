import { exchangeAndVerifyLineCode, getLineLoginConfig } from './lineLoginOAuth';
import { consumeLineWithdrawalOAuthIntent } from './lineWithdrawalOAuthIntent';
import { assertNativeLineWithdrawalIdentity } from './lineWithdrawalIdentity';
import { issueLineWithdrawalConfirmation } from './lineWithdrawalConfirmation';

/**
 * Internal-only completion of fresh, withdrawal-specific LINE OAuth.
 * No HTTP route invokes this function yet; this function never deletes data.
 */
export async function completeVerifiedLineWithdrawalReauthentication(
  input: {
    state: string;
    browserSecret: string;
    code: string;
    actor: { id: string; farmId: string };
    target: { id: string; farmId: string };
  },
): Promise<string> {
  // Consume before token exchange. A failed or mismatched attempt cannot replay state.
  const nonce = await consumeLineWithdrawalOAuthIntent(input.state, input.browserSecret, input.actor);
  const config = getLineLoginConfig();
  if (!config) throw new Error('LINE_WITHDRAWAL_OAUTH_UNAVAILABLE');
  // LINE verifies the nonce, audience, issuer, expiry, and ID token before we trust the subject.
  const identity = await exchangeAndVerifyLineCode(config, input.code, nonce);
  await assertNativeLineWithdrawalIdentity(input.actor, input.target, identity);
  return issueLineWithdrawalConfirmation(input.actor.id, input.actor.farmId);
}
