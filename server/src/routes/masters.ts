import { Router } from 'express';
import { createMaster, listMasters, MasterCategory, updateMaster } from '../masterStore';

const router = Router();
const categories: MasterCategory[] = ['bull', 'feed', 'medicine', 'partner'];

router.get('/', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  res.json(await listMasters(category));
});

router.post('/', async (req, res) => {
  const input