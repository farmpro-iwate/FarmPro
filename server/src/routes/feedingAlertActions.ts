import { Router } from 'express';
import fs from 'fs';
import path from 'path';

export const feedingAlertActionsRouter = Router();

type FeedingAlertAction = {
  id: string;
  actionDate: string;
  calfId: string;
  calfName: string;
  ageDays: string;
  alertType: string;
  actionType: string;
  memo: string;
  nextCheckDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

const dataPath = path.join(process.cwd(), 'src', 'data', 'feedingAlertActions.json');

function ensureDataFile() {
  const dir = path.dirname(dataPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, '[]', 'utf-8');
  }
}

function readItems(): FeedingAlertAction[] {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeItems(items: FeedingAlertAction[]) {
  ensureDataFile();
  fs.writeFileSync(dataPath, JSON.stringify(items, null, 2), 'utf-8');
}

function makeId() {
  return `faa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeBody(body: any) {
  return {
    actionDate: String(body.actionDate || ''),
    calfId: String(body.calfId || ''),
    calfName: String(body.calfName || ''),
    ageDays: String(body.ageDays || ''),
    alertType: String(body.alertType || ''),
    actionType: String(body.actionType || ''),
    memo: String(body.memo || ''),
    nextCheckDate: String(body.nextCheckDate || ''),
    status: String(body.status || '未対応')
  };
}

feedingAlertActionsRouter.get('/', (_req, res) => {
  const items = readItems();
  const sorted = [...items].sort((a, b) => {
    const dateCompare = String(b.actionDate || '').localeCompare(String(a.actionDate || ''));
    if (dateCompare !== 0) return dateCompare;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });

  res.json(sorted);
});

feedingAlertActionsRouter.get('/:id', (req, res) => {
  const items = readItems();
  const item = items.find((row) => row.id === req.params.id);

  if (!item) {
    res.status(404).json({ message: '給与アラート対応記録が見つかりません。' });
    return;
  }

  res.json(item);
});

feedingAlertActionsRouter.post('/', (req, res) => {
  const items = readItems();
  const now = new Date().toISOString();
  const body = normalizeBody(req.body || {});

  if (!body.actionDate) {
    res.status(400).json({ message: '対応日は必須です。' });
    return;
  }

  if (!body.alertType) {
    res.status(400).json({ message: 'アラート種別は必須です。' });
    return;
  }

  if (!body.actionType) {
    res.status(400).json({ message: '対応内容は必須です。' });
    return;
  }

  const item: FeedingAlertAction = {
    id: makeId(),
    ...body,
    createdAt: now,
    updatedAt: now
  };

  items.push(item);
  writeItems(items);

  res.status(201).json(item);
});

feedingAlertActionsRouter.put('/:id', (req, res) => {
  const items = readItems();
  const index = items.findIndex((row) => row.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ message: '給与アラート対応記録が見つかりません。' });
    return;
  }

  const now = new Date().toISOString();
  const body = normalizeBody(req.body || {});

  if (!body.actionDate) {
    res.status(400).json({ message: '対応日は必須です。' });
    return;
  }

  if (!body.alertType) {
    res.status(400).json({ message: 'アラート種別は必須です。' });
    return;
  }

  if (!body.actionType) {
    res.status(400).json({ message: '対応内容は必須です。' });
    return;
  }

  const updated: FeedingAlertAction = {
    ...items[index],
    ...body,
    id: items[index].id,
    createdAt: items[index].createdAt,
    updatedAt: now
  };

  items[index] = updated;
  writeItems(items);

  res.json(updated);
});

feedingAlertActionsRouter.delete('/:id', (req, res) => {
  const items = readItems();
  const exists = items.some((row) => row.id === req.params.id);

  if (!exists) {
    res.status(404).json({ message: '給与アラート対応記録が見つかりません。' });
    return;
  }

  const nextItems = items.filter((row) => row.id !== req.params.id);
  writeItems(nextItems);

  res.status(204).send();
});

export default feedingAlertActionsRouter;
