import { AsyncLocalStorage } from 'node:async_hooks';
import { runtimeRoot } from './accountLifecycle';
type FarmLease = { active: boolean; pending: Set<Promise<unknown>> };
const held = new AsyncLocalStorage<Map<string, FarmLease>>();
const queues = new Map<string, Promise<void>>();
// Final withdrawal waits for requests already writing this farm. Other farms
// keep running. The same request can acquire its own farm again without waiting.
export async function withFarmRequest<T>(farmId: string, action: () => Promise<T>): Promise<T> {
  const key = `${runtimeRoot()}\0${farmId}`;
  const inherited = held.getStore()?.get(key);
  if (inherited?.active) {
    // A disconnected HTTP response can finish before its async mutation.
    // Keep the lease until every nested mutation settles, and do not treat
    // callbacks inheriting an already-released lease as reentrant.
    const pending = Promise.resolve().then(action);
    inherited.pending.add(pending);
    try { return await pending; }
    finally { inherited.pending.delete(pending); }
  }
  const prior = queues.get(key) || Promise.resolve(); let release!: () => void;
  const turn = new Promise<void>(resolve => { release = resolve; });
  const tail = prior.then(() => turn); queues.set(key, tail); await prior;
  const lease: FarmLease = { active: true, pending: new Set() };
  try { return await held.run(new Map([...(held.getStore() || []), [key, lease]]), action); }
  finally {
    while (lease.pending.size) await Promise.allSettled([...lease.pending]);
    lease.active = false;
    release();
    if (queues.get(key) === tail) queues.delete(key);
  }
}
