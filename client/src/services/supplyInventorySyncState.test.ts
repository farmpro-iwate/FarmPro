import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import type { SupplyMovement } from './supplyInventoryApi';
import {
  SUPPLY_SYNC_STATE_ID, applySupplyChanges, getSupplySyncIdentity,
  mergeSupplyChanges, recordSupplyInventoryChange, sameSupplyRecord,
  sameSupplyRows, validateSupplyRows,
  type SupplyInventoryChange, type SupplyInventorySyncState,
} from './supplyInventorySyncState';

const account = vi.hoisted(() => ({ plan: 'standard', farmId: 'farm-test' }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => account.plan }));
vi.mock('./authClient', () => ({ getStoredAuthUser: () => account.farmId ? { farmId: account.farmId } : null }));

function movement(id: string, changes: Partial<SupplyMovement> = {}): SupplyMovement {
  return {
    id, kind: '受精卵', action: '購入', date: '2026-11-01', itemName: '試験受精卵',
    lotNumber: 'ET-TEST', quantity: 2, unit: '個', expiryDate: '', supplier: '試験仕入先',
    storageLocation: '試験タンク', donorCow: '', sire: '', grade: '', cowEarTag: '',
    unitPrice: 100, amount: 200, paymentMethod: '現金', note: '', expenseRecorded: false,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    ...changes,
  };
}

function change(before: SupplyMovement | null, after: SupplyMovement | null): SupplyInventoryChange {
  return { operationId: crypto.randomUUID(), before, after };
}

function state(baseline: SupplyMovement[], pending: SupplyInventoryChange[] = [], revision: number | null = 35): SupplyInventorySyncState {
  return {
    id: SUPPLY_SYNC_STATE_ID, version: 1, farmId: 'farm-test', ownerId: 'device-test',
    epoch: 'epoch-test', revision, baseline, pending,
  };
}

beforeEach(() => {
  localStorage.clear();
  account.plan = 'standard'; account.farmId = 'farm-test';
});
afterEach(() => vi.restoreAllMocks());

