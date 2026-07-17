import fs from 'node:fs/promises';
import path from 'node:path';

function runtimeDataDir() {
  const configuredDir = process.env.FARMPRO_DATA_DIR?.trim();
  return configuredDir
    ? path.resolve(configuredDir)
    : path.resolve(process.cwd(), 'data');
}

function legacyDataPath(fileName: string) {
  return path.resolve(process.cwd(), 'src', 'data', fileName);
}

export function dataPath(fileName: string) {
  return path.resolve(runtimeDataDir(), fileName);
}

async function copyLegacyDataIfNeeded(fileName: string) {
  try {
    const legacyRaw = await fs.readFile(legacyDataPath(fileName), 'utf-8');
    await fs.mkdir(runtimeDataDir(), { recursive: true });
    await fs.writeFile(dataPath(fileName), legacyRaw, 'utf-8');
    return legacyRaw;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    throw error;
  }
}

export function readJson<T>(fileName: string): Promise<T[]>;
export function readJson<T>(fileName: string, fallback: T): Promise<T>;
export async function readJson<T>(fileName: string, fallback?: T): Promise<T[] | T> {
  try {
    const raw = await fs.readFile(dataPath(fileName), 'utf-8');
    return JSON.parse(raw) as T[] | T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;

    const legacyRaw = await copyLegacyDataIfNeeded(fileName);
    if (legacyRaw !== null) {
      return JSON.parse(legacyRaw) as T[] | T;
    }

    if (fallback !== undefined) {
      await writeJson(fileName, fallback);
      return fallback;
    }
    throw error;
  }
}

export async function writeJson<T>(fileName: string, data: T) {
  await fs.mkdir(runtimeDataDir(), { recursive: true });
  await fs.writeFile(dataPath(fileName), JSON.stringify(data, null, 2), 'utf-8');
}
