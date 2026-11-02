import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import { getFarmProPlan } from '../plans/policy';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { openFarmProDatabase } from '../storage/db';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { Master, MasterCategory, MasterInput } from '../types/master';
import {
  deleteMasterRecordFromSyncStore,
  fetchSyncedMasterRecords,
  pushMasterRecordToSyncStore,
  toSyncedMasterRecord,
  type SyncedMasterRecord,
} from './masterRecordSyncApi';

const STORE_NAME = 'masters' as const;

type StoredMaster = Master & {
  syncId?: string;
  cloudUpdatedAt?: string;
  masterSyncFreeEditPending?: true;
};

export type MasterMigrationPreview = {
  unregistered: number;
  matched: number;
  conflicts: number;
};

export type MasterMigrationResult = {
  migrated: number;
  preview: MasterMigrationPreview;
};

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

function masterKey(master: Pick<Master, 'category' | 'name'>) {
  return `${master.category}:${master.name.trim().toLocaleLowerCase()}`;
}

function isCloudNewer(local: StoredMaster, cloud: SyncedMasterRecord) {
  const localUpdatedAt = String(local.updatedAt || '');
  const cloudUpdatedAt = String(cloud.updatedAt || cloud.cloudUpdatedAt || '');
  return !localUpdatedAt || !cloudUpdatedAt || cloudUpdatedAt >= localUpdatedAt;
}

function nextLocalId(masters: StoredMaster[]) {
  return masters.reduce((max, master) => Math.max(max, Number(master.id) || 0), 0) + 1;
}

function masterSyncContext(): string {
  const user = getStoredAuthUser();
  return JSON.stringify([getCurrentFarmProPlanId(), getAuthToken(), user?.farmId, user?.id]);
}

function comparableMasterValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparableMasterValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => [key, comparableMasterValue(entry)]));
}

function sameMasterValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(comparableMasterValue(left)) === JSON.stringify(comparableMasterValue(right));
}

/** The original and the Free edit marker must still match when a read/ACK is applied. */
async function changeMatchingMaster(context: string, id: number, original: StoredMaster | undefined,
  next: StoredMaster | undefined, allowProtectedEdit = false): Promise<boolean> {
  if (masterSyncContext() !== context) return false;
  const db = await openFarmProDatabase();
  if (masterSyncContext() !== context) return false;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite'); const store = tx.objectStore(STORE_NAME);
    let applied = false;
    tx.oncomplete = () => resolve(applied);
    tx.onabort = () => reject(tx.error ?? new Error('マスターの同期結果を保存できませんでした。'));
    const read = store.get(id);
    read.onsuccess = () => {
      const current = read.result as StoredMaster | undefined;
      if (masterSyncContext() !== context || !sameMasterValue(current, original) ||
          (!allowProtectedEdit && current?.masterSyncFreeEditPending)) return;
      if (next) store.put(next); else store.delete(id);
      applied = true;
    };
  });
}

async function acknowledgeMaster(master: StoredMaster, synced: SyncedMasterRecord, context: string): Promise<void> {
  if (master.masterSyncFreeEditPending) {
    const wire = toSyncedMasterRecord(master);
    if (!synced || synced.id !== wire.id || synced.deletedAt || !Number.isFinite(Date.parse(synced.cloudUpdatedAt ?? '')) ||
        Object.entries(wire).some(([key, value]) => key !== 'cloudUpdatedAt' &&
          !sameMasterValue(value, (synced as unknown as Record<string, unknown>)[key]))) {
      throw new Error('マスターの保存結果を確認できません。端末の編集内容を保持しています。');
    }
  }
  const { masterSyncFreeEditPending: _localEdit, ...content } = master;
  const acknowledged: StoredMaster = { ...content, syncId: synced.id, cloudUpdatedAt: synced.cloudUpdatedAt };
  if (!await changeMatchingMaster(context, master.id, master, acknowledged, true)) {
    throw new Error('端末の情報が変わったため、古いマスターの保存結果は反映していません。');
  }
}

