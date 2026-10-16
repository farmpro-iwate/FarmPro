import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beginLineWithdrawalReauth } from './lineWithdrawalReauthBegin';
import { consumeLineOAuthPurpose } from './lineOAuthPurposeStore';

const config = {clientId:'test-channel',clientSecret:'test-only',redirectUri:'https://app.farmpro-app.jp/api/auth/line/callback'};

test('stores withdrawal-purpose state alongside browser-bound OAuth challenge',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'line-withdrawal-begin-'));
  const previous=process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR=root;
  try {
    const url=new URL(await beginLineWithdrawalReauth(config,'a'.repeat(64),{id:'user-one',farmId:'farm-one',active:true}));
    const state=url.searchParams.get('state');
    assert.match(state||'',/^[a-f0-9]{64}$/);
    await assert.rejects(consumeLineOAuthPurpose(state!,{purpose:'login'}),/PURPOSE_MISMATCH/);
    await assert.rejects(consumeLineOAuthPurpose(state!,{purpose:'withdrawal-reauth',userId:'user-one',farmId:'farm-one'}),/PURPOSE_EXPIRED/);
    assert.equal((await fs.readdir(root)).includes('users.json'),false);
  } finally {
    if(previous===undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=previous;
    await fs.rm(root,{recursive:true,force:true});
  }
});
test('rejects starting withdrawal reauth for disabled user without files',async()=>{
  await assert.rejects(beginLineWithdrawalReauth(config,'a'.repeat(64),{id:'user-one',farmId:'farm-one',active:false}),/SESSION_REQUIRED/);
});
