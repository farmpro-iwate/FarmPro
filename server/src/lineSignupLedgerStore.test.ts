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

test('corrupt persisted signup ledger fails closed without replacing bytes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-line-ledger-corrupt-'));
  const original = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  const file = path.join(root, 'line-signup-ledger.json');
  const corrupt = JSON.stringify({ version: 1, entries: [
    { subject: 'U123', requestId: 'req-one', committedAt: '2026-10-16T00:00:00.000Z',
      user: { id: 'u-one', farmId: 'f-one', farmName: '農場', name: '利用者',
        loginMethod: 'line', role: 'owner', active: true, plan: 'free', email: 'fake@example.com' } },
  ] });
  try {
    await fs.writeFile(file, corrupt, 'utf8');
    await assert.rejects(readLineSignupLedger());
    assert.equal(await fs.readFile(file, 'utf8'), corrupt);
    await assert.rejects(persistLineSignupLedgerEntry('req-two', 'U456', {
      id: 'u-two', farmId: 'f-two', farmName: '別農場', name: '別利用者',
      loginMethod: 'line', role: 'owner', active: true, plan: 'free',
    }));
    assert.equal(await fs.readFile(file, 'utf8'), corrupt);
    assert.equal((await fs.readdir(root)).includes('users.json'), false);
  } finally {
    if (original === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = original;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('reloaded ledger rejects replay of a committed registration', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-line-ledger-replay-'));
  const previous = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const first: LineSignupCandidate = {
      id: 'line-user-first', farmId: 'line-farm-first', farmName: '第一農場',
      name: '利用者', loginMethod: 'line', role: 'owner', active: true, plan: 'free',
    };
    await persistLineSignupLedgerEntry('req-first', 'Ufirst', first);
    const snapshot = await readLineSignupLedger();
    assert.equal(snapshot.entries[0].subject, 'Ufirst');
    await assert.rejects(
      persistLineSignupLedgerEntry('req-first', 'Uother', {
        ...first, id: 'line-user-other', farmId: 'line-farm-other',
      }),
      /LINE_SIGNUP_ALREADY_COMMITTED/,
    );
    await assert.rejects(
      persistLineSignupLedgerEntry('req-other', 'Ufirst', {
        ...first, id: 'line-user-other', farmId: 'line-farm-other',
      }),
      /LINE_SIGNUP_ALREADY_COMMITTED/,
    );
    assert.equal((await readLineSignupLedger()).entries.length, 1);
  } finally {
    if (previous === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});