async function syncSavedMaster(master: StoredMaster, context: string, cloudEnabled: boolean) {
  if (!cloudEnabled || masterSyncContext() !== context) return;

  try {
    const synced = await pushMasterRecordToSyncStore(master);
    await acknowledgeMaster(master, synced, context);
  } catch (error) {
    console.warn('マスターは端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
}

async function pullMasterRecordsFromCloud() {
  if (!shouldUseCloudSync()) return;

  const context = masterSyncContext();
  try {
    const [cloudRecords, localRecords] = await Promise.all([
      fetchSyncedMasterRecords(),
      getAllRecords<StoredMaster>(STORE_NAME),
    ]);

    const localBySyncId = new Map<string, StoredMaster>();
    const localByKey = new Map<string, StoredMaster[]>();

    for (const local of localRecords) {
      const syncId = String(local.syncId || '').trim();
      if (syncId) localBySyncId.set(syncId, local);

      const key = masterKey(local);
      const matches = localByKey.get(key) ?? [];
      matches.push(local);
      localByKey.set(key, matches);
    }

    let allocatedId = nextLocalId(localRecords);

    for (const cloud of cloudRecords) {
      const bySyncId = localBySyncId.get(String(cloud.id));
      const byKey = localByKey.get(masterKey(cloud)) ?? [];
      const local = bySyncId ?? (byKey.length === 1 ? byKey[0] : undefined);
      if (local?.masterSyncFreeEditPending) continue;

      if (cloud.deletedAt) {
        if (!local) continue;
        if (String(cloud.deletedAt) < String(local.updatedAt || '')) continue;
        await changeMatchingMaster(context, local.id, local, undefined);
        continue;
      }

      if (local && !isCloudNewer(local, cloud)) {
        if (!local.syncId) {
          await changeMatchingMaster(context, local.id, local, {
            ...local,
            syncId: cloud.id,
            cloudUpdatedAt: cloud.cloudUpdatedAt,
          });
        }
        continue;
      }

      const candidateLegacyId = Number(cloud.legacyId);
      const legacyIdAvailable =
        Number.isInteger(candidateLegacyId) &&
        candidateLegacyId > 0 &&
        !localRecords.some((record) => Number(record.id) === candidateLegacyId);
      const id = local?.id ?? (legacyIdAvailable ? candidateLegacyId : allocatedId++);

      const merged: StoredMaster = {
        id,
        category: cloud.category,
        name: cloud.name,
        code: cloud.code,
        earTag: cloud.earTag,
        note: cloud.note,
        meatWithdrawalDays: cloud.meatWithdrawalDays,
        milkWithdrawalHours: cloud.milkWithdrawalHours,
        withdrawalNote: cloud.withdrawalNote,
        autoCalculateWithdrawal: cloud.autoCalculateWithdrawal,
        active: cloud.active,
        createdAt: cloud.createdAt || local?.createdAt || new Date().toISOString(),
        updatedAt: cloud.updatedAt || cloud.cloudUpdatedAt || new Date().toISOString(),
        syncId: cloud.id,
        cloudUpdatedAt: cloud.cloudUpdatedAt,
      };

      await changeMatchingMaster(context, id, local, merged);
    }
  } catch (error) {
    console.warn('マスターのクラウド読込に失敗したため、端末内データを使用します。', error);
  }
}

export async function getMasterMigrationPreview(): Promise<MasterMigrationPreview> {
  if (!shouldUseCloudSync()) {
    return { unregistered: 0, matched: 0, conflicts: 0 };
  }

  const [localRecords, cloudRecords] = await Promise.all([
    getAllRecords<StoredMaster>(STORE_NAME),
    fetchSyncedMasterRecords(),
  ]);

  const cloudById = new Map(cloudRecords.map((record) => [String(record.id), record]));
  const cloudByKey = new Map<string, SyncedMasterRecord[]>();

  for (const cloud of cloudRecords) {
    const key = masterKey(cloud);
    const matches = cloudByKey.get(key) ?? [];
    matches.push(cloud);
    cloudByKey.set(key, matches);
  }

  const preview: MasterMigrationPreview = {
    unregistered: 0,
    matched: 0,
    conflicts: 0,
  };

  for (const local of localRecords) {
    const syncId = String(local.syncId || '').trim();
    if (syncId) {
      const cloud = cloudById.get(syncId);
      if (cloud && !cloud.deletedAt) {
        preview.matched += 1;
      } else {
        preview.conflicts += 1;
      }
      continue;
    }

    const sameKey = cloudByKey.get(masterKey(local)) ?? [];
    const activeMatches = sameKey.filter((record) => !record.deletedAt);
    const deletedMatches = sameKey.filter((record) => Boolean(record.deletedAt));

    if (activeMatches.length === 1 && deletedMatches.length === 0) {
      preview.matched += 1;
    } else if (activeMatches.length === 0 && deletedMatches.length === 0) {
      preview.unregistered += 1;
    } else {
      preview.conflicts += 1;
    }
  }

  return preview;
}

export async function executeMasterMigration(): Promise<MasterMigrationResult> {
  if (!shouldUseCloudSync()) {
    throw new Error('このプランではクラウド同期を利用できません。');
  }
  const context = masterSyncContext();

  const before = await getMasterMigrationPreview();
  if (before.conflicts > 0) {
    throw new Error(`衝突が${before.conflicts}件あるため、移行を中止しました。`);
  }

  const [localRecords, cloudRecords] = await Promise.all([
    getAllRecords<StoredMaster>(STORE_NAME),
    fetchSyncedMasterRecords(),
  ]);

  const cloudById = new Map(cloudRecords.map((record) => [String(record.id), record]));
  const cloudByKey = new Map<string, SyncedMasterRecord[]>();
  for (const cloud of cloudRecords) {
    const key = masterKey(cloud);
    const matches = cloudByKey.get(key) ?? [];
    matches.push(cloud);
    cloudByKey.set(key, matches);
  }

  let migrated = 0;

  for (const local of localRecords) {
    const syncId = String(local.syncId || '').trim();
    if (syncId) {
      const cloud = cloudById.get(syncId);
      if (!cloud || cloud.deletedAt) {
        throw new Error(`「${local.name}」の同期状態が変わったため、移行を中止しました。`);
      }
      continue;
    }

    const sameKey = cloudByKey.get(masterKey(local)) ?? [];
    const activeMatches = sameKey.filter((record) => !record.deletedAt);
    const deletedMatches = sameKey.filter((record) => Boolean(record.deletedAt));

    if (activeMatches.length === 1 && deletedMatches.length === 0) {
      const matched = activeMatches[0];
      await saveRecord<StoredMaster>(STORE_NAME, {
        ...local,
        syncId: matched.id,
        cloudUpdatedAt: matched.cloudUpdatedAt,
      });
      continue;
    }

    if (activeMatches.length !== 0 || deletedMatches.length !== 0) {
      throw new Error(`「${local.name}」に競合が見つかったため、移行を中止しました。`);
    }

    const synced = await pushMasterRecordToSyncStore(local);
    await acknowledgeMaster(local, synced, context);
    migrated += 1;

    cloudById.set(String(synced.id), synced);
    const key = masterKey(synced);
    const matches = cloudByKey.get(key) ?? [];
    matches.push(synced);
    cloudByKey.set(key, matches);
  }

  return {
    migrated,
    preview: await getMasterMigrationPreview(),
  };
}

export async function getMasterList(
  category?: MasterCategory,
): Promise<Master[]> {
  const masters = await getAllRecords<Master>(STORE_NAME);

  return masters
    .filter((master) => !category || master.category === category)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export async function getMasterListForPageOpen(
  category?: MasterCategory,
): Promise<Master[]> {
  await pullMasterRecordsFromCloud();
  return getMasterList(category);
}

export async function getMaster(id: number): Promise<Master> {
  const master = await getRecordById<Master>(STORE_NAME, id);

  if (!master) {
    throw new Error('指定されたマスターが見つかりません。');
  }

  return master;
}

export async function checkMasterDuplicate(
  category: MasterCategory,
  name: string,
): Promise<boolean> {
  const normalizedName = name.trim().toLocaleLowerCase();
  const masters = await getAllRecords<Master>(STORE_NAME);

  return masters.some(
    (master) =>
      master.category === category &&
      master.name.trim().toLocaleLowerCase() === normalizedName,
  );
}

export async function createMaster(input: MasterInput): Promise<Master> {
  const context = masterSyncContext();
  const cloudEnabled = shouldUseCloudSync();
  const now = new Date().toISOString();

  const master: StoredMaster = {
    ...input,
    id: Date.now(),
    name: input.name.trim(),
    active: true,
    createdAt: now,
    updatedAt: now,
    ...(!cloudEnabled ? { masterSyncFreeEditPending: true as const } : {}),
  };

  if (!await changeMatchingMaster(context, master.id, undefined, master, true)) {
    throw new Error('端末またはログインの情報が変わったため、マスターの保存を中止しました。');
  }
  await syncSavedMaster(master, context, cloudEnabled);
  return master;
}

export async function updateMaster(
  id: number,
  input: MasterInput,
): Promise<Master> {
  const context = masterSyncContext();
  const cloudEnabled = shouldUseCloudSync();
  const current = await getMaster(id);

  const updated: StoredMaster = {
    ...current,
    ...input,
    id,
    name: input.name.trim(),
    updatedAt: new Date().toISOString(),
    ...(!cloudEnabled ? { masterSyncFreeEditPending: true as const } : {}),
  };

  if (!await changeMatchingMaster(context, id, current, updated, true)) {
    throw new Error('端末またはログインの情報が変わったため、マスターの更新を中止しました。');
  }
  await syncSavedMaster(updated, context, cloudEnabled);
  return updated;
}

export async function deleteMaster(id: number): Promise<void> {
  const current = await getMaster(id);

  if (shouldUseCloudSync()) {
    await deleteMasterRecordFromSyncStore(current);
  }

  await deleteRecord(STORE_NAME, id);
}
