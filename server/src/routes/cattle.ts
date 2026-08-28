import { Router } from 'express';
import {
  createCattle,
  deleteCattle,
  findCattle,
  listCattle,
  syncCattle,
  updateCattle,
} from '../dataStore';

export const cattleRouter = Router();

cattleRouter.get('/', async (_req, res) => {
  res.json(await listCattle());
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
