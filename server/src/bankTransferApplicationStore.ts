import crypto from 'node:crypto';
import { readJson, writeJson } from './jsonStore';

export type BankTransferPlanId = 'standard' | 'pro';
export type BankTransferStatus = 'pending_payment' | 'active' | 'ended' | 'expired';

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
  expiredAt?: string;
};

const FILE_NAME = 'bank-transfer-applications.json';

function bankTransferDueDays() {
  const value = Number(process.env.FARMPRO_BANK_TRANSFER_DUE_DAYS?.trim() || '');
  return Number.isInteger(value) && value >= 1 && value <= 60 ? value : null;
}

function dueEndAt(createdAt: string) {
  const dueDays = bankTransferDueDays();
  if (!dueDays) return null;

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;

  const target = new Date(created.getTime() + dueDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(target);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return null;

  return new Date(`${year}-${month}-${day}T23:59:59.999+09:00`);
}

export async function expireOverdueBankTransferApplications(now = new Date()) {
  const data = await readJson<BankTransferApplication[]>(FILE_NAME, []);
  let changed = false;
  const expiredAt = now.toISOString();

  const next = data.map((item) => {
    if (item.status !== 'pending_payment') return item;
    const deadline = dueEndAt(item.createdAt);
    if (!deadline || now.getTime() <= deadline.getTime()) return item;
    changed = true;
    return { ...item, status: 'expired' as const, expiredAt };
  });

  if (changed) await writeJson(FILE_NAME, next);
  return { applications: next, changed };
}

export async function listBankTransferApplications() {
  const { applications } = await expireOverdueBankTransferApplications();
  return [...applications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function activateBankTransferApplication(applicationId: string, operatorEmail: string) {
  const { applications: data } = await expireOverdueBankTransferApplications();
  const index = data.findIndex((item) => item.id === applicationId);
  if (index < 0) throw new Error('BANK_TRANSFER_APPLICATION_NOT_FOUND');

  const current = data[index];
  if (current.status === 'expired') throw new Error('BANK_TRANSFER_APPLICATION_EXPIRED');
  if (current.status === 'ended') throw new Error('BANK_TRANSFER_APPLICATION_ENDED');
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
  const { applications: data } = await expireOverdueBankTransferApplications();
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
  input: Omit<BankTransferApplication, 'id' | 'status' | 'createdAt' | 'activatedAt' | 'activatedBy' | 'endedAt' | 'endedBy' | 'expiredAt'>,
) {
  const { applications: data } = await expireOverdueBankTransferApplications();
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
