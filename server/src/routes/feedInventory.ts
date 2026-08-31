import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import {
  listSyncedFeedInventory,
  syncFeedInventory,
} from '../feedInventorySyncStore';

export const feedInventoryRouter = Router();

type FeedInventoryRecord = {
  id: string;
  transactionDate: string;
  feedName: string;
  transactionType: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  totalPrice: string;
  supplier: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

type FeedInventoryInput = Omit<FeedInventoryRecord, 'id' | 'createdAt' | 'updatedAt'>;

const dataPath = path.join(process.cwd(), 'src', 'data', 'feedInventory.json');

function ensureDataFile() {
  const dir = path.dirname(dataPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, '[]', 'utf-8');
  }
}

function readRecords(): FeedInventoryRecord[] {
  ensureDataFile();

  try {
    const text = fs.readFileSync(dataPath, 'utf-8');
    if (!text.trim()) return [];
    return JSON.parse(text) as FeedInventoryRecord[];
  } catch {
    return [];
  }
}

function writeRecords(records: FeedInventoryRecord[]) {
  ensureDataFile();
  fs.writeFileSync(dataPath, JSON.stringify(records, null, 2), 'utf-8');
}

function makeId() {
  return `feed_inventory_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeInput(body: Partial<FeedInventoryInput>): FeedInventoryInput {
  return {
    transactionDate: body.transactionDate || '',
    feedName: body.feedName || '',
    transactionType: body.transactionType || '入庫',
    quantity: body.quantity || '',
    unit: body.unit || 'kg',
    unitPrice: body.unitPrice || '',
    totalPrice: body.totalPrice || '',
    supplier: body.supplier || '',
    memo: body.memo || ''
  };
}

feedInventoryRouter.get('/record-sync', async (_req, res) => {
  res.json(await listSyncedFeedInventory());
});

feedInventoryRouter.put('/record-sync/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await syncFeedInventory(id, { ...req.body, id }));
  } catch {
    res.status(400).json({ message: '飼料在庫記録の同期に失敗しました' });
  }
});

feedInventoryRouter.delete('/record-sync/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await syncFeedInventory(id, {
      id,
      deletedAt: new Date().toISOString(),
    }));
  } catch {
    res.status(400).json({ message: '飼料在庫記録の削除同期に失敗しました' });
  }
});

feedInventoryRouter.get('/', (_req, res) => {
  const records = readRecords();
  res.json(records);
});

feedInventoryRouter.get('/:id', (req, res) => {
  const records = readRecords();
  const record = records.find((item) => item.id === req.params.id);

  if (!record) {
    res.status(404).json({ message: '飼料在庫記録が見つかりません。' });
    return;
  }

  res.json(record);
});

feedInventoryRouter.post('/', (req, res) => {
  const records = readRecords();
  const now = new Date().toISOString();

  const record: FeedInventoryRecord = {
    id: makeId(),
    ...normalizeInput(req.body),
    createdAt: now,
    updatedAt: now
  };

  records.unshift(record);
  writeRecords(records);

  res.status(201).json(record);
});

feedInventoryRouter.put('/:id', (req, res) => {
  const records = readRecords();
  const index = records.findIndex((item) => item.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ message: '飼料在庫記録が見つかりません。' });
    return;
  }

  const updated: FeedInventoryRecord = {
    ...records[index],
    ...normalizeInput(req.body),
    id: records[index].id,
    createdAt: records[index].createdAt,
    updatedAt: new Date().toISOString()
  };

  records[index] = updated;
  writeRecords(records);

  res.json(updated);
});

feedInventoryRouter.delete('/:id', (req, res) => {
  const records = readRecords();
  const next = records.filter((item) => item.id !== req.params.id);

  if (next.length === records.length) {
    res.status(404).json({ message: '飼料在庫記録が見つかりません。' });
    return;
  }

  writeRecords(next);
  res.status(204).send();
});

export default feedInventoryRouter;
