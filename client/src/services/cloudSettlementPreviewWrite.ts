import { getAuthToken } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';

export type SettlementPreviewExpense = {
  id: string;
  paymentDate: string;
  category: string;
  description: string;
  vendor: string;
  amount: string;
  target: string;
};

export type SettlementPreviewInput = {
  confirmed: true;
  grossYen: number;
  adjustmentYen: number;
  deductions: Array<{ amountYen: number }>;
  bundle: {
    settlement: {
      saleId: string;
      settlementNumber: string;
      expectedNetYen: number;
      expenseIds: string[];
      createdAt: string;
    };
    expenses: SettlementPreviewExpense[];
  };
};

/**
 * Disabled-by-default preview transport, NOT wired to the registration button.
 * This only calls the server when a future explicit user-confirmed workflow
 * invokes it. The server independently requires its own preview feature gate.
 */
export async function submitCloudSettlementPreview(input: SettlementPreviewInput): Promise<void> {
  if (!getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync) {
    throw new Error('クラウド精算の対象プランではありません');
  }
  if (!input.confirmed) throw new Error('精算内容を確認してください');
  const token = getAuthToken();
  if (!token) throw new Error('再ログインしてください');
  const response = await fetch('/api/expenses/settlement-sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    if (response.status === 409) throw new Error('精算の重複または販売記録の不一致を確認してください');
    throw new Error('クラウド精算を確定できませんでした。登録状況を再確認してください');
  }
  const result = await response.json() as { registered?: boolean; saleId?: string };
  if (result?.registered !== true || result.saleId !== input.bundle.settlement.saleId) {
    throw new Error('精算確定の応答を確認できません。再登録せず状況を確認してください');
  }
}
