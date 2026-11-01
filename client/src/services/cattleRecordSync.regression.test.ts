import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as repository from '../storage/repository';
import type { Cattle, CattleInput } from '../types/cattle';
import type { StoredRecord } from '../storage/types';
import { createCattle, deleteCattle, pullNewerCattleRecordsFromCloud, retryPendingCattleSync, updateCattle } from './api';
import { retrySingleCattleCloudUpload } from './singleCattleCloudRetry';
import type { AnimalSyncOrigin } from './animalRecordSyncSafety';
import { sameCattleSyncContent } from './cattleRecordSyncApi';

const environment = vi.hoisted(() => ({
  planId: 'standard', token: 'fixture-cattle-token',
  user: { id: 'fixture-cattle-user', farmId: 'fixture-cattle-farm', plan: 'standard' },
}));

vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => environment.planId }));
vi.mock('../plans/policy', () => ({
  getFarmProPlan: () => ({ multiDeviceSync: environment.planId !== 'free' }),
  canRegisterBreedingFemale: () => true,
}));
vi.mock('./authClient', () => ({
  getAuthToken: () => environment.token,
  getStoredAuthUser: () => environment.user,
}));

type LocalCattle = Cattle & StoredRecord & {
  syncId?: string; cloudUpdatedAt?: string; cloudSyncPending?: boolean;
  animalSyncOrigin?: AnimalSyncOrigin; syncWarning?: string;
};
type CloudCattle = Omit<LocalCattle, 'id'> & { id: string };
type Request = { path: string; method: string; headers: Headers; record?: CloudCattle };
const syncId = 'idn:1234567890';
const original: LocalCattle = {
  id: 7, syncId, earTag: 'FIXTURE-7', identificationNumber: '1234567890', name: '試験牛',
  birthday: '2023-01-01', sex: '雌', sire: '試験父', dam: '試験母', parity: 1,
  blvStatus: '未検査', stage: '繁殖牛', note: '同期済みの原本',
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  cloudUpdatedAt: '2026-10-01T00:00:00.000Z',
};

function input(changes: Partial<CattleInput> = {}): CattleInput {
  return {
    earTag: original.earTag, identificationNumber: original.identificationNumber!, name: original.name,
    birthday: original.birthday, sex: original.sex, sire: original.sire, dam: original.dam,
    parity: original.parity, blvStatus: original.blvStatus, stage: original.stage, note: original.note,
    ...changes,
  };
}
function json(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function resetContext() {
  environment.planId = 'standard';
  environment.token = 'fixture-cattle-token';
  environment.user = { id: 'fixture-cattle-user', farmId: 'fixture-cattle-farm', plan: 'standard' };
  window.history.replaceState(null, '', '/cattle');
}
function useCloud() {
  let revision = 0;
  const server = {
    records: new Map<string, CloudCattle>([[syncId, { ...original, id: syncId, legacyId: original.id }]]),
    requests: [] as Request[],
    handler: undefined as undefined | ((request: Request) => Response | undefined | Promise<Response | undefined>),
    serve(request: Request): Response {
      if (request.path === '/api/cattle/record-sync' && request.method === 'GET') return json([...server.records.values()]);
      if (request.path.startsWith('/api/cattle/record-sync/') && (request.method === 'PUT' || request.method === 'POST') && request.record) {
        const existing = server.records.get(request.record.id);
        const ifMatch = request.headers.get('If-Match')?.replace(/^"|"$/g, '');
        if ((request.headers.get('If-None-Match') === '*' || request.method === 'POST') && existing) return json({ message: 'fixture: already exists' }, 412);
        if (ifMatch && ifMatch !== existing?.cloudUpdatedAt) return json({ message: 'fixture: version changed' }, 412);
        if (existing?.deletedAt) return json({ message: 'fixture: record deleted' }, 409);
        const saved = { ...request.record, cloudUpdatedAt: new Date(Date.parse('2026-11-01T12:00:00.000Z') + ++revision).toISOString() };
        server.records.set(saved.id, saved);
        return json(saved);
      }
      if (request.method === 'DELETE') {
        const id = decodeURIComponent(request.path.slice('/api/cattle/record-sync/'.length));
        const existing = server.records.get(id);
        const ifMatch = request.headers.get('If-Match')?.replace(/^"|"$/g, '');
        if (ifMatch && ifMatch !== existing?.cloudUpdatedAt) return json({ message: 'fixture: version changed' }, 412);
        const time = new Date(Date.parse('2026-11-01T13:00:00.000Z') + ++revision).toISOString();
        const deleted = { ...existing, id, deletedAt: time, cloudUpdatedAt: time } as CloudCattle;
        server.records.set(id, deleted);
        return json(deleted);
      }
      throw new Error(`Unexpected fixture request: ${request.method} ${request.path}`);
    },
  };
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const request: Request = { path: String(url), method: init?.method || 'GET', headers: new Headers(init?.headers),
      ...(init?.body ? { record: JSON.parse(String(init.body)) as CloudCattle } : {}) };
    server.requests.push(request);
    return await server.handler?.(request) ?? server.serve(request);
  }));
  return server;
}
async function createPending(server: ReturnType<typeof useCloud>): Promise<LocalCattle> {
  server.handler = () => { throw new TypeError('fixture: offline'); };
  const saved = await createCattle(input({ identificationNumber: '1111111111', earTag: 'FIXTURE-NEW', name: '新規試験牛' }));
  expect(saved.cloudSyncPending).toBe(true);
  server.handler = undefined;
  return saved;
}
async function read() { return repository.getRecordById<LocalCattle>('cattle', original.id); }
async function switchToOtherFarm() {
  environment.user = { id: 'fixture-other-user', farmId: 'fixture-other-cattle-farm', plan: 'standard' };
  environment.token = 'fixture-other-cattle-token';
  await repository.clearStore('cattle');
  await repository.clearStore('calves');
  const other: LocalCattle = {
    ...original, syncId: 'idn:9876543210', identificationNumber: '9876543210',
    earTag: 'OTHER-7', name: '別農場の牛', note: '別農場で保持する原本',
  };
  await repository.saveRecordPreservingTimestamps('cattle', other);
  return other;
}

