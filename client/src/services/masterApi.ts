import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import { Master, MasterCategory, MasterInput } from '../types/master';

const STORE_NAME = 'masters' as const;

export async function getMasterList(
  category?: MasterCategory,
): Promise<Master[]> {
  const masters = await getAllRecords<Master>(STORE_NAME);

  return masters
    .filter((master) => !category || master.category === category)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export async function getMaster(id: number): Promise<Master> {
  const master = await getRecordById<Master>(STORE_NAME, id);

  if (!master) {
    throw new Error('指定されたマスターが見つかりません。');
  }

  return master;
}

export async function checkMasterDuplicate(
  category: MasterCategory,
  name: string,
): Promise<boolean> {
  const normalizedName = name.trim().toLocaleLowerCase();
  const masters = await getAllRecords<Master>(STORE_NAME);

  return masters.some(
    (master) =>
      master.category === category &&
      master.name.trim().toLocaleLowerCase() === normalizedName,
  );
}

export async function createMaster(input: MasterInput): Promise<Master> {
  const now = new Date().toISOString();

  const master: Master = {
    ...input,
    id: Date.now(),
    name: input.name.trim(),
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  return saveRecord<Master>(STORE_NAME, master);
}

export async function updateMaster(
  id: number,
  input: MasterInput,
): Promise<Master> {
  const current = await getMaster(id);

  const updated: Master = {
    ...current,
    ...input,
    id,
    name: input.name.trim(),
    updatedAt: new Date().toISOString(),
  };

  return saveRecord<Master>(STORE_NAME, updated);
}

export async function deleteMaster(id: number): Promise<void> {
  await deleteRecord(STORE_NAME, id);
}
