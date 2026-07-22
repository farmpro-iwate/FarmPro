import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import type { StoredRecord } from '../storage/types';

export type BreedingAdvancedRecord = {
  id?: string;
  cowId?: string;
  cowName?: string;
  breedingType?: string;
  serviceDate?: string;
  expectedCalvingDate?: string;
  pregnancyCheckDate?: string;
  pregnancyCheckActualDate?: string;
  pregnancyResult?: string;
  status?: string;
  sireName?: string;
  sireMasterId?: number;
  semenNo?: string;
  inseminatorName?: string;
  inseminatorMasterId?: number;
  matingStartDate?: string;
  matingEndDate?: string;
  donorCowId?: string;
  donorCowName?: string;
  embryoNo?: string;
  embryoType?: string;
  embryoRank?: string;
  supplierName?: string;
  supplierMasterId?: number;
  transferOperatorName?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
};

type StoredBreedingAdvancedRecord = BreedingAdvancedRecord & StoredRecord & {
  id: string;
  recordKind?: 'advanced';
};

function createRecordId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `breeding-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isAdvancedBreeding(
  record: StoredRecord,
): record is StoredBreedingAdvancedRecord {
  if (record.recordKind === 'advanced') return true;
  if (record.recordKind === 'standard') return false;

  return 'breedingType' in record || 'serviceDate' in record;
}

export async function fetchBreedingAdvancedRecords(): Promise<BreedingAdvancedRecord[]> {
  const records = await getAllRecords<StoredRecord>('breedings');
  return records.filter(isAdvancedBreeding);
}

export async function fetchBreedingAdvancedRecord(
  id: string,
): Promise<BreedingAdvancedRecord> {
  const record = await getRecordById<StoredRecord>('breedings', id);

  if (!record || !isAdvancedBreeding(record)) {
    throw new Error('指定された繁殖記録が見つかりません。');
  }

  return record;
}

export async function createBreedingAdvancedRecord(
  record: BreedingAdvancedRecord,
): Promise<BreedingAdvancedRecord> {
  const savedRecord: StoredBreedingAdvancedRecord = {
    ...record,
    id: record.id || createRecordId(),
    recordKind: 'advanced',
  };

  return saveRecord('breedings', savedRecord);
}

export async function updateBreedingAdvancedRecord(
  id: string,
  record: BreedingAdvancedRecord,
): Promise<BreedingAdvancedRecord> {
  const existing = await getRecordById<StoredRecord>('breedings', id);

  if (!existing || !isAdvancedBreeding(existing)) {
    throw new Error('更新する繁殖記録が見つかりません。');
  }

  return saveRecord('breedings', {
    ...existing,
    ...record,
    id,
    recordKind: 'advanced',
    createdAt: existing.createdAt,
  } as StoredBreedingAdvancedRecord);
}

export async function deleteBreedingAdvancedRecord(id: string): Promise<void> {
  const existing = await getRecordById<StoredRecord>('breedings', id);

  if (!existing || !isAdvancedBreeding(existing)) {
    throw new Error('削除する繁殖記録が見つかりません。');
  }

  await deleteRecord('breedings', id);
}
