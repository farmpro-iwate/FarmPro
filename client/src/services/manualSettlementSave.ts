import { openFarmProDatabase } from '../storage/db';
import { getSale } from './salesApi';
import type { ExpenseInput } from './expensesApi';
import { reviewSettlement, type SettlementReview } from '../utils/manualSettlement';

export type SettlementExpenseInput = ExpenseInput & { deductionIndex: number };
export type SettlementSaveInput = Omit<SettlementReview, 'existingExpenses'> & {
  expensesToCreate: SettlementExpenseInput[];
  confirmed: boolean;
};

/**
 * Atomically saves ONLY new expenses and a settlement marker.
 * Never modifies sale/animal/existing expense records.
 * Requires explicit caller confirmation. No automatic invocation.
 */
export async function saveManualSettlement(input: SettlementSaveInput): Promise<void> {
  if (!input.confirmed) throw new Error('確認後に保存してください');
  const sale = await getSale(input.saleId);
  if (Number(sale.salePrice) !== input.grossYen || sale.status !== '販売済み') {
    throw new Error('販売記録が変更されています。再確認してください');
  }
  const checks = new Set<number>();
  for (const row of input.expensesToCreate) {
    if (checks.has(row.deductionIndex)) throw new Error('同じ控除明細が複数回指定されています');
    checks.add(row.deductionIndex);
  }
  // Every linked expense is independently checked inside the write transaction.
  const linkedIds = input.deductions.map((d) => d.existingExpenseId).filter((id): id is string => !!id);
  if (new Set(linkedIds).size !== linkedIds.length) throw new Error('既存経費の重複選択はできません');
  const preflight = reviewSettlement(input);
  if (!preflight.matchesStatement) throw new Error(preflight.errors.join(' / '));
  if (checks.size !== preflight.newExpenses.length ||
      preflight.newExpenses.some((d) => !input.expensesToCreate.some((e) => input.deductions[e.deductionIndex] === d))) {
    throw new Error('新規経費の対応が不足しています');
  }
  for (const row of input.expensesToCreate) {
    const d = input.deductions[row.deductionIndex];
    if (!d || d.existingExpenseId || !/^\\d+$/.test(row.amount.trim()) || Number(row.amount) !== d.amountYen ||
        !row.paymentDate || !row.category.trim() || !row.description.trim()) {
      throw new Error('新規経費の内容を確認してください');
    }
  }
  const db = await openFarmProDatabase();
  const tx = db.transaction(['expenses', 'metadata'], 'readwrite');
  const expenses = tx.objectStore('expenses');
  const metadata = tx.objectStore('metadata');
  const marker = `settlement:${input.saleId}:${input.settlementNumber.trim()}`;
  const now = new Date().toISOString();
  const existingReqs = input.deductions
    .filter((d) => d.existingExpenseId)
    .map((d) => ({ deduction: d, req: expenses.get(d.existingExpenseId!) }));
  const markerReq = metadata.get(marker);

  return new Promise<void>((resolve, reject) => {
    let finished = false;
    const fail = (err: Error) => { if (!finished) { finished = true; reject(err); } };
    tx.oncomplete = () => { if (!finished) { finished = true; resolve(); } };
    tx.onabort = () => fail(tx.error || new Error('一括登録を取り消しました'));
    tx.onerror = () => fail(tx.error || new Error('一括登録に失敗しました'));
    markerReq.onsuccess = () => {
      if (markerReq.result) { tx.abort(); fail(new Error('同じ精算番号は登録済みです')); return; }
      for (const { deduction, req } of existingReqs) {
        const e = req.result as { amount?: string } | undefined;
        if (!e || !e.amount || !/^\\d+$/.test(e.amount.trim()) || Number(e.amount) !== deduction.amountYen) {
          tx.abort(); fail(new Error('既存経費が変更されています')); return;
        }
      }
      const createdExpenseIds: string[] = [];
      for (const row of input.expensesToCreate) {
        const { deductionIndex: _index, ...data } = row;
        const id = crypto.randomUUID();
        createdExpenseIds.push(id);
        expenses.add({ ...data, id, createdAt: now, updatedAt: now });
      }
      metadata.add({ id: marker, saleId: input.saleId, settlementNumber: input.settlementNumber.trim(),
        expenseIdsLinked: linkedIds, expenseIdsCreated: createdExpenseIds,
        createdAt: now, updatedAt: now });
    };
    markerReq.onerror = () => { tx.abort(); fail(new Error('精算番号を確認できませんでした')); };
  });
}
