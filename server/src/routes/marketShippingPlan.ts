import { Router } from 'express';
import {
  getMarketShippingPlanSettings,
  saveMarketShippingPlanSettings,
  type MarketShippingPlanSettings,
} from '../marketShippingPlanStore';

export const marketShippingPlanRouter = Router();

marketShippingPlanRouter.get('/', async (_req, res) => {
  res.json(await getMarketShippingPlanSettings());
});

marketShippingPlanRouter.put('/', async (req, res) => {
  const input = req.body as Partial<MarketShippingPlanSettings>;
  const fiscalYear = String(input.fiscalYear ?? '').trim();
  const minAgeDays = Number(input.minAgeDays);
  const maxAgeDays = Number(input.maxAgeDays);
  const schedules = Array.isArray(input.schedules) ? input.schedules : null;

  if (
    !fiscalYear ||
    !Number.isFinite(minAgeDays) ||
    !Number.isFinite(maxAgeDays) ||
    minAgeDays < 0 ||
    maxAgeDays < 0 ||
    minAgeDays > maxAgeDays ||
    !schedules
  ) {
    res.status(400).json({ message: '市場出荷予定設定が不正です' });
    return;
  }

  try {
    res.json(await saveMarketShippingPlanSettings({
      fiscalYear,
      minAgeDays,
      maxAgeDays,
      schedules,
    }));
  } catch {
    res.status(400).json({ message: '市場出荷予定設定の保存に失敗しました' });
  }
});
