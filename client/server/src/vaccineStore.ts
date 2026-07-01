import { readJson, writeJson } from './jsonStore';

export type Vaccine = {
  id: number;
  targetType: string;
  targetNumber: string;
  targetName: string;
  vaccineName: string;
  vaccinationDate: string;
  nextDueDate: string;
  status: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type VaccineInput = {
  targetType: string;
  targetNumber: string;
  targetName: string;
  vaccineName: string;
  vaccinationDate?: string;
  nextDueDate?: string;
  status?: string;
  note?: string;
};

const fileName = 'vaccines.json';

export async function listVaccines() {
  const vaccines = await readJson<Vaccine>(fileName);
  return vaccines.sort((a, b) => b.id - a.id);
}

export async function findVaccine(id: number) {
  const vaccines = await readJson<Vaccine>(fileName);
  return vaccines.find((vaccine) => vaccine.id === id);
}

export async function createVaccine(input: VaccineInput) {
  const vaccines = await readJson<Vaccine>(fileName);
  const now = new Date().toISOString();
  const nextId = vaccines.length === 0 ? 1 : Math.max(...vaccines.map((vaccine) => vaccine.id)) + 1;
  const vaccine: Vaccine = {
    id: nextId,
    targetType: input.targetType,
    targetNumber: input.targetNumber,
    targetName: input.targetName,
    vaccineName: input.vaccineName,
    vaccinationDate: input.vaccinationDate ?? '',
    nextDueDate: input.nextDueDate ?? '',
    status: input.status ?? '未接種',
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now
  };
  vaccines.push(vaccine);
  await writeJson(fileName, vaccines);
  return vaccine;
}

export async function updateVaccine(id: number, input: VaccineInput) {
  const vaccines = await readJson<Vaccine>(fileName);
  const index = vaccines.findIndex((vaccine) => vaccine.id === id);
  if (index === -1) return null;
  vaccines[index] = {
    ...vaccines[index],
    targetType: input.targetType,
    targetNumber: input.targetNumber,
    targetName: input.targetName,
    vaccineName: input.vaccineName,
    vaccinationDate: input.vaccinationDate ?? '',
    nextDueDate: input.nextDueDate ?? '',
    status: input.status ?? '未接種',
    note: input.note ?? '',
    updatedAt: new Date().toISOString()
  };
  await writeJson(fileName, vaccines);
  return vaccines[index];
}

export async function deleteVaccine(id: number) {
  const vaccines = await readJson<Vaccine>(fileName);
  const next = vaccines.filter((vaccine) => vaccine.id !== id);
  if (next.length === vaccines.length) return false;
  await writeJson(fileName, next);
  return true;
}
