import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import { deleteSale, emptySaleInput, recordToInput, updateSale, type SaleRecord } from './salesApi';

vi.mock('./authClient', () => ({ getAuthToken: vi.fn(), getStoredAuthUser: vi.fn() }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: vi.fn() }));

const original = {
  ...emptySaleInput,
  id: 'local-sale', syncRecordId: 'sale:cloud-sale',
  targetType: '子牛' as const, targetNumber: 'TEST5954', targetName: '検証牛',
  birthday: '2026-01-01', calfId: 'calf-one', saleDate: '2026-10-27',
  salePrice: '500000', status: '販売済み' as const,
  productionCostSnapshot: 200000, profitSnapshot: 300000,
  costSnapshotAt: '2026-10-27T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z',
  cloudUpdatedAt: '2026-10-27T00:00:00Z', cloudSyncPending: false,
};

describe('settled sale mutation protection before IndexedDB changes', () => {
  let farmCounter = 0;
  beforeEach(async () => {
    vi.resetAllMocks();
    localStorage.clear();
    vi.mocked(getStoredAuthUser).mockReturnValue({ farmId: `sale-protection-${++farmCounter}`, plan: 'standard' } as ReturnType<typeof getStoredAuthUser>);
    vi.mocked(getAuthToken).mockReturnValue('test-session');
    vi.mocked(getCurrentFarmProPlanId).mockReturnValue('standard');
    vi.stubGlobal('fetch', vi.fn());
    await saveRecordPreservingTimestamps('sales', original);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['update', 'conflict'], ['delete', 'conflict'],
    ['update', 'network'], ['delete', 'network'],
  ] as const)('%s leaves the complete original sale intact after a %s failure', async (action, failure) => {
    if (failure === 'conflict') {
      vi.mocked(fetch).mockResolvedValue(Response.json({ message: '精算登録済みの販売記録は変更できません' }, { status: 409 }));
    } else {
      vi.mocked(fetch).mockRejectedValue(new TypeError('network lost'));
    }
    const attempt = action === 'update'
      ? updateSale(original.id, { ...recordToInput(original), salePrice: '900000', targetNumber: 'OTHER' })
      : deleteSale(original.id);
    await expect(attempt).rejects.toThrow(failure === 'conflict' ? '精算登録済み' : 'network lost');
    expect(await getRecordById<SaleRecord>('sales', original.id)).toEqual(original);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/sales/record-sync/sale%3Acloud-sale', expect.objectContaining({
      method: action === 'update' ? 'PUT' : 'DELETE',
    }));
  });

  it.each(['free', 'standard'] as const)('protects a previously saved local settlement on the %s plan', async plan => {
    vi.mocked(getCurrentFarmProPlanId).mockReturnValue(plan);
    await saveRecordPreservingTimestamps('metadata', {
      id: `settlement:sale:${original.id}`, saleId: original.id, settlementNumber: 'LOCAL-1',
    });
    // Even after a Free farm upgrades, the existing local settlement is binding.
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...original, id: original.syncRecordId }));
    await expect(updateSale(original.id, { ...recordToInput(original), salePrice: '900000' })).rejects.toThrow('精算登録済み');
    await expect(deleteSale(original.id)).rejects.toThrow('精算登録済み');
    expect(await getRecordById<SaleRecord>('sales', original.id)).toEqual(original);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('checks an imported cloud sale before changing a stale unsold local record', async () => {
    const imported = { ...original, status: '出荷済み' as const, shippingDate: '2026-10-26', cloudUpdatedAt: undefined };
    await saveRecordPreservingTimestamps('sales', imported);
    vi.mocked(fetch).mockResolvedValue(Response.json({ message: '精算登録済み' }, { status: 409 }));
    await expect(updateSale(imported.id, { ...recordToInput(imported), salePrice: '900000' })).rejects.toThrow('精算登録済み');
    await expect(deleteSale(imported.id)).rejects.toThrow('精算登録済み');
    expect(await getRecordById('sales', imported.id)).toEqual(imported);
  });
});
