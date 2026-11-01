import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Treatment } from '../types/treatment';

const {
  getAllRecords,
  getRecordById,
  deleteRecord,
  saveRecord,
  saveManyRecords,
  saveRecordPreservingTimestamps,
  syncContext,
} = vi.hoisted(() => ({
  getAllRecords: vi.fn(),
  getRecordById: vi.fn(),
  deleteRecord: vi.fn(),
  saveRecord: vi.fn(),
  saveManyRecords: vi.fn(),
  saveRecordPreservingTimestamps: vi.fn(),
  syncContext: {
    planId: 'standard', token: 'test-token' as string | null,
    user: null as { id: string; farmId: string } | null,
  },
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
  getCurrentFarmProPlanId: () => syncContext.planId,
}));

vi.mock('../plans/policy', () => ({
  getFarmProPlan: (planId: string) => ({ multiDeviceSync: planId !== 'free' }),
}));

vi.mock('./authClient', () => ({
  getAuthToken: () => syncContext.token,
  getStoredAuthUser: () => syncContext.user,
}));

vi.mock('./supplyInventoryLinkedSync', async (importOriginal) => ({
  ...await importOriginal<typeof import('./supplyInventoryLinkedSync')>(),
  hasPendingSupplyLinkedRecord: async () => false,
}));

import { createTreatment, deleteTreatment, getTreatmentList, updateTreatment } from './treatmentApi';

const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

function useWebLocks() {
  const running = new Map<string, Promise<unknown>>();
  const request = vi.fn((name: string, optionsOrCallback: unknown, callback?: () => Promise<unknown>) => {
    const work = typeof optionsOrCallback === 'function'
      ? optionsOrCallback as () => Promise<unknown>
      : callback!;
    const result = (running.get(name) ?? Promise.resolve()).catch(() => undefined).then(work);
    running.set(name, result);
    return result;
  });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
  return request;
}

function useTreatmentRepository() {
  const record: Treatment & { cloudUpdatedAt: string } = {
    id: 123, syncRecordId: 'treatment:123', cloudSyncPending: false,
    cloudUpdatedAt: '2026-09-22T00:00:00.000Z',
    targetNumber: '7358', targetName: 'はなみつ', treatmentDate: '2026-09-23',
    symptom: '下痢', diagnosis: '', medicine: '', dosage: '', veterinarian: '',
    medicineSource: 'veterinarian', withdrawalEndDate: '', progress: '治療中', note: '削除前の記録',
  };
  const records = new Map<number, Treatment>([[record.id, { ...record }]]);
  const farms = new Map<string, Map<number, Treatment>>([[syncContext.user?.farmId ?? '', records]]);
  const currentRecords = () => farms.get(syncContext.user?.farmId ?? '')!;
  getRecordById.mockImplementation(async (store: string, id: number) =>
    store === 'treatments' && currentRecords().has(id) ? { ...currentRecords().get(id)! } : undefined);
  getAllRecords.mockImplementation(async (store: string) =>
    store === 'treatments' ? [...currentRecords().values()].map((row) => ({ ...row })) : []);
  deleteRecord.mockImplementation(async (store: string, id: number) => {
    if (store === 'treatments') currentRecords().delete(id);
  });
  const save = async (store: string, row: Treatment) => {
    if (store === 'treatments') currentRecords().set(row.id, { ...row });
    return { ...row };
  };
  saveRecord.mockImplementation(save);
  saveRecordPreservingTimestamps.mockImplementation(save);
  return { record, records, farms };
}

