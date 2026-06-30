import { Router } from 'express';
import { sampleCattle } from '../data/sampleCattle';
export const cattleRouter = Router();
cattleRouter.get('/', (_req, res) => { res.json(sampleCattle); });
