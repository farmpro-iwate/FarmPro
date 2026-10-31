import 'fake-indexeddb/auto';
import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FarmProBackup } from '../storage/backup';
import { FARM_PRO_STORE_NAMES } from '../storage/db';
import type { StoredRecord } from '../storage/types';

type TestLease = {
  farmId: string; userId: string; token: string;
  assertCurrent(): void; release(): void;
};

const mocks = vi.hoisted(() => ({
  approval: { farmId: '', contentSha256: '', recordCount: 0, totalCount: 0 },
  active: null as TestLease | null,
  onPull: null as ((lease: TestLease) => Promise<void>) | null,
  baseline: vi.fn(),
  establish: vi.fn(),
  released: vi.fn(),
}));

vi.mock('./approvedCloudRecovery', () => ({ APPROVED_CLOUD_RECOVERY: mocks.approval }));
vi.mock('../plans/feature-gate', () => ({ requirePaidFeature: vi.fn() }));
vi.mock('./deviceSync', () => ({
  establishRecoveredSyncBase: async (backup: FarmProBackup, revision: number, lease: TestLease) => {
    lease.assertCurrent();
    mocks.establish(backup, revision, lease);
    localStorage.setItem(`farmpro.cloudRevision.${encodeURIComponent(lease.farmId)}`, String(revision));
  },
}));

// Lock scheduling is covered by syncRecoveryGuard.test. These tests exercise
// orchestration, real IndexedDB transactions and real crypto with a strict lease.
vi.mock('./syncRecoveryGuard', () => {
  const markerKey = (farmId: string) => `farmpro.cloudRecoveryPaused.${encodeURIComponent(farmId)}`;
  const user = () => JSON.parse(localStorage.getItem('farmpro.authUser') || 'null') as { id: string; farmId: string } | null;
  const paused = () => Boolean(user()?.farmId && localStorage.getItem(markerKey(user()!.farmId)));
  const assertAccess = (permit?: { farmId: string; userId: string }) => {
    if (permit) {
      if (permit !== mocks.active) throw new Error('Invalid recovery permit');
      mocks.active!.assertCurrent();
    } else if (paused()) throw new Error('Recovery is paused');
  };
  return {
    isCloudRecoveryPaused: paused,
    assertRecoveryStorageAccess: assertAccess,
    assertCloudWriteAllowed: () => assertAccess(),
    beginCloudRecovery: async (): Promise<TestLease> => {
      const identity = user();
      const token = localStorage.getItem('farmpro.authToken') || '';
      if (!identity || !token || mocks.active) throw new Error('Cannot acquire recovery lease');
      const lease: TestLease = {
        farmId: identity.farmId, userId: identity.id, token,
        assertCurrent() {
          if (mocks.active !== lease || user()?.farmId !== lease.farmId || user()?.id !== lease.userId ||
              localStorage.getItem('farmpro.authToken') !== token || !localStorage.getItem(markerKey(lease.farmId))) {
            throw new Error('ログイン中の農場が変わりました');
          }
        },
        release() {
          if (mocks.active === lease) {
            localStorage.removeItem(markerKey(lease.farmId));
            mocks.active = null;
            mocks.released();
          }
        },
      };
      localStorage.setItem(markerKey(identity.farmId), 'paused');
      mocks.active = lease;
      return lease;
    },
    setRecoveryRecordBaseline: (lease: TestLease, baseline: Record<string, unknown>) => {
      lease.assertCurrent();
      mocks.baseline(baseline);
    },
  };
});

