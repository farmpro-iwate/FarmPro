import { getSupplySyncIdentity } from './supplyInventorySyncState';

const pending = new Map<string, Promise<void>>();

/** Serialize inventory sync with an explicit restore; do not nest this lock. */
export async function withSupplyInventorySyncLock<T>(action: () => Promise<T>): Promise<T> {
  const identity = getSupplySyncIdentity();
  if (!identity) return action();
  const key = `farmpro:supply-inventory:${identity.farmId}:${identity.ownerId}`;
  const run = () => {
    const current = getSupplySyncIdentity();
    if (current?.farmId !== identity.farmId || current.ownerId !== identity.ownerId) {
      throw new Error('待機中に農場または端末の同期情報が変わったため、処理を中止しました。');
    }
    return action();
  };
  if (navigator.locks?.request) {
    return navigator.locks.request(key, run);
  }
  // Browsers without Web Locks still serialize calls within this app instance.
  const previous = pending.get(key) ?? Promise.resolve();
  const work = previous.then(run);
  const settled = work.then(() => undefined, () => undefined);
  pending.set(key, settled);
  try { return await work; }
  finally { if (pending.get(key) === settled) pending.delete(key); }
}
