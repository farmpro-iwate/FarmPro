import type { FarmProBackup } from '../storage/backup';
import type { StoreName, StoredRecord } from '../storage/types';

type BlockedRecord = { storeName: StoreName; id: string; reason: string };
function sameBusinessContent(left: StoredRecord, right: StoredRecord): boolean {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'cloudUpdatedAt' && key !== 'cloudSyncPending')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, normalize(item)]));
  };
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

/**
 * Build a non-destructive cloud-side staging draft. It is intentionally
 * not wired to cloud uploads or IndexedDB restore: conflicts need a separately
 * reviewed resolution. Never silently replace a cloud record.
 */
export function stageNonDestructiveCloudMerge(
  local: FarmProBackup,
  remote: FarmProBackup,
): {
  draft: FarmProBackup | null;
  staged: number;
  blocked: BlockedRecord[];
  canUploadAutomatically: false;
} {
  const blocked: BlockedRecord[] = [];
  if (!local.farm?.id || local.farm.id !== remote.farm?.id ||
      local.schemaVersion !== 4 || ![3, 4].includes(remote.schemaVersion)) {
    return { draft: null, staged: 0,
      blocked: [{storeName:'settings', id:'farm', reason:'農場IDまたは形式が不正です'}],
      canUploadAutomatically:false };
  }
  const stores = {} as FarmProBackup['stores'];
  let staged = 0;
  for (const storeName of Object.keys(local.stores) as StoreName[]) {
    const cloudRows = remote.stores[storeName] ?? [];
    // Metadata is strictly device-local, never copied from either snapshot
    // into a cloud synchronization draft.
    if (storeName === 'metadata') {
      stores[storeName] = [...cloudRows];
      continue;
    }
    const rows = [...cloudRows];
    const cloudIds = new Map(cloudRows.map(record => [String(record.id), record]));
    const masterIdentities = new Set(cloudRows.map(record => String(record.syncId ?? '').trim()).filter(Boolean));
    for (const record of local.stores[storeName] ?? []) {
      const id = String(record.id);
      const existing = cloudIds.get(id);
      if (existing) {
        // An existing primary key can refer to a different cow or record on
        // another device. Report rather than silently treating it as synced.
        if (!sameBusinessContent(record, existing)) {
          blocked.push({storeName, id, reason:'同じ内部IDの内容が異なります。上書き禁止'});
        }
        continue;
      }
      // Financial, inventory, cattle and relational records can overlap
      // by business identity even when primary keys differ.
      if (storeName === 'supplyInventory') {
        // Supply ledger records have no cow primary-key reference. Limit
        // staging to stable UUIDs with no cross-record references. Both
        // snapshots are still retained; there is no upload here.
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
        const hasReference = ['cowId', 'calfId', 'calvingId', 'breedingId', 'sourceId']
          .some(key => String(record[key] ?? '').trim());
        const hasMinimumFields = typeof record.kind === 'string' &&
          typeof record.action === 'string' && typeof record.itemName === 'string' &&
          typeof record.date === 'string' && typeof record.quantity === 'number';
        if (!isUuid || hasReference || !hasMinimumFields) {
          blocked.push({storeName, id, reason:'在庫ID・必須項目・参照先を確認できません'});
          continue;
        }
        rows.push(record);
        staged++;
        continue;
      }
      if (storeName !== 'masters') {
        blocked.push({storeName, id, reason:'関連記録・業務上の重複の確認が必要'});
        continue;
      }
      const naturalId = String(record.syncId ?? '').trim();
      if (!naturalId || masterIdentities.has(naturalId)) {
        blocked.push({storeName, id, reason:'マスター識別子の未設定または重複'});
        continue;
      }
      rows.push(record);
      masterIdentities.add(naturalId);
      staged++;
    }
    stores[storeName] = rows;
  }
  const draft: FarmProBackup = {
    ...remote, schemaVersion: local.schemaVersion,
    // Preserve remote versions of every existing record.
    stores,
  };
  return {draft, staged, blocked, canUploadAutomatically:false};
}
