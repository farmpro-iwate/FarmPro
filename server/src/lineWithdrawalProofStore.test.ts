import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { issueLineWithdrawalProof, consumeLineWithdrawalProof, consumeLineWithdrawalProofUnderLock } from './lineWithdrawalProofStore';
import { lifecycleLock } from './accountLifecycle';

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

test('parallel withdrawal proof consumption succeeds exactly once', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-withdrawal-parallel-'));
  const old = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const ticket = await issueLineWithdrawalProof('user-one', 'farm-one');
    const results = await Promise.allSettled([
      consumeLineWithdrawalProof(ticket, 'user-one', 'farm-one'),
      consumeLineWithdrawalProof(ticket, 'user-one', 'farm-one'),
    ]);
    assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(results.filter(item => item.status === 'rejected').length, 1);
    await assert.rejects(consumeLineWithdrawalProof(ticket, 'user-one', 'farm-one'), /REAUTH_REQUIRED/);
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('malformed withdrawal proof file is not silently replaced', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-withdrawal-corrupt-'));
  const old = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  const file = path.join(root, 'line-withdrawal-proofs.json');
  const corrupt = '{"version":1,"entries":[{"digest":"bad"}]}';
  try {
    await fs.writeFile(file, corrupt, 'utf8');
    await assert.rejects(issueLineWithdrawalProof('user-one', 'farm-one'), /PROOF_STORE_INVALID/);
    assert.equal(await fs.readFile(file, 'utf8'), corrupt);
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('withdrawal proof is consumed inside the existing lifecycle lock without deadlock', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-withdrawal-under-lock-'));
  const old = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const ticket = await issueLineWithdrawalProof('user-one', 'farm-one');
    await lifecycleLock(async lockedRoot => {
      await consumeLineWithdrawalProofUnderLock(lockedRoot, ticket, 'user-one', 'farm-one');
    });
    await assert.rejects(consumeLineWithdrawalProof(ticket, 'user-one', 'farm-one'), /REAUTH_REQUIRED/);
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(root, {recursive:true,force:true});
  }
});
