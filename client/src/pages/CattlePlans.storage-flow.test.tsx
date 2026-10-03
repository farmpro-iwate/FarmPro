import 'fake-indexeddb/auto';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CattleList } from './CattleList';
import { CattleDetail } from './CattleDetail';
import { createBreeding, updateBreeding, deleteBreeding } from '../services/breedingApi';
import { getAllRecords, getRecordById, saveRecord, deleteRecord } from '../storage/repository';
import type { BreedingInput } from '../types/breeding';

// Use real repository, cattle/breeding readers, settings and plan projection.
// Only unrelated costing and external syncing are excluded from this test.
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => 'free' }));
vi.mock('../services/feedInventoryApi', () => ({ getAnimalFeedCostTotal: async () => 0 }));
vi.mock('../services/expensesApi', () => ({
  getAnimalExpenseTotals: async () => ({ medical: 0, breeding: 0, other: 0, nonFeedTotal: 0 }),
  upsertExpenseBySource: async () => undefined,
  deleteExpenseBySource: async () => undefined,
}));
vi.mock('../services/breedingCattleUnallocatedAcquisitionCost', () => ({ getBreedingCattleUnallocatedAcquisitionCost: async () => null }));
vi.mock('../services/cattleFarmExpenseAllocation', () => ({ getCattleFarmExpenseAllocation: async () => 0 }));
vi.mock('../services/allFarmExpenseAllocation', () => ({ getAllFarmExpenseAllocation: async () => 0 }));

const cow = { id: 123, earTag: '0254', name: '保存連動テスト牛', birthday: '2020-01-01', sex: '雌', stage: '繁殖牛' };
const initial: BreedingInput = {
  cowEarTag: cow.earTag, cowName: cow.name, heatDate: '2026-09-17', breedingMethod: '未選択', breedingStatus: '発情確認',
  inseminationDate: '', bullName: '', inseminatorName: '', transferPlannedDate: '', transferDate: '', transferCancelReason: '',
  embryoNumber: '', collectionDate: '', embryoType: '未選択', donorCowName: '', donorCowEarTag: '', embryoSireName: '',
  embryoGrade: '', strawNumber: '', supplierName: '', transferTechnician: '', nextHeatExpectedDate: '',
  pregnancyCheckExpectedDate: '', pregnancyCheckDate: '', pregnancyResult: '未鑑定', recheckExpectedDate: '', expectedCalvingDate: '', note: '',
};
const readStored = async () => Promise.all(['cattle', 'breedings', 'calvings', 'schedules', 'metadata'].map((store) => getAllRecords(store as any)));
const displayed = (root: Element) => Array.from(root.querySelectorAll('[data-plan-kind]')).map((node) => [node.getAttribute('data-plan-kind'), node.getAttribute('data-plan-date')]);

async function comparePersistedPlans(expected: string[][]) {
  const before = JSON.stringify(await readStored());
  const list = render(<MemoryRouter initialEntries={['/cattle']}><Routes><Route path="/cattle" element={<CattleList />} /></Routes></MemoryRouter>);
  await screen.findByText('耳標 0254');
  expect(displayed(list.container.querySelector('tbody tr')!)).toEqual(expected);
  list.unmount();
  const detail = render(<MemoryRouter initialEntries={['/cattle/123']}><Routes><Route path="/cattle/:id" element={<CattleDetail />} /></Routes></MemoryRouter>);
  await screen.findByText('個体カルテ：保存連動テスト牛');
  expect(displayed(screen.getByText('次の予定').parentElement!)).toEqual(expected);
  detail.unmount();
  expect(JSON.stringify(await readStored())).toBe(before);
}

describe('persisted breeding records -> shared cattle plans', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 12));
    window.localStorage.clear();
    window.localStorage.setItem('farmpro.authUser', JSON.stringify({
      id: 'test-user', farmId: 'plan-view-storage-test', farmName: 'Test only', name: 'Test', email: 'test@example.test', role: 'owner', active: true, plan: 'free',
    }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('No network is permitted in this isolated storage test'); }));
    await saveRecord('cattle', cow);
    await saveRecord('calvings', { id: 'calving-1', cowEarTag: cow.earTag, cowName: cow.name, actualCalvingDate: '2026-08-29' });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); window.localStorage.clear(); });

  it('reflects actual save, correction, diagnosis cancellation and deletion after reopening either screen', async () => {
    await comparePersistedPlans([['post-calving-heat', '2026-10-03']]);
    let record = await createBreeding(initial);
    await comparePersistedPlans([['breeding-choice', '']]);

    record = await updateBreeding(record.id, { ...record, breedingMethod: '受精卵移植', breedingStatus: '移植予定', transferPlannedDate: '2026-09-24' });
    await comparePersistedPlans([['transfer', '2026-09-24']]);

    record = await updateBreeding(record.id, {
      ...record, breedingStatus: '移植実施', transferDate: '2026-09-24',
      nextHeatExpectedDate: '2026-10-15', pregnancyCheckExpectedDate: '2026-11-05', expectedCalvingDate: '2027-07-06',
    });
    await comparePersistedPlans([['next-heat', '2026-10-08'], ['pregnancy-check', '2026-10-29']]);
    expect((await getRecordById<any>('breedings', record.id))?.nextHeatExpectedDate).toBe('2026-10-15');

    record = await updateBreeding(record.id, { ...record, heatDate: '2026-09-18' });
    await comparePersistedPlans([['next-heat', '2026-10-09'], ['pregnancy-check', '2026-10-30']]);

    record = await updateBreeding(record.id, { ...record, pregnancyResult: '受胎', pregnancyCheckDate: '2026-10-01' });
    await comparePersistedPlans([['calving', '2027-06-30']]);
    record = await updateBreeding(record.id, { ...record, pregnancyResult: '再鑑定予定', recheckExpectedDate: '2026-10-15' });
    await comparePersistedPlans([['recheck', '2026-10-15']]);
    record = await updateBreeding(record.id, { ...record, pregnancyResult: '未鑑定', pregnancyCheckDate: '', recheckExpectedDate: '' });
    await comparePersistedPlans([['next-heat', '2026-10-09'], ['pregnancy-check', '2026-10-30']]);

    await deleteBreeding(record.id);
    expect(await getRecordById('breedings', record.id)).toBeUndefined();
    await comparePersistedPlans([['post-calving-heat', '2026-10-03']]);
    await deleteRecord('calvings', 'calving-1');
    await comparePersistedPlans([]);
    expect(await getAllRecords('cattle')).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  }, 30000);
});
