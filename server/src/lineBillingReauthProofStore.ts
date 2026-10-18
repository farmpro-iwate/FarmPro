import crypto from 'node:crypto';
import { atomicWrite, lifecycleLock, strictRead } from './accountLifecycle';
import { assertRecentBillingReauth, type BillingReauthProof } from './lineBillingReauthProof';

// Storage-only: issuer must be invoked solely after fresh verified LINE OAuth.
// Neither function is reachable from HTTP routes in this change.
const FILE = 'line-billing-reauth-proofs.json';
type Actor = { userId: string; farmId: string; lineSubject: string };
type Record = { digest: string; proof: BillingReauthProof };
type Store = { version: 1; entries: Record[] };
const hash = (secret: string) => crypto.createHash('sha256').update(secret).digest('hex');
function parse(raw: unknown): Store {
  if (raw === undefined) return { version: 1, entries: [] };
  const value = raw as Store;
  if (!value || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 1000) throw new Error('BILLING_PROOF_STORE_INVALID');
  const hashes = new Set<string>();
  for (const row of value.entries) {
    if (!row || typeof row.digest !== 'string' || !/^[a-f0-9]{64}$/.test(row.digest) ||
      hashes.has(row.digest) || !row.proof || row.proof.purpose !== 'billing-email-reauth' ||
      !Number.isSafeInteger(row.proof.expiresAt) || !Number.isSafeInteger(row.proof.verifiedAt) ||
      typeof row.proof.userId !== 'string' || typeof row.proof.farmId !== 'string' ||
      typeof row.proof.lineSubject !== 'string' || row.proof.consumed !== false) throw new Error('BILLING_PROOF_STORE_INVALID');
    hashes.add(row.digest);
  }
  return value;
}
export async function issueVerifiedBillingReauthProof(actor: Actor, now = Date.now()) {
  const proof: BillingReauthProof = {
    purpose: 'billing-email-reauth', ...actor, verifiedAt: now, expiresAt: now + 5 * 60_000, consumed: false,
  };
  assertRecentBillingReauth(proof, actor, now);
  return lifecycleLock(async root => {
    const store = parse(await strictRead(root, FILE, true));
    const entries = store.entries.filter(row => row.proof.expiresAt > now);
    if (entries.length >= 1000) throw new Error('BILLING_PROOF_STORE_FULL');
    const secret = crypto.randomBytes(32).toString('hex');
    await atomicWrite(root, FILE, { version: 1, entries: [...entries, { digest: hash(secret), proof }] });
    return secret;
  });
}
export async function consumeVerifiedBillingReauthProof(secret: string, actor: Actor, now = Date.now()) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('BILLING_PROOF_INVALID');
  return lifecycleLock(async root => {
    const store = parse(await strictRead(root, FILE, true));
    const digest = hash(secret);
    const found = store.entries.find(row => row.digest === digest);
    if (!found) throw new Error('BILLING_PROOF_MISSING');
    // Check before mutation: wrong-account callers cannot burn a valid proof.
    assertRecentBillingReauth(found.proof, actor, now);
    await atomicWrite(root, FILE, { version: 1, entries: store.entries.filter(row => row.digest !== digest && row.proof.expiresAt > now) });
    return { userId: found.proof.userId, farmId: found.proof.farmId, lineSubject: found.proof.lineSubject };
  });
}
