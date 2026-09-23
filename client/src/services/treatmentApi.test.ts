import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getAllRecords,
  getRecordById,
  deleteRecord,
  saveRecord,
  saveManyRecords,
  saveRecordPreservingTimestamps,
} = vi.hoisted(() => ({
  getAllRecords: vi.fn(),
  getRecordById: vi.fn(),
  deleteRecord: vi.fn(),
  saveRecord: vi.fn(),
  saveManyRecords: vi.fn(),
  saveRecordPreservingTimestamps: vi.fn(),
}));

vi.mock('../storage/repository', () => ({
  getAllRecords,
  getRecordById,
  deleteRecord,
  saveRecord,
  saveManyRecords,
  saveRecordPreservingTimestamps,
}));

vi.mock('../plans/current-plan', () => ({
  getCurrentFarmProPlanId: () => 'standard',
}));

vi.mock('../plans/policy', () => ({
  getFarmProPlan: () => ({ multiDeviceSync: true }),
}));

vi.mock('./authClient', () => ({
  getAuthToken: () => 'test-token',
}));

import { deleteTreatment, getTreatmentList } from './treatmentApi';

describe('treatment deletion sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('端末削除時にクラウドへDELETE同期する', async () => {
    getRecordById.mockResolvedValue({
      id: 123,
      syncRecordId: 'treatment:123',
    });
    deleteRecord.mockResolvedValue(undefined);

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'treatment:123',
        deletedAt: '2026-09-23T00:00:00.000Z',
        cloudUpdatedAt: '2026-09-23T00:00:00.000Z',
      }),
    } as Response);

    await deleteTreatment(123);

    expect(deleteRecord).toHaveBeenCalledWith('treatments', 123);
    expect(fetch).toHaveBeenCalledWith(
      '/api/treatments/record-sync/treatment%3A123',
      expect.objectContaining({
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });

  it('クラウドで削除済みの治療記録を端末へ復活させない', async () => {
    getAllRecords.mockResolvedValue([
      {
        id: 123,
        syncRecordId: 'treatment:123',
        cloudUpdatedAt: '2026-09-22T00:00:00.000Z',
        cloudSyncPending: false,
        targetNumber: '7358',
        targetName: 'はなみつ',
        treatmentDate: '2026-09-23',
      },
    ]);
    deleteRecord.mockResolvedValue(undefined);

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'treatment:123',
          deletedAt: '2026-09-23T00:00:00.000Z',
          cloudUpdatedAt: '2026-09-23T00:00:00.000Z',
        },
      ],
    } as Response);

    await getTreatmentList();

    expect(deleteRecord).toHaveBeenCalledWith('treatments', 123);
  });
});
