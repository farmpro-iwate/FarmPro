import { api } from './api';
import { ReportSummary } from '../types/report';

export async function getReportSummary() {
  const res = await api.get<ReportSummary>('/reports/summary');
  return res.data;
}

export function downloadCsv(kind: string) {
  window.open(`/api/reports/csv/${kind}`, '_blank');
}

