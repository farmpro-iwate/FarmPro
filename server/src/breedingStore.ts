import { readJson, writeJson } from './jsonStore';

export type Breeding = {
  id: string | number;
  cowEarTag: string;
  cowName: string;
  heatDate: string;
  estrusType?: '自然発情' | '繁殖治療による発情' | '';
  breedingMethod: string;
  breedingStatus: string;
  inseminationDate: string;
  bullName: string;
  bullMasterId?: number;
  inseminatorName: string;
  inseminatorMasterId?: number;
  transferPlannedDate: string;
  transferDate: string;
  transferCancelReason: string;
  embryoNumber: string;
  collectionDate: string;
  embryoType: string;
  donorCowName: string;
  donorCowEarTag: string;
  embryoSireName: string;
  embryoSireMasterId?: number;
  embryoGrade: string;
  strawNumber: string;
  supplierName: string;
  supplierMasterId?: number;
  transferTechnician: string;
  transferTechnicianMasterId?: number;
  nextHeatExpectedDate: string;
  pregnancyCheckExpectedDate: string;
  pregnancyCheckDate: string;
  pregnancyResult: string;
  recheckExpectedDate: string;
  expectedCalvingDate: string;
  estrusSigns?: string[];
  estrusSignsOther?: string;
  synchronizationProgramId?: string;
  synchronizationProgramName?: string;
  sourceScheduleId?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type BreedingInput = Omit<Breeding, 'id' | 'createdAt' | 'updatedAt'>;
export type BreedingSyncInput = BreedingInput & {
  createdAt?: string;
  updatedAt?: string;
};

const fileName = 'breedings.json';

function normalize(input: Partial<BreedingInput>): BreedingInput {
  return {
    cowEarTag: input.cowEarTag ?? '',
    cowName: input.cowName ?? '',
    heatDate: input.heatDate ?? '',
    estrusType: input.estrusType ?? '',
    breedingMethod: input.breedingMethod ?? '未選択',
    breedingStatus: input.breedingStatus ?? '発情予定',
    inseminationDate: input.inseminationDate ?? '',
    bullName: input.bullName ?? '',
    bullMasterId: input.bullMasterId,
    inseminatorName: input.inseminatorName ?? '',
    inseminatorMasterId: input.inseminatorMasterId,
    transferPlannedDate: input.transferPlannedDate ?? '',
    transferDate: input.transferDate ?? '',
    transferCancelReason: input.transferCancelReason ?? '',
    embryoNumber: input.embryoNumber ?? '',
    collectionDate: input.collectionDate ?? '',
    embryoType: input.embryoType ?? '未選択',
    donorCowName: input.donorCowName ?? '',
    donorCowEarTag: input.donorCowEarTag ?? '',
    embryoSireName: input.embryoSireName ?? '',
    embryoSireMasterId: input.embryoSireMasterId,
    embryoGrade: input.embryoGrade ?? '',
    strawNumber: input.strawNumber ?? '',
    supplierName: input.supplierName ?? '',
    supplierMasterId: input.supplierMasterId,
    transferTechnician: input.transferTechnician ?? '',
    transferTechnicianMasterId: input.transferTechnicianMasterId,
    nextHeatExpectedDate: input.nextHeatExpectedDate ?? '',
    pregnancyCheckExpectedDate: input.pregnancyCheckExpectedDate ?? '',
    pregnancyCheckDate: input.pregnancyCheckDate ?? '',
    pregnancyResult: input.pregnancyResult ?? '未鑑定',
    recheckExpectedDate: input.recheckExpectedDate ?? '',
    expectedCalvingDate: input.expectedCalvingDate ?? '',
    estrusSigns: Array.isArray(input.estrusSigns) ? input.estrusSigns : [],
    estrusSignsOther: input.estrusSignsOther ?? '',
    synchronizationProgramId: input.synchronizationProgramId,
    synchronizationProgramName: input.synchronizationProgramName,
    sourceScheduleId: input.sourceScheduleId,
    note: input.note ?? '',
  };
}

function validIsoDate(value?: string) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function normalizeStored(item: Breeding): Breeding {
  return {
    ...normalize(item),
    id: item.id,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function recordFromInput(
  id: string | number,
  input: BreedingSyncInput,
  existing?: Breeding,
): Breeding {
  const now = new Date().toISOString();
  return {
    ...normalize({ ...existing, ...input }),
    id,
    createdAt: validIsoDate(input.createdAt) ? input.createdAt! : existing?.createdAt ?? now,
    updatedAt: validIsoDate(input.updatedAt) ? input.updatedAt! : now,
  };
}

export async function listBreedings() {
  const data = await readJson<Breeding>(fileName);
  return data
    .map(normalizeStored)
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
}

export async function findBreeding(id: string | number) {
  const data = await readJson<Breeding>(fileName);
  const item = data.find((row) => String(row.id) === String(id));
  return item ? normalizeStored(item) : undefined;
}

export async function createBreeding(input: BreedingInput) {
  const data = await readJson<Breeding>(fileName);
  const now = new Date().toISOString();
  const numericIds = data.map((x) => Number(x.id)).filter(Number.isFinite);
  const id = numericIds.length === 0 ? 1 : Math.max(...numericIds) + 1;
  const item = recordFromInput(id, { ...input, createdAt: now, updatedAt: now });
  data.push(item);
  await writeJson(fileName, data);
  return item;
}

export async function updateBreeding(id: string | number, input: BreedingInput) {
  const data = await readJson<Breeding>(fileName);
  const index = data.findIndex((item) => String(item.id) === String(id));
  if (index === -1) return null;
  const existing = normalizeStored(data[index]);
  data[index] = recordFromInput(id, { ...input, createdAt: existing.createdAt }, existing);
  await writeJson(fileName, data);
  return normalizeStored(data[index]);
}

export async function syncBreeding(id: string | number, input: BreedingSyncInput) {
  if (String(id).trim() === '') throw new Error('INVALID_BREEDING_ID');
  const data = await readJson<Breeding[]>(fileName, []);
  const index = data.findIndex((item) => String(item.id) === String(id));
  const existing = index >= 0 ? normalizeStored(data[index]) : undefined;

  if (
    existing &&
    validIsoDate(input.updatedAt) &&
    validIsoDate(existing.updatedAt) &&
    input.updatedAt! < existing.updatedAt
  ) {
    throw new Error('BREEDING_SYNC_CONFLICT');
  }

  const item = recordFromInput(id, input, existing);
  if (index >= 0) data[index] = item;
  else data.push(item);
  await writeJson(fileName, data);
  return normalizeStored(item);
}

export async function deleteBreeding(id: string | number) {
  const data = await readJson<Breeding>(fileName);
  const next = data.filter((item) => String(item.id) !== String(id));
  if (next.length === data.length) return false;
  await writeJson(fileName, next);
  return true;
}