describe('inventory change comparison and merge', () => {
  it('ignores row/object ordering while retaining unknown fields and timestamp changes', () => {
    const a = { ...movement('a'), extra: { later: [1, 2], first: 'kept' } };
    const b = movement('b');
    expect(sameSupplyRows([a, b], [b, { ...a, extra: { first: 'kept', later: [1, 2] } } as SupplyMovement])).toBe(true);
    expect(sameSupplyRecord(a, { ...a, updatedAt: '2026-11-01T01:00:00.000Z' })).toBe(false);
    expect(sameSupplyRecord(a, { ...a, extra: { first: 'kept', later: [2, 1] } } as SupplyMovement)).toBe(false);
    expect(sameSupplyRecord(a, { ...a, extra: undefined } as SupplyMovement)).toBe(false);
  });

  it('rebases independent changes without replacing unrelated remote content', () => {
    const a = movement('a'); const b = movement('b', { lotNumber: 'OTHER' });
    const editedA = { ...a, note: 'PCの変更' };
    const editedB = { ...b, note: 'スマホの変更', unknownField: { retained: true } };
    const pending = [change(a, editedA)];
    const remote = [a, editedB];
    const before = structuredClone(remote);
    const result = mergeSupplyChanges(state([a, b], pending), [editedA, b], remote);
    expect(sameSupplyRows(result, [editedA, editedB])).toBe(true);
    expect(remote).toEqual(before);
  });

  it('accepts the known intermediate after-state after a successful PUT with a lost response', () => {
    const a = movement('a'); const b = { ...a, note: 'first' }; const c = { ...a, note: 'second' };
    const pending = [change(a, b), change(b, c)];
    expect(mergeSupplyChanges(state([a], pending), [c], [b])).toEqual([c]);
    expect(mergeSupplyChanges(state([a], pending), [c], [c])).toEqual([c]);
  });

  it('keeps a same-record conflict unresolved instead of selecting one side', () => {
    const a = movement('a'); const local = { ...a, note: 'local' }; const remote = { ...a, note: 'remote' };
    expect(() => mergeSupplyChanges(state([a], [change(a, local)]), [local], [remote])).toThrow('別の端末');
  });

  it('does not upload or overwrite an untracked local record', () => {
    const a = movement('a'); const untracked = movement('extra');
    expect(() => mergeSupplyChanges(state([a]), [a, untracked], [a])).toThrow('送信待ちに含まれない');
  });

  it('rejects a broken pending chain even when its final after matches local', () => {
    const a = movement('a'); const b = { ...a, note: 'after' };
    expect(() => mergeSupplyChanges(state([a], [change({ ...a, note: 'unseen' }, b)]), [b], [a])).toThrow('連続');
  });

  it('accepts only exact known queue prefixes for a null-revision initial state', () => {
    const a = movement('a'); const b = { ...a, note: 'first' }; const c = movement('c', { lotNumber: 'C' });
    const pending = [change(a, b), change(null, c)];
    const initial = state([a], pending, null);
    for (const remote of [[a], [b], [b, c]]) {
      expect(sameSupplyRows(mergeSupplyChanges(initial, [b, c], remote), [b, c])).toBe(true);
    }
    expect(() => mergeSupplyChanges(initial, [b, c], [a, c])).toThrow('初回');
    expect(() => mergeSupplyChanges(initial, [b, c], [a, movement('other')])).toThrow('初回');
  });

  it('handles acknowledged deletes and repeated local create/edit/delete without resurrection', () => {
    const a = movement('a');
    const deleted = state([a], [change(a, null)]);
    expect(mergeSupplyChanges(deleted, [], [a])).toEqual([]);
    expect(mergeSupplyChanges(deleted, [], [])).toEqual([]);
    const b = { ...a, note: 'edited' };
    const sequence = [change(null, a), change(a, b), change(b, null)];
    expect(applySupplyChanges([], sequence)).toEqual([]);
    expect(mergeSupplyChanges(state([], sequence, null), [], [b])).toEqual([]);
  });

  it('receives an independent remote deletion only when local still matches its baseline', () => {
    const a = movement('a');
    expect(mergeSupplyChanges(state([a]), [a], [])).toEqual([]);
    const edited = { ...a, note: 'pending local change' };
    expect(() => mergeSupplyChanges(state([a], [change(a, edited)]), [edited], [])).toThrow('別の端末');
  });

  it('rejects concurrent use that is individually valid but exceeds one remaining embryo', () => {
    const purchase = movement('purchase', { quantity: 1 });
    const usageA = movement('usage-a', { action: '使用', quantity: 1, unitPrice: 0, amount: 0 });
    const usageB = { ...usageA, id: 'usage-b' };
    expect(() => mergeSupplyChanges(state([purchase], [change(null, usageA)]),
      [purchase, usageA], [purchase, usageB])).toThrow('マイナス');
  });

  it('rejects the same purchase invoice line registered on both devices with different IDs', () => {
    const purchase = movement('a', { purchaseReference: 'INV-1' });
    const remote = movement('b', { purchaseReference: ' inv-1 ', supplier: ' 試験仕入先 ' });
    expect(() => mergeSupplyChanges(state([], [change(null, purchase)]), [purchase], [remote])).toThrow('購入伝票');
  });
});

describe('complete inventory validation', () => {
  it.each([
    { quantity: 0 }, { quantity: -1 }, { quantity: Number.NaN }, { quantity: Infinity },
    { quantity: 0.5 }, { unit: '本' }, { amount: -1 }, { unitPrice: Infinity },
    { kind: 'unknown' }, { action: 'unknown' }, { id: '' }, { lotNumber: '' },
  ])('rejects invalid inventory content %j', invalid => {
    expect(() => validateSupplyRows([movement('a', invalid as Partial<SupplyMovement>)])).toThrow();
  });

  it('accepts fractional medicine quantities but rejects duplicate IDs and negative balances', () => {
    validateSupplyRows([movement('medicine', { kind: '医薬品', quantity: 0.5, unit: 'mL' })]);
    expect(() => validateSupplyRows([movement('same'), movement('same')])).toThrow('IDが重複');
    expect(() => validateSupplyRows([movement('usage', { action: '使用' })])).toThrow('マイナス');
  });
});

