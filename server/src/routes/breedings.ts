import { Router } from 'express';
import { createBreeding, deleteBreeding, findBreeding, listBreedings, syncBreeding, updateBreeding } from '../breedingStore';
import { markCattleAsBreeding } from '../dataStore';

export const breedingsRouter = Router();

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

breedingsRouter.put('/record-sync/:id', async (req, res) => {
  const id = req.params.id;
  if (!id || !req.body || typeof req.body !== 'object') {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await syncBreeding(id, req.body));
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'BREEDING_SYNC_CONFLICT') {
      res.status(409).json({ message: '別の端末に新しい繁殖記録の変更があります' });
      return;
    }
    res.status(400).json({ message: '繁殖記録の同期に失敗しました' });
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
  const item = await updateBreeding(req.params.id, req.body);
  if (!item) {
    res.status(404).json({ message: '繁殖記録が見つかりません' });
    return;
  }
  if (item.inseminationDate || item.transferDate) {
    await markCattleAsBreeding(item.cowEarTag);
  }
  res.json(item);
});

breedingsRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteBreeding(req.params.id);
  if (!deleted) {
    res.status(404).json({ message: '繁殖記録が見つかりません' });
    return;
  }
  res.status(204).send();
});
