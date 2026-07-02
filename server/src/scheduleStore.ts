import { readJson, writeJson } from './jsonStore';

export type Schedule = {
  id: number;
  scheduleType: string;
  title: string;
  targetNumber: string;
  targetName: string;
  dueDate: string;
  status: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleInput = {
  scheduleType: string;
  title: string;
  targetNumber?: string;
  targetName?: string;
  dueDate: string;
  status?: string;
  note?: string;
};

const fileName = 'schedules.json';

export async function listSchedules() {
  const schedules = await readJson<Schedule>(fileName);
  return schedules.sort((a, b) => {
    if (a.status !== b.status) return a.status === '未完了' ? -1 : 1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

export async function findSchedule(id: number) {
  const schedules = await readJson<Schedule>(fileName);
  return schedules.find((schedule) => schedule.id === id);
}

export async function createSchedule(input: ScheduleInput) {
  const schedules = await readJson<Schedule>(fileName);
  const now = new Date().toISOString();
  const nextId = schedules.length === 0 ? 1 : Math.max(...schedules.map((schedule) => schedule.id)) + 1;

  const schedule: Schedule = {
    id: nextId,
    scheduleType: input.scheduleType,
    title: input.title,
    targetNumber: input.targetNumber ?? '',
    targetName: input.targetName ?? '',
    dueDate: input.dueDate,
    status: input.status ?? '未完了',
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now
  };

  schedules.push(schedule);
  await writeJson(fileName, schedules);
  return schedule;
}

export async function updateSchedule(id: number, input: ScheduleInput) {
  const schedules = await readJson<Schedule>(fileName);
  const index = schedules.findIndex((schedule) => schedule.id === id);
  if (index === -1) return null;

  schedules[index] = {
    ...schedules[index],
    scheduleType: input.scheduleType,
    title: input.title,
    targetNumber: input.targetNumber ?? '',
    targetName: input.targetName ?? '',
    dueDate: input.dueDate,
    status: input.status ?? '未完了',
    note: input.note ?? '',
    updatedAt: new Date().toISOString()
  };

  await writeJson(fileName, schedules);
  return schedules[index];
}

export async function deleteSchedule(id: number) {
  const schedules = await readJson<Schedule>(fileName);
  const next = schedules.filter((schedule) => schedule.id !== id);
  if (next.length === schedules.length) return false;
  await writeJson(fileName, next);
  return true;
}
