import { readJson, writeJson } from './jsonStore';

export type Calf = {
  id: number;
  calfNumber: string;
  name: string;
  birthday: string;
  sex: string;
  motherName: string;
  startWeight: number;
  currentWeight: number;
  elapsedDays: number;
  milkAmount: number;
  starterAmount: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type CalfInput = {
  calfNumber: string;
  name: string;
  birthday: string;
  sex?: string;
  motherName?: string;
  startWeight?: number;
  currentWeight?: number;
  elapsedDays?: number;
  milkAmount?: number;
  starterAmount?: number;
  note?: string;
};

const fileName = 'calves.json';

export async function listCalves() {
  const calves = await readJson<Calf>(fileName);
  return calves.sort((a, b) => b.id - a.id);
}

export async function findCalf(id: number) {
  const calves = await readJson<Calf>(fileName);
  return calves.find((calf) => calf.id === id);
}

export async function createCalf(input: CalfInput) {
  const calves = await readJson<Calf>(fileName);
  if (calves.some((calf) => calf.calfNumber === input.calfNumber)) throw new Error('DUPLICATED_CALF_NUMBER');
  const now = new Date().toISOString();
  const nextId = calves.length === 0 ? 1 : Math.max(...calves.map((calf) => calf.id)) + 1;
  const calf: Calf = {
    id: nextId,
    calfNumber: input.calfNumber,
    name: input.name,
    birthday: input.birthday,
    sex: input.sex ?? '雌',
    motherName: input.motherName ?? '',
    startWeight: Number(input.startWeight ?? 0),
    currentWeight: Number(input.currentWeight ?? 0),
    elapsedDays: Number(input.elapsedDays ?? 0),
    milkAmount: Number(input.milkAmount ?? 0),
    starterAmount: Number(input.starterAmount ?? 0),
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now
  };
  calves.push(calf);
  await writeJson(fileName, calves);
  return calf;
}

export async function updateCalf(id: number, input: CalfInput) {
  const calves = await readJson<Calf>(fileName);
  const index = calves.findIndex((calf) => calf.id === id);
  if (index === -1) return null;
  calves[index] = {
    ...calves[index],
    calfNumber: input.calfNumber,
    name: input.name,
    birthday: input.birthday,
    sex: input.sex ?? '雌',
    motherName: input.motherName ?? '',
    startWeight: Number(input.startWeight ?? 0),
    currentWeight: Number(input.currentWeight ?? 0),
    elapsedDays: Number(input.elapsedDays ?? 0),
    milkAmount: Number(input.milkAmount ?? 0),
    starterAmount: Number(input.starterAmount ?? 0),
    note: input.note ?? '',
    updatedAt: new Date().toISOString()
  };
  await writeJson(fileName, calves);
  return calves[index];
}

export async function deleteCalf(id: number) {
  const calves = await readJson<Calf>(fileName);
  const next = calves.filter((calf) => calf.id !== id);
  if (next.length === calves.length) return false;
  await writeJson(fileName, next);
  return true;
}
