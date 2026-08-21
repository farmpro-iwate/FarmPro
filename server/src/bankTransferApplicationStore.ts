import { readJson, writeJson } from './jsonStore';

export type BankTransferPlanId = 'standard' | 'pro';

export type BankTransferApplication = {
  id: string;
  userId: string;
  farmId: string;
  farmName: string;
  name: string;
  email: string;
  plan: BankTransferPlanId;
  amountTaxIncluded: number;
  billing: 'monthly';
  status: 'pending';
  createdAt: string;
};

const fileName = 'bank-transfer-applications.json';

export async function createBankTransferApplication(
  input: Omit<BankTransferApplication, 'id' | 'status' | 'createdAt'>,
) {
  const data = await readJson<BankTransferApplication>(fileName, []);
  const now = new Date().toISOString();
  const item: BankTransferApplication = {
    ...input,
    id: `bank-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    status: 'pending',
    createdAt: now,
  };
  data.push(item);
  await writeJson(fileName, data);
  return item;
}
