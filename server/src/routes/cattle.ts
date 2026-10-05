import { Router } from 'express';
import { createCattle, deleteCattle, findCattle, listCattle, updateCattle } from '../dataStore';
import type { FarmProPlanId } from '../authStore';

export const cattleRouter = Router();

function breedingCattleLimit(plan: FarmProPlanId | undefined): number | null {
  if (plan === 'pro') return null;
  if (plan === 'standard') return 99;
  return 10;
}

function isPlanLimitError(error: unknown) {
  return error instanceof Error && error.message === 'BREEDING_CATTLE_PLAN_LIMIT';
}

cattleRouter.get('/', async (_req, res) => {
  res.json(await listCattle());
});

cattleRouter.get('/:id', async (req, res) => {
  const item = await findCattle(Number(req.params.id));
  if (!item) {
    res.status(404).json({ message: '牛データが見つかりません' });
    return;
  }
  res.json(item);
});

cattleRouter.post('/', async (req, res) => {
  const { earTag, name, birthday } = req.body;
  if (!earTag || !name || !birthday) {
    res.status(400).json({ message: '必須項目を入力してください' });
    return;
  }
  try {
    const limit = breedingCattleLimit(res.locals.authUser?.plan);
    res.status(201).json(await createCattle(req.body, limit));
  } catch (error) {
    if (isPlanLimitError(error)) {
      res.status(403).json({ message: '現在のプランで登録できる繁殖牛の上限に達しています。' });
      return;
    }
    res.status(400).json({ message: '登録に失敗しました' });
  }
});

cattleRouter.put('/:id', async (req, res) => {
  try {
    const limit = breedingCattleLimit(res.locals.authUser?.plan);
    const item = await updateCattle(Number(req.params.id), req.body, limit);
    if (!item) {
      res.status(404).json({ message: '牛データが見つかりません' });
      return;
    }
    res.json(item);
  } catch (error) {
    if (isPlanLimitError(error)) {
      res.status(403).json({ message: '現在のプランで登録できる繁殖牛の上限に達しています。' });
      return;
    }
    res.status(400).json({ message: '更新に失敗しました' });
  }
});

cattleRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteCattle(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ message: '牛データが見つかりません' });
    return;
  }
  res.status(204).send();
});
