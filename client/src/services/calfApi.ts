import { api } from './api';
import { Calf, CalfInput } from '../types/calf';
import { Cattle } from '../types/cattle';

export async function getCalfList() { const res = await api.get<Calf[]>('/calves'); return res.data; }
export async function getCalf(id: string) { const res = await api.get<Calf>(`/calves/${id}`); return res.data; }
export async function createCalf(input: CalfInput) { const res = await api.post<Calf>('/calves', input); return res.data; }
export async function updateCalf(id: string, input: CalfInput) { const res = await api.put<Calf>(`/calves/${id}`, input); return res.data; }
export async function promoteCalf(id: string) { const res = await api.post<Cattle>(`/calves/${id}/promote`); return res.data; }
export async function deleteCalf(id: number) { await api.delete(`/calves/${id}`); }
