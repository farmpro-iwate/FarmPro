import { Router } from 'express';
import { readJson, writeJson } from '../jsonStore';

const router = Router();

export type FarmSettings = {
  farmName: string;
  ownerName: string;
  staffName: string;
  phone: string;
  address: string;
  estrousCycleDays: number;
  bullMasters: string[];
  supplierMasters: string[];
  memo: string;
};

const defaultSettings: FarmSettings = {
  farmName: '繁殖Farm Pro',
  ownerName: '',
  staffName: '',
  phone: '',
  address: '',
  estrousCycleDays: 21,
  bullMasters: [],
  supplierMasters: [],
  memo: ''
};

router.get('/farm', async (_req, res) => {
  const settings = await readJson<FarmSettings>('settings.json', defaultSettings);
  res.json({
    ...defaultSettings,
    ...settings,
    estrousCycleDays: Number(settings.estrousCycleDays || 21),
    bullMasters: Array.isArray(settings.bullMasters) ? settings.bullMasters : [],
    supplierMasters: Array.isArray(settings.supplierMasters) ? settings.supplierMasters : []
  });
});

router.put('/farm', async (req, res) => {
  const input = req.body as Partial<FarmSettings>;
  const settings: FarmSettings = {
    farmName: input.farmName ?? '',
    ownerName: input.ownerName ?? '',
    staffName: input.staffName ?? '',
    phone: input.phone ?? '',
    address: input.address ?? '',
    estrousCycleDays: Number(input.estrousCycleDays || 21),
    bullMasters: Array.isArray(input.bullMasters) ? input.bullMasters.filter(Boolean) : [],
    supplierMasters: Array.isArray(input.supplierMasters) ? input.supplierMasters.filter(Boolean) : [],
    memo: input.memo ?? ''
  };
  await writeJson('settings.json', settings);
  res.json(settings);
});

export default router;
