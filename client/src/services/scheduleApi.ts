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

export async function completeSchedules(ids: Array<string | number>): Promise<Schedule[]> {
  const uniqueIds = Array.from(new Set(ids.map((id) => Number(id)).filter(Number.isFinite)));
  const current = await Promise.all(uniqueIds.map((id) => getSchedule(id)));
  const now = new Date().toISOString();
  const completed = current.map((item) => ({
    ...item,
    status: '完了',
    updatedAt: now,
  }));
  return saveManyRecords<Schedule>(STORE_NAME, completed);
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
  await deleteRecord(STORE_NAME, id);
}
