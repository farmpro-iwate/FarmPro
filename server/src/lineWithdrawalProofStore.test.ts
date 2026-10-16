import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { issueLineWithdrawalProof, consumeLineWithdrawalProof } from './lineWithdrawalProofStore';

test('withdrawal proof is one use and bound to user and farm', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-withdrawal-proof-'));
  const old = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const ticket = await issueLineWithdrawalProof('user-one', 'farm-one');
    await assert.rejects(consumeLineWithdrawalProof(ticket, 'user-two', 'farm-one'), /REAUTH_REQUIRED/);
    await assert.rejects(consumeLineWithdrawalProof(ticket, 'user-one', 'farm-one'), /REAUTH_REQUIRED/);
    const second = await issueLineWithdrawalProof('user-one', 'farm-one');
    await consumeLineWithdrawalProof(second, 'user-one', 'farm-one');
    await assert.rejects(consumeLineWithdrawalProof(second, 'user-one', 'farm-one'), /REAUTH_REQUIRED/);
    assert.equal((await fs.readdir(root)).includes('users.json'), false);
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(root, { recursive: true, force: true });
  }
});
