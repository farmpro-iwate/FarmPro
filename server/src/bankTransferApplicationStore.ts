import crypto from 'node:crypto';
import { readJson, writeJson } from './jsonStore';

export type BankTransferPlanId = 'standard' | 'pro';
export type BankTransferStatus = 'pending_payment' | 'active' | 'ended';

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
  status: BankTransferStatus;
  createdAt: string;
  activatedAt?: string;
  activatedBy?: string;
  endedAt?: string;
  endedBy?: string;
};

const FILE_NAME = 'bank-transfer-applications.json';

export async function listBankTransferApplications() {
  const data = await readJson<BankTransferApplication[]>(FILE_NAME, []);
  return [...data].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function activateBankTransferApplication(applicationId: string, operatorEmail: string) {
  const data = await readJson<BankTransferApplication[]>(FILE_NAME, []);
  const index = data.findIndex((item) => item.id === applicationId);
  if (index < 0) throw new Error('BANK_TRANSFER_APPLICATION_NOT_FOUND');

  const current = data[index];
  if (current.status === 'active') {
    return { application: current, alreadyActive: true };
  }

  const updated: BankTransferApplication = {
    ...current,
    status: 'active',
    activatedAt: new Date().toISOString(),
    activatedBy: operatorEmail.trim().toLowerCase(),
  };
  const next = [...data];
  next[index] = updated;
  await writeJson(FILE_NAME, next);
  return { application: updated, alreadyActive: false };
}

export async function endActiveBankTransferForUser(userId: string, operatorEmail: string) {
  const data = await readJson<BankTransferApplication[]>(FILE_NAME, []);
  const index = data.findIndex((item) => item.userId === userId && item.status === 'active');
  if (index < 0) throw new Error('ACTIVE_BANK_TRANSFER_NOT_FOUND');

  const current = data[index];
  const updated: BankTransferApplication = {
    ...current,
    status: 'ended',
    endedAt: new Date().toISOString(),
    endedBy: operatorEmail.trim().toLowerCase(),
  };
  const next = [...data];
  next[index] = updated;
  await writeJson(FILE_NAME, next);
  return updated;
}

export async function createOrGetPendingBankTransferApplication(
  input: Omit<BankTransferApplication, 'id' | 'status' | 'createdAt' | 'activatedAt' | 'activatedBy' | 'endedAt' | 'endedBy'>,
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
