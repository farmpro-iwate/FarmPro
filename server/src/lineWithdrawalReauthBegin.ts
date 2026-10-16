import { issueDurableLineChallenge } from './lineDurableChallenges';
import { saveLineOAuthPurpose } from './lineOAuthPurposeStore';
import { makeLineAuthorizationUrl, type LineLoginConfig } from './lineLoginOAuth';

/** Start a withdrawal-only OAuth challenge on the server.
 * The callback must verify browser-bound state/nonce, purpose, subject and
 * fresh session before issuing a withdrawal proof. This is NOT a public route.
 *
 * Important: challenge and purpose are stored separately. If the second write
 * fails the first is an orphan challenge, never a valid withdrawal proof.
 * The callback must fail closed when either part is missing.
 */
export async function beginLineWithdrawalReauth(
  config: LineLoginConfig,
  browserSecret: string,
  user: { id: string; farmId: string; active: boolean } | null,
): Promise<string> {
  if (!user || !user.active ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(user.id) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(user.farmId)) {
    throw new Error('LINE_WITHDRAWAL_CURRENT_SESSION_REQUIRED');
  }
  const challenge = await issueDurableLineChallenge(browserSecret);
  await saveLineOAuthPurpose(challenge.state, {
    purpose: 'withdrawal-reauth', userId: user.id, farmId: user.farmId,
  });
  return makeLineAuthorizationUrl(config, challenge);
}
