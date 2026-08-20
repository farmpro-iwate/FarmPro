import { Router } from 'express';
import { getCloudSnapshot, saveCloudSnapshot } from '../cloudSnapshotStore';

export const cloudSnapshotsRouter = Router();

function hasCloudPlan(plan: string | undefined) {
  return plan === 'standard' || plan === 'pro';
}

function parseExpectedRevision(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) throw new Error('INVALID_EXPECTED_REVISION');
  return revision;
}

cloudSnapshotsRouter.get('/latest', async (_req, res) => {
  const user = res.locals.authUser;
  if (!user) {
    res.status(401).json({ message: 'ログインが必要です。' });
    return;
  }
  if (!hasCloudPlan(user.plan)) {
    res.status(403).json({ message: 'クラウド保存はStandard / Proプランで利用できます。' });
    return;
  }

  try {
    const snapshot = await getCloudSnapshot(user.farmId);
    res.json(snapshot);
  } catch (error) {
    console.error('クラウドスナップショットの読み込みに失敗しました。', error);
    res.status(500).json({ message: 'クラウドデータを読み込めませんでした。' });
  }
});

cloudSnapshotsRouter.put('/latest', async (req, res) => {
  const user = res.locals.authUser;
  if (!user) {
    res.status(401).json({ message: 'ログインが必要です。' });
    return;
  }
  if (!hasCloudPlan(user.plan)) {
    res.status(403).json({ message: 'クラウド保存はStandard / Proプランで利用できます。' });
    return;
  }

  try {
    const expectedRevision = parseExpectedRevision(req.header('x-farmpro-cloud-revision'));
    const stored = await saveCloudSnapshot(user.farmId, req.body, expectedRevision);
    res.json({
      savedAt: stored.savedAt,
      revision: stored.revision,
      exportedAt: stored.snapshot.exportedAt,
      appVersion: stored.snapshot.appVersion,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_EXPECTED_REVISION') {
      res.status(400).json({ message: 'クラウドデータの世代情報が正しくありません。' });
      return;
    }
    if (error instanceof Error && error.message === 'CLOUD_SNAPSHOT_CONFLICT') {
      res.status(409).json({ message: '別の端末でクラウドデータが更新されています。同期内容を確認してください。' });
      return;
    }
    if (error instanceof Error && error.message === 'CLOUD_SNAPSHOT_FARM_MISMATCH') {
      res.status(409).json({ message: '別の農場のクラウドデータは利用できません。' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_CLOUD_SNAPSHOT') {
      res.status(400).json({ message: 'クラウド保存データの形式が正しくありません。' });
      return;
    }
    console.error('クラウドスナップショットの保存に失敗しました。', error);
    res.status(500).json({ message: 'クラウドデータを保存できませんでした。' });
  }
});
