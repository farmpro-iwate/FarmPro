import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJson } from './jsonStore';
import { persistCanonicalLineSignup } from './lineCanonicalSignupStore';

test('stale legacy users snapshot cannot erase a newly registered LINE owner', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-users-race-'));
  const prior = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  const legacy = { id: 'email-owner', farmId: 'farm-email', farmName: 'Email farm', name: 'Email owner',
    email: 'email@example.invalid', passwordSalt: 'salt', passwordHash: 'hash',
    role: 'owner', active: true, plan: 'free' };
  try {
    await writeJson('users.json', [legacy]);
    const stale = await readJson<typeof legacy>('users.json', []);
    await persistCanonicalLineSignup('UlineRaceTest', {
      id: 'line-owner', farmId: 'farm-line', farmName: 'LINE farm', name: 'LINE owner',
      loginMethod: 'line', role: 'owner', active: true, plan: 'free',
    });
    await assert.rejects(writeJson('users.json', [...stale, { ...legacy, id: 'another-email', farmId: 'farm-another' }]),
      /USER_RECORD_CONFLICT/);
    const saved = JSON.parse(await fs.readFile(path.join(root, 'users.json'), 'utf8'));
    assert.deepEqual(saved.map((row: { id: string }) => row.id), ['email-owner', 'line-owner']);
  } finally {
    if (prior === undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR = prior;
    await fs.rm(root, { recursive: true, force: true });
  }
});
