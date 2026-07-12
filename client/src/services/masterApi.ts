import { api } from './api';
import { Master, MasterCategory, MasterInput } from '../types/master';

export async function getMasterList(category?: MasterCategory) {
  const params = category ? { category } : undefined;
  const res = await api.get<Master[]>('/masters', { params });
  return res.data;
}

export async function getMaster(id: number) {
  const res = await api.get<Master>(`/masters/${id}`);
  return res.data;
}

export async function checkMasterDuplicate(category: MasterCategory, name: string) {
  const res = await api.post<{ isDuplicate: boolean }>('/masters/check-duplicate', {
    category,
    name
  });
  return res.data.isDuplicate;
}

export async function createMaster(input: MasterInput) {
  const res = await api.post<Master>('/masters', input);
  return res.data;
}

export async function updateMaster(id: number, input: MasterInput) {
  const res = await api.put<Master>(`/masters/${id}`, input);
  return res.data;
}

export async function deleteMaster(id: number) {
  await api.delete(`/masters/${id}`);
}
