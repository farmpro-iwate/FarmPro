import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FarmProBackup } from '../storage/backup';
import { FARM_PRO_STORE_NAMES } from '../storage/db';
import { restoreFarmProBackup } from '../storage/backup-restore';
import { captureRecoveryBackup, recoveryBackupContent } from '../storage/sync-recovery';
import { saveRecord } from '../storage/repository';
import {
  establishRecoveredSyncBase, getDeviceSyncPreview, getKnownCloudRevision, hasLocalChangePending,
  isRecoveredDeviceSyncEnabled, markLocalChangePending, pullCloudToLocal,
  pushLocalToCloud, runRecoveredDeviceSync,
} from './deviceSync';
import { beginCloudRecovery, isCloudRecoveryPaused, type CloudRecoveryLease } from './syncRecoveryGuard';

// Real recovery and ordinary-sync guards use this FIFO Web Locks scheduler.
// No service, storage, authentication or HTTP-client modules are mocked.
function installLocks() {
  type Work = { name: string; mode: LockMode; run: (lock: Lock | null) => unknown; resolve(value: unknown): void; reject(error: unknown): void };
  const held: Work[] = [];
  const queue: Work[] = [];
  const available = (work: Work) => !held.some(item => item.name === work.name && (item.mode === 'exclusive' || work.mode === 'exclusive'));
  const drain = () => {
    while (queue.length && available(queue[0])) {
      const work = queue.shift()!;
      held.push(work);
      void Promise.resolve().then(() => work.run({ name: work.name, mode: work.mode } as Lock))
        .then(work.resolve, work.reject).finally(() => { held.splice(held.indexOf(work), 1); drain(); });
    }
  };
  vi.stubGlobal('navigator', { onLine: true, locks: {
    request(name: string, options: LockOptions, run: Work['run']) {
      return new Promise((resolve, reject) => {
        const work: Work = { name, mode: options.mode ?? 'exclusive', run, resolve, reject };
        if (options.ifAvailable && (!available(work) || queue.some(item => item.name === name))) {
          void Promise.resolve(run(null)).then(resolve, reject);
        } else { queue.push(work); drain(); }
      });
    },
  } });
}

const when = '2026-10-31T05:40:45.074Z';
let farm: string;
let source: FarmProBackup;
let server: { snapshot: FarmProBackup; revision: number; savedAt: string };
let active: CloudRecoveryLease | undefined;
let getCount: number;
let onGet: ((count: number) => void | Promise<void>) | null;
let onPut: (() => void | Promise<void>) | null;
let conflict: boolean;

function signIn(farmId = farm) {
  localStorage.setItem('farmpro.authUser', JSON.stringify({ id: `user-${farmId}`, farmId, farmName: 'Sync test farm', active: true, role: 'owner', plan: 'standard' }));
  localStorage.setItem('farmpro.authToken', `token-${farmId}`);
  localStorage.setItem('farmpro.plan', 'standard');
}

function fixture(): FarmProBackup {
  const stores = Object.fromEntries(FARM_PRO_STORE_NAMES.map(name => [name, []])) as unknown as FarmProBackup['stores'];
  stores.cattle = [{ id: 10, name: 'cow', identificationNumber: '1111111111', createdAt: when, updatedAt: when }];
  stores.calves = [{ id: 20, name: 'calf', identificationNumber: '2222222222', createdAt: when, updatedAt: when }];
  stores.supplyInventory = Array.from({ length: 6 }, (_, i) => ({ id: `supply-${i}`, quantity: i + 1, kind: i < 3 ? 'medicine' : 'embryo', createdAt: when, updatedAt: when }));
  stores.sales = [{ id: 'sale-1', amount: 1000, createdAt: when, updatedAt: when }];
  stores.expenses = [{ id: 'expense-1', amount: 10, createdAt: when, updatedAt: when }];
  stores.metadata = [
    { id: 'database', schemaVersion: 4, createdAt: when, updatedAt: when },
    { id: 'farm-settings', farmName: 'Sync test farm', postCalvingHeatDays: 40, createdAt: when, updatedAt: when },
  ];
  return { format: 'farmpro-backup', schemaVersion: 4, appVersion: '1.6.0', exportedAt: when, farm: { id: farm, name: 'Sync test farm' }, stores };
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) !== '/api/cloud-snapshots/latest') throw new Error(`Unexpected endpoint ${String(input)}`);
  const method = init?.method ?? 'GET';
  if (method === 'GET') {
    getCount += 1;
    await onGet?.(getCount);
    return new Response(JSON.stringify(server), { status: 200 });
  }
  if (method === 'PUT') {
    await onPut?.();
    const expected = Number(new Headers(init?.headers).get('X-FarmPro-Cloud-Revision'));
    if (conflict || expected !== server.revision) return new Response(JSON.stringify({ message: 'Cloud changed during upload' }), { status: 409 });
    server = { snapshot: JSON.parse(String(init?.body)) as FarmProBackup, revision: server.revision + 1, savedAt: '2026-10-31T10:00:00.000Z' };
    return new Response(JSON.stringify({ savedAt: server.savedAt, revision: server.revision, exportedAt: server.snapshot.exportedAt, appVersion: server.snapshot.appVersion }), { status: 200 });
  }
  throw new Error(`Unexpected method ${method}`);
});

