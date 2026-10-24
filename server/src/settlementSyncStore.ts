import { readJson, writeJson } from './jsonStore';

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
};

export type CloudSettlement = {
  saleId: string;
  settlementNumber: string;
  expectedNetYen: number;
  expenseIds: string[];
  createdAt: string;
};

export type CloudSettlementBundle = {
  settlement: CloudSettlement;
  expenses: CloudSettlementExpense[];
};

const FILE = 'settlement-sync.json';

export async function getCloudSettlement(saleId: string): Promise<CloudSettlementBundle | null> {
  if (!saleId.trim()) throw new Error('SETTLEMENT_SALE_REQUIRED');
  const records = await readJson<CloudSettlementBundle[]>(FILE, []);
  return records.find(row => row.settlement.saleId === saleId) ?? null;
}

export async function commitCloudSettlement(bundle: CloudSettlementBundle): Promise<void> {
  const { settlement, expenses } = bundle;
  if (!settlement || !settlement.saleId?.trim() || !settlement.settlementNumber?.trim() ||
      !Number.isSafeInteger(settlement.expectedNetYen) || settlement.expectedNetYen < 0 ||
      !Array.isArray(settlement.expenseIds) || !Array.isArray(expenses) ||
      expenses.length === 0 || expenses.length > 100 ||
      settlement.expenseIds.length !== expenses.length ||
      new Set(settlement.expenseIds).size !== expenses.length ||
      expenses.some(row => !row.id?.trim() || !row.description?.trim() ||
        !row.paymentDate?.trim() || !row.category?.trim() ||
        !row.vendor?.trim() || !row.target?.trim() ||
        !/^[0-9]+$/.test(row.amount) || !Number.isSafeInteger(Number(row.amount))) ||
      expenses.some(row => !settlement.expenseIds.includes(row.id))) {
    throw new Error('INVALID_CLOUD_SETTLEMENT');
  }
  const records = await readJson<CloudSettlementBundle[]>(FILE, []);
  if (records.some(row => row.settlement.saleId === settlement.saleId)) {
    throw new Error('CLOUD_SETTLEMENT_EXISTS');
  }
  // writeJson uses an atomic temporary-file rename; the bundle is all-or-nothing.
  await writeJson(FILE, [...records, bundle]);
}
