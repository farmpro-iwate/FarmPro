/** Pure account-withdrawal authentication policy. Never permits LINE-only
 * withdrawal with a password, nor considers a LINE login itself recent
 * reauthentication. This is not yet wired to the withdrawal route.
 */
export type WithdrawalAuthPolicy =
  | { kind: 'password'; requiresPassword: true; requiresEmailConfirmation: true }
  | { kind: 'line'; requiresPassword: false; requiresEmailConfirmation: false; requiresFreshLineProof: true };

export function getWithdrawalAuthPolicy(user: unknown): WithdrawalAuthPolicy {
  if (!user || typeof user !== 'object' || Array.isArray(user)) {
    throw new Error('WITHDRAWAL_ACCOUNT_INVALID');
  }
  const record = user as Record<string, unknown>;
  if (record.loginMethod === 'line') {
    if ('email' in record || 'passwordSalt' in record || 'passwordHash' in record) {
      throw new Error('WITHDRAWAL_LINE_CREDENTIALS_INVALID');
    }
    return { kind: 'line', requiresPassword: false, requiresEmailConfirmation: false, requiresFreshLineProof: true };
  }
  if (record.loginMethod !== undefined && record.loginMethod !== 'email') {
    throw new Error('WITHDRAWAL_LOGIN_METHOD_INVALID');
  }
  if (typeof record.email !== 'string' || !record.email.includes('@') ||
      typeof record.passwordSalt !== 'string' || !record.passwordSalt ||
      typeof record.passwordHash !== 'string' || !record.passwordHash) {
    throw new Error('WITHDRAWAL_EMAIL_CREDENTIALS_INVALID');
  }
  return { kind: 'password', requiresPassword: true, requiresEmailConfirmation: true };
}
