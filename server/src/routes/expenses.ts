import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { listSyncedExpenses, syncExpense } from '../expenseSyncStore';
import { commitCloudSettlement, getCloudSettlement } from '../settlementSyncStore';
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

// Authenticated farm context and per-farm serialization come from /api requireAuth.
// Never trust client-computed amounts, identity, or an existing expense reference.
router.post('/settlement-sync', async (req, res) => {
  const user = res.locals.authUser;
  if (!user) { res.status(401).json({ message: 'ログインが必要です' }); return; }
  if (user.plan !== 'standard' && user.plan !== 'pro') {
    res.status(403).json({ message: 'Standard / Proプランで利用できます' }); return;
  }
  const input = req.body;
  const bundle = input?.bundle;
  const settlement = bundle?.settlement;
  const expenses = bundle?.expenses;
  const deductions = input?.deductions;
  const yen = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
  const signedYen = (n: unknown): n is number => Number.isSafeInteger(n);
  const nonempty = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= 160;
  if (input?.confirmed !== true || !bundle || !settlement ||
      !nonempty(settlement.saleId) || !nonempty(settlement.settlementNumber) ||
      !yen(input.grossYen) || !signedYen(input.adjustmentYen) ||
      !yen(settlement.expectedNetYen) ||
      !Array.isArray(deductions) || deductions.length < 1 || deductions.length > 100 ||
      !Array.isArray(expenses) || !Array.isArray(settlement.expenseIds) ||
      !Array.isArray(settlement.linkedExpenseIds) ||
      deductions.some((d: any) => !d || !yen(d.amountYen) ||
        (d.expenseId !== undefined && !nonempty(d.expenseId))) ||
      expenses.some((e: any) => !e || !nonempty(e.id) || !nonempty(e.description) ||
        !nonempty(e.category) || !nonempty(e.vendor) || !nonempty(e.paymentDate) ||
        !nonempty(e.target) || typeof e.amount !== 'string' ||
        !/^[0-9]+$/.test(e.amount) || !yen(Number(e.amount))) ||
      !Array.isArray(settlement.expenseIds) ||
      settlement.expenseIds.length !== expenses.length ||
      expenses.some((e: any, i: number) => settlement.expenseIds[i] !== e.id) ||
      new Set(settlement.expenseIds).size !== expenses.length ||
      new Set(settlement.linkedExpenseIds).size !== settlement.linkedExpenseIds.length ||
      !nonempty(settlement.createdAt) || !Number.isFinite(Date.parse(settlement.createdAt))) {
    res.status(400).json({ message: '精算入力が不正です。保存していません' }); return;
  }
  try {
    // requireAuth holds the farm gate for the entire HTTP request; a second
    // request for this farm cannot change sales or expenses during validation.
    const sale = (await listSyncedSales()).find(s => s.id === settlement.saleId);
    if (!sale || sale.deletedAt || sale.status !== '販売済み' ||
        !sale.targetNumber?.trim() || typeof sale.salePrice !== 'string' ||
        !/^[0-9]+$/.test(sale.salePrice.trim()) ||
        !yen(Number(sale.salePrice)) || Number(sale.salePrice) !== input.grossYen) {
      res.status(409).json({ message: '販売記録の状態・金額が一致しません' }); return;
    }
    if (await getCloudSettlement(settlement.saleId)) {
      res.status(409).json({ message: 'この販売記録は精算登録済みです' }); return;
    }
    const linked = deductions.filter((d: any) => d.expenseId);
    const newly = deductions.filter((d: any) => !d.expenseId);
    if (linked.length !== settlement.linkedExpenseIds.length ||
        linked.some((d: any, i: number) => settlement.linkedExpenseIds[i] !== d.expenseId) ||
        newly.length !== expenses.length ||
        newly.some((d: any, i: number) => Number(expenses[i].amount) !== d.amountYen) ||
        expenses.some((e: any) => e.target.trim() !== sale.targetNumber!.trim() ||
          (e.animalEarTag !== undefined && e.animalEarTag !== sale.targetNumber) ||
          (e.animalName !== undefined && e.animalName !== sale.targetName) ||
          (e.animalType !== undefined && e.animalType !==
            (sale.targetType === '子牛' ? 'calf' : sale.targetType === '成牛' ? 'cattle' : undefined)) ||
          (e.animalId !== undefined && e.animalId !==
            (sale.targetType === '子牛' ? sale.calfId : sale.targetType === '成牛' ? sale.motherCowId : undefined)))) {
      res.status(409).json({ message: '対象牛または経費明細が一致しません' }); return;
    }
    const available = await listSyncedExpenses();
    for (const item of linked) {
      const existing = available.find(e => e.id === item.expenseId && !e.deletedAt);
      const identifiers = [existing?.target, existing?.animalEarTag].filter(v => typeof v === 'string' && v.trim());
      if (!existing || identifiers.length === 0 ||
          identifiers.some(v => v !== sale.targetNumber) ||
          !/^[0-9]+$/.test(existing.amount ?? '') ||
          Number(existing.amount) !== item.amountYen) {
        res.status(409).json({ message: '紐づけた既存経費の対象牛または金額が一致しません' }); return;
      }
    }
    const total = deductions.reduce((n: number, d: any) => n + d.amountYen, 0);
    const calculated = input.grossYen - total + input.adjustmentYen;
    if (!yen(total) || !yen(calculated) || calculated !== settlement.expectedNetYen) {
      res.status(400).json({ message: '差引精算額が一致しません' }); return;
    }
    // Reconstruct trusted identity fields from the cloud sale record.
    const sanitized = {
      settlement: {
        saleId: settlement.saleId, settlementNumber: settlement.settlementNumber.trim(),
        expectedNetYen: calculated, expenseIds: [...settlement.expenseIds],
        linkedExpenseIds: [...settlement.linkedExpenseIds], createdAt: new Date().toISOString(),
      },
      expenses: expenses.map((e: any) => ({
        id: e.id, paymentDate: e.paymentDate, category: e.category,
        description: e.description, vendor: e.vendor, amount: e.amount,
        target: sale.targetNumber!, animalEarTag: sale.targetNumber!,
        animalName: sale.targetName || '',
        ...(sale.targetType === '子牛' ? { animalType: 'calf' as const, animalId: sale.calfId } :
          sale.targetType === '成牛' ? { animalType: 'cattle' as const, animalId: sale.motherCowId } : {}),
      })),
    };
    await commitCloudSettlement(sanitized);
    res.status(201).json({ registered: true, saleId: settlement.saleId });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code.startsWith('CLOUD_SETTLEMENT_') || code === 'INVALID_CLOUD_SETTLEMENT') {
      res.status(409).json({ message: '登録済み精算・経費との重複が見つかりました' });
    } else {
      res.status(503).json({ message: '保存結果が不明です。再送信せず、登録状況を確認してください' });
    }
  }
});

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
