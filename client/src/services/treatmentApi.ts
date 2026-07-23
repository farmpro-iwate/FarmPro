import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import { Treatment, TreatmentInput } from '../types/treatment';

const STORE_NAME = 'treatments' as const;

export async function getTreatmentList(): Promise<Treatment[]> {
  const records = await getAllRecords<Treatment>(STORE_NAME);
  return records.sort((a, b) => b.treatmentDate.localeCompare(a.treatmentDate));
}

export async function getTreatment(id: string | number): Promise<Treatment> {
  const record = await getRecordById<Treatment>(STORE_NAME, Number(id));

  if (!record) {
    throw new Error('指定された治療記録が見つかりません。');
  }

  return record;
}

export async function createTreatment(
  input: TreatmentInput,
): Promise<Treatment> {
  const now = new Date().toISOString();

  return saveRecord<Treatment>(STORE_NAME, {
    ...input,
    id: Date.now(),
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateTreatment(
  id: string | number,
  input: TreatmentInput,
): Promise<Treatment> {
  const current = await getTreatment(id);

  return saveRecord<Treatment>(STORE_NAME, {
    ...current,
    ...input,
    id: Number(id),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteTreatment(id: number): Promise<void> {
  await deleteRecord(STORE_NAME, id);
}
