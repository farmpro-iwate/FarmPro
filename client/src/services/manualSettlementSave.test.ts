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
  const tx = db.transaction(['sales', 'expenses', 'metadata', 'calves', 'cattle'], 'readwrite');
  for (const name of ['sales', 'expenses', 'metadata', 'calves', 'cattle'] as const) tx.objectStore(name).clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
  await saveRecord('sales', { id: 'sale-test', salePrice: '712800', status: '販売済み', targetNumber: '5953' });
  await saveRecord('expenses', { id: 'expense-vaccine', amount: '3640', description: 'ワクチン', target: '5953' });

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

  it('saves the eight-line settlement using one existing vaccine and seven new deductions', async () => {
    const extraDeductions = [
      ['市場手数料', 16394], ['家畜共済', 500], ['市場上場料', 1100],
      ['JA販売手数料', 14969], ['施設使用料', 8800],
      ['その他控除', 3000], ['繁殖協会費', 1000],
    ] as const;
    const deductions = [
      { label: '五種混合・ヘモフィルスワクチン', amountYen: 3640, existingExpenseId: 'expense-vaccine' },
      ...extraDeductions.map(([label, amountYen]) => ({ label, amountYen })),
    ];
    const original = (await getAllRecords<ExpenseRecord>('expenses')).find((expense) => expense.id === 'expense-vaccine');
    await saveManualSettlement({
      ...input,
      settlementNumber: '26025106',
      expectedNetYen: 663597,
      adjustmentYen: 200,
      deductions,
      expensesToCreate: extraDeductions.map(([label, amount], index) => ({
        deductionIndex: index + 1, paymentDate: '2026-04-21',
        category: index === 0 || index === 2 || index === 3 ? '手数料' : 'その他',
        description: label, vendor: 'テストJA', amount: String(amount),
        paymentMethod: 'JA精算', target: '5953', memo: 'TEST5953 検証',
      })),
    });
    const allExpenses = await getAllRecords<ExpenseRecord>('expenses');
    expect(allExpenses).toHaveLength(8);
    expect(allExpenses.find((expense) => expense.id === 'expense-vaccine')).toEqual(original);
    expect(allExpenses.filter((expense) => expense.amount === '3640')).toHaveLength(1);
    for (const expense of allExpenses.filter((expense) => expense.id !== 'expense-vaccine')) {
      expect((expense as ExpenseRecord & { syncRecordId?: string }).syncRecordId).toBe(`expense:${expense.id}`);
    }
    const settlement = await getSavedSettlement('sale-test');
    expect(settlement?.calculatedNetYen).toBe(663597);
    expect(settlement?.expenseIdsLinked).toEqual(['expense-vaccine']);
    expect(settlement?.expenseIdsCreated).toHaveLength(7);
    const idsBeforeRetry = allExpenses.map((expense) => expense.id).sort();
    await expect(saveManualSettlement({ ...input, settlementNumber: '26025106', expectedNetYen: 663597, adjustmentYen: 200, deductions, expensesToCreate: extraDeductions.map(([label, amount], index) => ({ deductionIndex: index + 1, paymentDate: '2026-04-21', category: '手数料', description: label, vendor: 'テストJA', amount: String(amount), paymentMethod: 'JA精算', target: '5953', memo: '再実行検証' })) })).rejects.toThrow('この販売記録の精算は登録済みです');
    expect((await getAllRecords<ExpenseRecord>('expenses')).map((expense) => expense.id).sort()).toEqual(idsBeforeRetry);
    expect(new Set(settlement?.expenseIdsCreated).size).toBe(7);
    for (const expense of allExpenses.filter((item) => item.id !== 'expense-vaccine')) {
      expect((expense as ExpenseRecord & { syncRecordId?: string }).syncRecordId).toBe(`expense:${expense.id}`);
    }
  });

  it('classifies a verified linked calf expense as individual, without changing historical unlinked records', async () => {
    await saveRecord('sales', { id: 'sale-test', salePrice: '712800', status: '販売済み', targetType: '子牛', targetNumber: '5953', calfId: 'calf-5953' });
    await saveRecord('calves', { id: 'calf-5953', earTag: '5953', name: '確認済み子牛' });
    await saveManualSettlement(input);
    const created = (await getAllRecords<ExpenseRecord>('expenses')).find((e) => e.id !== 'expense-vaccine');
    expect(created).toMatchObject({ animalType: 'calf', animalId: 'calf-5953', animalEarTag: '5953' });
    expect((await getAllRecords<ExpenseRecord>('expenses')).find((e) => e.id === 'expense-vaccine')?.animalType).toBeUndefined();
  });

  it('classifies a verified linked adult cattle expense as individual', async () => {
    await saveRecord('sales', { id: 'sale-test', salePrice: '712800', status: '販売済み', targetType: '成牛', targetNumber: '5953', cattleId: 'cattle-5953' });
    await saveRecord('cattle', { id: 'cattle-5953', earTag: '5953', name: '確認済み成牛' });
    await saveManualSettlement(input);
    const created = (await getAllRecords<ExpenseRecord>('expenses')).find((e) => e.id !== 'expense-vaccine');
    expect(created).toMatchObject({ animalType: 'cattle', animalId: 'cattle-5953', animalEarTag: '5953' });
  });

  it('does not invent an animal link for an unlinked historical sale', async () => {
    await saveManualSettlement(input);
    const created = (await getAllRecords<ExpenseRecord>('expenses')).find((e) => e.id !== 'expense-vaccine');
    expect(created?.animalType).toBeUndefined();
    expect(created?.animalId).toBeUndefined();
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

  it('blocks stale calfId pointing to another calf even if the sale price matches', async () => {
    await saveRecord('sales', {
      id: 'sale-test', salePrice: '712800', status: '販売済み',
      targetType: '子牛', targetNumber: '5754', calfId: '1',
    });
    await saveRecord('calves', { id: '1', earTag: '9999', name: '別の子牛' });
    await expect(saveManualSettlement(input)).rejects.toThrow('内部IDと牛の識別番号が一致しません');
    expect(await getAllRecords('metadata')).toHaveLength(0);
    expect(await getAllRecords('expenses')).toHaveLength(1);
  });

  it('allows matching calf reference and retains one vaccine expense only', async () => {
    await saveRecord('sales', {
      id: 'sale-test', salePrice: '712800', status: '販売済み',
      targetType: '子牛', targetNumber: '5953', calfId: '15',
    });
    await saveRecord('calves', {
      id: '15', earTag: '5953', identificationNumber: '1391059530', name: '精算テスト牛',
    });
    await saveRecord('expenses', {
      id: 'expense-vaccine', amount: '3640', description: '五種混合・ヘモフィルス',
      target: '5953', animalEarTag: '5953', paymentDate: '2026-04-21',
    });
    await saveManualSettlement({ ...input, expectedTargetNumber: '5953' });
    const after = await getAllRecords<ExpenseRecord>('expenses');
    expect(after.filter((e) => e.amount === '3640')).toHaveLength(1);
    expect(after).toHaveLength(2);
    expect((await getSavedSettlement('sale-test'))?.expenseIdsLinked).toEqual(['expense-vaccine']);
  });

  it('rejects a missing linked calf without creating expenses', async () => {
    await saveRecord('sales', {
      id: 'sale-test', salePrice: '712800', status: '販売済み',
      targetType: '子牛', targetNumber: '5754', calfId: '404',
    });
    await expect(saveManualSettlement(input)).rejects.toThrow('台帳に見つかりません');
    expect(await getAllRecords('expenses')).toHaveLength(1);
    expect(await getAllRecords('metadata')).toHaveLength(0);
  });

  it('does not accept short tag matching only the suffix of a different full ID', async () => {
    await saveRecord('sales', {
      id: 'sale-test', salePrice: '712800', status: '販売済み',
      targetType: '子牛', targetNumber: '5953', calfId: '15',
    });
    await saveRecord('calves', {
      id: '15', earTag: '9999', identificationNumber: '1391059530',
    });
    await expect(saveManualSettlement(input)).rejects.toThrow('内部IDと牛の識別番号が一致しません');
    expect(await getAllRecords('expenses')).toHaveLength(1);
    expect(await getAllRecords('metadata')).toHaveLength(0);
  });

  it('rejects linking a farm-wide expense without an identifiable animal', async () => {
    await saveRecord('expenses', {
      id: 'expense-vaccine', amount: '3640', description: 'ワクチン',
      target: '', animalEarTag: '', memo: '精算テスト牛 TEST5953',
    });
    await expect(saveManualSettlement(input)).rejects.toThrow('既存経費の対象牛が未登録');
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
