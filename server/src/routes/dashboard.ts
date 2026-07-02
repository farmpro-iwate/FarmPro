import { Router } from 'express';
import { getDashboard } from '../dashboardStore';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (_req, res) => {
  res.json(await getDashboard());
});
