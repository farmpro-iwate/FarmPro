import { readJson, writeJson } from './jsonStore';

export type SyncedSaleRecord = {
  id: string;
  targetType?: '子牛' | '成牛' | 'その他';
  targetNumber?: string;
  targetName?: string;
  sex?: string;
  birthday?: string;
  motherName?: string;
  shippingPlanDate?: string;
  shippingDate?: string;
  saleDate?: string;
  buyer?: string;
  marketName?: string;
  saleWeight?: string;
  salePrice?: string;
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
    shippingPlanDate: input.shippingPlanDate ?? existing?.shippingPlanDate ?? '',
    shippingDate: input.shippingDate ?? existing?.shippingDate ?? '',
    saleDate: input.saleDate ?? existing?.saleDate ?? '',
    buyer: input.buyer ?? existing?.buyer ?? '',
    marketName: input.marketName ?? existing?.marketName ?? '',
    saleWeight: input.saleWeight ?? existing?.saleWeight ?? '',
    salePrice: input.salePrice ?? existing?.salePrice ?? '',
    status: input.status ?? existing?.status ?? '出荷予定',
    reason: input.reason ?? existing?.reason ?? '',
    memo: input.memo ?? existing?.memo ?? '',
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? now,
    deletedAt: input.deletedAt ?? existing?.deletedAt,
    cloudUpdatedAt: now,
  };
}

export async function listSyncedSales() {
  const records = await readJson<SyncedSaleRecord[]>(fileName, []);
  return records
    .map((record) => normalizeRecord(record, record))
    .sort((a, b) =>
      String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')),
    );
}

export async function syncSale(id: string, input: SyncedSaleRecord) {
  if (!id.trim()) throw new Error('INVALID_SALE_ID');

  const records = await readJson<SyncedSaleRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;
  const synced = normalizeRecord({ ...input, id }, existing);

  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
}
