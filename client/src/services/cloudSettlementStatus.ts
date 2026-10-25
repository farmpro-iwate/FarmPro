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
