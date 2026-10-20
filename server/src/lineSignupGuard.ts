import { findLineIdentityBinding, normalizeLineSubject, type LineIdentityBinding } from './lineIdentityBinding';

/**
 * Read-only preflight for first-time LINE signup.
 * Must be executed again inside the eventual atomic signup transaction.
 * This function deliberately never creates users, farms or provider bindings.
 */
export function assertLineSignupNotAlreadyLinked(
  bindings: readonly LineIdentityBinding[],
  verifiedSubject: string,
): void {
  const subject = normalizeLineSubject(verifiedSubject);
  if (findLineIdentityBinding(bindings, subject)) {
    throw new Error('LINE_SIGNUP_ALREADY_REGISTERED');
  }
}
