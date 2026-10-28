import { currentFarmId } from './farmContext';
import { withFarmRequest } from './farmRequestGate';
import { listSyncedSales } from './salesSyncStore';
import { listSyncedExpenses } from './expenseSyncStore';
import { commitCloudSettlement, getCloudSettlement, type CloudSettlementExpense } from './settlementSyncStore';

export class SettlementRegistrationError extends Error {
  constructor(public status: 400 | 409, message: string) { super(message); }
}

const fail = (status: 400 | 409, message: string): never => {
  throw new SettlementRegistrationError(status, message);
};
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 160;
const required = (value: unknown): value is string => text(value) && value.trim().length > 0;
const yen = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const identityFields = ['targetType', 'targetNumber', 'targetName', 'birthday', 'saleDate', 'calfId', 'cattleId'] as const;

/**
 * A historical sold calf can legitimately have a farm-scoped sale record but
 * no calf ledger entry. Require the original sale's number, name, birth date,
 * sale date and amount rather than inventing an animal ID. The sale itself is
 * always addressed by its exact cloud sale ID and verified again at commit.
 */
export function saleReadyForSettlement(sale: import('./salesSyncStore').SyncedSaleRecord | undefined): boolean {
  if (!sale || sale.deletedAt || sale.status !== '販売済み' ||
      !required(sale.targetNumber) || typeof sale.salePrice !== 'string' ||
      !/^\d+$/.test(sale.salePrice.trim()) || !yen(Number(sale.salePrice))) return false;
  if (sale.targetType === '成牛') return required(sale.cattleId);
  if (sale.targetType !== '子牛') return false;
  if (required(sale.calfId)) return true;
  return !required(sale.cattleId) && required(sale.targetName) &&
    date(sale.birthday) && date(sale.saleDate);
}

