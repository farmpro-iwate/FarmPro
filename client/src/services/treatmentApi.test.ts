import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, deleteRecord, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { Treatment } from '../types/treatment';

const { syncContext } = vi.hoisted(() => ({
  syncContext: {
    planId: 'standard', token: 'test-token' as string | null,
    user: null as { id: string; farmId: string } | null,
  },
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
const farmA = { id: 'user-a', farmId: 'farm-a' };
const farmB = { id: 'user-b', farmId: 'farm-b' };

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

async function seedTreatment() {
  const record: Treatment & { cloudUpdatedAt: string } = {
    id: 123, syncRecordId: 'treatment:123', cloudSyncPending: false,
    cloudUpdatedAt: '2026-09-22T00:00:00.000Z',
    createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:00:00.000Z',
    targetNumber: '7358', targetName: 'はなみつ', treatmentDate: '2026-09-23',
    symptom: '下痢', diagnosis: '', medicine: '', dosage: '', veterinarian: '',
    medicineSource: 'veterinarian', withdrawalEndDate: '', progress: '治療中', note: '削除前の記録',
  };
  return saveRecordPreservingTimestamps('treatments', record);
}

async function seedOtherFarm(record: Treatment) {
  const currentUser = syncContext.user;
  syncContext.user = farmB;
  await saveRecordPreservingTimestamps('treatments', record);
  syncContext.user = currentUser;
}

async function readFarm(user: typeof syncContext.user) {
  const currentUser = syncContext.user;
  syncContext.user = user;
  const records = await getAllRecords<Treatment>('treatments');
  syncContext.user = currentUser;
  return records;
}

describe('treatment deletion sync', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    syncContext.planId = 'standard';
    syncContext.token = 'test-token';
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    for (const user of [farmA, farmB, null]) {
      syncContext.user = user;
      for (const store of ['treatments', 'calves', 'metadata'] as const) await clearStore(store);
    }
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks);
    else Reflect.deleteProperty(navigator, 'locks');
  });

  it('端末削除時にクラウドへDELETE同期する', async () => {
    await seedTreatment();
    vi.mocked(fetch).mockImplementation(async () => Response.json({
      id: 'treatment:123', deletedAt: '2026-09-23T00:00:00.000Z', cloudUpdatedAt: '2026-09-23T00:00:00.000Z',
    }));

    await deleteTreatment(123);

    expect(await getRecordById('treatments', 123)).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      '/api/treatments/record-sync/treatment%3A123',
      expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
    );
  });

  it('クラウドで削除済みの治療記録を端末へ復活させない', async () => {
    await seedTreatment();
    vi.mocked(fetch).mockImplementation(async () => Response.json([{
      id: 'treatment:123', deletedAt: '2026-09-23T00:00:00.000Z', cloudUpdatedAt: '2026-09-23T00:00:00.000Z',
    }]));

    expect(await getTreatmentList()).toEqual([]);
    expect(await getTreatmentList()).toEqual([]);
    expect(await getAllRecords('treatments')).toEqual([]);
  });

  it('クラウド削除に失敗したら記録を残し、その後の一覧取得でも重複や再作成を起こさない', async () => {
    const record = await seedTreatment();
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (init?.method === 'DELETE') return Response.json({ message: '削除を保存できませんでした' }, { status: 503 });
      const cloud = { ...record, id: record.syncRecordId };
      return Response.json(String(url).endsWith('/record-sync') ? [cloud] : cloud);
    });

    await expect(deleteTreatment(record.id)).rejects.toThrow('削除を保存できませんでした');
    const protectedRecord = { ...record, cloudSyncPending: true, treatmentSyncDeletePending: true };
    expect(await getRecordById('treatments', record.id)).toEqual(protectedRecord);
    await getTreatmentList();

    expect(await getTreatmentList()).toEqual([protectedRecord]);
    expect(await getAllRecords('treatments')).toEqual([protectedRecord]);
  });

  it('削除成功の応答を失った場合は次の削除済み受信でも記録を残し、再削除の成功で経費処理へ進む', async () => {
    const record = await seedTreatment();
    let cloudDeleted = false;
    const tombstone = {
      id: record.syncRecordId, deletedAt: '2026-09-23T00:00:00.000Z', cloudUpdatedAt: '2026-09-23T00:00:00.000Z',
    };
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (init?.method === 'DELETE') {
        if (cloudDeleted) return Response.json(tombstone);
        cloudDeleted = true;
        throw new TypeError('削除応答を受信できませんでした');
      }
      if (String(url).endsWith('/record-sync')) return Response.json(cloudDeleted ? [tombstone] : []);
      return Response.json(cloudDeleted ? tombstone : { ...record, id: record.syncRecordId });
    });
    const deleteExpenseAfterSuccess = vi.fn();

    await expect(deleteTreatment(record.id).then(deleteExpenseAfterSuccess)).rejects.toThrow('削除応答を受信できませんでした');
    const protectedRecord = { ...record, cloudSyncPending: true, treatmentSyncDeletePending: true };
    expect(await getRecordById('treatments', record.id)).toEqual(protectedRecord);

    expect(await getTreatmentList()).toEqual([protectedRecord]);
    expect(await getTreatmentList()).toEqual([protectedRecord]);
    expect(deleteExpenseAfterSuccess).not.toHaveBeenCalled();

    await deleteTreatment(record.id).then(deleteExpenseAfterSuccess);
    expect(await getAllRecords('treatments')).toEqual([]);
    expect(deleteExpenseAfterSuccess).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual(['GET', 'DELETE', 'GET', 'GET', 'GET', 'DELETE']);
  });

  it('有料同期でログイン情報がなければ削除を拒否して端末記録を残す', async () => {
    const record = await seedTreatment();
    syncContext.token = null;

    await expect(deleteTreatment(record.id)).rejects.toThrow(/ログイン/);

    expect(await getAllRecords('treatments')).toEqual([record]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('Freeではクラウドへ通信せず端末記録だけを削除する', async () => {
    const record = await seedTreatment();
    syncContext.planId = 'free';
    syncContext.token = null;

    await deleteTreatment(record.id);

    expect(await getAllRecords('treatments')).toEqual([]);
    expect(await getTreatmentList()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['fallback', 'Web Locks'])('先行する一覧受信を待って削除し、古いGETで記録を復活させない（%s）', async (mode) => {
    const requestLock = mode === 'Web Locks' ? useWebLocks() : undefined;
    const record = await seedTreatment();
    const getStarted = deferred<void>();
    const releaseGet = deferred<Response>();
    const requests: string[] = [];
    let existedAtCloudDelete = false;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const method = init?.method ?? 'GET';
      requests.push(method);
      if (method === 'DELETE') {
        existedAtCloudDelete = Boolean(await getRecordById('treatments', record.id));
        return Response.json({ id: record.syncRecordId, deletedAt: '2026-09-24T00:00:00.000Z', cloudUpdatedAt: '2026-09-24T00:00:00.000Z' });
      }
      if (!String(url).endsWith('/record-sync')) return Response.json({ ...record, id: record.syncRecordId, cloudUpdatedAt: '2026-09-23T00:00:00.000Z' });
      getStarted.resolve();
      return releaseGet.promise;
    });

    const loading = getTreatmentList();
    await getStarted.promise;
    const deleting = deleteTreatment(record.id);
    // Allow the deletion to reach the shared lock while the older GET is held.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const requestsBeforeGetCompleted = [...requests];
    releaseGet.resolve(Response.json([{ ...record, id: record.syncRecordId, cloudUpdatedAt: '2026-09-23T00:00:00.000Z' }]));
    await Promise.all([loading, deleting]);

    expect(requestsBeforeGetCompleted).toEqual(['GET']);
    expect(requests).toEqual(['GET', 'GET', 'DELETE']);
    expect(existedAtCloudDelete).toBe(true);
    expect(await getAllRecords('treatments')).toEqual([]);
    if (requestLock) {
      expect(requestLock).toHaveBeenCalledTimes(2);
      expect(new Set(requestLock.mock.calls.map(([name]) => name)).size).toBe(1);
    }
  });

  it.each(['token', 'farm'])('削除の待機中に%sが変わった場合は両農場の同じIDの記録を保持する', async (changed) => {
    syncContext.user = farmA;
    const record = await seedTreatment();
    const otherRecord = { ...record, note: '別農場の同じIDの記録' };
    await seedOtherFarm(otherRecord);
    const getStarted = deferred<void>();
    const releaseGet = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === 'DELETE') return Response.json({});
      getStarted.resolve();
      return releaseGet.promise;
    });

    const loadingResult = getTreatmentList().catch((error: unknown) => error);
    await getStarted.promise;
    const deletionResult = deleteTreatment(record.id).catch((error: unknown) => error);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (changed === 'token') syncContext.token = 'replacement-token';
    else syncContext.user = farmB;
    releaseGet.resolve(Response.json([{ ...record, id: record.syncRecordId, cloudUpdatedAt: '2026-09-23T00:00:00.000Z' }]));
    const [failure, readFailure] = await Promise.all([deletionResult, loadingResult]);

    expect(failure).toBeInstanceOf(Error);
    expect(readFailure).toBeInstanceOf(Error);
    expect(await readFarm(farmA)).toEqual([record]);
    expect(await readFarm(farmB)).toEqual([otherRecord]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('DELETE送信後の応答待ちに農場が変わっても切替先の同じIDを削除しない', async () => {
    syncContext.user = farmA;
    const record = await seedTreatment();
    const otherRecord = { ...record, note: '切替先の農場の記録' };
    await seedOtherFarm(otherRecord);
    const deleteStarted = deferred<void>();
    const releaseDelete = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method !== 'DELETE') return Response.json({ ...record, id: record.syncRecordId });
      deleteStarted.resolve();
      return releaseDelete.promise;
    });

    const deletionResult = deleteTreatment(record.id).catch((error: unknown) => error);
    await deleteStarted.promise;
    syncContext.user = farmB;
    syncContext.token = 'farm-b-token';
    releaseDelete.resolve(Response.json({}));

    expect(await deletionResult).toBeInstanceOf(Error);
    expect(await readFarm(farmA)).toEqual([{ ...record, cloudSyncPending: true, treatmentSyncDeletePending: true }]);
    expect(await readFarm(farmB)).toEqual([otherRecord]);
    expect(fetch).toHaveBeenCalledWith(
      '/api/treatments/record-sync/treatment%3A123',
      expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
    );
  });

  it('端末に対象記録がなければ同じ数値IDを使ったクラウド削除を送らない', async () => {
    await deleteTreatment(123);

    expect(fetch).not.toHaveBeenCalled();
    expect(await getAllRecords('treatments')).toEqual([]);
  });

  it('保存中のPUT応答を反映してから削除し、遅い保存応答で記録を復活させない', async () => {
    const record = await seedTreatment();
    const putStarted = deferred<void>();
    const releasePut = deferred<Response>();
    const requests: string[] = [];
    let remote: Record<string, unknown> = { ...record, id: record.syncRecordId };
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const method = init?.method ?? 'GET';
      requests.push(method);
      if (method === 'PUT') {
        remote = { ...JSON.parse(String(init?.body)), cloudUpdatedAt: '2026-09-23T00:00:00.000Z' };
        putStarted.resolve();
        return releasePut.promise;
      }
      if (method === 'DELETE') return Response.json({ ...remote, deletedAt: '2026-09-24T00:00:00.000Z', cloudUpdatedAt: '2026-09-24T00:00:00.000Z' });
      return Response.json(remote);
    });

    const saving = updateTreatment(record.id, { ...record, note: '削除直前の編集' });
    await putStarted.promise;
    const deleting = deleteTreatment(record.id);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const requestsBeforePutCompleted = [...requests];
    releasePut.resolve(Response.json(remote));
    await Promise.all([saving, deleting]);

    expect(requestsBeforePutCompleted).toEqual(['GET', 'PUT']);
    expect(requests).toEqual(['GET', 'PUT', 'GET', 'DELETE']);
    expect(await getAllRecords('treatments')).toEqual([]);
  });

  it('PUT応答待ちに端末記録が別処理で消えた場合は保存応答で再作成せず経費更新へ進まない', async () => {
    const record = await seedTreatment();
    const putStarted = deferred<void>();
    const releasePut = deferred<Response>();
    let payload: Record<string, unknown> = {};
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method !== 'PUT') return Response.json({ ...record, id: record.syncRecordId });
      payload = JSON.parse(String(init.body));
      putStarted.resolve();
      return releasePut.promise;
    });
    const updateExpenseAfterSuccess = vi.fn();

    const saving = updateTreatment(record.id, { ...record, note: '応答待ちの編集' })
      .then(updateExpenseAfterSuccess).catch((error: unknown) => error);
    await putStarted.promise;
    await deleteRecord('treatments', record.id);
    releasePut.resolve(Response.json({ ...payload, id: record.syncRecordId, cloudUpdatedAt: '2026-09-23T00:00:00.000Z' }));

    expect(await saving).toBeInstanceOf(Error);
    expect(updateExpenseAfterSuccess).not.toHaveBeenCalled();
    expect(await getAllRecords('treatments')).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      '/api/treatments/record-sync/treatment%3A123',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('回復の次回予定を消して継続元と休薬日を保存・同期する', async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => init?.method === 'PUT' ? Response.json({
      ...JSON.parse(String(init.body)), cloudUpdatedAt: '2026-11-02T00:00:00.000Z',
    }) : new Response(null, { status: 404 }));

    await createTreatment({
      targetNumber: '6891', targetName: 'あいうえお', treatmentDate: '2026-10-05',
      symptom: '下痢', diagnosis: '', medicine: '', dosage: '', veterinarian: '', note: '',
      progress: '回復', nextScheduledDate: '2026-10-06', withdrawalEndDate: '2026-10-10',
      treatmentCourseId: 'treatment:123',
    });

    expect(await getAllRecords('treatments')).toEqual([expect.objectContaining({
      progress: '回復', nextScheduledDate: '', withdrawalEndDate: '2026-10-10', treatmentCourseId: 'treatment:123',
    })]);
    const request = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PUT')![1]!;
    expect(JSON.parse(String(request.body))).toMatchObject({ treatmentCourseId: 'treatment:123', nextScheduledDate: '' });
  });

  it('クラウドから読み込んだ継続元を端末でも保持する', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json([{
      id: 'treatment:456', targetNumber: '6891', treatmentDate: '2026-10-05', progress: '回復', treatmentCourseId: 'treatment:123',
    }]));

    const rows = await getTreatmentList();

    expect(rows).toEqual([expect.objectContaining({ syncRecordId: 'treatment:456', treatmentCourseId: 'treatment:123' })]);
    expect(await getAllRecords('treatments')).toEqual(rows);
  });
});
