import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import { createFarmProBackup } from '../storage/backup';
import { restoreFarmProBackup } from '../storage/backup-restore';
import type { Cattle, CattleInput } from '../types/cattle';
import type { Calf, CalfInput } from '../types/calf';
import type { AnimalLifecycle, AnimalLifecycleChange, AnimalLifecycleIdentity } from '../types/animalLifecycle';
import { pullNewerCattleRecordsFromCloud, updateCattle, updateCattleLifecycle } from './api';
import { getCalfList, getCalfListForHomeSummary, updateCalf, updateCalfLifecycle } from './calfApi';
import { toSyncedCattleRecord } from './cattleRecordSyncApi';
import { calfRecordForCloud } from './calfRecordSync';
import { applyAnimalLifecycleChange } from '../utils/animalLifecycle';
import { withAnimalSync } from './animalRecordSyncSafety';

const context = vi.hoisted(() => ({ plan: 'free', token: 'lifecycle-test-token', farmId: 'lifecycle-test-farm', userId: 'lifecycle-test-user' }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => context.plan }));
vi.mock('./authClient', () => ({ getAuthToken: () => context.token,
  getStoredAuthUser: () => ({ id: context.userId, farmId: context.farmId, plan: context.plan }) }));

const stamp = '2026-10-01T00:00:00.000Z';
const cow: Cattle & { syncId: string; cloudUpdatedAt: string } = {
  id: 7, syncId: 'idn:0000000123', earTag: '0123', identificationNumber: '0000000123', name: '検証牛',
  birthday: '2024-01-01', sex: '雌', sire: '父', dam: '母', parity: 1, blvStatus: '未検査', stage: '繁殖牛', note: '既存メモ',
  createdAt: stamp, updatedAt: stamp, cloudUpdatedAt: stamp,
};
const calf: Calf & { syncRecordId: string; cloudUpdatedAt: string } = {
  id: 8, syncRecordId: 'manual-calf:lifecycle', calfNumber: '0456', identificationNumber: '0000000456', name: '検証子牛',
  birthday: '2026-01-01', sex: '雌', motherName: '母', sireName: '父', startWeight: 30, currentWeight: 90,
  elapsedDays: 200, milkAmount: 0, starterAmount: 1, feedingMethod: '人工哺育', weaningPlannedDate: '', weaningDate: '',
  weaningStatus: '離乳前', weaningWeight: 0, weaningStarterAmount: 0, milkEndDate: '', managementStatus: '育成中', note: '既存子牛メモ',
  createdAt: stamp, updatedAt: stamp, cloudUpdatedAt: stamp,
};
const culling: AnimalLifecycleChange = { type: 'culling', date: '2026-10-30', reason: '繁殖終了', note: '現場で確認', route: 'sale' };
const death: AnimalLifecycleChange = { type: 'death', date: '2026-11-02', reason: '死亡を確認', note: '記録' };
const related = ['activityRecords', 'breedings', 'calvings', 'treatments', 'sales', 'expenses', 'schedules'] as const;
const preserved = { id: 'unrelated-history', title: '変更しない履歴', amount: '001.20', createdAt: stamp, updatedAt: stamp };
type Row = (Cattle | Calf) & Record<string, unknown>;
type Resource = {
  store: 'cattle' | 'calves'; source: typeof cow | typeof calf;
  save: (id: string, change: AnimalLifecycleChange, expected?: AnimalLifecycle, animal?: AnimalLifecycleIdentity) => Promise<Row>;
  list: () => Promise<unknown>;
};
const resources: Resource[] = [
  { store: 'cattle', source: cow, save: updateCattleLifecycle, list: pullNewerCattleRecordsFromCloud },
  { store: 'calves', source: calf, save: updateCalfLifecycle, list: getCalfList },
];
beforeEach(async () => {
  Object.assign(context, { plan: 'free', token: 'lifecycle-test-token', farmId: 'lifecycle-test-farm', userId: 'lifecycle-test-user' });
  localStorage.clear(); window.history.replaceState(null, '', '/animal-lifecycle');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime('2026-11-03T03:00:00.000Z');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  await clearStore('cattle'); await clearStore('calves');
  await saveRecordPreservingTimestamps('cattle', cow); await saveRecordPreservingTimestamps('calves', calf);
  for (const store of related) { await clearStore(store); await saveRecordPreservingTimestamps(store, preserved); }
});
afterEach(async () => {
  context.farmId = 'lifecycle-test-farm';
  for (const store of related) expect(await getAllRecords(store)).toEqual([preserved]);
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

type Cloud = Record<string, unknown> & { id: string; cloudUpdatedAt?: string };
function serve(resource: Resource) {
  const path = `/api/${resource.store}/record-sync`;
  const toCloud = () => resource.store === 'cattle' ? toSyncedCattleRecord(cow) : calfRecordForCloud(calf);
  const initial = { ...toCloud(), cloudUpdatedAt: stamp } as Cloud;
  const fixture = { rows: new Map<string, Cloud>([[initial.id, initial]]), offline: false, puts: [] as Cloud[], headers: [] as Headers[] };
  let generation = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (fixture.offline) throw new Error('offline');
    const target = String(url);
    if (target === path && (!init?.method || init.method === 'GET')) return Response.json([...fixture.rows.values()]);
    if (target.startsWith(`${path}/`) && init?.method === 'PUT') {
      const record = JSON.parse(String(init.body)) as Cloud; const old = fixture.rows.get(record.id); const headers = new Headers(init.headers);
      if (old && headers.get('If-Match') !== JSON.stringify(old.cloudUpdatedAt)) return Response.json({ message: 'changed' }, { status: 412 });
      const saved = { ...record, cloudUpdatedAt: new Date(Date.parse(stamp) + ++generation).toISOString() };
      fixture.rows.set(record.id, saved); fixture.puts.push(record); fixture.headers.push(headers);
      return Response.json(saved);
    }
    throw new Error(`Unexpected lifecycle side effect: ${target}`);
  }));
  return fixture;
}

