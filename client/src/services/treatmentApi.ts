import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveManyRecords,
  saveRecord,
} from '../storage/repository';
import { Treatment, TreatmentInput } from '../types/treatment';
import { getAuthToken } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';

const STORE_NAME = 'treatments' as const;

type SyncedTreatment = Treatment & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
};

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

async function readSyncError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `治療・投薬記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `治療・投薬記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function syncTreatmentRecordToCloud(record: SyncedTreatment) {
  if (!shouldUseCloudSync()) return;

  const token = getAuthToken();
  if (!token) return;

  const syncRecordId = record.syncRecordId || `treatment:${record.id}`;
  const response = await fetch(`/api/treatments/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...record, id: syncRecordId }),
  });

  if (!response.ok) throw new Error(await readSyncError(response));
}

async function syncTreatmentAfterLocalSave(record: SyncedTreatment) {
  try {
    await syncTreatmentRecordToCloud(record);
  } catch (error) {
    console.warn('治療・投薬記録は端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
}

export async function getTreatmentList(): Promise<Treatment[]> {
  const records = await getAllRecords<Treatment>(STORE_NAME);
  return records.sort((a, b) => b.treatmentDate.localeCompare(a.treatmentDate));
}

export async function getTreatment(id: string | number): Promise<Treatment> {
  const record = await getRecordById<Treatment>(STORE_NAME, Number(id));

  if (!record) {
    throw new Error('指定された治療記録が見つかりません。');
  }

  return record;
}

export async function createTreatment(
  input: TreatmentInput,
): Promise<Treatment> {
  const now = new Date().toISOString();
  const saved = await saveRecord<SyncedTreatment>(STORE_NAME, {
    ...input,
    id: Date.now(),
    createdAt: now,
    updatedAt: now,
  });

  await syncTreatmentAfterLocalSave(saved);
  return saved;
}

export async function createManyTreatments(
  inputs: TreatmentInput[],
): Promise<Treatment[]> {
  const now = new Date().toISOString();
  const baseId = Date.now();
  const records: SyncedTreatment[] = inputs.map((input, index) => ({
    ...input,
    id: baseId + index,
    createdAt: now,
    updatedAt: now,
  }));

  const saved = await saveManyRecords<SyncedTreatment>(STORE_NAME, records);
  await Promise.all(saved.map((record) => syncTreatmentAfterLocalSave(record)));
  return saved;
}

export async function updateTreatment(
  id: string | number,
  input: TreatmentInput,
): Promise<Treatment> {
  const current = await getRecordById<SyncedTreatment>(STORE_NAME, Number(id));
  if (!current) {
    throw new Error('指定された治療記録が見つかりません。');
  }

  const saved = await saveRecord<SyncedTreatment>(STORE_NAME, {
    ...current,
    ...input,
    id: Number(id),
    updatedAt: new Date().toISOString(),
  });

  await syncTreatmentAfterLocalSave(saved);
  return saved;
}

export async function deleteTreatment(id: number): Promise<void> {
  await deleteRecord(STORE_NAME, id);
}
