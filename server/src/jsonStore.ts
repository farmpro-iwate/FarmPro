import fs from 'node:fs/promises';
import path from 'node:path';
import { currentFarmId } from './farmContext';

const GLOBAL_FILES = new Set(['users.json']);
const DEFAULT_FARM_ID = 'farm-demo';

function runtimeDataDir() {
  const configuredDir = process.env.FARMPRO_DATA_DIR?.trim();
  return configuredDir
    ? path.resolve(configuredDir)
    : path.resolve(process.cwd(), 'data');
}

function safeFarmId(farmId: string) {
  const normalized = farmId.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    throw new Error('INVALID_FARM_ID');
  }
  return normalized;
}

function resolvedFarmId() {
  return safeFarmId(currentFarmId() || DEFAULT_FARM_ID);
}

function rootRuntimePath(fileName: string) {
  return path.resolve(runtimeDataDir(), fileName);
}

function legacyDataPath(fileName: string) {
  return path.resolve(process.cwd(), 'src', 'data', fileName);
}

export function dataPath(fileName: string) {
  if (GLOBAL_FILES.has(fileName)) return rootRuntimePath(fileName);
  return path.resolve(runtimeDataDir(), 'farms', resolvedFarmId(), fileName);
}

async function copyExistingDataIfNeeded(fileName: string) {
  if (GLOBAL_FILES.has(fileName) || resolvedFarmId() !== DEFAULT_FARM_ID) return null;

  const candidates = [rootRuntimePath(fileName), legacyDataPath(fileName)];
  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, 'utf-8');
      await fs.mkdir(path.dirname(dataPath(fileName)), { recursive: true });
      await fs.writeFile(dataPath(fileName), raw, 'utf-8');
      return raw;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
    }
  }
  return null;
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

    const existingRaw = await copyExistingDataIfNeeded(fileName);
    if (existingRaw !== null) {
      return JSON.parse(existingRaw) as T[] | T;
    }

    if (fallback !== undefined) {
      await writeJson(fileName, fallback);
      return fallback;
    }
    throw error;
  }
}

export async function writeJson<T>(fileName: string, data: T) {
  const target = dataPath(fileName);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(data, null, 2), 'utf-8');
}
