import type { FarmProBackup } from '../storage/backup';
import type { StoreName, StoredRecord } from '../storage/types';

/** A read-only merge proposal. No record is written or automatically accepted. */
export type SyncMergeProposal = {
  additionsToCloud: number;
  additionsToDevice: number;
  unresolved: Array<{ storeName: StoreName; id: string; reason: string }>;
  canApplyAutomatically: false;
};

const protectedStores = new Set<StoreName>([
  'cattle', 'calves', 'breedings', 'calvings', 'treatments',
  'vaccines', 'blvTests', 'sales', 'expenses', 'masters',
  'fatteningTransitions', 'schedules', 'feedings', 'supplyInventory',
  'feedInventory', 'photos', 'settings', 'feedingGuide',
  'feedingAlertActions',
]);

function stable(value: unknown): string {
  function normalize(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(normalize);
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(Object.entries(item as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, normalize(nested)]));
  }
  // Transport bookkeeping does not change a farmer's actual record.
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { cloudUpdatedAt: _cloudUpdatedAt, cloudSyncPending: _cloudSyncPending, ...businessRecord } = value as Record<string, unknown>;
    return JSON.stringify(normalize(businessRecord));
  }
  return JSON.stringify(normalize(value));
}

export function proposeLosslessSyncMerge(device: FarmProBackup, cloud: FarmProBackup): SyncMergeProposal {
  const unresolved: SyncMergeProposal['unresolved'] = [];
  let additionsToCloud = 0;
  let additionsToDevice = 0;
  const deviceFarm = device.farm?.id?.trim();
  const cloudFarm = cloud.farm?.id?.trim();
  if (deviceFarm && cloudFarm && deviceFarm !== cloudFarm) {
    unresolved.push({ storeName: 'settings', id: 'farm', reason: '農場IDが一致しません' });
  }
  for (const storeName of Object.keys(device.stores) as StoreName[]) {
    if (storeName === 'metadata') continue;
    const local = new Map((device.stores[storeName] ?? []).map((record: StoredRecord) => [String(record.id), record]));
    const remote = new Map((cloud.stores[storeName] ?? []).map((record: StoredRecord) => [String(record.id), record]));
    for (const [id, record] of local) {
      const other = remote.get(id);
      if (!other) {
        additionsToCloud++;
        if (protectedStores.has(storeName)) unresolved.push({ storeName, id, reason: 'クラウドに未登録。IDの衝突・参照関係の確認が必要' });
      } else if (stable(record) !== stable(other)) {
        unresolved.push({ storeName, id, reason: '同一IDの内容が異なります' });
      }
    }
    for (const id of remote.keys()) {
      if (!local.has(id)) {
        additionsToDevice++;
        if (protectedStores.has(storeName)) unresolved.push({ storeName, id, reason: 'この端末に未登録。IDの衝突・参照関係の確認が必要' });
      }
    }
  }
  return { additionsToCloud, additionsToDevice, unresolved, canApplyAutomatically: false };
}

/**
 * Construct a lossless candidate without writing IndexedDB or cloud state.
 * Protected farm records always require review for one-sided additions.
 * No conflicting row is ever silently selected.
 */
export function buildSafeSyncMergeCandidate(device: FarmProBackup, cloud: FarmProBackup): FarmProBackup | null {
  const proposal = proposeLosslessSyncMerge(device, cloud);
  if (proposal.unresolved.length > 0) return null;
  if (device.schemaVersion !== cloud.schemaVersion) return null;
  if (!device.farm?.id || device.farm.id !== cloud.farm?.id) return null;

  const stores = {} as FarmProBackup['stores'];
  for (const name of Object.keys(device.stores) as StoreName[]) {
    const records = device.stores[name] ?? [];
    if (name === 'metadata') {
      // Keep device-local metadata local; it must never be promoted to the farm cloud.
      stores[name] = [...records];
      continue;
    }
    const combined = [...records];
    const ids = new Set(records.map(row => String(row.id)));
    for (const row of cloud.stores[name] ?? []) {
      if (!ids.has(String(row.id))) {
        combined.push(row);
        ids.add(String(row.id));
      }
    }
    stores[name] = combined;
  }
  return { ...device, stores };
}
