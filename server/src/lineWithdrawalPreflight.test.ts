import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { lifecycleLock } from './accountLifecycle';
import { preflightLineWithdrawalUnderLock } from './lineWithdrawalPreflight';

test('read-only preflight never deletes LINE farm account',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'line-withdrawal-preflight-'));
  const old=process.env.FARMPRO_DATA_DIR;process.env.FARMPRO_DATA_DIR=root;
  try {
    const users=[{id:'user-one',farmId:'farm-one',active:true,loginMethod:'line'}];
    const original=JSON.stringify(users);
    await fs.writeFile(path.join(root,'users.json'),original);
    const base={root,userId:'user-one',farmId:'farm-one',previewFingerprint:'a'.repeat(64),currentFingerprint:'a'.repeat(64)};
    await lifecycleLock(locked=>preflightLineWithdrawalUnderLock({...base,root:locked}));
    assert.equal(await fs.readFile(path.join(root,'users.json'),'utf8'),original);
    await assert.rejects(lifecycleLock(locked=>preflightLineWithdrawalUnderLock({...base,root:locked,currentFingerprint:'b'.repeat(64)})),/STATE_CHANGED/);
    assert.equal(await fs.readFile(path.join(root,'users.json'),'utf8'),original);
  } finally {
    if(old===undefined)delete process.env.FARMPRO_DATA_DIR;else process.env.FARMPRO_DATA_DIR=old;
    await fs.rm(root,{recursive:true,force:true});
  }
});