vi.mock('./api', () => ({ pullNewerCattleRecordsFromCloud: async (lease: TestLease) => { await mocks.onPull?.(lease); } }));
vi.mock('./masterApi', () => ({ pullMasterRecordsFromCloud: vi.fn(async () => undefined) }));
vi.mock('./calfApi', () => ({ pullCalfChangesFromCloud: vi.fn(async () => undefined) }));
vi.mock('./breedingApi', () => ({ pullNewerBreedingRecordsFromCloud: vi.fn(async () => undefined) }));
vi.mock('./calvingsApi', () => ({ pullNewerCalvingRecordsFromCloud: vi.fn(async () => undefined) }));
vi.mock('./calvingRecordSync', () => ({ pullNewerCalvingRecordsFromCloud: vi.fn(async () => undefined) }));
vi.mock('./treatmentApi', () => ({ pullTreatmentChangesFromCloud: vi.fn(async () => undefined) }));
vi.mock('./vaccineApi', () => ({ pullVaccineChangesFromCloud: vi.fn(async () => undefined) }));
vi.mock('./scheduleApi', () => ({ pullScheduleChangesFromCloud: vi.fn(async () => undefined) }));
vi.mock('./feedInventoryApi', () => ({ pullFeedInventoryChangesFromCloud: vi.fn(async () => undefined) }));
vi.mock('./feedingsApi', () => ({ pullFeedingChangesFromCloud: vi.fn(async () => undefined) }));
vi.mock('./feedingGuideApi', () => ({ pullFeedingGuideChangesFromCloud: vi.fn(async () => undefined) }));
vi.mock('./salesApi', () => ({ pullSaleChangesFromCloud: vi.fn(async () => undefined) }));
vi.mock('./expensesApi', () => ({ pullExpenseChangesFromCloud: vi.fn(async () => undefined) }));
vi.mock('./settingsApi', () => ({ getFarmSettingsForPageOpen: vi.fn(async () => undefined) }));
vi.mock('./alertSettings', () => ({ getAlertSettings: vi.fn(async () => undefined) }));
vi.mock('./marketShippingPlanApi', () => ({ pullMarketShippingPlanSettings: vi.fn(async () => undefined) }));

let service: typeof import('./cloudDeviceRecovery');
let storage: typeof import('../storage/sync-recovery');
let databaseModule: typeof import('../storage/db');
let nativeDatabase: IDBDatabase;
let original: FarmProBackup;
let target: FarmProBackup;
let initialContent: string;
let sequence = 0;
const when = '2026-10-31T05:40:45.074Z';
let authUser: { id: string; farmId: string; farmName: string; role: string; active: boolean; plan: string };
let revision: number;
let recordResponses: Record<string, unknown>;
let requestHook: ((url: string) => void) | null;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if ((init?.method || 'GET') !== 'GET') throw new Error(`Unexpected cloud mutation: ${url}`);
  requestHook?.(url);
  if (url === '/api/auth/me') return new Response(JSON.stringify({ user: authUser }), { status: 200 });
  if (url === '/api/cloud-snapshots/latest') {
    return new Response(JSON.stringify({ revision, savedAt: when, snapshot: target }), { status: 200 });
  }
  if (Object.prototype.hasOwnProperty.call(recordResponses, url)) {
    return new Response(JSON.stringify(recordResponses[url]), { status: 200 });
  }
  if (url.endsWith('/record-sync')) return new Response('[]', { status: 200 });
  if (['/api/farm-settings', '/api/alert-settings', '/api/market-shipping-plan'].includes(url)) {
    return new Response(JSON.stringify({ updatedAt: when }), { status: 200 });
  }
  throw new Error(`Unexpected request: ${url}`);
});

function fixture(farmId: string): FarmProBackup {
  const stores = Object.fromEntries(FARM_PRO_STORE_NAMES.map((name, index) => [name,
    [{ id: index + 1, label: name, createdAt: when, updatedAt: when }],
  ])) as unknown as FarmProBackup['stores'];
  stores.metadata = [
    { id: 'farm-settings', farmName: 'Recovery test farm', postCalvingHeatDays: 40, createdAt: when, updatedAt: when },
    { id: 'database', schemaVersion: 4, createdAt: when, updatedAt: when },
  ];
  return { format: 'farmpro-backup', schemaVersion: 4, appVersion: '1.6.0', exportedAt: when, farm: { id: farmId, name: 'Recovery test farm' }, stores };
}

function currentIdentity() { return { farmId: authUser.farmId, userId: authUser.id }; }
function pauseKey() { return `farmpro.cloudRecoveryPaused.${encodeURIComponent(authUser.farmId)}`; }
async function capture() { return storage.captureRecoveryBackup(mocks.active ?? currentIdentity()); }
function ordered(rows: StoredRecord[]) { return [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id))); }
function expectOnlyCloudReads() {
  expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
  expect(fetchMock.mock.calls.every(([, init]) => (init?.method || 'GET') === 'GET')).toBe(true);
}

