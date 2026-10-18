import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { issueVerifiedBillingReauthProof, consumeVerifiedBillingReauthProof } from './lineBillingReauthProofStore';

test('isolated billing proof persists and can be consumed only once by matching account', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'line-billing-proof-'));
 const previous=process.env.FARMPRO_DATA_DIR;
 process.env.FARMPRO_DATA_DIR=root;
 const actor={userId:'line-owner',farmId:'farm-a',lineSubject:'Uline-a'};
 try {
  const secret=await issueVerifiedBillingReauthProof(actor,1000);
  await assert.rejects(consumeVerifiedBillingReauthProof(secret,{...actor,farmId:'farm-b'},1001),/REAUTH_REQUIRED/);
  assert.deepEqual(await consumeVerifiedBillingReauthProof(secret,actor,1002),actor);
  await assert.rejects(consumeVerifiedBillingReauthProof(secret,actor,1003),/PROOF_MISSING/);
 } finally {
  if(previous===undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR=previous;
  await fs.rm(root,{recursive:true,force:true});
 }
});
test('expired proof cannot be consumed', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'line-billing-expired-'));
 const previous=process.env.FARMPRO_DATA_DIR;
 process.env.FARMPRO_DATA_DIR=root;
 const actor={userId:'line-owner',farmId:'farm-a',lineSubject:'Uline-a'};
 try {
  const secret=await issueVerifiedBillingReauthProof(actor,1000);
  await assert.rejects(consumeVerifiedBillingReauthProof(secret,actor,301000),/REAUTH_REQUIRED/);
 } finally {
  if(previous===undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR=previous;
  await fs.rm(root,{recursive:true,force:true});
 }
});
