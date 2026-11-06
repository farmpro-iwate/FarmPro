import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as repository from '../storage/repository';
import type { StoredRecord, StoreName } from '../storage/types';
import { createFeedInventory, emptyFeedInventoryInput, type FeedInventoryRecord } from './feedInventoryApi';

const session = vi.hoisted(() => ({
  user: { id: 'fixture-owner-a', farmId: 'fixture-document-farm-a' } as { id: string; farmId: string } | null,
  token: 'fixture-token-a' as string | null,
}));
vi.mock('./authClient', () => ({
  getAuthToken: () => session.token,
  getStoredAuthUser: () => session.user,
}));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => 'standard' }));

const owner = { farmId: 'fixture-document-farm-a', userId: 'fixture-owner-a' };
const otherFarm = 'fixture-document-farm-b';
const input = { ...emptyFeedInventoryInput, transactionDate: '2026-11-01', feedName: '検証用の飼料',
  quantity: '2', unit: 'kg', totalPrice: '220', taxRate: '10' as const, taxExcludedPrice: '200', taxAmount: '20' };
type Row = FeedInventoryRecord & { cloudSyncPending?: boolean; cloudUpdatedAt?: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}

function changeSession(kind: 'farm' | 'user' | 'token' | 'logout') {
  if (kind === 'farm') session.user = { id: 'fixture-owner-b', farmId: otherFarm };
  if (kind === 'user') session.user = { id: 'fixture-owner-b', farmId: owner.farmId };
  if (kind === 'token') session.token = 'fixture-token-b';
  if (kind === 'logout') { session.user = null; session.token = null; }
}

async function rowsForFarm(farmId: string) {
  const previous = session.user;
  session.user = { id: owner.userId, farmId };
  try { return await repository.getAllRecords<Row>('feedInventory'); }
  finally { session.user = previous; }
}

function cloudResponse() {
  const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
  return Response.json({ ...body, cloudUpdatedAt: '2026-11-01T12:00:00.000Z' });
}

async function expectOriginalPending(saved: FeedInventoryRecord) {
  expect(await rowsForFarm(owner.farmId)).toEqual([expect.objectContaining({
    id: saved.id, feedName: input.feedName, cloudSyncPending: true,
  })]);
  expect((await rowsForFarm(owner.farmId))[0].cloudUpdatedAt).toBeUndefined();
  expect(await rowsForFarm(otherFarm)).toEqual([]);
}

beforeEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear(); sessionStorage.clear();
  session.token = 'fixture-token-a';
  for (const farmId of [owner.farmId, otherFarm]) {
    session.user = { id: owner.userId, farmId };
    await repository.clearStore('feedInventory');
  }
  session.user = { id: owner.userId, farmId: owner.farmId };
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(async () => cloudResponse()));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('document import save ownership', () => {
  it.each(['farm', 'user', 'logout'] as const)('rejects a changed %s before writing any local record', async kind => {
    changeSession(kind);
    const save = vi.spyOn(repository, 'saveRecord');
    await expect(createFeedInventory(input, owner)).rejects.toThrow(/農場または利用者が変わりました/);
    expect(save).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(await rowsForFarm(owner.farmId)).toEqual([]);
    expect(await rowsForFarm(otherFarm)).toEqual([]);
  });

  it('keeps the normal save and cloud acknowledgement when the owner and token are unchanged', async () => {
    const saved = await createFeedInventory(input, owner);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/feed-inventory\/record-sync\//),
      expect.objectContaining({ method: 'PUT', headers: {
        'Content-Type': 'application/json', Authorization: 'Bearer fixture-token-a',
      } }));
    expect(await rowsForFarm(owner.farmId)).toEqual([expect.objectContaining({
      id: saved.id, cloudSyncPending: false, cloudUpdatedAt: '2026-11-01T12:00:00.000Z',
    })]);
    expect(await rowsForFarm(otherFarm)).toEqual([]);
  });

  it.each(['farm', 'user', 'token', 'logout'] as const)('leaves the original local row pending if %s changes during local save', async kind => {
    const localSaved = deferred<FeedInventoryRecord>();
    const finishLocal = deferred<void>();
    const originalSave = repository.saveRecord;
    vi.spyOn(repository, 'saveRecord').mockImplementation(async function <T extends StoredRecord>(store: StoreName, record: T): Promise<T> {
      const saved = await originalSave(store, record);
      localSaved.resolve(saved as unknown as FeedInventoryRecord);
      await finishLocal.promise;
      return saved;
    });
    const acknowledgement = vi.spyOn(repository, 'saveRecordPreservingTimestamps');
    const pending = createFeedInventory(input, owner);
    const saved = await localSaved.promise;
    changeSession(kind);
    finishLocal.resolve();
    expect(await pending).toMatchObject({ id: saved.id });
    expect(fetch).not.toHaveBeenCalled();
    expect(acknowledgement).not.toHaveBeenCalled();
    await expectOriginalPending(saved);
  });

  it.each(['farm', 'user', 'token', 'logout'] as const)('does not write a cloud acknowledgement after %s changes during the PUT', async kind => {
    const sent = deferred<void>();
    const reply = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async () => { sent.resolve(); return reply.promise; });
    const acknowledgement = vi.spyOn(repository, 'saveRecordPreservingTimestamps');
    const pending = createFeedInventory(input, owner);
    await sent.promise;
    const response = cloudResponse();
    changeSession(kind);
    reply.resolve(response);
    const saved = await pending;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer fixture-token-a' });
    expect(acknowledgement).not.toHaveBeenCalled();
    await expectOriginalPending(saved);
  });

  it('also guards a login change while the cloud response body is arriving', async () => {
    const readingBody = deferred<void>();
    const body = deferred<unknown>();
    const response = new Response(null, { status: 200 });
    vi.spyOn(response, 'json').mockImplementation(async () => { readingBody.resolve(); return body.promise; });
    vi.mocked(fetch).mockResolvedValue(response);
    const acknowledgement = vi.spyOn(repository, 'saveRecordPreservingTimestamps');
    const pending = createFeedInventory(input, owner);
    await readingBody.promise;
    changeSession('farm');
    body.resolve({ id: 'fixture-cloud-ack', cloudUpdatedAt: '2026-11-01T12:00:00.000Z' });
    const saved = await pending;
    expect(acknowledgement).not.toHaveBeenCalled();
    await expectOriginalPending(saved);
  });
});
