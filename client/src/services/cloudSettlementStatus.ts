import { getAuthToken } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';

export type CloudSettlementStatus = {
  saleId: string;
  registered: boolean;
  saleReady: boolean;
  settlementNumber: string | null;
};

/** Read-only preflight. Fail closed on network/auth errors; never saves anything. */
export async function checkCloudSettlementStatus(saleId: string): Promise<CloudSettlementStatus> {
  if (!saleId.trim()) throw new Error('販売記録を確認できません');
  if (!getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync) {
    throw new Error('この確認は複数端末プラン専用です');
  }
  const token = getAuthToken();
  if (!token) throw new Error('再ログインして精算状況を確認してください');
  const response = await fetch(`/api/expenses/settlement-sync/${encodeURIComponent(saleId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('クラウド精算状況を確認できません。登録しないでください');
  const result = await response.json() as CloudSettlementStatus;
  if (result.saleId !== saleId || typeof result.registered !== 'boolean' || typeof result.saleReady !== 'boolean' ||
      !(result.settlementNumber === null || typeof result.settlementNumber === 'string')) {
    throw new Error('クラウド精算の応答を検証できません。登録しないでください');
  }
  return result;
}

export type CloudSettlementDetails = {
  settlement: {
    saleId: string;
    settlementNumber: string;
    expectedNetYen: number;
    expenseIds: string[];
    linkedExpenseIds?: string[];
    createdAt: string;
  };
  expenses: Array<{
    id: string;
    paymentDate: string;
    category: string;
    description: string;
    vendor: string;
    amount: string;
    target: string;
  }>;
};

/** Read-only cross-device inspection; never imports records into IndexedDB. */
export async function getCloudSettlementDetails(saleId: string): Promise<CloudSettlementDetails | null> {
  const status = await checkCloudSettlementStatus(saleId);
  if (!status.registered) return null;
  const token = getAuthToken();
  if (!token) throw new Error('再ログインしてください');
  const response = await fetch(`/api/expenses/settlement-sync/${encodeURIComponent(saleId)}/details`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('精算明細を確認できません');
  const details = await response.json() as CloudSettlementDetails;
  if (details?.settlement?.saleId !== saleId || !Array.isArray(details.expenses) ||
      !Array.isArray(details.settlement.expenseIds) ||
      (details.settlement.linkedExpenseIds !== undefined &&
       (!Array.isArray(details.settlement.linkedExpenseIds) ||
        details.settlement.linkedExpenseIds.some(id => typeof id !== 'string'))) ||
      details.expenses.some(row => !row || typeof row.id !== 'string' || typeof row.amount !== 'string')) {
    throw new Error('精算明細の内容が不正です');
  }
  return details;
}

/** Read-only cloud sale lookup using the same in-app bearer token as settlement checks. */
export async function checkCloudSalePresence(saleId: string): Promise<'present' | 'missing'> {
  if (!saleId.trim()) throw new Error('販売記録を確認できません');
  if (!getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync) {
    throw new Error('この確認は複数端末プラン専用です');
  }
  const token = getAuthToken();
  if (!token) throw new Error('再ログインして確認してください');
  const response = await fetch('/api/sales/record-sync', {
    method: 'GET', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  if (!response.ok) throw new Error('クラウドの販売一覧を確認できません');
  const records: unknown = await response.json();
  if (!Array.isArray(records) || !records.every(row => row && typeof row.id === 'string')) {
    throw new Error('クラウド販売一覧の形式が不正です');
  }
  return records.some(row => row.id === saleId && !row.deletedAt) ? 'present' : 'missing';
}
