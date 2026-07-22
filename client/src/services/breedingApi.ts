import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import type { Breeding, BreedingInput } from '../types/breeding';

type StoredBreeding = Breeding & StoredRecord & {
  id: string | number;
  recordKind?: 'standard';
};

function createRecordId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `breeding-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isStandardBreeding(record: StoredRecord): record is StoredBreeding {
  if (record.recordKind === 'standard') return true;

  return 'cowEarTag' in record || 'breedingMethod' in record;
}

export async function getBreedingList(): Promise<Breeding[]> {
  const records = await getAllRecords<StoredRecord>('breedings');
  return records.filter(isStandardBreeding);
}

export async function getBreeding(id: string | number): Promise<Breeding> {
  const record = await getRecordById<StoredRecord>('breedings', id);

  if (!record || !isStandardBreeding(record)) {
    throw new Error('指定された繁殖記録が見つかりません。');
  }

  return record;
}

export async function createBreeding(input: BreedingInput): Promise<Breeding> {
  const record: StoredBreeding = {
    ...input,
    id: createRecordId(),
    recordKind: 'standard',
  };

  return saveRecord('breedings', record);
}

export async function updateBreeding(
  id: string | number,
  input: BreedingInput,
): Promise<Breeding> {
  const existing = await getRecordById<StoredRecord>('breedings', id);

  if (!existing || !isStandardBreeding(existing)) {
    throw new Error('更新する繁殖記録が見つかりません。');
  }

  return saveRecord('breedings', {
    ...existing,
    ...input,
    id,
    recordKind: 'standard',
    createdAt: existing.createdAt,
  } as StoredBreeding);
}

export async function deleteBreeding(id: string | number): Promise<void> {
  const existing = await getRecordById<StoredRecord>('breedings', id);

  if (!existing || !isStandardBreeding(existing)) {
    throw new Error('削除する繁殖記録が見つかりません。');
  }

  await deleteRecord('breedings', id);
}
