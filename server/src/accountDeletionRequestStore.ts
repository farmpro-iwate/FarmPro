import fs from 'node:fs/promises';
import path from 'node:path';
import {
  accountDataRoot, assertFarmNotRetired, atomicAccountJsonWrite,
  validAccountIdentifier, withAccountDataLock,
} from './accountDeletionGuard';

// A request is not a retirement marker: normal login and farm records remain
// available. At this stage it blocks NEW bank applications only, not Stripe.
export type AccountDeletionRequest = {
  requestId: string;
  userId: string;
  farmId: string;
  accountRevision: string;
  emailDigest: string;
  requestedBy: string;
  requestedAt: string;
  status: 'pending_review' | 'cancelled';
  cancelledAt?: string;
  cancelledBy?: string;
};

const FILE = 'account-deletion-requests.json';
const MAX_BYTES = 4 * 1024 * 1024;
export function validDeletionRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}
function validTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function validateRecords(value: unknown): asserts value is AccountDeletionRequest[] {
  if (!Array.isArray(value)) throw new Error('ACCOUNT_DELETION_REQUESTS_INVALID');
  const ids = new Set<string>();
  const pendingUsers = new Set<string>();
  const pendingFarms = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || !validDeletionRequestId(item.requestId) ||
        !validAccountIdentifier(item.userId) || !validAccountIdentifier(item.farmId) ||
        !validAccountIdentifier(item.requestedBy) || !validTime(item.requestedAt) ||
        typeof item.accountRevision !== 'string' || !/^[a-f0-9]{64}$/.test(item.accountRevision) ||
        typeof item.emailDigest !== 'string' || !/^[a-f0-9]{64}$/.test(item.emailDigest) ||
        !['pending_review', 'cancelled'].includes(item.status) || ids.has(item.requestId)) {
      throw new Error('ACCOUNT_DELETION_REQUESTS_INVALID');
    }
    ids.add(item.requestId);
    if (item.status === 'pending_review') {
      if (item.cancelledAt !== undefined || item.cancelledBy !== undefined ||
          pendingUsers.has(item.userId) || pendingFarms.has(item.farmId)) throw new Error('ACCOUNT_DELETION_REQUESTS_INVALID');
      pendingUsers.add(item.userId);
      pendingFarms.add(item.farmId);
    } else if (!validTime(item.cancelledAt) || !validAccountIdentifier(item.cancelledBy) ||
        Date.parse(item.cancelledAt) < Date.parse(item.requestedAt)) {
      throw new Error('ACCOUNT_DELETION_REQUESTS_INVALID');
    }
  }
}

export async function readAccountDeletionRequests(): Promise<AccountDeletionRequest[]> {
  const file = path.join(accountDataRoot(), FILE);
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error('ACCOUNT_DELETION_REQUESTS_INVALID');
    const parsed = JSON.parse(await fs.readFile(file, 'utf-8'));
    if (parsed?.version !== 1) throw new Error('ACCOUNT_DELETION_REQUESTS_INVALID');
    validateRecords(parsed.records);
    return parsed.records;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    // Do not replace an unreadable/corrupt hold with an empty successful state.
    throw new Error('ACCOUNT_DELETION_REQUESTS_INVALID');
  }
}
async function publish(records: AccountDeletionRequest[]) {
  validateRecords(records);
  const value = { version: 1, records };
  if (Buffer.byteLength(JSON.stringify(value, null, 2)) > MAX_BYTES) throw new Error('ACCOUNT_DELETION_REQUESTS_INVALID');
  await atomicAccountJsonWrite(path.join(accountDataRoot(), FILE), value);
}
export function pendingAccountDeletionRequest(records: AccountDeletionRequest[], userId: string, farmId: string) {
  return records.find((item) => item.status === 'pending_review' && (item.userId === userId || item.farmId === farmId));
}

// Service callers hold the same reentrant lock across current-account checks
// and publication. The store also checks IDs so duplicate delivery is harmless.
export function createAccountDeletionRequest(record: AccountDeletionRequest) {
  return withAccountDataLock(async () => {
    validateRecords([record]);
    if (record.status !== 'pending_review') throw new Error('ACCOUNT_DELETION_REQUESTS_INVALID');
    const records = await readAccountDeletionRequests();
    const existing = records.find((item) => item.requestId === record.requestId);
    if (existing) {
      if (existing.userId !== record.userId || existing.farmId !== record.farmId ||
          existing.requestedBy !== record.requestedBy || existing.emailDigest !== record.emailDigest ||
          existing.accountRevision !== record.accountRevision) throw new Error('ACCOUNT_DELETION_REQUEST_CHANGED');
      if (existing.status === 'cancelled') throw new Error('ACCOUNT_DELETION_REQUEST_CANCELLED');
      return { request: existing, alreadyRequested: true };
    }
    if (pendingAccountDeletionRequest(records, record.userId, record.farmId)) throw new Error('ACCOUNT_DELETION_REQUEST_EXISTS');
    await assertFarmNotRetired(record.farmId);
    await publish([...records, record]);
    return { request: record, alreadyRequested: false };
  });
}

export function cancelAccountDeletionRequest(userId: string, farmId: string, requestId: string, actorId: string) {
  return withAccountDataLock(async () => {
    const records = await readAccountDeletionRequests();
    const index = records.findIndex((item) => item.requestId === requestId);
    if (index < 0) throw new Error('ACCOUNT_DELETION_REQUEST_NOT_FOUND');
    const current = records[index];
    if (current.userId !== userId || current.farmId !== farmId || !validAccountIdentifier(actorId)) {
      throw new Error('ACCOUNT_DELETION_REQUEST_CHANGED');
    }
    await assertFarmNotRetired(farmId);
    const alreadyCancelled = current.status === 'cancelled';
    if (!alreadyCancelled) {
      records[index] = { ...current, status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: actorId };
      await publish(records);
    }
    // A replay of an OLD cancellation must not release a NEW request's hold.
    return { request: records[index], alreadyCancelled,
      bankApplicationsBlockedByRequest: Boolean(pendingAccountDeletionRequest(records, userId, farmId)) };
  });
}

export async function assertNewBankApplicationAllowed(userId: string, farmId: string) {
  if (!validAccountIdentifier(userId) || !validAccountIdentifier(farmId)) throw new Error('ACCOUNT_CONFIRMATION_REQUIRED');
  await assertFarmNotRetired(farmId);
  if (pendingAccountDeletionRequest(await readAccountDeletionRequests(), userId, farmId)) {
    throw new Error('ACCOUNT_DELETION_BANK_HOLD');
  }
}
