import 'fake-indexeddb/auto';

Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true });

import { beforeEach, describe, expect, it } from 'vitest';
import { clearStore, getAllRecords } from '../storage/repository';
import {
  createFeeding,
  deleteFeeding,
  FeedingInput,
  updateFeeding,
} from './feedingsApi';

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

describe('feeding and feed inventory link', () => {
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

  it('updates the linked outbound record instead of adding another one', async () => {
    const feeding = await createFeeding(example);

    await updateFeeding(feeding.id, {
      ...example,
      amount: '2',
      feedingDate: '2026-11-12',
    });

    const inventory = await getAllRecords('feedInventory');

    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({
      transactionDate: '2026-11-12',
      quantity: '2',
      transactionType: '出庫',
    });
  });

  it('deletes only the outbound record linked to the feeding', async () => {
    const feeding = await createFeeding(example);

    const unrelated = {
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
    };

    const { saveRecord } = await import('../storage/repository');
    await saveRecord('feedInventory', unrelated);

    await deleteFeeding(feeding.id);

    const inventory = await getAllRecords('feedInventory');
    expect(inventory).toHaveLength(1);
    expect(inventory[0].id).toBe('existing-inbound');
  });
});
