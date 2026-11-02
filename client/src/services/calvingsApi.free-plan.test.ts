import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, deleteRecord, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import {
  createCalving, dismissCalfRecoveryCandidate, fetchCalvingsReadOnly,
  pullNewerCalvingRecordsFromCloud as pullForPlans, registerCalvingToCalfLedger,
  updateCalving, type CalvingRecord,
} from './calvingsApi';
import { pullNewerCalvingRecordsFromCloud as pullForList } from './calvingRecordSync';

const context = vi.hoisted(() => ({ plan: 'standard', token: 'calving-free-token', farmId: 'calving-free-farm' }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => context.plan }));
vi.mock('./authClient', () => ({ getAuthToken: () => context.token,
  getStoredAuthUser: () => ({ id: 'calving-free-user', farmId: context.farmId }) }));

type Row = CalvingRecord & StoredRecord & { id: string; deletedAt?: string; calvingSyncFreeEditPending?: boolean };
type RequestLog = { path: string; method: string; body?: Row };
type Fixture = {
  remote: Row | null; calls: RequestLog[]; failure?: '503' | 'lost ACK' | 'tombstone';
  afterPut?: (saved: Row) => Promise<void>;
};
const timeA = '2026-11-01T00:00:00.000Z';
const timeC = '2026-11-02T00:00:00.000Z';
const timeB = '2026-11-03T00:00:00.000Z';
const original: Row = {
  id: 'calving-free-original', cowId: 'CALVING-FREE-MOTHER', cowName: '母牛', calfName: 'CALVING-FREE-CALF',
  expectedCalvingDate: '2026-10-30', actualCalvingDate: '2026-10-31', calfSex: 'メス', birthWeightKg: 30,
  calvingResult: '自然分娩', colostrumStatus: '未確認', memo: '確認済み原本A', registeredToCalfLedger: false,
  futureClinical: { precision: '30.00', optional: null, records: ['未知項目'] },
  createdAt: timeA, updatedAt: timeA,
};
const freeInput: CalvingRecord = { ...original, memo: 'Freeで確認した原本C', colostrumStatus: '確認済み' };
const unrelatedStores = ['cattle', 'breedings', 'expenses', 'schedules'] as const;
let unrelatedBefore: StoredRecord[][];
const read = () => getRecordById<Row>('calvings', original.id);
const writes = (fixture: Fixture) => fixture.calls.filter(call => call.method !== 'GET');
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function serve(): Fixture {
  const fixture: Fixture = { remote: structuredClone(original), calls: [] };
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const request: RequestLog = { path: String(url), method: init?.method || 'GET',
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) };
    fixture.calls.push(request);
    if (request.path === '/api/calvings/record-sync' && request.method === 'GET') return Response.json(fixture.remote ? [fixture.remote] : []);
    if (!request.path.startsWith('/api/calvings/record-sync/') || request.method !== 'PUT') {
      throw new Error(`Unexpected non-calving side effect: ${request.method} ${request.path}`);
    }
    if (fixture.failure === '503') return Response.json({ message: '分娩同期を確認できません' }, { status: 503 });
    if (fixture.remote && Date.parse(request.body!.updatedAt!) < Date.parse(fixture.remote.updatedAt!)) {
      return Response.json({ message: '別端末に新しい分娩があります' }, { status: 409 });
    }
    fixture.remote = { ...fixture.remote, ...request.body!,
      ...(fixture.failure === 'tombstone' ? { deletedAt: timeB } : {}) };
    await fixture.afterPut?.(fixture.remote);
    if (fixture.failure === 'lost ACK') throw new TypeError('calving ACK lost');
    return Response.json(fixture.remote);
  }));
  return fixture;
}

