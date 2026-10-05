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

import { createTreatment, deleteTreatment, getTreatmentList } from './treatmentApi';

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

  it('回復の次回予定を消して継続元と休薬日を保存・同期する', async () => {
    saveRecord.mockImplementation(async (_store, record) => record);
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

    await createTreatment({
      targetNumber: '6891', targetName: 'あいうえお', treatmentDate: '2026-10-05',
      symptom: '下痢', diagnosis: '', medicine: '', dosage: '', veterinarian: '', note: '',
      progress: '回復', nextScheduledDate: '2026-10-06', withdrawalEndDate: '2026-10-10',
      treatmentCourseId: 'treatment:123',
    });

    expect(saveRecord).toHaveBeenCalledWith('treatments', expect.objectContaining({
      progress: '回復', nextScheduledDate: '', withdrawalEndDate: '2026-10-10', treatmentCourseId: 'treatment:123',
    }));
    const request = vi.mocked(fetch).mock.calls[0][1]!;
    expect(JSON.parse(String(request.body))).toMatchObject({ treatmentCourseId: 'treatment:123', nextScheduledDate: '' });
  });

  it('クラウドから読み込んだ継続元を端末でも保持する', async () => {
    getAllRecords.mockResolvedValue([]);
    saveRecordPreservingTimestamps.mockImplementation(async (_store, record) => record);
    vi.mocked(fetch).mockResolvedValue({
      ok: true, json: async () => [{ id: 'treatment:456', targetNumber: '6891', treatmentDate: '2026-10-05', progress: '回復', treatmentCourseId: 'treatment:123' }],
    } as Response);

    await getTreatmentList();

    expect(saveRecordPreservingTimestamps).toHaveBeenCalledWith('treatments', expect.objectContaining({
      syncRecordId: 'treatment:456', treatmentCourseId: 'treatment:123',
    }));
  });
});
