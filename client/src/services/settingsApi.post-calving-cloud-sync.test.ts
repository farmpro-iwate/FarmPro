import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/repository', () => ({
  getRecordById: vi.fn(),
  saveRecord: vi.fn(),
}));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => 'standard' }));
vi.mock('../plans/policy', () => ({ getFarmProPlan: () => ({ multiDeviceSync: true }) }));
vi.mock('./authClient', () => ({
  getStoredAuthUser: () => null,
  updateAccountProfile: vi.fn(),
}));
vi.mock('./farmSettingsCloudApi', () => ({
  fetchFarmSettingsFromCloud: vi.fn(),
  saveFarmSettingsToCloud: vi.fn(),
}));

import { getRecordById, saveRecord } from '../storage/repository';
import { fetchFarmSettingsFromCloud, saveFarmSettingsToCloud } from './farmSettingsCloudApi';
import { getFarmSettingsForPageOpen, updateFarmSettings } from './settingsApi';

const baseSettings = {
  farmName: 'テスト農場',
  ownerName: '',
  staffName: '',
  phone: '',
  address: '',
  estrousCycleDays: 21,
  postCalvingHeatDays: 40,
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

describe('post-calving heat setting multi-device round trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveRecord).mockImplementation(async (_store, record) => record as any);
  });

  it('saves the PC value to cloud and uses the same cloud value when another device opens the page', async () => {
    vi.mocked(getRecordById).mockResolvedValue({ id: 'farm-settings', ...baseSettings } as any);
    vi.mocked(saveFarmSettingsToCloud).mockResolvedValue({
      ...baseSettings,
      cloudUpdatedAt: '2026-10-04T00:00:00.000Z',
    } as any);

    const saved = await updateFarmSettings(baseSettings);

    expect(saveFarmSettingsToCloud).toHaveBeenCalledWith(
      expect.objectContaining({ postCalvingHeatDays: 40 }),
    );
    expect(saved.postCalvingHeatDays).toBe(40);

    vi.mocked(fetchFarmSettingsFromCloud).mockResolvedValue({
      ...baseSettings,
      cloudUpdatedAt: '2026-10-04T00:00:00.000Z',
    } as any);

    const opened = await getFarmSettingsForPageOpen();

    expect(fetchFarmSettingsFromCloud).toHaveBeenCalledTimes(1);
    expect(saveRecord).toHaveBeenCalledWith(
      'metadata',
      expect.objectContaining({ id: 'farm-settings', postCalvingHeatDays: 40 }),
    );
    expect(opened.postCalvingHeatDays).toBe(40);
  });
});
