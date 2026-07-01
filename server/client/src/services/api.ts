import axios from 'axios';
import { Cattle, CattleInput } from '../types/cattle';

export const api = axios.create({ baseURL: 'http://localhost:4000/api' });

export async function getCattleList() {
  const res = await api.get<Cattle[]>('/cattle');
  return res.data;
}

export async function getCattle(id: string) {
  const res = await api.get<Cattle>(`/cattle/${id}`);
  return res.data;
}

export async function createCattle(input: CattleInput) {
  const res = await api.post<Cattle>('/cattle', input);
  return res.data;
}

export async function updateCattle(id: string, input: CattleInput) {
  const res = await api.put<Cattle>(`/cattle/${id}`, input);
  return res.data;
}

export async function deleteCattle(id: number) {
  await api.delete(`/cattle/${id}`);
}