beforeEach(async () => {
  resetContext();
  window.localStorage.clear();
  await repository.clearStore('cattle');
  await repository.clearStore('calves');
  await repository.saveRecordPreservingTimestamps('cattle', original);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); resetContext(); });

describe('ordinary cattle sync safety boundaries', () => {
  it('preserves a Free edit after returning to Standard without assigning automatic upload ownership', async () => {
    const server = useCloud();
    environment.planId = 'free';
    const saved = await updateCattle(String(original.id), input({ note: 'Freeで保存した編集' }));
    expect(server.requests).toEqual([]);
    expect(saved.animalSyncOrigin).toBeUndefined();
    expect(saved.animalSyncBase).toBeUndefined();
    expect(saved.animalSyncAttempt).toBeUndefined();
    environment.planId = 'standard';
    expect(await retryPendingCattleSync()).toBe(0);
    expect(server.requests).toEqual([]);
    server.records.set(syncId, { ...server.records.get(syncId)!, note: '古いクラウド内容', cloudUpdatedAt: '2030-11-01T00:00:00.000Z' });
    await pullNewerCattleRecordsFromCloud();
    expect(await read()).toMatchObject({ note: 'Freeで保存した編集', cloudSyncPending: true });
    expect(server.requests.map(request => request.method)).toEqual(['GET']);
  });

  it('removes paid retry ownership from a later Free edit and keeps that edit local after upgrading', async () => {
    const server = useCloud();
    server.handler = request => {
      if (request.method === 'PUT') throw new TypeError('fixture: offline');
      return undefined;
    };
    const paid = await updateCattle(String(original.id), input({ note: '有料時の未送信編集' }));
    expect(paid.animalSyncOrigin).toBeDefined();
    expect(paid.animalSyncBase).toBeDefined();
    expect(paid.animalSyncAttempt).toBeDefined();
    server.requests.length = 0;
    environment.planId = 'free';
    const saved = await updateCattle(String(original.id), input({ note: 'その後Freeで保存した編集' }));
    expect(saved).toMatchObject({ cloudSyncPending: true, note: 'その後Freeで保存した編集' });
    expect(saved.animalSyncOrigin).toBeUndefined();
    expect(saved.animalSyncBase).toBeUndefined();
    expect(saved.animalSyncAttempt).toBeUndefined();
    environment.planId = 'standard';
    expect(await retryPendingCattleSync()).toBe(0);
    expect(server.requests).toEqual([]);
    expect(await read()).toEqual(saved);
  });

  it.each([
    { confirmedAt: undefined, deleted: false },
    { confirmedAt: original.cloudUpdatedAt, deleted: false },
    { confirmedAt: undefined, deleted: true },
    { confirmedAt: original.cloudUpdatedAt, deleted: true },
  ])('preserves a legacy unsent edit before pending flags: confirmed=$confirmedAt deleted=$deleted', async ({ confirmedAt, deleted }) => {
    const local = { ...original, note: '旧版で保存した未送信編集', cloudUpdatedAt: confirmedAt, updatedAt: '2026-10-31T00:00:00.000Z' };
    await repository.saveRecordPreservingTimestamps('cattle', local);
    const server = useCloud();
    server.records.set(syncId, { ...server.records.get(syncId)!, cloudUpdatedAt: '2030-11-01T00:00:00.000Z',
      ...(deleted ? { deletedAt: '2030-11-01T00:00:00.000Z' } : {}) });
    await pullNewerCattleRecordsFromCloud();
    expect(await read()).toEqual(local);
  });

  it.each(['edit', 'delete'] as const)('does not undo another local writer %s while GET is pending', async action => {
    const server = useCloud();
    const response = deferred<Response>();
    const started = deferred<void>();
    server.handler = request => {
      if (request.method === 'GET') { started.resolve(); return response.promise; }
    };
    const receiving = pullNewerCattleRecordsFromCloud();
    await started.promise;
    const changed = { ...original, note: '別タブの保存', updatedAt: '2026-10-31T00:00:00.000Z' };
    if (action === 'delete') await repository.deleteRecord('cattle', original.id);
    else await repository.saveRecordPreservingTimestamps('cattle', changed);
    response.resolve(json([{ ...original, id: syncId, legacyId: original.id, cloudUpdatedAt: '2030-11-01T00:00:00.000Z' }]));
    await receiving;
    expect(await repository.getAllRecords('cattle')).toEqual(action === 'delete' ? [] : [changed]);
  });

  it('acknowledges another device edit without copying its source calf ID from the server response', async () => {
    const server = useCloud();
    // Receiving cattle deliberately excludes the other device numeric calf ID.
    server.records.set(syncId, { ...server.records.get(syncId)!, sourceCalfId: 33 });
    server.handler = request => {
      if (request.method !== 'PUT' || !request.record) return;
      // The real server retains existing optional fields omitted from a PUT.
      const saved = { ...request.record, sourceCalfId: 33, cloudUpdatedAt: '2030-11-01T00:00:00.000Z' };
      server.records.set(syncId, saved);
      return json(saved);
    };
    const saved = await updateCattle(String(original.id), input({ note: 'スマホで編集した内容' }));
    expect(saved.cloudSyncPending).toBe(false);
    expect(saved.sourceCalfId).toBeUndefined();
    expect(await read()).toMatchObject({ note: 'スマホで編集した内容', cloudSyncPending: false });
    expect((await read())?.sourceCalfId).toBeUndefined();
    expect(server.records.get(syncId)?.sourceCalfId).toBe(33);
    expect(await retryPendingCattleSync()).toBe(0);
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'PUT']);
  });

  it('retains business fields and timestamps when excluding a device-specific calf link from content comparison', () => {
    const left = { ...original, id: syncId, sourceCalfId: 3, acquisitionPrice: 100000, customField: 'Keep all business content' };
    const right = { ...left, sourceCalfId: 33 };
    expect(sameCattleSyncContent(left, right)).toBe(true);
    expect(sameCattleSyncContent(left, { ...right, acquisitionPrice: 200000 })).toBe(false);
    expect(sameCattleSyncContent(left, { ...right, customField: 'Changed' })).toBe(false);
    expect(sameCattleSyncContent(left, { ...right, updatedAt: '2030-11-01T00:00:00.000Z' })).toBe(false);
  });

  it('preserves an unsent local edit when the next pull sees another device newer version', async () => {
    const server = useCloud();
    server.handler = request => {
      if (request.method === 'PUT') throw new TypeError('fixture: offline');
      return undefined;
    };
    await updateCattle(String(original.id), input({ note: '端末だけに保存した未送信の編集' }));
    const beforePull = await read();
    expect(beforePull?.note).toBe('端末だけに保存した未送信の編集');
    expect.soft(beforePull?.cloudSyncPending).toBe(true);

    const remote = { ...original, id: syncId, note: '別端末での正式な編集', cloudUpdatedAt: '2026-10-31T00:00:00.000Z' };
    server.records.set(syncId, remote);
    await pullNewerCattleRecordsFromCloud();

    expect(await read()).toEqual(beforePull);
    expect(server.records.get(syncId)).toEqual(remote);
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'PUT', 'GET']);
  });

  it('does not replace a later local edit with a delayed acknowledgement of an older PUT', async () => {
    const server = useCloud();
    const response = deferred<Response>();
    let acknowledgement: Response | undefined;
    server.handler = request => {
      if (request.method === 'PUT') { acknowledgement = server.serve(request); return response.promise; }
    };
    const saving = updateCattle(String(original.id), input({ note: '先に送信中の編集' }));
    const outcome = saving.catch(error => error);
    await vi.waitFor(() => expect(acknowledgement).toBeDefined());
    const newer = { ...original, note: '後から保存された未送信の編集', cloudSyncPending: true, updatedAt: '2026-11-01T12:30:00.000Z' };
    await repository.saveRecordPreservingTimestamps('cattle', newer);
    response.resolve(acknowledgement!);
    await outcome;

    expect(await read()).toEqual(newer);
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'PUT']);
  });

  it('does not import a delayed GET from the previous farm into the current farm', async () => {
    const server = useCloud();
    const response = deferred<Response>();
    server.handler = request => request.method === 'GET' ? response.promise : undefined;
    const pulling = pullNewerCattleRecordsFromCloud().catch(error => error);
    await vi.waitFor(() => expect(server.requests).toHaveLength(1));
    const other = await switchToOtherFarm();
    response.resolve(json([...server.records.values()]));
    const outcome = await pulling;

    expect.soft(await repository.getAllRecords('cattle')).toEqual([other]);
    expect(outcome).toBeInstanceOf(Error);
  });

  it('does not overwrite a different farm same local ID with a delayed PUT acknowledgement', async () => {
    const server = useCloud();
    const response = deferred<Response>();
    let acknowledgement: Response | undefined;
    server.handler = request => {
      if (request.method === 'PUT') { acknowledgement = server.serve(request); return response.promise; }
    };
    const saving = updateCattle(String(original.id), input({ note: '前の農場で送信中' })).catch(error => error);
    await vi.waitFor(() => expect(acknowledgement).toBeDefined());
    const other = await switchToOtherFarm();
    response.resolve(acknowledgement!);
    const outcome = await saving;

    expect.soft(await repository.getAllRecords('cattle')).toEqual([other]);
    expect(outcome).toBeInstanceOf(Error);
  });

  it('retries an owned offline creation once under the same ID and strips private metadata from the conditional PUT', async () => {
    const server = useCloud();
    const saved = await createPending(server);
    const rowCount = (await repository.getAllRecords('cattle')).length;
    expect(saved.animalSyncOrigin).toMatchObject({ version: 1, farmId: environment.user.farmId, userId: environment.user.id });
    expect(await retryPendingCattleSync()).toBe(1);
    expect(await retryPendingCattleSync()).toBe(0);
    const writes = server.requests.filter(request => request.method === 'PUT');
    expect(writes).toHaveLength(1);
    expect(writes[0].record?.id).toBe(saved.syncId);
    expect(writes[0].headers.get('If-None-Match')).toBe('*');
    for (const key of ['animalSyncOrigin', 'animalSyncBase', 'animalSyncAttempt', 'cloudSyncPending', 'syncWarning']) {
      expect(writes[0].record).not.toHaveProperty(key);
    }
    const local = await repository.getRecordById<LocalCattle>('cattle', saved.id);
    expect(local).toMatchObject({ id: saved.id, note: saved.note, cloudSyncPending: false });
    expect(local).not.toHaveProperty('animalSyncOrigin');
    expect(local).not.toHaveProperty('animalSyncBase');
    expect(local).not.toHaveProperty('animalSyncAttempt');
    expect(await repository.getAllRecords('cattle')).toHaveLength(rowCount);
    expect(server.records.size).toBe(2);
  });

  it('acknowledges an exactly matching lost PUT response from GET without uploading again', async () => {
    const server = useCloud();
    server.handler = request => {
      if (request.method !== 'PUT') return undefined;
      server.serve(request);
      throw new TypeError('fixture: response lost');
    };
    const saved = await updateCattle(String(original.id), input({ note: '応答だけ失った正式保存' }));
    expect(saved.cloudSyncPending).toBe(true);
    expect(saved.animalSyncAttempt).toBeDefined();
    server.handler = undefined;
    expect(await retryPendingCattleSync()).toBe(1);
    expect(await read()).toMatchObject({ note: '応答だけ失った正式保存', cloudSyncPending: false });
    expect(server.requests.filter(request => request.method === 'PUT')).toHaveLength(1);
  });

  it('uses the reached attempt revision when the user edits again after a lost response', async () => {
    const server = useCloud();
    server.handler = request => {
      if (request.method !== 'PUT') return undefined;
      server.serve(request);
      throw new TypeError('fixture: response lost');
    };
    await updateCattle(String(original.id), input({ note: '到達済みの前の編集' }));
    const reachedVersion = server.records.get(syncId)!.cloudUpdatedAt;
    server.handler = undefined;
    const saved = await updateCattle(String(original.id), input({ note: '応答喪失後の正式な再編集' }));
    expect(saved.cloudSyncPending).toBe(false);
    expect(server.records.get(syncId)?.note).toBe('応答喪失後の正式な再編集');
    const writes = server.requests.filter(request => request.method === 'PUT');
    expect(writes).toHaveLength(2);
    expect(writes[1].headers.get('If-Match')).toBe(JSON.stringify(reachedVersion));
  });

  it('holds a pending edit when another device changes the cloud before the retry', async () => {
    const server = useCloud();
    server.handler = request => {
      if (request.method === 'PUT') throw new TypeError('fixture: offline');
      return undefined;
    };
    const saved = await updateCattle(String(original.id), input({ note: 'PCの未送信の変更' }));
    const remote = { ...server.records.get(syncId)!, note: '他端末の変更を守る', cloudUpdatedAt: '2026-11-01T14:00:00.000Z' };
    server.records.set(syncId, remote);
    server.handler = undefined;
    expect(await retryPendingCattleSync()).toBe(0);
    expect(await read()).toMatchObject({ id: saved.id, note: saved.note, cloudSyncPending: true });
    expect(server.records.get(syncId)).toEqual(remote);
    expect(server.requests.filter(request => request.method === 'PUT')).toHaveLength(1);
  });

  it('does not fall back to an unconditional PUT after a concurrent version change returns 412', async () => {
    const server = useCloud();
    server.handler = request => {
      if (request.method !== 'PUT') return undefined;
      server.records.set(syncId, { ...server.records.get(syncId)!, note: 'GET直後の他端末変更', cloudUpdatedAt: '2026-11-01T14:00:00.000Z' });
      return server.serve(request);
    };
    const saved = await updateCattle(String(original.id), input({ note: 'PCの正式編集' }));
    expect(saved).toMatchObject({ note: 'PCの正式編集', cloudSyncPending: true });
    expect(server.records.get(syncId)?.note).toBe('GET直後の他端末変更');
    expect(server.requests.filter(request => request.method === 'PUT')).toHaveLength(1);
    expect(saved.syncWarning).toContain('version changed');
  });

  it.each(['equal', 'different'] as const)('allows an unknown legacy baseline only when its complete pre-edit content is %s', async match => {
    const server = useCloud();
    const { cloudUpdatedAt: _time, ...legacy } = original;
    await repository.saveRecordPreservingTimestamps('cattle', legacy);
    if (match === 'different') server.records.set(syncId, { ...server.records.get(syncId)!, note: '未確認のクラウド変更' });
    const saved = await updateCattle(String(original.id), input({ note: '今回の編集' }));
    expect(saved.cloudSyncPending).toBe(match === 'different');
    const writes = server.requests.filter(request => request.method === 'PUT');
    expect(writes).toHaveLength(match === 'equal' ? 1 : 0);
    if (match === 'equal') expect(writes[0].headers.get('If-Match')).toBe(JSON.stringify(original.cloudUpdatedAt));
    else expect(server.records.get(syncId)?.note).toBe('未確認のクラウド変更');
  });

  it.each(['legacy', 'foreign-owner', 'foreign-farm', 'foreign-user'] as const)('does not automatically upload %s pending records', async kind => {
    const server = useCloud();
    const saved = await createPending(server);
    const changed = { ...saved };
    if (kind === 'legacy') delete changed.animalSyncOrigin;
    else changed.animalSyncOrigin = { ...saved.animalSyncOrigin!,
      ...(kind === 'foreign-owner' ? { ownerId: 'other-browser' } : kind === 'foreign-farm' ? { farmId: 'other-farm' } : { userId: 'other-user' }) };
    await repository.saveRecordPreservingTimestamps('cattle', changed);
    server.requests.length = 0;
    expect(await retryPendingCattleSync()).toBe(0);
    expect(server.requests).toEqual([]);
    expect(await repository.getRecordById('cattle', saved.id)).toEqual(changed);
  });

  it.each(['GET', 'PUT'] as const)('holds automatic work if the page changes to backup while %s is delayed', async method => {
    const server = useCloud();
    const saved = await createPending(server);
    const response = deferred<Response>();
    let held: Request | undefined;
    server.handler = request => { if (request.method === method) { held = request; return response.promise; } };
    const retry = retryPendingCattleSync();
    await vi.waitFor(() => expect(held).toBeDefined());
    window.history.replaceState(null, '', '/backups');
    response.resolve(server.serve(held!));
    expect(await retry).toBe(0);
    expect(await repository.getRecordById('cattle', saved.id)).toMatchObject({ cloudSyncPending: true, note: saved.note });
    expect(server.requests.filter(request => request.method === 'PUT')).toHaveLength(method === 'PUT' ? 1 : 0);
  });

  it('keeps an owned pending edit when receiving a newer cloud tombstone', async () => {
    const server = useCloud();
    server.handler = () => { throw new TypeError('fixture: offline'); };
    const pending = await updateCattle(String(original.id), input({ note: '未送信の編集を残す' }));
    server.handler = undefined;
    server.records.set(syncId, { ...server.records.get(syncId)!, deletedAt: '2099-01-01T00:00:00.000Z', cloudUpdatedAt: '2099-01-01T00:00:00.000Z' });
    await pullNewerCattleRecordsFromCloud();
    expect(await read()).toEqual(pending);
    expect(await retryPendingCattleSync()).toBe(0);
    expect(await read()).toMatchObject({ note: pending.note, cloudSyncPending: true });
    expect(server.requests.filter(request => request.method === 'PUT')).toHaveLength(0);
  });

  it('deletes a pending initial upload only after confirming its cloud tombstone and preserves it on failure', async () => {
    const server = useCloud();
    const saved = await createPending(server);
    server.handler = request => {
      if (request.method === 'DELETE') throw new TypeError('fixture: delete offline');
      return undefined;
    };
    await expect(deleteCattle(saved.id)).rejects.toThrow('delete offline');
    expect(await repository.getRecordById('cattle', saved.id)).toEqual(saved);
    server.handler = undefined;
    await deleteCattle(saved.id);
    expect(await repository.getRecordById('cattle', saved.id)).toBeUndefined();
    expect(server.records.get(saved.syncId!)?.deletedAt).toBeTruthy();
    await pullNewerCattleRecordsFromCloud();
    expect(await repository.getRecordById('cattle', saved.id)).toBeUndefined();
  });

  it('keeps single-cattle create-only retry metadata consistent without changing business content', async () => {
    const server = useCloud();
    server.records.delete(syncId);
    const result = await retrySingleCattleCloudUpload(original.identificationNumber!, original.id);
    expect(result.syncId).toBe(syncId);
    expect(await read()).toEqual({ ...original, cloudUpdatedAt: result.cloudUpdatedAt, cloudSyncPending: false });
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'POST']);
  });

  it('does not claim a successful single-cattle retry when business content changed during POST', async () => {
    const server = useCloud();
    server.records.delete(syncId);
    const response = deferred<Response>();
    let held: Request | undefined;
    server.handler = request => { if (request.method === 'POST') { held = request; return response.promise; } };
    const retry = retrySingleCattleCloudUpload(original.identificationNumber!, original.id).catch(error => error);
    await vi.waitFor(() => expect(held).toBeDefined());
    const changed = { ...original, acquisitionPrice: 900000, note: '送信中に変更された業務内容' };
    await repository.saveRecordPreservingTimestamps('cattle', changed);
    response.resolve(server.serve(held!));
    expect(await retry).toBeInstanceOf(Error);
    expect(await read()).toEqual(changed);
  });

  it.each([
    { stable: true, deleted: false }, { stable: true, deleted: true },
    { stable: false, deleted: false }, { stable: false, deleted: true },
  ])('does not bind or delete another cow with the same ear tag: stable=$stable, deleted=$deleted', async ({ stable, deleted }) => {
    const local = { ...original, syncId: stable ? syncId : undefined, earTag: '6613' };
    await repository.saveRecordPreservingTimestamps('cattle', local);
    const server = useCloud();
    const remote: CloudCattle = {
      ...original, id: 'idn:2222222222', syncId: 'idn:2222222222',
      identificationNumber: '2222222222', earTag: '6613', name: '別の個体',
      updatedAt: '2026-11-01T00:00:00.000Z', cloudUpdatedAt: '2026-11-01T00:00:00.000Z',
      ...(deleted ? { deletedAt: '2026-11-01T00:00:00.000Z' } : {}),
    };
    server.records.clear();
    server.records.set(remote.id, remote);
    expect(await pullNewerCattleRecordsFromCloud()).toBe(0);
    expect(await repository.getAllRecords('cattle')).toEqual([local]);
    expect(server.records.get(remote.id)).toEqual(remote);
    expect(server.requests.map(request => request.method)).toEqual(['GET']);
  });

  it('does not replace a confirmed synchronization ID merely because another cloud ID has the same identification number', async () => {
    const server = useCloud();
    const remote = { ...original, id: 'legacy:another-cow', syncId: 'legacy:another-cow', cloudUpdatedAt: '2026-11-01T00:00:00.000Z' };
    server.records.clear();
    server.records.set(remote.id, remote);
    expect(await pullNewerCattleRecordsFromCloud()).toBe(0);
    expect(await repository.getAllRecords('cattle')).toEqual([original]);
  });

  it('receives an explicit ear-tag and identification correction for the same confirmed synchronization ID', async () => {
    const server = useCloud();
    server.records.set(syncId, { ...original, id: syncId, earTag: 'CORRECTED-7', identificationNumber: '2222222222',
      updatedAt: '2026-11-01T00:00:00.000Z', cloudUpdatedAt: '2026-11-01T00:00:00.000Z' });
    expect(await pullNewerCattleRecordsFromCloud()).toBe(1);
    expect(await read()).toMatchObject({ id: original.id, syncId, earTag: 'CORRECTED-7', identificationNumber: '2222222222' });
    expect(await repository.getAllRecords('cattle')).toHaveLength(1);
  });

  it('identifies a legacy row by its matching identification number while receiving an ear-tag correction', async () => {
    await repository.saveRecordPreservingTimestamps('cattle', { ...original, syncId: undefined });
    const server = useCloud();
    server.records.set(syncId, { ...original, id: syncId, earTag: 'CORRECTED-7',
      updatedAt: '2026-11-01T00:00:00.000Z', cloudUpdatedAt: '2026-11-01T00:00:00.000Z' });
    expect(await pullNewerCattleRecordsFromCloud()).toBe(1);
    expect(await read()).toMatchObject({ id: original.id, syncId, earTag: 'CORRECTED-7', identificationNumber: original.identificationNumber });
    expect(await repository.getAllRecords('cattle')).toHaveLength(1);
  });
});
