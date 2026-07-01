import fs from 'node:fs/promises';
import path from 'node:path';

export function dataPath(fileName: string) {
  return path.resolve(process.cwd(), 'src', 'data', fileName);
}

export async function readJson<T>(fileName: string): Promise<T[]> {
  const raw = await fs.readFile(dataPath(fileName), 'utf-8');
  return JSON.parse(raw) as T[];
}

export async function writeJson<T>(fileName: string, data: T[]) {
  await fs.writeFile(dataPath(fileName), JSON.stringify(data, null, 2), 'utf-8');
}