beforeEach(async () => {
  Object.assign(context, { plan: 'standard', token: 'calving-free-token', farmId: 'calving-free-farm' });
  window.localStorage.clear(); window.sessionStorage.clear();
  for (const store of ['calvings', 'calves', 'metadata', ...unrelatedStores] as const) await clearStore(store);
  await saveRecordPreservingTimestamps('calvings', original);
  for (const store of unrelatedStores) await saveRecordPreservingTimestamps(store, {
    id: `${store}-unchanged`, data: { value: '1,200', optional: null }, createdAt: timeA, updatedAt: timeA,
  });
  unrelatedBefore = await Promise.all(unrelatedStores.map(store => getAllRecords(store)));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(timeC));
});
afterEach(async () => {
  expect(await Promise.all(unrelatedStores.map(store => getAllRecords(store)))).toEqual(unrelatedBefore);
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('calving Free edits retained until explicit paid save', () => {
  it.each([
    { operation: 'update', peer: 'live' }, { operation: 'update', peer: 'tombstone' },
    { operation: 'dismiss', peer: 'live' }, { operation: 'register', peer: 'live' },
  ])('protects a Free $operation from a newer peer $peer through both readers', async ({ operation, peer }) => {
    const fixture = serve(); context.plan = 'free';
    if (operation === 'update') await updateCalving(original.id, freeInput);
    else if (operation === 'dismiss') await dismissCalfRecoveryCandidate(original.id);
    else await registerCalvingToCalfLedger(original.id);
    const edited = (await read())!;
    const calves = await getAllRecords('calves');
    expect(fixture.calls).toEqual([]);
    fixture.remote = peer === 'tombstone'
      ? { ...original, updatedAt: timeB, deletedAt: timeB }
      : { ...original, memo: '別端末で確定したB', updatedAt: timeB };
    context.plan = 'standard';

    expect.soft(await pullForList()).toEqual({ applied: 0 });
    expect.soft(await pullForPlans()).toBe(0);
    expect.soft(await read()).toEqual(edited);
    expect.soft(edited).toMatchObject({ calvingSyncFreeEditPending: true, futureClinical: original.futureClinical,
      createdAt: timeA, updatedAt: timeC, actualCalvingDate: original.actualCalvingDate });
    expect(writes(fixture)).toEqual([]);
    expect(await getAllRecords('calves')).toEqual(calves);
    expect(calves).toHaveLength(operation === 'register' ? 1 : 0);
  });

  it('keeps a new Free calving local and never registers a calf while reading', async () => {
    const fixture = serve(); context.plan = 'free';
    const created = await createCalving({ ...freeInput, id: 'calving-created-free' });
    expect.soft(await getRecordById('calvings', created.id!)).toMatchObject({ calvingSyncFreeEditPending: true });
    expect((await fetchCalvingsReadOnly()).map(row => row.id)).toContain(created.id);
    expect(await pullForList()).toEqual({ applied: 0 });
    expect(fixture.calls).toEqual([]);
    expect(await getAllRecords('calves')).toEqual([]);
    context.plan = 'standard'; fixture.remote = null;
    expect(await pullForPlans()).toBe(0);
    expect(writes(fixture)).toEqual([]);
    expect(await getAllRecords('calves')).toEqual([]);
  });

  it('clears only the matching local marker after a confirmed explicit paid save without changing business timestamps', async () => {
    const fixture = serve(); context.plan = 'free';
    await updateCalving(original.id, freeInput);
    const protectedRecord = (await read())!;
    expect.soft(protectedRecord.calvingSyncFreeEditPending).toBe(true);
    context.plan = 'standard';
    await pullForList();
    expect(writes(fixture)).toEqual([]);
    vi.setSystemTime(new Date('2026-11-04T00:00:00.000Z'));
    const saved = await updateCalving(original.id, freeInput);
    const acknowledged = (await read())!;

    expect(writes(fixture)).toHaveLength(1);
    expect(writes(fixture)[0].body).not.toHaveProperty('calvingSyncFreeEditPending');
    expect(acknowledged).not.toHaveProperty('calvingSyncFreeEditPending');
    expect(saved).not.toHaveProperty('calvingSyncFreeEditPending');
    expect(acknowledged).toMatchObject({ memo: freeInput.memo, futureClinical: original.futureClinical,
      createdAt: timeA, updatedAt: '2026-11-04T00:00:00.000Z', actualCalvingDate: original.actualCalvingDate });
    fixture.remote = { ...fixture.remote!, memo: '確認後の正規クラウド更新', updatedAt: '2026-11-05T00:00:00.000Z' };
    expect(await pullForList()).toEqual({ applied: 1 });
    expect((await read())?.memo).toBe('確認後の正規クラウド更新');
  });

  it.each(['503', '409', 'lost ACK', 'tombstone'] as const)('keeps the edit protected after an unconfirmed explicit save: %s', async failure => {
    const fixture = serve(); context.plan = 'free';
    await updateCalving(original.id, freeInput);
    context.plan = 'standard';
    if (failure === '409') fixture.remote = { ...original, memo: '先行する別端末B', updatedAt: timeB };
    else fixture.failure = failure;
    await updateCalving(original.id, freeInput);
    const retained = (await read())!;
    expect.soft(retained).toMatchObject({ memo: freeInput.memo, calvingSyncFreeEditPending: true });
    expect(writes(fixture)[0].body).not.toHaveProperty('calvingSyncFreeEditPending');
    fixture.remote = { ...fixture.remote!, memo: '保留後の別端末B', updatedAt: timeB, deletedAt: timeB };

    expect.soft(await pullForList()).toEqual({ applied: 0 });
    expect.soft(await read()).toEqual(retained);
    expect(await getAllRecords('calves')).toEqual([]);
  });

  it.each(['edit', 'delete'] as const)('does not clear or recreate a local original changed by a raw %s during the paid acknowledgement', async action => {
    const fixture = serve(); context.plan = 'free';
    await updateCalving(original.id, freeInput);
    context.plan = 'standard';
    const started = deferred<void>(); const release = deferred<void>();
    fixture.afterPut = async () => { started.resolve(); await release.promise; };
    const saving = updateCalving(original.id, freeInput);
    await started.promise;
    const sent = (await read())!;
    const changed = { ...sent, memo: 'ACK待機中の新しい端末編集', futureClinical: { revision: 'new', optional: null } };
    if (action === 'edit') await saveRecordPreservingTimestamps('calvings', changed);
    else await deleteRecord('calvings', original.id);
    release.resolve(); await saving;

    expect(await read()).toEqual(action === 'edit' ? changed : undefined);
    if (action === 'edit') {
      expect.soft((await read())?.calvingSyncFreeEditPending).toBe(true);
      fixture.remote = { ...fixture.remote!, memo: '遅れたクラウド情報', updatedAt: timeB, deletedAt: timeB };
      expect.soft(await pullForList()).toEqual({ applied: 0 });
      expect.soft(await read()).toEqual(changed);
    }
  });
});
