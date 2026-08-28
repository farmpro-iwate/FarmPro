import { readJson, writeJson } from './jsonStore';

export type CattleStage = '育成牛' | '繁殖牛';
export type CattleSex = '雌' | '雄' | '去勢';

export type ImportedOffspringHistory = {
  parity: string;
  name: string;
  birthday: string;
  sex?: '' | CattleSex;
  sire: string;
  calvingIntervalDays?: string;
  salePrice?: string;
};

export type Cattle = {
  id: number;
  earTag: string;
  identificationNumber?: string;
  name: string;
  birthday: string;
  sex: CattleSex;
  sire: string;
  dam: string;
  parity: number;
  blvStatus: string;
  stage: CattleStage;
  sourceCalfId?: number;
  note: string;
  registrationNumber?: string;
  sourceReferenceNumber?: string;
  maternalSire?: string;
  maternalGrandSire?: string;
  importedOffspringHistory?: ImportedOffspringHistory[];
  importSourceFileName?: string;
  importSourceType?: 'ai-document';
  createdAt: string;
  updatedAt: string;
};

export type CattleInput = {
  earTag: string;
  identificationNumber?: string;
  name: string;
  birthday: string;
  sex?: CattleSex;
  sire?: string;
  dam?: string;
  parity?: number;
  blvStatus?: string;
  stage?: CattleStage;
  sourceCalfId?: number;
  note?: string;
  registrationNumber?: string;
  sourceReferenceNumber?: string;
  maternalSire?: string;
  maternalGrandSire?: string;
  importedOffspringHistory?: ImportedOffspringHistory[];
  importSourceFileName?: string;
  importSourceType?: 'ai-document';
};

export type CattleSyncInput = CattleInput & {
  createdAt?: string;
  updatedAt?: string;
};

const fileName = 'cattle.json';

function normalizeCattle(item: Cattle): Cattle {
  return {
    ...item,
    sex: item.sex ?? '雌',
    stage: item.stage ?? '繁殖牛',
  };
}

function validIsoDate(value?: string) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function cattleFromInput(id: number, input: CattleSyncInput, existing?: Cattle): Cattle {
  const now = new Date().toISOString();
  return {
    id,
    earTag: input.earTag,
    identificationNumber: input.identificationNumber ?? existing?.identificationNumber ?? '',
    name: input.name,
    birthday: input.birthday,
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
    createdAt: validIsoDate(input.createdAt) ? input.createdAt! : existing?.createdAt ?? now,
    updatedAt: validIsoDate(input.updatedAt) ? input.updatedAt! : now,
  };
}

export async function listCattle() {
  const data = await readJson<Cattle>(fileName);
  return data.map(normalizeCattle).sort((a, b) => b.id - a.id);
}

export async function findCattle(id: number) {
  const data = await readJson<Cattle>(fileName);
  const item = data.find((row) => row.id === id);
  return item ? normalizeCattle(item) : undefined;
}

export async function createCattle(input: CattleInput) {
  const data = await readJson<Cattle>(fileName);
  if (data.some((item) => item.earTag === input.earTag)) throw new Error('DUPLICATED_EAR_TAG');
  const nextId = data.length === 0 ? 1 : Math.max(...data.map((x) => x.id)) + 1;
  const item = cattleFromInput(nextId, input);
  data.push(item);
  await writeJson(fileName, data);
  return item;
}

export async function updateCattle(id: number, input: CattleInput) {
  const data = await readJson<Cattle>(fileName);
  const index = data.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const existing = normalizeCattle(data[index]);
  data[index] = cattleFromInput(id, input, existing);
  await writeJson(fileName, data);
  return normalizeCattle(data[index]);
}

export async function syncCattle(id: number, input: CattleSyncInput) {
  if (!Number.isInteger(id) || id <= 0) throw new Error('INVALID_CATTLE_ID');
  const data = await readJson<Cattle>(fileName);
  const duplicateEarTag = data.find((item) => item.id !== id && item.earTag === input.earTag);
  if (duplicateEarTag) throw new Error('DUPLICATED_EAR_TAG');

  const index = data.findIndex((item) => item.id === id);
  const existing = index >= 0 ? normalizeCattle(data[index]) : undefined;
  if (existing && validIsoDate(input.updatedAt) && validIsoDate(existing.updatedAt) && input.updatedAt! < existing.updatedAt) {
    throw new Error('CATTLE_SYNC_CONFLICT');
  }

  const item = cattleFromInput(id, input, existing);
  if (index >= 0) data[index] = item;
  else data.push(item);
  await writeJson(fileName, data);
  return normalizeCattle(item);
}

export async function markCattleAsBreeding(earTag: string) {
  if (!earTag) return null;
  const data = await readJson<Cattle>(fileName);
  const index = data.findIndex((item) => item.earTag === earTag);
  if (index === -1) return null;
  if (data[index].stage === '繁殖牛') return normalizeCattle(data[index]);
  data[index] = {
    ...data[index],
    stage: '繁殖牛',
    updatedAt: new Date().toISOString(),
  };
  await writeJson(fileName, data);
  return normalizeCattle(data[index]);
}

export async function deleteCattle(id: number) {
  const data = await readJson<Cattle>(fileName);
  const next = data.filter((item) => item.id !== id);
  if (next.length === data.length) return false;
  await writeJson(fileName, next);
  return true;
}
