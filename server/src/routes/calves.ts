import { Router } from 'express';
import { createCalf, deleteCalf, findCalf, listCalves, updateCalf } from '../calfStore';

export const calvesRouter = Router();

calvesRouter.get('/', async (_req, res) => {
  res.json(await listCalves());
});

calvesRouter.get('/:id', async (req, res) => {
  const calf = await findCalf(Number(req.params.id));
  if (!calf) {
    res.status(404).json({ message: '子牛データが見つかりません' });
    return;
  }
  res.json(calf);
});

calvesRouter.post('/', async (req, res) => {
  const { calfNumber, name, birthday } = req.body;
  if (!calfNumber || !name || !birthday) {
    res.status(400).json({ message: '子牛番号、名号、生年月日は必須です' });
    return;
  }
  try {
    res.status(201).json(await createCalf(req.body));
  } catch {
    res.status(400).json({ message: '登録に失敗しました。子牛番号が重複している可能性があります。' });
  }
});

calvesRouter.put('/:id', async (req, res) => {
  const { calfNumber, name, birthday } = req.body;
  if (!calfNumber || !name || !birthday) {
    res.status(400).json({ message: '子牛番号、名号、生年月日は必須です' });
    return;
  }
  try {
    const calf = await updateCalf(Number(req.params.id), req.body);
    if (!calf) {
      res.status(404).json({ message: '子牛データが見つかりません' });
      return;
    }
    res.json(calf);
  } catch {
    res.status(400).json({ message: '更新に失敗しました。子牛番号が重複している可能性があります。' });
  }
});

calvesRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteCalf(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ message: '子牛データが見つかりません' });
    return;
  }
  res.status(204).send();
});
