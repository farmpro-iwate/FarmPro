import { api } from './api';
import { Vaccine, VaccineInput } from '../types/vaccine';

export async function getVaccineList() {
  const res = await api.get<Vaccine[]>('/vaccines');
  return res.data;
}

export async function getVaccine(id: string) {
  const res = await api.get<Vaccine>(`/vaccines/${id}`);
  return res.data;
}

export async function createVaccine(input: VaccineInput) {
  const res = await api.post<Vaccine>('/vaccines', input);
  return res.data;
}

export async function updateVaccine(id: string, input: VaccineInput) {
  const res = await api.put<Vaccine>(`/vaccines/${id}`, input);
  return res.data;
}

export async function deleteVaccine(id: number) {
  await api.delete(`/vaccines/${id}`);
}
