import { Router } from 'express';
import { readJson, writeJson } from '../utils/jsonStore';

const router = Router();

export type FarmSettings = {
  farmName: string;
  ownerName: string;
  staffName: string;
  phone: string;
  address: string;
  memo: string;
};

const defaultSettings: FarmSettings = {
  farmName: '繁殖Farm Pro',
  ownerName: '',
  staffName: '',
  phone: '',
  address: '',
  memo: ''
};

router.get('/farm', async (_req, res) => {
  const settings = await readJson<FarmSettings>('settings.json', defaultSettings);
  res.json({ ...defaultSettings, ...settings });
});

router.put('/farm', async (req, res) => {
  const input = req.body as Partial<FarmSettings>;
  const settings: FarmSettings = {
    farmName: input.farmName ?? '',
    ownerName: input.ownerName ?? '',
    staffName: input.staffName ?? '',
    phone: input.phone ?? '',
    address: input.address ?? '',
    memo: input.memo ?? ''
  };
  await writeJson('settings.json', settings);
  res.json(settings);
});

export default router;
