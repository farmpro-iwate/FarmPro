import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import { Schedule, ScheduleInput } from '../types/schedule';

const STORE_NAME = 'schedules' as const;

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
