import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { listSyncedExpenses, syncExpense } from '../expenseSyncStore';
import { getCloudSettlement, commitCloudSettlement, type CloudSettlementBundle } from '../settlementSyncStore';
import { listSyncedSales } from '../salesSyncStore';

const router = Router();

type ExpenseRecord = {
  id: string;
  paymentDate: string;
  category: string;
  expenseCategoryMasterId?: number;
  description: string;
  vendor: string;
  vendorMasterId?: number;
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
    vendorMasterId: normalizeMasterId(body.vendorMasterId),
    amount: body.amount || '',
    paymentMethod: body.paymentMethod || '',
    target: body.target || '',
    memo: body.memo || ''
  };
}

// Read-only probe for multi-device settlement deduplication. The global
// /api authentication middleware supplies the verified farm identity.
// No paid settlement registration is enabled by this endpoint.
router.get('/settlement-sync/:saleId', async (req, res) => {
  const user = res.locals.authUser;
  if (!user) {
    res.status(401).json({ message: 'ログインが必要です' });
    return;
  }
  if (user.plan !== 'standard' && user.plan !== 'pro') {
    res.status(403).json({ message: 'クラウド精算確認はStandard / Proプランで利用できます' });
    return;
  }
  const saleId = req.params.saleId?.trim();
  if (!saleId || saleId.length > 160) {
    res.status(400).json({ message: '販売記録IDが不正です' });
    return;
  }
  try {
    const [bundle, sales] = await Promise.all([getCloudSettlement(saleId), listSyncedSales()]);
    const sale = sales.find((record) => record.id === saleId);
    // A missing, cancelled or not-yet-sold cloud sale is NOT ready for settlement.
    const saleReady = Boolean(sale && !sale.deletedAt && sale.status === '販売済み' &&
      typeof sale.salePrice === 'string' && /^\d+$/.test(sale.salePrice.trim()) &&
      Number.isSafeInteger(Number(sale.salePrice)));
    res.json({
      saleId, registered: Boolean(bundle),
      settlementNumber: bundle?.settlement.settlementNumber ?? null,
      saleReady,
    });
  } catch {
    res.status(503).json({ message: '精算状況を確認できません。保存は行わないでください' });
  }
});

// Read-only bundle retrieval for authenticated paid farms. Does not publish
// expenses to the existing expense sync store or enable settlement writes.
router.get('/settlement-sync/:saleId/details', async (req, res) => {
  const user = res.locals.authUser;
  if (!user) { res.status(401).json({ message: 'ログインが必要です' }); return; }
  if (user.plan !== 'standard' && user.plan !== 'pro') {
    res.status(403).json({ message: 'クラウド精算はStandard / Proプランで利用できます' });
    return;
  }
  const saleId = req.params.saleId?.trim();
  if (!saleId || saleId.length > 160) {
    res.status(400).json({ message: '販売記録IDが不正です' });
    return;
  }
  try {
    const bundle = await getCloudSettlement(saleId);
    if (!bundle) { res.status(404).json({ message: '登録済み精算はありません' }); return; }
    res.json(bundle);
  } catch {
    res.status(503).json({ message: 'クラウド精算の読み込みに失敗しました' });
  }
});

