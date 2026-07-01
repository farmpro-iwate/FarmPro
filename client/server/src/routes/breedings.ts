import { Router } from 'express';
import { createBreeding, deleteBreeding, findBreeding, listBreedings, updateBreeding } from '../breedingStore';
export const breedingsRouter = Router();
breedingsRouter.get('/', async (_req, res) => res.json(await listBreedings()));
breedingsRouter.get('/:id', async (req, res) => {
  const breeding = await findBreeding(Number(req.params.id));
  if (!breeding) { res.status(404).json({ message: '繁殖記録が見つかりません' }); return; }
  res.json(breeding);
});
breedingsRouter.post('/', async (req, res) => {
  const { cowEarTag, cowName, inseminationDate } = req.body;
  if (!cowEarTag || !cowName || !inseminationDate) { res.status(400).json({ message: '個体番号、牛名、授精日は必須です' }); return; }
  res.status(201).json(await createBreeding(req.body));
});
breedingsRouter.put('/:id', async (req, res) => {
  const breeding = await updateBreeding(Number(req.params.id), req.body);
  if (!breeding) { res.status(404).json({ message: '繁殖記録が見つかりません' }); return; }
  res.json(breeding);
});
breedingsRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteBreeding(Number(req.params.id));
  if (!deleted) { res.status(404).json({ message: '繁殖記録が見つかりません' }); return; }
  res.status(204).send();
});
