import { readJson, writeJson } from './jsonStore';

export type Breeding = {
  id: number;
  cowEarTag: string;
  cowName: string;
  heatDate: string;
  inseminationDate: string;
  bullName: string;
  pregnancyCheckDate: string;
  pregnancyResult: string;
  expectedCalvingDate: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type BreedingInput = {
  cowEarTag: string;
  cowName: string;
  heatDate?: string;
  inseminationDate: string;
  bullName?: string;
  pregnancyCheckDate?: string;
  pregnancyResult?: string;
  expectedCalvingDate?: string;
  note?: string;
};

const fileName = 'breedings.json';

export async function listBreedings() {
  const breedings = await readJson<Breeding>(fileName);
  return breedings.sort((a, b) => b.id - a.id);
}

export async function findBreeding(id: number) {
  const breedings = await readJson<Breeding>(fileName);
  return breedings.find((breeding) => breeding.id === id);
}

export async function createBreeding(input: BreedingInput) {
  const breedings = await readJson<Breeding>(fileName);
  const now = new Date().toISOString();
  const nextId = breedings.length === 0 ? 1 : Math.max(...breedings.map((breeding) => breeding.id)) + 1;
  const breeding: Breeding = {
    id: nextId,
    cowEarTag: input.cowEarTag,
    cowName: input.cowName,
    heatDate: input.heatDate ?? '',
    inseminationDate: input.inseminationDate,
    bullName: input.bullName ?? '',
    pregnancyCheckDate: input.pregnancyCheckDate ?? '',
    pregnancyResult: input.pregnancyResult ?? '未鑑定',
    expectedCalvingDate: input.expectedCalvingDate ?? '',
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now
  };
  breedings.push(breeding);
  await writeJson(fileName, breedings);
  return breeding;
}

export async function updateBreeding(id: number, input: BreedingInput) {
  const breedings = await readJson<Breeding>(fileName);
  const index = breedings.findIndex((breeding) => breeding.id === id);
  if (index === -1) return null;
  breedings[index] = {
    ...breedings[index],
    cowEarTag: input.cowEarTag,
    cowName: input.cowName,
    heatDate: input.heatDate ?? '',
    inseminationDate: input.inseminationDate,
    bullName: input.bullName ?? '',
    pregnancyCheckDate: input.pregnancyCheckDate ?? '',
    pregnancyResult: input.pregnancyResult ?? '未鑑定',
    expectedCalvingDate: input.expectedCalvingDate ?? '',
    note: input.note ?? '',
    updatedAt: new Date().toISOString()
  };
  await writeJson(fileName, breedings);
  return breedings[index];
}

export async function deleteBreeding(id: number) {
  const breedings = await readJson<Breeding>(fileName);
  const next = breedings.filter((breeding) => breeding.id !== id);
  if (next.length === breedings.length) return false;
  await writeJson(fileName, next);
  return true;
}
