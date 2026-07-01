import { Router } from 'express';
import { createCattle, deleteCattle, findCattle, listCattle, updateCattle } from '../dataStore';

export const cattleRouter = Router();

cattleRouter.get('/', async (_req, res) => {
  res.json(await listCattle());
});

cattleRouter.get('/:id', async (req, res) => {
  const cow = await findCattle(Number(req.params.id));
  if (!cow) {
    res.status(404).json({ message: '牛データが見つかりません' });
    return;
  }
  res.json(cow);
});

cattleRouter.post('/', async (req, res) => {
  const { earTag, name, birthday } = req.body;
  if (!earTag || !name || !birthday) {
    res.status(400).json({ message: '個体番号、名号、生年月日は必須です' });
    return;
  }
  try {
    res.status(201).json(await createCattle(req.body));
  } catch {
    res.status(400).json({ message: '登録に失敗しました。個体番号が重複している可能性があります。' });
  }
});

cattleRouter.put('/:id', async (req, res) => {
  const { earTag, name, birthday } = req.body;
  if (!earTag || !name || !birthday) {
    res.status(400).json({ message: '個体番号、名号、生年月日は必須です' });
    return;
  }
  try {
    const cow = await updateCattle(Number(req.params.id), req.body);
    if (!cow) {
      res.status(404).json({ message: '牛データが見つかりません' });
      return;
    }
    res.json(cow);
  } catch {
    res.status(400).json({ message: '更新に失敗しました。個体番号が重複している可能性があります。' });
  }
});

cattleRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteCattle(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ message: '牛データが見つかりません' });
    return;
  }
  res.status(204).send();
});
