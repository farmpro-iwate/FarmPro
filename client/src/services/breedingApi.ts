import { api } from './api';
import { Breeding, BreedingInput } from '../types/breeding';

export async function getBreedingList() { const res = await api.get<Breeding[]>('/breedings'); return res.data; }
export async function getBreeding(id: string) { const res = await api.get<Breeding>(`/breedings/${id}`); return res.data; }
export async function createBreeding(input: BreedingInput) { const res = await api.post<Breeding>('/breedings', input); return res.data; }
export async function updateBreeding(id: string, input: BreedingInput) { const res = await api.put<Breeding>(`/breedings/${id}`, input); return res.data; }
export async function deleteBreeding(id: number) { await api.delete(`/breedings/${id}`); }
