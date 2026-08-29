import { readJson, writeJson } from './jsonStore';

export type SyncedCalvingRecord = {
  id: string;
  cowId?: string;
  cattleId?: string;
  cowName?: string;
  expectedCalvingDate?: string;
  actualCalvingDate?: string;
  calfName?: string;
  calfSex?: string;
  birthWeightKg?: number | string;
  calvingResult?: string;
  colostrumStatus?: string;
  memo?: string;
  registeredToCalfLedger?: boolean;
  calfId?: string;
  breedingId?: string;
  breedingLinked?: boolean;
  breedingLinkedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

const fileName = 'calvings.json';

function validIsoDate(value?: string) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function normalizeCalvingResult(result?: string) {
  if (!result) return '自然分娩';
  if (result === '正常') return '自然分娩';
  if (result === '介助分娩' || result === '要確認') return '難産';
  if (result === '中止') return '死産';
  return result;
}

function normalizeRecord(input: SyncedCalvingRecord, existing?: SyncedCalvingRecord): SyncedCalvingRecord {
  const now = new Date().toISOString();
  const birthWeight =
    input.birthWeightKg === '' || input.birthWeightKg === undefined || input.birthWeightKg === null
      ? ''
      : Number(input.birthWeightKg);

  return {
    ...existing,
    ...input,
    id: String(input.id || existing?.id || ''),
    cowId: input.cowId ?? existing?.cowId ?? '',
    cattleId: input.cattleId ?? existing?.cattleId ?? '',
    cowName: input.cowName ?? existing?.cowName ?? '',
    expectedCalvingDate: input.expectedCalvingDate ?? existing?.expectedCalvingDate ?? '',
    actualCalvingDate: input.actualCalvingDate ?? existing?.actualCalvingDate ?? '',
    calfName: input.calfName ?? existing?.calfName ?? '',
    calfSex: input.calfSex ?? existing?.calfSex ?? '不明',
    birthWeightKg: Number.isNaN(birthWeight) ? '' : birthWeight,
    calvingResult: normalizeCalvingResult(input.calvingResult ?? existing?.calvingResult),
    colostrumStatus: input.colostrumStatus ?? existing?.colostrumStatus ?? '未確認',
    memo: input.memo ?? existing?.memo ?? '',
    registeredToCalfLedger: Boolean(input.registeredToCalfLedger ?? existing?.registeredToCalfLedger),
    calfId: input.calfId ?? existing?.calfId ?? '',
    breedingId: input.breedingId ?? existing?.breedingId ?? '',
    breedingLinked: Boolean(input.breedingLinked ?? existing?.breedingLinked),
    breedingLinkedAt: input.breedingLinkedAt ?? existing?.breedingLinkedAt ?? '',
    createdAt: validIsoDate(input.createdAt) ? input.createdAt : existing?.createdAt ?? now,
    updatedAt: validIsoDate(input.updatedAt) ? input.updatedAt : now,
  };
}

export async function listSyncedCalvings() {
  const records = await readJson<SyncedCalvingRecord[]>(fileName, []);
  return records
    .map((record) => normalizeRecord(record, record))
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
}

export async function syncCalving(id: string, input: SyncedCalvingRecord) {
  if (!id.trim()) throw new Error('INVALID_CALVING_ID');

  const records = await readJson<SyncedCalvingRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;

  if (
    existing &&
    validIsoDate(input.updatedAt) &&
    validIsoDate(existing.updatedAt) &&
    Date.parse(input.updatedAt!) < Date.parse(existing.updatedAt!)
  ) {
    throw new Error('CALVING_SYNC_CONFLICT');
  }

  const synced = normalizeRecord({ ...input, id }, existing);
  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
}
