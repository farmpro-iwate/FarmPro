import { api } from './api';
import { Schedule, ScheduleInput } from '../types/schedule';

export async function getScheduleList() {
  const res = await api.get<Schedule[]>('/schedules');
  return res.data;
}

export async function getSchedule(id: string) {
  const res = await api.get<Schedule>(`/schedules/${id}`);
  return res.data;
}

export async function createSchedule(input: ScheduleInput) {
  const res = await api.post<Schedule>('/schedules', input);
  return res.data;
}

export async function updateSchedule(id: string, input: ScheduleInput) {
  const res = await api.put<Schedule>(`/schedules/${id}`, input);
  return res.data;
}

export async function deleteSchedule(id: number) {
  await api.delete(`/schedules/${id}`);
}
