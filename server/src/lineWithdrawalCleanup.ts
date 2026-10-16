import { atomicWrite, lifecycleLock, strictRead, withdrawalCompletions } from './accountLifecycle';
import { normalizeLineSubject } from './lineIdentityBinding';

/**
 * Cleanup for completed withdrawals only. This never revives a deleted user,
 * and intentionally runs after the durable withdrawal tombstone is committed.
 * It is a retryable, stand-alone cleanup step; call it from the lifecycle
 * coordinator only after auditing the whole withdrawal path.
 */
export async function cleanupWithdrawnLineIdentity(userId: string): Promise<boolean> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(userId)) throw new Error('LINE_CLEANUP_USER_INVALID');
  return lifecycleLock(async root => {
    const withdrawn = await withdrawalCompletions(root);
    if (!withdrawn.some(row => row.userId === userId && row.status === 'completed')) {
      throw new Error('LINE_CLEANUP_WITHDRAWAL_NOT_COMPLETED');
    }
    const file = 'line-identity-bindings.json';
    const raw = await strictRead(root, file, true);
    if (raw === undefined) return false;
    if (!raw || raw.version !== 1 || !Array.isArray(raw.bindings)) throw new Error('LINE_CLEANUP_STORE_INVALID');
    const subjects = new Set<string>();
    const owners = new Set<string>();
    for (const entry of raw.bindings) {
      if (!entry || entry.provider !== 'line' || typeof entry.subject !== 'string' ||
          typeof entry.userId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(entry.userId) ||
          subjects.has(entry.subject) || owners.has(entry.userId)) throw new Error('LINE_CLEANUP_STORE_INVALID');
      normalizeLineSubject(entry.subject);
      subjects.add(entry.subject);
      owners.add(entry.userId);
    }
    const remaining = raw.bindings.filter((entry: {userId: string}) => entry.userId !== userId);
    if (remaining.length === raw.bindings.length) return false;
    await atomicWrite(root, file, {version:1,bindings:remaining});
    return true;
  });
}
