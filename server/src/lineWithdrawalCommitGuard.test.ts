import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { lifecycleLock } from './accountLifecycle';
import { issueLineWithdrawalProof, consumeLineWithdrawalProof } from './lineWithdrawalProofStore';
import { authorizeLineWithdrawalUnderLock } from './lineWithdrawalCommitGuard';

test('snapshot change rejects withdrawal before consuming proof', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-withdrawal-commit-'));
  const old = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const proof = await issueLineWithdrawalProof('user-one', 'farm-one');
    const input = { root, proof, userId:'user-one', farmId:'farm-one',
      previewFingerprint:'a'.repeat(64), currentFingerprint:'b'.repeat(64) };
    await assert.rejects(lifecycleLock(locked => authorizeLineWithdrawalUnderLock({...input,root:locked})), /STATE_CHANGED/);
    await lifecycleLock(locked => authorizeLineWithdrawalUnderLock({...input,root:locked,currentFingerprint:'a'.repeat(64)}));
    await assert.rejects(consumeLineWithdrawalProof(proof, 'user-one', 'farm-one'), /REAUTH_REQUIRED/);
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(root, {recursive:true,force:true});
  }
});
