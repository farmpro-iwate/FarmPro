import { readJson, writeJson } from './jsonStore';

export type SyncedCattleRecord = {
  id: string;
  legacyId?: number;
  earTag: string;
  identificationNumber?: string;
  name: string;
  birthday: string;
  sex?: '雌' | '雄' | '去勢';
  sire?: string;
  dam?: string;
  parity?: number;
  blvStatus?: string;
  stage?: '育成牛' | '繁殖牛';
  sourceCalfId?: number;
  note?: string;
  registrationNumber?: string;
  sourceReferenceNumber?: string;
  maternalSire?: string;
  maternalGrandSire?: string;
  importedOffspringHistory?: Array<{
    parity: string;
    name: string;
    birthday: string;
    sex?: '' | '雌' | '雄' | '去勢';
    sire: string;
    calvingIntervalDays?: string;
    salePrice?: string;
  }>;
  importSourceFileName?: string;
  importSourceType?: 'ai-document';
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

const fileName = 'cattle-record-sync.json';

function normalizeRecord(
  input: SyncedCattleRecord,
  existing?: SyncedCattleRecord,
): SyncedCattleRecord {
  const now = new Date().toISOString();

  return {
    ...existing,
    ...input,
    id: String(input.id || existing?.id || ''),
    legacyId: input.legacyId ?? existing?.legacyId,
    earTag: String(input.earTag ?? existing?.earTag ?? '').trim(),
    identificationNumber: String(
      input.identificationNumber ?? existing?.identificationNumber ?? '',
    ).trim(),
    name: input.name ?? existing?.name ?? '',
    birthday: input.birthday ?? existing?.birthday ?? '',
    sex: input.sex ?? existing?.sex ?? '雌',
    sire: input.sire ?? existing?.sire ?? '',
    dam: input.dam ?? existing?.dam ?? '',
    parity: Number(input.parity ?? existing?.parity ?? 0),
    blvStatus: input.blvStatus ?? existing?.blvStatus ?? '未検査',
    stage: input.stage ?? existing?.stage ?? '繁殖牛',
    sourceCalfId: input.sourceCalfId ?? existing?.sourceCalfId,
    note: input.note ?? existing?.note ?? '',
    registrationNumber: input.registrationNumber ?? existing?.registrationNumber,
    sourceReferenceNumber: input.sourceReferenceNumber ?? existing?.sourceReferenceNumber,
    maternalSire: input.maternalSire ?? existing?.maternalSire,
    maternalGrandSire: input.maternalGrandSire ?? existing?.maternalGrandSire,
    importedOffspringHistory: input.importedOffspringHistory ?? existing?.importedOffspringHistory,
    importSourceFileName: input.importSourceFileName ?? existing?.importSourceFileName,
    importSourceType: input.importSourceType ?? existing?.importSourceType,
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? now,
    deletedAt: input.deletedAt ?? existing?.deletedAt,
    cloudUpdatedAt: now,
  };
}

export async function listSyncedCattleRecords() {
  const records = await readJson<SyncedCattleRecord[]>(fileName, []);
  return records
    .map((record) => normalizeRecord(record, record))
    .sort((a, b) =>
      String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')),
    );
}

export async function syncCattleRecord(
  id: string,
  input: SyncedCattleRecord,
) {
  if (!id.trim()) throw new Error('INVALID_CATTLE_RECORD_ID');

  const records = await readJson<SyncedCattleRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;

  if (!input.deletedAt) {
    const duplicateEarTag = records.find(
      (record) =>
        !record.deletedAt &&
        String(record.id) !== id &&
        record.earTag.trim() === String(input.earTag ?? '').trim(),
    );
    if (duplicateEarTag) throw new Error('DUPLICATED_EAR_TAG');

    const identificationNumber = String(input.identificationNumber ?? '').trim();
    if (identificationNumber) {
      const duplicateIdentificationNumber = records.find(
        (record) =>
          !record.deletedAt &&
          String(record.id) !== id &&
          String(record.identificationNumber ?? '').trim() === identificationNumber,
      );
      if (duplicateIdentificationNumber) throw new Error('DUPLICATED_IDENTIFICATION_NUMBER');
    }
  }

  const synced = normalizeRecord({ ...input, id }, existing);
  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
}
