import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openFarmProDatabase } from '../storage/db';
import { saveRecord, getAllRecords } from '../storage/repository';
import { getSavedSettlement, saveManualSettlement } from './manualSettlementSave';
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
  it('reads back the committed settlement without changing original sale or vaccine expense', async () => {
    expect(await getSavedSettlement('sale-test')).toBeNull();
    const beforeSale = await getAllRecords('sales');
    const beforeVaccine = (await getAllRecords<ExpenseRecord>('expenses')).find((e) => e.id === 'expense-vaccine');
    await saveManualSettlement(input);
    const saved = await getSavedSettlement('sale-test');
    expect(saved).toMatchObject({
      saleId: 'sale-test',
      settlementNumber: 'receipt-001',
      grossYen: 712800,
      expectedNetYen: 663597,
      calculatedNetYen: 663597,
      expenseIdsLinked: ['expense-vaccine'],
    });
    expect(saved?.expenseIdsCreated).toHaveLength(1);
    expect(saved?.deductions).toEqual(input.deductions);
    const afterSale = await getAllRecords<{ id: string; salePrice: string; status: string }>('sales');
    expect(afterSale).toEqual(beforeSale);
    const original = (await getAllRecords<ExpenseRecord>('expenses')).find((e) => e.id === 'expense-vaccine');
    expect(original).toEqual(beforeVaccine);
  });

  it('preserves existing expense, creates one expense and rejects retry', async () => {
    await saveManualSettlement(input);
    const after = await getAllRecords<ExpenseRecord>('expenses');
    expect(after).toHaveLength(2);
    expect(after.find((e) => e.id === 'expense-vaccine')?.amount).toBe('3640');
    const markers = await getAllRecords<{ id: string; grossYen: number; expectedNetYen: number; deductions: { label: string; amountYen: number }[] }>('metadata');
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ grossYen: 712800, expectedNetYen: 663597 });
    expect(markers[0].deductions).toEqual(input.deductions);
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


  it('rejects a linked expense belonging to another cattle number', async () => {
    await saveRecord('expenses', {
      id: 'expense-vaccine', amount: '3640', description: 'ワクチン',
      animalEarTag: '9999', target: '9999',
    });
    await expect(saveManualSettlement(input)).rejects.toThrow('既存経費の対象番号が販売牛と一致しません');
    expect(await getAllRecords('expenses')).toHaveLength(1);
    expect(await getAllRecords('metadata')).toHaveLength(0);
  });

  it('rejects unconfirmed saves', async () => {
    await expect(saveManualSettlement({ ...input, confirmed: false })).rejects.toThrow();
    expect(await getAllRecords('expenses')).toHaveLength(1);
  });
  it('does not create expenses if a linked existing expense was deleted', async () => {
    const db = await openFarmProDatabase();
    const tx = db.transaction('expenses', 'readwrite');
    tx.objectStore('expenses').delete('expense-vaccine');
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    await expect(saveManualSettlement(input)).rejects.toThrow('既存経費が変更されています');
    expect(await getAllRecords('expenses')).toHaveLength(0);
    expect(await getAllRecords('metadata')).toHaveLength(0);
  });

  it('rejects selecting one existing expense twice without creating expenses', async () => {
    await expect(saveManualSettlement({
      ...input,
      expectedNetYen: 659957,
      deductions: [
        ...input.deductions,
        { label: 'ワクチン重複', amountYen: 3640, existingExpenseId: 'expense-vaccine' },
      ],
    })).rejects.toThrow('既存経費の重複選択はできません');
    expect(await getAllRecords('expenses')).toHaveLength(1);
    expect(await getAllRecords('metadata')).toHaveLength(0);
  });


});
