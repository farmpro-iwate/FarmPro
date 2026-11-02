import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./authClient', () => ({ getAuthToken: () => 'test-token', getStoredAuthUser: () => null }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => 'standard' }));
vi.mock('../plans/policy', () => ({ getFarmProPlan: () => ({ multiDeviceSync: true }) }));
vi.mock('./calfRecordSync', () => ({ syncCalfCreatedFromCalving: vi.fn() }));

import { clearStore, getAllRecords, saveRecordPreservingTimestamps } from '../storage/repository';
import { pullNewerCalvingRecordsFromCloud } from './calvingsApi';

describe('pullNewerCalvingRecordsFromCloud', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await clearStore('calvings');
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('imports a newer cloud calving so plan readers can use the latest actual calving date', async () => {
    const local = await saveRecordPreservingTimestamps('calvings',
      { id: 'old', cowId: '0254', cowName: 'おと', actualCalvingDate: '2026-08-29', updatedAt: '2026-08-29T09:00:00.000Z' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'new', cowId: '0254', cowName: 'おと', actualCalvingDate: '2026-09-03', updatedAt: '2026-09-03T09:00:00.000Z' },
      ],
    }));

    await expect(pullNewerCalvingRecordsFromCloud()).resolves.toBe(1);
    expect(await getAllRecords('calvings')).toEqual([
      expect.objectContaining({ id: 'new', cowId: '0254', actualCalvingDate: '2026-09-03' }), local,
    ]);
  });

  it('does not overwrite a newer local version of the same calving', async () => {
    const local = await saveRecordPreservingTimestamps('calvings',
      { id: 'same', cowId: '0254', actualCalvingDate: '2026-09-03', updatedAt: '2026-09-04T09:00:00.000Z' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'same', cowId: '0254', actualCalvingDate: '2026-08-29', updatedAt: '2026-09-03T09:00:00.000Z' },
      ],
    }));

    await expect(pullNewerCalvingRecordsFromCloud()).resolves.toBe(0);
    expect(await getAllRecords('calvings')).toEqual([local]);
  });
});
