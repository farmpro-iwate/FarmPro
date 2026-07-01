import { Router } from 'express';
import { createVaccine, deleteVaccine, findVaccine, listVaccines, updateVaccine } from '../vaccineStore';
export const vaccinesRouter = Router();
vaccinesRouter.get('/', async (_req, res) => res.json(await listVaccines()));
vaccinesRouter.get('/:id', async (req, res) => {
  const vaccine = await findVaccine(Number(req.params.id));
  if (!vaccine) { res.status(404).json({ message: 'ワクチン記録が見つかりません' }); return; }
  res.json(vaccine);
});
vaccinesRouter.post('/', async (req, res) => {
  const { targetType, targetNumber, targetName, vaccineName } = req.body;
  if (!targetType || !targetNumber || !targetName || !vaccineName) { res.status(400).json({ message: '対象区分、対象番号、対象名、ワクチン名は必須です' }); return; }
  res.status(201).json(await createVaccine(req.body));
});
vaccinesRouter.put('/:id', async (req, res) => {
  const vaccine = await updateVaccine(Number(req.params.id), req.body);
  if (!vaccine) { res.status(404).json({ message: 'ワクチン記録が見つかりません' }); return; }
  res.json(vaccine);
});
vaccinesRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteVaccine(Number(req.params.id));
  if (!deleted) { res.status(404).json({ message: 'ワクチン記録が見つかりません' }); return; }
  res.status(204).send();
});
