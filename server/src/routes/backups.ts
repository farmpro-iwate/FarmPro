import { Router } from 'express';
import { exportBackup, importBackup } from '../backupStore';

export const backupsRouter = Router();

function pad(value: number) {
  return String(value).padStart(2, '0');
}

backupsRouter.get('/export', async (_req, res) => {
  const user = res.locals.authUser;
  if (!user) {
    res.status(401).json({ message: '認証が必要です' });
    return;
  }

  const backup = await exportBackup({
    id: user.farmId,
    name: user.farmName
  });
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
  const fileName = `farmpro-backup-${user.farmId}-${timestamp}.json`;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.json(backup);
});

backupsRouter.post('/import', async (req, res) => {
  try {
    const user = res.locals.authUser;
    if (!user) {
      res.status(401).json({ message: '認証が必要です' });
      return;
    }

    const result = await importBackup(req.body, user.farmId);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'BACKUP_FARM_MISMATCH') {
      res.status(409).json({ message: '別の農場のバックアップは復元できません' });
      return;
    }
    res.status(400).json({ message: 'バックアップファイルの形式が正しくありません' });
  }
});
