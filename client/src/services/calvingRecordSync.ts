import {
  getAllRecords,
  saveRecordPreservingTimestamps,
} from '../storage/repository';
import { getAuthToken } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import type { CalvingRecord } from './calvingsApi';

type StoredCalvingRecord = CalvingRecord & { id: string };

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

function isCloudRecordNewer(cloud: StoredCalvingRecord, local?: StoredCalvingRecord) {
  if (!local) return true;

  const cloudUpdatedAt = typeof cloud.updatedAt === 'string'
    ? Date.parse(cloud.updatedAt)
    : Number.NaN;
  const localUpdatedAt = typeof local.updatedAt === 'string'
    ? Date.parse(local.updatedAt)
    : Number.NaN;

  if (Number.isNaN(cloudUpdatedAt)) return false;
  if (Number.isNaN(localUpdatedAt)) return true;
  return cloudUpdatedAt > localUpdatedAt;
}

async function readApiError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `分娩記録の取得に失敗しました（${response.status}）`;
  } catch {
    return `分娩記録の取得に失敗しました（${response.status}）`;
  }
}

export async function pullNewerCalvingRecordsFromCloud() {
  if (!shouldUseCloudSync()) return { applied: 0 };

  const token = getAuthToken();
  if (!token) return { applied: 0 };

  const response = await fetch('/api/calvings/record-sync', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const cloudRecords = await response.json() as StoredCalvingRecord[];
  if (!Array.isArray(cloudRecords)) return { applied: 0 };

  const localRecords = await getAllRecords<StoredCalvingRecord>('calvings');
  const localById = new Map(localRecords.map((record) => [String(record.id), record]));
  let applied = 0;

  for (const cloudRecord of cloudRecords) {
    if (!cloudRecord || !cloudRecord.id) continue;

    const id = String(cloudRecord.id);
    const normalizedCloudRecord: StoredCalvingRecord = {
      ...cloudRecord,
      id,
    };
    const localRecord = localById.get(id);

    if (!isCloudRecordNewer(normalizedCloudRecord, localRecord)) continue;

    await saveRecordPreservingTimestamps('calvings', normalizedCloudRecord);
    localById.set(id, normalizedCloudRecord);
    applied += 1;
  }

  return { applied };
}
