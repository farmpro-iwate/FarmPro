import { Router } from 'express';
import { exportBackup, importBackup } from '../backupStore';

export const backupsRouter = Router();

function pad(value: number) {
  return String(value).padStart(2, '0');
}

backupsRouter.get('/export', async (_req, res) => {
  const backup = await exportBackup();
  const exportedAt = new Date(backup.exportedAt);
  const timestamp = [
    exportedAt.getFullYear(),
    pad(exportedAt.getMonth() + 1),
    pad(exportedAt.getDate())
  ].join('-') + '-' + [
    pad(exportedAt.getHours()),
    pad(exportedAt.getMinutes()),
    pad(exportedAt.getSeconds())
  ].join('');
  const fileName = `farmpro-backup-${timestamp}.json`;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.json(backup);
});

backupsRouter.post('/import', async (req, res) => {
  try {
    const result = await importBackup(req.body);
    res.json(result);
  } catch {
    res.status(400).json({ message: 'バックアップファイルの形式が正しくありません' });
  }
});
