import { api } from './api';

function fileNameFromDisposition(disposition: string | undefined) {
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] || 'farmpro-backup.json';
}

export async function downloadBackup() {
  const res = await api.get('/backups/export', { responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileNameFromDisposition(res.headers['content-disposition']);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function importBackupJson(backup: unknown) {
  const res = await api.post('/backups/import', backup);
  return res.data;
}
