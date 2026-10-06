import { accountDataRoot, assertFarmNotRetired, withAccountDataLock } from './accountDeletionGuard';

const active = new Map<string, number>();
function key(farmId: string) { return `${accountDataRoot()}:${farmId}`; }

export function beginAccountRequest(farmId: string) {
  return withAccountDataLock(async () => {
    await assertFarmNotRetired(farmId);
    const id = key(farmId);
    active.set(id, (active.get(id) || 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (active.get(id) || 1) - 1;
      if (remaining) active.set(id, remaining); else active.delete(id);
    };
  });
}

// Call while holding withAccountDataLock, before persisting retirement.
export function assertAccountIdle(farmId: string) {
  if (active.get(key(farmId))) throw new Error('ACCOUNT_BUSY');
}
