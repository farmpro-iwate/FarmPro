import { readJson, writeJson } from './jsonStore';

export type Treatment = {
  id: number;
  targetNumber: string;
  targetName: string;
  symptom: string;
  diagnosis: string;
  treatmentDate: string;
  medicine: string;
  dosage: string;
  withdrawalEndDate: string;
  veterinarian: string;
  progress: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type TreatmentInput = {
  targetNumber: string;
  targetName: string;
  symptom: string;
  diagnosis?: string;
  treatmentDate: string;
  medicine?: string;
  dosage?: string;
  withdrawalEndDate?: string;
  veterinarian?: string;
  progress?: string;
  note?: string;
};

const fileName = 'treatments.json';

export async function listTreatments() {
  const treatments = await readJson<Treatment>(fileName);
  return treatments.sort((a, b) => b.treatmentDate.localeCompare(a.treatmentDate));
}

export async function findTreatment(id: number) {
  const treatments = await readJson<Treatment>(fileName);
  return treatments.find((treatment) => treatment.id === id);
}

export async function createTreatment(input: TreatmentInput) {
  const treatments = await readJson<Treatment>(fileName);
  const now = new Date().toISOString();
  const nextId = treatments.length === 0 ? 1 : Math.max(...treatments.map((treatment) => treatment.id)) + 1;

  const treatment: Treatment = {
    id: nextId,
    targetNumber: input.targetNumber,
    targetName: input.targetName,
    symptom: input.symptom,
    diagnosis: input.diagnosis ?? '',
    treatmentDate: input.treatmentDate,
    medicine: input.medicine ?? '',
    dosage: input.dosage ?? '',
    withdrawalEndDate: input.withdrawalEndDate ?? '',
    veterinarian: input.veterinarian ?? '',
    progress: input.progress ?? '治療中',
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now
  };

  treatments.push(treatment);
  await writeJson(fileName, treatments);
  return treatment;
}

export async function updateTreatment(id: number, input: TreatmentInput) {
  const treatments = await readJson<Treatment>(fileName);
  const index = treatments.findIndex((treatment) => treatment.id === id);
  if (index === -1) return null;

  treatments[index] = {
    ...treatments[index],
    targetNumber: input.targetNumber,
    targetName: input.targetName,
    symptom: input.symptom,
    diagnosis: input.diagnosis ?? '',
    treatmentDate: input.treatmentDate,
    medicine: input.medicine ?? '',
    dosage: input.dosage ?? '',
    withdrawalEndDate: input.withdrawalEndDate ?? '',
    veterinarian: input.veterinarian ?? '',
    progress: input.progress ?? '治療中',
    note: input.note ?? '',
    updatedAt: new Date().toISOString()
  };

  await writeJson(fileName, treatments);
  return treatments[index];
}

export async function deleteTreatment(id: number) {
  const treatments = await readJson<Treatment>(fileName);
  const next = treatments.filter((treatment) => treatment.id !== id);
  if (next.length === treatments.length) return false;
  await writeJson(fileName, next);
  return true;
}
