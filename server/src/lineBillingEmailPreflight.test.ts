import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectLineBillingEmailTarget } from './lineBillingEmailPreflight';

test('preflight isolates farm, rejects duplicate email and never writes user data', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'line-billing-preflight-'));
 const before=process.env.FARMPRO_DATA_DIR;
 process.env.FARMPRO_DATA_DIR=root;
 const users=[
  {id:'line-owner',farmId:'farm-a',lineSubject:'Uline-a',loginMethod:'line',role:'owner',active:true,plan:'free'},
  {id:'email-owner',farmId:'farm-b',email:'used@example.invalid',role:'owner',active:true,plan:'standard'}
 ];
 try {
  const original=JSON.stringify(users);
  await fs.writeFile(path.join(root,'users.json'),original);
  const identity={userId:'line-owner',farmId:'farm-a',lineSubject:'Uline-a'};
  assert.equal((await inspectLineBillingEmailTarget(identity,'fresh@example.invalid')).eligible,true);
  await assert.rejects(inspectLineBillingEmailTarget(identity,'used@example.invalid'),/BILLING_EMAIL_UNAVAILABLE/);
  await assert.rejects(inspectLineBillingEmailTarget({...identity,farmId:'farm-b'},'fresh@example.invalid'),/BILLING_ACTOR_UNAVAILABLE/);
  await assert.rejects(inspectLineBillingEmailTarget({...identity,lineSubject:'other'},'fresh@example.invalid'),/BILLING_ACTOR_UNAVAILABLE/);
  assert.equal(await fs.readFile(path.join(root,'users.json'),'utf8'),original);
 } finally {
  if(before===undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR=before;
  await fs.rm(root,{recursive:true,force:true});
 }
});
