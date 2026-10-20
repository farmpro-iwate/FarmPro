import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { previewAccountWithdrawal } from './accountWithdrawalStore';

test('legacy withdrawal preview still works when a LINE-only owner exists', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-mixed-withdrawal-'));
  const previous = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    await fs.writeFile(path.join(root, 'users.json'), JSON.stringify([
      { id: 'email-owner', farmId: 'farm-email', farmName: 'Email farm', name: 'Email',
        email: 'email@example.invalid', passwordSalt: 'salt', passwordHash: 'hash',
        role: 'owner', active: true, plan: 'free' },
      { id: 'line-owner', farmId: 'farm-line', farmName: 'LINE farm', name: 'LINE',
        loginMethod: 'line', lineSubject: 'UverifiedLINE', role: 'owner', active: true, plan: 'free' },
    ]));
    const email = await previewAccountWithdrawal({ id: 'email-owner', farmId: 'farm-email' }, 'email-owner');
    assert.equal(email.user.id, 'email-owner');
    assert.equal(email.eligible, true);
    const line = await previewAccountWithdrawal({ id: 'line-owner', farmId: 'farm-line' }, 'line-owner');
    assert.equal(line.eligible, false);
    assert.match(line.reason, /LINE登録の退会は専用の本人確認/);
  } finally {
    if (previous === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});