describe('treatment deletion sync', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    syncContext.planId = 'standard';
    syncContext.token = 'test-token';
    syncContext.user = null;
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks);
    else Reflect.deleteProperty(navigator, 'locks');
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

  it('クラウド削除に失敗したら記録を残し、その後の一覧取得でも重複や再作成を起こさない', async () => {
    const { record, records } = useTreatmentRepository();
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === 'DELETE') {
        return { ok: false, status: 503, json: async () => ({ message: '削除を保存できませんでした' }) } as Response;
      }
      return { ok: true, json: async () => [{ ...record, id: record.syncRecordId }] } as Response;
    });

    const failure = await deleteTreatment(record.id).catch((error: unknown) => error);

    expect.soft(failure).toBeInstanceOf(Error);
    expect.soft(records.get(record.id)).toEqual(record);
    await getTreatmentList();
    const reloaded = await getTreatmentList();

    expect(reloaded.map((row) => row.id)).toEqual([record.id]);
    expect(records.get(record.id)).toEqual(record);
    expect(deleteRecord).not.toHaveBeenCalled();
    expect(saveRecord).not.toHaveBeenCalled();
    expect(saveRecordPreservingTimestamps).not.toHaveBeenCalled();
  });

  it('削除成功の応答を失った場合は記録を残し、次の削除済み受信で一度だけ削除する', async () => {
    const { record, records } = useTreatmentRepository();
    let cloudDeleted = false;
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === 'DELETE') {
        cloudDeleted = true;
        throw new TypeError('削除応答を受信できませんでした');
      }
      return {
        ok: true,
        json: async () => cloudDeleted ? [{
          id: record.syncRecordId,
          deletedAt: '2026-09-23T00:00:00.000Z',
          cloudUpdatedAt: '2026-09-23T00:00:00.000Z',
        }] : [],
      } as Response;
    });

    await expect(deleteTreatment(record.id)).rejects.toThrow('削除応答を受信できませんでした');
    expect(records.get(record.id)).toEqual(record);
    expect(deleteRecord).not.toHaveBeenCalled();

    expect(await getTreatmentList()).toEqual([]);
    expect(await getTreatmentList()).toEqual([]);
    expect(records.size).toBe(0);
    expect(deleteRecord).toHaveBeenCalledExactlyOnceWith('treatments', record.id);
    expect(saveRecordPreservingTimestamps).not.toHaveBeenCalled();
  });

  it('有料同期でログイン情報がなければ削除を拒否して端末記録を残す', async () => {
    const { record, records } = useTreatmentRepository();
    syncContext.token = null;

    await expect(deleteTreatment(record.id)).rejects.toThrow(/ログイン/);

    expect(records.get(record.id)).toEqual(record);
    expect(deleteRecord).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('Freeではクラウドへ通信せず端末記録だけを削除する', async () => {
    const { record, records } = useTreatmentRepository();
    syncContext.planId = 'free';
    syncContext.token = null;

    await deleteTreatment(record.id);

    expect(records.size).toBe(0);
    expect(await getTreatmentList()).toEqual([]);
    expect(deleteRecord).toHaveBeenCalledExactlyOnceWith('treatments', record.id);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['fallback', 'Web Locks'])('先行する一覧受信を待って削除し、古いGETで記録を復活させない（%s）', async (mode) => {
    const requestLock = mode === 'Web Locks' ? useWebLocks() : undefined;
    const { record, records } = useTreatmentRepository();
    const getStarted = deferred<void>();
    const releaseGet = deferred<Response>();
    const requests: string[] = [];
    let existedAtCloudDelete = false;
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const method = init?.method ?? 'GET';
      requests.push(method);
      if (method === 'DELETE') {
        existedAtCloudDelete = records.has(record.id);
        return { ok: true, json: async () => ({}) } as Response;
      }
      getStarted.resolve();
      return releaseGet.promise;
    });

    const loading = getTreatmentList();
    await getStarted.promise;
    const deleting = deleteTreatment(record.id);
    // Allow the deletion to reach the shared lock while the older GET is held.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const requestsBeforeGetCompleted = [...requests];
    releaseGet.resolve({
      ok: true,
      json: async () => [{ ...record, id: record.syncRecordId, cloudUpdatedAt: '2026-09-23T00:00:00.000Z' }],
    } as Response);
    await Promise.all([loading, deleting]);

    expect(requestsBeforeGetCompleted).toEqual(['GET']);
    expect(requests).toEqual(['GET', 'DELETE']);
    expect(existedAtCloudDelete).toBe(true);
    expect(records.size).toBe(0);
    expect(deleteRecord).toHaveBeenCalledExactlyOnceWith('treatments', record.id);
    if (requestLock) {
      expect(requestLock).toHaveBeenCalledTimes(2);
      expect(new Set(requestLock.mock.calls.map(([name]) => name)).size).toBe(1);
    }
  });

  it.each(['token', 'farm'])('削除の待機中に%sが変わった場合は両農場の同じIDの記録を保持する', async (changed) => {
    syncContext.user = { id: 'user-a', farmId: 'farm-a' };
    const { record, records, farms } = useTreatmentRepository();
    const otherRecord = { ...record, note: '別農場の同じIDの記録' };
    const otherFarm = new Map([[record.id, otherRecord]]);
    farms.set('farm-b', otherFarm);
    const getStarted = deferred<void>();
    const releaseGet = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === 'DELETE') return { ok: true, json: async () => ({}) } as Response;
      getStarted.resolve();
      return releaseGet.promise;
    });

    const loadingResult = getTreatmentList().catch((error: unknown) => error);
    await getStarted.promise;
    const deletionResult = deleteTreatment(record.id).catch((error: unknown) => error);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (changed === 'token') syncContext.token = 'replacement-token';
    else syncContext.user = { id: 'user-b', farmId: 'farm-b' };
    releaseGet.resolve({
      ok: true,
      json: async () => [{ ...record, id: record.syncRecordId, cloudUpdatedAt: '2026-09-23T00:00:00.000Z' }],
    } as Response);
    const [failure, readFailure] = await Promise.all([deletionResult, loadingResult]);

    expect(failure).toBeInstanceOf(Error);
    expect(readFailure).toBeInstanceOf(Error);
    expect(records.get(record.id)).toEqual(record);
    expect(otherFarm.get(record.id)).toEqual(otherRecord);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(deleteRecord).not.toHaveBeenCalled();
    expect(saveRecordPreservingTimestamps).not.toHaveBeenCalled();
  });

  it('DELETE送信後の応答待ちに農場が変わっても切替先の同じIDを削除しない', async () => {
    syncContext.user = { id: 'user-a', farmId: 'farm-a' };
    const { record, records, farms } = useTreatmentRepository();
    const otherRecord = { ...record, note: '切替先の農場の記録' };
    const otherFarm = new Map([[record.id, otherRecord]]);
    farms.set('farm-b', otherFarm);
    const deleteStarted = deferred<void>();
    const releaseDelete = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async () => {
      deleteStarted.resolve();
      return releaseDelete.promise;
    });

    const deletionResult = deleteTreatment(record.id).catch((error: unknown) => error);
    await deleteStarted.promise;
    syncContext.user = { id: 'user-b', farmId: 'farm-b' };
    syncContext.token = 'farm-b-token';
    releaseDelete.resolve({ ok: true, json: async () => ({}) } as Response);

    expect(await deletionResult).toBeInstanceOf(Error);
    expect(records.get(record.id)).toEqual(record);
    expect(otherFarm.get(record.id)).toEqual(otherRecord);
    expect(deleteRecord).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/api/treatments/record-sync/treatment%3A123',
      expect.objectContaining({ method: 'DELETE', headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('端末に対象記録がなければ同じ数値IDを使ったクラウド削除を送らない', async () => {
    const { record, records } = useTreatmentRepository();
    records.clear();

    await deleteTreatment(record.id);

    expect(fetch).not.toHaveBeenCalled();
    expect(deleteRecord).not.toHaveBeenCalled();
  });

  it('保存中のPUT応答を反映してから削除し、遅い保存応答で記録を復活させない', async () => {
    const { record, records } = useTreatmentRepository();
    const putStarted = deferred<void>();
    const releasePut = deferred<Response>();
    const requests: string[] = [];
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const method = init?.method ?? 'GET';
      requests.push(method);
      if (method === 'PUT') {
        putStarted.resolve();
        return releasePut.promise;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const saving = updateTreatment(record.id, { ...record, note: '削除直前の編集' });
    await putStarted.promise;
    const deleting = deleteTreatment(record.id);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const requestsBeforePutCompleted = [...requests];
    releasePut.resolve({
      ok: true,
      json: async () => ({ id: record.syncRecordId, cloudUpdatedAt: '2026-09-23T00:00:00.000Z' }),
    } as Response);
    await Promise.all([saving, deleting]);

    expect(requestsBeforePutCompleted).toEqual(['PUT']);
    expect(requests).toEqual(['PUT', 'DELETE']);
    expect(records.size).toBe(0);
    expect(deleteRecord).toHaveBeenCalledExactlyOnceWith('treatments', record.id);
  });

  it('PUT応答待ちに端末記録が別処理で消えた場合は保存応答で再作成しない', async () => {
    const { record, records } = useTreatmentRepository();
    const putStarted = deferred<void>();
    const releasePut = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async () => {
      putStarted.resolve();
      return releasePut.promise;
    });

    const saving = updateTreatment(record.id, { ...record, note: '応答待ちの編集' });
    await putStarted.promise;
    await deleteRecord('treatments', record.id);
    releasePut.resolve({
      ok: true,
      json: async () => ({ id: record.syncRecordId, cloudUpdatedAt: '2026-09-23T00:00:00.000Z' }),
    } as Response);
    await saving;

    expect(records.size).toBe(0);
    expect(saveRecordPreservingTimestamps).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/api/treatments/record-sync/treatment%3A123',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('回復の次回予定を消して継続元と休薬日を保存・同期する', async () => {
    const { records } = useTreatmentRepository();
    records.clear();
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
