import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { getStoredAuthUser } from './authClient';
import type { SupplyMovement } from './supplyInventoryApi';

export const SUPPLY_SYNC_STATE_ID = 'supply-inventory-sync-v1';

export type SupplyInventoryChange = {
  operationId: string;
  before: SupplyMovement | null;
  after: SupplyMovement | null;
};

export type SupplyInventorySyncState = {
  id: string;
  version: 1;
  farmId: string;
  ownerId: string;
  epoch: string;
  revision: number | null;
  baseline: SupplyMovement[];
  pending: SupplyInventoryChange[];
};

type Identity = { farmId: string; ownerId: string };

/** A browser's outbox must never become another browser's work after restore. */
export function getSupplySyncIdentity(): Identity | null {
  if (!getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync) return null;
  const farmId = getStoredAuthUser()?.farmId?.trim();
  if (!farmId) return null;
  const key = `farmpro.supplySyncOwner.${encodeURIComponent(farmId)}`;
  let ownerId = window.localStorage.getItem(key);
  if (!ownerId) {
    ownerId = crypto.randomUUID();
    window.localStorage.setItem(key, ownerId);
    if (window.localStorage.getItem(key) !== ownerId) {
      throw new Error('この端末の在庫同期情報を保存できませんでした。');
    }
  }
  return { farmId, ownerId };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)]));
}

function content(row: SupplyMovement | null | undefined): string {
  return JSON.stringify(stable(row ?? null));
}

export function sameSupplyRecord(a: SupplyMovement | null | undefined, b: SupplyMovement | null | undefined): boolean {
  return content(a) === content(b);
}

