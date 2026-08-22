import crypto from 'node:crypto';
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
  status: 'pending_payment';
  createdAt: string;
};

const FILE_NAME = 'bank-transfer-applications.json';

export async function listBankTransferApplications() {
  const data = await readJson<BankTransferApplication[]>(FILE_NAME, []);
  return [...data].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createOrGetPendingBankTransferApplication(
  input: Omit<BankTransferApplication, 'id' | 'status' | 'createdAt'>,
) {
  const data = await readJson<BankTransferApplication[]>(FILE_NAME, []);
  const existing = data.find((item) =>
    item.userId === input.userId &&
    item.plan === input.plan &&
    item.status === 'pending_payment'
  );

  if (existing) return { application: existing, created: false };

  const application: BankTransferApplication = {
    ...input,
    id: crypto.randomUUID(),
    status: 'pending_payment',
    createdAt: new Date().toISOString(),
  };

  data.push(application);
  await writeJson(FILE_NAME, data);
  return { application, created: true };
}
