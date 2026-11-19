import { readJson, writeJson } from './jsonStore';
import { currentFarmId } from './farmContext';
import { withFarmRequest } from './farmRequestGate';
import { getCloudSettlement } from './settlementSyncStore';

export type SyncedSaleRecord = {
  id: string;
  targetType?: '子牛' | '成牛' | 'その他';
  targetNumber?: string;
  targetName?: string;
  sex?: string;
  birthday?: string;
  motherName?: string;
  calfId?: string;
  cattleId?: string;
  calvingId?: string;
  motherCowId?: string;
  shippingPlanDate?: string;
  shippingDate?: string;
  saleDate?: string;
  buyer?: string;
  marketName?: string;
  saleWeight?: string;
  salePrice?: string;
  productionCostSnapshot?: number;
  profitSnapshot?: number;
  costSnapshotAt?: string;
  status?: '出荷予定' | '出荷済み' | '販売済み' | '取消';
  reason?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

const fileName = 'sales-sync.json';

function normalizeRecord(
  input: SyncedSaleRecord,
  existing?: SyncedSaleRecord,
): SyncedSaleRecord {
  const now = new Date().toISOString();

  return {
    ...existing,
    ...input,
    id: String(input.id || existing?.id || ''),
    targetType: input.targetType ?? existing?.targetType ?? '子牛',
    targetNumber: input.targetNumber ?? existing?.targetNumber ?? '',
    targetName: input.targetName ?? existing?.targetName ?? '',
    sex: input.sex ?? existing?.sex ?? '',
    birthday: input.birthday ?? existing?.birthday ?? '',
    motherName: input.motherName ?? existing?.motherName ?? '',
    calfId: input.calfId ?? existing?.calfId ?? '',
    cattleId: input.cattleId ?? existing?.cattleId ?? '',
    calvingId: input.calvingId ?? existing?.calvingId ?? '',
    motherCowId: input.motherCowId ?? existing?.motherCowId ?? '',
    shippingPlanDate: input.shippingPlanDate ?? existing?.shippingPlanDate ?? '',
    shippingDate: input.shippingDate ?? existing?.shippingDate ?? '',
    saleDate: input.saleDate ?? existing?.saleDate ?? '',
    buyer: input.buyer ?? existing?.buyer ?? '',
    marketName: input.marketName ?? existing?.marketName ?? '',
    saleWeight: input.saleWeight ?? existing?.saleWeight ?? '',
    salePrice: input.salePrice ?? existing?.salePrice ?? '',
    productionCostSnapshot: input.productionCostSnapshot ?? existing?.productionCostSnapshot,
    profitSnapshot: input.profitSnapshot ?? existing?.profitSnapshot,
    costSnapshotAt: input.costSnapshotAt ?? existing?.costSnapshotAt,
    status: input.status ?? existing?.status ?? '出荷予定',
    reason: input.reason ?? existing?.reason ?? '',
    memo: input.memo ?? existing?.memo ?? '',
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? now,
    deletedAt: input.deletedAt ?? existing?.deletedAt,
    cloudUpdatedAt: now,
  };
}

/**
 * A sale and its shipping plan are one lifecycle, never two active records.
 * Compare internal calf IDs first; if unavailable, require both ear tag and
 * birth date. Do not use the animal's name as an identity.
 */
function sameSaleAnimal(a: SyncedSaleRecord, b: SyncedSaleRecord): boolean {
  if (a.targetType !== '子牛' || b.targetType !== '子牛') return false;
  const calfA = String(a.calfId || '').trim();
  const calfB = String(b.calfId || '').trim();
  if (calfA && calfB) return calfA === calfB;
  const numberA = String(a.targetNumber || '').trim();
  const numberB = String(b.targetNumber || '').trim();
  const birthdayA = String(a.birthday || '').slice(0, 10);
  const birthdayB = String(b.birthday || '').slice(0, 10);
  return Boolean(numberA && numberA === numberB && birthdayA && birthdayA === birthdayB);
}

function isActiveSale(row: SyncedSaleRecord): boolean {
  return !row.deletedAt && row.status !== '取消';
}

function identityOrStatusChanged(before: SyncedSaleRecord, after: SyncedSaleRecord): boolean {
  return before.status !== after.status ||
    before.targetType !== after.targetType ||
    String(before.calfId || '').trim() !== String(after.calfId || '').trim() ||
    String(before.targetNumber || '').trim() !== String(after.targetNumber || '').trim() ||
    String(before.birthday || '').slice(0, 10) !== String(after.birthday || '').slice(0, 10) ||
    Boolean(before.deletedAt) !== Boolean(after.deletedAt);
}

function conflictsWithExistingSale(
  records: SyncedSaleRecord[],
  incoming: SyncedSaleRecord,
  previous?: SyncedSaleRecord,
): boolean {
  if (!isActiveSale(incoming) || incoming.targetType !== '子牛') return false;
  // Preserve legacy duplicate records: harmless edits to an unchanged record
  // must not become impossible just because an older duplicate exists.
  if (previous && !identityOrStatusChanged(previous, incoming)) return false;
  return records.some(row =>
    row.id !== incoming.id && isActiveSale(row) && sameSaleAnimal(row, incoming));
}

export async function listSyncedSales() {
  const records = await readJson<SyncedSaleRecord[]>(fileName, []);
  return [...records].sort((a, b) =>
    String(b.cloudUpdatedAt ?? b.updatedAt ?? '').localeCompare(
      String(a.cloudUpdatedAt ?? a.updatedAt ?? ''),
    ),
  );
}

export async function syncSale(id: string, input: SyncedSaleRecord) {
  if (!id.trim()) throw new Error('INVALID_SALE_ID');

  const farmId = currentFarmId();
  if (!farmId) throw new Error('SALE_FARM_REQUIRED');
  return withFarmRequest(farmId, async () => {
    const records = await readJson<SyncedSaleRecord[]>(fileName, []);
    const index = records.findIndex((record) => String(record.id) === id);
    const existing = index >= 0 ? records[index] : undefined;
    const synced = normalizeRecord({ ...input, id }, existing);
    if (await getCloudSettlement(id)) {
      const locked = ['targetType', 'targetNumber', 'targetName', 'birthday', 'saleDate', 'calfId', 'cattleId', 'salePrice', 'status', 'deletedAt'] as const;
      if (!existing || locked.some(key => (existing[key] ?? '') !== (synced[key] ?? ''))) {
        throw new Error('SETTLED_SALE_IMMUTABLE');
      }
    }
    // The farm-scoped gate serializes this read/check/write sequence. A
    // second device racing to create a different ID must receive a conflict.
    if (conflictsWithExistingSale(records, synced, existing)) {
      throw new Error('SALE_ANIMAL_DUPLICATE');
    }
    if (index >= 0) records[index] = synced;
    else records.push(synced);
    await writeJson(fileName, records);
    return synced;
  });
}
