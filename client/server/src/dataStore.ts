import { readJson, writeJson } from './jsonStore';

export type Cattle = {
  id: number;
  earTag: string;
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
  const cattle = await readJson<Cattle>(fileName);
  return cattle.sort((a, b) => b.id - a.id);
}

export async function findCattle(id: number) {
  const cattle = await readJson<Cattle>(fileName);
  return cattle.find((cow) => cow.id === id);
}

export async function createCattle(input: CattleInput) {
  const cattle = await readJson<Cattle>(fileName);
  if (cattle.some((cow) => cow.earTag === input.earTag)) throw new Error('DUPLICATED_EAR_TAG');
  const now = new Date().toISOString();
  const nextId = cattle.length === 0 ? 1 : Math.max(...cattle.map((cow) => cow.id)) + 1;
  const cow: Cattle = {
    id: nextId,
    earTag: input.earTag,
    name: input.name,
    birthday: input.birthday,
    sire: input.sire ?? '',
    dam: input.dam ?? '',
    parity: Number(input.parity ?? 0),
    blvStatus: input.blvStatus ?? '未検査',
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now
  };
  cattle.push(cow);
  await writeJson(fileName, cattle);
  return cow;
}

export async function updateCattle(id: number, input: CattleInput) {
  const cattle = await readJson<Cattle>(fileName);
  const index = cattle.findIndex((cow) => cow.id === id);
  if (index === -1) return null;
  if (cattle.some((cow) => cow.id !== id && cow.earTag === input.earTag)) throw new Error('DUPLICATED_EAR_TAG');
  cattle[index] = {
    ...cattle[index],
    earTag: input.earTag,
    name: input.name,
    birthday: input.birthday,
    sire: input.sire ?? '',
    dam: input.dam ?? '',
    parity: Number(input.parity ?? 0),
    blvStatus: input.blvStatus ?? '未検査',
    note: input.note ?? '',
    updatedAt: new Date().toISOString()
  };
  await writeJson(fileName, cattle);
  return cattle[index];
}

export async function deleteCattle(id: number) {
  const cattle = await readJson<Cattle>(fileName);
  const next = cattle.filter((cow) => cow.id !== id);
  if (next.length === cattle.length) return false;
  await writeJson(fileName, next);
  return true;
}
