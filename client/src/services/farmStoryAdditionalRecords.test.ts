import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { FARM_PRO_STORE_NAMES } from '../storage/db';
import * as repository from '../storage/repository';
import type { StoredRecord, StoreName } from '../storage/types';
import type { FarmStoryCategoryId } from './farmStoryDisplaySettings';
import { FarmStoryAdditionalRecordsContextChangedError, loadFarmStoryAdditionalRecords } from './farmStoryAdditionalRecords';

const owner = vi.hoisted(() => ({ farmId: 'fixture-story-farm', userId: 'fixture-story-user' }));
vi.mock('./authClient', () => ({
  getStoredAuthUser: () => ({ farmId: owner.farmId, id: owner.userId, plan: 'standard' }),
}));

const originalRead = repository.getAllRecords;
const today = '2026-11-02';
const savedAt = '2026-10-01T01:02:03.000Z';
const entries: Array<{ category: FarmStoryCategoryId; store: StoreName; dateField: string; record: StoredRecord }> = [
  { category: 'medicineInventory', store: 'supplyInventory', dateField: 'date',
    record: { id: 'fixture medicine/1', kind: '医薬品', action: '購入', date: '2026-11-01', itemName: '検証薬',
      quantity: 0.1256789, unit: '分包', amount: 0, lotNumber: '', cowEarTag: '', note: 'fixture medicine' } },
  { category: 'embryoInventory', store: 'supplyInventory', dateField: 'date',
    record: { id: 'fixture embryo/2', kind: '受精卵', action: '使用', date: '2026-11-01', itemName: '検証受精卵',
      quantity: 2, unit: '個', amount: 1234.5, lotNumber: 'fixture-lot', cowEarTag: 'FIXTURE-COW', note: '' } },
  { category: 'feedInventory', store: 'feedInventory', dateField: 'transactionDate',
    record: { id: 'fixture feed/3', transactionDate: '2026-10-31', feedName: '検証飼料', transactionType: '出庫',
      quantity: '0.2500001', unit: '袋', totalWeightKg: '12.5', totalPrice: '1234.56789', supplier: '仮仕入先', memo: '',
      // Calling the existing getter would normalize this legacy costing and write it.
      costing: { targetType: 'calfGroup', allocationMethod: 'manual', costUnit: 'kg', averageUnitCost: 11,
        usedQuantity: 2, usedCost: 22, allocations: [{ animalType: 'calf', animalId: 'fixture-calf',
          earTag: 'FIXTURE-CALF', animalName: '検証子牛', weight: 1, allocatedQuantity: 2, allocatedCost: 22 }],
        calculatedAt: savedAt } } },
  { category: 'feeding', store: 'feedings', dateField: 'feedingDate',
    record: { id: 'fixture feeding/4', feedingDate: today, feedName: '検証給与飼料', amount: '0', unit: 'kg',
      totalPrice: '', target: '検証群', purpose: '維持', memo: '' } },
  { category: 'expense', store: 'expenses', dateField: 'paymentDate',
    record: { id: 'fixture expense/5', paymentDate: '2026-10-30', category: '修繕費', description: '検証修理',
      amount: '0', vendor: '仮業者', target: '検証子牛', animalType: 'calf', animalId: '42',
      animalEarTag: 'FIXTURE-CALF', animalName: '検証子牛', memo: '' } },
  { category: 'blv', store: 'blvTests', dateField: 'testDate',
    record: { id: 7, testDate: today, result: '陰性', nextTestDate: '2099-12-31',
      cowEarTag: 'FIXTURE-COW', cowName: '検証牛', isolationMemo: '', note: '' } },
  { category: 'feedingAction', store: 'feedingAlertActions', dateField: 'actionDate',
    record: { id: 'fixture action/8', actionDate: '2026-11-01', calfId: '42', calfName: '検証子牛', ageDays: '0',
      alertType: '不足気味', actionType: 'スターターを調整', status: '対応中', nextCheckDate: '2099-12-31', memo: '' } },
  { category: 'fattening', store: 'fatteningTransitions', dateField: 'startDate',
    record: { id: 'fixture fattening/9', startDate: '2026-10-31', targetNumber: 'FIXTURE-COW', targetName: '検証牛',
      startWeight: '0', targetWeight: '500', targetShippingDate: '2099-12-31', transitionReason: '繁殖終了',
      status: '出荷済み', housingLocation: '検証牛舎', memo: '' } },
];
const categories = entries.map(entry => entry.category);
const sentinel = { id: 'fixture-story-untouched', note: 'preserve raw data', createdAt: savedAt, updatedAt: savedAt };
let beforeBytes: Map<StoreName, string>;
let reads: MockInstance<typeof repository.getAllRecords>;
let transactions: MockInstance<IDBDatabase['transaction']>;

