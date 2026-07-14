import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

type ExpenseRecord = {
  id: string;
  paymentDate: string;
  category: string;
  expenseCategoryMasterId?: number;
  description: string;
  vendor: string;
  amount: string;
  paymentMethod: string;
  target: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

type ExpenseInput = Omit<ExpenseRecord, 'id' | 'createdAt' | 'updatedAt'>;

const dataPath = path.join(process.cwd(), 'src', 'data', 'expenses.json');

function ensureDataFile() {
  const dir = path.dirname(dataPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, '[]', 'utf-8');
  }
}

function readExpenses(): ExpenseRecord[] {
  ensureDataFile();

  try {
    const text = fs.readFileSync(dataPath, 'utf-8');
    if (!text.trim()) return [];
    return JSON.parse(text) as ExpenseRecord[];
  } catch {
    return [];
  }
}

function writeExpenses(records: ExpenseRecord[]) {
  ensureDataFile();
  fs.writeFileSync(dataPath, JSON.stringify(records, null, 2), 'utf-8');
}

function makeId() {
  return `expense_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMasterId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return undefined;
}

function normalizeInput(body: Partial<ExpenseInput>): ExpenseInput {
  return {
    paymentDate: body.paymentDate || '',
    category: body.category || '',
    expenseCategoryMasterId: normalizeMasterId(body.expenseCategoryMasterId),
    description: body.description || '',
    vendor: body.vendor || '',
    amount: body.amount || '',
    paymentMethod: body.paymentMethod || '',
    target: body.target || '',
    memo: body.memo || ''
  };
}

router.get('/', (_req, res) => {
  const records = readExpenses();
  res.json(records);
});

router.get('/:id', (req, res) => {
  const records = readExpenses();
  const record = records.find((item) => item.id === req.params.id);

  if (!record) {
    res.status(404).json({ message: '経費記録が見つかりません。' });
    return;
  }

  res.json(record);
});

router.post('/', (req, res) => {
  const records = readExpenses();
  const now = new Date().toISOString();

  const record: ExpenseRecord = {
    id: makeId(),
    ...normalizeInput(req.body),
    createdAt: now,
    updatedAt: now
  };

  records.unshift(record);
  writeExpenses(records);

  res.status(201).json(record);
});

router.put('/:id', (req, res) => {
  const records = readExpenses();
  const index = records.findIndex((item) => item.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ message: '経費記録が見つかりません。' });
    return;
  }

  const updated: ExpenseRecord = {
    ...records[index],
    ...normalizeInput(req.body),
    id: records[index].id,
    createdAt: records[index].createdAt,
    updatedAt: new Date().toISOString()
  };

  records[index] = updated;
  writeExpenses(records);

  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const records = readExpenses();
  const next = records.filter((item) => item.id !== req.params.id);

  if (next.length === records.length) {
    res.status(404).json({ message: '経費記録が見つかりません。' });
    return;
  }

  writeExpenses(next);
  res.status(204).send();
});

export default router;
