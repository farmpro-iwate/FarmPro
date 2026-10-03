import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./breedingApi', () => ({ getBreedingList: vi.fn().mockResolvedValue([]) }));
vi.mock('./salesApi', () => ({ getSalesList: vi.fn().mockResolvedValue([]) }));
vi.mock('../storage/repository', () => ({ getAllRecords: vi.fn().mockResolvedValue([]) }));
vi.mock('./calvingsApi', () => ({ pullNewerCalvingRecordsFromCloud: vi.fn().mockResolvedValue(0) }));
vi.mock('./settingsApi', () => ({
  getFarmSettingsForPageOpen: vi.fn(),
}));

import { getFarmSettingsForPageOpen } from './settingsApi';
import { getCattlePlanSnapshot } from './cattlePlanSnapshot';

describe('getCattlePlanSnapshot farm settings refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the cloud-refreshed postpartum heat setting instead of stale local defaults', async () => {
    vi.mocked(getFarmSettingsForPageOpen).mockResolvedValue({
      estrousCycleDays: 21,
      postCalvingHeatDays: 40,
    } as any);

    const snapshot = await getCattlePlanSnapshot();

    expect(getFarmSettingsForPageOpen).toHaveBeenCalledTimes(1);
    expect(snapshot.cycleDays).toBe(21);
    expect(snapshot.postCalvingHeatDays).toBe(40);
  });

  it('keeps the existing 35-day fallback if refreshed settings do not provide a valid value', async () => {
    vi.mocked(getFarmSettingsForPageOpen).mockResolvedValue({
      estrousCycleDays: 21,
      postCalvingHeatDays: 0,
    } as any);

    const snapshot = await getCattlePlanSnapshot();

    expect(snapshot.postCalvingHeatDays).toBe(35);
  });
});
