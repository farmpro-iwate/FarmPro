import { Router } from 'express';
import { createBlvTest, deleteBlvTest, findBlvTest, listBlvTests, updateBlvTest } from '../blvStore';

export const blvTestsRouter = Router();

blvTestsRouter.get('/', async (_req, res) => {
  res.json(await listBlvTests());
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
