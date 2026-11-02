import 'fake-indexeddb/auto';
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true });

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords, getRecordById } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import type { Treatment, TreatmentInput } from '../types/treatment';
import type { Breeding, BreedingInput } from '../types/breeding';
import { createSupplyMovement, getSupplyBatches, getSupplyMovements, type SupplyInput } from './supplyInventoryApi';
import { createTreatment, deleteTreatment, getTreatmentList, updateTreatment } from './treatmentApi';
import { createBreeding, deleteBreeding, getBreedingListForHomeSummary, updateBreeding } from './breedingApi';
import { deleteExpense, getExpensesList, updateExpense, type ExpenseRecord } from './expensesApi';
import { hasPendingSupplyLinkedRecord } from './supplyInventoryLinkedSync';

vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => 'standard' }));
vi.mock('./authClient', () => ({
  getStoredAuthUser: () => ({ id: 'fixture-owner', farmId: 'fixture-linked-farm', plan: 'standard' }),
  getAuthToken: () => 'fixture-token',
}));
// Keep the sources offline here to exercise the real durable queue and provider
// integration. Transport and acknowledgement are covered by their service tests.
vi.mock('./supplyInventorySync', () => ({ syncSupplyInventorySafely: vi.fn(async () => false) }));

const medicine: SupplyInput = {
  kind: '医薬品', action: '購入', date: '2026-11-01', itemName: '試験薬',
  lotNumber: 'FIXTURE-01', quantity: 10, unit: '本', expiryDate: '',
  supplier: '試験仕入先', storageLocation: '試験保管場所', donorCow: '', sire: '', grade: '',
  cowEarTag: '', unitPrice: 100, amount: 1000, paymentMethod: '現金', note: '',
};
const embryo: SupplyInput = {
  ...medicine, kind: '受精卵', itemName: '試験受精卵', quantity: 2, unit: '個', amount: 200,
};
const treatment: TreatmentInput = {
  targetNumber: 'FIXTURE-COW', targetName: '試験牛', treatmentDate: '2026-11-01',
  symptom: '試験症状', diagnosis: '', medicine: medicine.itemName, dosage: '2本',
  withdrawalEndDate: '', veterinarian: '', progress: '治療中', note: '',
  medicineSource: 'farm_stock', medicineInventoryQuantity: 2,
};
const transfer = {
  cowEarTag: 'FIXTURE-COW', cowName: '試験牛', heatDate: '2026-10-25',
  breedingMethod: '受精卵移植', breedingStatus: '移植実施', transferDate: '2026-11-01',
  embryoNumber: embryo.lotNumber, embryoSource: 'farm_stock', embryoCost: '',
  transferProcedureCost: '', transferOtherCost: '',
} as BreedingInput;

type Queued = StoredRecord & { store: string; record: StoredRecord; movementIds: string[]; deleted: boolean };
async function queued(store: string): Promise<Queued> {
  const rows = await getAllRecords<Queued>('metadata');
  const row = rows.find(item => item.store === store);
  expect(row).toBeDefined();
  return row!;
}

