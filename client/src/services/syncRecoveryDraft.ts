import type { FarmProBackup } from '../storage/backup';
import type { StoreName, StoredRecord } from '../storage/types';

export type RecoveryClassification = 'same' | 'changed' | 'id-collision' | 'same-identity-different-id' | 'cloud-only';
const keys = (store: StoreName, row: StoredRecord): string[] => {
  const value = (name: string) => String(row[name] ?? '').trim();
  const results: string[] = [];
  if (store === 'cattle' || store === 'calves') {
    if (value('identificationNumber')) results.push('idn:' + value('identificationNumber'));
    if (store === 'calves' && value('calvingId')) results.push('calving:' + value('calvingId'));
  }
  if (store === 'masters' && value('syncId')) results.push('syncId:' + value('syncId'));
  return results;
};
const comparable = (row: StoredRecord): string => {
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) :
    value && typeof value === 'object' ? Object.fromEntries(
      Object.entries(value).filter(([k]) => k !== 'cloudUpdatedAt' && k !== 'cloudSyncPending')
        .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, normalize(v)])) : value;
  return JSON.stringify(normalize(row));
};

/** Read-only reconciliation draft. Never apply this to IndexedDB or a cloud snapshot. */
export function buildSyncRecoveryDraft(device: FarmProBackup, cloud: FarmProBackup) {
  if (!device.farm?.id || device.farm.id !== cloud.farm?.id) throw new Error('農場IDが一致しません');
  const rows: Array<{store: StoreName; cloudId: string; localId: string | null; status: RecoveryClassification}> = [];
  const reviewAdditions: Partial<Record<StoreName, StoredRecord[]>> = {};
  for (const store of Object.keys(cloud.stores) as StoreName[]) {
    if (store === 'metadata') continue;
    const local = device.stores[store] ?? [];
    const localById = new Map(local.map(row => [String(row.id), row]));
    const localByNaturalKey = new Map<string, StoredRecord[]>();
    for (const row of local) for (const key of keys(store, row)) {
      localByNaturalKey.set(key, [...(localByNaturalKey.get(key) ?? []), row]);
    }
    for (const row of cloud.stores[store] ?? []) {
      const cloudId = String(row.id);
      const sameId = localById.get(cloudId);
      const matching = [...new Set(keys(store, row).flatMap(k => localByNaturalKey.get(k) ?? []))];
      let status: RecoveryClassification;
      let localId: string | null = null;
      if (sameId && matching.some(r => String(r.id) !== cloudId)) {
        status = 'id-collision';
        localId = cloudId;
      } else if (sameId) {
        status = comparable(sameId) === comparable(row) ? 'same' : 'changed';
        localId = cloudId;
      } else if (matching.length) {
        status = 'same-identity-different-id';
        localId = matching.length === 1 ? String(matching[0].id) : null;
      } else {
        status = 'cloud-only';
        (reviewAdditions[store] ??= []).push(row);
      }
      rows.push({store, cloudId, localId, status});
    }
  }
  return {format: 'farmpro-recovery-review-draft' as const, farmId: device.farm.id,
    deviceSchema: device.schemaVersion, cloudSchema: cloud.schemaVersion, rows,
    reviewAdditions, canApplyAutomatically: false as const};
}
