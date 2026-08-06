import { deleteRecord, getAllRecords, saveRecord } from '../storage/repository';

export type FatteningTransitionStatus = '肥育中' | '出荷準備' | '出荷済み';

export type FatteningTransitionRecord = {
  id: string;
  targetNumber: string;
  targetName: string;
  startDate: string;
  transitionReason: string;
  startWeight: string;
  targetWeight: string;
  targetShippingDate: string;
  housingLocation: string;
  withdrawalEndDate: string;
  status: FatteningTransitionStatus;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

export type FatteningTransitionInput = Omit<
  FatteningTransitionRecord,
  'id' | 'createdAt' | 'updatedAt'
>;

export const emptyFatteningTransitionInput: FatteningTransitionInput = {
  targetNumber: '',
  targetName: '',
  startDate: '',
  transitionReason: '繁殖終了',
  startWeight: '',
  targetWeight: '',
  targetShippingDate: '',
  housingLocation: '',
  withdrawalEndDate: '',
  status: '肥育中',
  memo: '',
};

export async function getFatteningTransitions(): Promise<FatteningTransitionRecord[]> {
  const records = await getAllRecords<FatteningTransitionRecord>('fatteningTransitions');
  return records.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export async function getActiveFatteningTransition(
  targetNumber: string,
): Promise<FatteningTransitionRecord | undefined> {
  const normalizedTargetNumber = targetNumber.trim();
  if (!normalizedTargetNumber) return undefined;

  const records = await getFatteningTransitions();
  return records.find(
    (record) =>
      record.targetNumber.trim() === normalizedTargetNumber &&
      record.status !== '出荷済み',
  );
}

export async function createFatteningTransition(
  input: FatteningTransitionInput,
): Promise<FatteningTransitionRecord> {
  const existing = await getActiveFatteningTransition(input.targetNumber);
  if (existing) {
    throw new Error(
      `${existing.targetName || input.targetName}（耳標${input.targetNumber}）は、すでに「${existing.status}」で登録されています。`,
    );
  }

  const now = new Date().toISOString();

  return saveRecord<FatteningTransitionRecord>('fatteningTransitions', {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  });
}

export async function deleteFatteningTransition(id: string): Promise<void> {
  await deleteRecord('fatteningTransitions', id);
}
