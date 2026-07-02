import { api } from './api';

export function downloadBackup() {
  const today = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = 'http://localhost:4000/api/backups/export';
  link.download = `farmpro-backup-${today}.json`;
  link.click();
}

export async function importBackupJson(backup: unknown) {
  const res = await api.post('/backups/import', backup);
  return res.data;
}
