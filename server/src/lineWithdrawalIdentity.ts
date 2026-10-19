import type { VerifiedLineIdentity } from './lineLoginOAuth';
import { getNativeLineSubjectForSession } from './lineIdentityStore';

/**
 * Fail-closed identity check for future LINE-only withdrawal reauthentication.
 * This module never creates a deletion proof, changes account state, or runs a withdrawal.
 * Callers MUST first complete a fresh browser-bound LINE OAuth challenge and verify the ID token.
 */
export async function assertNativeLineWithdrawalIdentity(
  actor: { id: string; farmId: string },
  target: { id: string; farmId: string },
  verified: VerifiedLineIdentity,
): Promise<void> {
  if (!actor?.id || !actor.farmId || actor.id !== target?.id || actor.farmId !== target?.farmId) {
    throw new Error('LINE_WITHDRAWAL_ACTOR_MISMATCH');
  }
  if (!verified || typeof verified.subject !== 'string' || !verified.subject.trim()) {
    throw new Error('LINE_WITHDRAWAL_IDENTITY_INVALID');
  }
  const storedSubject = await getNativeLineSubjectForSession(actor.id, actor.farmId);
  if (!storedSubject || storedSubject !== verified.subject) {
    throw new Error('LINE_WITHDRAWAL_SUBJECT_MISMATCH');
  }
}
