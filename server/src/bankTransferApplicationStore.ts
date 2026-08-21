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
  input: Omit<BankTransferApplication, 'status' | 'createdAt'>,
) {
  const data = await readJson<BankTransferApplication[]>(fileName, []);
  const item: BankTransferApplication = {
    ...input,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  data.push(item);
  await writeJson(fileName, data);
  return item;
}
