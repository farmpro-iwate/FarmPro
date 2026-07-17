import axios from 'axios';
import { Cattle, CattleInput } from '../types/cattle';
import { clearAuth, getAuthToken } from './authClient';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearAuth();
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export async function getCattleList() { const res = await api.get<Cattle[]>('/cattle'); return res.data; }
export async function getCattle(id: string) { const res = await api.get<Cattle>(`/cattle/${id}`); return res.data; }
export async function createCattle(input: CattleInput) { const res = await api.post<Cattle>('/cattle', input); return res.data; }
export async function updateCattle(id: string, input: CattleInput) { const res = await api.put<Cattle>(`/cattle/${id}`, input); return res.data; }
export async function deleteCattle(id: number) { await api.delete(`/cattle/${id}`); }
