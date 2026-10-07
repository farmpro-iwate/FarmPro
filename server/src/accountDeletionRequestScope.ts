import { accountDataRoot, validAccountIdentifier } from './accountDeletionGuard';

// A short-lived operation lease, not a billing/retirement state. Never hold the
// global JSON lock during Stripe I/O. Other users and read-only status remain free.
const busy = new Set<string>();
export async function withDeletionRequestScope<T>(userId: string, action: () => Promise<T>): Promise<T> {
  if (!validAccountIdentifier(userId)) throw new Error('ACCOUNT_CONFIRMATION_REQUIRED');
  const key = `${accountDataRoot()}:${userId}`;
  if (busy.has(key)) throw new Error('CHECKOUT_STOP_BUSY');
  busy.add(key);
  try { return await action(); }
  finally { busy.delete(key); }
}
