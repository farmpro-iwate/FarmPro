import { Router } from 'express';
import {
  createCattle,
  deleteCattle,
  findCattle,
  listCattle,
  syncCattle,
  updateCattle,
} from '../dataStore';
import {
  listSyncedCattleRecords,
  syncCattleRecord,
  createSyncedCattleRecordIfAbsent,
} from '../cattleRecordSyncStore';

export const cattleRouter = Router();

cattleRouter.get('/', async (_req, res) => {
  res.json(await listCattle());
});

cattleRouter.get('/record-sync', async (_req, res) => {
  res.json(await listSyncedCattleRecords());
});

cattleRouter.post('/record-sync/create-only', async (req, res) => {
  const id = String(req.body?.id ?? '').trim();
  try {
    const created = await createSyncedCattleRecordIfAbsent(id, req.body);
    res.status(201).json(created);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'CATTLE_RECORD_ALREADY_EXISTS') {
      res.status(409).json({ message: '既存の牛台帳記録があるため、再送信を中止しました' });
      return;
    }
    res.status(400).json({ message: '新規同期データが不正です' });
  }
});

cattleRouter.put('/record-sync/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  const { earTag, name, birthday } = req.body;
  if (!id || !earTag || !name || !birthday) {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await syncCattleRecord(id, req.body));
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'DUPLICATED_EAR_TAG') {
      res.status(409).json({ message: '同じ耳標番号の牛がすでに登録されています' });
      return;
    }
    if (code === 'DUPLICATED_IDENTIFICATION_NUMBER') {
      res.status(409).json({ message: '同じ個体識別番号の牛がすでに登録されています' });
      return;
    }
    res.status(400).json({ message: '牛台帳のレコード同期に失敗しました' });
  }
});

cattleRouter.delete('/record-sync/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ message: '同期IDが不正です' });
    return;
  }

  try {
    const existing = (await listSyncedCattleRecords()).find((record) => String(record.id) === id);
    const now = new Date().toISOString();
    const tombstone = await syncCattleRecord(id, {
      ...(existing ?? {
        id,
        earTag: '',
        name: '',
        birthday: '',
      }),
      id,
      deletedAt: now,
      updatedAt: now,
    });
    res.json(tombstone);
  } catch {
    res.status(400).json({ message: '牛台帳の削除同期に失敗しました' });
  }
});

cattleRouter.get('/:id', async (req, res) => {
  const item = await findCattle(Number(req.params.id));
  if (!item) {
    res.status(404).json({ message: '牛データが見つかりません' });
    return;
  }
  res.json(item);
});

cattleRouter.post('/', async (req, res) => {
  const { earTag, name, birthday } = req.body;
  if (!earTag || !name || !birthday) {
    res.status(400).json({ message: '必須項目を入力してください' });
    return;
  }
  try {
    res.status(201).json(await createCattle(req.body));
  } catch {
    res.status(400).json({ message: '登録に失敗しました' });
  }
});

cattleRouter.put('/:id/sync', async (req, res) => {
  const id = Number(req.params.id);
  const { earTag, name, birthday } = req.body;
  if (!Number.isInteger(id) || id <= 0 || !earTag || !name || !birthday) {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await syncCattle(id, req.body));
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'CATTLE_SYNC_CONFLICT') {
      res.status(409).json({ message: '別の端末に新しい変更があります' });
      return;
    }
    if (code === 'DUPLICATED_EAR_TAG') {
      res.status(409).json({ message: '同じ耳標番号の牛がすでに登録されています' });
      return;
    }
    res.status(400).json({ message: '牛データの同期に失敗しました' });
  }
});

cattleRouter.put('/:id', async (req, res) => {
  const item = await updateCattle(Number(req.params.id), req.body);
  if (!item) {
    res.status(404).json({ message: '牛データが見つかりません' });
    return;
  }
  res.json(item);
});

cattleRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteCattle(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ message: '牛データが見つかりません' });
    return;
  }
  res.status(204).send();
});
