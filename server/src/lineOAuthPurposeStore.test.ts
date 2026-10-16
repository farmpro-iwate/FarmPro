import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveLineOAuthPurpose, consumeLineOAuthPurpose } from './lineOAuthPurposeStore';

test('OAuth purpose can be consumed only once and cannot be substituted', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-line-purpose-'));
  const previous = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const state = 'a'.repeat(64);
    const withdrawal = { purpose:'withdrawal-reauth' as const, userId:'user-1', farmId:'farm-1' };
    await saveLineOAuthPurpose(state, withdrawal);
    await assert.rejects(consumeLineOAuthPurpose(state, {purpose:'login'}), /PURPOSE_MISMATCH/);
    await assert.rejects(consumeLineOAuthPurpose(state, withdrawal), /PURPOSE_EXPIRED/);
    const nextState = 'b'.repeat(64);
    await saveLineOAuthPurpose(nextState, withdrawal);
    await consumeLineOAuthPurpose(nextState, withdrawal);
    await assert.rejects(consumeLineOAuthPurpose(nextState, withdrawal), /PURPOSE_EXPIRED/);
  } finally {
    if (previous === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = previous;
    await fs.rm(root, {recursive:true,force:true});
  }
});

test('concurrent purpose consumption succeeds exactly once', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-line-purpose-parallel-'));
  const previous = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const state = 'c'.repeat(64);
    const purpose = { purpose:'withdrawal-reauth' as const, userId:'user-1', farmId:'farm-1' };
    await saveLineOAuthPurpose(state, purpose);
    const outcomes = await Promise.allSettled([
      consumeLineOAuthPurpose(state, purpose),
      consumeLineOAuthPurpose(state, purpose),
    ]);
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(item => item.status === 'rejected').length, 1);
  } finally {
    if (previous === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = previous;
    await fs.rm(root, {recursive:true,force:true});
  }
});

test('corrupt purpose registry prevents issuance without overwriting existing data', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-line-purpose-corrupt-'));
  const previous = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  const file = path.join(root, 'line-oauth-purpose-registry.json');
  const corrupt = '{"version":1,"entries":[{"stateDigest":"bad","purpose":{"purpose":"login"},"expiresAt":1}]}';
  try {
    await fs.writeFile(file, corrupt, 'utf8');
    await assert.rejects(saveLineOAuthPurpose('d'.repeat(64), {purpose:'login'}), /PURPOSE_STORE_INVALID/);
    assert.equal(await fs.readFile(file, 'utf8'), corrupt);
  } finally {
    if (previous === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = previous;
    await fs.rm(root, {recursive:true,force:true});
  }
});
