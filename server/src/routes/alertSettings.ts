import { Router } from 'express';
import {
  getAlertSettingsFromCloud,
  saveAlertSettingsToCloud,
  type AlertSettingsCloudRecord,
} from '../alertSettingsStore';

export const alertSettingsRouter = Router();

function validDays(value: unknown) {
  const days = Number(value);
  return Number.isFinite(days) && days >= 0 && days <= 365;
}

alertSettingsRouter.get('/', async (_req, res) => {
  res.json(await getAlertSettingsFromCloud());
});

alertSettingsRouter.put('/', async (req, res) => {
  const input = req.body as Partial<AlertSettingsCloudRecord>;

  const keys: Array<keyof AlertSettingsCloudRecord> = [
    'scheduleDays',
    'pregnancyCheckDays',
    'nextHeatDays',
    'recheckDays',
    'calvingDays',
    'vaccineDays',
  ];

  if (keys.some((key) => !validDays(input[key]))) {
    res.status(400).json({ message: 'アラート設定が不正です' });
    return;
  }

  try {
    res.json(await saveAlertSettingsToCloud({
      scheduleDays: Number(input.scheduleDays),
      pregnancyCheckDays: Number(input.pregnancyCheckDays),
      nextHeatDays: Number(input.nextHeatDays),
      recheckDays: Number(input.recheckDays),
      calvingDays: Number(input.calvingDays),
      vaccineDays: Number(input.vaccineDays),
    }));
  } catch {
    res.status(400).json({ message: 'アラート設定の保存に失敗しました' });
  }
});
