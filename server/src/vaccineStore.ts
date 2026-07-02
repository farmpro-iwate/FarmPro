import { readJson, writeJson } from './jsonStore';

export type Vaccine = {
  id: number; targetType: string; targetNumber: string; targetName: string; vaccineName: string;
  vaccinationDate: string; nextDueDate: string; status: string; note: string; createdAt: string; updatedAt: string;
};
export type VaccineInput = {
  targetType: string; targetNumber: string; targetName: string; vaccineName: string;
  vaccinationDate?: string; nextDueDate?: string; status?: string; note?: string;
};
const fileName = 'vaccines.json';
export async function listVaccines() { const data = await readJson<Vaccine>(fileName); return data.sort((a, b) => b.id - a.id); }
export async function findVaccine(id: number) { const data = await readJson<Vaccine>(fileName); return data.find((item) => item.id === id); }
export async function createVaccine(input: VaccineInput) {
  const data = await readJson<Vaccine>(fileName); const now = new Date().toISOString();
  const item: Vaccine = { id: data.length === 0 ? 1 : Math.max(...data.map((x) => x.id)) + 1, targetType: input.targetType, targetNumber: input.targetNumber, targetName: input.targetName, vaccineName: input.vaccineName, vaccinationDate: input.vaccinationDate ?? '', nextDueDate: input.nextDueDate ?? '', status: input.status ?? '未接種', note: input.note ?? '', createdAt: now, updatedAt: now };
  data.push(item); await writeJson(fileName, data); return item;
}
export async function updateVaccine(id: number, input: VaccineInput) {
  const data = await readJson<Vaccine>(fileName); const index = data.findIndex((item) => item.id === id);
  if (index === -1) return null;
  data[index] = { ...data[index], targetType: input.targetType, targetNumber: input.targetNumber, targetName: input.targetName, vaccineName: input.vaccineName, vaccinationDate: input.vaccinationDate ?? '', nextDueDate: input.nextDueDate ?? '', status: input.status ?? '未接種', note: input.note ?? '', updatedAt: new Date().toISOString() };
  await writeJson(fileName, data); return data[index];
}
export async function deleteVaccine(id: number) { const data = await readJson<Vaccine>(fileName); const next = data.filter((item) => item.id !== id); if (next.length === data.length) return false; await writeJson(fileName, next); return true; }
