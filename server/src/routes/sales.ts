import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

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
