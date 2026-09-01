import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import { getFarmProPlan } from '../plans/policy';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { Master, MasterCategory, MasterInput } from '../types/master';
import {
  deleteMasterRecordFromSyncStore,
  fetchSyncedMasterRecords,
  pushMasterRecordToSyncStore,
  type SyncedMasterRecord,
} from './masterRecordSyncApi';

const STORE_NAME = 'masters' as const;

type StoredMaster = Master & {
  syncId?: string;
  cloudUpdatedAt?: string;
};

export type MasterMigrationPreview = {
  unregistered: number;
  matched: number;
  conflicts: number;
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

async function syncSavedMaster(master: Master) {
  if (!shouldUseCloudSync()) return;

  try {
    const synced = await pushMasterRecordToSyncStore(master);
    await saveRecord<StoredMaster>(STORE_NAME, {
      ...master,
      syncId: synced.id,
      cloudUpdatedAt: synced.cloudUpdatedAt,
    });
  } catch (error) {
    console.warn('マスターは端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
}

async function pullMasterRecordsFromCloud() {
  if (!shouldUseCloudSync()) return;

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

      if (cloud.deletedAt) {
        if (!local) continue;
        if (String(cloud.deletedAt) < String(local.updatedAt || '')) continue;
        await deleteRecord(STORE_NAME, local.id);
        continue;
      }

      if (local && !isCloudNewer(local, cloud)) {
        if (!local.syncId) {
          await saveRecord<StoredMaster>(STORE_NAME, {
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

      await saveRecord<StoredMaster>(STORE_NAME, merged);
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
  const now = new Date().toISOString();

  const master: Master = {
    ...input,
    id: Date.now(),
    name: input.name.trim(),
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  const saved = await saveRecord<Master>(STORE_NAME, master);
  await syncSavedMaster(saved);
  return saved;
}

export async function updateMaster(
  id: number,
  input: MasterInput,
): Promise<Master> {
  const current = await getMaster(id);

  const updated: Master = {
    ...current,
    ...input,
    id,
    name: input.name.trim(),
    updatedAt: new Date().toISOString(),
  };

  const saved = await saveRecord<Master>(STORE_NAME, updated);
  await syncSavedMaster(saved);
  return saved;
}

export async function deleteMaster(id: number): Promise<void> {
  const current = await getMaster(id);

  if (shouldUseCloudSync()) {
    await deleteMasterRecordFromSyncStore(current);
  }

  await deleteRecord(STORE_NAME, id);
}