async function rememberBytes() {
  beforeBytes = new Map(await Promise.all(FARM_PRO_STORE_NAMES.map(async store => [store, JSON.stringify(await originalRead(store))] as const)));
  reads?.mockClear();
  transactions?.mockClear();
}

async function put(store: StoreName, row: StoredRecord) {
  await repository.saveRecordPreservingTimestamps(store, { ...row, createdAt: savedAt, updatedAt: savedAt,
    fixtureUnknownBusiness: { amount: '001.200', references: [null, 'retained'] } });
}

beforeEach(async () => {
  owner.farmId = 'fixture-story-farm'; owner.userId = 'fixture-story-user';
  localStorage.clear(); sessionStorage.clear();
  for (const store of FARM_PRO_STORE_NAMES) {
    await repository.clearStore(store);
    if (!entries.some(entry => entry.store === store)) await put(store, sentinel);
  }
  for (const entry of entries) await put(entry.store, entry.record);
  reads = vi.spyOn(repository, 'getAllRecords');
  transactions = vi.spyOn(IDBDatabase.prototype, 'transaction');
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Story loading must not make HTTP requests'); }));
  await rememberBytes();
});

afterEach(async () => {
  expect(fetch).not.toHaveBeenCalled();
  expect(transactions.mock.calls.every(call => !call[1] || call[1] === 'readonly')).toBe(true);
  owner.farmId = 'fixture-story-farm'; owner.userId = 'fixture-story-user';
  for (const store of FARM_PRO_STORE_NAMES) expect(JSON.stringify(await originalRead(store)), store).toBe(beforeBytes.get(store));
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('read-only additional farm story records', () => {
  it('shows selected farm work and individual records once without linking by a foreign local ID', async () => {
    const work = { id: 'fixture farm/work', activityType: 'farm', recordDate: today, title: '牛舎の清掃', note: '敷料を交換' };
    const note = { id: 'fixture animal/record', activityType: 'animal', recordDate: today, title: '食欲の観察', note: '完食',
      animalKind: 'calf', animalId: '42', animalSyncId: 'manual-calf:fixture', animalIdentificationNumber: '',
      animalEarTag: '0012', animalName: '検証子牛', animalBirthday: '2026-10-01' };
    await put('activityRecords', work);
    await put('activityRecords', note);
    await put('activityRecords', { ...work, id: 'future-work', recordDate: '2099-01-01' });
    await put('activityRecords', { ...work, id: 'deleted-work', deletedAt: savedAt });
    await put('activityRecords', { ...note, id: 'delete-pending-note', activityRecordSyncDeletePending: true });
    await rememberBytes();
    const result = await loadFarmStoryAdditionalRecords(['farmWork', 'animalRecord'], today);
    expect(result.failedCategories).toEqual([]);
    expect(result.items).toHaveLength(2);
    expect(reads.mock.calls.map(call => call[0])).toEqual(['activityRecords']);
    expect(result.items.find(item => item.categoryId === 'farmWork')).toMatchObject({ title: '牛舎の清掃', detail: '敷料を交換',
      sourcePath: '/activities/fixture%20farm%2Fwork/edit' });
    const individual = result.items.find(item => item.categoryId === 'animalRecord')!;
    expect(individual).toMatchObject({ title: '検証子牛：食欲の観察', earTag: '0012', detail: '完食',
      sourcePath: '/activities/fixture%20animal%2Frecord/edit', activityAnimal: { animalKind: 'calf', animalSyncId: 'manual-calf:fixture' } });
    expect(individual.animalId).toBeUndefined();
    expect(individual.animalKind).toBe('calf');
    expect((await loadFarmStoryAdditionalRecords(['farmWork'], today)).items).toHaveLength(1);
  });

  it('formats an unnamed calf temporary number instead of showing its internal identity in the title', async () => {
    await put('activityRecords', { id: 'temporary-calf-note', activityType: 'animal', recordDate: today,
      title: '哺乳の記録', note: '', animalKind: 'calf', animalId: '42', animalSyncId: 'manual-calf:fixture',
      animalEarTag: 'TEMP-fixture-hidden-identity', animalName: '', animalBirthday: '2026-11-01' });
    await rememberBytes();
    const result = await loadFarmStoryAdditionalRecords(['animalRecord'], today);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ title: '仮-1101：哺乳の記録', animalKind: 'calf' });
    expect(result.items[0].title).not.toContain('TEMP-');
    expect(result.items[0].animalId).toBeUndefined();
  });

  it('uses each real business date, quantity unit, precision and registered source route', async () => {
    const { items, failedCategories } = await loadFarmStoryAdditionalRecords(categories, today);
    expect(failedCategories).toEqual([]);
    expect(items).toHaveLength(8);
    expect(reads.mock.calls.map(call => call[0]).sort()).toEqual([...new Set(entries.map(entry => entry.store))].sort());
    for (const entry of entries) {
      expect(items.find(item => item.categoryId === entry.category)).toMatchObject({
        id: `story:${entry.category}:${entry.record.id}`, date: entry.record[entry.dateField],
      });
    }
    const byCategory = Object.fromEntries(items.map(item => [item.categoryId, item]));
    expect(byCategory.medicineInventory).toMatchObject({ category: '医薬品の入出庫', title: '検証薬：購入',
      sourcePath: `/supply-inventory?kind=${encodeURIComponent('医薬品')}` });
    expect(byCategory.medicineInventory.detail).toContain('数量：+0.1256789 分包');
    expect(byCategory.medicineInventory.detail).toContain('金額：0 円');
    expect(byCategory.embryoInventory.detail).toContain('数量：−2 個');
    expect(byCategory.embryoInventory.detail).toContain('金額：1,234.5 円');
    expect(byCategory.embryoInventory.sourcePath).toBe(`/supply-inventory?kind=${encodeURIComponent('受精卵')}`);
    expect(byCategory.feedInventory.detail).toContain('数量：−0.2500001 袋');
    expect(byCategory.feedInventory.detail).toContain('総重量：12.5 kg');
    expect(byCategory.feedInventory.detail).toContain('金額：1,234.56789 円');
    expect(byCategory.feedInventory.sourcePath).toBe('/feed-inventory/fixture%20feed%2F3/edit');
    expect(byCategory.feeding.detail).toContain('給与量：0 kg');
    expect(byCategory.feeding.detail).not.toContain('金額：0');
    expect(byCategory.feeding.sourcePath).toBe('/feedings/fixture%20feeding%2F4/edit');
    expect(byCategory.expense).toMatchObject({ animalKind: 'calf', animalId: '42', animalName: '検証子牛',
      earTag: 'FIXTURE-CALF', sourcePath: '/expenses/fixture%20expense%2F5/edit' });
    expect(byCategory.expense.detail).toContain('金額：0 円');
    expect(byCategory.blv).toMatchObject({ date: today, animalKind: 'cattle', earTag: 'FIXTURE-COW', sourcePath: '/blv/7/edit' });
    expect(byCategory.blv.detail).toContain('結果：陰性');
    expect(byCategory.feedingAction).toMatchObject({ animalKind: 'calf', animalId: '42',
      sourcePath: '/feeding-alert-actions/fixture%20action%2F8/edit' });
    expect(byCategory.feedingAction.detail).toContain('日齢：0 日');
    expect(byCategory.fattening).toMatchObject({ title: '検証牛：肥育移行', date: '2026-10-31',
      sourcePath: '/fattening-transitions/fixture%20fattening%2F9/edit' });
    expect(byCategory.fattening.detail).toContain('開始体重：0 kg');
  });

  it.each([[], ['cattle', 'calf', 'treatment']].map(selected => ({ selected: selected as FarmStoryCategoryId[] })))(
    'does not read a ledger when all additional categories are off ($selected)', async ({ selected }) => {
      expect(await loadFarmStoryAdditionalRecords(selected, today)).toEqual({ items: [], failedCategories: [] });
      expect(reads).not.toHaveBeenCalled();
      expect(transactions).not.toHaveBeenCalled();
    },
  );

  it.each(entries)('reads only the selected $category source', async entry => {
    const { items, failedCategories } = await loadFarmStoryAdditionalRecords([entry.category, entry.category], today);
    expect(failedCategories).toEqual([]);
    expect(items.map(item => item.categoryId)).toEqual([entry.category]);
    expect(reads.mock.calls).toEqual([[entry.store]]);
  });

  it('shares a single stock read while keeping medicine and embryo categories separate', async () => {
    const { items } = await loadFarmStoryAdditionalRecords(['medicineInventory', 'embryoInventory'], today);
    expect(items).toHaveLength(2);
    expect(new Set(items.map(item => item.categoryId))).toEqual(new Set(['medicineInventory', 'embryoInventory']));
    expect(reads.mock.calls).toEqual([['supplyInventory']]);
  });

  it('excludes tombstones, cancelled records, missing/invalid/future business dates without timestamp fallbacks', async () => {
    for (const entry of entries) {
      const variants = [
        { deletedAt: '2026-11-01T00:00:00.000Z' }, { status: '取消' }, { status: '中止' },
        { [entry.dateField]: '' }, { [entry.dateField]: '2026-02-30' }, { [entry.dateField]: '2026-11-03' },
      ];
      for (const [index, changes] of variants.entries()) {
        await put(entry.store, { ...entry.record, id: `${entry.record.id}-excluded-${index}`, ...changes });
      }
    }
    await put('blvTests', { ...entries[5].record, id: 70, result: '未検査' });
    await put('blvTests', { ...entries[5].record, id: 71, blvSyncDeletePending: true });
    await put('feedingAlertActions', { ...entries[6].record, id: 'fixture-unperformed', status: '未対応' });
    await put('feedingAlertActions', { ...entries[6].record, id: 'fixture-action-deleting', feedingAlertActionSyncDeletePending: true });
    await put('fatteningTransitions', { ...entries[7].record, id: 'fixture-fattening-deleting', fatteningTransitionSyncDeletePending: true });
    await rememberBytes();

    const result = await loadFarmStoryAdditionalRecords(categories, today);

    expect(result.failedCategories).toEqual([]);
    expect(result.items.map(item => item.id).sort()).toEqual(entries.map(entry => `story:${entry.category}:${entry.record.id}`).sort());
  });

  it('preserves signed stock adjustments, exact decimal amounts and same-day ISO dates', async () => {
    await put('feedInventory', { ...entries[2].record, id: 'fixture-negative-adjustment', transactionType: '調整',
      quantity: '-0.000001', unit: 'kg', transactionDate: `${today}T23:30:00+09:00`, totalPrice: '0.0012300' });
    await rememberBytes();

    const { items } = await loadFarmStoryAdditionalRecords(['feedInventory'], today);
    const adjustment = items.find(item => item.id.endsWith('fixture-negative-adjustment'))!;

    expect(adjustment.date).toBe(today);
    expect(adjustment.detail).toContain('数量：-0.000001 kg');
    expect(adjustment.detail).toContain('金額：0.0012300 円');
  });

  it('recognizes correctly grouped legacy money without rounding or accepting invalid commas', async () => {
    const amounts = ['1,000', '1,234,567.8900', '-1,000.20', '1,2', '12,34', '1234,567'];
    for (const [index, value] of amounts.entries()) {
      await put('expenses', { ...entries[4].record, id: `fixture-grouped-amount-${index}`, amount: value });
    }
    await rememberBytes();

    const { items } = await loadFarmStoryAdditionalRecords(['expense'], today);
    const detail = (index: number) => items.find(item => item.id.endsWith(`fixture-grouped-amount-${index}`))!.detail;

    expect(detail(0)).toContain('金額：1,000 円');
    expect(detail(1)).toContain('金額：1,234,567.8900 円');
    expect(detail(2)).toContain('金額：-1,000.20 円');
    for (const index of [3, 4, 5]) expect(detail(index)).not.toContain('金額：');
    expect(items.find(item => item.id === `story:expense:${entries[4].record.id}`)!.detail).toContain('金額：0 円');
  });

  it('reports a failed selected ledger without losing successful categories', async () => {
    reads.mockImplementation(async <T extends StoredRecord>(store: StoreName): Promise<T[]> => {
      if (store === 'expenses') throw new Error('fixture IndexedDB read failure');
      return originalRead<T>(store);
    });

    const result = await loadFarmStoryAdditionalRecords(['expense', 'blv'], today);

    expect(result.failedCategories).toEqual(['expense']);
    expect(result.items.map(item => item.categoryId)).toEqual(['blv']);
  });

  it('reports only enabled stock categories when their shared read fails', async () => {
    reads.mockImplementation(async <T extends StoredRecord>(store: StoreName): Promise<T[]> => {
      if (store === 'supplyInventory') throw new Error('fixture stock read failure');
      return originalRead<T>(store);
    });
    const result = await loadFarmStoryAdditionalRecords(['embryoInventory', 'feeding'], today);
    expect(result.failedCategories).toEqual(['embryoInventory']);
    expect(result.items.map(item => item.categoryId)).toEqual(['feeding']);
    expect(reads.mock.calls).toEqual([['supplyInventory'], ['feedings']]);
  });

  it.each(['farmId', 'userId'] as const)('rejects results when %s changes while the local read is pending', async key => {
    let ready!: () => void;
    const started = new Promise<void>(resolve => { ready = resolve; });
    let release!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; });
    reads.mockImplementation(async <T extends StoredRecord>(store: StoreName): Promise<T[]> => {
      const rows = await originalRead<T>(store);
      ready();
      await paused;
      return rows;
    });
    const pending = loadFarmStoryAdditionalRecords(['expense'], today);
    const rejected = expect(pending).rejects.toBeInstanceOf(FarmStoryAdditionalRecordsContextChangedError);
    await started;
    owner[key] = `different-fixture-${key}`;
    release();
    await rejected;
  });
});
