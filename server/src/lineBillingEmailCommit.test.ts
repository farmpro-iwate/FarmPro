import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stageLineBillingEmailCode } from './lineBillingEmailCodeStore';
import { commitVerifiedLineBillingEmail } from './lineBillingEmailCommit';

test('billing email commit preserves user identity, plan and replay protection', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'line-billing-commit-'));
 const old=process.env.FARMPRO_DATA_DIR;
 process.env.FARMPRO_DATA_DIR=root;
 const actor={userId:'line-owner',farmId:'farm-a',lineSubject:'Uline-a'};
 const users=[
  {id:'line-owner',farmId:'farm-a',lineSubject:'Uline-a',loginMethod:'line',role:'owner',active:true,plan:'free',farmName:'Line Farm'},
  {id:'email-owner',farmId:'farm-b',email:'existing@example.invalid',role:'owner',active:true,plan:'standard'}
 ];
 try {
  await fs.writeFile(path.join(root,'users.json'),JSON.stringify(users));
  const {code}=await stageLineBillingEmailCode(actor,'fresh@example.invalid',1000);
  await assert.rejects(commitVerifiedLineBillingEmail({...actor,farmId:'farm-b'},code,1001),/IDENTITY_MISMATCH/);
  const committed=await commitVerifiedLineBillingEmail(actor,code,1002);
  assert.equal(committed.email,'fresh@example.invalid');
  const stored=JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8'));
  assert.equal(stored[0].id,users[0].id);
  assert.equal(stored[0].farmId,users[0].farmId);
  assert.equal(stored[0].plan,'free');
  assert.equal(stored[0].passwordHash,undefined);
  assert.deepEqual(stored[1],users[1]);
  await assert.rejects(commitVerifiedLineBillingEmail(actor,code,1003),/CODE_EXPIRED/);
 } finally {
  if(old===undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR=old;
  await fs.rm(root,{recursive:true,force:true});
 }
});
test('duplicate email never changes users or spends successful code', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'line-billing-duplicate-'));
 const old=process.env.FARMPRO_DATA_DIR;
 process.env.FARMPRO_DATA_DIR=root;
 const actor={userId:'line-owner',farmId:'farm-a',lineSubject:'Uline-a'};
 const users=[
  {id:'line-owner',farmId:'farm-a',lineSubject:'Uline-a',loginMethod:'line',role:'owner',active:true,plan:'free'},
  {id:'other-owner',farmId:'farm-b',email:'taken@example.invalid',role:'owner',active:true}
 ];
 try {
  const raw=JSON.stringify(users);
  await fs.writeFile(path.join(root,'users.json'),raw);
  const {code}=await stageLineBillingEmailCode(actor,'taken@example.invalid',1000);
  await assert.rejects(commitVerifiedLineBillingEmail(actor,code,1001),/BILLING_EMAIL_UNAVAILABLE/);
  assert.equal(await fs.readFile(path.join(root,'users.json'),'utf8'),raw);
 } finally {
  if(old===undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR=old;
  await fs.rm(root,{recursive:true,force:true});
 }
});

test('interrupted cleanup cannot replay a committed LINE billing email code', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'line-billing-crash-replay-'));
 const old=process.env.FARMPRO_DATA_DIR;
 process.env.FARMPRO_DATA_DIR=root;
 const actor={userId:'line-owner',farmId:'farm-a',lineSubject:'Uline-a'};
 const users=[
  {id:'line-owner',farmId:'farm-a',lineSubject:'Uline-a',loginMethod:'line',role:'owner',active:true,plan:'free'},
  {id:'other-owner',farmId:'farm-b',email:'other@example.invalid',role:'owner',active:true,plan:'standard'}
 ];
 try {
  await fs.writeFile(path.join(root,'users.json'),JSON.stringify(users));
  const {code}=await stageLineBillingEmailCode(actor,'verified@example.invalid',1000);
  // Capture the challenge before a successful save to reproduce a crash
  // immediately after users.json is committed but before challenge cleanup.
  const staleChallenge=await fs.readFile(path.join(root,'line-billing-email-challenges.json'),'utf8');
  await commitVerifiedLineBillingEmail(actor,code,1001);
  const saved=await fs.readFile(path.join(root,'users.json'),'utf8');
  await fs.writeFile(path.join(root,'line-billing-email-challenges.json'),staleChallenge);
  await assert.rejects(commitVerifiedLineBillingEmail(actor,code,1002),/BILLING_ACTOR_UNAVAILABLE/);
  assert.equal(await fs.readFile(path.join(root,'users.json'),'utf8'),saved);
  const after=JSON.parse(saved);
  assert.equal(after[0].email,'verified@example.invalid');
  assert.equal(after[0].loginMethod,'line');
  assert.equal(after[0].plan,'free');
  assert.deepEqual(after[1],users[1]);
 } finally {
  if(old===undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR=old;
  await fs.rm(root,{recursive:true,force:true});
 }
});
