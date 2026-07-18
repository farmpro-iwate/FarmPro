import { AsyncLocalStorage } from 'node:async_hooks';

type FarmContext = { farmId: string };

const storage = new AsyncLocalStorage<FarmContext>();

export function runWithFarm<T>(farmId: string, callback: () => T) {
  return storage.run({ farmId }, callback);
}

export function currentFarmId() {
  return storage.getStore()?.farmId || '';
}
