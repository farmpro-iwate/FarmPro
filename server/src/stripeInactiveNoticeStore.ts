import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { accountDataRoot, atomicAccountJsonWrite, withAccountDataLock } from './accountDeletionGuard';

export type StripeInactiveReason = 'deleted' | 'canceled' | 'incomplete_expired' | 'unpaid';
type StripeInactiveNotice = {
  version: 1;
  subscriptionId: string;
  reason: StripeInactiveReason;
  eventId: string;
  recordedAt: string;
};
const REASONS: StripeInactiveReason[] = ['deleted', 'canceled', 'incomplete_expired', 'unpaid'];
const MAX_BYTES = 4096;

function validId(value: unknown): value is string {
  // Old fixture/ledger identifiers also contain underscores and hyphens. IDs
  // are always hashed before use as paths; no caller controls a filename.
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,255}$/.test(value);
}
function targetPath(subscriptionId: string) {
  if (!validId(subscriptionId)) throw new Error('STRIPE_INACTIVE_NOTICE_INVALID');
  const key = crypto.createHash('sha256').update(subscriptionId).digest('hex');
  return path.join(accountDataRoot(), 'stripe-inactive-notices', `${key}.json`);
}
async function checkDirectory(directory: string) {
  try {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('STRIPE_INACTIVE_NOTICE_INVALID');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function readStripeInactiveNotice(subscriptionId: string): Promise<StripeInactiveNotice | null> {
  const file = targetPath(subscriptionId);
  await checkDirectory(path.dirname(file));
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error('STRIPE_INACTIVE_NOTICE_INVALID');
    const raw = await fs.readFile(file, 'utf-8');
    if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('STRIPE_INACTIVE_NOTICE_INVALID');
    const value = JSON.parse(raw);
    if (value?.version !== 1 || value.subscriptionId !== subscriptionId || !REASONS.includes(value.reason) ||
        !validId(value.eventId) || typeof value.recordedAt !== 'string' ||
        !Number.isFinite(Date.parse(value.recordedAt)) || new Date(value.recordedAt).toISOString() !== value.recordedAt) {
      throw new Error('STRIPE_INACTIVE_NOTICE_INVALID');
    }
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('STRIPE_INACTIVE_NOTICE_INVALID');
  }
}

// Records a fact from an already signature-verified webhook; no Stripe API call
// and no cancellation, refund, user association or farm-data mutation occurs.
// `unpaid` is NOT a canceled contract. This only prevents old Checkout events
// from granting access; recovery needs a separate current-status reconciliation.
export function rememberStripeInactiveNotice(subscriptionId: string, reason: StripeInactiveReason, eventId: string) {
  return withAccountDataLock(async () => {
    if (!validId(eventId) || !REASONS.includes(reason)) throw new Error('STRIPE_INACTIVE_NOTICE_INVALID');
    const existing = await readStripeInactiveNotice(subscriptionId);
    if (existing) return existing;
    const file = targetPath(subscriptionId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await checkDirectory(path.dirname(file));
    const notice: StripeInactiveNotice = {
      version: 1, subscriptionId, reason, eventId, recordedAt: new Date().toISOString(),
    };
    // This durable fact must precede both plan changes and event acknowledgement.
    // It is not removed when the bounded 500-event deduplication history rolls over.
    await atomicAccountJsonWrite(file, notice);
    return notice;
  });
}
