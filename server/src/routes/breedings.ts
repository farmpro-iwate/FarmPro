import { Router } from 'express';
import { createBreeding, deleteBreeding, findBreeding, listBreedings, updateBreeding } from '../breedingStore';
import { markCattleAsBreeding } from '../dataStore';
import type { FarmProPlanId } from '../authStore';

export const breedingsRouter = Router();

function breedingCattleLimit(plan: FarmProPlanId | undefined): number | null {
  if (plan === 'pro') return null;
  if (plan === 'standard') return 99;
  return 10;
}

function isPlanLimitError(error: unknown) {
  return error instanceof Error && error.message === 'BREEDING_CATTLE_PLAN_LIMIT';
}

breedingsRouter.get('/', async (_req, res) => {
  res.json(await listBreedings());
});

breedingsRouter.get('/:id', async (req, res) => {
  const item = await findBreeding(Number(req.params.id));
  if (!item) {
    res.status(404).json({ message: '繁殖記録が見つかりません' });
    return;
  }
  res.json(item);
});

breedingsRouter.post('/', async (req, res) => {
  const { cowEarTag, cowName } = req.body;
  if (!cowEarTag || !cowName) {
    res.status(400).json({ message: '耳標番号と牛名を入力してください' });
    return;
  }
  try {
    const item = await createBreeding(req.body);
    if (item.inseminationDate || item.transferDate) {
      await markCattleAsBreeding(
        item.cowEarTag,
        breedingCattleLimit(res.locals.authUser?.plan),
      );
    }
    res.status(201).json(item);
  } catch (error) {
    if (isPlanLimitError(error)) {
      res.status(403).json({ message: '現在のプランで登録できる繁殖牛の上限に達しています。' });
      return;
    }
    res.status(400).json({ message: '登録に失敗しました' });
  }
});

breedingsRouter.put('/:id', async (req, res) => {
  const { cowEarTag, cowName } = req.body;
  if (!cowEarTag || !cowName) {
    res.status(400).json({ message: '耳標番号と牛名を入力してください' });
    return;
  }
  try {
    const item = await updateBreeding(Number(req.params.id), req.body);
    if (!item) {
      res.status(404).json({ message: '繁殖記録が見つかりません' });
      return;
    }
    if (item.inseminationDate || item.transferDate) {
      await markCattleAsBreeding(
        item.cowEarTag,
        breedingCattleLimit(res.locals.authUser?.plan),
      );
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

breedingsRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteBreeding(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ message: '繁殖記録が見つかりません' });
    return;
  }
  res.status(204).send();
});
