import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFarmProBackup, type FarmProBackup } from './backup';
import { FARM_PRO_STORE_NAMES, openFarmProDatabase } from './db';
import * as databaseModule from './db';
import { saveRecord } from './repository';
import {
  captureRecoveryBackup, getLatestRecoveryCheckpoint, getRecoveryCheckpoint,
  recoveryBackupContent, saveRecoveryCheckpoint, validateRecoveryBackup,
  type RecoveryCheckpoint, type RecoveryIdentity,
} from './sync-recovery';

const auth = vi.hoisted(() => ({ user: { id: 'owner', farmId: '', farmName: 'Test farm' } }));
vi.mock('../services/authClient', () => ({ getStoredAuthUser: () => auth.user }));

const when = '2026-10-31T05:40:45.074Z';
let identity: RecoveryIdentity;
let serial = 0;

function backup(): FarmProBackup {
  return {
    format: 'farmpro-backup', schemaVersion: 4, appVersion: '1.6.0', exportedAt: when,
    farm: { id: identity.farmId, name: 'Test farm' },
    stores: Object.fromEntries(FARM_PRO_STORE_NAMES.map(name => [name, []])) as unknown as FarmProBackup['stores'],
  };
}

function checkpoint(): RecoveryCheckpoint {
  const before = backup();
  before.stores.cattle = [{ id: 1, name: 'before', createdAt: when, updatedAt: when }];
  const target = backup();
  target.stores.cattle = [{ id: 2, name: 'target', createdAt: when, updatedAt: when }];
  return {
    id: 'checkpoint-1', ...identity, createdAt: when, status: 'prepared', before, target,
    revision: 35, savedAt: when, recordSyncBaseline: { calves: [], metadata: { initialized: true } },
  };
}

beforeEach(() => {
  identity = { farmId: `recovery-storage-test-${++serial}`, userId: 'owner' };
  auth.user = { id: identity.userId, farmId: identity.farmId, farmName: 'Test farm' };
});

describe('recovery snapshot content', () => {
  it('ignores record/key order and export time while preserving all fields and ID types', () => {
    const left = backup();
    left.stores.cattle = [
      { id: 1, name: 'one', updatedAt: when, createdAt: when },
      { id: 2, name: 'two', createdAt: when, updatedAt: when },
    ];
    left.stores.metadata = [{ id: 'farm-settings', postCalvingHeatDays: 40, createdAt: when, updatedAt: when }];
    const right = structuredClone(left);
    right.exportedAt = '2026-10-31T06:00:00.000Z';
    right.stores.cattle.reverse();
    expect(recoveryBackupContent(left)).toBe(recoveryBackupContent(right));
    right.stores.metadata[0].postCalvingHeatDays = 35;
    expect(recoveryBackupContent(left)).not.toBe(recoveryBackupContent(right));
    right.stores.metadata[0].postCalvingHeatDays = 40;
    right.stores.cattle[0].id = '2';
    expect(recoveryBackupContent(left)).not.toBe(recoveryBackupContent(right));
  });

  it('refuses a different farm, duplicate/empty IDs, missing timestamps and unsupported stores', () => {
    const source = checkpoint().target;
    expect(() => validateRecoveryBackup(source, identity)).not.toThrow();
    const cases: FarmProBackup[] = [];
    const otherFarm = structuredClone(source); otherFarm.farm!.id = 'another-farm'; cases.push(otherFarm);
    const duplicate = structuredClone(source); duplicate.stores.cattle.push({ ...duplicate.stores.cattle[0], id: '2' }); cases.push(duplicate);
    const emptyId = structuredClone(source); emptyId.stores.cattle[0].id = ' '; cases.push(emptyId);
    const missingTime = structuredClone(source); delete missingTime.stores.cattle[0].updatedAt; cases.push(missingTime);
    const missingStore = structuredClone(source); delete (missingStore.stores as Partial<FarmProBackup['stores']>).metadata; cases.push(missingStore);
    const mixedFarm = structuredClone(source); mixedFarm.stores.cattle[0].farmId = 'another-farm'; cases.push(mixedFarm);
    for (const value of cases) expect(() => validateRecoveryBackup(value, identity)).toThrow();
  });

  it('captures all stores in one read transaction and leaves authentication untouched', async () => {
    localStorage.setItem('farmpro.authToken', 'unchanged-token');
    localStorage.setItem('farmpro.plan', 'pro');
    await saveRecord('cattle', { id: 7, name: 'cow' });
    await saveRecord('supplyInventory', { id: 'medicine', quantity: 6 });
    await saveRecord('metadata', { id: 'farm-settings', farmName: 'Saved farm name', postCalvingHeatDays: 40 });
    const db = await openFarmProDatabase();
    const transaction = vi.spyOn(db, 'transaction');
    const snapshot = await captureRecoveryBackup(identity);
    expect(transaction).toHaveBeenCalledExactlyOnceWith(FARM_PRO_STORE_NAMES, 'readonly');
    transaction.mockRestore();
    expect(snapshot.farm).toEqual({ id: identity.farmId, name: 'Saved farm name' });
    expect(snapshot.stores.cattle[0].id).toBe(7);
    expect(snapshot.stores.supplyInventory[0].quantity).toBe(6);
    expect(snapshot.stores.metadata[0].postCalvingHeatDays).toBe(40);
    expect(localStorage.getItem('farmpro.authToken')).toBe('unchanged-token');
    expect(localStorage.getItem('farmpro.plan')).toBe('pro');
  });

  it('refuses a session switch while opening the source database', async () => {
    const database = await openFarmProDatabase();
    const opening = vi.spyOn(databaseModule, 'openFarmProDatabase').mockImplementation(async () => {
      auth.user = { ...auth.user, farmId: 'changed-during-open' };
      return database;
    });
    await expect(captureRecoveryBackup(identity)).rejects.toThrow('農場または利用者');
    opening.mockRestore();
  });
});

