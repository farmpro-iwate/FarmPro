import crypto from 'node:crypto';
import { atomicWrite, lifecycleLock, strictRead } from './accountLifecycle';

// Internal storage only. There is intentionally no HTTP route and no deletion integration.
const FILE = 'line-withdrawal-confirmations.json';
const TTL_MS = 2 * 60_000;
type Confirmation = { digest: string; userId: string; farmId: string; expiresAt: number };
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

function parse(raw: unknown): Confirmation[] {
  if (raw === undefined) return [];
  const v = raw as { version?: unknown; confirmations?: unknown };
  if (!v || v.version !== 1 || !Array.isArray(v.confirmations) || v.confirmations.length > 1000) throw new Error('LINE_WITHDRAWAL_CONFIRMATION_STORE_INVALID');
  const seen = new Set<string>();
  for (const row of v.confirmations as Confirmation[]) {
    if (!row || !/^[a-f0-9]{64}$/.test(row.digest) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(row.userId) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(row.farmId) ||
      !Number.isFinite(row.expiresAt) || seen.has(row.digest)) throw new Error('LINE_WITHDRAWAL_CONFIRMATION_STORE_INVALID');
    seen.add(row.digest);
  }
  return v.confirmations as Confirmation[];
}

/** Issue only after fresh LINE OAuth and assertNativeLineWithdrawalIdentity succeed. */
export async function issueLineWithdrawalConfirmation(userId: string, farmId: string): Promise<string> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(userId) || !/^[a-zA-Z0-9_-]{1,128}$/.test(farmId)) throw new Error('LINE_WITHDRAWAL_CONFIRMATION_INVALID');
  return lifecycleLock(async root => {
    const now = Date.now();
    const current = parse(await strictRead(root, FILE, true)).filter(x => x.expiresAt > now && x.userId !== userId);
    if (current.length >= 1000) throw new Error('LINE_WITHDRAWAL_CONFIRMATION_STORE_FULL');
    const token = crypto.randomBytes(32).toString('hex');
    current.push({ digest: hash(token), userId, farmId, expiresAt: now + TTL_MS });
    await atomicWrite(root, FILE, { version: 1, confirmations: current });
    return token;
  });
}

/** Consumes at most once. Never directly authorizes or performs deletion. */
export async function consumeLineWithdrawalConfirmation(token: string, userId: string, farmId: string): Promise<void> {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('LINE_WITHDRAWAL_CONFIRMATION_INVALID');
  return lifecycleLock(async root => {
    const current = parse(await strictRead(root, FILE, true));
    const now = Date.now();
    const matching = current.find(x => x.digest === hash(token));
    // Any attempt with this bearer proof consumes it, including a wrong-account attempt.
    await atomicWrite(root, FILE, { version: 1, confirmations: current.filter(x => x.expiresAt > now && x.digest !== hash(token)) });
    if (!matching || matching.expiresAt <= now || matching.userId !== userId || matching.farmId !== farmId) throw new Error('LINE_WITHDRAWAL_CONFIRMATION_INVALID');
  });
}
