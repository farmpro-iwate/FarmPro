import type { FarmProBackup } from '../storage/backup';
import type { StoreName, StoredRecord } from '../storage/types';

/** Read-only preflight: never choose a winner or write any farm data. */
export type MergeReadiness = {
  safeToAutoMerge: false;
  missingFromCloud: number;
  missingFromDevice: number;
  sameIdDifferentContent: number;
  identityRiskStores: StoreName[];
  farmMismatch: boolean;
};

const identityStores = new Set<StoreName>(['cattle', 'calves', 'breedings', 'calvings', 'treatments', 'sales', 'expenses', 'masters']);

function canonical(value: unknown): string {
  const order = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(order);
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(Object.entries(item as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, order(nested)]));
  };
  return JSON.stringify(order(value));
}

export function inspectSyncMergeReadiness(local: FarmProBackup, cloud: FarmProBackup): MergeReadiness {
  const localFarm = local.farm?.id?.trim();
  const cloudFarm = cloud.farm?.id?.trim();
  const farmMismatch = Boolean(localFarm && cloudFarm && localFarm !== cloudFarm &&
    localFarm !== 'local-farm' && cloudFarm !== 'local-farm');
  let missingFromCloud = 0;
  let missingFromDevice = 0;
  let sameIdDifferentContent = 0;
  const risk = new Set<StoreName>();
  for (const name of Object.keys(local.stores) as StoreName[]) {
    if (name === 'metadata') continue;
    const device = new Map((local.stores[name] ?? []).map((row: StoredRecord) => [String(row.id), row]));
    const remote = new Map((cloud.stores[name] ?? []).map((row: StoredRecord) => [String(row.id), row]));
    for (const [id, row] of device) {
      if (!remote.has(id)) {
        missingFromCloud++;
        if (identityStores.has(name)) risk.add(name);
      } else if (canonical(row) !== canonical(remote.get(id))) {
        sameIdDifferentContent++;
        risk.add(name);
      }
    }
    for (const id of remote.keys()) {
      if (!device.has(id)) {
        missingFromDevice++;
        if (identityStores.has(name)) risk.add(name);
      }
    }
  }
  return {
    safeToAutoMerge: false,
    missingFromCloud, missingFromDevice, sameIdDifferentContent,
    identityRiskStores: [...risk], farmMismatch,
  };
}
