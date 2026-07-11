import { Router } from 'express';
import { createMaster, listMasters, MasterCategory, updateMaster } from '../masterStore';

const router = Router();
const categories: MasterCategory[] = ['bull', 'feed', 'medicine', 'partner'];

router.get('/', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  if (category && !categories.includes(category as MasterCategory)) {
    res.status(400).json({ message: 'マスター区分が不正です' });
    return;
  }
  res.json(await listMasters(category));
});

router.post('/', async (req, res) => {
  const input = req.body;
  if (!categories.includes(input.category) || !String(input.name || '').trim()) {
    res.status(400).json({ message: '区分と名称は必須です' });
    return;
  }

  const result = await createMaster({
    category: input.category,
    name: String(input.name),
    code: String(input.code || ''),
    detail: String(input.detail || ''),
    note: String(input.note || ''),
    active: input.active !== false
  });

  if (result.duplicate) {
    res.status(409).json({ message: '同じ名称が登録済みです', item: result.duplicate });
    return;
  }
  res.status(201).json(result.item);
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const input = req.body;
  if (!Number.isInteger(id) || !categories.includes(input.category) || !String(input.name || '').trim()) {
    res.status(400).json({ message: '入力内容が不正です' });
    return;
  }

  const item = await updateMaster(id, {
    category: input.category,
    name: String(input.name),
    code: String(input.code || ''),
    detail: String(input.detail || ''),
    note: String(input.note || ''),
    active: input.active !== false
  });
  if (!item) {
    res.status(404).json({ message: 'マスターが見つかりません' });
    return;
  }
  res.json(item);
});

export default router;
