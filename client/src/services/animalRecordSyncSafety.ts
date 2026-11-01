import { getAuthToken, getStoredAuthUser } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { openFarmProDatabase } from '../storage/db';
import type { StoredRecord } from '../storage/types';

export type AnimalSyncStore = 'cattle' | 'calves';
export type AnimalSyncContext = {
  farmId: string | null;
  userId: string | null;
  token: string | null;
  cloudEnabled: boolean;
  planId: string;
};
export type AnimalSyncOrigin = {
  version: 1;
  farmId: string;
  userId: string;
  ownerId: string;
};

export const ANIMAL_SYNC_STATUS_EVENT = 'farmpro:animal-sync-status';

export function getAnimalSyncContext(): AnimalSyncContext {
  const user = getStoredAuthUser();
  const planId = getCurrentFarmProPlanId();
  return {
    farmId: user?.farmId ?? null,
    userId: user?.id ?? null,
    token: getAuthToken(),
    cloudEnabled: getFarmProPlan(planId).multiDeviceSync,
    planId,
  };
}

export class AnimalSyncContextChangedError extends Error {
  constructor() {
    super('ログインまたは農場の情報が変わったため、牛・子牛の同期を中止しました。画面を開き直してください。');
    this.name = 'AnimalSyncContextChangedError';
  }
}

export function assertAnimalSyncContext(expected: AnimalSyncContext): void {
  const current = getAnimalSyncContext();
  if (current.farmId !== expected.farmId || current.userId !== expected.userId ||
      current.token !== expected.token || current.cloudEnabled !== expected.cloudEnabled ||
      current.planId !== expected.planId) throw new AnimalSyncContextChangedError();
}

const pending = new Map<string, Promise<void>>();

/** Serialize this farm's local save, upload, import and deletion; do not nest. */
export async function withAnimalSync<T>(
  store: AnimalSyncStore,
  action: (context: AnimalSyncContext) => Promise<T>,
): Promise<T> {
  const context = getAnimalSyncContext();
  const key = `farmpro:animal-record-sync:${store}:${encodeURIComponent(context.farmId || 'anonymous')}`;
  const run = () => { assertAnimalSyncContext(context); return action(context); };
  if (navigator.locks?.request) return navigator.locks.request(key, run);
  const previous = pending.get(key) ?? Promise.resolve();
  const work = previous.then(run);
  const settled = work.then(() => undefined, () => undefined);
  pending.set(key, settled);
  try { return await work; }
  finally { if (pending.get(key) === settled) pending.delete(key); }
}

export async function withAnimalSyncRequest<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('牛・子牛のクラウド通信が時間切れになりました。端末の記録を保持しています。'));
    }, 12000);
  });
  try { return await Promise.race([Promise.resolve().then(() => work(controller.signal)), timeout]); }
  finally { clearTimeout(timer!); }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
}

/** Includes transport metadata: an ACK must not erase a newer pending operation. */
export function sameAnimalSyncRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

/** A restore or another local writer can bypass the lock. Compare and mutate atomically. */
export async function changeMatchingAnimal<T extends StoredRecord>(
  storeName: AnimalSyncStore,
  context: AnimalSyncContext,
  id: string | number,
  expected: T | undefined,
  next: T | undefined,
): Promise<boolean> {
  assertAnimalSyncContext(context);
  const database = await openFarmProDatabase();
  assertAnimalSyncContext(context);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    let changed = false;
    let failure: unknown;
    transaction.oncomplete = () => {
      try { assertAnimalSyncContext(context); resolve(changed); }
      catch (error) { reject(error); }
    };
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('牛・子牛の記録更新を中止しました。'));
    transaction.onerror = () => { failure ??= transaction.error; };
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        assertAnimalSyncContext(context);
        if (!sameAnimalSyncRecord(request.result, expected)) return;
        if (next) {
          if (next.id !== id) throw new Error('更新対象の牛・子牛が一致しません。');
          store.put(next);
        } else store.delete(id);
        changed = true;
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
  });
}

function animalSyncOwner(farmId: string, create = false): string | null {
  try {
    const key = `farmpro.animalSyncOwner.${encodeURIComponent(farmId)}`;
    let owner = window.localStorage.getItem(key);
    if (!owner && create) {
      owner = crypto.randomUUID();
      window.localStorage.setItem(key, owner);
    }
    return owner || null;
  } catch { return null; }
}

export function newAnimalSyncOrigin(context: AnimalSyncContext): AnimalSyncOrigin | undefined {
  assertAnimalSyncContext(context);
  if (!context.cloudEnabled || !context.token || !context.farmId || !context.userId) return;
  const ownerId = animalSyncOwner(context.farmId, true);
  return ownerId ? { version: 1, farmId: context.farmId, userId: context.userId, ownerId } : undefined;
}

export function isOwnedAnimalSyncPending(
  record: { cloudSyncPending?: boolean; animalSyncOrigin?: AnimalSyncOrigin; deletedAt?: string },
  context: AnimalSyncContext,
): boolean {
  const origin = record.animalSyncOrigin;
  return record.cloudSyncPending === true && !record.deletedAt && context.cloudEnabled &&
    !!context.token && !!context.farmId && !!context.userId && origin?.version === 1 &&
    origin.farmId === context.farmId && origin.userId === context.userId &&
    origin.ownerId === animalSyncOwner(context.farmId);
}

/** Automatic retries belong to normal cattle/calves use, never recovery or settlement. */
export function canRetryAnimalSyncOnPage(pathname: string): boolean {
  return pathname === '/' || /^\/(?:cattle|calves)(?:\/|$)/.test(pathname);
}