describe.each(resources)('$store lifecycle formal save', resource => {
  const read = () => getRecordById<Row>(resource.store, resource.source.id);

  it('only updates the selected animal, preserves other fields and histories, and does not call HTTP on Free', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await saveRecordPreservingTimestamps(resource.store, { ...resource.source, note: '選択後に更新されたメモ', future: { amount: '001.20', optional: null } });
    const saved = await resource.save(String(resource.source.id), culling, undefined, resource.source);
    expect(saved).toMatchObject({ note: '選択後に更新されたメモ', future: { amount: '001.20', optional: null },
      lifecycle: { version: 1, culling: { date: culling.date, reason: culling.reason, note: culling.note, route: 'sale' } } });
    expect(saved.lifecycle?.culling?.route).toBe('sale');
    expect(saved.lifecycle?.death).toBeUndefined();
    const dead = await resource.save(String(resource.source.id), death, saved.lifecycle, resource.source);
    expect(dead.lifecycle?.culling).toEqual(saved.lifecycle?.culling);
    if (resource.store === 'calves') expect(dead.managementStatus).toBe('死亡・その他');
    expect(fetch).not.toHaveBeenCalled();
    const beforeRetry = await read();
    const retry = await resource.save(String(resource.source.id), death, undefined, resource.source);
    expect(retry).toEqual(beforeRetry);
    const backup = await createFarmProBackup('lifecycle-test');
    expect(backup.stores[resource.store].find(row => row.id === resource.source.id)?.lifecycle).toEqual(dead.lifecycle);
    await restoreFarmProBackup(backup);
    expect((await read())?.lifecycle).toEqual(dead.lifecycle);
  });

  it('refuses changed animal identity and stale lifecycle expectations without altering the original', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const selected = resource.source;
    await saveRecordPreservingTimestamps(resource.store, { ...selected, identificationNumber: 'different-animal' });
    const before = await read();
    await expect(resource.save(String(selected.id), death, undefined, selected)).rejects.toThrow('識別情報');
    expect(await read()).toEqual(before);
    await saveRecordPreservingTimestamps(resource.store, selected);
    await resource.save(String(selected.id), culling, undefined, selected);
    const beforeStale = await read();
    await expect(resource.save(String(selected.id), { ...culling, reason: '古い画面から変更' }, undefined, selected)).rejects.toThrow('記録が変更');
    expect(await read()).toEqual(beforeStale);
  });

  it('sends lifecycle losslessly using the existing revision condition and retries an offline formal save once', async () => {
    context.plan = 'standard'; const cloud = serve(resource); cloud.offline = true;
    const saved = await resource.save(String(resource.source.id), death, undefined, resource.source);
    expect(saved.cloudSyncPending).toBe(true);
    expect((await read())?.lifecycle?.death?.date).toBe(death.date);
    cloud.offline = false;
    const retried = await resource.save(String(resource.source.id), death, undefined, resource.source);
    expect(retried.cloudSyncPending).toBe(false);
    expect(cloud.puts).toHaveLength(1);
    expect(cloud.puts[0].lifecycle).toEqual(saved.lifecycle);
    expect(cloud.headers[0].get('If-Match')).toBe(JSON.stringify(stamp));
    await resource.save(String(resource.source.id), death, undefined, resource.source);
    expect(cloud.puts).toHaveLength(1);
  });

  it('receives lifecycle metadata from another device and retains it in local source and calf summary', async () => {
    context.plan = 'standard'; const cloud = serve(resource);
    const lifecycle = applyAnimalLifecycleChange(resource.source, culling, undefined, new Date());
    const id = [...cloud.rows.keys()][0];
    cloud.rows.set(id, { ...cloud.rows.get(id)!, lifecycle, cloudUpdatedAt: '2026-11-03T04:00:00.000Z' });
    await resource.list();
    expect((await read())?.lifecycle).toEqual(lifecycle);
    if (resource.store === 'calves') expect((await getCalfListForHomeSummary())[0].lifecycle).toEqual(lifecycle);
    expect(cloud.puts).toHaveLength(0);
  });

  it('removes automatic upload ownership if a pending paid lifecycle record is edited on Free', async () => {
    context.plan = 'standard'; const cloud = serve(resource); cloud.offline = true;
    const pending = await resource.save(String(resource.source.id), culling, undefined, resource.source);
    expect(pending.animalSyncOrigin).toBeTruthy();
    context.plan = 'free';
    const saved = await resource.save(String(resource.source.id), death, pending.lifecycle, resource.source);
    expect(saved.cloudSyncPending).toBe(true);
    expect(saved.animalSyncOrigin).toBeUndefined();
    expect(saved.animalSyncBase).toBeUndefined();
    expect(saved.animalSyncAttempt).toBeUndefined();
    expect(saved.lifecycle?.culling).toEqual(pending.lifecycle?.culling);
    expect(cloud.puts).toHaveLength(0);
  });

  it('does not start a queued lifecycle mutation after the farm changes', async () => {
    let release!: () => void; let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const held = withAnimalSync(resource.store, async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); });
    await started;
    const before = await read();
    const outcome = resource.save(String(resource.source.id), death, undefined, resource.source).catch(error => error);
    context.farmId = 'lifecycle-other-farm';
    release(); await held;
    expect(await outcome).toBeInstanceOf(Error);
    context.farmId = 'lifecycle-test-farm';
    expect(await read()).toEqual(before);
  });
});

