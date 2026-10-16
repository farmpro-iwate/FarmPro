import { selectWithdrawalReauthMethod } from './withdrawalReauthMethod';

/**
 * Validate the route's authentication choice against stored account credentials.
 * Not wired to a destructive route. A LINE-only withdrawal must never be
 * authorized by an email/password-shaped client payload.
 */
export function assertWithdrawalRequestMethod(account: unknown, request: unknown): 'password' | 'line' {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('WITHDRAWAL_METHOD_INVALID');
  }
  const input = request as Record<string, unknown>;
  const method = selectWithdrawalReauthMethod(account);
  if (method.kind === 'password') {
    if (typeof input.email !== 'string' || typeof input.password !== 'string' ||
        'lineProof' in input) throw new Error('WITHDRAWAL_PASSWORD_CONFIRMATION_REQUIRED');
    return 'password';
  }
  if (typeof input.lineProof !== 'string' || !/^[a-f0-9]{64}$/.test(input.lineProof) ||
      'email' in input || 'password' in input) {
    throw new Error('WITHDRAWAL_LINE_REAUTH_REQUIRED');
  }
  // A correctly shaped proof is not evidence of reauthentication. The
  // actual transaction must consume it under the same durable account lock.
  return 'line';
}
