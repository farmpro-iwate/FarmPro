import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import { Vaccine, VaccineInput } from '../types/vaccine';

const STORE_NAME = 'vaccines' as const;

export async function getVaccineList(): Promise<Vaccine[]> {
  const records = await getAllRecords<Vaccine>(STORE_NAME);
  return records.sort((a, b) =>
    b.vaccinationDate.localeCompare(a.vaccinationDate),
  );
}

export async function getVaccine(id: string | number): Promise<Vaccine> {
  const record = await getRecordById<Vaccine>(STORE_NAME, Number(id));

  if (!record) {
    throw new Error('指定されたワクチン記録が見つかりません。');
  }

  return record;
}

export async function createVaccine(input: VaccineInput): Promise<Vaccine> {
  const now = new Date().toISOString();

  return saveRecord<Vaccine>(STORE_NAME, {
    ...input,
    id: Date.now(),
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateVaccine(
  id: string | number,
  input: VaccineInput,
): Promise<Vaccine> {
  const current = await getVaccine(id);

  return saveRecord<Vaccine>(STORE_NAME, {
    ...current,
    ...input,
    id: Number(id),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteVaccine(id: number): Promise<void> {
  await deleteRecord(STORE_NAME, id);
}
