import { Router } from 'express';
import fs from 'fs';
import path from 'path';

export const feedingGuideRouter = Router();

type FeedingGuideRecord = {
  id: string;
  ageDays: string;
  ageMonth: string;
  stageName: string;
  targetWeight: string;
  targetHeight: string;
  targetChest: string;
  starterAmount: string;
  growingFeedAmount: string;
  roughageAmount: string;
  otherAmount: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

type FeedingGuideInput = Omit<FeedingGuideRecord, 'id' | 'createdAt' | 'updatedAt'>;

const dataPath = path.join(process.cwd(), 'src', 'data', 'feedingGuide.json');

function ensureDataFile() {
  const dir = path.dirname(dataPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, '[]', 'utf-8');
  }
}

function readRecords(): FeedingGuideRecord[] {
  ensureDataFile();

  try {
    const text = fs.readFileSync(dataPath, 'utf-8');
    if (!text.trim()) return [];
    return JSON.parse(text) as FeedingGuideRecord[];
  } catch {
    return [];
  }
}

function writeRecords(records: FeedingGuideRecord[]) {
  ensureDataFile();
  fs.writeFileSync(dataPath, JSON.stringify(records, null, 2), 'utf-8');
}

function makeId() {
  return `feeding_guide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function numberValue(value: string) {
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function normalizeInput(body: Partial<FeedingGuideInput>): FeedingGuideInput {
  return {
    ageDays: body.ageDays || '',
    ageMonth: body.ageMonth || '',
    stageName: body.stageName || '',
    targetWeight: body.targetWeight || '',
    targetHeight: body.targetHeight || '',
    targetChest: body.targetChest || '',
    starterAmount: body.starterAmount || '',
    growingFeedAmount: body.growingFeedAmount || '',
    roughageAmount: body.roughageAmount || '',
    otherAmount: body.otherAmount || '',
    memo: body.memo || ''
  };
}

function sortByAgeDays(records: FeedingGuideRecord[]) {
  return [...records].sort((a, b) => numberValue(a.ageDays) - numberValue(b.ageDays));
}

feedingGuideRouter.get('/', (_req, res) => {
  const records = sortByAgeDays(readRecords());
  res.json(records);
});

feedingGuideRouter.get('/nearest/:ageDays', (req, res) => {
  const ageDays = numberValue(req.params.ageDays);
  const records = readRecords();

  if (records.length === 0) {
    res.status(404).json({ message: '飼料給与目安が登録されていません。' });
    return;
  }

  const nearest = records.reduce((best, current) => {
    const bestDiff = Math.abs(numberValue(best.ageDays) - ageDays);
    const currentDiff = Math.abs(numberValue(current.ageDays) - ageDays);
    return currentDiff < bestDiff ? current : best;
  }, records[0]);

  res.json(nearest);
});

feedingGuideRouter.get('/:id', (req, res) => {
  const records = readRecords();
  const record = records.find((item) => item.id === req.params.id);

  if (!record) {
    res.status(404).json({ message: '飼料給与目安が見つかりません。' });
    return;
  }

  res.json(record);
});

feedingGuideRouter.post('/', (req, res) => {
  const records = readRecords();
  const now = new Date().toISOString();

  const record: FeedingGuideRecord = {
    id: makeId(),
    ...normalizeInput(req.body),
    createdAt: now,
    updatedAt: now
  };

  records.push(record);
  writeRecords(sortByAgeDays(records));

  res.status(201).json(record);
});

feedingGuideRouter.put('/:id', (req, res) => {
  const records = readRecords();
  const index = records.findIndex((item) => item.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ message: '飼料給与目安が見つかりません。' });
    return;
  }

  const updated: FeedingGuideRecord = {
    ...records[index],
    ...normalizeInput(req.body),
    id: records[index].id,
    createdAt: records[index].createdAt,
    updatedAt: new Date().toISOString()
  };

  records[index] = updated;
  writeRecords(sortByAgeDays(records));

  res.json(updated);
});

feedingGuideRouter.delete('/:id', (req, res) => {
  const records = readRecords();
  const next = records.filter((item) => item.id !== req.params.id);

  if (next.length === records.length) {
    res.status(404).json({ message: '飼料給与目安が見つかりません。' });
    return;
  }

  writeRecords(next);
  res.status(204).send();
});

export default feedingGuideRouter;
