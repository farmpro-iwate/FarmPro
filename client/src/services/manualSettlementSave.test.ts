import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySaleInput } from './salesApi';
import { getSavedSettlement, saveManualSettlement, type SettlementSaveInput } from './manualSettlementSave';
import { getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';

const sale = {
  ...emptySaleInput,
  id: 'local-free-sale', syncRecordId: 'sale:canonical-fixture-sale',
  targetType: '子牛' as const, targetNumber: 'TEST5954', targetName: '精算確認用',
  calfId: 'fixture-calf', birthday: '2026-01-01', saleDate: '2026-10-27',
  salePrice: '500000', status: '販売済み' as const,
  productionCostSnapshot: 200000, profitSnapshot: 300000,
  createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z',
};
const input = (): SettlementSaveInput => ({
  saleId: sale.id, expectedTargetNumber: sale.targetNumber, confirmed: true,
  settlementNumber: 'FREE-FIXTURE', grossYen: 500000, adjustmentYen: 0, expectedNetYen: 490000,
  deductions: [{ label: '市場手数料', amountYen: 10000 }],
  expensesToCreate: [{
    deductionIndex: 0, paymentDate: '2026-10-27', category: '手数料', description: '市場手数料',
    vendor: 'Fixture Market', amount: '10000', paymentMethod: 'JA精算', target: sale.targetNumber, memo: 'Fixture settlement',
  }],
});

describe('Free local settlement protects cloud-finalized or previously synced sales after a downgrade', () => {
  let farmCounter = 0;
  beforeEach(async () => {
    window.localStorage.clear();
    window.localStorage.setItem('farmpro.authUser', JSON.stringify({
      id: 'free-fixture-user', farmId: `free-settlement-fixture-${++farmCounter}`,
      farmName: 'Fixture Farm', name: 'Fixture User', role: 'owner', active: true, plan: 'free',
    }));
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Local Free settlement must not probe an API'); }));
    await saveRecordPreservingTimestamps('sales', { ...sale });
    await saveRecordPreservingTimestamps('calves', {
      id: sale.calfId, calfNumber: sale.targetNumber, name: sale.targetName, birthday: sale.birthday,
    });
  });
  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('rejects an already imported formal settlement using the canonical sale ID even without a cloud timestamp', async () => {
    const expense = {
      id: 'already-finalized-fee', syncRecordId: 'expense:already-finalized-fee',
      settlementSaleId: sale.syncRecordId, settlementExpenseKind: 'created',
      amount: '10000', target: sale.targetNumber,
      createdAt: '2026-10-27T00:00:00.000Z', updatedAt: '2026-10-27T00:00:00.000Z',
    };
    await saveRecordPreservingTimestamps('expenses', expense);
    await expect(saveManualSettlement(input())).rejects.toThrow('クラウドで精算登録済み');
    expect(await getAllRecords('expenses')).toEqual([expense]);
    expect(await getSavedSettlement(sale.id)).toBeNull();
    expect(await getRecordById('sales', sale.id)).toEqual(sale);
  });

  it('rejects a previously synced sale before fees have been downloaded, without writing or querying the cloud', async () => {
    const syncedSale = { ...sale, cloudUpdatedAt: '2026-10-27T00:00:00.000Z', cloudSyncPending: false };
    await saveRecordPreservingTimestamps('sales', syncedSale);
    await expect(saveManualSettlement(input())).rejects.toThrow('クラウド同期済み');
    expect(await getAllRecords('expenses')).toEqual([]);
    expect(await getSavedSettlement(sale.id)).toBeNull();
    expect(await getRecordById('sales', sale.id)).toEqual(syncedSale);
  });

  it('preserves genuinely local Free saving even when a new local sale already has a syncRecordId', async () => {
    const otherSaleFee = {
      id: 'unrelated-fee', settlementSaleId: 'sale:another-fixture-sale', amount: '3000',
      createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z',
    };
    await saveRecordPreservingTimestamps('expenses', otherSaleFee);
    await saveManualSettlement(input());
    const expenses = await getAllRecords<{ id: string; amount?: string; cloudSyncPending?: boolean }>('expenses');
    expect(expenses).toHaveLength(2);
    expect(expenses.find(expense => expense.id !== otherSaleFee.id)).toMatchObject({ amount: '10000', cloudSyncPending: false });
    expect(await getRecordById('expenses', otherSaleFee.id)).toEqual(otherSaleFee);
    expect(await getSavedSettlement(sale.id)).toMatchObject({ settlementNumber: 'FREE-FIXTURE', expectedNetYen: 490000 });
    expect(await getRecordById('sales', sale.id)).toEqual(sale);
    await expect(saveManualSettlement({ ...input(), settlementNumber: 'DIFFERENT-NUMBER' })).rejects.toThrow('精算は登録済み');
    expect(await getAllRecords('expenses')).toEqual(expenses);
  });
});
