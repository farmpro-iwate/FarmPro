import { readJson, writeJson } from './jsonStore';

export type MasterCategory = 'bull' | 'feed' | 'medicine' | 'partner';

export type MasterItem = {
  id: number;
  category: MasterCategory;
  name: string;
  code: string;
  detail: string;
  note: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MasterInput = Pick<MasterItem, 'category' | 'name' | 'code' | 'detail' | 'note' | 'active'>;

const fileName = 'masters.json';

export async function listMasters(category?: string) {
  const data = await readJson<MasterItem>(fileName);
  return data.filter((item) => !category || item.category === category).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export async function createMaster(input: MasterInput) {
  const data = await readJson<MasterItem>(fileName);
  const normalizedName = input.name.trim();
  const duplicate = data.find((item) => item.category === input.category && item.name.trim() === normalizedName);
  if (duplicate) return { duplicate };
  const now = new Date().toISOString();
  const item: MasterItem = {
    id: data.length ? Math.max(...data.map((row) => row.id)) + 1 : 1,
    category: input.category,
    name: normalizedName,
    code: input.code?.trim() || '',
    detail: input.detail?.trim() || '',
    note: input.note?.trim() || '',
    active: input.active !== false,
    createdAt: now,
    updatedAt: now
  };
  data.push(item);
  await writeJson(fileName, data);
  return { item };
}

export async function updateMaster(id: number, input: MasterInput) {
  const data = await readJson<MasterItem>(fileName);
  const index = data.findIndex((item) => item.id === id);
  if (index === -1) return null;
  data[index] = { ...data[index], ...input, name: input.name.trim(), updatedAt: new Date().toISOString() };
  await writeJson(fileName, data);
  return data[index];
}
