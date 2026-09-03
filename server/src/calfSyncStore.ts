import { readJson, writeJson } from './jsonStore';

export type SyncedCalfRecord = {
  id: string;
  calvingId?: string;
  calfNumber?: string;
  temporaryCalfNumber?: string;
  identificationNumber?: string;
  name?: string;
  birthday?: string;
  sex?: string;
  motherName?: string;
  geneticMotherCowName?: string;
  recipientCowName?: string;
  sireName?: string;
  startWeight?: number;
  currentWeight?: number;
  elapsedDays?: number;
  milkAmount?: number;
  starterAmount?: number;
  feedingMethod?: string;
  weaningPlannedDate?: string;
  weaningDate?: string;
  weaningStatus?: string;
  weaningWeight?: number;
  weaningStarterAmount?: number;
  milkEndDate?: string;
  managementStatus?: string;
  promotedCattleId?: number;
  promotedAt?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

const fileName = 'calves-sync.json';

function validIsoDate(value?: string) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function normalizeRecord(input: SyncedCalfRecord, existing?: SyncedCalfRecord): SyncedCalfRecord {
  const now = new Date().toISOString();
  return {
    ...existing,
    ...input,
    id: String(input.id || existing?.id || ''),
    calvingId: input.calvingId ?? existing?.calvingId ?? '',
    calfNumber: input.calfNumber ?? existing?.calfNumber ?? '',
    temporaryCalfNumber: input.temporaryCalfNumber ?? existing?.temporaryCalfNumber ?? '',
    identificationNumber: input.identificationNumber ?? existing?.identificationNumber ?? '',
    name: input.name ?? existing?.name ?? '',
    birthday: input.birthday ?? existing?.birthday ?? '',
    sex: input.sex ?? existing?.sex ?? '',
    motherName: input.motherName ?? existing?.motherName ?? '',
    geneticMotherCowName: input.geneticMotherCowName ?? existing?.geneticMotherCowName ?? '',
    recipientCowName: input.recipientCowName ?? existing?.recipientCowName ?? '',
    sireName: input.sireName ?? existing?.sireName ?? '',
    startWeight: Number(input.startWeight ?? existing?.startWeight ?? 0),
    currentWeight: Number(input.currentWeight ?? existing?.currentWeight ?? 0),
    elapsedDays: Number(input.elapsedDays ?? existing?.elapsedDays ?? 0),
    milkAmount: Number(input.milkAmount ?? existing?.milkAmount ?? 0),
    starterAmount: Number(input.starterAmount ?? existing?.starterAmount ?? 0),
    feedingMethod: input.feedingMethod ?? existing?.feedingMethod ?? '人工哺育',
    weaningPlannedDate: input.weaningPlannedDate ?? existing?.weaningPlannedDate ?? '',
    weaningDate: input.weaningDate ?? existing?.weaningDate ?? '',
    weaningStatus: input.weaningStatus ?? existing?.weaningStatus ?? '離乳前',
    weaningWeight: Number(input.weaningWeight ?? existing?.weaningWeight ?? 0),
    weaningStarterAmount: Number(input.weaningStarterAmount ?? existing?.weaningStarterAmount ?? 0),
    milkEndDate: input.milkEndDate ?? existing?.milkEndDate ?? '',
    managementStatus: input.managementStatus ?? existing?.managementStatus ?? '育成中',
    promotedCattleId: input.promotedCattleId ?? existing?.promotedCattleId,
    promotedAt: input.promotedAt ?? existing?.promotedAt ?? '',
    note: input.note ?? existing?.note ?? '',
    createdAt: validIsoDate(input.createdAt) ? input.createdAt : existing?.createdAt ?? now,
    updatedAt: validIsoDate(input.updatedAt) ? input.updatedAt : now,
    deletedAt: input.deletedAt,
    cloudUpdatedAt: now,
  };
}

export async function listSyncedCalves() {
  const records = await readJson<SyncedCalfRecord[]>(fileName, []);
  return [...records].sort((a, b) =>
    String(b.cloudUpdatedAt ?? b.updatedAt ?? '').localeCompare(
      String(a.cloudUpdatedAt ?? a.updatedAt ?? ''),
    ),
  );
}

export async function syncCalf(id: string, input: SyncedCalfRecord) {
  if (!id.trim()) throw new Error('INVALID_CALF_ID');

  const records = await readJson<SyncedCalfRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;

  const synced = normalizeRecord({ ...input, id }, existing);
  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
}

export async function deleteSyncedCalf(id: string) {
  if (!id.trim()) throw new Error('INVALID_CALF_ID');

  const records = await readJson<SyncedCalfRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;
  const now = new Date().toISOString();
  const deleted = normalizeRecord(
    {
      ...(existing ?? { id }),
      id,
      deletedAt: now,
      updatedAt: now,
    },
    existing,
  );

  if (index >= 0) records[index] = deleted;
  else records.push(deleted);

  await writeJson(fileName, records);
  return deleted;
}
