import fs from 'node:fs/promises';
import path from 'node:path';

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

const dataFile = path.resolve(process.cwd(), 'src', 'data', 'cattle.json');

async function readCattle(): Promise<Cattle[]> {
  const raw = await fs.readFile(dataFile, 'utf-8');
  return JSON.parse(raw) as Cattle[];
}

async function writeCattle(cattle: Cattle[]) {
  await fs.writeFile(dataFile, JSON.stringify(cattle, null, 2), 'utf-8');
}

export async function listCattle() {
  const cattle = await readCattle();
  return cattle.sort((a, b) => b.id - a.id);
}

export async function findCattle(id: number) {
  const cattle = await readCattle();
  return cattle.find((cow) => cow.id === id);
}

export async function createCattle(input: CattleInput) {
  const cattle = await readCattle();
  if (cattle.some((cow) => cow.earTag === input.earTag)) {
    throw new Error('DUPLICATED_EAR_TAG');
  }
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
  await writeCattle(cattle);
  return cow;
}

export async function updateCattle(id: number, input: CattleInput) {
  const cattle = await readCattle();
  const index = cattle.findIndex((cow) => cow.id === id);
  if (index === -1) return null;
  if (cattle.some((cow) => cow.id !== id && cow.earTag === input.earTag)) {
    throw new Error('DUPLICATED_EAR_TAG');
  }
  const updated: Cattle = {
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
  cattle[index] = updated;
  await writeCattle(cattle);
  return updated;
}

export async function deleteCattle(id: number) {
  const cattle = await readCattle();
  const next = cattle.filter((cow) => cow.id !== id);
  if (next.length === cattle.length) return false;
  await writeCattle(next);
  return true;
}
