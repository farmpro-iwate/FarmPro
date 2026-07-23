import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import { BlvTest, BlvTestInput } from '../types/blv';

const STORE_NAME = 'blvTests' as const;

export async function getBlvTestList(): Promise<BlvTest[]> {
  const records = await getAllRecords<BlvTest>(STORE_NAME);
  return records.sort((a, b) => b.testDate.localeCompare(a.testDate));
}

export async function getBlvTest(id: string | number): Promise<BlvTest> {
  const record = await getRecordById<BlvTest>(STORE_NAME, Number(id));

  if (!record) {
    throw new Error('指定されたBLV検査記録が見つかりません。');
  }

  return record;
}

export async function createBlvTest(input: BlvTestInput): Promise<BlvTest> {
  const now = new Date().toISOString();

  return saveRecord<BlvTest>(STORE_NAME, {
    ...input,
    id: Date.now(),
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateBlvTest(
  id: string | number,
  input: BlvTestInput,
): Promise<BlvTest> {
  const current = await getBlvTest(id);

  return saveRecord<BlvTest>(STORE_NAME, {
    ...current,
    ...input,
    id: Number(id),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteBlvTest(id: number): Promise<void> {
  await deleteRecord(STORE_NAME, id);
}
