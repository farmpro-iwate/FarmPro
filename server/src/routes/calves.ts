import { Router } from 'express';
import { createCalf, deleteCalf, findCalf, listCalves, markCalfPromoted, updateCalf } from '../calfStore';
import { createCattle } from '../dataStore';

export const calvesRouter = Router();

calvesRouter.get('/', async (_req, res) => {
  res.json(await listCalves());
});

calvesRouter.get('/:id', async (req, res) => {
  const item = await