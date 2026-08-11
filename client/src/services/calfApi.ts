import { Calf, CalfInput } from '../types/calf';
import { Cattle, CattleSex } from '../types/cattle';
import { createCattle } from './api';
import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import type { StoredRecord } from '../storage/types';

type StoredCalf = Calf & StoredRecord;

function text(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeInput(input: CalfInput): CalfInput {
  return {
    ...input,
    calfNumber: text(input.calfNumber),
    identificationNumber: text(input.identificationNumber),
    name: text(input.name),
    motherName: text(input.motherName),
    note: text(input.note),
  };
}

function normalizeCattleSex(sex?: string): CattleSex {
  if (sex === '雄' || sex === 'オス') return '雄';
  if (sex === '去勢') return '去勢';
  return '雌';
}

async function validateCalfUniqueness(input: CalfInput, currentId?: number) {
  const calves = await getAllRecords<StoredCalf>('calves');

  const duplicateEarTag = calves.find(
    (item) => item.id !== currentId && text(item.calfNumber) === input.calfNumber,
  );
  if (duplicateEarTag) {
    throw new Error(`耳標番号「${input.calfNumber}」はすでに子牛台帳へ登録されています。`);
  }

  if (input.identificationNumber) {
    const duplicateIdentificationNumber = calves.find(
      (item) =>
        item.id !== currentId &&
        text(item.identificationNumber) === input.identificationNumber,
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

export async function registerCalfEarTag(id: string, earTag: string): Promise<Calf> {
  const numericId = Number(id);
  const existing = await getRecordById<StoredCalf>('calves', numericId);
  if (!existing) throw new Error('更新対象の子牛が見つかりません。');

  const normalizedEarTag = text(earTag);
  if (!normalizedEarTag) throw new Error('正式な耳標番号を入力してください。');
  if (normalizedEarTag.startsWith('TEMP-')) throw new Error('仮管理番号ではなく、正式な耳標番号を入力してください。');

  const calves = await getAllRecords<StoredCalf>('calves');
  const duplicateEarTag = calves.find(
    (item) => item.id !== numericId && text(item.calfNumber) === normalizedEarTag,
  );
  if (duplicateEarTag) {
    throw new Error(`耳標番号「${normalizedEarTag}」はすでに子牛台帳へ登録されています。`);
  }

  const existingCalfNumber = text(existing.calfNumber);
  const temporaryCalfNumber = existing.temporaryCalfNumber || (existingCalfNumber.startsWith('TEMP-') ? existingCalfNumber : undefined);
  const updated = await saveRecord<StoredCalf>('calves', {
    ...existing,
    calfNumber: normalizedEarTag,
    temporaryCalfNumber,
    id: numericId,
    updatedAt: new Date().toISOString(),
  });
  return updated;
}

export async function registerCalfName(id: string, name: string): Promise<Calf> {
  const numericId = Number(id);
  const existing = await getRecordById<StoredCalf>('calves', numericId);
  if (!existing) throw new Error('更新対象の子牛が見つかりません。');

  const normalizedName = text(name);
  if (!normalizedName) throw new Error('名号を入力してください。');

  return saveRecord<StoredCalf>('calves', {
    ...existing,
    name: normalizedName,
    id: numericId,
    updatedAt: new Date().toISOString(),
  });
}

export async function promoteCalf(id: string): Promise<Cattle> {
  const calf = await getCalf(id);
  if (calf.promotedCattleId) {
    throw new Error('この子牛はすでに個体カルテへ移行済みです。');
  }
  const calfNumber = text(calf.calfNumber);
  if (!calfNumber || calfNumber.startsWith('TEMP-')) {
    throw new Error('個体カルテへ移行する前に、正式な耳標番号を登録してください。');
  }

  const cattle = await createCattle({
    earTag: calfNumber,
    identificationNumber: text(calf.identificationNumber),
    name: text(calf.name),
    birthday: calf.birthday,
    sex: normalizeCattleSex(calf.sex),
    sire: text(calf.sireName),
    dam: text(calf.geneticMotherCowName || calf.motherName),
    parity: 0,
    blvStatus: '未検査',
    stage: '育成牛',
    sourceCalfId: calf.id,
    note: text(calf.note),
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
