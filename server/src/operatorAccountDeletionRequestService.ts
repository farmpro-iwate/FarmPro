import fs from 'node:fs/promises';
import path from 'node:path';
import type { FarmProUser } from './authStore';
import { accountDataRoot, accountEmailDigest, readAccountRetirements, validAccountIdentifier, withAccountDataLock } from './accountDeletionGuard';
import { assertAccountIdle } from './accountRequestLease';
import { getOperatorDeletionPreview } from './operatorAccountDeletionStore';
import {
  cancelAccountDeletionRequest, createAccountDeletionRequest, pendingAccountDeletionRequest,
  readAccountDeletionRequests, validDeletionRequestId, type AccountDeletionRequest,
} from './accountDeletionRequestStore';

function operatorEmail(email: string) {
  return (process.env.FARMPRO_OPERATOR_EMAILS || '').split(',').map((part) => part.trim().toLowerCase())
    .filter(Boolean).includes(email.trim().toLowerCase());
}

// Cancellation must remain possible when an unrelated billing ledger is broken
// or a card contract was recorded after acceptance. Read identity, not billing.
async function currentIdentity(userId: string, actorId: string) {
  if (!validAccountIdentifier(userId) || !validAccountIdentifier(actorId)) throw new Error('ACCOUNT_CONFIRMATION_REQUIRED');
  const file = path.join(accountDataRoot(), 'users.json');
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('ACCOUNT_DATA_REVIEW_REQUIRED');
  const users = JSON.parse(await fs.readFile(file, 'utf-8')) as FarmProUser[];
  if (!Array.isArray(users) || users.some((item) => !item || !validAccountIdentifier(item.id) ||
      !validAccountIdentifier(item.farmId) || typeof item.email !== 'string' || !item.email.includes('@') ||
      typeof item.active !== 'boolean') || new Set(users.map((item) => item.id)).size !== users.length) {
    throw new Error('ACCOUNT_DATA_REVIEW_REQUIRED');
  }
  const retired = await readAccountRetirements();
  const actor = users.find((item) => item.id === actorId);
  if (!actor?.active || !operatorEmail(actor.email) || retired.some((item) => item.userId === actorId || item.farmId === actor.farmId)) {
    throw new Error('OPERATOR_REQUIRED');
  }
  const user = users.find((item) => item.id === userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  if (retired.some((item) => item.userId === userId || item.farmId === user.farmId)) throw new Error('ACCOUNT_RETIRED');
  return user;
}

function parseInput(value: unknown, fields: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ACCOUNT_CONFIRMATION_REQUIRED');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !fields.includes(key)) ||
      !validDeletionRequestId(input.requestId) || !validAccountIdentifier(input.farmId) || input.confirmed !== true ||
      typeof input.email !== 'string' || input.email.length > 320 || !input.email.trim().includes('@')) {
    throw new Error('ACCOUNT_CONFIRMATION_REQUIRED');
  }
  return { requestId: input.requestId, farmId: input.farmId, email: input.email.trim().toLowerCase(),
    revision: input.revision, bankApplicationHoldConfirmed: input.bankApplicationHoldConfirmed };
}
function safeRequest(request: AccountDeletionRequest | undefined) {
  if (!request) return null;
  // Do not return the credential-bound revision or the email digest in status.
  return { requestId: request.requestId, status: request.status, requestedAt: request.requestedAt,
    ...(request.cancelledAt ? { cancelledAt: request.cancelledAt } : {}) };
}
function result(request: AccountDeletionRequest | undefined, bankApplicationsBlockedByRequest: boolean) {
  return { request: safeRequest(request), bankApplicationsBlockedByRequest,
    stripeAdmissionControlled: false as const, canDelete: false as const, deleted: false as const };
}

export function getOperatorDeletionRequestState(userId: string, actorId: string) {
  return withAccountDataLock(async () => {
    const user = await currentIdentity(userId, actorId);
    const requests = await readAccountDeletionRequests();
    const pending = pendingAccountDeletionRequest(requests, user.id, user.farmId);
    if (pending && (pending.userId !== user.id || pending.farmId !== user.farmId)) throw new Error('ACCOUNT_DELETION_REQUEST_CHANGED');
    const latest = pending || requests.filter((item) => item.userId === user.id && item.farmId === user.farmId).at(-1);
    return result(latest, Boolean(pending));
  });
}

export function requestOperatorAccountDeletion(userId: string, actorId: string, value: unknown) {
  const input = parseInput(value, ['requestId', 'farmId', 'email', 'revision', 'confirmed', 'bankApplicationHoldConfirmed']);
  if (typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision) || input.bankApplicationHoldConfirmed !== true) {
    throw new Error('ACCOUNT_CONFIRMATION_REQUIRED');
  }
  const revision = input.revision;
  return withAccountDataLock(async () => {
    const user = await currentIdentity(userId, actorId);
    const preview = await getOperatorDeletionPreview(userId, actorId);
    if (preview.resuming) throw new Error('ACCOUNT_RETIRED');
    if (!preview.canDelete) throw new Error('ACCOUNT_DELETE_BLOCKED');
    if (input.farmId !== user.farmId || input.email !== user.email.trim().toLowerCase() || revision !== preview.revision) {
      throw new Error('ACCOUNT_CHANGED');
    }
    assertAccountIdle(user.farmId);
    const saved = await createAccountDeletionRequest({ requestId: input.requestId, userId, farmId: user.farmId,
      accountRevision: revision, emailDigest: accountEmailDigest(user.email), requestedBy: actorId,
      requestedAt: new Date().toISOString(), status: 'pending_review' });
    return { ...result(saved.request, true), alreadyRequested: saved.alreadyRequested,
      message: '削除の確認依頼を受け付けました。新しい銀行振込申込と、このアプリから新しいカード申込へ進む操作を停止しました。アカウントと農場データは削除していません。開始済みのカード決済や既存契約の停止・解約は、この受付では行っていません。' };
  });
}

export function cancelOperatorAccountDeletionRequest(userId: string, actorId: string, value: unknown) {
  const input = parseInput(value, ['requestId', 'farmId', 'email', 'confirmed']);
  return withAccountDataLock(async () => {
    const user = await currentIdentity(userId, actorId);
    if (user.farmId !== input.farmId || user.email.trim().toLowerCase() !== input.email) throw new Error('ACCOUNT_CHANGED');
    const saved = await cancelAccountDeletionRequest(userId, user.farmId, input.requestId, actorId);
    return { ...result(saved.request, saved.bankApplicationsBlockedByRequest), alreadyCancelled: saved.alreadyCancelled,
      message: saved.bankApplicationsBlockedByRequest
        ? '指定された依頼は取り消し済みですが、別の確認依頼が残っています。銀行振込の新規受付と、このアプリから新しいカード申込へ進む操作は引き続き停止しています。'
        : '指定された削除の確認依頼を取り消しました。この依頼による銀行振込の新規受付停止と、アプリ内のカード申込入口の停止を解除しました。申込・課金・自動更新を新たに開始したわけではありません。' };
  });
}
