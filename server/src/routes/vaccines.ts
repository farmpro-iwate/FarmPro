import { Router } from 'express';
import { createVaccine, deleteVaccine, findVaccine, listVaccines, updateVaccine } from '../vaccineStore';

export const vaccinesRouter = Router();

vaccinesRouter.get('/', async (_req, res) => {
  res.json(await listVaccines());
});

vaccinesRouter.get('/:id', async (req, res) => {
  const item = await findVaccine(Number(req.params.id));
  if (!item) {
    res.status(404).json({ message: 'ワクチン記録が見つかりません' });
    return;
  }
  res.json(item);
});

vaccinesRouter.post('/', async (req, res) => {
  const { targetType, targetNumber, targetName, vaccineName } = req.body;
  if (!targetType || !targetNumber || !targetName || !vaccineName) {
    res.status(400).json({ message: '必須項目を入力してください' });
    return;
  }
  try {
    res.status(201).json(await createVaccine(req.body));
  } catch {
    res.status(400).json({ message: '登録に失敗しました' });
  }
});

vaccinesRouter.put('/:id', async (req, res) => {
  const item = await updateVaccine(Number(req.params.id), req.body);
  if (!item) {
    res.status(404).json({ message: 'ワクチン記録が見つかりません' });
    return;
  }
  res.json(item);
});

vaccinesRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteVaccine(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ message: 'ワクチン記録が見つかりません' });
    return;
  }
  res.status(204).send();
});
