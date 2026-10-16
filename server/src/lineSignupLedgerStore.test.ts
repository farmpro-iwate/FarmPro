import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { persistLineSignupLedgerEntry, readLineSignupLedger } from './lineSignupLedgerStore';
import type { LineSignupCandidate } from './lineSignupCandidate';

test('isolated signup ledger persists across reads and rejects duplicate parallel subjects', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-line-ledger-'));
  const original = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const candidate: LineSignupCandidate = {
      id: 'line-user-1', farmId: 'line-farm-1', farmName: 'テスト農場',
      name: '利用者', loginMethod: 'line', role: 'owner', active: true, plan: 'free',
    };
    const results = await Promise.allSettled([
      persistLineSignupLedgerEntry('req-one', 'U123', candidate),
      persistLineSignupLedgerEntry('req-two', 'U123', { ...candidate, id: 'line-user-2', farmId: 'line-farm-2' }),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter(r => r.status === 'rejected').length, 1);
    assert.equal((await readLineSignupLedger()).entries.length, 1);
    assert.equal((await fs.readdir(root)).includes('users.json'), false);
  } finally {
    if (original === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = original;
    await fs.rm(root, { recursive: true, force: true });
  }
});
