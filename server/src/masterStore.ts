import { readJson, writeJson } from './jsonStore';

export type MasterCategory = 'sire' | 'feed' | 'medicine' | 'partner' | 'veterinarian' | 'inseminator' | 'expenseCategory' | 'disease' | 'treatmentProcedure';

export type Master = {
  id: number;
  category: MasterCategory;
  name: string;
  code?: string;
  earTag?: string;
  note?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MasterInput = {
  category: MasterCategory;
  name: string;
  code?: string;
  earTag?: string;
  note?: string;
};

const fileName = 'masters.json';

function normalizeName(name: string): string {
  return name.trim();
}

export async function listMasters(category?: MasterCategory) {
  const masters = await readJson<Master>(fileName);
  let result = masters;

  if (category) {
    result = result.filter((m) => m.category === category);
  }

  return result.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.name.localeCompare(b.name);
  });
}

export async function findMaster(id: number) {
  const masters = await readJson<Master>(fileName);
  return masters.find((m) => m.id === id);
}

export async function checkDuplicate(category: MasterCategory, name: string) {
  const masters = await readJson<Master>(fileName);
  const normalized = normalizeName(name).toLowerCase();
  return masters.some(
    (m) =>
      m.category === category &&
      normalizeName(m.name).toLowerCase() === normalized &&
      m.active
  );
}

export async function createMaster(input: MasterInput) {
  const duplicate = await checkDuplicate(input.category, input.name);
  if (duplicate) {
    throw new Error('この名前はすでに登録されています');
  }

  const masters = await readJson<Master>(fileName);
  const now = new Date().toISOString();
  const nextId = masters.length === 0 ? 1 : Math.max(...masters.map((m) => m.id)) + 1;

  const master: Master = {
    id: nextId,
    category: input.category,
    name: normalizeName(input.name),
    code: input.code ? normalizeName(input.code) : undefined,
    earTag: input.earTag ? normalizeName(input.earTag) : undefined,
    note: input.note ? normalizeName(input.note) : undefined,
    active: true,
    createdAt: now,
    updatedAt: now
  };

  masters.push(master);
  await writeJson(fileName, masters);
  return master;
}

export async function updateMaster(id: number, input: MasterInput) {
  const masters = await readJson<Master>(fileName);
  const index = masters.findIndex((m) => m.id === id);
  if (index === -1) return null;

  const existing = masters[index];
  const normalizedName = normalizeName(input.name).toLowerCase();

  const shouldCheckDuplicate =
    !existing.active ||
    normalizeName(input.name) !== normalizeName(existing.name) ||
    input.category !== existing.category;

  if (shouldCheckDuplicate) {
    const duplicate = masters.some(
      (m) =>
        m.id !== id &&
        m.category === input.category &&
        normalizeName(m.name).toLowerCase() === normalizedName &&
        m.active
    );
    if (duplicate) throw new Error('この名前はすでに登録されています');
  }

  masters[index] = {
    ...masters[index],
    category: input.category,
    name: normalizeName(input.name),
    code: input.code ? normalizeName(input.code) : undefined,
    earTag: input.earTag ? normalizeName(input.earTag) : undefined,
    note: input.note ? normalizeName(input.note) : undefined,
    active: true,
    updatedAt: new Date().toISOString()
  };

  await writeJson(fileName, masters);
  return masters[index];
}

export async function deleteMaster(id: number) {
  const masters = await readJson<Master>(fileName);
  const index = masters.findIndex((m) => m.id === id);
  if (index === -1) return false;

  masters[index] = {
    ...masters[index],
    active: false,
    updatedAt: new Date().toISOString()
  };

  await writeJson(fileName, masters);
  return true;
}
