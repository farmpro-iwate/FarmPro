import { readJson, writeJson } from './jsonStore';

export type BlvTest = {
  id: number; cowEarTag: string; cowName: string; testDate: string; result: string;
  nextTestDate: string; isolationMemo: string; note: string; createdAt: string; updatedAt: string;
};
export type BlvTestInput = {
  cowEarTag: string; cowName: string; testDate?: string; result?: string; nextTestDate?: string;
  isolationMemo?: string; note?: string;
};
const fileName = 'blvTests.json';
export async function listBlvTests() { const data = await readJson<BlvTest>(fileName); return data.sort((a, b) => b.id - a.id); }
export async function findBlvTest(id: number) { const data = await readJson<BlvTest>(fileName); return data.find((item) => item.id === id); }
export async function createBlvTest(input: BlvTestInput) {
  const data = await readJson<BlvTest>(fileName); const now = new Date().toISOString();
  const item: BlvTest = { id: data.length === 0 ? 1 : Math.max(...data.map((x) => x.id)) + 1, cowEarTag: input.cowEarTag, cowName: input.cowName, testDate: input.testDate ?? '', result: input.result ?? '未検査', nextTestDate: input.nextTestDate ?? '', isolationMemo: input.isolationMemo ?? '', note: input.note ?? '', createdAt: now, updatedAt: now };
  data.push(item); await writeJson(fileName, data); return item;
}
export async function updateBlvTest(id: number, input: BlvTestInput) {
  const data = await readJson<BlvTest>(fileName); const index = data.findIndex((item) => item.id === id);
  if (index === -1) return null;
  data[index] = { ...data[index], cowEarTag: input.cowEarTag, cowName: input.cowName, testDate: input.testDate ?? '', result: input.result ?? '未検査', nextTestDate: input.nextTestDate ?? '', isolationMemo: input.isolationMemo ?? '', note: input.note ?? '', updatedAt: new Date().toISOString() };
  await writeJson(fileName, data); return data[index];
}
export async function deleteBlvTest(id: number) { const data = await readJson<BlvTest>(fileName); const next = data.filter((item) => item.id !== id); if (next.length === data.length) return false; await writeJson(fileName, next); return true; }
