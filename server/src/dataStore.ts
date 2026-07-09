import { readJson, writeJson } from './jsonStore';

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
  note?: string;
};

const fileName = 'cattle.json';

export async function listCattle() {
  const data = await readJson<Cattle>(fileName);
  return data.sort((a, b) => b.id - a.id);
}

export async function findCattle(id: number) {
  const data = await readJson<Cattle>(fileName);
  return data.find((item) => item.id === id);
}

export async function createCattle(input: CattleInput) {
  const data = await readJson<Cattle>(fileName);
  if (data.some((item) => item.earTag === input.earTag)) throw new Error('DUPLICATED_EAR_TAG');
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
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now,
  };
  data.push(item);
  await writeJson(fileName, data);
  return item;
}

export async function updateCattle(id: number, input: CattleInput) {
  const data = await readJson<Cattle>(fileName);
  const index = data.findIndex((item) => item.id === id);
  if (index === -1) return null;
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
    note: input.note ?? '',
    updatedAt: new Date().toISOString(),
  };
  await writeJson(fileName, data);
  return data[index];
}

export async function deleteCattle(id: number) {
  const data = await readJson<Cattle>(fileName);
  const next = data.filter((item) => item.id !== id);
  if (next.length === data.length) return false;
  await writeJson(fileName, next);
  return true;
}
