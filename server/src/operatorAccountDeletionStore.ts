import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FarmProUser } from './authStore';
import {
  accountDataRoot, accountEmailDigest, atomicAccountJsonWrite, markAccountRetired,
  readAccountRetirements, validAccountIdentifier, withAccountDataLock,
} from './accountDeletionGuard';

export type AccountDeletionPreview = {
  user: { id: string; farmId: string; farmName: string; name: string; email: string; plan: string; active: boolean };
  canDelete: boolean;
  reason: string;
  revision: string;
  resuming: boolean;
};
export type AccountDeletionConfirmation = {
  farmId: string;
  email: string;
  revision: string;
  confirmed: boolean;
};

function operatorEmail(email: string) {
  return (process.env.FARMPRO_OPERATOR_EMAILS || '').split(',')
    .map((item) => item.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());
}
function digest(user: FarmProUser) {
  // The digest binds confirmation to the exact account snapshot, never its name alone.
  return crypto.createHash('sha256').update(JSON.stringify(user)).digest('hex');
}
async function readArray(file: string, optional = true): Promise<Record<string, unknown>[]> {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('ACCOUNT_DATA_REVIEW_REQUIRED');
    const value = JSON.parse(await fs.readFile(file, 'utf-8'));
    if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw new Error('ACCOUNT_DATA_REVIEW_REQUIRED');
    }
    return value;
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
async function usersAndActor(actorId: string) {
  const users = await readArray(path.join(accountDataRoot(), 'users.json'), false) as unknown as FarmProUser[];
  const actor = users.find((item) => item.id === actorId);
  if (!actor?.active || typeof actor.email !== 'string' || !operatorEmail(actor.email) ||
      (await readAccountRetirements()).some((item) => item.userId === actorId || item.farmId === actor.farmId)) {
    throw new Error('OPERATOR_REQUIRED');
  }
  return users;
}
async function assertSafeFarmDirectory(farmId: string) {
  if (!validAccountIdentifier(farmId) || farmId === 'farm-demo') throw new Error('ACCOUNT_DATA_REVIEW_REQUIRED');
  const farms = path.join(accountDataRoot(), 'farms');
  const target = path.join(farms, farmId);
  for (const directory of [farms, target]) {
    try {
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('ACCOUNT_DATA_REVIEW_REQUIRED');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return target;
}
async function hasPaymentHistory(user: FarmProUser) {
  const root = accountDataRoot();
  for (const file of ['bank-transfer-applications.json', 'stripeSubscriptions.json']) {
    for (const directory of [root, path.join(root, 'farms', 'farm-demo')]) {
      const rows = await readArray(path.join(directory, file));
      // An unassigned billing row is not evidence that this account is unpaid.
      if (rows.some((row) => typeof row.userId !== 'string' || !row.userId)) throw new Error('ACCOUNT_DATA_REVIEW_REQUIRED');
      if (rows.some((row) => row.userId === user.id || row.farmId === user.farmId ||
          (typeof row.email === 'string' && row.email.trim().toLowerCase() === user.email.toLowerCase()))) return true;
    }
  }
  return false;
}
async function hasLegacySnapshot(user: FarmProUser) {
  const root = accountDataRoot();
  for (const directory of [root, path.join(root, 'farms', 'farm-demo')]) {
    for (const name of [`cloudSnapshot-${user.farmId}.json`, 'cloudSnapshot.json']) {
      try {
        const value = JSON.parse(await fs.readFile(path.join(directory, name), 'utf-8'));
        if (value && (name !== 'cloudSnapshot.json' || value.snapshot?.farm?.id === user.farmId)) return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('ACCOUNT_DATA_REVIEW_REQUIRED');
      }
    }
  }
  return false;
}
async function previewFor(userId: string, actorId: string, users: FarmProUser[]): Promise<AccountDeletionPreview> {
  const user = users.find((item) => item.id === userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  if (!validAccountIdentifier(user.id) || !validAccountIdentifier(user.farmId) ||
      typeof user.email !== 'string' || !user.email.includes('@') || typeof user.farmName !== 'string' ||
      typeof user.name !== 'string' || typeof user.active !== 'boolean') throw new Error('ACCOUNT_DATA_REVIEW_REQUIRED');
  const retirement = (await readAccountRetirements()).find((item) => item.userId === userId);
  let reason = '';
  if (userId === actorId || operatorEmail(user.email)) {
    reason = '運営者のアカウントは、この操作では削除できません。';
  } else if (user.farmId === 'farm-demo' || user.role !== 'owner' || users.some((item) => item.id !== userId && item.farmId === user.farmId)) {
    reason = '共有農場・旧共通農場は、この操作では削除できません。他の利用者とデータの関係を確認してください。';
  } else if (user.plan !== undefined && user.plan !== 'free') {
    reason = '有料プランの利用者は、この操作では削除できません。先に契約・請求と退会方法の確認が必要です。';
  } else if (await hasPaymentHistory(user)) {
    reason = '契約・申込・決済の記録があります。Free表示でも自動削除はしません。契約・請求の確認が必要です。';
  } else if (await hasLegacySnapshot(user)) {
    reason = '旧形式の保存領域にデータがあります。削除範囲を確認する必要があります。';
  } else {
    await assertSafeFarmDirectory(user.farmId);
    if (retirement && retirement.accountDigest !== digest(user)) throw new Error('ACCOUNT_DATA_REVIEW_REQUIRED');
  }
  return {
    user: { id: user.id, farmId: user.farmId, farmName: user.farmName, name: user.name, email: user.email,
      plan: user.plan || 'free', active: retirement ? false : user.active },
    canDelete: !reason, reason, revision: digest(user), resuming: Boolean(retirement),
  };
}

export function getOperatorDeletionPreview(userId: string, actorId: string) {
  return withAccountDataLock(async () => previewFor(userId, actorId, await usersAndActor(actorId)));
}

async function removePendingVerifications(user: FarmProUser) {
  const root = accountDataRoot();
  const directories = [root, path.join(root, 'farms', 'farm-demo')];
  for (const directory of directories) {
    for (const file of ['pendingRegistrations.json', 'pendingPasswordResets.json', 'pendingEmailChanges.json']) {
      const target = path.join(directory, file);
      const rows = await readArray(target);
      const filtered = rows.filter((row) => row.userId !== user.id && row.farmId !== user.farmId &&
        !(typeof row.email === 'string' && row.email.trim().toLowerCase() === user.email.toLowerCase()));
      if (filtered.length !== rows.length) await atomicAccountJsonWrite(target, filtered);
    }
  }
}

export function deleteOperatorFreeAccount(userId: string, actorId: string, confirmation: AccountDeletionConfirmation) {
  return withAccountDataLock(async () => {
    if (!validAccountIdentifier(userId) || !validAccountIdentifier(confirmation.farmId) ||
        confirmation.confirmed !== true || typeof confirmation.email !== 'string' ||
        typeof confirmation.revision !== 'string' || !/^[a-f0-9]{64}$/.test(confirmation.revision)) {
      throw new Error('ACCOUNT_CONFIRMATION_REQUIRED');
    }
    const users = await usersAndActor(actorId);
    const user = users.find((item) => item.id === userId);
    if (!user) {
      const retired = (await readAccountRetirements()).find((item) => item.userId === userId);
      if (!retired || retired.farmId !== confirmation.farmId || retired.accountDigest !== confirmation.revision ||
          retired.emailDigest !== accountEmailDigest(confirmation.email)) throw new Error('USER_NOT_FOUND');
      // A lost response can be retried, but only after checking the farm is absent.
      const farmDirectory = await assertSafeFarmDirectory(retired.farmId);
      try { await fs.lstat(farmDirectory); throw new Error('ACCOUNT_DATA_REVIEW_REQUIRED'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      return { deleted: true, userId, farmId: retired.farmId, alreadyDeleted: true };
    }
    const preview = await previewFor(userId, actorId, users);
    if (!preview.canDelete) throw new Error('ACCOUNT_DELETE_BLOCKED');
    if (confirmation.farmId !== user.farmId || confirmation.email.trim().toLowerCase() !== user.email.toLowerCase() ||
        confirmation.revision !== preview.revision) throw new Error('ACCOUNT_CHANGED');
    const farmDirectory = await assertSafeFarmDirectory(user.farmId);
    // Persist the access/write barrier before erasure. A crash is retriable and
    // never reports success or revives the account from an old cached token.
    await markAccountRetired({ userId, farmId: user.farmId, actorId, retiredAt: new Date().toISOString(),
      accountDigest: preview.revision, emailDigest: accountEmailDigest(user.email) });
    await removePendingVerifications(user);
    await fs.rm(farmDirectory, { recursive: true, force: true });
    await atomicAccountJsonWrite(path.join(accountDataRoot(), 'users.json'), users.filter((item) => item.id !== userId));
    return { deleted: true, userId, farmId: user.farmId, alreadyDeleted: false };
  });
}
