import type { VerifiedLineIdentity } from './lineLoginOAuth';
import { resolveLineLinkedUserId } from './lineIdentityStore';
import { findActiveUserById } from './authStore';
import { issueLineHandoff } from './lineLoginHandoff';

/**
 * Server-only bridge for an identity obtained from verified LINE OAuth.
 * No routes are mounted. A future callback MUST use the LINE token verifier
 * and browser-bound single-use OAuth challenge before invoking this function.
 */
export async function issueVerifiedLineLoginHandoff(identity: VerifiedLineIdentity): Promise<string> {
  if (!identity || typeof identity.subject !== 'string' || !identity.subject.trim()) {
    throw new Error('LINE_IDENTITY_INVALID');
  }
  const userId = await resolveLineLinkedUserId(identity.subject);
  if (!userId) throw new Error('LINE_ACCOUNT_NOT_FOUND');
  const user = await findActiveUserById(userId);
  if (!user || !user.active || !user.farmId) throw new Error('LINE_USER_UNAVAILABLE');
  return issueLineHandoff(user.id);
}
