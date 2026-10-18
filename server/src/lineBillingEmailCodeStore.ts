import { atomicWrite, lifecycleLock, strictRead } from './accountLifecycle';
import { checkBillingEmailCode, issueBillingEmailCode, type BillingEmailChallenge } from './lineBillingEmailCode';

// Isolated storage-only module; no API route, email delivery, or account update.
const FILE = 'line-billing-email-challenges.json';
type Identity = { userId: string; farmId: string; lineSubject: string };
type Store = { version: 1; challenges: BillingEmailChallenge[] };
function parse(raw: unknown): Store {
  if (raw === undefined) return { version: 1, challenges: [] };
  if (!raw || typeof raw !== 'object') throw new Error('BILLING_CODE_STORE_INVALID');
  const value = raw as Store;
  if (value.version !== 1 || !Array.isArray(value.challenges) || value.challenges.length > 1000) throw new Error('BILLING_CODE_STORE_INVALID');
  const seen = new Set<string>();
  for (const row of value.challenges) {
    if (!row || typeof row.userId !== 'string' || typeof row.farmId !== 'string' ||
        typeof row.lineSubject !== 'string' || typeof row.email !== 'string' ||
        !/^[a-f0-9]{32}$/.test(row.salt) || !/^[a-f0-9]{64}$/.test(row.codeHash) ||
        !Number.isSafeInteger(row.expiresAt) || !Number.isInteger(row.attempts) ||
        row.attempts < 0 || row.attempts > 5 || seen.has(row.userId)) throw new Error('BILLING_CODE_STORE_INVALID');
    seen.add(row.userId);
  }
  return value;
}
export async function stageLineBillingEmailCode(identity: Identity, email: string, now = Date.now()) {
  return lifecycleLock(async root => {
    const stored = parse(await strictRead(root, FILE, true));
    const issued = issueBillingEmailCode(identity, email, now);
    const remaining = stored.challenges.filter(row => row.userId !== identity.userId && row.expiresAt > now && row.attempts < 5);
    if (remaining.length >= 1000) throw new Error('BILLING_CODE_STORE_FULL');
    await atomicWrite(root, FILE, { version: 1, challenges: [...remaining, issued.challenge] });
    return { code: issued.code, expiresAt: issued.challenge.expiresAt };
  });
}
export async function consumeLineBillingEmailCode(identity: Identity, code: string, now = Date.now()) {
  return lifecycleLock(async root => {
    const stored = parse(await strictRead(root, FILE, true));
    const row = stored.challenges.find(row => row.userId === identity.userId);
    if (!row) throw new Error('BILLING_EMAIL_CODE_EXPIRED');
    const result = checkBillingEmailCode(row, identity, code, now);
    const remaining = stored.challenges.filter(item => item.userId !== identity.userId && item.expiresAt > now && item.attempts < 5);
    // Persist unsuccessful attempts, and atomically remove successful/locked challenges.
    await atomicWrite(root, FILE, { version: 1, challenges: result.accepted || result.locked ? remaining : [...remaining, result.next] });
    return result.accepted ? { verifiedEmail: row.email, userId: row.userId, farmId: row.farmId } : null;
  });
}
// A successful consume is evidence only for the caller. There is deliberately
// no account mutation: a future implementation must revalidate identity,
// freshness and email uniqueness in a single durable commit.
