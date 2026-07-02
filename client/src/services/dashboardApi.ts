import { api } from './api';
import { DashboardData } from '../types/dashboard';

export async function getDashboard() {
  const res = await api.get<DashboardData>('/dashboard');
  return res.data;
}
