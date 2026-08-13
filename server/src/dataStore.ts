import { readJson, writeJson } from './jsonStore';

export type CattleStage = '育成牛' | '繁殖牛';

export type Cattle = {
  id: number;
  earTag: string;
  identificationNumber?: string;
  name: string;
  birthday: string;
  sire: string;
  dam: string;
  parity: number;
  blvStatus: string;
  stage: CattleStage;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type CattleInput = {
  earTag: string;
  identificationNumber?: string;
  name: string;
  birthday: string;
  sire?: string;
  dam?: string;
  parity?: number;
  blvStatus?: string;
  stage?: CattleStage;
  note?: string;
};

const fileName = 'cattle.json';

function normalizeCattle(item: Cattle): Cattle {
  return {
    ...item,
    stage: item.stage ?? '繁殖牛'
  };
}

function assertBreedingCattleLimit(
  data: Cattle[],
  maxBreedingCattle: number | null | undefined,
  excludeId?: number,
) {
  if (maxBreedingCattle == null) return;

  const breedingCount = data.reduce((count, item) => {
    if (item.id === excludeId) return count;
    return normalizeCattle(item).stage === '繁殖牛' ? count + 1 : count;
  }, 0);

  if (breedingCount >= maxBreedingCattle) {
    throw new Error('BREEDING_CATTLE_PLAN_LIMIT');
  }
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

export async function createCattle(
  input: CattleInput,
  maxBreedingCattle?: number | null,
) {
  const data = await readJson<Cattle>(fileName);
  if (data.some((item) => item.earTag === input.earTag)) throw new Error('DUPLICATED_EAR_TAG');

  const stage = input.stage ?? '繁殖牛';
  if (stage === '繁殖牛') {
    assertBreedingCattleLimit(data, maxBreedingCattle);
  }

  const now = new Date().toISOString();
  const item: Cattle = {
    id: data.length === 0 ? 1 : Math.max(...data.map((x) => x.id)) + 1,
    earTag: input.earTag,
    identificationNumber: input.identificationNumber ?? '',
    name: input.name,
    birthday: input.birthday,
    sire: input.sire ?? '',
    dam: input.dam ?? '',
    parity: Number(input.parity ?? 0),
    blvStatus: input.blvStatus ?? '未検査',
    stage,
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now,
  };
  data.push(item);
  await writeJson(fileName, data);
  return item;
}

export async function updateCattle(
  id: number,
  input: CattleInput,
  maxBreedingCattle?: number | null,
) {
  const data = await readJson<Cattle>(fileName);
  const index = data.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const currentStage = normalizeCattle(data[index]).stage;
  const nextStage = input.stage ?? currentStage;
  if (currentStage !== '繁殖牛' && nextStage === '繁殖牛') {
    assertBreedingCattleLimit(data, maxBreedingCattle, id);
  }

  data[index] = {
    ...data[index],
    earTag: input.earTag,
    identificationNumber: input.identificationNumber ?? '',
    name: input.name,
    birthday: input.birthday,
    sire: input.sire ?? '',
    dam: input.dam ?? '',
    parity: Number(input.parity ?? 0),
    blvStatus: input.blvStatus ?? '未検査',
    stage: nextStage,
    note: input.note ?? '',
    updatedAt: new Date().toISOString(),
  };
  await writeJson(fileName, data);
  return normalizeCattle(data[index]);
}

export async function markCattleAsBreeding(
  earTag: string,
  maxBreedingCattle?: number | null,
) {
  if (!earTag) return null;
  const data = await readJson<Cattle>(fileName);
  const index = data.findIndex((item) => item.earTag === earTag);
  if (index === -1) return null;
  if (data[index].stage === '繁殖牛') return normalizeCattle(data[index]);

  assertBreedingCattleLimit(data, maxBreedingCattle, data[index].id);

  data[index] = {
    ...data[index],
    stage: '繁殖牛',
    updatedAt: new Date().toISOString()
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
