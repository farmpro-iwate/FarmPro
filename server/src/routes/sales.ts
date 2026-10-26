import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { listSyncedSales, syncSale, importSaleIfAbsent } from '../salesSyncStore';

const router = express.Router();

type SaleStatus = '出荷予定' | '出荷済み' | '販売済み' | '取消';
type TargetType = '子牛' | '成牛' | 'その他';

type SaleRecord = {
  id: string;
  targetType: TargetType;
  targetNumber: string;
  targetName: string;
  sex: string;
  birthday: string;
  motherName: string;
  shippingPlanDate: string;
  shippingDate: string;
  saleDate: string;
  buyer: string;
  marketName: string;
  saleWeight: string;
  salePrice: string;
  status: SaleStatus;
  reason: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

const dataPath = path.join(process.cwd(), 'src', 'data', 'sales.json');

async function ensureDataFile() {
  try {
    await fs.access(dataPath);
  } catch {
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, '[]', 'utf-8');
  }
}

async function readSales(): Promise<SaleRecord[]> {
  await ensureDataFile();
  const text = await fs.readFile(dataPath, 'utf-8');
  try {
    return JSON.parse(text) as SaleRecord[];
  } catch {
    return [];
  }
}

async function writeSales(records: SaleRecord[]) {
  await ensureDataFile();
  await fs.writeFile(dataPath, JSON.stringify(records, null, 2), 'utf-8');
}

function cleanString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeStatus(value: unknown): SaleStatus {
  const text = cleanString(value);
  if (text === '出荷済み' || text === '販売済み' || text === '取消') return text;
  return '出荷予定';
}

function normalizeTargetType(value: unknown): TargetType {
  const text = cleanString(value);
  if (text === '成牛' || text === 'その他') return text;
  return '子牛';
}

function toRecord(body: Partial<SaleRecord>, existing?: SaleRecord): SaleRecord {
  const now = new Date().toISOString();

  return {
    id: existing?.id || randomUUID(),
    targetType: normalizeTargetType(body.targetType),
    targetNumber: cleanString(body.targetNumber),
    targetName: cleanString(body.targetName),
    sex: cleanString(body.sex),
    birthday: cleanString(body.birthday),
    motherName: cleanString(body.motherName),
    shippingPlanDate: cleanString(body.shippingPlanDate),
    shippingDate: cleanString(body.shippingDate),
    saleDate: cleanString(body.saleDate),
    buyer: cleanString(body.buyer),
    marketName: cleanString(body.marketName),
    saleWeight: cleanString(body.saleWeight),
    salePrice: cleanString(body.salePrice),
    status: normalizeStatus(body.status),
    reason: cleanString(body.reason),
    memo: cleanString(body.memo),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

router.get('/', async (_req, res) => {
  const records = await readSales();
  res.json(records);
});

router.get('/record-sync', async (_req, res) => {
  try {
    res.json(await listSyncedSales());
  } catch {
    res.status(500).json({ message: '出荷・販売記録の同期データ取得に失敗しました' });
  }
});

router.post('/preview-import-sale/:id', async (req, res) => {
  if (process.env.RENDER_SERVICE_NAME !== 'farmpro-settlement-sandbox' ||
      process.env.FARMPRO_SETTLEMENT_WRITE_PREVIEW !== 'enabled') {
    res.status(403).json({ message: '検証環境専用です' }); return;
  }
  const user = res.locals.authUser;
  if (!user || user.farmId !== 'settlement-preview-only' ||
      (user.plan !== 'standard' && user.plan !== 'pro')) {
    res.status(403).json({ message: '検証用農場の認証が必要です' }); return;
  }
  const id = req.params.id;
  const input = req.body;
  if (!id?.startsWith('sale:') || !input || typeof input !== 'object' ||
      input.id !== id || input.status !== '販売済み' ||
      !['TEST5953', 'TEST5954'].includes(String(input.targetNumber))) {
    res.status(400).json({ message: '対象の販売記録を確認してください' }); return;
  }
  try {
    res.status(201).json(await importSaleIfAbsent(id, input));
  } catch {
    res.status(409).json({ message: '同じ販売記録が存在するか、内容が不正です。上書きしません' });
  }
});

router.put('/record-sync/:id', async (req, res) => {
  const id = req.params.id;
  if (!id || !req.body || typeof req.body !== 'object') {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await syncSale(id, req.body));
  } catch {
    res.status(400).json({ message: '出荷・販売記録の同期に失敗しました' });
  }
});

router.delete('/record-sync/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await syncSale(id, {
      id,
      deletedAt: new Date().toISOString(),
    }));
  } catch {
    res.status(400).json({ message: '出荷・販売記録の削除同期に失敗しました' });
  }
});

router.get('/:id', async (req, res) => {
  const records = await readSales();
  const record = records.find((item) => item.id === req.params.id);

  if (!record) {
    return res.status(404).json({ message: '出荷・販売記録が見つかりません。' });
  }

  res.json(record);
});

router.post('/', async (req, res) => {
  const records = await readSales();
  const record = toRecord(req.body);
  records.unshift(record);
  await writeSales(records);
  res.status(201).json(record);
});

router.put('/:id', async (req, res) => {
  const records = await readSales();
  const index = records.findIndex((item) => item.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ message: '出荷・販売記録が見つかりません。' });
  }

  const updated = toRecord(req.body, records[index]);
  records[index] = updated;
  await writeSales(records);
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const records = await readSales();
  const next = records.filter((item) => item.id !== req.params.id);

  if (next.length === records.length) {
    return res.status(404).json({ message: '出荷・販売記録が見つかりません。' });
  }

  await writeSales(next);
  res.status(204).send();
});

export default router;
