import { api } from './api';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function downloadBackup() {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join('-') + '-' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('');

  const link = document.createElement('a');
  link.href = 'http://localhost:4000/api/backups/export';
  link.download = `farmpro-backup-${timestamp}.json`;
  link.click();
}

export async function importBackupJson(backup: unknown) {
  const res = await api.post('/backups/import', backup);
  return res.data;
}
