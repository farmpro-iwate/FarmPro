import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginCloudRecovery, isCloudRecoveryPaused, setRecoveryRecordBaseline,
  shouldApplyRecoveredCloudRecord, shouldPruneRecoveredCloudRecord,
  rememberAppliedRecoveryRecord, withRecordSync, recoveryAwareFetch,
  type CloudRecoveryLease,
} from './syncRecoveryGuard';
import { openFarmProDatabase } from '../storage/db';
import { getAllRecords, saveRecordPreservingTimestamps } from '../storage/repository';
import { pullMasterRecordsFromCloud } from './masterApi';
import { getFarmSettingsForPageOpen, updateFarmSettings } from './settingsApi';
import { pullNewerCalvingRecordsFromCloud as pullHomeCalvings } from './calvingRecordSync';

// A small FIFO Web Locks test double: a running operation drains before the
// next exclusive operation, and an abandoned marker does not leave a held lock.
function installLocks() {
  type Request = { name: string; mode: LockMode; run: (lock: Lock | null) => unknown; resolve: (value: unknown) => void; reject: (reason: unknown) => void };
  const held: Request[] = [];
  const queued: Request[] = [];
  const start = (request: Request) => {
    held.push(request);
    void Promise.resolve().then(() => request.run({ name: request.name, mode: request.mode } as Lock))
      .then(request.resolve, request.reject).finally(() => {
        held.splice(held.indexOf(request), 1);
        drain();
      });
  };
  const available = (r: Request) => !held.some(h => h.name === r.name && (h.mode === 'exclusive' || r.mode === 'exclusive'));
  const drain = () => {
    while (queued.length && available(queued[0])) start(queued.shift()!);
  };
  vi.stubGlobal('navigator', {
    locks: {
      request(name: string, options: LockOptions, run: Request['run']) {
        return new Promise((resolve, reject) => {
          const request: Request = { name, mode: options.mode || 'exclusive', run, resolve, reject };
          if (options.ifAvailable && (!available(request) || queued.some(q => q.name === name))) {
            void Promise.resolve(run(null)).then(resolve, reject);
          } else {
            queued.push(request); drain();
          }
        });
      },
    },
  });
}

let active: CloudRecoveryLease | undefined;
let farm = '';
function signIn(farmId: string) {
  window.localStorage.setItem('farmpro.authToken', `token-${farmId}`);
  window.localStorage.setItem('farmpro.authUser', JSON.stringify({
    id: `user-${farmId}`, farmId, farmName: 'Test farm', name: 'Owner', plan: 'standard', active: true, role: 'owner',
  }));
}

