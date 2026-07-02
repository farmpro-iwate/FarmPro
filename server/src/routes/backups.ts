import { Router } from 'express';
import { exportBackup, importBackup } from '../backupStore';

export const backupsRouter = Router();

backupsRouter.get('/export', async (_req, res) => {
  const backup = await exportBackup();
  const date = backup.exportedAt.slice(0, 10);
  const fileName = `farmpro-backup-${date}.json`;

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
