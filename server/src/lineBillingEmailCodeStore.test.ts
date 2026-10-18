import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stageLineBillingEmailCode, consumeLineBillingEmailCode } from './lineBillingEmailCodeStore';

test('code persists, is single-use and rejects other farm without consuming it', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-billing-store-'));
  const before = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  const person = { userId: 'line-a', farmId: 'farm-a', lineSubject: 'Uline-a' };
  try {
    const { code } = await stageLineBillingEmailCode(person, 'payer@example.invalid', 1000);
    await assert.rejects(consumeLineBillingEmailCode({ ...person, farmId: 'farm-b' }, code, 1001), /IDENTITY_MISMATCH/);
    const first = await consumeLineBillingEmailCode(person, code, 1002);
    assert.equal(first?.verifiedEmail, 'payer@example.invalid');
    await assert.rejects(consumeLineBillingEmailCode(person, code, 1003), /CODE_EXPIRED/);
  } finally {
    if (before === undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR = before;
    await fs.rm(root, { recursive: true, force: true });
  }
});
test('five incorrect attempts lock challenge without modifying any account', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-billing-lock-'));
  const before = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  const person = { userId: 'line-b', farmId: 'farm-b', lineSubject: 'Uline-b' };
  try {
    const { code } = await stageLineBillingEmailCode(person, 'payer@example.invalid', 1000);
    const wrong = code === '000000' ? '999999' : '000000';
    for (let i = 0; i < 5; i++) assert.equal(await consumeLineBillingEmailCode(person, wrong, 1001), null);
    await assert.rejects(consumeLineBillingEmailCode(person, code, 1002), /CODE_EXPIRED/);
  } finally {
    if (before === undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR = before;
    await fs.rm(root, { recursive: true, force: true });
  }
});
