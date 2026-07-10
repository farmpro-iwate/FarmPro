import { readJson, writeJson } from './jsonStore';

export type Breeding = {
  id: number;
  cowEarTag: string;
  cowName: string;
  heatDate: string;
  breedingMethod: string;
  breedingStatus: string;
  inseminationDate: string;
  bullName: string;
  transferPlannedDate: string;
  transferDate: string;
  transferCancelReason: string;
  nextHeatExpectedDate: string;
  pregnancyCheckExpectedDate: string;
  pregnancyCheckDate: string;
  pregnancyResult: string;
  recheckExpectedDate: string;
  expectedCalvingDate: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type BreedingInput = Omit<Breeding, 'id' | 'createdAt' | 'updatedAt'>;

const fileName = 'breedings.json';

function normalize(input: Partial<BreedingInput>): BreedingInput {
  return {
    cowEarTag: input.cowEarTag ?? '',
    cowName: input.cowName ?? '',
    heatDate: input.heatDate ?? '',
    breedingMethod: input.breedingMethod ?? '未選択',
    breedingStatus: input.breedingStatus ?? '発情予定',
    inseminationDate: input.inseminationDate ?? '',
    bullName: input.bullName ?? '',
    transferPlannedDate: input.transferPlannedDate ?? '',
    transferDate: input.transferDate ?? '',
    transferCancelReason: input.transferCancelReason ?? '',
    nextHeatExpectedDate: input.nextHeatExpectedDate ?? '',
    pregnancyCheckExpectedDate: input.pregnancyCheckExpectedDate ?? '',
    pregnancyCheckDate: input.pregnancyCheckDate ?? '',
    pregnancyResult: input.pregnancyResult ?? '未鑑定',
    recheckExpectedDate: input.recheckExpectedDate ?? '',
    expectedCalvingDate: input.expectedCalvingDate ?? '',
    note: input.note ?? ''
  };
}

export async function listBreedings() {
  const data = await readJson<Breeding>(fileName);
  return data.map((item) => ({ ...normalize(item), id: item.id, createdAt: item.createdAt, updatedAt: item.updatedAt })).sort((a, b) => b.id - a.id);
}

export async function findBreeding(id: number) {
  const data = await readJson<Breeding>(fileName);
  const item = data.find((row) => row.id === id);
  return item ? { ...normalize(item), id: item.id, createdAt: item.createdAt, updatedAt: item.updatedAt } : undefined;
}

export async function createBreeding(input: BreedingInput) {
  const data = await readJson<Breeding>(fileName);
  const now = new Date().toISOString();
  const item: Breeding = {
    id: data.length === 0 ? 1 : Math.max(...data.map((x) => x.id)) + 1,
    ...normalize(input),
    createdAt: now,
    updatedAt: now
  };
  data.push(item);
  await writeJson(fileName, data);
  return item;
}

export async function updateBreeding(id: number, input: BreedingInput) {
  const data = await readJson<Breeding>(fileName);
  const index = data.findIndex((item) => item.id === id);
  if (index === -1) return null;
  data[index] = {
    ...data[index],
    ...normalize(input),
    updatedAt: new Date().toISOString()
  };
  await writeJson(fileName, data);
  return data[index];
}

export async function deleteBreeding(id: number) {
  const data = await readJson<Breeding>(fileName);
  const next = data.filter((item) => item.id !== id);
  if (next.length === data.length) return false;
  await writeJson(fileName, next);
  return true;
}