describe('durable recovery checkpoints', () => {
  it('persists before and target separately from ordinary backups, and allows status updates only', async () => {
    const saved = checkpoint();
    await saveRecoveryCheckpoint({ ...saved, token: 'must-not-be-saved', release() {} } as RecoveryCheckpoint);
    expect(await getRecoveryCheckpoint(identity, saved.id)).toEqual(saved);
    await saveRecoveryCheckpoint({ ...saved, status: 'applying' });
    expect((await getLatestRecoveryCheckpoint(identity))?.status).toBe('applying');
    const altered = structuredClone(saved);
    altered.before.stores.cattle[0].name = 'overwritten';
    await expect(saveRecoveryCheckpoint(altered)).rejects.toThrow('退避内容は変更できません');
    expect((await getRecoveryCheckpoint(identity, saved.id))?.before.stores.cattle[0].name).toBe('before');
    const ordinary = await createFarmProBackup('1.6.0');
    expect(Object.values(ordinary.stores).flat()).toEqual([]);
  });

  it('does not expose checkpoints after an account switch or to another member', async () => {
    const saved = checkpoint();
    await saveRecoveryCheckpoint(saved);
    auth.user = { ...auth.user, id: 'another-member' };
    await expect(getRecoveryCheckpoint(identity, saved.id)).rejects.toThrow('利用者が変わりました');
    expect(await getRecoveryCheckpoint({ ...identity, userId: 'another-member' }, saved.id)).toBeNull();
    await expect(saveRecoveryCheckpoint({ ...saved, userId: 'another-member' })).rejects.toThrow('退避内容は変更できません');
    auth.user = { ...auth.user, farmId: 'another-farm' };
    await expect(captureRecoveryBackup(identity)).rejects.toThrow('農場または利用者');
  });

  it('retains legacy local records with undefined fields and missing timestamps exactly', async () => {
    const database = await openFarmProDatabase();
    const legacyRecord = { id: 11, cloudUpdatedAt: undefined, note: { text: undefined }, observations: [undefined, 'retained'] };
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('calves', 'readwrite');
      transaction.objectStore('calves').put(legacyRecord);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    const saved = checkpoint();
    saved.before = await captureRecoveryBackup(identity);
    await saveRecoveryCheckpoint(saved);
    const actual = await getRecoveryCheckpoint(identity, saved.id);
    expect(actual?.before.stores.calves).toEqual([legacyRecord]);
    expect(Object.prototype.hasOwnProperty.call(actual!.before.stores.calves[0], 'cloudUpdatedAt')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(actual!.before.stores.calves[0], 'createdAt')).toBe(false);
    const omitted = structuredClone(saved.before);
    delete omitted.stores.calves[0].cloudUpdatedAt;
    expect(recoveryBackupContent(omitted)).not.toBe(recoveryBackupContent(saved.before));
    await expect(saveRecoveryCheckpoint({ ...saved, before: omitted })).rejects.toThrow('退避内容は変更できません');
    expect(() => validateRecoveryBackup(saved.before, identity)).toThrow();
  });

  it('rejects a failed checkpoint write and retains the previous durable checkpoint', async () => {
    const saved = checkpoint();
    await saveRecoveryCheckpoint(saved);
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'checkpoints') throw new DOMException('Storage full', 'QuotaExceededError');
      return originalPut.apply(this, args);
    });
    await expect(saveRecoveryCheckpoint({ ...saved, status: 'applying' })).rejects.toThrow('Storage full');
    put.mockRestore();
    expect(await getRecoveryCheckpoint(identity, saved.id)).toEqual(saved);
  });
});
