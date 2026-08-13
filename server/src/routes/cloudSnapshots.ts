import { Router } from 'express';
import { getCloudSnapshot, saveCloudSnapshot } from '../cloudSnapshotStore';

export const cloudSnapshotsRouter = Router();

cloudSnapshotsRouter.get('/latest', async (_req, res) => {
  try {
    const snapshot = await getCloudSnapshot();
    res.json(snapshot);
  } catch (error) {
    console.error('クラウドスナップショットの読み込みに失敗しました。', error);
    res.status(500).json({ message: 'クラウドデータを読み込めませんでした。' });
  }
});

cloudSnapshotsRouter.put('/latest', async (req, res) => {
  try {
    const stored = await saveCloudSnapshot(req.body);
    res.json({
      savedAt: stored.savedAt,
      exportedAt: stored.snapshot.exportedAt,
      appVersion: stored.snapshot.appVersion,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_CLOUD_SNAPSHOT') {
      res.status(400).json({ message: 'クラウド保存データの形式が正しくありません。' });
      return;
    }

    console.error('クラウドスナップショットの保存に失敗しました。', error);
    res.status(500).json({ message: 'クラウドデータを保存できませんでした。' });
  }
});
