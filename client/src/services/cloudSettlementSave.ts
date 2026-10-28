import { getAuthToken, getStoredAuthUser } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';

export type CloudSettlementSaveInput = {
  confirmed: true;
  expectedSale: {
    targetType: string;
    targetNumber: string;
    targetName: string;
    birthday: string;
    saleDate: string;
    calfId?: string;
    cattleId?: string;
  };
  grossYen: number;
  adjustmentYen: number;
  deductions: Array<{ label: string; amountYen: number; expenseId?: string }>;
  bundle: {
    settlement: {
      saleId: string;
      settlementNumber: string;
      paymentDate?: string;
      vendor?: string;
      expectedNetYen: number;
      expenseIds: string[];
      linkedExpenseIds: string[];
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
};

const attemptKey = (farmId: string, saleId: string) =>
  `farmpro:settlement-pending:${encodeURIComponent(farmId)}:${encodeURIComponent(saleId)}`;

/** Only a server response which guarantees no commit can clear a failed attempt. */
export class CloudSettlementRejectedError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export function hasPendingCloudSettlement(farmId: string, saleId: string): boolean {
  return window.localStorage.getItem(attemptKey(farmId, saleId)) !== null;
}

/** Call after a successful read-only status check, never merely after a failed POST. */
export function clearCloudSettlementAttempt(farmId: string, saleId: string): void {
  window.localStorage.removeItem(attemptKey(farmId, saleId));
}

/**
 * Formal paid-plan save. The caller must show the exact amounts and receive
 * explicit confirmation. Authentication, farm ownership, identity and amounts
 * are independently checked by the server. No automatic retries or local writes.
 */
export async function submitCloudSettlement(
  input: CloudSettlementSaveInput,
  expectedFarmId: string,
): Promise<void> {
  if (input.confirmed !== true) throw new Error('精算内容を確認してください');
  if (!getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync) {
    throw new Error('クラウド精算はStandard / Proプランで利用できます');
  }
  const user = getStoredAuthUser();
  const token = getAuthToken();
  if (!token || !expectedFarmId || user?.farmId !== expectedFarmId) {
    throw new Error('ログイン中の農場が変わりました。画面を開き直してください');
  }
  const saleId = input.bundle.settlement.saleId;
  if (hasPendingCloudSettlement(expectedFarmId, saleId)) {
    throw new Error('前回の登録結果が未確認です。先に登録状況を再確認してください');
  }
  // Persist before POST so a reload, another tab, or a lost response cannot
  // silently turn an uncertain save into an automatic repeat registration.
  const key = attemptKey(expectedFarmId, saleId);
  window.localStorage.setItem(key, new Date().toISOString());
  const response = await fetch('/api/expenses/settlement-sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    if ([400, 401, 403, 409].includes(response.status)) {
      const result = await response.json().catch(() => null) as { message?: string } | null;
      window.localStorage.removeItem(key);
      throw new CloudSettlementRejectedError(
        result?.message || '販売記録・精算内容を確認してください。保存していません', response.status,
      );
    }
    throw new Error('登録結果を確認できません。再送信せず登録状況を再確認してください');
  }
  const result = await response.json() as { registered?: boolean; saleId?: string };
  if (result?.registered !== true || result.saleId !== saleId) {
    throw new Error('精算確定の応答が不正です。再送信せず登録状況を再確認してください');
  }
  // Retain the marker until read-back also succeeds. This never changes the
  // server-confirmed success into a failed save or permits a second POST.
}
