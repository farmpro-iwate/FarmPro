import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cleanupWithdrawnLineIdentity } from './lineWithdrawalCleanup';

test('cleanup only after completed withdrawal and remains retryable', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-withdrawal-cleanup-'));
  const before = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  const bindings = { version:1, bindings:[
    {provider:'line',subject:'U123',userId:'user-one',linkedAt:'2026-10-16T00:00:00Z'},
    {provider:'line',subject:'U456',userId:'user-two',linkedAt:'2026-10-16T00:00:00Z'},
  ] };
  const operation = {id:'withdraw-one',userId:'user-one',farmId:'farm-one',actorId:'user-one',
    startedAt:'2026-10-16T00:00:00Z',completedAt:'2026-10-16T00:01:00Z',status:'completed'};
  try {
    await fs.writeFile(path.join(root,'line-identity-bindings.json'),JSON.stringify(bindings));
    await assert.rejects(cleanupWithdrawnLineIdentity('user-one'),/NOT_COMPLETED/);
    await fs.writeFile(path.join(root,'account-withdrawals.json'),JSON.stringify({version:1,operations:[operation]}));
    assert.equal(await cleanupWithdrawnLineIdentity('user-one'),true);
    assert.equal(await cleanupWithdrawnLineIdentity('user-one'),false);
    const retained=JSON.parse(await fs.readFile(path.join(root,'line-identity-bindings.json'),'utf8'));
    assert.deepEqual(retained.bindings.map((x:{userId:string})=>x.userId),['user-two']);
  } finally {
    if(before===undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=before;
    await fs.rm(root,{recursive:true,force:true});
  }
});
