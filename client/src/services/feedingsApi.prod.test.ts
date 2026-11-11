import 'fake-indexeddb/auto';

Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true });

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords, saveRecord } from '../storage/repository';
import {
  createFeeding,
  deleteFeeding,
  FeedingInput,
  updateFeeding,
} from './feedingsApi';

vi.mock('../plans/current-plan', () => ({
  getCurrentFarmProPlanId: () => 'free',
}));

vi.mock('../plans/policy', () => ({
  getFarmProPlan: () => ({ multiDeviceSync: false }),
}));

vi.mock('./authClient', () => ({
  getAuthToken: () => '',
  getStoredAuthUser: () => ({ id: 'test-user', farmId: 'test-farm' }),
}));

const example: FeedingInput = {
  feedingDate: '2026-11-11',
  target: '1111',
  feedName: 'ラクセルチャージ',
  amount: '1',
  unit: '個',
  unitPrice: '',
  totalPrice: '',
  purpose: 'その他',
  memo: '',
};

describe('feeding and feed inventory link on production branch', () => {
  beforeEach(async () => {
    await clearStore('feedings');
    await clearStore('feedInventory');
  });

  it('creates exactly one outbound inventory record with a feeding', async () => {
    const feeding = await createFeeding(example);
    const inventory = await getAllRecords('feedInventory');

    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({
      transactionDate: '2026-11-11',
      feedName: 'ラクセルチャージ',
      transactionType: '出庫',
      quantity: '1',
      unit: '個',
    });
    expect(String(inventory[0].memo)).toContain(`[feeding:${feeding.id}]`);
  });

  it('updates the linked outbound record without duplication', async () => {
    const feeding = await createFeeding(example);

    await updateFeeding(feeding.id, {
      ...example,
      feedingDate: '2026-11-12',
      amount: '2',
    });

    const inventory = await getAllRecords('feedInventory');
    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({
      transactionDate: '2026-11-12',
      transactionType: '出庫',
      quantity: '2',
    });
  });

  it('deletes only the outbound record linked to the feeding', async () => {
    const feeding = await createFeeding(example);

    await saveRecord('feedInventory', {
      id: 'existing-inbound',
      transactionDate: '2026-11-08',
      feedName: '2番草ロール',
      transactionType: '入庫',
      quantity: '20',
      unit: 'ロール',
      unitPrice: '7000',
      totalPrice: '140000',
      supplier: 'モルト',
      memo: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await deleteFeeding(feeding.id);

    const inventory = await getAllRecords('feedInventory');
    expect(inventory).toHaveLength(1);
    expect(inventory[0].id).toBe('existing-inbound');
  });
});
