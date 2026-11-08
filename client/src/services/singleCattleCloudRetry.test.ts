import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords, saveManyRecords } from '../storage/repository';
import { setCurrentFarmProPlanId } from '../plans/current-plan';
import { previewSingleCattleCloudRetry, retrySingleCattleCloudUpload } from './singleCattleCloudRetry';
import { pullNewerCattleRecordsFromCloud } from './api';
vi.mock('./authClient', () => ({ getAuthToken: () => 'test-token', getStoredAuthUser: () => null }));
const cow = { id: 13, identificationNumber: '1391057543', earTag: '5754', name: 'test-cow', birthday: '2026-01-04', sourceCalfId: 11 };
const cloud = { ...cow, id: `idn:${cow.identificationNumber}`, legacyId: 13, cloudUpdatedAt: '2026-10-17T00:00:00Z' };
const request = vi.fn();
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const snapshot = async () => Promise.all((['cattle', 'calves', 'breedings', 'sales'] as const).map(store => getAllRecords(store)));
beforeEach(async () => {
  for (const store of ['cattle', 'calves', 'breedings', 'sales'] as const) await clearStore(store);
  window.localStorage.clear(); setCurrentFarmProPlanId('pro'); request.mockReset(); vi.stubGlobal('fetch', request);
  await saveManyRecords('cattle', [cow]);
  await saveManyRecords('calves', [{ id: 11, identificationNumber: cow.identificationNumber }]);
  await saveManyRecords('breedings', [{ id: 'b1', cattleId: '13', cowEarTag: 'OTHER' }]);
  await saveManyRecords('sales', [{ id: 's1', cattleId: '13', cowId: 'OTHER' }]);
});
afterEach(() => vi.unstubAllGlobals());
it('sends one selected cattle through create-only without changing local cattle or histories', async () => {
  await saveManyRecords('cattle', [{ ...cow, id: 14, identificationNumber: 'OTHER', earTag: 'OTHER' }]);
  const before = await snapshot();
  request.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response(cloud, 201));
  await expect(retrySingleCattleCloudUpload(cow.identificationNumber, 13)).resolves.toMatchObject({ syncId: cloud.id });
  expect(request.mock.calls.map(([url]) => url)).toEqual(['/api/cattle/record-sync', '/api/cattle/record-sync/create-only']);
  expect(JSON.parse(request.mock.calls[1][1].body)).toMatchObject({ id: cloud.id, legacyId: 13 });
  expect(request.mock.calls[1][1].headers.Authorization).toBe('Bearer test-token');
  expect(await snapshot()).toEqual(before);
});
it.each([
  { id: 'legacy:99', identificationNumber: cow.identificationNumber, earTag: 'OTHER' },
  { id: 'legacy:99', identificationNumber: 'OTHER', earTag: cow.earTag },
  { id: cloud.id, identificationNumber: 'OTHER', earTag: 'OTHER' },
  { id: 'legacy:99', identificationNumber: cow.identificationNumber, deletedAt: '2026-10-17' },
])('blocks existing cloud identity including tombstones: %j', async conflict => {
  request.mockResolvedValue(response([conflict])); const before = await snapshot();
  await expect(retrySingleCattleCloudUpload(cow.identificationNumber, 13)).rejects.toThrow('自動送信を禁止');
  expect(request).toHaveBeenCalledTimes(1); expect(await snapshot()).toEqual(before);
});
it('rejects another local ID, duplicate identifiers, and unsupported plan', async () => {
  request.mockResolvedValue(response([]));
  await expect(retrySingleCattleCloudUpload(cow.identificationNumber, 12)).rejects.toThrow('端末内ID');
  await saveManyRecords('cattle', [{ ...cow, id: 14 }]);
  await expect(previewSingleCattleCloudRetry(cow.identificationNumber)).rejects.toThrow('1頭だけ');
  setCurrentFarmProPlanId('free');
  await expect(previewSingleCattleCloudRetry(cow.identificationNumber)).rejects.toThrow('契約プラン');
  expect(request).toHaveBeenCalledTimes(1);
});
it('rejects a mismatched persisted sync ID', async () => {
  await saveManyRecords('cattle', [{ ...cow, syncId: 'idn:OTHER' }]); request.mockResolvedValue(response([]));
  await expect(retrySingleCattleCloudUpload(cow.identificationNumber, 13)).rejects.toThrow('同期ID');
  expect(request).toHaveBeenCalledTimes(1);
});
it('rechecks local changes made during cloud lookup', async () => {
  request.mockImplementation(async () => { await saveManyRecords('cattle', [{ ...cow, earTag: 'CHANGED' }]); return response([]); });
  await expect(retrySingleCattleCloudUpload(cow.identificationNumber, 13)).rejects.toThrow('対象個体が変わりました');
  expect(request).toHaveBeenCalledTimes(1);
});
it('lookup failure performs no send or local mutation', async () => {
  const before = await snapshot(); request.mockRejectedValue(new Error('offline'));
  await expect(retrySingleCattleCloudUpload(cow.identificationNumber, 13)).rejects.toThrow('offline');
  expect(request).toHaveBeenCalledTimes(1); expect(await snapshot()).toEqual(before);
});
it.each([409, 500])('rejected send preserves all local data (%s)', async status => {
  const before = await snapshot(); request.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({ message: 'rejected' }, status));
  await expect(retrySingleCattleCloudUpload(cow.identificationNumber, 13)).rejects.toThrow('rejected');
  expect(await snapshot()).toEqual(before);
});
it('lost response after commit cannot cause blind resend', async () => {
  const before = await snapshot(); request.mockResolvedValueOnce(response([])).mockRejectedValueOnce(new Error('response lost'));
  await expect(retrySingleCattleCloudUpload(cow.identificationNumber, 13)).rejects.toThrow('response lost');
  request.mockResolvedValueOnce(response([cloud]));
  await expect(retrySingleCattleCloudUpload(cow.identificationNumber, 13)).rejects.toThrow('自動送信を禁止');
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  expect(await snapshot()).toEqual(before);
});
it('wrong server identity is not acknowledged and leaves IndexedDB unchanged', async () => {
  const before = await snapshot(); request.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({ ...cloud, id: 'wrong' }, 201));
  await expect(retrySingleCattleCloudUpload(cow.identificationNumber, 13)).rejects.toThrow('サーバーの同期ID');
  expect(await snapshot()).toEqual(before);
});
it('receiving device allocates its own cattle ID and resolves calf by individual identifier', async () => {
  await clearStore('cattle');
  await saveManyRecords('cattle', [{ ...cow, name: 'other', earTag: '9999', identificationNumber: '9999999999' }]);
  await saveManyRecords('calves', [{ id: 11, identificationNumber: 'OTHER' }, { id: 42, identificationNumber: cow.identificationNumber }]);
  const before = await snapshot(); request.mockResolvedValue(response([cloud]));
  expect(await pullNewerCattleRecordsFromCloud()).toBe(1);
  const cattle = await getAllRecords('cattle');
  expect(cattle.find(c => c.id === 13)?.name).toBe('other');
  expect(cattle.find(c => c.identificationNumber === cow.identificationNumber)).toMatchObject({ id: 14, sourceCalfId: 42 });
  expect((await snapshot()).slice(1)).toEqual(before.slice(1));
});
it.each([[[]], [[{ id: 11, identificationNumber: 'OTHER' }]], [[
  { id: 11, identificationNumber: cow.identificationNumber }, { id: 42, identificationNumber: cow.identificationNumber },
]]])('does not import an unverified remote calf pointer: %j', async calves => {
  await clearStore('calves'); await saveManyRecords('calves', calves); request.mockResolvedValue(response([cloud]));
  await pullNewerCattleRecordsFromCloud(); expect((await getAllRecords('cattle'))[0].sourceCalfId).toBeUndefined();
});
it.each([false, true])('skips conflicting individual number even on deletion (%s)', async deleted => {
  const before = await snapshot(); request.mockResolvedValue(response([{ ...cloud, identificationNumber: 'OTHER', id: 'idn:OTHER',
    ...(deleted ? { deletedAt: '2026-10-17T00:00:00Z' } : {}) }]));
  expect(await pullNewerCattleRecordsFromCloud()).toBe(0); expect(await snapshot()).toEqual(before);
});
it('does not choose an arbitrary record when local individual numbers are duplicated', async () => {
  await saveManyRecords('cattle', [{ ...cow, id: 14 }]); const before = await snapshot(); request.mockResolvedValue(response([cloud]));
  expect(await pullNewerCattleRecordsFromCloud()).toBe(0); expect(await snapshot()).toEqual(before);
});
