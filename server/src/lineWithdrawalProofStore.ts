import crypto from 'node:crypto';
import { atomicWrite, lifecycleLock, strictRead } from './accountLifecycle';
import { assertRecentLineWithdrawalProof, type RecentLineWithdrawalProof } from './lineWithdrawalProof';

// Server-only proof storage. NOT connected to a public route.
// The caller must verify LINE OAuth with a purpose-bound state and a current
// FarmPro session before invoking issue. In-process lock: single host only.
const FILE = 'line-withdrawal-proofs.json';
const MAX = 1000;
type Entry = RecentLineWithdrawalProof & { digest: string };
type Store = { version: 1; entries: Entry[] };
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const validId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);

function parse(raw: unknown): Store {
  if (raw === undefined) return { version: 1, entries: [] };
  const store = raw as Store;
  if (!store || store.version !== 1 || !Array.isArray(store.entries) || store.entries.length > MAX) {
    throw new Error('LINE_WITHDRAWAL_PROOF_STORE_INVALID');
  }
  const seen = new Set<string>();
  for (const entry of store.entries) {
    if (!entry || !/^[a-f0-9]{64}$/.test(entry.digest) || seen.has(entry.digest) ||
        !validId(entry.userId) || !validId(entry.farmId) ||
        entry.purpose !== 'account-withdrawal' || typeof entry.consumed !== 'boolean' ||
        !Number.isFinite(entry.verifiedAt) || !Number.isFinite(entry.expiresAt) ||
        entry.expiresAt <= entry.verifiedAt || entry.expiresAt - entry.verifiedAt > 300000) {
      throw new Error('LINE_WITHDRAWAL_PROOF_STORE_INVALID');
    }
    seen.add(entry.digest);
  }
  return store;
}

// Keep this issuance function internal until a purpose-bound LINE OAuth callback
// supplies the verified identity AND checks it against the logged-in account.
// Supplying a user ID from an ordinary authenticated session is insufficient.
export async function issueLineWithdrawalProof(userId: string, farmId: string, verifiedAt = Date.now()) {
  if (!validId(userId) || !validId(farmId) || !Number.isFinite(verifiedAt) ||
      Math.abs(Date.now() - verifiedAt) > 300000) throw new Error('LINE_WITHDRAWAL_REAUTH_REQUIRED');
  return lifecycleLock(async root => {
    const store = parse(await strictRead(root, FILE, true));
    const entries = store.entries.filter(item => item.expiresAt > Date.now() && !item.consumed);
    if (entries.length >= MAX) throw new Error('LINE_WITHDRAWAL_PROOF_CAPACITY');
    const ticket = crypto.randomBytes(32).toString('hex');
    entries.push({ digest: hash(ticket), purpose: 'account-withdrawal', userId, farmId,
      verifiedAt, expiresAt: verifiedAt + 300000, consumed: false });
    await atomicWrite(root, FILE, { version: 1, entries });
    return ticket;
  });
}

/**
 * Caller must already own lifecycleLock(root). This internal operation allows
 * the withdrawal coordinator to consume proof without reacquiring the lock.
 * NEVER call without that lock or expose it to a public route.
 */
export async function consumeLineWithdrawalProofUnderLock(
  root: string, ticket: string, userId: string, farmId: string,
): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(ticket)) throw new Error('LINE_WITHDRAWAL_REAUTH_REQUIRED');
  const store = parse(await strictRead(root, FILE, true));
  const digest = hash(ticket);
  const found = store.entries.find(item => item.digest === digest);
  // Retire the proof regardless of a subject mismatch, so it cannot be replayed.
  await atomicWrite(root, FILE, { version: 1,
    entries: store.entries.filter(item => item.digest !== digest && item.expiresAt > Date.now() && !item.consumed) });
  assertRecentLineWithdrawalProof(found || null, userId, farmId);
}

export async function consumeLineWithdrawalProof(ticket: string, userId: string, farmId: string) {
  await lifecycleLock(root => consumeLineWithdrawalProofUnderLock(root, ticket, userId, farmId));
}
