import { readJson, writeJson } from './jsonStore';

export type CalfStatus = '販売予定' | '育成中' | '繁殖候補として留保' | '牛台帳へ移行済み' | '死亡・その他';

export type Calf = {
  id: number; calfNumber: string; identificationNumber: string; name: string; birthday: string; sex: string; motherName: string;
  startWeight: number; currentWeight: number; elapsedDays: number; milkAmount: number;
  starterAmount: number; managementStatus: CalfStatus; promotedCattleId?: number; promotedAt?: string;
  note: string; createdAt: string; updatedAt: string;
};
export type CalfInput = {
  calfNumber: string; identificationNumber?: string; name: string; birthday: string; sex?: string; motherName?: string;
  startWeight?: number; currentWeight?: number; elapsedDays?: number; milkAmount?: number;
  starterAmount?: number; managementStatus?: CalfStatus; note?: string;
};
const fileName = 'calves.json';
export async function listCalves() { const data = await readJson<Calf>(fileName); return data.sort((a, b) => b.id - a.id); }
export async function findCalf(id: number) { const data = await readJson<Calf>(fileName); return data.find((item) => item.id === id); }
export async function createCalf(input: CalfInput) {
  const data = await readJson<Calf>(fileName);
  const now = new Date().toISOString();
  const item: Calf = { id: data.length === 0 ? 1 : Math.max(...data.map((x) => x.id)) + 1, calfNumber: input.calfNumber, identificationNumber: input.identificationNumber ?? '', name: input.name, birthday: input.birthday, sex: input.sex ?? '雌', motherName: input.motherName ?? '', startWeight: Number(input.startWeight ?? 0), currentWeight: Number(input.currentWeight ?? 0), elapsedDays: Number(input.elapsedDays ?? 0), milkAmount: Number(input.milkAmount ?? 0), starterAmount: Number(input.starterAmount ?? 0), managementStatus: input.managementStatus ?? '育成中', note: input.note ?? '', createdAt: now, updatedAt: now };
  data.push(item); await writeJson(fileName, data); return item;
}
export async function updateCalf(id: number, input: CalfInput) {
  const data = await readJson<Calf>(fileName); const index = data.findIndex((item) => item.id === id);
  if (index === -1) return null;
  data[index] = { ...data[index], calfNumber: input.calfNumber, identificationNumber: input.identificationNumber ?? '', name: input.name, birthday: input.birthday, sex: input.sex ?? '雌', motherName: input.motherName ?? '', startWeight: Number(input.startWeight ?? 0), currentWeight: Number(input.currentWeight ?? 0), elapsedDays: Number(input.elapsedDays ?? 0), milkAmount: Number(input.milkAmount ?? 0), starterAmount: Number(input.starterAmount ?? 0), managementStatus: input.managementStatus ?? data[index].managementStatus ?? '育成中', note: input.note ?? '', updatedAt: new Date().toISOString() };
  await writeJson(fileName, data); return data[index];
}
export async function markCalfPromoted(id: number, cattleId: number) {
  const data = await readJson<Calf>(fileName); const index = data.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const now = new Date().toISOString();
  data[index] = { ...data[index], managementStatus: '牛台帳へ移行済み', promotedCattleId: cattleId, promotedAt: now, updatedAt: now };
  await writeJson(fileName, data); return data[index];
}
export async function deleteCalf(id: number) { const data = await readJson<Calf>(fileName); const next = data.filter((item) => item.id !== id); if (next.length === data.length) return false; await writeJson(fileName, next); return true; }