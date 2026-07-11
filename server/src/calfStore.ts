import { readJson, writeJson } from './jsonStore';

export type CalfStatus = '販売予定' | '育成中' | '繁殖候補として留保' | '牛台帳へ移行済み' | '死亡・その他';
export type FeedingMethod = '人工哺育' | '母乳哺育' | '混合哺育';
export type WeaningStatus = '離乳前' | '離乳済み';

export type Calf = {
  id: number; calfNumber: string; identificationNumber: string; name: string; birthday: string; sex: string; motherName: string;
  startWeight: number; currentWeight: number; elapsedDays: number; milkAmount: number; starterAmount: number;
  feedingMethod: FeedingMethod; weaningPlannedDate: string; weaningDate: string; weaningStatus: WeaningStatus;
  weaningWeight: number; weaningStarterAmount: number; milkEndDate: string;
  managementStatus: CalfStatus; promotedCattleId?: number; promotedAt?: string;
  note: string; createdAt: string; updatedAt: string;
};

export type CalfInput = {
  calfNumber: string; identificationNumber?: string; name: string; birthday: string; sex?: string; motherName?: string;
  startWeight?: number; currentWeight?: number; elapsedDays?: number; milkAmount?: number; starterAmount?: number;
  feedingMethod?: FeedingMethod; weaningPlannedDate?: string; weaningDate?: string; weaningStatus?: WeaningStatus;
  weaningWeight?: number; weaningStarterAmount?: number; milkEndDate?: string;
  managementStatus?: CalfStatus; note?: string;
};

const fileName = 'calves.json';

function normalizeCalf(item: Calf): Calf {
  const weaningDate = item.weaningDate ?? '';
  return {
    ...item,
    feedingMethod: item.feedingMethod ?? '人工哺育',
    weaningPlannedDate: item.weaningPlannedDate ?? '',
    weaningDate,
    weaningStatus: item.weaningStatus ?? (weaningDate ? '離乳済み' : '離乳前'),
    weaningWeight: Number(item.weaningWeight ?? 0),
    weaningStarterAmount: Number(item.weaningStarterAmount ?? 0),
    milkEndDate: item.milkEndDate ?? ''
  };
}

export async function listCalves() {
  const data = await readJson<Calf>(fileName);
  return data.map(normalizeCalf).sort((a, b) => b.id - a.id);
}

export async function findCalf(id: number) {
  const data = await readJson<Calf>(fileName);
  const item = data.find((row) => row.id === id);
  return item ? normalizeCalf(item) : undefined;
}

export async function createCalf(input: CalfInput) {
  const data = await readJson<Calf>(fileName);
  const now = new Date().toISOString();
  const weaningDate = input.weaningDate ?? '';
  const item: Calf = {
    id: data.length === 0 ? 1 : Math.max(...data.map((x) => x.id)) + 1,
    calfNumber: input.calfNumber,
    identificationNumber: input.identificationNumber ?? '',
    name: input.name,
    birthday: input.birthday,
    sex: input.sex ?? '雌',
    motherName: input.motherName ?? '',
    startWeight: Number(input.startWeight ?? 0),
    currentWeight: Number(input.currentWeight ?? 0),
    elapsedDays: Number(input.elapsedDays ?? 0),
    milkAmount: Number(input.milkAmount ?? 0),
    starterAmount: Number(input.starterAmount ?? 0),
    feedingMethod: input.feedingMethod ?? '人工哺育',
    weaningPlannedDate: input.weaningPlannedDate ?? '',
    weaningDate,
    weaningStatus: input.weaningStatus ?? (weaningDate ? '離乳済み' : '離乳前'),
    weaningWeight: Number(input.weaningWeight ?? 0),
    weaningStarterAmount: Number(input.weaningStarterAmount ?? 0),
    milkEndDate: input.milkEndDate ?? '',
    managementStatus: input.managementStatus ?? '育成中',
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now
  };
  data.push(item);
  await writeJson(fileName, data);
  return item;
}

export async function updateCalf(id: number, input: CalfInput) {
  const data = await readJson<Calf>(fileName);
  const index = data.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const current = normalizeCalf(data[index]);
  const weaningDate = input.weaningDate ?? current.weaningDate;
  data[index] = {
    ...current,
    calfNumber: input.calfNumber,
    identificationNumber: input.identificationNumber ?? '',
    name: input.name,
    birthday: input.birthday,
    sex: input.sex ?? '雌',
    motherName: input.motherName ?? '',
    startWeight: Number(input.startWeight ?? 0),
    currentWeight: Number(input.currentWeight ?? 0),
    elapsedDays: Number(input.elapsedDays ?? 0),
    milkAmount: Number(input.milkAmount ?? 0),
    starterAmount: Number(input.starterAmount ?? 0),
    feedingMethod: input.feedingMethod ?? current.feedingMethod,
    weaningPlannedDate: input.weaningPlannedDate ?? '',
    weaningDate,
    weaningStatus: input.weaningStatus ?? (weaningDate ? '離乳済み' : '離乳前'),
    weaningWeight: Number(input.weaningWeight ?? 0),
    weaningStarterAmount: Number(input.weaningStarterAmount ?? 0),
    milkEndDate: input.milkEndDate ?? '',
    managementStatus: input.managementStatus ?? current.managementStatus,
    note: input.note ?? '',
    updatedAt: new Date().toISOString()
  };
  await writeJson(fileName, data);
  return normalizeCalf(data[index]);
}

export async function markCalfPromoted(id: number, cattleId: number) {
  const data = await readJson<Calf>(fileName);
  const index = data.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const now = new Date().toISOString();
  data[index] = { ...data[index], managementStatus: '牛台帳へ移行済み', promotedCattleId: cattleId, promotedAt: now, updatedAt: now };
  await writeJson(fileName, data);
  return normalizeCalf(data[index]);
}

export async function deleteCalf(id: number) {
  const data = await readJson<Calf>(fileName);
  const next = data.filter((item) => item.id !== id);
  if (next.length === data.length) return false;
  await writeJson(fileName, next);
  return true;
}