it('normal cattle and calf edits with omitted lifecycle retain formal death and the calf death status', async () => {
  vi.stubGlobal('fetch', vi.fn());
  const deadCow = await updateCattleLifecycle(String(cow.id), death, undefined, cow);
  const deadCalf = await updateCalfLifecycle(String(calf.id), death, undefined, calf);
  const { lifecycle: _cowLifecycle, ...cowFields } = deadCow;
  const { lifecycle: _calfLifecycle, ...calfFields } = deadCalf;
  await updateCattle(String(cow.id), { ...cowFields, identificationNumber: cow.identificationNumber!, lifecycle: undefined, note: '通常編集' } as CattleInput);
  await updateCalf(String(calf.id), { ...calfFields, lifecycle: undefined, managementStatus: '育成中', note: '通常編集' } as CalfInput);
  expect((await getRecordById<Cattle>('cattle', cow.id))?.lifecycle).toEqual(deadCow.lifecycle);
  expect(await getRecordById<Calf>('calves', calf.id)).toMatchObject({ lifecycle: deadCalf.lifecycle, managementStatus: '死亡・その他', note: '通常編集' });
});

it.each([{ managementStatus: '販売済み' }, { managementStatus: '牛台帳へ移行済み' }, { promotedCattleId: 123 }])(
  'refuses a calf that was sold or promoted after it was selected: %j', async change => {
    const latest = await saveRecordPreservingTimestamps('calves', { ...calf, ...change });
    await expect(updateCalfLifecycle(String(calf.id), death, undefined, calf)).rejects.toThrow('販売済み・牛台帳へ移行済み');
    expect(await getRecordById('calves', calf.id)).toEqual(latest);
  },
);
