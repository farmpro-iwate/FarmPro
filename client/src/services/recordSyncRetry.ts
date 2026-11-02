export type RecordSyncRetrySource = 'treatments' | 'breedings' | 'blvTests' | 'feedingAlertActions' | 'fatteningTransitions';
export type RecordSyncRetryContext = {
  farmId: string | null;
  userId: string | null;
  token: string | null;
  cloudEnabled: boolean;
  planId: string;
};
export type RecordSyncRetryOrigin = {
  version: 1;
  farmId: string;
  userId: string;
  ownerId: string;
};

/** Compare farm content without browser-only retry ownership or bookkeeping. */
export function withoutRecordSyncRetryMetadata(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) =>
    !key.startsWith('treatmentSync') && !key.startsWith('breedingSync') && !key.startsWith('blvSync') &&
    !key.startsWith('feedingAlertActionSync') && !key.startsWith('fatteningTransitionSync')));
}

const ownerKeys: Record<RecordSyncRetrySource, string> = {
  treatments: 'farmpro.treatmentSyncOwner',
  breedings: 'farmpro.breedingSyncOwner',
  blvTests: 'farmpro.blvSyncOwner',
  feedingAlertActions: 'farmpro.feedingAlertActionSyncOwner',
  fatteningTransitions: 'farmpro.fatteningTransitionSyncOwner',
};

function retryOwner(source: RecordSyncRetrySource, farmId: string, create = false): string | null {
  try {
    const key = `${ownerKeys[source]}.${encodeURIComponent(farmId)}`;
    let owner = window.localStorage.getItem(key);
    if (!owner && create) {
      owner = crypto.randomUUID();
      window.localStorage.setItem(key, owner);
    }
    return owner || null;
  } catch { return null; }
}

/** Called only by a formal local save while its existing context guard holds.
 * Missing ownership never grants permission to upload an old or restored row. */
export function createRecordSyncRetryOrigin(
  source: RecordSyncRetrySource, context: RecordSyncRetryContext,
): RecordSyncRetryOrigin | undefined {
  if (!context.cloudEnabled || !context.token || !context.farmId || !context.userId) return;
  const ownerId = retryOwner(source, context.farmId, true);
  return ownerId ? { version: 1, farmId: context.farmId, userId: context.userId, ownerId } : undefined;
}

/** Bind the existing browser identity before an asynchronous read, without
 * creating an owner or adopting records that have no formal-save origin. */
export function getRecordSyncRetryOrigin(
  source: RecordSyncRetrySource, context: RecordSyncRetryContext,
): RecordSyncRetryOrigin | undefined {
  if (!context.cloudEnabled || !context.token || !context.farmId || !context.userId) return;
  const ownerId = retryOwner(source, context.farmId);
  return ownerId ? { version: 1, farmId: context.farmId, userId: context.userId, ownerId } : undefined;
}

export function isOwnedRecordSyncRetryOrigin(
  source: RecordSyncRetrySource, value: unknown, context: RecordSyncRetryContext,
): value is RecordSyncRetryOrigin {
  if (!context.cloudEnabled || !context.token || !context.farmId || !context.userId ||
      !value || typeof value !== 'object' || Array.isArray(value)) return false;
  const origin = value as Partial<RecordSyncRetryOrigin>;
  return origin.version === 1 && origin.farmId === context.farmId && origin.userId === context.userId &&
    typeof origin.ownerId === 'string' && Boolean(origin.ownerId) &&
    origin.ownerId === retryOwner(source, context.farmId);
}

/** Resume from home or the relevant list; editors, restores and settlements
 * retain control of their own formal operations. There is no timer retry. */
export function canRetryRecordSyncOnPage(source: RecordSyncRetrySource, pathname: string): boolean {
  const listPath = {
    treatments: '/treatments', breedings: '/breedings', blvTests: '/blv',
    feedingAlertActions: '/feeding-alert-actions', fatteningTransitions: '/fattening-transitions',
  }[source];
  return pathname === '/' || pathname === listPath || pathname === `${listPath}/`;
}

export class RecordSyncRetryPausedError extends Error {
  constructor() {
    super('画面または通信状態が変わったため、未送信記録の再送を保留しました。');
    this.name = 'RecordSyncRetryPausedError';
  }
}

export function assertRecordSyncRetryPage(source: RecordSyncRetrySource): void {
  if (!canRetryRecordSyncOnPage(source, window.location.pathname) ||
      navigator.onLine === false || document.visibilityState === 'hidden') {
    throw new RecordSyncRetryPausedError();
  }
}
