import { readJson, writeJson } from './jsonStore';

export type Breeding = {
  id: number; cowEarTag: string; cowName: string; heatDate: string; inseminationDate: string;
  bullName: string; pregnancyCheckDate: string; pregnancyResult: string; expectedCalvingDate: string;
  note: string; createdAt: string; updatedAt: string;
};
export type BreedingInput = {
  cowEarTag: string; cowName: string; heatDate?: string; inseminationDate: string; bullName?: string;
  pregnancyCheckDate?: string; pregnancyResult?: string; expectedCalvingDate?: string; note?: string;
};
const fileName = 'breedings.json';
export async function listBreedings() { const data = await readJson<Breeding>(fileName); return data.sort((a, b) => b.id - a.id); }
export async function findBreeding(id: number) { const data = await readJson<Breeding>(fileName); return data.find((item) => item.id === id); }
export async function createBreeding(input: BreedingInput) {
  const data = await readJson<Breeding>(fileName); const now = new Date().toISOString();
  const item: Breeding = { id: data.length === 0 ? 1 : Math.max(...data.map((x) => x.id)) + 1, cowEarTag: input.cowEarTag, cowName: input.cowName, heatDate: input.heatDate ?? '', inseminationDate: input.inseminationDate, bullName: input.bullName ?? '', pregnancyCheckDate: input.pregnancyCheckDate ?? '', pregnancyResult: input.pregnancyResult ?? '未鑑定', expectedCalvingDate: input.expectedCalvingDate ?? '', note: input.note ?? '', createdAt: now, updatedAt: now };
  data.push(item); await writeJson(fileName, data); return item;
}
export async function updateBreeding(id: number, input: BreedingInput) {
  const data = await readJson<Breeding>(fileName); const index = data.findIndex((item) => item.id === id);
  if (index === -1) return null;
  data[index] = { ...data[index], cowEarTag: input.cowEarTag, cowName: input.cowName, heatDate: input.heatDate ?? '', inseminationDate: input.inseminationDate, bullName: input.bullName ?? '', pregnancyCheckDate: input.pregnancyCheckDate ?? '', pregnancyResult: input.pregnancyResult ?? '未鑑定', expectedCalvingDate: input.expectedCalvingDate ?? '', note: input.note ?? '', updatedAt: new Date().toISOString() };
  await writeJson(fileName, data); return data[index];
}
export async function deleteBreeding(id: number) { const data = await readJson<Breeding>(fileName); const next = data.filter((item) => item.id !== id); if (next.length === data.length) return false; await writeJson(fileName, next); return true; }