export function sameSupplyRows(a: readonly SupplyMovement[], b: readonly SupplyMovement[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map(content).sort();
  const right = b.map(content).sort();
  return left.every((row, index) => row === right[index]);
}

function changeId(change: SupplyInventoryChange): string {
  if (!change || typeof change !== 'object') {
    throw new Error('在庫変更の内容を確認できないため同期を保留しました。');
  }
  const id = change.before?.id ?? change.after?.id;
  if (typeof id !== 'string' || !id || (change.before && change.after && change.before.id !== change.after.id)) {
    throw new Error('在庫変更の記録IDが一致しないため同期を保留しました。');
  }
  return id;
}

export function applySupplyChanges(rows: SupplyMovement[], changes: SupplyInventoryChange[]): SupplyMovement[] {
  const result = new Map(rows.map(row => [row.id, row]));
  for (const change of changes) {
    const id = changeId(change);
    if (change.after) result.set(id, change.after);
    else result.delete(id);
  }
  return [...result.values()];
}

const stringFields: Array<keyof SupplyMovement> = [
  'id', 'date', 'itemName', 'lotNumber', 'unit', 'expiryDate', 'supplier',
  'storageLocation', 'donorCow', 'sire', 'grade', 'cowEarTag', 'paymentMethod',
  'note', 'createdAt', 'updatedAt',
];

function validateRecord(row: SupplyMovement): void {
  if (!row || typeof row !== 'object' ||
      stringFields.some(key => typeof row[key] !== 'string') ||
      ['id', 'date', 'itemName', 'lotNumber', 'unit', 'createdAt', 'updatedAt']
        .some(key => !(row[key as keyof SupplyMovement] as string).trim()) ||
      !['医薬品', '受精卵'].includes(row.kind) ||
      !['購入', '使用', '廃棄', '棚卸増', '棚卸減'].includes(row.action) ||
      typeof row.expenseRecorded !== 'boolean' ||
      (row.purchaseReference !== undefined && typeof row.purchaseReference !== 'string') ||
      !Number.isFinite(row.quantity) || row.quantity <= 0 ||
      !Number.isFinite(row.unitPrice) || row.unitPrice < 0 ||
      !Number.isFinite(row.amount) || row.amount < 0) {
    throw new Error('在庫記録の形式または数量が正しくないため同期を保留しました。');
  }
  if (row.kind === '受精卵' && (!Number.isInteger(row.quantity) || row.unit !== '個')) {
    throw new Error('受精卵の数量は「個」単位の整数で確認してください。同期は保留しています。');
  }
}

/** Check the complete proposed ledger, including concurrent use of one lot. */
export function validateSupplyRows(rows: SupplyMovement[]): void {
  const ids = new Set<string>();
  const purchases = new Set<string>();
  const balances = new Map<string, number>();
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  for (const row of rows) {
    validateRecord(row);
    if (ids.has(row.id)) throw new Error('在庫記録のIDが重複しているため同期を保留しました。');
    ids.add(row.id);
    // Match the grouping used by the existing inventory screen.
    const batch = [row.kind, normalize(row.itemName), normalize(row.lotNumber), row.unit, normalize(row.storageLocation)].join('|');
    const incoming = row.action === '購入' || row.action === '棚卸増';
    balances.set(batch, (balances.get(batch) ?? 0) + (incoming ? row.quantity : -row.quantity));
    const reference = normalize(row.purchaseReference ?? '');
    if (row.action === '購入' && reference) {
      const key = JSON.stringify([row.kind, row.date, normalize(row.supplier), reference]);
      if (purchases.has(key)) throw new Error('同じ購入伝票・明細番号が重複するため同期を保留しました。');
      purchases.add(key);
    }
  }
  if ([...balances.values()].some(balance => !Number.isFinite(balance) || balance < -1e-8)) {
    throw new Error('別端末の変更と合わせると在庫がマイナスになるため同期を保留しました。');
  }
}

/** Rebase only recorded local changes, never infer the direction of unknown differences. */
export function mergeSupplyChanges(state: SupplyInventorySyncState, local: SupplyMovement[], remote: SupplyMovement[]): SupplyMovement[] {
  if (state.version !== 1 || !Array.isArray(state.baseline) || !Array.isArray(state.pending) ||
      (state.revision !== null && (!Number.isSafeInteger(state.revision) || state.revision < 1))) {
    throw new Error('在庫同期の保存世代を確認できないため同期を保留しました。');
  }
  validateSupplyRows(state.baseline);
  validateSupplyRows(local);
  validateSupplyRows(remote);
  const expected = new Map(state.baseline.map(row => [row.id, row]));
  const chains = new Map<string, SupplyInventoryChange[]>();
  const operationIds = new Set<string>();
  let knownInitialBoundary = sameSupplyRows(state.baseline, remote);
  for (const change of state.pending) {
    const id = changeId(change);
    if (typeof change.operationId !== 'string' || !change.operationId.trim() || operationIds.has(change.operationId)) {
      throw new Error('在庫変更の順序を確認できないため同期を保留しました。');
    }
    operationIds.add(change.operationId);
    if (change.before) validateRecord(change.before);
    if (change.after) validateRecord(change.after);
    if (!sameSupplyRecord(expected.get(id), change.before)) {
      throw new Error('在庫変更の前後が連続していないため同期を保留しました。');
    }
    const chain = chains.get(id) ?? [];
    chain.push(change);
    chains.set(id, chain);
    if (change.after) expected.set(id, change.after);
    else expected.delete(id);
    if (state.revision === null && sameSupplyRows([...expected.values()], remote)) knownInitialBoundary = true;
  }
  if (!sameSupplyRows([...expected.values()], local)) {
    throw new Error('送信待ちに含まれない端末の在庫変更があるため同期を保留しました。');
  }
  if (state.revision === null && !knownInitialBoundary) {
    throw new Error('初回の在庫がクラウドと一致しないため同期を保留しました。端末の記録は保持しています。');
  }
  const candidate = new Map(remote.map(row => [row.id, row]));
  for (const [id, chain] of chains) {
    const current = candidate.get(id);
    if (!sameSupplyRecord(current, chain[0].before) && !chain.some(change => sameSupplyRecord(current, change.after))) {
      throw new Error('同じ在庫記録が別の端末でも変更されています。同期を保留し、端末の記録を保持しました。');
    }
    const after = chain[chain.length - 1].after;
    if (after) candidate.set(id, after);
    else candidate.delete(id);
  }
  const result = [...candidate.values()];
  validateSupplyRows(result);
  return result;
}

type StagedChanges = { identity: Identity; baseline: SupplyMovement[]; changes: SupplyInventoryChange[]; state?: SupplyInventorySyncState };
const staged = new WeakMap<IDBTransaction, StagedChanges>();

/** Enqueue inside the caller's inventory transaction: both writes commit or neither does. */
export function recordSupplyInventoryChange(
  tx: IDBTransaction,
  rowsBefore: SupplyMovement[],
  before: SupplyMovement | null,
  after: SupplyMovement | null,
): void {
  if (sameSupplyRecord(before, after)) return;
  const identity = getSupplySyncIdentity();
  if (!identity) return;
  const metadata = tx.objectStore('metadata');
  const change: SupplyInventoryChange = {
    operationId: crypto.randomUUID(), before: before ? structuredClone(before) : null,
    after: after ? structuredClone(after) : null,
  };
  const existingStage = staged.get(tx);
  const write = (state: SupplyInventorySyncState) => {
    try { metadata.put(state); }
    catch { tx.abort(); }
  };
  if (existingStage) {
    if (existingStage.identity.farmId !== identity.farmId || existingStage.identity.ownerId !== identity.ownerId) {
      tx.abort();
      return;
    }
    existingStage.changes.push(change);
    if (existingStage.state) {
      existingStage.state.pending.push(change);
      write(existingStage.state);
    }
    return;
  }
  const stage: StagedChanges = { identity, baseline: structuredClone(rowsBefore), changes: [change] };
  staged.set(tx, stage);
  const request = metadata.get(SUPPLY_SYNC_STATE_ID);
  request.onsuccess = () => {
    const previous = request.result as SupplyInventorySyncState | undefined;
    // Foreign copied metadata is not replayed. A fresh null revision requires
    // exact initial reconciliation before any of these local changes can leave.
    const owned = previous?.version === 1 && previous.farmId === identity.farmId &&
      previous.ownerId === identity.ownerId && Array.isArray(previous.baseline) && Array.isArray(previous.pending);
    stage.state = owned ? { ...previous, pending: [...previous.pending, ...stage.changes] } : {
      id: SUPPLY_SYNC_STATE_ID, version: 1, ...identity, epoch: crypto.randomUUID(),
      revision: null, baseline: stage.baseline, pending: [...stage.changes],
    };
    write(stage.state);
  };
}
