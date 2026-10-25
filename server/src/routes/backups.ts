import { Router } from 'express';
import { exportBackup, importBackup } from '../backupStore';
import fs from 'node:fs/promises';
import { dataPath } from '../jsonStore';

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

/** Read-only snapshot of the extra sync files omitted by the legacy backup.
 * The archive must be downloaded before deployment; no automatic restore is attempted. */
backupsRouter.get('/settlement-preview-export', async (_req, res) => {
  const user = res.locals.authUser;
  if (process.env.RENDER_SERVICE_NAME !== 'farmpro-settlement-preview' ||
      user?.farmId !== 'settlement-preview-only') {
    res.status(403).json({ message: '検証環境専用のバックアップです' });
    return;
  }
  try {
    const readOptional = async (name: string): Promise<unknown[]> => {
      try {
        const value: unknown = JSON.parse(await fs.readFile(dataPath(name), 'utf8'));
        if (!Array.isArray(value)) throw new Error('INVALID_SYNC_SNAPSHOT');
        return value;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
      }
    };
    const [farm, salesSync, expensesSync, settlementSync] = await Promise.all([
      exportBackup({ id: user.farmId, name: user.farmName }),
      readOptional('sales-sync.json'),
      readOptional('expenses-sync.json'),
      readOptional('settlement-sync.json'),
    ]);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="farmpro-settlement-preview-snapshot.json"');
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      kind: 'farmpro-settlement-preview-readonly-backup',
      exportedAt: new Date().toISOString(),
      farm,
      sync: { salesSync, expensesSync, settlementSync },
      note: 'Read-only snapshot. Never import through the legacy restore endpoint.',
    });
  } catch {
    res.status(500).json({ message: '検証用バックアップを作成できませんでした' });
  }
});