async function directWrite(storeName: 'calves' | 'metadata', row: StoredRecord): Promise<void> {
  // Simulates a write queued by an older tab which does not know the new lock.
  await new Promise<void>((resolve, reject) => {
    const tx = nativeDatabase.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(row);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  localStorage.clear();
  mocks.active = null;
  mocks.onPull = null;
  requestHook = null;
  recordResponses = {};
  revision = 36; // Generation 35 is historical evidence, never a hardcoded live value.
  mocks.approval.farmId = `cloud-recovery-orchestration-${++sequence}`;
  authUser = { id: 'test-owner', farmId: mocks.approval.farmId, farmName: 'Recovery test farm', role: 'owner', active: true, plan: 'pro' };
  localStorage.setItem('farmpro.authUser', JSON.stringify(authUser));
  localStorage.setItem('farmpro.authToken', 'session-that-must-not-be-stored-in-checkpoint');
  localStorage.setItem('farmpro.plan', 'pro');
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', fetchMock);
  storage = await import('../storage/sync-recovery');
  databaseModule = await import('../storage/db');
  target = fixture(authUser.farmId);
  mocks.approval.contentSha256 = createHash('sha256').update(storage.recoveryBackupContent(target)).digest('hex');
  mocks.approval.recordCount = FARM_PRO_STORE_NAMES.filter(name => name !== 'metadata').reduce((sum, name) => sum + target.stores[name].length, 0);
  mocks.approval.totalCount = Object.values(target.stores).flat().length;
  original = structuredClone(target);
  original.stores.supplyInventory = [];
  original.stores.calves = [
    { id: 'obsolete-calf', label: 'before', createdAt: when, updatedAt: when },
    { id: 'duplicate-calf', label: 'before duplicate', createdAt: when, updatedAt: when },
  ];
  original.stores.metadata[0].postCalvingHeatDays = 35;
  await (await import('../storage/backup-restore')).restoreFarmProBackup(original);
  nativeDatabase = await databaseModule.openFarmProDatabase();
  initialContent = storage.recoveryBackupContent(await capture());
  service = await import('./cloudDeviceRecovery');
});

afterEach(() => { mocks.active = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('cloud recovery preparation and confirmation', () => {
  it('only reads the cloud and durably saves before-data, using current generation 36', async () => {
    const credentials = [localStorage.getItem('farmpro.authUser'), localStorage.getItem('farmpro.authToken'), localStorage.getItem('farmpro.plan')];
    const preview = await service.prepareCloudRecovery();
    expect(preview.cloudRevision).toBe(36);
    expect(preview.status).toBe('prepared');
    expect(storage.recoveryBackupContent(await capture())).toBe(initialContent);
    const saved = await storage.getRecoveryCheckpoint(currentIdentity(), preview.id);
    expect(saved?.status).toBe('prepared');
    expect(ordered(saved!.before.stores.calves)).toEqual(ordered(original.stores.calves));
    expect(saved?.target).toEqual(target);
    expect(saved).not.toHaveProperty('token');
    expect(JSON.stringify(saved)).not.toContain('session-that-must-not-be-stored');
    expect(localStorage.getItem(pauseKey())).toBeTruthy();
    expect(mocks.establish).not.toHaveBeenCalled();
    expect([localStorage.getItem('farmpro.authUser'), localStorage.getItem('farmpro.authToken'), localStorage.getItem('farmpro.plan')]).toEqual(credentials);
    expectOnlyCloudReads();
  });

  it('refuses a same-farm snapshot that differs from the approved source digest', async () => {
    target.stores.metadata[0].postCalvingHeatDays = 25;
    await expect(service.prepareCloudRecovery()).rejects.toThrow('PC正本と全内容が一致しません');
    expect(storage.recoveryBackupContent(await capture())).toBe(initialContent);
    expect(await storage.getLatestRecoveryCheckpoint(currentIdentity())).toBeNull();
    expect(localStorage.getItem(pauseKey())).toBeNull();
    expectOnlyCloudReads();
  });

  it('refuses a different authenticated server farm without changing this device', async () => {
    const owner = { ...authUser };
    authUser = { ...authUser, farmId: 'wrong-server-farm' };
    await expect(service.prepareCloudRecovery()).rejects.toThrow('農場が一致しません');
    authUser = owner;
    expect(storage.recoveryBackupContent(await capture())).toBe(initialContent);
    expect(mocks.establish).not.toHaveBeenCalled();
  });

  it('reopens the durable checkpoint after module reload while retaining the pause', async () => {
    const preview = await service.prepareCloudRecovery();
    mocks.active = null; // Tab was lost; durable marker and IndexedDB remain.
    vi.resetModules();
    service = await import('./cloudDeviceRecovery');
    const pending = await service.getPendingCloudRecovery();
    expect(pending?.id).toBe(preview.id);
    expect(pending?.status).toBe('prepared');
    expect(storage.recoveryBackupContent(await capture())).toBe(initialContent);
    expect(localStorage.getItem(pauseKey())).toBeTruthy();
  });

  it('keeps the original data when durable checkpoint storage fails', async () => {
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'checkpoints') throw new DOMException('Storage full', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(service.prepareCloudRecovery()).rejects.toThrow('Storage full');
    expect(storage.recoveryBackupContent(await capture())).toBe(initialContent);
    expect(await storage.getLatestRecoveryCheckpoint(currentIdentity())).toBeNull();
    expect(mocks.establish).not.toHaveBeenCalled();
    expectOnlyCloudReads();
  });
});

describe('confirmation drift and exact receive', () => {
  it('refuses a new live generation after confirmation and keeps syncing paused', async () => {
    const preview = await service.prepareCloudRecovery();
    revision = 37;
    await expect(service.applyCloudRecovery(preview.id)).rejects.toThrow('世代または内容が変わりました');
    expect(storage.recoveryBackupContent(await capture())).toBe(initialContent);
    expect((await storage.getRecoveryCheckpoint(currentIdentity(), preview.id))?.status).toBe('failed');
    expect(localStorage.getItem(pauseKey())).toBeTruthy();
    expectOnlyCloudReads();
  });

  it('refuses an individual-record change after confirmation', async () => {
    recordResponses['/api/calves/record-sync'] = [{ id: 'cloud-calf', name: 'before' }];
    const preview = await service.prepareCloudRecovery();
    recordResponses['/api/calves/record-sync'] = [{ id: 'cloud-calf', name: 'after' }];
    await expect(service.applyCloudRecovery(preview.id)).rejects.toThrow('個別同期の内容が変わりました');
    expect(storage.recoveryBackupContent(await capture())).toBe(initialContent);
    expect(localStorage.getItem(pauseKey())).toBeTruthy();
  });

  it('refuses a reordered field array within one individual record', async () => {
    recordResponses['/api/calves/record-sync'] = [{ id: 'cloud-calf', observations: ['first', 'second'] }];
    const preview = await service.prepareCloudRecovery();
    recordResponses['/api/calves/record-sync'] = [{ id: 'cloud-calf', observations: ['second', 'first'] }];
    await expect(service.applyCloudRecovery(preview.id)).rejects.toThrow('個別同期の内容が変わりました');
    expect(storage.recoveryBackupContent(await capture())).toBe(initialContent);
  });

  it('preserves a local write made after preview and refuses replacement', async () => {
    const preview = await service.prepareCloudRecovery();
    await directWrite('metadata', { ...original.stores.metadata[0], postCalvingHeatDays: 45 });
    await expect(service.applyCloudRecovery(preview.id)).rejects.toThrow('この端末の内容が変わりました');
    expect((await capture()).stores.metadata.find(row => row.id === 'farm-settings')?.postCalvingHeatDays).toBe(45);
    expect(ordered((await capture()).stores.calves)).toEqual(ordered(original.stores.calves));
    expect(localStorage.getItem(pauseKey())).toBeTruthy();
  });

  it('receives every store exactly, including metadata, without resuming before verification', async () => {
    const preview = await service.prepareCloudRecovery();
    const result = await service.applyCloudRecovery(preview.id);
    expect(result).toMatchObject({ verified: false, revision: 36 });
    const received = await capture();
    for (const name of FARM_PRO_STORE_NAMES) expect(ordered(received.stores[name])).toEqual(ordered(target.stores[name]));
    expect(storage.recoveryBackupContent(received)).toBe(storage.recoveryBackupContent(target));
    expect(ordered((await storage.getRecoveryCheckpoint(currentIdentity(), preview.id))!.before.stores.calves)).toEqual(ordered(original.stores.calves));
    expect((await storage.getRecoveryCheckpoint(currentIdentity(), preview.id))?.status).toBe('applied');
    expect(mocks.establish).not.toHaveBeenCalled();
    expect(localStorage.getItem(pauseKey())).toBeTruthy();
    expectOnlyCloudReads();
  });

  it('keeps every original store when a target write fails after earlier stores were cleared', async () => {
    const preview = await service.prepareCloudRecovery();
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'supplyInventory') throw new DOMException('Target write failed', 'QuotaExceededError');
      return originalPut.apply(this, args);
    });
    await expect(service.applyCloudRecovery(preview.id)).rejects.toThrow('復元処理に失敗');
    expect(storage.recoveryBackupContent(await capture())).toBe(initialContent);
    expect((await storage.getRecoveryCheckpoint(currentIdentity(), preview.id))?.status).toBe('failed');
    expect(localStorage.getItem(pauseKey())).toBeTruthy();
    expect(mocks.establish).not.toHaveBeenCalled();
  });

  it('rejects a session switch during a request before any local replacement', async () => {
    const preview = await service.prepareCloudRecovery();
    requestHook = url => {
      if (url === '/api/cloud-snapshots/latest') localStorage.setItem('farmpro.authUser', JSON.stringify({ ...authUser, farmId: 'another-farm' }));
    };
    await expect(service.applyCloudRecovery(preview.id)).rejects.toThrow('農場が変わりました');
    expect(localStorage.getItem(pauseKey())).toBeTruthy();
    requestHook = null;
    localStorage.setItem('farmpro.authUser', JSON.stringify(authUser));
    expect(storage.recoveryBackupContent(await capture())).toBe(initialContent);
    expect(mocks.establish).not.toHaveBeenCalled();
  });
});

