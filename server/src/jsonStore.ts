import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { currentFarmId } from './farmContext';
import { lifecycleLock, withdrawalCompletions } from './accountLifecycle';

const GLOBAL_FILES = new Set([
  'users.json',
  'bank-transfer-applications.json',
  'stripeSubscriptions.json',
  'stripeWebhookEvents.json',
]);
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
  const closed = await withdrawalCompletions();
  if (!GLOBAL_FILES.has(fileName) && closed.some(row => row.farmId === resolvedFarmId())) throw new Error('FARM_WITHDRAWN');
  try {
    const raw = await fs.readFile(dataPath(fileName), 'utf-8');
    const value = JSON.parse(raw);
    return fileName === 'users.json' && Array.isArray(value)
      ? value.filter(user => !closed.some(row => row.userId === user.id)) as T[]
      : value as T[] | T;
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
  await lifecycleLock(async () => {
    const closed = await withdrawalCompletions();
    if (!GLOBAL_FILES.has(fileName) && closed.some(row => row.farmId === resolvedFarmId())) throw new Error('FARM_WITHDRAWN');
    if (fileName === 'users.json' && Array.isArray(data) && data.some(user => closed.some(row => row.userId === user.id))) throw new Error('USER_WITHDRAWN');
    const value = data;
    const target = dataPath(fileName);
    // A concurrent LINE signup can be committed after a legacy email flow
    // reads users.json. Never let its stale snapshot silently erase an account.
    // This is a fail-closed guard, not a substitute for transactional updates.
    if (fileName === 'users.json' && Array.isArray(data)) {
      let saved: unknown;
      try { saved = JSON.parse(await fs.readFile(target, 'utf8')); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (saved !== undefined) {
        if (!Array.isArray(saved)) throw new Error('USER_STORE_INVALID');
        const nextIds = new Set(data.map(row => row?.id));
        if (saved.some(row => !row || typeof row.id !== 'string' || !nextIds.has(row.id))) {
          throw new Error('USER_RECORD_CONFLICT');
        }
      }
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await fs.rename(temporary, target);
    } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  });
}
