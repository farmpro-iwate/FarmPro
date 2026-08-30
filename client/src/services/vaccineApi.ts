import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
  saveRecordPreservingTimestamps,
} from '../storage/repository';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { Vaccine, VaccineInput } from '../types/vaccine';
import { getAuthToken } from './authClient';

const STORE_NAME = 'vaccines' as const;

type SyncedVaccine = Vaccine & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  deletedAt?: string;
};

type CloudVaccineRecord = Omit<Partial<SyncedVaccine>, 'id'> & {
  id: string;
  cloudUpdatedAt?: string;
};

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

function parseTimestamp(value?: string) {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function cloudRecordIsNewer(
  cloud: CloudVaccineRecord,
  local: SyncedVaccine,
) {
  const cloudTime = parseTimestamp(cloud.cloudUpdatedAt);
  const localCloudTime = parseTimestamp(local.cloudUpdatedAt);
  if (Number.isNaN(cloudTime)) return false;
  if (Number.isNaN(localCloudTime)) return true;
  return cloudTime > localCloudTime;
}

async function readSyncError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `ワクチン記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `ワクチン記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function syncVaccineRecordToCloud(
  record: SyncedVaccine,
): Promise<CloudVaccineRecord | null> {
  if (!shouldUseCloudSync()) return null;

  const token = getAuthToken();
  if (!token) return null;

  const syncRecordId = record.syncRecordId || `vaccine:${record.id}`;
  const response = await fetch(`/api/vaccines/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...record, id: syncRecordId, syncRecordId }),
  });

  if (!response.ok) throw new Error(await readSyncError(response));
  return response.json() as Promise<CloudVaccineRecord>;
}

async function syncVaccineAfterLocalSave(record: SyncedVaccine) {
  try {
    const synced = await syncVaccineRecordToCloud(record);
    if (!synced?.cloudUpdatedAt) return;

    await saveRecordPreservingTimestamps<SyncedVaccine>(STORE_NAME, {
      ...record,
      syncRecordId: synced.id || record.syncRecordId || `vaccine:${record.id}`,
      cloudUpdatedAt: synced.cloudUpdatedAt,
      cloudSyncPending: false,
    });
  } catch (error) {
    console.warn('ワクチン記録は端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
}

function localIdFromSyncId(syncId: string) {
  const rawId = syncId.startsWith('vaccine:')
    ? syncId.slice('vaccine:'.length)
    : syncId;
  const parsed = Number(rawId);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCloudVaccine(
  record: CloudVaccineRecord,
  localId: number,
): SyncedVaccine {
  return {
    id: localId,
    targetType: String(record.targetType || '成牛'),
    targetNumber: String(record.targetNumber || ''),
    targetName: String(record.targetName || ''),
    vaccineName: String(record.vaccineName || ''),
    vaccinationDate: String(record.vaccinationDate || ''),
    nextDueDate: String(record.nextDueDate || ''),
    status: String(record.status || '未接種'),
    note: String(record.note || ''),
    createdAt: String(record.createdAt || ''),
    updatedAt: String(record.updatedAt || ''),
    syncRecordId: String(record.id),
    cloudUpdatedAt: record.cloudUpdatedAt,
    cloudSyncPending: false,
  };
}

async function pullVaccineChangesFromCloud() {
  if (!shouldUseCloudSync()) return 0;

  const token = getAuthToken();
  if (!token) return 0;

  const response = await fetch('/api/vaccines/record-sync', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readSyncError(response));

  const cloudRecords = await response.json() as CloudVaccineRecord[];
  const localRecords = await getAllRecords<SyncedVaccine>(STORE_NAME);
  const localBySyncId = new Map<string, SyncedVaccine>();

  for (const item of localRecords) {
    localBySyncId.set(item.syncRecordId || `vaccine:${item.id}`, item);
  }

  let applied = 0;

  for (const cloud of cloudRecords) {
    const syncId = String(cloud.id || '').trim();
    if (!syncId || cloud.deletedAt) continue;

    const local = localBySyncId.get(syncId);

    if (local) {
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      const saved = await saveRecordPreservingTimestamps<SyncedVaccine>(
        STORE_NAME,
        normalizeCloudVaccine(cloud, Number(local.id)),
      );
      localBySyncId.set(syncId, saved);
      applied += 1;
      continue;
    }

    const localId = localIdFromSyncId(syncId);
    if (localId === null) continue;

    const saved = await saveRecordPreservingTimestamps<SyncedVaccine>(
      STORE_NAME,
      normalizeCloudVaccine(cloud, localId),
    );
    localBySyncId.set(syncId, saved);
    applied += 1;
  }

  return applied;
}

export async function getVaccineList(): Promise<Vaccine[]> {
  try {
    await pullVaccineChangesFromCloud();
  } catch (error) {
    console.warn('ワクチン記録のクラウド取り込みをスキップしました。', error);
  }

  const records = await getAllRecords<Vaccine>(STORE_NAME);
  return records.sort((a, b) =>
    b.vaccinationDate.localeCompare(a.vaccinationDate),
  );
}

export async function getVaccine(id: string | number): Promise<Vaccine> {
  const record = await getRecordById<Vaccine>(STORE_NAME, Number(id));

  if (!record) {
    throw new Error('指定されたワクチン記録が見つかりません。');
  }

  return record;
}

export async function createVaccine(input: VaccineInput): Promise<Vaccine> {
  const now = new Date().toISOString();
  const id = Date.now();

  const saved = await saveRecord<SyncedVaccine>(STORE_NAME, {
    ...input,
    id,
    syncRecordId: `vaccine:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    createdAt: now,
    updatedAt: now,
  });

  await syncVaccineAfterLocalSave(saved);
  return saved;
}

export async function updateVaccine(
  id: string | number,
  input: VaccineInput,
): Promise<Vaccine> {
  const current = await getRecordById<SyncedVaccine>(STORE_NAME, Number(id));

  if (!current) {
    throw new Error('指定されたワクチン記録が見つかりません。');
  }

  const saved = await saveRecord<SyncedVaccine>(STORE_NAME, {
    ...current,
    ...input,
    id: Number(id),
    syncRecordId: current.syncRecordId || `vaccine:${Number(id)}`,
    cloudSyncPending: shouldUseCloudSync(),
    updatedAt: new Date().toISOString(),
  });

  await syncVaccineAfterLocalSave(saved);
  return saved;
}

export async function deleteVaccine(id: number): Promise<void> {
  await deleteRecord(STORE_NAME, id);
}
