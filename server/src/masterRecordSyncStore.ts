import { readJson, writeJson } from './jsonStore';

export type MasterCategory =
  | 'sire'
  | 'feed'
  | 'medicine'
  | 'partner'
  | 'veterinarian'
  | 'inseminator'
  | 'expenseCategory'
  | 'disease'
  | 'treatmentProcedure';

export type SyncedMasterRecord = {
  id: string;
  legacyId?: number;
  category: MasterCategory;
  name: string;
  code?: string;
  earTag?: string;
  note?: string;
  meatWithdrawalDays?: number;
  milkWithdrawalHours?: number;
  withdrawalNote?: string;
  autoCalculateWithdrawal?: boolean;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

const fileName = 'master-record-sync.json';

function normalizeRecord(
  input: SyncedMasterRecord,
  existing?: SyncedMasterRecord,
): SyncedMasterRecord {
  const now = new Date().toISOString();

  return {
    ...existing,
    ...input,
    id: String(input.id || existing?.id || '').trim(),
    legacyId: input.legacyId ?? existing?.legacyId,
    category: input.category ?? existing?.category ?? 'partner',
    name: String(input.name ?? existing?.name ?? '').trim(),
    code: input.code ?? existing?.code,
    earTag: input.earTag ?? existing?.earTag,
    note: input.note ?? existing?.note,
    meatWithdrawalDays: input.meatWithdrawalDays ?? existing?.meatWithdrawalDays,
    milkWithdrawalHours: input.milkWithdrawalHours ?? existing?.milkWithdrawalHours,
    withdrawalNote: input.withdrawalNote ?? existing?.withdrawalNote,
    autoCalculateWithdrawal:
      input.autoCalculateWithdrawal ?? existing?.autoCalculateWithdrawal,
    active: input.active ?? existing?.active ?? true,
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? now,
    deletedAt: input.deletedAt ?? existing?.deletedAt,
    cloudUpdatedAt: now,
  };
}

export async function listSyncedMasterRecords() {
  const records = await readJson<SyncedMasterRecord[]>(fileName, []);
  return records
    .map((record) => normalizeRecord(record, record))
    .sort((a, b) =>
      String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')),
    );
}

export async function syncMasterRecord(
  id: string,
  input: SyncedMasterRecord,
) {
  if (!id.trim()) throw new Error('INVALID_MASTER_RECORD_ID');

  const records = await readJson<SyncedMasterRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;

  if (!input.deletedAt) {
    const normalizedName = String(input.name ?? '').trim().toLocaleLowerCase();
    if (!normalizedName) throw new Error('INVALID_MASTER_NAME');

    const duplicate = records.find(
      (record) =>
        !record.deletedAt &&
        String(record.id) !== id &&
        record.category === input.category &&
        record.name.trim().toLocaleLowerCase() === normalizedName,
    );
    if (duplicate) throw new Error('DUPLICATED_MASTER');
  }

  const synced = normalizeRecord({ ...input, id }, existing);
  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
}

export async function tombstoneMasterRecord(id: string) {
  if (!id.trim()) throw new Error('INVALID_MASTER_RECORD_ID');

  const records = await readJson<SyncedMasterRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;
  const now = new Date().toISOString();

  if (!existing) {
    throw new Error('MASTER_RECORD_NOT_FOUND');
  }

  const deleted = normalizeRecord(
    {
      ...existing,
      id,
      deletedAt: now,
      updatedAt: now,
    },
    existing,
  );

  records[index] = deleted;
  await writeJson(fileName, records);
  return deleted;
}
