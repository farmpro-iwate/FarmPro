import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveManyRecords,
  saveRecord,
} from '../storage/repository';
import {
  Schedule,
  ScheduleInput,
  SynchronizationProgramBatchInput,
  SynchronizationProgramInput,
} from '../types/schedule';

const STORE_NAME = 'schedules' as const;

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

  return saveRecord<Schedule>(STORE_NAME, {
    ...input,
    id: Date.now(),
    createdAt: now,
    updatedAt: now,
  });
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
  const now = new Date().toISOString();
  const programId = createSynchronizationProgramId();
  const baseId = Date.now();
  let sequence = 0;

  const records: Schedule[] = [];
  for (const target of input.targets) {
    for (const step of input.steps) {
      records.push({
        id: baseId + sequence,
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
        createdAt: now,
        updatedAt: now,
      });
      sequence += 1;
    }
  }

  return saveManyRecords<Schedule>(STORE_NAME, records);
}

export async function updateSchedule(
  id: string | number,
  input: ScheduleInput,
): Promise<Schedule> {
  const current = await getSchedule(id);

  return saveRecord<Schedule>(STORE_NAME, {
    ...current,
    ...input,
    id: Number(id),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteSchedule(id: number): Promise<void> {
  await deleteRecord(STORE_NAME, id);
}
