import { Router, type Response } from 'express';
import { createBreeding, deleteBreeding, findBreeding, findSyncedBreeding, listBreedings, syncBreeding, updateBreeding } from '../breedingStore';
import { markCattleAsBreeding } from '../dataStore';

export const breedingsRouter = Router();

function mutationError(error: unknown, res: Response, deleting = false): void {
  const code = error instanceof Error ? error.message : '';
  if (code === 'BREEDING_SYNC_PRECONDITION_FAILED') {
    res.status(412).json({ message: deleting
      ? '繁殖記録が変更されているため、削除していません。最新の記録を確認してください'
      : '繁殖記録の確認条件が一致しないため、保存していません。最新の記録を確認してください' });
  } else if (code === 'BREEDING_RECORD_DELETED') {
    res.status(409).json({ message: 'この繁殖記録は削除済みのため、保存していません。最新の記録を確認してください' });
  } else if (code === 'BREEDING_SYNC_CONFLICT') {
    res.status(409).json({ message: '別の端末に新しい繁殖記録の変更があります' });
  } else {
    res.status(400).json({ message: deleting ? '繁殖記録の削除同期に失敗しました' : '繁殖記録の同期に失敗しました' });
  }
}

breedingsRouter.get('/', async (_req, res) => {
  res.json(await listBreedings());
});

breedingsRouter.get('/record-sync', async (_req, res) => {
  try {
    res.json(await listBreedings());
  } catch {
    res.status(500).json({ message: '繁殖記録の同期データ取得に失敗しました' });
  }
});

breedingsRouter.get('/record-sync/:id', async (req, res) => {
  try {
    const record = await findSyncedBreeding(req.params.id);
    if (!record) {
      res.status(404).json({ message: '繁殖記録の同期データが見つかりません' });
      return;
    }
    res.json(record);
  } catch {
    res.status(500).json({ message: '繁殖記録の同期データ取得に失敗しました' });
  }
});

breedingsRouter.put('/record-sync/:id', async (req, res) => {
  const id = req.params.id;
  if (!id.trim() || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await syncBreeding(id, req.body, { ifMatch: req.get('If-Match'), ifNoneMatch: req.get('If-None-Match') }));
  } catch (error) {
    mutationError(error, res);
  }
});

breedingsRouter.get('/:id', async (req, res) => {
  const item = await findBreeding(req.params.id);
  if (!item) {
    res.status(404).json({ message: '繁殖記録が見つかりません' });
    return;
  }
  res.json(item);
});

breedingsRouter.post('/', async (req, res) => {
  const { cowEarTag, cowName } = req.body;
  if (!cowEarTag || !cowName) {
    res.status(400).json({ message: '耳標番号と牛名を入力してください' });
    return;
  }
  try {
    const item = await createBreeding(req.body);
    if (item.inseminationDate || item.transferDate) {
      await markCattleAsBreeding(item.cowEarTag);
    }
    res.status(201).json(item);
  } catch {
    res.status(400).json({ message: '登録に失敗しました' });
  }
});

breedingsRouter.put('/:id', async (req, res) => {
  const { cowEarTag, cowName } = req.body;
  if (!cowEarTag || !cowName) {
    res.status(400).json({ message: '耳標番号と牛名を入力してください' });
    return;
  }
  try {
    const item = await updateBreeding(req.params.id, req.body, {
      ifMatch: req.get('If-Match'), ifNoneMatch: req.get('If-None-Match'),
    });
    if (!item) {
      res.status(404).json({ message: '繁殖記録が見つかりません' });
      return;
    }
    if (item.inseminationDate || item.transferDate) {
      await markCattleAsBreeding(item.cowEarTag);
    }
    res.json(item);
  } catch (error) {
    mutationError(error, res);
  }
});

breedingsRouter.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteBreeding(req.params.id, {
      ifMatch: req.get('If-Match'), ifNoneMatch: req.get('If-None-Match'),
    });
    if (!deleted) {
      res.status(404).json({ message: '繁殖記録が見つかりません' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    mutationError(error, res, true);
  }
});