function writes() { return fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT'); }
async function current() { return captureRecoveryBackup(active ?? { farmId: farm, userId: `user-${farm}` }); }
function baseKey() { return `farmpro.recoveredSyncBase.${encodeURIComponent(farm)}`; }

async function enableRecoveredSync() {
  active = await beginCloudRecovery();
  await establishRecoveredSyncBase(source, server.revision, active);
  active.release(); active = undefined;
  // Let the exclusive callback release its Web Lock before ordinary sync.
  await Promise.resolve();
}

async function editLocalInventory(quantity = 99) {
  await saveRecord('supplyInventory', { ...source.stores.supplyInventory[0], quantity });
  markLocalChangePending();
}

function editCloudSettings() {
  server.snapshot.stores.metadata.find(row => row.id === 'farm-settings')!.postCalvingHeatDays = 45;
  server.revision += 1;
}

beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
  farm = `recovered-sync-${crypto.randomUUID()}`;
  signIn();
  installLocks();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  getCount = 0; onGet = null; onPut = null; conflict = false;
  source = fixture();
  server = { snapshot: structuredClone(source), revision: 36, savedAt: when };
  await restoreFarmProBackup(source);
});

afterEach(async () => {
  active?.release(); active = undefined;
  await Promise.resolve();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('verified recovery baseline', () => {
  it('requires the actual exclusive lease and exact local content before enabling ordinary sync', async () => {
    const forged = { farmId: farm, userId: `user-${farm}`, token: `token-${farm}`, assertCurrent() {}, release() {} };
    await expect(establishRecoveredSyncBase(source, 36, forged)).rejects.toThrow('権限');
    expect(isRecoveredDeviceSyncEnabled()).toBe(false);
    await editLocalInventory();
    active = await beginCloudRecovery();
    await expect(establishRecoveredSyncBase(source, 36, active)).rejects.toThrow('全内容が一致しません');
    expect(isRecoveredDeviceSyncEnabled()).toBe(false);
    expect(isCloudRecoveryPaused()).toBe(true);
    expect(writes()).toHaveLength(0);
  });

  it('does not send when local and cloud are the established ancestor', async () => {
    await enableRecoveredSync();
    expect(await runRecoveredDeviceSync()).toBe('same');
    expect(getKnownCloudRevision()).toBe(36);
    expect(writes()).toHaveLength(0);
    expect(recoveryBackupContent(await current())).toBe(recoveryBackupContent(source));
  });

  it('keeps incomplete recovery paused and retains the legacy overwrite protections', async () => {
    server.snapshot.stores.cattle[0].name = 'conflicting cow';
    await expect(pushLocalToCloud()).rejects.toThrow('全件上書きせず');
    await expect(pullCloudToLocal(server.snapshot, 36)).rejects.toThrow('全件置換せず');
    expect(await runRecoveredDeviceSync()).toBe('skipped');
    expect(writes()).toHaveLength(0);
    active = await beginCloudRecovery();
    expect(await runRecoveredDeviceSync()).toBe('skipped');
    await expect(pushLocalToCloud()).rejects.toThrow('一時停止');
    expect(writes()).toHaveLength(0);
    expect(recoveryBackupContent(await current())).toBe(recoveryBackupContent(source));
  });
});

describe('three-way recovered snapshot sync', () => {
  it('uploads a local inventory edit with the current revision, preserving all six inventory rows and metadata', async () => {
    await enableRecoveredSync();
    await editLocalInventory();
    const local = await current();
    const sourceBefore = structuredClone(source);
    expect(await runRecoveredDeviceSync()).toBe('pushed');
    expect(writes()).toHaveLength(1);
    const [, init] = writes()[0];
    expect(new Headers(init?.headers).get('X-FarmPro-Cloud-Revision')).toBe('36');
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer token-${farm}`);
    const sent = JSON.parse(String(init?.body)) as FarmProBackup;
    expect(sent.stores.supplyInventory).toHaveLength(6);
    expect(sent.stores.supplyInventory[0].quantity).toBe(99);
    expect(sent.stores.metadata).toEqual(source.stores.metadata);
    expect(recoveryBackupContent(sent)).toBe(recoveryBackupContent(local));
    expect(getKnownCloudRevision()).toBe(37);
    expect(hasLocalChangePending()).toBe(false);
    expect(source).toEqual(sourceBefore);
    expect(await runRecoveredDeviceSync()).toBe('same');
    expect(writes()).toHaveLength(1);
  });

  it('atomically receives a cloud-only new generation, including changed metadata', async () => {
    await enableRecoveredSync();
    editCloudSettings();
    server.snapshot.stores.supplyInventory[4].quantity = 77;
    expect(await runRecoveredDeviceSync()).toBe('pulled');
    expect(recoveryBackupContent(await current())).toBe(recoveryBackupContent(server.snapshot));
    expect(getKnownCloudRevision()).toBe(37);
    expect(writes()).toHaveLength(0);
    expect(await runRecoveredDeviceSync()).toBe('same');
    expect(writes()).toHaveLength(0);
  });

  it('preserves both sides when local and cloud changed from the same ancestor', async () => {
    await enableRecoveredSync();
    await editLocalInventory();
    editCloudSettings();
    const local = recoveryBackupContent(await current());
    const remote = recoveryBackupContent(server.snapshot);
    const base = localStorage.getItem(baseKey());
    expect(await runRecoveredDeviceSync()).toBe('needs-review');
    expect(recoveryBackupContent(await current())).toBe(local);
    expect(recoveryBackupContent(server.snapshot)).toBe(remote);
    expect(localStorage.getItem(baseKey())).toBe(base);
    expect(getKnownCloudRevision()).toBe(36);
    expect(writes()).toHaveLength(0);
  });

  it('rejects a farm switch while receiving a response, without writing either farm', async () => {
    await enableRecoveredSync();
    await editLocalInventory();
    const before = recoveryBackupContent(await current());
    onGet = () => { signIn('different-farm'); };
    await expect(runRecoveredDeviceSync()).rejects.toThrow('農場が変わった');
    expect(writes()).toHaveLength(0);
    signIn(); onGet = null;
    expect(recoveryBackupContent(await current())).toBe(before);
    expect(getKnownCloudRevision()).toBe(36);
  });

  it('aborts atomic pull if a local record is written during remote revalidation', async () => {
    await enableRecoveredSync();
    editCloudSettings();
    onGet = async count => { if (count === 2) await editLocalInventory(123); };
    await expect(runRecoveredDeviceSync()).rejects.toThrow('確認後にこの端末の記録が変わりました');
    const local = await current();
    expect(local.stores.supplyInventory[0].quantity).toBe(123);
    expect(local.stores.metadata).toEqual(source.stores.metadata);
    expect(getKnownCloudRevision()).toBe(36);
    expect(writes()).toHaveLength(0);
  });

  it('keeps a newer local write pending if it occurs while the earlier snapshot is uploading', async () => {
    await enableRecoveredSync();
    await editLocalInventory(90);
    onPut = async () => { await editLocalInventory(91); };
    expect(await runRecoveredDeviceSync()).toBe('pushed');
    expect(server.snapshot.stores.supplyInventory[0].quantity).toBe(90);
    expect((await current()).stores.supplyInventory[0].quantity).toBe(91);
    expect(hasLocalChangePending()).toBe(true);
    onPut = null;
    expect(await runRecoveredDeviceSync()).toBe('pushed');
    expect(server.snapshot.stores.supplyInventory[0].quantity).toBe(91);
    expect(hasLocalChangePending()).toBe(false);
  });

  it('honors a 409 CAS conflict without advancing the common ancestor or discarding local edits', async () => {
    await enableRecoveredSync();
    await editLocalInventory();
    const local = recoveryBackupContent(await current());
    const base = localStorage.getItem(baseKey());
    conflict = true;
    await expect(runRecoveredDeviceSync()).rejects.toThrow('Cloud changed during upload');
    expect(writes()).toHaveLength(1);
    expect(recoveryBackupContent(await current())).toBe(local);
    expect(recoveryBackupContent(server.snapshot)).toBe(recoveryBackupContent(source));
    expect(localStorage.getItem(baseKey())).toBe(base);
    expect(getKnownCloudRevision()).toBe(36);
    expect(hasLocalChangePending()).toBe(true);
  });

  it('refuses a cloud snapshot belonging to another farm', async () => {
    await enableRecoveredSync();
    server.snapshot.farm!.id = 'different-farm';
    await expect(runRecoveredDeviceSync()).rejects.toThrow('農場ID');
    expect(recoveryBackupContent(await current())).toBe(recoveryBackupContent(source));
    expect(getKnownCloudRevision()).toBe(36);
    expect(writes()).toHaveLength(0);
  });

  it.each(['older', 'same-generation-changed'] as const)('refuses an invalid generation relationship: %s', async kind => {
    await enableRecoveredSync();
    if (kind === 'older') server.revision = 35;
    else server.snapshot.stores.metadata.find(row => row.id === 'farm-settings')!.postCalvingHeatDays = 32;
    expect(await runRecoveredDeviceSync()).toBe('needs-review');
    expect(recoveryBackupContent(await current())).toBe(recoveryBackupContent(source));
    expect(getKnownCloudRevision()).toBe(36);
    expect(writes()).toHaveLength(0);
  });

  it('does not let a read-only preview lower the known generation and bypass the stale-generation guard', async () => {
    await enableRecoveredSync();
    server.revision = 35;
    await getDeviceSyncPreview();
    expect(getKnownCloudRevision()).toBe(36);
    expect(await runRecoveredDeviceSync()).toBe('needs-review');
    expect(writes()).toHaveLength(0);
    expect(recoveryBackupContent(await current())).toBe(recoveryBackupContent(source));
  });

  it('serializes a delayed completion against a second snapshot sync and keeps the newer ancestor with its generation', async () => {
    await enableRecoveredSync();
    let unblock!: () => void;
    let reachedFingerprint!: () => void;
    const blocked = new Promise<void>(resolve => { unblock = resolve; });
    const reached = new Promise<void>(resolve => { reachedFingerprint = resolve; });
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let firstDigest = true;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      if (firstDigest) {
        firstDigest = false;
        reachedFingerprint();
        await blocked;
      }
      return digest(algorithm, data);
    });
    const first = runRecoveredDeviceSync();
    await reached;
    editCloudSettings();
    const second = runRecoveredDeviceSync();
    // Allow the queued operation to try its lock, without releasing the first.
    await new Promise<void>(resolve => { setTimeout(resolve, 0); });
    expect(getCount).toBe(1);
    unblock();
    expect(await first).toBe('same');
    expect(await second).toBe('pulled');
    expect(getKnownCloudRevision()).toBe(37);
    const saved = JSON.parse(localStorage.getItem(baseKey())!);
    expect(saved.revision).toBe(37);
    expect(saved.content).toBe(recoveryBackupContent(server.snapshot));
    expect(recoveryBackupContent(await current())).toBe(recoveryBackupContent(server.snapshot));
    expect(await runRecoveredDeviceSync()).toBe('same');
    expect(writes()).toHaveLength(0);
  });

  it('retains the entire previous ancestor on storage failure and safely recovers after an acknowledged upload', async () => {
    await enableRecoveredSync();
    await editLocalInventory();
    const before = localStorage.getItem(baseKey());
    const setItem = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === baseKey()) throw new DOMException('Storage is full', 'QuotaExceededError');
      return setItem.call(this, key, value);
    });
    await expect(runRecoveredDeviceSync()).rejects.toThrow('Storage is full');
    expect(server.revision).toBe(37);
    expect(writes()).toHaveLength(1);
    expect(localStorage.getItem(baseKey())).toBe(before);
    expect(getKnownCloudRevision()).toBe(36);
    expect(hasLocalChangePending()).toBe(true);
    write.mockRestore();
    expect(await runRecoveredDeviceSync()).toBe('same');
    expect(getKnownCloudRevision()).toBe(37);
    expect(hasLocalChangePending()).toBe(false);
    expect(writes()).toHaveLength(1);
  });
});

describe('explicit sync direction', () => {
  it('never uploads from the receive-only action when the local device has changed', async () => {
    await enableRecoveredSync();
    await editLocalInventory();
    const before = recoveryBackupContent(await current());
    await expect(pullCloudToLocal(server.snapshot, 36)).rejects.toThrow('新しい変更を保護');
    expect(writes()).toHaveLength(0);
    expect(recoveryBackupContent(await current())).toBe(before);
  });

  it('never receives from the upload-only action when the cloud has changed', async () => {
    await enableRecoveredSync();
    editCloudSettings();
    await expect(pushLocalToCloud()).rejects.toThrow('同期を保留');
    expect(writes()).toHaveLength(0);
    expect(recoveryBackupContent(await current())).toBe(recoveryBackupContent(source));
    expect(getKnownCloudRevision()).toBe(36);
  });
});
