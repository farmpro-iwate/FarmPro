import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/repository', () => ({
  getRecordById: vi.fn(),
  saveRecord: vi.fn(),
}));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => 'free' }));
vi.mock('../plans/policy', () => ({ getFarmProPlan: () => ({ multiDeviceSync: false }) }));
vi.mock('./authClient', () => ({
  getStoredAuthUser: () => null,
  updateAccountProfile: vi.fn(),
}));
vi.mock('./farmSettingsCloudApi', () => ({
  fetchFarmSettingsFromCloud: vi.fn(),
  saveFarmSettingsToCloud: vi.fn(),
}));

import { getRecordById, saveRecord } from '../storage/repository';
import { getFarmSettings, updateFarmSettings } from './settingsApi';

describe('post-calving heat farm setting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults existing farms without the setting to 35 days', async () => {
    vi.mocked(getRecordById).mockResolvedValue({
      id: 'farm-settings',
      farmName: 'テスト農場',
      ownerName: '',
      staffName: '',
      phone: '',
      address: '',
      estrousCycleDays: 21,
      defaultTaxRate: '10',
      farmExpenseAllocation: 'none',
      bullMasters: [],
      supplierMasters: [],
      memo: '',
    } as any);

    const settings = await getFarmSettings();
    expect(settings.postCalvingHeatDays).toBe(35);
  });

  it.each([30, 35, 40])('persists %s days as a farm setting', async (days) => {
    vi.mocked(saveRecord).mockImplementation(async (_store, record) => record as any);

    const input = {
      farmName: 'テスト農場',
      ownerName: '',
      staffName: '',
      phone: '',
      address: '',
      estrousCycleDays: 21,
      postCalvingHeatDays: days,
      defaultTaxRate: '10',
      farmExpenseAllocation: 'none',
      farmExpenseAllocationTarget: 'calf',
      farmExpenseAllocationPeriod: 'monthly',
      farmExpenseAllocationMethod: 'headcount',
      breedingCattleAcquisitionAllocationParity: 7,
      productionCostSettingsConfirmed: false,
      bullMasters: [],
      supplierMasters: [],
      memo: '',
    } as any;

    const saved = await updateFarmSettings(input);
    expect(saveRecord).toHaveBeenCalledWith(
      'metadata',
      expect.objectContaining({ id: 'farm-settings', postCalvingHeatDays: days }),
    );
    expect(saved.postCalvingHeatDays).toBe(days);
  });
});
