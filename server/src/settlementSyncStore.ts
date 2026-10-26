import { readJson, writeJson } from './jsonStore';
import { currentFarmId } from './farmContext';
import { withFarmRequest } from './farmRequestGate';
import { listSyncedExpenses } from './expenseSyncStore';

/**
 * Isolated, farm-scoped settlement ledger. Not exposed as an API yet.
 * A settlement and its expense snapshots are written in ONE atomic JSON file.
 * Access must happen inside the authenticated, serialized farm request gate.
 */
export type CloudSettlementExpense = {
  id: string;
  paymentDate: string;
  category: string;
  description: string;
  vendor: string;
  amount: string;
  target: string;
  animalType?: 'cattle' | 'calf';
  animalEarTag?: string;
  animalName?: string;
};

export type CloudSettlement = {
  saleId: string;
  settlementNumber: string;
  expectedNetYen: number;
  expenseIds: string[];
  linkedExpenseIds?: string[];
  createdAt: string;
};

export type CloudSettlementBundle = {
  settlement: CloudSettlement;
  expenses: CloudSettlementExpense[];
};

const FILE = 'settlement-sync.json';

export async function getCloudSettlement(saleId: string): Promise<CloudSettlementBundle | null> {
  if (!saleId.trim()) throw new Error('SETTLEMENT_SALE_REQUIRED');
  if (!currentFarmId()) throw new Error('SETTLEMENT_FARM_REQUIRED');
  const records = await readJson<CloudSettlementBundle[]>(FILE, []);
  return records.find(row => row.settlement.saleId === saleId) ?? null;

}

export async function commitCloudSettlement(bundle: CloudSettlementBundle): Promise<void> {
  const { settlement, expenses } = bundle;
  if (!settlement || !settlement.saleId?.trim() || !settlement.settlementNumber?.trim() ||
      !Number.isSafeInteger(settlement.expectedNetYen) || settlement.expectedNetYen < 0 ||
      !Array.isArray(settlement.expenseIds) || !Array.isArray(expenses) ||
      (settlement.linkedExpenseIds !== undefined &&
        (!Array.isArray(settlement.linkedExpenseIds) ||
          settlement.linkedExpenseIds.some(id => typeof id !== 'string' || !id.trim()) ||
          new Set(settlement.linkedExpenseIds).size !== settlement.linkedExpenseIds.length)) ||
      expenses.length > 100 ||
      (expenses.length === 0 && !(settlement.linkedExpenseIds?.length)) ||
      settlement.expenseIds.length !== expenses.length ||
      new Set(settlement.expenseIds).size !== expenses.length ||
      new Set(expenses.map(row => row.id)).size !== expenses.length ||
      expenses.some(row => !row.id?.trim() || !row.description?.trim() ||
        !row.paymentDate?.trim() || !row.category?.trim() ||
        !row.vendor?.trim() || !row.target?.trim() ||
        !/^[0-9]+$/.test(row.amount) || !Number.isSafeInteger(Number(row.amount))) ||
      expenses.some(row => !settlement.expenseIds.includes(row.id))) {
    throw new Error('INVALID_CLOUD_SETTLEMENT');
  }
  const farmId = currentFarmId();
  if (!farmId) throw new Error('SETTLEMENT_FARM_REQUIRED');
  // Serializes concurrent attempts for the same farm, even when used outside an API handler.
  await withFarmRequest(farmId, async () => {
    const records = await readJson<CloudSettlementBundle[]>(FILE, []);
    if (records.some(row => row.settlement.saleId === settlement.saleId)) {
      throw new Error('CLOUD_SETTLEMENT_EXISTS');
    }
    // An expense ID, including an already-recorded linked expense, cannot be
    // attached to multiple settlements in the same farm.
    const usedLinkedIds = new Set(records.flatMap(row => row.settlement.linkedExpenseIds ?? []));
    if ((settlement.linkedExpenseIds ?? []).some(id => usedLinkedIds.has(id)) ||
        settlement.expenseIds.some(id => usedLinkedIds.has(id))) {
      throw new Error('CLOUD_SETTLEMENT_LINK_CONFLICT');
    }
    // An expense ID must not be reused by a different settlement in the same farm.
    const usedExpenseIds = new Set(records.flatMap(row => row.settlement.expenseIds));
    if (settlement.expenseIds.some(id => usedExpenseIds.has(id))) {
      throw new Error('CLOUD_SETTLEMENT_EXPENSE_ID_CONFLICT');
    }
    // Check the existing cloud expense store as well: a different record may
    // already use this ID even when the settlement registry does not.
    if ((settlement.linkedExpenseIds ?? []).some(id => settlement.expenseIds.includes(id) ||
        records.some(row => row.settlement.expenseIds.includes(id)))) {
      throw new Error('CLOUD_SETTLEMENT_LINK_CONFLICT');
    }
    const existingExpenses = await listSyncedExpenses();
    const existingIds = new Set(existingExpenses.map(row => String(row.id)));
    if (settlement.expenseIds.some(id => existingIds.has(id))) {
      throw new Error('CLOUD_SETTLEMENT_EXISTING_EXPENSE_CONFLICT');
    }
    // writeJson uses an atomic temporary-file rename; the bundle is all-or-nothing.
    await writeJson(FILE, [...records, bundle]);
  });
}