// Experimental atomic settlement write. Disabled unless explicitly enabled in
// an isolated verification deployment. Existing production endpoints are unchanged.
router.post('/settlement-sync', async (req, res) => {
  if (process.env.FARMPRO_SETTLEMENT_WRITE_PREVIEW !== 'enabled') {
    res.status(403).json({ message: 'クラウド精算の保存は検証中です' });
    return;
  }
  const user = res.locals.authUser;
  if (!user) { res.status(401).json({ message: 'ログインが必要です' }); return; }
  if (user.plan !== 'standard' && user.plan !== 'pro') {
    res.status(403).json({ message: '対象プランではありません' }); return;
  }
  const body = req.body as {
    confirmed?: boolean;
    grossYen?: number;
    adjustmentYen?: number;
    deductions?: Array<{ amountYen: number; expenseId?: string }>;
    bundle?: CloudSettlementBundle;
  };
  const bundle = body?.bundle;
  const saleId = bundle?.settlement?.saleId;
  if (body?.confirmed !== true || !saleId || saleId.length > 160 ||
      !Number.isSafeInteger(body.grossYen) || !Number.isSafeInteger(body.adjustmentYen) ||
      !Array.isArray(body.deductions) || body.deductions.length > 100 ||
      body.deductions.some(d => !Number.isSafeInteger(d.amountYen) || d.amountYen <= 0) ||
      !bundle || !Array.isArray(bundle.expenses)) {
    res.status(400).json({ message: '精算内容の確認が必要です' }); return;
  }
  try {
    const sales = await listSyncedSales();
    const sale = sales.find(row => row.id === saleId);
    if (!sale || sale.deletedAt || sale.status !== '販売済み' ||
        !/^\d+$/.test(sale.salePrice || '') || Number(sale.salePrice) !== body.grossYen ||
        !Number.isSafeInteger(Number(sale.salePrice))) {
      res.status(409).json({ message: '販売記録を再確認してください' }); return;
    }
    // Existing expense links must be verified against the same farm's cloud
    // records. They are not copied into the settlement's new-expense snapshots.
    const linked = body.deductions.filter(d => d.expenseId);
    const linkedIds = linked.map(d => d.expenseId as string);
    if (new Set(linkedIds).size !== linkedIds.length) {
      res.status(422).json({ message: '同じ既存経費を重複して指定できません' }); return;
    }
    const currentExpenses = await listSyncedExpenses();
    const byId = new Map(currentExpenses.map(row => [row.id, row]));
    const saleTarget = String(sale.targetNumber || '').trim();
    if (!saleTarget || linked.some(d => {
      const row = byId.get(d.expenseId as string);
      return !row || Boolean(row.deletedAt) ||
        !/^[0-9]+$/.test(row.amount || '') ||
        Number(row.amount) !== d.amountYen ||
        String(row.target || '').trim() !== saleTarget;
    })) {
      res.status(422).json({ message: '既存経費の金額・対象牛を確認してください' }); return;
    }
    // Compare each fresh deduction amount, not only the aggregate:
    // two wrong lines must not cancel each other out.
    const freshAmounts = body.deductions.filter(d => !d.expenseId)
      .map(d => d.amountYen).sort((a, b) => a - b);
    const snapshotAmounts = bundle.expenses.map(row => Number(row.amount))
      .sort((a, b) => a - b);
    if (freshAmounts.length !== snapshotAmounts.length ||
        freshAmounts.some((amount, index) => amount !== snapshotAmounts[index])) {
      res.status(422).json({ message: '新規経費の明細金額が一致しません' }); return;
    }
    // Every newly created expense must belong to the sold animal.
    if (bundle.expenses.some(row => String(row.target || '').trim() !== saleTarget)) {
      res.status(422).json({ message: '新規経費の対象牛が販売記録と一致しません' }); return;
    }
    const expenseTotal = bundle.expenses.reduce((sum, row) => sum + Number(row.amount), 0);
    const deductionTotal = body.deductions.reduce((sum, row) => sum + row.amountYen, 0);
    if (!Number.isSafeInteger(expenseTotal) || !Number.isSafeInteger(deductionTotal) ||
        bundle.expenses.length !== body.deductions.length - linked.length ||
        expenseTotal + linked.reduce((sum, row) => sum + row.amountYen, 0) !== deductionTotal ||
        Number(body.grossYen) - deductionTotal + Number(body.adjustmentYen) !== bundle.settlement.expectedNetYen) {
      res.status(422).json({ message: '精算金額が一致しません' }); return;
    }
    // Atomic within settlement-sync.json; projected expenses are read from it.
    await commitCloudSettlement(bundle);
    res.status(201).json({ saleId, registered: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'CLOUD_SETTLEMENT_EXISTS') {
      res.status(409).json({ message: 'この販売は精算登録済みです' }); return;
    }
    res.status(409).json({ message: '精算を確定できません。保存せず内容を再確認してください' });
  }
});

router.get('/record-sync', async (_req, res) => {
  res.json(await listSyncedExpenses());
});

router.put('/record-sync/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await syncExpense(id, { ...req.body, id }));
  } catch {
    res.status(400).json({ message: '経費記録の同期に失敗しました' });
  }
});

router.delete('/record-sync/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await syncExpense(id, {
      id,
      deletedAt: new Date().toISOString(),
    }));
  } catch {
    res.status(400).json({ message: '経費記録の削除同期に失敗しました' });
  }
});

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