beforeEach(() => {
  window.localStorage.clear();
  farm = `recovery-guard-${crypto.randomUUID()}`;
  signIn(farm);
  installLocks();
});
afterEach(async () => {
  active?.release(); active = undefined;
  await Promise.resolve();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('farm-scoped recovery barrier', () => {
  it('blocks ordinary operations and forged permits while allowing its exclusive owner', async () => {
    active = await beginCloudRecovery();
    expect(isCloudRecoveryPaused()).toBe(true);
    await expect(withRecordSync(async () => 'must not run')).rejects.toThrow('一時停止');
    expect(() => openFarmProDatabase()).toThrow('一時停止');
    expect(() => openFarmProDatabase({ farmId: active!.farmId, userId: active!.userId })).toThrow('権限');
    await expect(openFarmProDatabase(active)).resolves.toBeTruthy();
    await expect(withRecordSync(async () => 'verified', active)).resolves.toBe('verified');
    active.release(); active = undefined;
    expect(isCloudRecoveryPaused()).toBe(false);
    await expect(withRecordSync(async () => 'resumed')).resolves.toBe('resumed');
  });

  it('waits for an older request to finish and prevents that response from applying', async () => {
    let finish!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>(resolve => { finish = resolve; });
    const began = new Promise<void>(resolve => { started = resolve; });
    const applied = vi.fn();
    const old = withRecordSync(async lease => {
      started(); await waiting; lease.assertCurrent(); applied();
    });
    const rejected = expect(old).rejects.toThrow('一時停止');
    await began;
    const recovery = beginCloudRecovery();
    expect(isCloudRecoveryPaused()).toBe(true);
    finish();
    await rejected;
    active = await recovery;
    expect(applied).not.toHaveBeenCalled();
  });

  it('rejects the captured lease if the account changes', async () => {
    active = await beginCloudRecovery();
    signIn('another-farm');
    expect(() => active!.assertCurrent()).toThrow('農場が変わった');
    expect(() => openFarmProDatabase(active)).toThrow('農場が変わった');
    expect(isCloudRecoveryPaused()).toBe(false);
  });

  it('reclaims a marker left by an interrupted recovery but fails without Web Locks', async () => {
    window.localStorage.setItem(`farmpro.cloudRecoveryPaused.${encodeURIComponent(farm)}`, JSON.stringify({ owner: 'closed-tab', userId: `user-${farm}`, startedAt: '2026-10-31T00:00:00Z' }));
    active = await beginCloudRecovery();
    active.release(); active = undefined;
    vi.stubGlobal('navigator', {});
    await expect(beginCloudRecovery()).rejects.toThrow('同時操作制御');
    expect(isCloudRecoveryPaused()).toBe(false);
  });

  it('does not start cloud writes after the recovery marker is set', async () => {
    active = await beginCloudRecovery();
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(recoveryAwareFetch('/api/calves/record-sync/a', { method: 'PUT', body: '{}' })).rejects.toThrow('一時停止');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serializes an older record merge before a queued snapshot can replace local data', async () => {
    let finish!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>(resolve => { finish = resolve; });
    const began = new Promise<void>(resolve => { started = resolve; });
    let local = 'A';
    const olderPull = withRecordSync(async lease => {
      started(); await waiting; lease.assertCurrent(); local = 'B';
    });
    await began;
    const snapshotWork = vi.fn(async () => { expect(local).toBe('B'); local = 'D'; });
    const snapshot = withRecordSync(snapshotWork);
    await Promise.resolve();
    expect(snapshotWork).not.toHaveBeenCalled();
    finish();
    await Promise.all([olderPull, snapshot]);
    expect(local).toBe('D');
  });

  it('fails closed without Web Locks only for a device that has completed recovery', async () => {
    vi.stubGlobal('navigator', {});
    await expect(withRecordSync(async () => 'legacy')).resolves.toBe('legacy');
    window.localStorage.setItem(`farmpro.recoveredSyncBase.${encodeURIComponent(farm)}`, '{"version":1}');
    const work = vi.fn(async () => 'must not run');
    await expect(withRecordSync(work)).rejects.toThrow('通常同期を停止');
    expect(work).not.toHaveBeenCalled();
  });
});

describe('post-recovery record baseline', () => {
  it('keeps 59 restored masters and excludes two old remote extras; a later edit still syncs', async () => {
    active = await beginCloudRecovery();
    const local = Array.from({ length: 59 }, (_, index) => ({
      id: index + 1, syncId: `master:${index + 1}`, category: 'medicine', name: `Medicine ${index + 1}`,
      active: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-30T00:00:00Z',
    }));
    for (const record of local) await saveRecordPreservingTimestamps('masters', record, active);
    const remote = [...local.map(record => ({ ...record, id: record.syncId })),
      { id: 'old-extra-1', category: 'feed', name: 'Old feed', active: true, updatedAt: '2026-10-28T00:00:00Z' },
      { id: 'old-extra-2', category: 'medicine', name: 'Old medicine', active: true, updatedAt: '2026-10-28T00:00:00Z' },
    ];
    setRecoveryRecordBaseline(active, { masters: remote });
    let response = remote.map(record => ({ ...record, cloudUpdatedAt: '2026-10-31T10:00:00Z' }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })));
    await pullMasterRecordsFromCloud(active);
    expect(await getAllRecords('masters', active)).toEqual(local);
    active.release(); active = undefined;
    response = response.map(record => record.id === 'master:1'
      ? { ...record, name: 'Edited medicine', updatedAt: '2026-11-01T00:00:00Z' } : record);
    await pullMasterRecordsFromCloud();
    const after = await getAllRecords('masters');
    expect(after).toHaveLength(59);
    expect(after.filter(record => record.name === 'Edited medicine')).toHaveLength(1);
    const once = JSON.stringify(after);
    await pullMasterRecordsFromCloud();
    expect(JSON.stringify(await getAllRecords('masters'))).toBe(once);
  });

  it('advances only one applied record without forgetting other old records or farms', async () => {
    active = await beginCloudRecovery();
    const old = { id: 'a', value: 1, updatedAt: '2026-10-01' };
    const extra = { id: 'extra', value: 9 };
    setRecoveryRecordBaseline(active, { calves: [old, extra], 'farm-settings': { estrousCycleDays: 20 } });
    expect(shouldApplyRecoveredCloudRecord('calves', { ...old, cloudUpdatedAt: 'new-transport-time' })).toBe(false);
    const edited = { ...old, value: 2, updatedAt: '2026-11-01' };
    expect(shouldApplyRecoveredCloudRecord('calves', edited)).toBe(true);
    rememberAppliedRecoveryRecord('calves', edited);
    expect(shouldApplyRecoveredCloudRecord('calves', edited)).toBe(false);
    expect(shouldApplyRecoveredCloudRecord('calves', extra)).toBe(false);
    expect(shouldPruneRecoveredCloudRecord('calves', 'a')).toBe(true);
    expect(shouldPruneRecoveredCloudRecord('calves', 'local-only')).toBe(false);
    signIn('other-farm');
    expect(shouldApplyRecoveredCloudRecord('calves', old)).toBe(true);
  });

  it('protects the Home calving sync path and still applies a later explicit deletion', async () => {
    active = await beginCloudRecovery();
    const local = { id: 'calving-1', cowName: 'Cow A', calfId: '7', actualCalvingDate: '2026-10-20',
      createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-30T00:00:00Z' };
    await saveRecordPreservingTimestamps('calvings', local, active);
    const oldRemote = { ...local, calfId: '99', updatedAt: '2026-10-31T00:00:00Z' };
    setRecoveryRecordBaseline(active, { calvings: [oldRemote] });
    let response: Array<Record<string, unknown>> = [oldRemote];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })));
    expect(await pullHomeCalvings(active)).toEqual({ applied: 0 });
    expect(await getAllRecords('calvings', active)).toEqual([local]);
    active.release(); active = undefined;
    response = [{ ...oldRemote, deletedAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' }];
    expect(await pullHomeCalvings()).toEqual({ applied: 1 });
    expect(await getAllRecords('calvings')).toEqual([]);
    expect(await pullHomeCalvings()).toEqual({ applied: 0 });
  });

  it('accepts a genuine settings change back to an earlier value after this device saved a newer value', async () => {
    active = await beginCloudRecovery();
    const initial = {
      farmName: 'Test farm', ownerName: 'Owner', staffName: '', phone: '', address: '',
      estrousCycleDays: 20, postCalvingHeatDays: 40, defaultTaxRate: '10' as const,
      farmExpenseAllocation: 'none' as const, farmExpenseAllocationTarget: 'calf' as const,
      farmExpenseAllocationPeriod: 'monthly' as const, farmExpenseAllocationMethod: 'headcount' as const,
      breedingCattleAcquisitionAllocationParity: 7, bullMasters: [], supplierMasters: [], memo: '',
      cloudUpdatedAt: '2026-10-30T00:00:00Z',
    };
    await saveRecordPreservingTimestamps('metadata', {
      ...initial, id: 'farm-settings', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-30T00:00:00Z',
    }, active);
    setRecoveryRecordBaseline(active, { 'farm-settings': initial });
    active.release(); active = undefined;
    let remote = { ...initial };
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      if (options?.method === 'PUT') remote = { ...JSON.parse(String(options.body)), cloudUpdatedAt: '2026-11-01T00:00:00Z' };
      return new Response(JSON.stringify(remote), { status: 200 });
    }));
    await updateFarmSettings({ ...initial, postCalvingHeatDays: 35 });
    // The other device has deliberately changed 35 back to 40, before this
    // device ever GETs its own earlier 35 update.
    remote = { ...initial, cloudUpdatedAt: '2026-11-02T00:00:00Z' };
    expect((await getFarmSettingsForPageOpen()).postCalvingHeatDays).toBe(40);
    const once = JSON.stringify(await getAllRecords('metadata'));
    await getFarmSettingsForPageOpen();
    expect(JSON.stringify(await getAllRecords('metadata'))).toBe(once);
  });

  it('keeps its previous baseline and pauses when saving an advanced baseline fails', async () => {
    active = await beginCloudRecovery();
    setRecoveryRecordBaseline(active, { calves: [{ id: 'a', value: 1 }] });
    active.release(); active = undefined;
    const key = `farmpro.recoveryRecordBaseline.${encodeURIComponent(farm)}`;
    const original = localStorage.getItem(key);
    const native = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, target, value) {
      if (target === key) throw new DOMException('quota', 'QuotaExceededError');
      return native.call(this, target, value);
    });
    expect(() => rememberAppliedRecoveryRecord('calves', { id: 'a', value: 2 })).toThrow('通常同期を停止');
    expect(localStorage.getItem(key)).toBe(original);
    expect(isCloudRecoveryPaused()).toBe(true);
  });
});
