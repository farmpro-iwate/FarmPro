import { lifecycleLock, strictRead, atomicWrite, withdrawalCompletions, safeId } from './accountLifecycle';
import { normalizeLineSubject } from './lineIdentityBinding';
import type { LineSignupCandidate } from './lineSignupCandidate';

/**
 * Canonical one-file admission of a LINE-only account.
 * Must be called with the subject obtained from verified server-side LINE OAuth.
 * No HTTP route is exposed. Existing linked identities still use their legacy
 * bindings; this path refuses a subject already present in those bindings.
 *
 * Process-local lifecycleLock is NOT a distributed lock. Do not enable public
 * signup until the deployment uses a single writer or a shared transaction store.
 */
export async function persistCanonicalLineSignup(subjectInput: string, user: LineSignupCandidate): Promise<void> {
  const subject = normalizeLineSubject(subjectInput);
  if (!safeId(user.id) || !safeId(user.farmId) || user.farmId === 'farm-demo' ||
      user.loginMethod !== 'line' || user.role !== 'owner' || user.plan !== 'free' ||
      user.active !== true || !user.farmName?.trim() || !user.name?.trim() ||
      'email' in user || 'passwordSalt' in user || 'passwordHash' in user) {
    throw new Error('LINE_SIGNUP_ACCOUNT_INVALID');
  }
  await lifecycleLock(async root => {
    const users = await strictRead(root, 'users.json', true);
    if (users !== undefined && !Array.isArray(users)) throw new Error('LINE_SIGNUP_USERS_INVALID');
    const existing = (users || []) as Array<Record<string, unknown>>;
    const bindings = await strictRead(root, 'line-identity-bindings.json', true);
    if (bindings !== undefined && (bindings?.version !== 1 || !Array.isArray(bindings.bindings))) {
      throw new Error('LINE_SIGNUP_BINDINGS_INVALID');
    }
    if (existing.some(row => row.id === user.id || row.farmId === user.farmId ||
      row.lineSubject === subject) ||
      (bindings?.bindings || []).some((row: {subject?:string;userId?:string}) =>
        row.subject === subject || row.userId === user.id)) {
      throw new Error('LINE_SIGNUP_ALREADY_EXISTS');
    }
    if ((await withdrawalCompletions(root)).some(row => row.userId === user.id || row.farmId === user.farmId)) {
      throw new Error('LINE_SIGNUP_ID_WITHDRAWN');
    }
    // Subject and account commit together, never create an orphaned LINE binding.
    await atomicWrite(root, 'users.json', [...existing, { ...user, lineSubject: subject }]);
  });
}
