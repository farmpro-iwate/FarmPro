import { readJson, writeJson } from './jsonStore';

export type Calf = {
  id: number; calfNumber: string; name: string; birthday: string; sex: string; motherName: string;
  startWeight: number; currentWeight: number; elapsedDays: number; milkAmount: number;
  starterAmount: number; note: string; createdAt: string; updatedAt: string;
};
export type CalfInput = {
  calfNumber: string; name: string; birthday: string; sex?: string; motherName?: string;
  startWeight?: number; currentWeight?: number; elapsedDays?: number; milkAmount?: number;
  starterAmount?: number; note?: string;
};
const fileName = 'calves.json';
export async function listCalves() { const data = await readJson<Calf>(fileName); return data.sort((a, b) => b.id - a.id); }
export async function findCalf(id: number) { const data = await readJson<Calf>(fileName); return data.find((item) => item.id === id); }
export async function createCalf(input: CalfInput) {
  const data = await readJson<Calf>(fileName);
  const now = new Date().toISOString();
  const item: Calf = { id: data.length === 0 ? 1 : Math.max(...data.map((x) => x.id)) + 1, calfNumber: input.calfNumber, name: input.name, birthday: input.birthday, sex: input.sex ?? '雌', motherName: input.motherName ?? '', startWeight: Number(input.startWeight ?? 0), currentWeight: Number(input.currentWeight ?? 0), elapsedDays: Number(input.elapsedDays ?? 0), milkAmount: Number(input.milkAmount ?? 0), starterAmount: Number(input.starterAmount ?? 0), note: input.note ?? '', createdAt: now, updatedAt: now };
  data.push(item); await writeJson(fileName, data); return item;
}
export async function updateCalf(id: number, input: CalfInput) {
  const data = await readJson<Calf>(fileName); const index = data.findIndex((item) => item.id === id);
  if (index === -1) return null;
  data[index] = { ...data[index], calfNumber: input.calfNumber, name: input.name, birthday: input.birthday, sex: input.sex ?? '雌', motherName: input.motherName ?? '', startWeight: Number(input.startWeight ?? 0), currentWeight: Number(input.currentWeight ?? 0), elapsedDays: Number(input.elapsedDays ?? 0), milkAmount: Number(input.milkAmount ?? 0), starterAmount: Number(input.starterAmount ?? 0), note: input.note ?? '', updatedAt: new Date().toISOString() };
  await writeJson(fileName, data); return data[index];
}
export async function deleteCalf(id: number) { const data = await readJson<Calf>(fileName); const next = data.filter((item) => item.id !== id); if (next.length === data.length) return false; await writeJson(fileName, next); return true; }
