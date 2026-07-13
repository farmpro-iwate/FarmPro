import { Router } from 'express';
import {
  checkDuplicate,
  createMaster,
  deleteMaster,
  findMaster,
  listMasters,
  MasterCategory,
  updateMaster
} from '../masterStore';

export const mastersRouter = Router();

mastersRouter.get('/', async (req, res) => {
  const category = req.query.category as MasterCategory | undefined;
  const masters = await listMasters(category);
  res.json(masters);
});

mastersRouter.get('/:id',