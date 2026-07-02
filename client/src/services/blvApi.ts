import { api } from './api';
import { BlvTest, BlvTestInput } from '../types/blv';

export async function getBlvTestList() { const res = await api.get<BlvTest[]>('/blv-tests'); return res.data; }
export async function getBlvTest(id: string) { const res = await api.get<BlvTest>(`/blv-tests/${id}`); return res.data; }
export async function createBlvTest(input: BlvTestInput) { const res = await api.post<BlvTest>('/blv-tests', input); return res.data; }
export async function updateBlvTest(id: string, input: BlvTestInput) { const res = await api.put<BlvTest>(`/blv-tests/${id}`, input); return res.data; }
export async function deleteBlvTest(id: number) { await api.delete(`/blv-tests/${id}`); }
