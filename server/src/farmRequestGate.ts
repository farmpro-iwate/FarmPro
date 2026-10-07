import { AsyncLocalStorage } from 'node:async_hooks';
import { runtimeRoot } from './accountLifecycle';
const held = new AsyncLocalStorage<Set<string>>();
const queues = new Map<string, Promise<void>>();
// Final withdrawal waits for requests already writing this farm. Other farms
// keep running. The same request can acquire its own farm again without waiting.
export async function withFarmRequest<T>(farmId: string, action: () => Promise<T>): Promise<T> {
  const key = `${runtimeRoot()}\0${farmId}`;
  if (held.getStore()?.has(key)) return action();
  const prior = queues.get(key) || Promise.resolve(); let release!: () => void;
  const turn = new Promise<void>(resolve => { release = resolve; });
  const tail = prior.then(() => turn); queues.set(key, tail); await prior;
  try { return await held.run(new Set([...(held.getStore() || []), key]), action); }
  finally { release(); if (queues.get(key) === tail) queues.delete(key); }
}
