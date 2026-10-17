import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyNativeLineWithdrawalAccount } from './lineWithdrawalNativeAccount';

test('native LINE withdrawal verification stays server-side and fails closed for wrong subject', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-private-identity-'));
  const before = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    await fs.writeFile(path.join(root, 'users.json'), JSON.stringify([
      {id:'user-one',farmId:'farm-one',active:true,loginMethod:'line',lineSubject:'U123'},
      {id:'user-two',farmId:'farm-two',active:true,loginMethod:'line',lineSubject:'U456'}
    ]));
    const session = {id:'user-one',farmId:'farm-one'};
    assert.deepEqual(await verifyNativeLineWithdrawalAccount(session,'U123'),{
      id:'user-one',farmId:'farm-one',loginMethod:'line',lineSubject:'U123'
    });
    await assert.rejects(verifyNativeLineWithdrawalAccount(session,'U456'),/IDENTITY_MISMATCH/);
    await assert.rejects(verifyNativeLineWithdrawalAccount({id:'user-one',farmId:'farm-two'},'U123'),/IDENTITY_MISMATCH/);
  } finally {
    if (before === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = before;
    await fs.rm(root,{recursive:true,force:true});
  }
});