/** Called only after auth/plan checks. No client farm, amount, or identity is trusted. */
export async function registerConfirmedSettlement(value: unknown): Promise<string> {
  const farmId = currentFarmId();
  if (!farmId) throw new Error('SETTLEMENT_FARM_REQUIRED');
  // Covers validation AND commit, including when the HTTP connection closes early.
  return withFarmRequest(farmId, async () => {
    if (!object(value) || value.confirmed !== true || !object(value.bundle) ||
        !object(value.bundle.settlement) || !object(value.expectedSale)) {
      return fail(400, '対象牛と精算内容を確認してから保存してください');
    }
    const { bundle, expectedSale } = value;
    const settlement = bundle.settlement as Record<string, unknown>;
    const deductions = value.deductions;
    const expenses = bundle.expenses;
    if (!required(settlement.saleId) || !required(settlement.settlementNumber) ||
        (settlement.paymentDate !== undefined && !date(settlement.paymentDate)) ||
        (settlement.vendor !== undefined && !required(settlement.vendor)) ||
        !yen(value.grossYen) || typeof value.adjustmentYen !== 'number' || !Number.isSafeInteger(value.adjustmentYen) ||
        !yen(settlement.expectedNetYen) || !Array.isArray(deductions) || deductions.length < 1 || deductions.length > 100 ||
        !Array.isArray(expenses) || expenses.length > 100 ||
        !Array.isArray(settlement.expenseIds) || !Array.isArray(settlement.linkedExpenseIds) ||
        settlement.expenseIds.some(id => !required(id)) || settlement.linkedExpenseIds.some(id => !required(id)) ||
        !['子牛', '成牛', 'その他'].includes(String(expectedSale.targetType)) || !required(expectedSale.targetNumber) ||
        ['targetType', 'targetNumber', 'targetName', 'birthday', 'saleDate'].some(key => !text(expectedSale[key])) ||
        ['calfId', 'cattleId'].some(key => expectedSale[key] !== undefined && !text(expectedSale[key])) ||
        deductions.some(d => !object(d) || !required(d.label) || !yen(d.amountYen) ||
          (d.expenseId !== undefined && !required(d.expenseId))) ||
        expenses.some(e => !object(e) || !required(e.id) || !date(e.paymentDate) ||
          !required(e.category) || !required(e.description) || !required(e.vendor) || !required(e.target) ||
          typeof e.amount !== 'string' || !/^\d+$/.test(e.amount) || !yen(Number(e.amount))) ||
        settlement.expenseIds.length !== expenses.length ||
        expenses.some((e, i) => (settlement.expenseIds as unknown[])[i] !== e.id) ||
        new Set(settlement.expenseIds).size !== expenses.length ||
        new Set(settlement.linkedExpenseIds).size !== settlement.linkedExpenseIds.length) {
      return fail(400, '精算入力が不正です。保存していません');
    }
    const saleId = settlement.saleId;
    const sale = (await listSyncedSales()).find(row => row.id === saleId);
    if (!sale || sale.deletedAt || sale.status !== '販売済み' || !required(sale.targetNumber) ||
        typeof sale.salePrice !== 'string' || !/^\d+$/.test(sale.salePrice.trim()) ||
        !yen(Number(sale.salePrice)) || Number(sale.salePrice) !== value.grossYen ||
        identityFields.some(key => String(sale[key] ?? '') !== String(expectedSale[key] ?? ''))) {
      return fail(409, '販売記録の対象牛・状態・金額が変わっています。読み直して確認してください');
    }
    // Historical sold calves may have a verified sale but no surviving calf
    // ledger row. Do not fabricate calfId or alter the existing sale.
    if (!saleReadyForSettlement(sale)) {
      return fail(409, '販売牛の個体を照合できません。保存せず販売記録を確認してください');
    }
    const historicalCalfWithoutId = sale.targetType === '子牛' && !required(sale.calfId);
    if (await getCloudSettlement(saleId)) return fail(409, 'この販売記録は精算登録済みです');
    const linked = deductions.filter(d => d.expenseId !== undefined);
    const fresh = deductions.filter(d => d.expenseId === undefined);
    // Without an immutable animal identifier, an older expense cannot be
    // attributed solely by matching ear tag and amount. Only newly created
    // settlement expenses keyed to this exact sale may be recorded.
    if (historicalCalfWithoutId && linked.length > 0) {
      return fail(409, '子牛IDがない過去販売では既存経費を紐づけできません。重複がないことを確認してください');
    }
    const animalType = sale.targetType === '子牛' ? 'calf' : sale.targetType === '成牛' ? 'cattle' : undefined;
    const animalId = animalType === 'calf' ? sale.calfId : animalType === 'cattle' ? sale.cattleId : undefined;
    const tag = sale.targetNumber.trim();
    if (linked.length !== settlement.linkedExpenseIds.length ||
        linked.some((d, i) => (settlement.linkedExpenseIds as unknown[])[i] !== d.expenseId) ||
        fresh.length !== expenses.length ||
        fresh.some((d, i) => Number(expenses[i].amount) !== d.amountYen || expenses[i].description.trim() !== d.label.trim()) ||
        expenses.some(e => e.target.trim() !== tag ||
          (e.animalEarTag !== undefined && e.animalEarTag !== sale.targetNumber) ||
          (e.animalName !== undefined && e.animalName !== sale.targetName) ||
          (e.animalType !== undefined && e.animalType !== animalType) ||
          (e.animalId !== undefined && e.animalId !== (animalId || undefined)))) {
      return fail(409, '対象牛または経費明細が一致しません');
    }
    const available = await listSyncedExpenses();
    const linkedExpenseSnapshots: CloudSettlementExpense[] = [];
    const linkedCloudIds: string[] = [];
    const canonicalIds = new Map<string, string>();
    for (const item of linked) {
      // Accept the earlier client's local-ID alias only when it resolves uniquely.
      const candidates = available.filter(e => !e.deletedAt && (e.id === item.expenseId ||
        (e.id.startsWith('expense:') && e.id.slice('expense:'.length) === item.expenseId)));
      const existing = candidates.length === 1 ? candidates[0] : undefined;
      const identifiers = [existing?.target, existing?.animalEarTag]
        .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()));
      if (!existing || identifiers.length === 0 || identifiers.some(v => v.trim() !== tag) ||
          !animalType || existing.animalType !== animalType ||
          (existing.animalId && existing.animalId !== animalId) || existing.category === '飼料費' ||
          !/^\d+$/.test(existing.amount ?? '') || Number(existing.amount) !== item.amountYen) {
        return fail(409, '紐づけた既存経費の対象牛・金額・区分を確認してください');
      }
      linkedCloudIds.push(existing.id);
      canonicalIds.set(item.expenseId, existing.id);
      linkedExpenseSnapshots.push({
        id: existing.id, paymentDate: existing.paymentDate ?? '', category: existing.category ?? '',
        description: existing.description ?? '', vendor: existing.vendor ?? '', amount: existing.amount!,
        target: existing.target ?? '', animalEarTag: existing.animalEarTag,
        animalType: existing.animalType, animalId: existing.animalId, animalName: existing.animalName,
      });
    }
    if (new Set(linkedCloudIds).size !== linkedCloudIds.length) {
      return fail(409, '同じ既存経費を重複して選択しています');
    }
    const fingerprint = (e: { paymentDate?: string; category?: string; description?: string; vendor?: string; amount?: string }) =>
      JSON.stringify([e.paymentDate, e.category?.trim(), e.description?.trim(), e.vendor?.trim(), Number(e.amount)]);
    const fingerprints = expenses.map(fingerprint);
    if (new Set(fingerprints).size !== fingerprints.length || expenses.some(e => available.some(existing =>
      !existing.deletedAt && [existing.target, existing.animalEarTag].some(number => number?.trim() === tag) &&
      fingerprint(e) === fingerprint(existing)))) {
      return fail(409, '同じ内容の経費があります。登録済み経費を選択して確認してください');
    }
    const total = deductions.reduce((sum, d) => sum + d.amountYen, 0);
    const net = value.grossYen - total + value.adjustmentYen;
    if (!yen(total) || !yen(net) || net !== settlement.expectedNetYen) {
      return fail(400, '差引精算額が一致しません');
    }
    await commitCloudSettlement({
      settlement: {
        schemaVersion: 1, saleId, settlementNumber: settlement.settlementNumber.trim(), expectedNetYen: net,
        expenseIds: [...settlement.expenseIds], linkedExpenseIds: linkedCloudIds,
        grossYen: value.grossYen, adjustmentYen: value.adjustmentYen,
        ...(typeof settlement.paymentDate === 'string' ? { paymentDate: settlement.paymentDate } : {}),
        ...(typeof settlement.vendor === 'string' ? { vendor: settlement.vendor.trim() } : {}),
        deductions: deductions.map(d => ({ label: d.label.trim(), amountYen: d.amountYen,
          ...(d.expenseId ? { expenseId: canonicalIds.get(d.expenseId)! } : {}) })),
        saleIdentity: { targetType: sale.targetType!, targetNumber: sale.targetNumber, targetName: sale.targetName ?? '',
          birthday: sale.birthday ?? '', saleDate: sale.saleDate ?? '', calfId: sale.calfId, cattleId: sale.cattleId },
        createdAt: new Date().toISOString(),
      },
      expenses: expenses.map(e => ({
        id: e.id, paymentDate: e.paymentDate, category: e.category.trim(),
        description: e.description.trim(), vendor: e.vendor.trim(), amount: String(Number(e.amount)),
        target: tag, animalEarTag: tag, animalName: sale.targetName || '',
        ...(animalType ? { animalType, ...(animalId ? { animalId } : {}) } : {}),
      })),
      linkedExpenseSnapshots,
    });
    return saleId;
  });
}
