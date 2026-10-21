import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openFarmProDatabase } from '../storage/db';
import { saveRecord, getAllRecords } from '../storage/repository';
import { saveManualSettlement } from './manualSettlementSave';
import type { ExpenseRecord } from './expensesApi';

const input = {
  confirmed: true,
  saleId: 'sale-test',
  settlementNumber: 'receipt-001',
  grossYen: 712800,
  expectedNetYen: 663597,
  adjustmentYen: 0,
  deductions: [
    { label: 'ワクチン', amountYen: 3640, existingExpenseId: 'expense-vaccine' },
    { label: 'その他控除', amountYen: 45563 },
  ],
  expensesToCreate: [{
    deductionIndex: 1,
    paymentDate: '2026-04-21',
    category: '手数料',
    description: 'その他控除',
    vendor: 'JA',
    amount: '45563',
    paymentMethod: 'JA精算',
    target: '5953',
    memo: 'テスト',
  }],
};

beforeEach(async () => {
  const db = await openFarmProDatabase();
  const tx = db.transaction(['sales', 'expenses', 'metadata'], 'readwrite');
  for (const name of ['sales', 'expenses', 'metadata'] as const) tx.objectStore(name).clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
  await saveRecord('sales', { id: 'sale-test', salePrice: '712800', status: '販売済み' });
  await saveRecord('expenses', { id: 'expense-vaccine', amount: '3640', description: 'ワクチン' });
});

describe('manual settlement atomic save', () => {
  it('preserves existing expense, creates one expense and rejects retry', async () => {
    await saveManualSettlement(input);
    const after = await getAllRecords<ExpenseRecord>('expenses');
    expect(after).toHaveLength(2);
    expect(after.find((e) => e.id === 'expense-vaccine')?.amount).toBe('3640');
    await expect(saveManualSettlement(input)).rejects.toThrow();
    expect(await getAllRecords('expenses')).toHaveLength(2);
  });


  it('rejects a second settlement for the same sale even with another statement number', async () => {
    await saveManualSettlement(input);
    await expect(saveManualSettlement({ ...input, settlementNumber: 'receipt-002' })).rejects.toThrow();
    expect(await getAllRecords('expenses')).toHaveLength(2);
  });

  it('does not partially save when linked expense has changed', async () => {
    await saveRecord('expenses', { id: 'expense-vaccine', amount: '9999' });
    await expect(saveManualSettlement(input)).rejects.toThrow();
    expect(await getAllRecords('expenses')).toHaveLength(1);
  });

  it('rejects unconfirmed saves', async () => {
    await expect(saveManualSettlement({ ...input, confirmed: false })).rejects.toThrow();
    expect(await getAllRecords('expenses')).toHaveLength(1);
  });
});
