import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AuthUser } from './authStore';
import type { BankTransferApplication } from './bankTransferApplicationStore';
import { dataPath } from './jsonStore';

type Account = Pick<AuthUser, 'id' | 'farmId' | 'plan'>;
export type BankNonRenewalReceipt = {
  version: 1;
  applicationId: string;
  userId: string;
  farmId: string;
  contractEndsAt: string;
  requestedAt: string;
  requestedByUserId: string;
};
export type BankNonRenewalSummary = {
  applicationId: string;
  contractEndsAt: string | null;
  requestedAt: string | null;
  canRequest: boolean;
  reason: string;
};

// Receipt files are separate from the existing payment ledger. This operation
// must never rewrite users.json, bank contracts, Stripe records or farm data.
function receiptPath(userId: string, applicationId: string) {
  const key = crypto.createHash('sha256').update(JSON.stringify([userId, applicationId])).digest('hex');
  return path.join(path.dirname(dataPath('users.json')), 'bank-non-renewal', `${key}.json`);
}

async function readApplications(): Promise<BankTransferApplication[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(dataPath('bank-transfer-applications.json'), 'utf-8'));
    if (!Array.isArray(parsed)) throw new Error('BANK_CONTRACTS_INVALID');
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export function validContractEnd(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const [, y, m, d, h, minute, second] = parts.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && h < 24 && minute < 60 && second < 60;
}

function selectContract(user: Account, applications: BankTransferApplication[], now: number) {
  const relevant = applications.filter((item) => item.userId === user.id);
  const active = relevant.filter((item) => item.status === 'active');
  if (!active.length) return null;
  const current = active[0];
  let reason = '';
  if (active.length !== 1 || relevant.some((item) => item.status === 'pending_payment')) {
    reason = '他の契約・入金待ち申込があります。次年度分を含めて確認してください。';
  } else if (!current.id || current.farmId !== user.farmId || current.plan !== user.plan || current.billing !== 'yearly') {
    reason = '利用者と銀行振込契約の内容が一致しません。運営者の確認が必要です。';
  } else if (!validContractEnd(current.contractEndsAt)) {
    reason = '契約終了日時を確認できません。記録を確認してから手続きしてください。';
  } else if (Date.parse(current.contractEndsAt) <= now) {
    reason = '契約終了日時を過ぎています。最新の契約状態を確認してください。';
  }
  return { current, reason };
}

async function readReceipt(current: BankTransferApplication): Promise<BankNonRenewalReceipt | null> {
  try {
    const value = JSON.parse(await fs.readFile(receiptPath(current.userId, current.id), 'utf-8'));
    if (value?.version !== 1 || value.applicationId !== current.id || value.userId !== current.userId || value.farmId !== current.farmId ||
        !validContractEnd(value.contractEndsAt) || !validContractEnd(value.requestedAt) || typeof value.requestedByUserId !== 'string' || !value.requestedByUserId) {
      throw new Error('BANK_NON_RENEWAL_RECEIPT_INVALID');
    }
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function getBankNonRenewalSummary(
  user: Account,
  applications?: BankTransferApplication[],
  now = Date.now(),
): Promise<BankNonRenewalSummary | null> {
  const selected = selectContract(user, applications ?? await readApplications(), now);
  if (!selected) return null;
  const { current } = selected;
  const receipt = await readReceipt(current);
  const receiptChanged = receipt && receipt.contractEndsAt !== current.contractEndsAt;
  const reason = selected.reason || (receiptChanged ? '受付後に契約期間が変更されています。契約内容を再確認してください。' : '');
  return {
    applicationId: current.id,
    contractEndsAt: validContractEnd(current.contractEndsAt) ? current.contractEndsAt : null,
    requestedAt: !receiptChanged ? receipt?.requestedAt ?? null : null,
    canRequest: !reason && !receipt,
    reason,
  };
}

// Serialize receipt creation in the current single-process JSON-store service.
// Readers see a complete file because it is published by an atomic rename.
let receiptQueue: Promise<void> = Promise.resolve();
export function requestBankNonRenewal(
  user: Account,
  actorId: string,
  expected: { applicationId: string; contractEndsAt: string },
) {
  const run = receiptQueue.then(async () => {
    if (!actorId) throw new Error('OPERATOR_REQUIRED');
    const applications = await readApplications();
    const selected = selectContract(user, applications, Date.now());
    if (!selected) throw new Error('ACTIVE_BANK_TRANSFER_NOT_FOUND');
    const summary = await getBankNonRenewalSummary(user, applications);
    if (!summary || summary.reason) throw new Error('BANK_NON_RENEWAL_NEEDS_REVIEW');
    if (expected.applicationId !== summary.applicationId || expected.contractEndsAt !== summary.contractEndsAt) {
      throw new Error('BANK_CONTRACT_CHANGED');
    }
    const existing = await readReceipt(selected.current);
    if (existing) return { receipt: existing, alreadyRequested: true, bankNonRenewal: summary };

    const receipt: BankNonRenewalReceipt = {
      version: 1,
      applicationId: selected.current.id,
      userId: user.id,
      farmId: user.farmId,
      contractEndsAt: summary.contractEndsAt!,
      requestedAt: new Date().toISOString(),
      requestedByUserId: actorId,
    };
    const destination = receiptPath(user.id, selected.current.id);
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    try {
      await fs.writeFile(temporary, JSON.stringify(receipt, null, 2), { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
      // Recheck before publishing. A renewal/expiry during the request must not
      // be acknowledged against a different contract shown in the dialog.
      const latest = await getBankNonRenewalSummary(user);
      if (!latest || latest.reason || latest.applicationId !== expected.applicationId || latest.contractEndsAt !== expected.contractEndsAt) {
        throw new Error('BANK_CONTRACT_CHANGED');
      }
      await fs.rename(temporary, destination);
    } finally {
      await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    }
    return {
      receipt,
      alreadyRequested: false,
      bankNonRenewal: { ...summary, requestedAt: receipt.requestedAt, canRequest: false },
    };
  });
  receiptQueue = run.then(() => undefined, () => undefined);
  return run;
}