describe('durable staging in the formal local save transaction', () => {
  let database: IDBDatabase;
  beforeEach(async () => {
    database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = new IDBFactory().open('supply-sync-state-test', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('supplyInventory', { keyPath: 'id' });
        request.result.createObjectStore('metadata', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
  afterEach(() => database.close());

  async function read<T>(store: string, id: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const request = database.transaction(store).objectStore(store).get(id);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }
  async function transact(work: (tx: IDBTransaction) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['supplyInventory', 'metadata'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('保存を取り消しました。'));
      work(tx);
    });
  }

  it('uses one farm-scoped browser identity without requiring a token', () => {
    const first = getSupplySyncIdentity();
    expect(first).toMatchObject({ farmId: 'farm-test' });
    expect(first?.ownerId).toBeTruthy();
    expect(getSupplySyncIdentity()).toEqual(first);
    account.farmId = 'farm-other';
    expect(getSupplySyncIdentity()?.ownerId).not.toBe(first?.ownerId);
    account.farmId = 'farm-test';
    expect(getSupplySyncIdentity()).toEqual(first);
    account.plan = 'free';
    expect(getSupplySyncIdentity()).toBeNull();
    account.plan = 'standard'; account.farmId = '';
    expect(getSupplySyncIdentity()).toBeNull();
  });

  it('commits the local row and its queue together, then appends edits without coalescing', async () => {
    const a = movement('a'); const b = { ...a, note: 'second' };
    await transact(tx => {
      tx.objectStore('supplyInventory').put(a);
      recordSupplyInventoryChange(tx, [], null, a);
    });
    await transact(tx => {
      tx.objectStore('supplyInventory').put(b);
      recordSupplyInventoryChange(tx, [a], a, b);
    });
    const stored = await read<SupplyInventorySyncState>('metadata', SUPPLY_SYNC_STATE_ID);
    expect(stored).toMatchObject({ revision: null, baseline: [], pending: [
      { before: null, after: a }, { before: a, after: b },
    ] });
    expect(new Set(stored!.pending.map(item => item.operationId)).size).toBe(2);
    expect(await read('supplyInventory', 'a')).toEqual(b);
  });

  it('retains multiple changes queued within the same transaction', async () => {
    const a = movement('a'); const b = movement('b');
    await transact(tx => {
      tx.objectStore('supplyInventory').put(a);
      recordSupplyInventoryChange(tx, [], null, a);
      tx.objectStore('supplyInventory').put(b);
      recordSupplyInventoryChange(tx, [a], null, b);
    });
    const stored = await read<SupplyInventorySyncState>('metadata', SUPPLY_SYNC_STATE_ID);
    expect(stored?.pending.map(item => item.after?.id)).toEqual(['a', 'b']);
    expect(stored?.baseline).toEqual([]);
  });

  it('rolls back the inventory write if persisting the outbox fails', async () => {
    const a = movement('a');
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === 'metadata') throw new DOMException('Simulated queue failure', 'DataCloneError');
      return originalPut.call(this, value, key);
    });
    await expect(transact(tx => {
      tx.objectStore('supplyInventory').put(a);
      recordSupplyInventoryChange(tx, [], null, a);
    })).rejects.toThrow();
    expect(await read('supplyInventory', 'a')).toBeUndefined();
    expect(await read('metadata', SUPPLY_SYNC_STATE_ID)).toBeUndefined();
  });

  it('rolls back a staged queue when another formal save operation aborts', async () => {
    const a = movement('a');
    await expect(transact(tx => {
      tx.objectStore('supplyInventory').put(a);
      recordSupplyInventoryChange(tx, [], null, a);
      const check = tx.objectStore('supplyInventory').get('a');
      check.onsuccess = () => tx.abort();
    })).rejects.toThrow();
    expect(await read('supplyInventory', 'a')).toBeUndefined();
    expect(await read('metadata', SUPPLY_SYNC_STATE_ID)).toBeUndefined();
  });

  it('replaces copied foreign outbox with a fresh initial baseline without replaying it', async () => {
    const old = movement('old'); const local = { ...old, note: 'unknown restored change' };
    const newRow = movement('new', { lotNumber: 'NEW' });
    const foreign = state([old], [change(old, local)]);
    await transact(tx => {
      tx.objectStore('metadata').put(foreign);
      tx.objectStore('supplyInventory').put(local);
    });
    await transact(tx => {
      tx.objectStore('supplyInventory').put(newRow);
      recordSupplyInventoryChange(tx, [local], null, newRow);
    });
    const stored = (await read<SupplyInventorySyncState>('metadata', SUPPLY_SYNC_STATE_ID))!;
    expect(stored.ownerId).toBe(getSupplySyncIdentity()?.ownerId);
    expect(stored.epoch).not.toBe(foreign.epoch);
    expect(stored.baseline).toEqual([local]);
    expect(stored.pending).toHaveLength(1);
    expect(stored.revision).toBeNull();
    expect(() => mergeSupplyChanges(stored, [local, newRow], [old])).toThrow('初回');
  });
});
