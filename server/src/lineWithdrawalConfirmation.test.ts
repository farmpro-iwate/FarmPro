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

test('LINE withdrawal proof rejects expired, replaced, and malformed confirmations without touching cattle', async () => {
  const old = process.env.FARMPRO_DATA_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-line-withdrawal-expired-'));
  try {
    process.env.FARMPRO_DATA_DIR = dir;
    await fs.mkdir(path.join(dir,'farms','farm-two'),{recursive:true});
    await fs.writeFile(path.join(dir,'farms','farm-two','cattle.json'),'[{"id":"retained"}]');
    const first = await issueLineWithdrawalConfirmation('user-two','farm-two');
    const second = await issueLineWithdrawalConfirmation('user-two','farm-two');
    await assert.rejects(consumeLineWithdrawalConfirmation(first,'user-two','farm-two'));
    const location = path.join(dir,'line-withdrawal-confirmations.json');
    const store = JSON.parse(await fs.readFile(location,'utf8'));
    store.confirmations[0].expiresAt = Date.now() - 1;
    await fs.writeFile(location,JSON.stringify(store));
    await assert.rejects(consumeLineWithdrawalConfirmation(second,'user-two','farm-two'));
    await fs.writeFile(location,JSON.stringify({version:1,confirmations:[{digest:'invalid'}]}));
    await assert.rejects(issueLineWithdrawalConfirmation('user-two','farm-two'));
    assert.equal(await fs.readFile(path.join(dir,'farms','farm-two','cattle.json'),'utf8'),'[{"id":"retained"}]');
    assert.equal((await fs.readdir(dir)).includes('account-withdrawals.json'),false);
  } finally {
    if (old===undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=old;
    await fs.rm(dir,{recursive:true,force:true});
  }
});
