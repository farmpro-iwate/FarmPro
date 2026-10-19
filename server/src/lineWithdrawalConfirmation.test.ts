import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { issueLineWithdrawalConfirmation, consumeLineWithdrawalConfirmation } from './lineWithdrawalConfirmation';

test('LINE withdrawal proof is one-use, farm-bound, and cannot delete data', async () => {
  const old = process.env.FARMPRO_DATA_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-line-withdrawal-confirm-'));
  try {
    process.env.FARMPRO_DATA_DIR = dir;
    await fs.mkdir(path.join(dir,'farms','farm-one'),{recursive:true});
    await fs.writeFile(path.join(dir,'farms','farm-one','cattle.json'),'[{"id":"cow"}]');
    const token = await issueLineWithdrawalConfirmation('user-one','farm-one');
    assert.match(token,/^[a-f0-9]{64}$/);
    await assert.rejects(consumeLineWithdrawalConfirmation(token,'user-two','farm-two'));
    await assert.rejects(consumeLineWithdrawalConfirmation(token,'user-one','farm-one'));
    const second = await issueLineWithdrawalConfirmation('user-one','farm-one');
    await consumeLineWithdrawalConfirmation(second,'user-one','farm-one');
    await assert.rejects(consumeLineWithdrawalConfirmation(second,'user-one','farm-one'));
    assert.equal(await fs.readFile(path.join(dir,'farms','farm-one','cattle.json'),'utf8'),'[{"id":"cow"}]');
    assert.equal((await fs.readdir(dir)).includes('account-withdrawals.json'),false);
  } finally {
    if (old===undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=old;
    await fs.rm(dir,{recursive:true,force:true});
  }
});
