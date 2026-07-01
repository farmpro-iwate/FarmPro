import fs from 'node:fs/promises';
import path from 'node:path';

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

const dataFile = path.resolve(process.cwd(), 'src', 'data', 'vaccines.json');

async function readVaccines(): Promise<Vaccine[]> {
  const raw = await fs.readFile(dataFile, 'utf-8');
  return JSON.parse(raw) as Vaccine[];
}

async function writeVaccines(vaccines: Vaccine[]) {
  await fs.writeFile(dataFile, JSON.stringify(vaccines, null, 2), 'utf-8');
}

export async function listVaccines() {
  const vaccines = await readVaccines();
  return vaccines.sort((a, b) => b.id - a.id);
}

export async function findVaccine(id: number) {
  const vaccines = await readVaccines();
  return vaccines.find((vaccine) => vaccine.id === id);
}

export async function createVaccine(input: VaccineInput) {
  const vaccines = await readVaccines();
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
  await writeVaccines(vaccines);
  return vaccine;
}

export async function updateVaccine(id: number, input: VaccineInput) {
  const vaccines = await readVaccines();
  const index = vaccines.findIndex((vaccine) => vaccine.id === id);
  if (index === -1) return null;

  const updated: Vaccine = {
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

  vaccines[index] = updated;
  await writeVaccines(vaccines);
  return updated;
}

export async function deleteVaccine(id: number) {
  const vaccines = await readVaccines();
  const next = vaccines.filter((vaccine) => vaccine.id !== id);
  if (next.length === vaccines.length) return false;
  await writeVaccines(next);
  return true;
}
