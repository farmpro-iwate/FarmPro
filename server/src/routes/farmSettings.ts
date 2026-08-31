import { Router } from 'express';
import {
  getFarmSettingsFromCloud,
  saveFarmSettingsToCloud,
  type FarmSettingsCloudRecord,
} from '../farmSettingsStore';

export const farmSettingsRouter = Router();

farmSettingsRouter.get('/', async (_req, res) => {
  res.json(await getFarmSettingsFromCloud());
});

farmSettingsRouter.put('/', async (req, res) => {
  const input = req.body as Partial<FarmSettingsCloudRecord>;
  const farmName = String(input.farmName ?? '').trim();
  const ownerName = String(input.ownerName ?? '').trim();
  const staffName = String(input.staffName ?? '').trim();
  const phone = String(input.phone ?? '').trim();
  const address = String(input.address ?? '').trim();
  const estrousCycleDays = Number(input.estrousCycleDays);
  const bullMasters = Array.isArray(input.bullMasters) ? input.bullMasters.map((item) => String(item)) : [];
  const supplierMasters = Array.isArray(input.supplierMasters) ? input.supplierMasters.map((item) => String(item)) : [];
  const memo = String(input.memo ?? '');

  if (!Number.isFinite(estrousCycleDays) || estrousCycleDays <= 0) {
    res.status(400).json({ message: '農場設定が不正です' });
    return;
  }

  try {
    res.json(await saveFarmSettingsToCloud({
      farmName,
      ownerName,
      staffName,
      phone,
      address,
      estrousCycleDays,
      bullMasters,
      supplierMasters,
      memo,
    }));
  } catch {
    res.status(400).json({ message: '農場設定の保存に失敗しました' });
  }
});
