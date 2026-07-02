import { api } from './api';
import { Treatment, TreatmentInput } from '../types/treatment';

export async function getTreatmentList() {
  const res = await api.get<Treatment[]>('/treatments');
  return res.data;
}

export async function getTreatment(id: string) {
  const res = await api.get<Treatment>(`/treatments/${id}`);
  return res.data;
}

export async function createTreatment(input: TreatmentInput) {
  const res = await api.post<Treatment>('/treatments', input);
  return res.data;
}

export async function updateTreatment(id: string, input: TreatmentInput) {
  const res = await api.put<Treatment>(`/treatments/${id}`, input);
  return res.data;
}

export async function deleteTreatment(id: number) {
  await api.delete(`/treatments/${id}`);
}
