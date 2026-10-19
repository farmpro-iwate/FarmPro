import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertNativeLineWithdrawalIdentity } from './lineWithdrawalIdentity';

test('LINE withdrawal identity permits only matching active native subject, actor and farm', async () => {
  const old = process.env.FARMPRO_DATA_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-line-withdrawal-'));
  try {
    process.env.FARMPRO_DATA_DIR = dir;
    await fs.writeFile(path.join(dir, 'users.json'), JSON.stringify([
      { id:'line-one', farmId:'farm-one', active:true, loginMethod:'line', lineSubject:'subject-one' },
      { id:'line-two', farmId:'farm-two', active:true, loginMethod:'line', lineSubject:'subject-two' },
    ]));
    const actor={id:'line-one',farmId:'farm-one'};
    await assertNativeLineWithdrawalIdentity(actor, actor, {subject:'subject-one'});
    for (const [caller, target, subject] of [
      [actor,{id:'line-two',farmId:'farm-two'},'subject-one'],
      [actor,actor,'subject-two'],
      [{id:'line-one',farmId:'farm-two'},actor,'subject-one'],
    ] as const) {
      await assert.rejects(assertNativeLineWithdrawalIdentity(caller,target,{subject}));
    }
    assert.equal((await fs.readdir(dir)).includes('account-withdrawals.json'),false);
  } finally {
    if (old===undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=old;
    await fs.rm(dir,{recursive:true,force:true});
  }
});
