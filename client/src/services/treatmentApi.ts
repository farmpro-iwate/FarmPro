import {
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import { Treatment, TreatmentInput } from '../types/treatment';
import { openFarmProDatabase } from '../storage/db';
import { deleteTreatmentWithMedicineSource } from './treatmentInventoryLink';

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
  const db = await openFarmProDatabase();
  const now = new Date().toISOString();

  // Use an atomic read/write transaction and add() rather than put(): two
  // records created within the same millisecond must never overwrite a cow's
  // existing treatment history.
  return new Promise<Treatment>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let saved: Treatment | undefined;
    tx.oncomplete = () => saved
      ? resolve(saved)
      : reject(new Error('治療記録を保存できませんでした。'));
    tx.onabort = () => reject(tx.error ?? new Error('治療記録を保存できませんでした。'));
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      const largestId = (keys.result as IDBValidKey[]).reduce<number>(
        (maxId, key) => typeof key === 'number' && Number.isSafeInteger(key)
          ? Math.max(maxId, key)
          : maxId,
        0,
      );
      const id = Math.max(Date.now(), largestId + 1);
      if (!Number.isSafeInteger(id)) {
        tx.abort();
        return;
      }
      saved = { ...input, id, createdAt: now, updatedAt: now };
      store.add(saved);
    };
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
  await deleteTreatmentWithMedicineSource(id);
}
