import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beginLineWithdrawalReauth } from './lineWithdrawalReauthBegin';
import { completeLineWithdrawalAndIssueProof } from './lineWithdrawalReauthIssue';
import { consumeLineWithdrawalProof } from './lineWithdrawalProofStore';
import { makeLineIdentityBinding } from './lineIdentityBinding';

test('verified withdrawal callback issues exactly one redeemable proof', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'line-issue-proof-'));
  const old=process.env.FARMPRO_DATA_DIR; process.env.FARMPRO_DATA_DIR=root;
  try {
    const config={clientId:'test',clientSecret:'test',redirectUri:'https://app.farmpro-app.jp/api/auth/line/callback'};
    const browserSecret='a'.repeat(64);
    const user={id:'user-one',farmId:'farm-one',active:true};
    const state=new URL(await beginLineWithdrawalReauth(config,browserSecret,user)).searchParams.get('state')!;
    const input={state,browserSecret,verifiedSubject:'U123',currentUser:user,bindings:[makeLineIdentityBinding([],'U123','user-one')]};
    const proof=await completeLineWithdrawalAndIssueProof(input);
    assert.match(proof,/^[a-f0-9]{64}$/);
    await consumeLineWithdrawalProof(proof,'user-one','farm-one');
    await assert.rejects(consumeLineWithdrawalProof(proof,'user-one','farm-one'),/REAUTH_REQUIRED/);
    await assert.rejects(completeLineWithdrawalAndIssueProof(input));
  } finally {
    if(old===undefined)delete process.env.FARMPRO_DATA_DIR;else process.env.FARMPRO_DATA_DIR=old;
    await fs.rm(root,{recursive:true,force:true});
  }
});
