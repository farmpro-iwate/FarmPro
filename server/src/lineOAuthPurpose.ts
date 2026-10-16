/**
 * Bind a LINE OAuth challenge to one explicit purpose.
 * In a deployed callback this context must be durably stored with state and
 * consumed atomically, never inferred from request parameters or the presence
 * of a browser cookie. Pure checks only; no routes enabled here.
 */
export type LineOAuthPurpose =
  | { purpose: 'login' }
  | { purpose: 'account-link'; userId: string; farmId: string }
  | { purpose: 'withdrawal-reauth'; userId: string; farmId: string };

export function assertLineOAuthPurpose(
  stored: LineOAuthPurpose | null,
  expected: LineOAuthPurpose,
): void {
  if (!stored || stored.purpose !== expected.purpose) {
    throw new Error('LINE_OAUTH_PURPOSE_MISMATCH');
  }
  if (expected.purpose !== 'login') {
    if (!('userId' in stored) || !('farmId' in stored) ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(stored.userId) ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(stored.farmId) ||
        stored.userId !== expected.userId || stored.farmId !== expected.farmId) {
      throw new Error('LINE_OAUTH_PURPOSE_MISMATCH');
    }
  }
}
