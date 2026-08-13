import { Router } from 'express';
import { getCloudSnapshot, saveCloudSnapshot } from '../cloudSnapshotStore';

export const cloudSnapshotsRouter = Router();

cloudSnapshotsRouter.get('/latest', async (_req, res) => {
  const snapshot = await getCloudSnapshot();
  res.json(snapshot);
});

cloudSnapshotsRouter.put('/latest', async (req, res) => {
  const stored = await saveCloudSnapshot(req.body);
  res.json({
    savedAt: stored.savedAt,
    exportedAt: stored.snapshot.exportedAt,
    appVersion: stored.snapshot.appVersion,
  });
});
