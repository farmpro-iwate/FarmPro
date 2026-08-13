import { Cattle, CattleInput } from '../types/cattle';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { canRegisterBreedingFemale, getFarmProPlan } from '../plans/policy';
import { deleteRecord, getAllRecords, getRecordById, saveRecord } from '../storage/repository';
import type { StoredRecord } from '../storage/types';


type StoredCattle = Cattle & StoredRecord;

function normalizeInput(input: CattleInput): CattleInput {
  return {
    ...input,
    earTag: input.earTag.trim(),
    identificationNumber: input.identificationNumber.trim(),
    name: input.name.trim(),
  };
}

function isBreedingFemale(cattle: Pick<CattleInput, 'sex'>): boolean {
  return cattle.sex === '雌';
}

async function validateCattleUniqueness(input: CattleInput, currentId?: number) {
  const cattle = await getAllRecords<StoredCattle>('cattle');
  const duplicateEarTag = cattle.find(
    (item) => item.id !== currentId && item.earTag.trim() === input.earTag,
  );
  if (duplicateEarTag) {
    throw new Error(`耳標番号「${input.earTag}」はすでに登録されています。`);
  }

  if (input.identificationNumber) {
    const duplicateIdentificationNumber = cattle.find(
      (item) =>
        item.id !== currentId &&
        (item.identificationNumber ?? '').trim() === input.identificationNumber,
    );
    if (duplicateIdentificationNumber) {
      throw new Error(`個体識別番号「${input.identificationNumber}」はすでに登録されています。`);
    }
  }
}

async function validateCattlePlanLimit(input: CattleInput) {
  if (!isBreedingFemale(input)) return;

  const cattle = await getAllRecords<StoredCattle>('cattle');
  const breedingFemaleCount = cattle.filter(isBreedingFemale).length;
  const planId = getCurrentFarmProPlanId();

  if (!canRegisterBreedingFemale(planId, breedingFemaleCount)) {
    const plan = getFarmProPlan(planId);
    throw new Error(
      `${plan.label}プランでは繁殖雌牛を${plan.maxBreedingFemales}頭まで登録できます。上位プランへ変更してください。`,
    );
  }
}

export async function getCattleList() {
  return getAllRecords<StoredCattle>('cattle');
}

export async function getCattle(id: string) {
  const cattle = await getRecordById<StoredCattle>('cattle', Number(id));
  if (!cattle) throw new Error('指定された牛が見つかりません。');
  return cattle;
}

export async function createCattle(input: CattleInput) {
  const normalized = normalizeInput(input);
  await validateCattleUniqueness(normalized);
  await validateCattlePlanLimit(normalized);

  const cattle = await getAllRecords<StoredCattle>('cattle');
  const nextId = cattle.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  return saveRecord<StoredCattle>('cattle', { id: nextId, ...normalized });
}

export async function updateCattle(id: string, input: CattleInput) {
  const numericId = Number(id);
  const existing = await getRecordById<StoredCattle>('cattle', numericId);
  if (!existing) throw new Error('更新対象の牛が見つかりません。');

  const normalized = normalizeInput(input);
  await validateCattleUniqueness(normalized, numericId);
  return saveRecord<StoredCattle>('cattle', { ...existing, ...normalized, id: numericId });
}

export async function deleteCattle(id: number) {
  await deleteRecord('cattle', id);
}
