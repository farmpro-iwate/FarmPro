import { lifecycleLock, safeId, strictRead, withdrawalCompletions } from './accountLifecycle';
import { normalizeLineSubject } from './lineIdentityBinding';

/**
 * Server-only identity lookup for a native LINE account. AuthUser intentionally
 * excludes the private LINE subject; never put it into a token or response.
 */
export async function verifyNativeLineWithdrawalAccount(
  session: { id: string; farmId: string } | null,
  verifiedSubject: string,
): Promise<{ id: string; farmId: string; loginMethod: 'line'; lineSubject: string }> {
  if (!session || !safeId(session.id) || !safeId(session.farmId)) throw new Error('LINE_WITHDRAWAL_CURRENT_SESSION_REQUIRED');
  const subject = normalizeLineSubject(verifiedSubject);
  return lifecycleLock(async root => {
    const users = await strictRead(root, 'users.json');
    if (!Array.isArray(users)) throw new Error('LINE_WITHDRAWAL_STORAGE_UNAVAILABLE');
    const matches = users.filter(row => row && row.id === session.id && row.farmId === session.farmId && row.active === true && row.loginMethod === 'line');
    if (matches.length !== 1 || typeof matches[0].lineSubject !== 'string' || matches[0].lineSubject !== subject ||
        users.some(row => row && row.id !== session.id && row.lineSubject === subject) ||
        (await withdrawalCompletions(root)).some(row => row.userId === session.id || row.farmId === session.farmId)) {
      throw new Error('LINE_WITHDRAWAL_IDENTITY_MISMATCH');
    }
    return { id: session.id, farmId: session.farmId, loginMethod: 'line' as const, lineSubject: subject };
  });
}
