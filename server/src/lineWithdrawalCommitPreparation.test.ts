import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { lifecycleLock } from './accountLifecycle';
import { issueLineWithdrawalProof, consumeLineWithdrawalProof } from './lineWithdrawalProofStore';
import { prepareLineWithdrawalCommitUnderLock } from './lineWithdrawalCommitPreparation';

test('pre-tombstone gate consumes proof once after account and snapshot checks', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'line-commit-prep-'));
  const old=process.env.FARMPRO_DATA_DIR;process.env.FARMPRO_DATA_DIR=root;
  try {
    await fs.writeFile(path.join(root,'users.json'),JSON.stringify([{id:'user-one',farmId:'farm-one',active:true,loginMethod:'line'}]));
    const proof=await issueLineWithdrawalProof('user-one','farm-one');
    const input={root,proof,userId:'user-one',farmId:'farm-one',previewFingerprint:'a'.repeat(64),currentFingerprint:'a'.repeat(64)};
    await lifecycleLock(locked=>prepareLineWithdrawalCommitUnderLock({...input,root:locked}));
    await assert.rejects(consumeLineWithdrawalProof(proof,'user-one','farm-one'),/REAUTH_REQUIRED/);
    assert.equal((await fs.readdir(root)).includes('account-withdrawals.json'),false);
  } finally {
    if(old===undefined)delete process.env.FARMPRO_DATA_DIR;else process.env.FARMPRO_DATA_DIR=old;
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('failure after proof consumption leaves account intact and forbids proof replay', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-commit-failure-'));
  const old = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const original = JSON.stringify([{id:'user-one',farmId:'farm-one',active:true,loginMethod:'line'}]);
    await fs.writeFile(path.join(root,'users.json'),original);
    const proof = await issueLineWithdrawalProof('user-one','farm-one');
    const input = {proof,userId:'user-one',farmId:'farm-one',previewFingerprint:'a'.repeat(64),currentFingerprint:'a'.repeat(64)};
    await assert.rejects(lifecycleLock(async locked => {
      await prepareLineWithdrawalCommitUnderLock({...input,root:locked});
      // Simulate durable tombstone write failure before any account/farm removal.
      throw new Error('SIMULATED_TOMBSTONE_WRITE_FAILURE');
    }), /SIMULATED_TOMBSTONE_WRITE_FAILURE/);
    assert.equal(await fs.readFile(path.join(root,'users.json'),'utf8'),original);
    await assert.rejects(fs.readFile(path.join(root,'account-withdrawals.json')), {code:'ENOENT'});
    await assert.rejects(consumeLineWithdrawalProof(proof,'user-one','farm-one'),/REAUTH_REQUIRED/);
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('failed pre-tombstone commit cannot resume a non-existent withdrawal', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'line-withdrawal-recovery-'));
  const old=process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR=root;
  try {
    const original=JSON.stringify([{id:'user-one',farmId:'farm-one',active:true,loginMethod:'line'}]);
    await fs.writeFile(path.join(root,'users.json'),original);
    const proof=await issueLineWithdrawalProof('user-one','farm-one');
    await assert.rejects(lifecycleLock(async locked=>{
      await prepareLineWithdrawalCommitUnderLock({root:locked,proof,userId:'user-one',farmId:'farm-one',previewFingerprint:'a'.repeat(64),currentFingerprint:'a'.repeat(64)});
      throw new Error('SIMULATED_COMMIT_FAILURE');
    }),/SIMULATED_COMMIT_FAILURE/);
    const {resumeAccountWithdrawals}=await import('./accountWithdrawalStore');
    await resumeAccountWithdrawals();
    assert.equal(await fs.readFile(path.join(root,'users.json'),'utf8'),original);
    await assert.rejects(fs.readFile(path.join(root,'account-withdrawals.json')),{code:'ENOENT'});
  } finally {
    if(old===undefined)delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=old;
    await fs.rm(root,{recursive:true,force:true});
  }
});
