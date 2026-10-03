import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/repository', () => ({
  deleteRecord: vi.fn(),
  getAllRecords: vi.fn(),
  getRecordById: vi.fn(),
  saveRecord: vi.fn(),
  saveRecordPreservingTimestamps: vi.fn(),
}));
vi.mock('../storage/db', () => ({ openFarmProDatabase: vi.fn() }));
vi.mock('./authClient', () => ({ getAuthToken: () => 'test-token' }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => 'standard' }));
vi.mock('../plans/policy', () => ({ getFarmProPlan: () => ({ multiDeviceSync: true }) }));
vi.mock('./calfRecordSync', () => ({ syncCalfCreatedFromCalving: vi.fn() }));

import { getAllRecords, saveRecordPreservingTimestamps } from '../storage/repository';
import { pullNewerCalvingRecordsFromCloud } from './calvingsApi';

describe('pullNewerCalvingRecordsFromCloud', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(saveRecordPreservingTimestamps).mockImplementation(async (_store, record) => record as any);
  });

  it('imports a newer cloud calving so plan readers can use the latest actual calving date', async () => {
    vi.mocked(getAllRecords).mockResolvedValue([
      { id: 'old', cowId: '0254', cowName: 'おと', actualCalvingDate: '2026-08-29', updatedAt: '2026-08-29T09:00:00.000Z' },
    ] as any);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'new', cowId: '0254', cowName: 'おと', actualCalvingDate: '2026-09-03', updatedAt: '2026-09-03T09:00:00.000Z' },
      ],
    }));

    await expect(pullNewerCalvingRecordsFromCloud()).resolves.toBe(1);
    expect(saveRecordPreservingTimestamps).toHaveBeenCalledWith(
      'calvings',
      expect.objectContaining({ id: 'new', cowId: '0254', actualCalvingDate: '2026-09-03' }),
    );
  });

  it('does not overwrite a newer local version of the same calving', async () => {
    vi.mocked(getAllRecords).mockResolvedValue([
      { id: 'same', cowId: '0254', actualCalvingDate: '2026-09-03', updatedAt: '2026-09-04T09:00:00.000Z' },
    ] as any);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'same', cowId: '0254', actualCalvingDate: '2026-08-29', updatedAt: '2026-09-03T09:00:00.000Z' },
      ],
    }));

    await expect(pullNewerCalvingRecordsFromCloud()).resolves.toBe(0);
    expect(saveRecordPreservingTimestamps).not.toHaveBeenCalled();
  });
});
