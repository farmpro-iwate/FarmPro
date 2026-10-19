import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { persistCanonicalLineSignup } from './lineCanonicalSignupStore';
import { issueVerifiedLineLoginHandoff } from './lineLoginSessionBridge';
import { consumeLineHandoff } from './lineLoginHandoff';

test('verified LINE identity creates single-use handoff for matching account only',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'line-bridge-'));const old=process.env.FARMPRO_DATA_DIR;process.env.FARMPRO_DATA_DIR=root;
 try{
  await persistCanonicalLineSignup('Ubridge123',{id:'bridge-user',farmId:'bridge-farm',farmName:'Farm',name:'Owner',loginMethod:'line',role:'owner',active:true,plan:'free'});
  const ticket=await issueVerifiedLineLoginHandoff({subject:'Ubridge123'});
  assert.equal(await consumeLineHandoff(ticket),'bridge-user');
  await assert.rejects(consumeLineHandoff(ticket),/LINE_HANDOFF_EXPIRED/);
  await assert.rejects(issueVerifiedLineLoginHandoff({subject:'UnotFound'}),/LINE_ACCOUNT_NOT_FOUND/);
  const file=path.join(root,'users.json');const users=JSON.parse(await fs.readFile(file,'utf8'));users[0].active=false;await fs.writeFile(file,JSON.stringify(users));
  await assert.rejects(issueVerifiedLineLoginHandoff({subject:'Ubridge123'}),/LINE_USER_UNAVAILABLE/);
 }finally{if(old===undefined)delete process.env.FARMPRO_DATA_DIR;else process.env.FARMPRO_DATA_DIR=old;await fs.rm(root,{recursive:true,force:true})}
});