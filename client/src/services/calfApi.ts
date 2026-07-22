import { Calf, CalfInput } from '../types/calf';
import { Cattle } from '../types/cattle';
import { createCattle } from './api';
import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import type { StoredRecord } from '../storage/types';

type StoredCalf = Calf & StoredRecord;

function normalizeInput(input: CalfInput): CalfInput {
  return {
    ...input,
    calfNumber: input.calfNumber.trim(),
    identificationNumber: input.identificationNumber.trim(),
    name: input.name.trim(),
    motherName: input.motherName.trim(),
    note: input.note.trim(),
  };
}

async function validateCalfUniqueness(input: CalfInput, currentId?: number) {
  const calves = await getAllRecords<StoredCalf>('calves');

  const duplicateEarTag = calves.find(
    (item) => item.id !== currentId && item.calfNumber.trim() === input.calfNumber,
  );
  if (duplicateEarTag) {
    throw new Error(`耳標番号「${input.calfNumber}」はすでに子牛台帳へ登録されています。`);
  }

  if (input.identificationNumber) {
    const duplicateIdentificationNumber = calves.find(
      (item) =>
        item.id !== currentId &&
        (item.identificationNumber ?? '').trim() === input.identificationNumber,
    );
    if (duplicateIdentificationNumber) {
      throw new Error(
        `個体識別番号「${input.identificationNumber}」はすでに子牛台帳へ登録されています。`,
      );
    }
  }
}

export async function getCalfList() {
  return getAllRecords<StoredCalf>('calves');
}

export async function getCalf(id: string) {
  const calf = await getRecordById<StoredCalf>('calves', Number(id));
  if (!calf) throw new Error('指定された子牛が見つかりません。');
  return calf;
}

export async function createCalf(input: CalfInput) {
  const normalized = normalizeInput(input);
  await validateCalfUniqueness(normalized);

  const calves = await getAllRecords<StoredCalf>('calves');
  const nextId = calves.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  return saveRecord<StoredCalf>('calves', { id: nextId, ...normalized });
}

export async function updateCalf(id: string, input: CalfInput) {
  const numericId = Number(id);
  const existing = await getRecordById<StoredCalf>('calves', numericId);
  if (!existing) throw new Error('更新対象の子牛が見つかりません。');

  const normalized = normalizeInput(input);
  await validateCalfUniqueness(normalized, numericId);
  return saveRecord<StoredCalf>('calves', {
    ...existing,
    ...normalized,
    id: numericId,
  });
}

export async function promoteCalf(id: string): Promise<Cattle> {
  const calf = await getCalf(id);
  if (calf.promotedCattleId) {
    throw new Error('この子牛はすでに牛台帳へ移行済みです。');
  }

  const cattle = await createCattle({
    earTag: calf.calfNumber,
    identificationNumber: calf.identificationNumber ?? '',
    name: calf.name,
    birthday: calf.birthday,
    sire: '',
    dam: calf.motherName,
    parity: 0,
    blvStatus: '未検査',
    stage: '育成牛',
    note: calf.note,
  });

  await saveRecord<StoredCalf>('calves', {
    ...calf,
    managementStatus: '牛台帳へ移行済み',
    promotedCattleId: cattle.id,
    promotedAt: new Date().toISOString(),
  });

  return cattle;
}

export async function deleteCalf(id: number) {
  await deleteRecord('calves', id);
}
