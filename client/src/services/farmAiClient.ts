import { getAuthToken } from './authClient';

export type MonthlyBalanceAiSummary = {
  yearMonth: string;
  salesTotalAmount: number;
  salesProductionCostAmount: number;
  salesProfitAmount: number;
  expenseTotalAmount: number;
  balanceAmount: number;
  salesSoldCount: number;
  expenseCount: number;
  expenseFeedAmount: number;
  expenseMedicalAmount: number;
  expenseBreedingAmount: number;
  expenseOtherAmount: number;
};

export type FarmAiQuestionResponse = {
  handled: boolean;
  answer?: string;
  source?: {
    earTag?: string;
    breedingId?: string | number;
    inseminationDate?: string;
    recordType?: string;
  };
  model?: string;
};

async function readErrorMessage(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `AIへの質問に失敗しました（${response.status}）`;
  } catch {
    return `AIへの質問に失敗しました（${response.status}）`;
  }
}

export async function askFarmAi(question: string): Promise<FarmAiQuestionResponse> {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');

  const response = await fetch('/api/farm-ai/question', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response.json() as Promise<FarmAiQuestionResponse>;
}


export async function askMonthlyBalanceAi(
  question: string,
  summary: MonthlyBalanceAiSummary,
  previousSummary?: MonthlyBalanceAiSummary,
): Promise<FarmAiQuestionResponse> {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');

  const response = await fetch('/api/farm-ai/monthly-balance', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question, summary, previousSummary }),
  });

  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response.json() as Promise<FarmAiQuestionResponse>;
}