describe('ordinary-sync verification before resuming', () => {
  it('prepares a fresh confirmation at the new generation after verification failed, retaining the original before-data', async () => {
    const previous = await service.prepareCloudRecovery();
    await service.applyCloudRecovery(previous.id);
    const originalCheckpoint = await storage.getRecoveryCheckpoint(currentIdentity(), previous.id);
    revision += 1;
    await expect(service.verifyAndResumeCloudRecovery(previous.id)).rejects.toThrow('世代または内容が変わりました');
    expect((await storage.getRecoveryCheckpoint(currentIdentity(), previous.id))?.status).toBe('failed');
    expect(localStorage.getItem(pauseKey())).toBeTruthy();
    const next = await service.prepareCloudRecovery();
    expect(next.id).not.toBe(previous.id);
    expect(next.cloudRevision).toBe(37);
    expect(next.status).toBe('prepared');
    expect(next.alreadyMatches).toBe(true);
    expect(localStorage.getItem(pauseKey())).toBeTruthy();
    expect(mocks.establish).not.toHaveBeenCalled();
    const newCheckpoint = await storage.getRecoveryCheckpoint(currentIdentity(), next.id);
    expect(storage.recoveryBackupContent(newCheckpoint!.before)).toBe(storage.recoveryBackupContent(target));
    expect((await storage.getRecoveryCheckpoint(currentIdentity(), previous.id))?.before).toEqual(originalCheckpoint!.before);
    // The new generation is not accepted until the user confirms and verifies.
    expect((await service.applyCloudRecovery(next.id)).verified).toBe(false);
    expect((await service.verifyAndResumeCloudRecovery(next.id)).verified).toBe(true);
    expect(mocks.establish.mock.calls[0][1]).toBe(37);
    expect(localStorage.getItem(pauseKey())).toBeNull();
    expect(storage.recoveryBackupContent(await capture())).toBe(storage.recoveryBackupContent(target));
    expect((await storage.getRecoveryCheckpoint(currentIdentity(), previous.id))?.before).toEqual(originalCheckpoint!.before);
    expectOnlyCloudReads();
  });

  it('still refuses a changed source after failed verification and keeps the received target and original checkpoint', async () => {
    const previous = await service.prepareCloudRecovery();
    await service.applyCloudRecovery(previous.id);
    const received = await capture();
    const originalCheckpoint = await storage.getRecoveryCheckpoint(currentIdentity(), previous.id);
    revision += 1;
    await expect(service.verifyAndResumeCloudRecovery(previous.id)).rejects.toThrow('世代または内容が変わりました');
    target.stores.metadata.find(row => row.id === 'farm-settings')!.postCalvingHeatDays = 49;
    await expect(service.prepareCloudRecovery()).rejects.toThrow('PC正本と全内容が一致しません');
    expect(storage.recoveryBackupContent(await capture())).toBe(storage.recoveryBackupContent(received));
    expect((await storage.getLatestRecoveryCheckpoint(currentIdentity()))?.id).toBe(previous.id);
    expect((await storage.getRecoveryCheckpoint(currentIdentity(), previous.id))?.before).toEqual(originalCheckpoint!.before);
    expect(localStorage.getItem(pauseKey())).toBeTruthy();
    expect(mocks.establish).not.toHaveBeenCalled();
    expectOnlyCloudReads();
  });

  it('establishes the current revision and resumes only after ordinary reads preserve every field', async () => {
    const preview = await service.prepareCloudRecovery();
    await service.applyCloudRecovery(preview.id);
    const result = await service.verifyAndResumeCloudRecovery(preview.id);
    expect(result.verified).toBe(true);
    expect(mocks.baseline).toHaveBeenCalledOnce();
    expect(mocks.establish).toHaveBeenCalledOnce();
    expect(mocks.establish.mock.calls[0][1]).toBe(36);
    expect(localStorage.getItem(pauseKey())).toBeNull();
    expect((await storage.getRecoveryCheckpoint(currentIdentity(), preview.id))?.status).toBe('verified');
    expect(await service.getPendingCloudRecovery()).toBeNull();
    expect((await import('./calvingRecordSync')).pullNewerCalvingRecordsFromCloud).toHaveBeenCalledOnce();
    expect(storage.recoveryBackupContent(await capture())).toBe(storage.recoveryBackupContent(target));
    expectOnlyCloudReads();
  });

  it.each([false, true])('requires fresh verification for a saved verified checkpoint whose pause survived a crash (remote changes: %s)', async remoteChanges => {
    const preview = await service.prepareCloudRecovery();
    await service.applyCloudRecovery(preview.id);
    await service.verifyAndResumeCloudRecovery(preview.id);
    // Persisted state at the crash boundary: verified is durable, but the
    // original tab never completed removal of its pause marker.
    localStorage.setItem(pauseKey(), 'interrupted-before-release');
    mocks.active = null;
    mocks.establish.mockClear();
    mocks.released.mockClear();
    vi.resetModules();
    service = await import('./cloudDeviceRecovery');
    const pending = await service.getPendingCloudRecovery();
    expect(pending?.id).toBe(preview.id);
    expect(pending?.status).toBe('applied');
    expect((await storage.getRecoveryCheckpoint(currentIdentity(), preview.id))?.status).toBe('applied');
    expect(localStorage.getItem(pauseKey())).toBeTruthy();
    expect(mocks.establish).not.toHaveBeenCalled();
    expect(mocks.released).not.toHaveBeenCalled();
    expect(storage.recoveryBackupContent(await capture())).toBe(storage.recoveryBackupContent(target));
    if (remoteChanges) {
      revision += 1;
      await expect(service.verifyAndResumeCloudRecovery(preview.id)).rejects.toThrow('世代または内容が変わりました');
      expect(localStorage.getItem(pauseKey())).toBeTruthy();
      expect(mocks.released).not.toHaveBeenCalled();
      expect(mocks.establish).not.toHaveBeenCalled();
    } else {
      expect((await service.verifyAndResumeCloudRecovery(preview.id)).verified).toBe(true);
      expect(localStorage.getItem(pauseKey())).toBeNull();
      expect(mocks.establish).toHaveBeenCalledOnce();
      expect(mocks.released).toHaveBeenCalledOnce();
    }
  });

  it('protects newer local data when another preparation crashed before replacing an older verified checkpoint', async () => {
    const previous = await service.prepareCloudRecovery();
    await service.applyCloudRecovery(previous.id);
    await service.verifyAndResumeCloudRecovery(previous.id);
    const savedPrevious = await storage.getRecoveryCheckpoint(currentIdentity(), previous.id);
    await directWrite('metadata', { ...target.stores.metadata[0], postCalvingHeatDays: 48 });
    const currentBefore = await capture();
    // A subsequent prepare paused the farm and then the tab closed before it
    // committed a new checkpoint. The older completed checkpoint still exists.
    localStorage.setItem(pauseKey(), 'later-prepare-interrupted');
    mocks.active = null;
    mocks.released.mockClear();
    vi.resetModules();
    service = await import('./cloudDeviceRecovery');
    const pending = await service.getPendingCloudRecovery();
    expect(pending?.id).toBe(previous.id);
    expect(pending?.status).toBe('failed');
    expect(mocks.released).not.toHaveBeenCalled();
    expect(storage.recoveryBackupContent(await capture())).toBe(storage.recoveryBackupContent(currentBefore));
    await expect(service.verifyAndResumeCloudRecovery(previous.id)).rejects.toThrow('受信が完了していません');
    expect(storage.recoveryBackupContent(await capture())).toBe(storage.recoveryBackupContent(currentBefore));
    const next = await service.prepareCloudRecovery();
    expect(next.id).not.toBe(previous.id);
    const savedNext = await storage.getRecoveryCheckpoint(currentIdentity(), next.id);
    expect(storage.recoveryBackupContent(savedNext!.before)).toBe(storage.recoveryBackupContent(currentBefore));
    expect((await storage.getRecoveryCheckpoint(currentIdentity(), previous.id))?.before).toEqual(savedPrevious!.before);
    await service.cancelCloudRecovery(next.id);
    expect(localStorage.getItem(pauseKey())).toBeNull();
    expect(storage.recoveryBackupContent(await capture())).toBe(storage.recoveryBackupContent(currentBefore));
    expectOnlyCloudReads();
  });

  it('leaves another farm database and the original authentication and plan unchanged', async () => {
    const previousUser = localStorage.getItem('farmpro.authUser')!;
    const previousToken = localStorage.getItem('farmpro.authToken');
    const previousPlan = localStorage.getItem('farmpro.plan');
    const otherFarm = `${authUser.farmId}-other`;
    localStorage.setItem('farmpro.authUser', JSON.stringify({ ...authUser, id: 'other-owner', farmId: otherFarm }));
    const otherBackup = fixture(otherFarm);
    otherBackup.stores.calves[0].label = 'protected other farm';
    await (await import('../storage/backup-restore')).restoreFarmProBackup(otherBackup);
    const otherBefore = storage.recoveryBackupContent(await storage.captureRecoveryBackup({ farmId: otherFarm, userId: 'other-owner' }));
    localStorage.setItem('farmpro.authUser', previousUser);
    nativeDatabase = await databaseModule.openFarmProDatabase();
    const preview = await service.prepareCloudRecovery();
    await service.applyCloudRecovery(preview.id);
    await service.verifyAndResumeCloudRecovery(preview.id);
    expect(localStorage.getItem('farmpro.authUser')).toBe(previousUser);
    expect(localStorage.getItem('farmpro.authToken')).toBe(previousToken);
    expect(localStorage.getItem('farmpro.plan')).toBe(previousPlan);
    localStorage.setItem('farmpro.authUser', JSON.stringify({ ...authUser, id: 'other-owner', farmId: otherFarm }));
    expect(storage.recoveryBackupContent(await storage.captureRecoveryBackup({ farmId: otherFarm, userId: 'other-owner' }))).toBe(otherBefore);
  });

  it.each([false, true])('rolls back an old record reintroduced by ordinary pulls (pull also throws: %s)', async throws => {
    const preview = await service.prepareCloudRecovery();
    await service.applyCloudRecovery(preview.id);
    mocks.onPull = async lease => {
      const repository = await import('../storage/repository');
      await repository.saveRecord('calves', { id: 'resurrected-duplicate', createdAt: when, updatedAt: when }, lease);
      if (throws) throw new Error('A later request failed');
    };
    await expect(service.verifyAndResumeCloudRecovery(preview.id)).rejects.toThrow();
    expect(storage.recoveryBackupContent(await capture())).toBe(storage.recoveryBackupContent(target));
    expect((await storage.getRecoveryCheckpoint(currentIdentity(), preview.id))?.status).toBe('failed');
    expect(localStorage.getItem(pauseKey())).toBeTruthy();
    expect(mocks.establish).not.toHaveBeenCalled();
    expectOnlyCloudReads();
  });
});
