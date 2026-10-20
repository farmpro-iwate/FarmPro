import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { issueLineHandoff } from './lineLoginHandoff';
import { finishLineLoginSession } from './lineLoginSessionFinish';
import { verifyToken } from './authStore';

test('LINE session finish is single-use and validates account state',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'line-finish-'));
 const oldDir=process.env.FARMPRO_DATA_DIR;
 const oldSecret=process.env.FARMPRO_AUTH_SECRET;
 process.env.FARMPRO_DATA_DIR=root;
 process.env.FARMPRO_AUTH_SECRET='line-finish-test-secret';
 try{
  const user={id:'line-user',farmId:'line-farm',farmName:'Farm',name:'Owner',loginMethod:'line',lineSubject:'Ufinish123',role:'owner',active:true,plan:'free'};
  await fs.writeFile(path.join(root,'users.json'),JSON.stringify([user]));
  const ticket=await issueLineHandoff(user.id);
  const result=await finishLineLoginSession(ticket);
  assert.equal(result.user.id,user.id);
  assert.equal(result.user.farmId,user.farmId);
  assert.equal('lineSubject' in result.user,false);
  assert.equal((await verifyToken(result.token))?.id,user.id);
  await assert.rejects(finishLineLoginSession(ticket),/LINE_HANDOFF_EXPIRED/);
  const next=await issueLineHandoff(user.id);
  user.active=false;
  await fs.writeFile(path.join(root,'users.json'),JSON.stringify([user]));
  await assert.rejects(finishLineLoginSession(next),/LINE_USER_UNAVAILABLE/);
 }finally{
  if(oldDir===undefined)delete process.env.FARMPRO_DATA_DIR;else process.env.FARMPRO_DATA_DIR=oldDir;
  if(oldSecret===undefined)delete process.env.FARMPRO_AUTH_SECRET;else process.env.FARMPRO_AUTH_SECRET=oldSecret;
  await fs.rm(root,{recursive:true,force:true});
 }
});
