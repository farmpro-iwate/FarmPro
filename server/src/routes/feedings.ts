import { Router } from 'express';
import fs from 'fs';
import path from 'path';

export const feedingsRouter = Router();

type FeedingRecord = {
  id: string;
  feedingDate: string;
  target: string;
  feedName: string;
  amount: string;
  unit: string;
  unitPrice: string;
  totalPrice: string;
  purpose: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

type FeedingInput = Omit<FeedingRecord, 'id' | 'createdAt' | 'updatedAt'>;

const dataPath = path.join(process.cwd(), 'src', 'data', 'feedings.json');

function ensureDataFile() {
  const dir = path.dirname(dataPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, '[]', 'utf-8');
  }
}

function readFeedings(): FeedingRecord[] {
  ensureDataFile();

  try {
    const text = fs.readFileSync(dataPath, 'utf-8');
    if (!text.trim()) return [];
    return JSON.parse(text) as FeedingRecord[];
  } catch {
    return [];
  }
}

function writeFeedings(records: FeedingRecord[]) {
  ensureDataFile();
  fs.writeFileSync(dataPath, JSON.stringify(records, null, 2), 'utf-8');
}

function makeId() {
  return `feeding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeInput(body: Partial<FeedingInput>): FeedingInput {
  return {
    feedingDate: body.feedingDate || '',
    target: body.target || '',
    feedName: body.feedName || '',
    amount: body.amount || '',
    unit: body.unit || 'kg',
    unitPrice: body.unitPrice || '',
    totalPrice: body.totalPrice || '',
    purpose: body.purpose || '',
    memo: body.memo || ''
  };
}

feedingsRouter.get('/', (_req, res) => {
  const records = readFeedings();
  res.json(records);
});

feedingsRouter.get('/:id', (req, res) => {
  const records = readFeedings();
  const record = records.find((item) => item.id === req.params.id);

  if (!record) {
    res.status(404).json({ message: '飼料給与記録が見つかりません。' });
    return;
  }

  res.json(record);
});

feedingsRouter.post('/', (req, res) => {
  const records = readFeedings();
  const now = new Date().toISOString();

  const record: FeedingRecord = {
    id: makeId(),
    ...normalizeInput(req.body),
    createdAt: now,
    updatedAt: now
  };

  records.unshift(record);
  writeFeedings(records);

  res.status(201).json(record);
});

feedingsRouter.put('/:id', (req, res) => {
  const records = readFeedings();
  const index = records.findIndex((item) => item.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ message: '飼料給与記録が見つかりません。' });
    return;
  }

  const updated: FeedingRecord = {
    ...records[index],
    ...normalizeInput(req.body),
    id: records[index].id,
    createdAt: records[index].createdAt,
    updatedAt: new Date().toISOString()
  };

  records[index] = updated;
  writeFeedings(records);

  res.json(updated);
});

feedingsRouter.delete('/:id', (req, res) => {
  const records = readFeedings();
  const next = records.filter((item) => item.id !== req.params.id);

  if (next.length === records.length) {
    res.status(404).json({ message: '飼料給与記録が見つかりません。' });
    return;
  }

  writeFeedings(next);
  res.status(204).send();
});

export default feedingsRouter;
