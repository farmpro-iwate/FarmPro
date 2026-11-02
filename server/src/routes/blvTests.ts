import { Router, type Response } from 'express';
import { createBlvTest, deleteBlvTest, findBlvTest, listBlvTests, updateBlvTest } from '../blvStore';
import { deleteSyncedBlvTest, findSyncedBlvTest, listSyncedBlvTests, syncBlvTest } from '../blvSyncStore';

export const blvTestsRouter = Router();

blvTestsRouter.get('/', async (_req, res) => {
  res.json(await listBlvTests());
});

// The new sync surface uses the already authenticated, current plan. Legacy
// numeric CRUD retains its existing access and response contracts.
blvTestsRouter.use('/record-sync', (_req, res, next) => {
  const user = res.locals.authUser;
  if (!user) { res.status(401).json({ message: 'ログインが必要です' }); return; }
  if (user.plan !== 'standard' && user.plan !== 'pro') {
    res.status(403).json({ message: 'BLV検査のクラウド同期はStandard / Proプランで利用できます。' });
    return;
  }
  next();
});

function syncMutationError(error: unknown, res: Response): void {
  const code = error instanceof Error ? error.message : '';
  if (code === 'BLV_SYNC_PRECONDITION_REQUIRED') {
    res.status(428).json({ message: 'BLV検査記録の確認条件が必要です。最新の記録を確認してください。' });
  } else if (code === 'BLV_SYNC_PRECONDITION_FAILED') {
    res.status(412).json({ message: 'BLV検査記録の確認条件が一致しないため、変更していません。最新の記録を確認してください。' });
  } else if (code === 'BLV_RECORD_DELETED') {
    res.status(409).json({ message: 'このBLV検査記録は削除済みのため、保存していません。' });
  } else if (['INVALID_BLV_SYNC_ID', 'INVALID_BLV_SYNC_INPUT', 'INVALID_BLV_SYNC_CONDITION'].includes(code)) {
    res.status(400).json({ message: 'BLV検査の同期データまたは確認条件が不正です。' });
  } else {
    res.status(500).json({ message: 'BLV検査記録の同期に失敗しました。' });
  }
}

blvTestsRouter.get('/record-sync', async (_req, res) => {
  try { res.json(await listSyncedBlvTests()); }
  catch { res.status(500).json({ message: 'BLV検査の同期データを取得できませんでした。' }); }
});

blvTestsRouter.get('/record-sync/:id', async (req, res) => {
  try {
    const record = await findSyncedBlvTest(req.params.id);
    if (!record) { res.status(404).json({ message: 'BLV検査の同期データが見つかりません。' }); return; }
    res.json(record);
  } catch { res.status(500).json({ message: 'BLV検査の同期データを取得できませんでした。' }); }
});

blvTestsRouter.put('/record-sync/:id', async (req, res) => {
  try {
    res.json(await syncBlvTest(req.params.id, req.body, {
      ifMatch: req.get('If-Match'), ifNoneMatch: req.get('If-None-Match'),
    }));
  } catch (error) { syncMutationError(error, res); }
});

blvTestsRouter.delete('/record-sync/:id', async (req, res) => {
  try {
    res.json(await deleteSyncedBlvTest(req.params.id, {
      ifMatch: req.get('If-Match'), ifNoneMatch: req.get('If-None-Match'),
    }));
  } catch (error) { syncMutationError(error, res); }
});

blvTestsRouter.get('/:id', async (req, res) => {
  const item = await findBlvTest(Number(req.params.id));
  if (!item) {
    res.status(404).json({ message: 'BLV検査記録が見つかりません' });
    return;
  }
  res.json(item);
});

blvTestsRouter.post('/', async (req, res) => {
  const { cowEarTag, cowName } = req.body;
  if (!cowEarTag || !cowName) {
    res.status(400).json({ message: '必須項目を入力してください' });
    return;
  }
  try {
    res.status(201).json(await createBlvTest(req.body));
  } catch {
    res.status(400).json({ message: '登録に失敗しました' });
  }
});

blvTestsRouter.put('/:id', async (req, res) => {
  const item = await updateBlvTest(Number(req.params.id), req.body);
  if (!item) {
    res.status(404).json({ message: 'BLV検査記録が見つかりません' });
    return;
  }
  res.json(item);
});

blvTestsRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteBlvTest(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ message: 'BLV検査記録が見つかりません' });
    return;
  }
  res.status(204).send();
});
