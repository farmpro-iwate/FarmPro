import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveManyRecords,
  saveRecord,
  saveRecordPreservingTimestamps,
} from '../storage/repository';
import { Calf } from '../types/calf';
import { Treatment, TreatmentInput } from '../types/treatment';
import { formatTemporaryCalfNumber, isTemporaryCalfNumber } from '../utils/temporaryCalfNumber';
import { getAuthToken } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';

const STORE_NAME = 'treatments' as const;

type SyncedTreatment = Treatment & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
};

type CloudTreatment = Omit<Partial<SyncedTreatment>, 'id'> & {
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

function cloudRecordIsNewer(cloud: CloudTreatment, local: SyncedTreatment) {
  const cloudTime = parseTimestamp(cloud.cloudUpdatedAt);
  const localCloudTime = parseTimestamp(local.cloudUpdatedAt);
  if (Number.isNaN(cloudTime)) return false;
  if (Number.isNaN(localCloudTime)) return true;
  return cloudTime > localCloudTime;
}

async function normalizeTemporaryTargetNumber(targetNumber: string) {
  const normalized = targetNumber.trim();
  if (!isTemporaryCalfNumber(normalized)) return normalized;

  const calves = await getAllRecords<Calf>('calves');
  const calf = calves.find((item) =>
    item.calfNumber === normalized || item.temporaryCalfNumber === normalized,
  );

  return formatTemporaryCalfNumber(normalized, calf?.birthday);
}

async function presentTreatment(record: Treatment): Promise<Treatment> {
  return {
    ...record,
    targetNumber: await normalizeTemporaryTargetNumber(record.targetNumber),
  };
}

async function normalizeTreatmentInput(input: TreatmentInput): Promise<TreatmentInput> {
  return {
    ...input,
    targetNumber: await normalizeTemporaryTargetNumber(input.targetNumber),
  };
}

async function readSyncError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `治療・投薬記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `治療・投薬記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function syncTreatmentRecordToCloud(record: SyncedTreatment): Promise<CloudTreatment | null> {
  if (!shouldUseCloudSync()) return null;

  const token = getAuthToken();
  if (!token) return null;

  const syncRecordId = record.syncRecordId || `treatment:${record.id}`;
  const response = await fetch(`/api/treatments/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...record, id: syncRecordId, syncRecordId }),
  });

  if (!response.ok) throw new Error(await readSyncError(response));
  return response.json() as Promise<CloudTreatment>;
}

async function syncTreatmentAfterLocalSave(record: SyncedTreatment) {
  try {
    const synced = await syncTreatmentRecordToCloud(record);
    if (!synced?.cloudUpdatedAt) return;

    await saveRecordPreservingTimestamps<SyncedTreatment>(STORE_NAME, {
      ...record,
      syncRecordId: synced.id || record.syncRecordId || `treatment:${record.id}`,
      cloudUpdatedAt: synced.cloudUpdatedAt,
      cloudSyncPending: false,
    });
  } catch (error) {
    console.warn('治療・投薬記録は端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
}

function normalizeCloudTreatment(record: CloudTreatment, localId: number): SyncedTreatment {
  return {
    id: localId,
    recordType: String(record.recordType || '治療'),
    breedingTreatmentType: (record.breedingTreatmentType || '') as Treatment['breedingTreatmentType'],
    targetNumber: String(record.targetNumber || ''),
    targetName: String(record.targetName || ''),
    symptom: String(record.symptom || ''),
    diagnosis: String(record.diagnosis || ''),
    diseaseMasterId: record.diseaseMasterId,
    treatmentProcedure: String(record.treatmentProcedure || ''),
    treatmentProcedureMasterId: record.treatmentProcedureMasterId,
    hoofAbnormality: String(record.hoofAbnormality || ''),
    nextScheduledDate: String(record.nextScheduledDate || ''),
    treatmentDate: String(record.treatmentDate || ''),
    medicine: String(record.medicine || ''),
    dosage: String(record.dosage || ''),
    withdrawalEndDate: String(record.withdrawalEndDate || ''),
    veterinarian: String(record.veterinarian || ''),
    progress: String(record.progress || ''),
    note: String(record.note || ''),
    sourceScheduleId: record.sourceScheduleId,
    synchronizationProgramId: record.synchronizationProgramId,
    synchronizationProgramName: record.synchronizationProgramName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    syncRecordId: String(record.id),
    cloudUpdatedAt: record.cloudUpdatedAt,
    cloudSyncPending: false,
  };
}

async function pullTreatmentChangesFromCloud() {
  if (!shouldUseCloudSync()) return 0;

  const token = getAuthToken();
  if (!token) return 0;

  const response = await fetch('/api/treatments/record-sync', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readSyncError(response));

  const cloudRecords = await response.json() as CloudTreatment[];
  const localRecords = await getAllRecords<SyncedTreatment>(STORE_NAME);
  const localBySyncId = new Map<string, SyncedTreatment>();
  for (const item of localRecords) {
    localBySyncId.set(item.syncRecordId || `treatment:${item.id}`, item);
  }

  let nextId = localRecords.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  let applied = 0;

  for (const cloud of cloudRecords) {
    const syncId = String(cloud.id || '').trim();
    if (!syncId) continue;

    const local = localBySyncId.get(syncId);
    if (local) {
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      const saved = await saveRecordPreservingTimestamps<SyncedTreatment>(
        STORE_NAME,
        normalizeCloudTreatment(cloud, local.id),
      );
      localBySyncId.set(syncId, saved);
      applied += 1;
      continue;
    }

    const saved = await saveRecordPreservingTimestamps<SyncedTreatment>(
      STORE_NAME,
      normalizeCloudTreatment(cloud, nextId++),
    );
    localBySyncId.set(syncId, saved);
    applied += 1;
  }

  return applied;
}

export async function getTreatmentList(): Promise<Treatment[]> {
  try {
    await pullTreatmentChangesFromCloud();
  } catch (error) {
    console.warn('治療・投薬記録のクラウド取り込みをスキップしました。', error);
  }

  const records = await getAllRecords<Treatment>(STORE_NAME);
  const presented = await Promise.all(records.map((record) => presentTreatment(record)));
  return presented.sort((a, b) => b.treatmentDate.localeCompare(a.treatmentDate));
}

export async function getTreatment(id: string | number): Promise<Treatment> {
  const record = await getRecordById<Treatment>(STORE_NAME, Number(id));

  if (!record) {
    throw new Error('指定された治療記録が見つかりません。');
  }

  return presentTreatment(record);
}

export async function createTreatment(
  input: TreatmentInput,
): Promise<Treatment> {
  const normalizedInput = await normalizeTreatmentInput(input);
  const now = new Date().toISOString();
  const id = Date.now();
  const saved = await saveRecord<SyncedTreatment>(STORE_NAME, {
    ...normalizedInput,
    id,
    syncRecordId: `treatment:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    createdAt: now,
    updatedAt: now,
  });

  await syncTreatmentAfterLocalSave(saved);
  return saved;
}

export async function createManyTreatments(
  inputs: TreatmentInput[],
): Promise<Treatment[]> {
  const normalizedInputs = await Promise.all(inputs.map((input) => normalizeTreatmentInput(input)));
  const now = new Date().toISOString();
  const baseId = Date.now();
  const records: SyncedTreatment[] = normalizedInputs.map((input, index) => {
    const id = baseId + index;
    return {
      ...input,
      id,
      syncRecordId: `treatment:${id}`,
      cloudSyncPending: shouldUseCloudSync(),
      createdAt: now,
      updatedAt: now,
    };
  });

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

  const normalizedInput = await normalizeTreatmentInput(input);
  const saved = await saveRecord<SyncedTreatment>(STORE_NAME, {
    ...current,
    ...normalizedInput,
    id: Number(id),
    syncRecordId: current.syncRecordId || `treatment:${current.id}`,
    cloudSyncPending: shouldUseCloudSync(),
    updatedAt: new Date().toISOString(),
  });

  await syncTreatmentAfterLocalSave(saved);
  return saved;
}

export async function deleteTreatment(id: number): Promise<void> {
  await deleteRecord(STORE_NAME, id);
}
