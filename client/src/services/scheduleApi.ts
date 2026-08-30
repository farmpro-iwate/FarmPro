import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveManyRecords,
  saveRecord,
  saveRecordPreservingTimestamps,
} from '../storage/repository';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { getAuthToken } from './authClient';
import {
  Schedule,
  ScheduleInput,
  SynchronizationProgramBatchInput,
  SynchronizationProgramInput,
} from '../types/schedule';

const STORE_NAME = 'schedules' as const;

type SyncedSchedule = Schedule & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  deletedAt?: string;
};

type CloudScheduleRecord = Omit<Partial<SyncedSchedule>, 'id'> & {
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
  cloud: CloudScheduleRecord,
  local: SyncedSchedule,
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
    return body.message || `予定記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `予定記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function syncScheduleRecordToCloud(
  record: SyncedSchedule,
): Promise<CloudScheduleRecord | null> {
  if (!shouldUseCloudSync()) return null;

  const token = getAuthToken();
  if (!token) return null;

  const syncRecordId = record.syncRecordId || `schedule:${record.id}`;
  const response = await fetch(`/api/schedules/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...record, id: syncRecordId, syncRecordId }),
  });

  if (!response.ok) throw new Error(await readSyncError(response));
  return response.json() as Promise<CloudScheduleRecord>;
}

async function syncScheduleDeletionToCloud(syncRecordId: string) {
  if (!shouldUseCloudSync()) return;

  const token = getAuthToken();
  if (!token) return;

  const response = await fetch(`/api/schedules/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error(await readSyncError(response));
}

async function syncScheduleAfterLocalSave(record: SyncedSchedule) {
  try {
    const synced = await syncScheduleRecordToCloud(record);
    if (!synced?.cloudUpdatedAt) return;

    await saveRecordPreservingTimestamps<SyncedSchedule>(STORE_NAME, {
      ...record,
      syncRecordId: synced.id || record.syncRecordId || `schedule:${record.id}`,
      cloudUpdatedAt: synced.cloudUpdatedAt,
      cloudSyncPending: false,
    });
  } catch (error) {
    console.warn('予定記録は端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
}

function localIdFromSyncId(syncId: string) {
  const rawId = syncId.startsWith('schedule:')
    ? syncId.slice('schedule:'.length)
    : syncId;
  const parsed = Number(rawId);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCloudSchedule(
  record: CloudScheduleRecord,
  localId: number,
): SyncedSchedule {
  return {
    id: localId,
    scheduleType: String(record.scheduleType || 'その他'),
    title: String(record.title || ''),
    targetNumber: String(record.targetNumber || ''),
    targetName: String(record.targetName || ''),
    dueDate: String(record.dueDate || ''),
    status: String(record.status || '未完了'),
    note: String(record.note || ''),
    synchronizationProgramId: record.synchronizationProgramId,
    synchronizationProgramName: record.synchronizationProgramName,
    synchronizationPurpose: record.synchronizationPurpose,
    synchronizationStartDate: record.synchronizationStartDate,
    synchronizationStep: record.synchronizationStep,
    createdAt: String(record.createdAt || ''),
    updatedAt: String(record.updatedAt || ''),
    syncRecordId: String(record.id),
    cloudUpdatedAt: record.cloudUpdatedAt,
    cloudSyncPending: false,
  } as SyncedSchedule;
}

async function pullScheduleChangesFromCloud() {
  if (!shouldUseCloudSync()) return 0;

  const token = getAuthToken();
  if (!token) return 0;

  const response = await fetch('/api/schedules/record-sync', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readSyncError(response));

  const cloudRecords = await response.json() as CloudScheduleRecord[];
  const localRecords = await getAllRecords<SyncedSchedule>(STORE_NAME);
  const localBySyncId = new Map<string, SyncedSchedule>();

  for (const item of localRecords) {
    localBySyncId.set(item.syncRecordId || `schedule:${item.id}`, item);
  }

  let applied = 0;

  for (const cloud of cloudRecords) {
    const syncId = String(cloud.id || '').trim();
    if (!syncId) continue;

    const local = localBySyncId.get(syncId);

    if (cloud.deletedAt) {
      if (!local) continue;
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      await deleteRecord(STORE_NAME, Number(local.id));
      localBySyncId.delete(syncId);
      applied += 1;
      continue;
    }

    if (local) {
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      const saved = await saveRecordPreservingTimestamps<SyncedSchedule>(
        STORE_NAME,
        normalizeCloudSchedule(cloud, Number(local.id)),
      );
      localBySyncId.set(syncId, saved);
      applied += 1;
      continue;
    }

    const localId = localIdFromSyncId(syncId);
    if (localId === null) continue;

    const saved = await saveRecordPreservingTimestamps<SyncedSchedule>(
      STORE_NAME,
      normalizeCloudSchedule(cloud, localId),
    );
    localBySyncId.set(syncId, saved);
    applied += 1;
  }

  return applied;
}

function addCalendarDays(dateText: string, days: number): string {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function createSynchronizationProgramId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sync-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getScheduleList(): Promise<Schedule[]> {
  try {
    await pullScheduleChangesFromCloud();
  } catch (error) {
    console.warn('予定記録のクラウド取り込みをスキップしました。', error);
  }

  const records = await getAllRecords<Schedule>(STORE_NAME);
  return records.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function getSchedule(id: string | number): Promise<Schedule> {
  const record = await getRecordById<Schedule>(STORE_NAME, Number(id));

  if (!record) {
    throw new Error('指定された予定が見つかりません。');
  }

  return record;
}

export async function createSchedule(input: ScheduleInput): Promise<Schedule> {
  const now = new Date().toISOString();
  const id = Date.now();

  const saved = await saveRecord<SyncedSchedule>(STORE_NAME, {
    ...input,
    id,
    syncRecordId: `schedule:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    createdAt: now,
    updatedAt: now,
  });

  await syncScheduleAfterLocalSave(saved);
  return saved;
}

export async function createSynchronizationProgramSchedules(
  input: SynchronizationProgramInput,
): Promise<Schedule[]> {
  return createSynchronizationProgramSchedulesForCattle({
    programName: input.programName,
    purpose: input.purpose,
    startDate: input.startDate,
    targets: [{ targetNumber: input.targetNumber, targetName: input.targetName }],
    steps: input.steps,
  });
}

export async function createSynchronizationProgramSchedulesForCattle(
  input: SynchronizationProgramBatchInput,
): Promise<Schedule[]> {
  const existingSchedules = await getAllRecords<Schedule>(STORE_NAME);
  const requestedNumbers = new Set(input.targets.map((target) => target.targetNumber));
  const activeSynchronizationSchedules = existingSchedules.filter((item) =>
    Boolean(item.synchronizationProgramId) &&
    item.status === '未完了' &&
    requestedNumbers.has(item.targetNumber),
  );

  if (activeSynchronizationSchedules.length > 0) {
    const conflicts = new Map<string, { name: string; programs: Set<string> }>();
    for (const item of activeSynchronizationSchedules) {
      const target = input.targets.find((candidate) => candidate.targetNumber === item.targetNumber);
      const current = conflicts.get(item.targetNumber) || {
        name: target?.targetName || item.targetName || item.targetNumber,
        programs: new Set<string>(),
      };
      current.programs.add(item.synchronizationProgramName || '同期化プログラム');
      conflicts.set(item.targetNumber, current);
    }

    const conflictLines = Array.from(conflicts.entries()).map(([targetNumber, conflict]) =>
      `・${conflict.name}（耳標 ${targetNumber}）：${Array.from(conflict.programs).join('、')}`,
    );
    const message = [
      '進行中の同期化があるため、新しい同期化を開始できません。',
      '',
      ...conflictLines,
      '',
      '現在の同期化を完了または終了してから、もう一度開始してください。',
    ].join('\n');

    if (typeof window !== 'undefined') {
      window.alert(message);
    }
    throw new Error(message);
  }

  const now = new Date().toISOString();
  const programId = createSynchronizationProgramId();
  const baseId = Date.now();
  let sequence = 0;

  const records: SyncedSchedule[] = [];
  for (const target of input.targets) {
    for (const step of input.steps) {
      const id = baseId + sequence;
      records.push({
        id,
        scheduleType: step.scheduleType || 'その他',
        title: step.title,
        targetNumber: target.targetNumber,
        targetName: target.targetName,
        dueDate: addCalendarDays(input.startDate, step.dayOffset),
        status: '未完了',
        note: step.note || '',
        synchronizationProgramId: programId,
        synchronizationProgramName: input.programName,
        synchronizationPurpose: input.purpose,
        synchronizationStartDate: input.startDate,
        synchronizationStep: `${step.dayOffset}日目`,
        syncRecordId: `schedule:${id}`,
        cloudSyncPending: shouldUseCloudSync(),
        createdAt: now,
        updatedAt: now,
      });
      sequence += 1;
    }
  }

  const saved = await saveManyRecords<SyncedSchedule>(STORE_NAME, records);
  await Promise.all(saved.map((record) => syncScheduleAfterLocalSave(record)));
  return saved;
}

export async function updateSchedule(
  id: string | number,
  input: ScheduleInput,
): Promise<Schedule> {
  const current = await getRecordById<SyncedSchedule>(STORE_NAME, Number(id));

  if (!current) {
    throw new Error('指定された予定が見つかりません。');
  }

  const saved = await saveRecord<SyncedSchedule>(STORE_NAME, {
    ...current,
    ...input,
    id: Number(id),
    syncRecordId: current.syncRecordId || `schedule:${Number(id)}`,
    cloudSyncPending: shouldUseCloudSync(),
    updatedAt: new Date().toISOString(),
  });

  await syncScheduleAfterLocalSave(saved);
  return saved;
}

export async function completeSchedules(ids: Array<string | number>): Promise<Schedule[]> {
  const uniqueIds = Array.from(new Set(ids.map((id) => Number(id)).filter(Number.isFinite)));
  const current = await Promise.all(
    uniqueIds.map((id) => getRecordById<SyncedSchedule>(STORE_NAME, id)),
  );
  const now = new Date().toISOString();
  const completed: SyncedSchedule[] = current
    .filter((item): item is SyncedSchedule => Boolean(item))
    .map((item) => ({
      ...item,
      status: '完了',
      syncRecordId: item.syncRecordId || `schedule:${item.id}`,
      cloudSyncPending: shouldUseCloudSync(),
      updatedAt: now,
    }));

  const saved = await saveManyRecords<SyncedSchedule>(STORE_NAME, completed);
  await Promise.all(saved.map((record) => syncScheduleAfterLocalSave(record)));
  return saved;
}

export async function cancelSynchronizationProgram(programId: string): Promise<Schedule[]> {
  const schedules = await getAllRecords<Schedule>(STORE_NAME);
  const now = new Date().toISOString();
  const canceled = schedules
    .filter((item) => item.synchronizationProgramId === programId && item.status === '未完了')
    .map((item) => ({
      ...item,
      status: '中止',
      updatedAt: now,
    }));

  if (canceled.length === 0) return [];
  return saveManyRecords<Schedule>(STORE_NAME, canceled);
}

export async function deleteSchedule(id: number): Promise<void> {
  const current = await getRecordById<SyncedSchedule>(STORE_NAME, id);
  const syncRecordId = current?.syncRecordId || `schedule:${id}`;

  await deleteRecord(STORE_NAME, id);

  try {
    await syncScheduleDeletionToCloud(syncRecordId);
  } catch (error) {
    console.warn('予定記録は端末内から削除しましたが、クラウド削除同期に失敗しました。', error);
  }
}
