import { readJson, writeJson } from './jsonStore';

export type CloudSettlement = {
  saleId: string;
  settlementNumber: string;
  expectedNetYen: number;
  expenseIds: string[];
  createdAt: string;
};

const FILE = 'settlement-sync.json';

/**
 * Farm-scoped settlement registry foundation, only for authenticated farm requests.
 * Paid settlement writes remain disabled until settlement and expense records
 * can be committed together atomically with server-side duplicate prevention.
 */
export async function getCloudSettlement(saleId: string): Promise<CloudSettlement | null> {
  if (!saleId.trim()) throw new Error('SETTLEMENT_SALE_REQUIRED');
  const rows = await readJson<CloudSettlement[]>(FILE, []);
  return rows.find(row => row.saleId === saleId) ?? null;
}

export async function registerCloudSettlement(record: CloudSettlement): Promise<void> {
  if (!record.saleId?.trim() || !record.settlementNumber?.trim() ||
      !Number.isSafeInteger(record.expectedNetYen) || record.expectedNetYen < 0 ||
      !Array.isArray(record.expenseIds) || record.expenseIds.some(id => typeof id !== 'string' || !id.trim()) ||
      new Set(record.expenseIds).size !== record.expenseIds.length) {
    throw new Error('INVALID_CLOUD_SETTLEMENT');
  }
  const rows = await readJson<CloudSettlement[]>(FILE, []);
  if (rows.some(row => row.saleId === record.saleId)) throw new Error('CLOUD_SETTLEMENT_EXISTS');
  await writeJson(FILE, [...rows, record]);
}
