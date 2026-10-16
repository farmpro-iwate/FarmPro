/**
 * Backwards-compatible authentication classification.
 * Read-only: this module neither migrates users.json nor writes accounts.
 * Legacy email accounts retain their original stored shape.
 */
export type LegacyEmailCredentials = Readonly<{
  email: string;
  passwordSalt: string;
  passwordHash: string;
}>;

export type LineOnlyCredentials = Readonly<{
  loginMethod: 'line';
  email?: never;
  passwordSalt?: never;
  passwordHash?: never;
}>;

export type AccountLoginKind =
  | { kind: 'email'; credentials: LegacyEmailCredentials }
  | { kind: 'line'; credentials: LineOnlyCredentials };

export function classifyAccountLogin(value: unknown): AccountLoginKind {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ACCOUNT_LOGIN_INVALID');
  }
  const record = value as Record<string, unknown>;
  if (record.loginMethod === 'line') {
    if ('email' in record || 'passwordSalt' in record || 'passwordHash' in record) {
      throw new Error('LINE_ACCOUNT_MUST_NOT_HAVE_PASSWORD');
    }
    return { kind: 'line', credentials: { loginMethod: 'line' } };
  }
  if (record.loginMethod !== undefined && record.loginMethod !== 'email') {
    throw new Error('ACCOUNT_LOGIN_METHOD_INVALID');
  }
  const email = record.email;
  const passwordSalt = record.passwordSalt;
  const passwordHash = record.passwordHash;
  if (typeof email !== 'string' || !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email) ||
      typeof passwordSalt !== 'string' || !passwordSalt ||
      typeof passwordHash !== 'string' || !passwordHash) {
    throw new Error('EMAIL_ACCOUNT_CREDENTIALS_INVALID');
  }
  return { kind: 'email', credentials: { email, passwordSalt, passwordHash } };
}
