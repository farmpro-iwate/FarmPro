import fs from 'node:fs/promises';
import path from 'node:path';

export function dataPath(fileName: string) {
  return path.resolve(process.cwd(), 'src', 'data', fileName);
}

export function readJson<T>(fileName: string): Promise<T[]>;
export function readJson<T>(fileName: string, fallback: T): Promise<T>;
export async function readJson<T>(fileName: string, fallback?: T): Promise<T[] | T> {
  try {
    const raw = await fs.readFile(dataPath(fileName), 'utf-8');
    return JSON.parse(raw) as T[] | T;
  } catch (error) {
    if (fallback !== undefined) {
      await writeJson(fileName, fallback);
      return fallback;
    }
    throw error;
  }
}

export async function writeJson<T>(fileName: string, data: T) {
  await fs.mkdir(path.dirname(dataPath(fileName)), { recursive: true });
  await fs.writeFile(dataPath(fileName), JSON.stringify(data, null, 2), 'utf-8');
}
