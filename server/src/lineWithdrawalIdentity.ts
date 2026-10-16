import { findLineIdentityBinding, normalizeLineSubject, type LineIdentityBinding } from './lineIdentityBinding';

/**
 * Pure authorization check for a purpose-bound LINE withdrawal OAuth callback.
 * The subject must come from a server-verified LINE ID token, never browser input.
 * This cannot itself issue a withdrawal proof or authorize deletion.
 */
export function assertLineWithdrawalIdentityMatches(
  verifiedSubject: string,
  expectedUserId: string,
  bindings: readonly LineIdentityBinding[],
): void {
  const subject = normalizeLineSubject(verifiedSubject);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(expectedUserId)) {
    throw new Error('LINE_WITHDRAWAL_IDENTITY_MISMATCH');
  }
  const binding = findLineIdentityBinding(bindings, subject);
  if (!binding || binding.userId !== expectedUserId ||
      bindings.filter(row => row.provider === 'line' && row.userId === expectedUserId).length !== 1) {
    throw new Error('LINE_WITHDRAWAL_IDENTITY_MISMATCH');
  }
}
