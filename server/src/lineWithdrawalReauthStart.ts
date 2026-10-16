import { createLineLoginChallenge, makeLineAuthorizationUrl, type LineLoginConfig } from './lineLoginOAuth';
import type { LineOAuthPurpose } from './lineOAuthPurpose';

/** Prepare a purpose-bound withdrawal authorization request without side effects.
 * The caller MUST persist state, nonce, browser binding and purpose together
 * before redirecting, and later verify the ID token and current session.
 * Do not expose this helper as an endpoint before a durable atomic store exists.
 */
export function prepareLineWithdrawalReauth(
  config: LineLoginConfig,
  currentUser: { id: string; farmId: string; active: boolean } | null,
): { authorizationUrl: string; challenge: { state: string; nonce: string }; purpose: LineOAuthPurpose } {
  if (!currentUser || currentUser.active !== true ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(currentUser.id) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(currentUser.farmId)) {
    throw new Error('LINE_WITHDRAWAL_CURRENT_SESSION_REQUIRED');
  }
  const challenge = createLineLoginChallenge();
  const purpose: LineOAuthPurpose = {
    purpose: 'withdrawal-reauth',
    userId: currentUser.id,
    farmId: currentUser.farmId,
  };
  return { authorizationUrl: makeLineAuthorizationUrl(config, challenge), challenge, purpose };
}