describe('stock-linked source retry integration', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] }) as Response));
    for (const store of ['supplyInventory', 'expenses', 'treatments', 'breedings', 'metadata'] as const) {
      await clearStore(store);
    }
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('retains treatment dependency and source until a pending deletion is confirmed', async () => {
    await createSupplyMovement(medicine, false);
    const key = getSupplyBatches(await getSupplyMovements(), '医薬品')[0].key;
    await expect(createTreatment({ ...treatment, medicineInventoryBatchKey: key })).rejects.toThrow();
    const saved = (await getAllRecords<Treatment>('treatments'))[0];
    const movementId = saved.medicineInventoryMovementId!;
    expect(saved.cloudSyncPending).toBe(true);
    expect(await hasPendingSupplyLinkedRecord('treatments', `treatment:${saved.id}`)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();

    await expect(updateTreatment(saved.id, { ...treatment, medicineSource: 'veterinarian', note: '在庫使用取消' })).rejects.toThrow();
    await expect(updateTreatment(saved.id, { ...treatment, medicineSource: 'veterinarian', note: '取消後に追記' })).rejects.toThrow();
    expect((await queued('treatments')).record.note).toBe('取消後に追記');
    expect((await queued('treatments')).movementIds).toContain(movementId);
    expect((await getRecordById<Treatment>('treatments', saved.id))?.medicineInventoryMovementId).toBeUndefined();
    expect(getSupplyBatches(await getSupplyMovements(), '医薬品')[0].balance).toBe(10);

    vi.mocked(fetch).mockRejectedValue(new TypeError('fixture offline'));
    await expect(deleteTreatment(saved.id)).rejects.toThrow('fixture offline');
    expect((await queued('treatments')).deleted).toBe(false);
    expect(await getRecordById('treatments', saved.id)).toMatchObject({
      note: '取消後に追記', cloudSyncPending: true, treatmentSyncDeletePending: true,
    });
    expect((await getTreatmentList()).map(row => row.id)).toEqual([saved.id]);
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (options?.method === 'DELETE') return Response.json({ id: `treatment:${saved.id}`,
        cloudUpdatedAt: '2026-11-02T00:00:00.000Z', deletedAt: '2026-11-02T00:00:00.000Z' });
      if (String(url).includes('/record-sync/')) return new Response(null, { status: 404 });
      return Response.json([]);
    });
    await deleteTreatment(saved.id);
    expect((await queued('treatments')).deleted).toBe(true);
    expect(await getTreatmentList()).toEqual([]);
    expect(await getAllRecords('treatments')).toEqual([]);
  });

  it('keeps pending ET edits and unconfirmed deletion visible until conditional deletion succeeds', async () => {
    await createSupplyMovement(embryo, false);
    const key = getSupplyBatches(await getSupplyMovements(), '受精卵')[0].key;
    await expect(createBreeding({ ...transfer, embryoInventoryBatchKey: key })).rejects.toThrow('関連経費は更新していません');
    const saved = (await getAllRecords<Breeding>('breedings'))[0];
    expect(saved.cloudSyncPending).toBe(true);
    expect((await getBreedingListForHomeSummary()).map(row => row.id)).toEqual([saved.id]);

    await expect(updateBreeding(saved.id, { ...transfer, embryoSource: 'external', note: '在庫使用取消' }))
      .rejects.toThrow('関連経費は更新していません');
    await expect(updateBreeding(saved.id, { ...transfer, embryoSource: 'external', note: '取消後に追記' }))
      .rejects.toThrow('関連経費は更新していません');
    expect((await queued('breedings')).record.note).toBe('取消後に追記');
    expect((await queued('breedings')).movementIds).toContain(saved.embryoInventoryMovementId);
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [saved] } as Response);
    const home = await getBreedingListForHomeSummary();
    expect(home).toHaveLength(1);
    expect(home[0].note).toBe('取消後に追記');

    vi.mocked(fetch).mockRejectedValue(new TypeError('fixture offline'));
    await expect(deleteBreeding(saved.id)).rejects.toThrow('fixture offline');
    expect((await queued('breedings')).deleted).toBe(false);
    expect(await getRecordById('breedings', saved.id)).toMatchObject({
      note: '取消後に追記', cloudSyncPending: true, breedingSyncDeletePending: true,
    });
    expect((await getBreedingListForHomeSummary()).map(row => row.id)).toEqual([saved.id]);

    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (options?.method === 'DELETE') return new Response(null, { status: 204 });
      if (String(url).includes('/record-sync/')) return new Response(null, { status: 404 });
      return new Response('[]');
    });
    await deleteBreeding(saved.id);
    expect((await queued('breedings')).deleted).toBe(true);
    expect(await getBreedingListForHomeSummary()).toEqual([]);
    expect(await getAllRecords('breedings')).toEqual([]);
    const deletions = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'DELETE');
    expect(deletions).toHaveLength(1);
    expect(new Headers(deletions[0][1]?.headers).get('If-None-Match')).toBe('*');
  });

  it('updates and deletes an unsent purchase expense with its queue and cannot resurrect it on pull', async () => {
    const movementId = await createSupplyMovement(medicine, true);
    const expense = (await getAllRecords<ExpenseRecord>('expenses'))[0];
    expect((await queued('expenses')).movementIds).toEqual([movementId]);
    expect(fetch).not.toHaveBeenCalled();

    await updateExpense(expense.id, { ...expense, amount: '1100', memo: '支払金額を確認' });
    const pending = await queued('expenses');
    expect(pending.record.amount).toBe('1100');
    expect((await getRecordById<ExpenseRecord>('expenses', expense.id))?.amount).toBe('1100');
    expect(fetch).not.toHaveBeenCalled();

    await deleteExpense(expense.id);
    expect((await queued('expenses')).deleted).toBe(true);
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [{ ...expense, id: expense.syncRecordId, cloudUpdatedAt: '2026-11-02T00:00:00Z' }] } as Response);
    expect(await getExpensesList()).toEqual([]);
    expect(await getAllRecords('expenses')).toEqual([]);
  });
});
