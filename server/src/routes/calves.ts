import { Router } from 'express';
import { createCalf, deleteCalf, findCalf, listCalves, updateCalf } from '../calfStore';

export const calvesRouter = Router();

calvesRouter.get('/', async (_req, res) => {
  res.json(await listCalves());
});

calvesRouter.get('/:id', async (req, res) => {
  const item = await findCalf(Number(req.params.id));
  if (!item) {
    res.status(404).json({ message: '子牛データが見つかりません' });
    return;
  }
  res.json(item);
});

calvesRouter.post('/', async (req, res) => {
  const { calfNumber, name, birthday } = req.body;
  if (!calfNumber || !name || !birthday) {
    res.status(400).json({ message: '必須項目を入力してください' });
    return;
  }
  try {
    res.status(201).json(await createCalf(req.body));
  } catch {
    res.status(400).json({ message: '登録に失敗しました' });
  }
});

calvesRouter.put('/:id', async (req, res) => {
  const item = await updateCalf(Number(req.params.id), req.body);
  if (!item) {
    res.status(404).json({ message: '子牛データが見つかりません' });
    return;
  }
  res.json(item);
});

calvesRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteCalf(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ message: '子牛データが見つかりません' });
    return;
  }
  res.status(204).send();
});
