import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beginLineWithdrawalReauth } from './lineWithdrawalReauthBegin';
import { completeLineWithdrawalReauthGuard } from './lineWithdrawalReauthComplete';
import { makeLineIdentityBinding } from './lineIdentityBinding';

const config = {clientId:'test-channel',clientSecret:'test-only',redirectUri:'https://app.farmpro-app.jp/api/auth/line/callback'};
test('withdrawal callback consumes state and purpose once for linked active user', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-reauth-complete-'));
  const original = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const browserSecret = 'a'.repeat(64);
    const currentUser = {id:'user-one',farmId:'farm-one',active:true};
    const state = new URL(await beginLineWithdrawalReauth(config,browserSecret,currentUser)).searchParams.get('state')!;
    const input = {state,browserSecret,verifiedSubject:'U123',currentUser,bindings:[makeLineIdentityBinding([],'U123','user-one')]};
    assert.deepEqual(await completeLineWithdrawalReauthGuard(input),{userId:'user-one',farmId:'farm-one'});
    await assert.rejects(completeLineWithdrawalReauthGuard(input));
  } finally {
    if(original===undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=original;
    await fs.rm(root,{recursive:true,force:true});
  }
});
test('ordinary login purpose cannot complete withdrawal reauth', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-reauth-mismatch-'));
  const original = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR=root;
  try {
    const browserSecret='b'.repeat(64), user={id:'user-one',farmId:'farm-one',active:true};
    const state=new URL(await beginLineWithdrawalReauth(config,browserSecret,user)).searchParams.get('state')!;
    await assert.rejects(completeLineWithdrawalReauthGuard({state,browserSecret,verifiedSubject:'U-other',currentUser:user,bindings:[makeLineIdentityBinding([],'U123','user-one')]}),/IDENTITY_MISMATCH/);
    await assert.rejects(completeLineWithdrawalReauthGuard({state,browserSecret,verifiedSubject:'U123',currentUser:user,bindings:[makeLineIdentityBinding([],'U123','user-one')]}));
  } finally {
    if(original===undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=original;
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('missing current session rejects LINE withdrawal reauth without issuing a reusable state', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-reauth-no-session-'));
  const original = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const browserSecret = 'c'.repeat(64);
    const user = {id:'user-one',farmId:'farm-one',active:true};
    const state = new URL(await beginLineWithdrawalReauth(config,browserSecret,user)).searchParams.get('state')!;
    const input = {state,browserSecret,verifiedSubject:'U123',currentUser:null,bindings:[makeLineIdentityBinding([],'U123','user-one')]};
    await assert.rejects(completeLineWithdrawalReauthGuard(input),/LINE_WITHDRAWAL_CURRENT_SESSION_REQUIRED/);
    await assert.rejects(completeLineWithdrawalReauthGuard({...input,currentUser:user}));
    await assert.rejects(fs.stat(path.join(root,'account-withdrawals.json')),{code:'ENOENT'});
  } finally {
    if(original===undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=original;
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('native LINE-only identity issues withdrawal proof only for matching subject and farm', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-native-withdrawal-'));
  const original = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const { completeLineWithdrawalAndIssueProof } = await import('./lineWithdrawalReauthIssue');
    const { consumeLineWithdrawalProof } = await import('./lineWithdrawalProofStore');
    const browserSecret = 'd'.repeat(64);
    const user = { id: 'native-one', farmId: 'farm-one', active: true };
    const nativeAccount = { id: user.id, farmId: user.farmId, loginMethod: 'line', lineSubject: 'U-native-one' };
    const state = new URL(await beginLineWithdrawalReauth(config, browserSecret, user)).searchParams.get('state')!;
    await assert.rejects(completeLineWithdrawalAndIssueProof({
      state, browserSecret, verifiedSubject: 'U-attacker', currentUser: user, bindings: [], nativeAccount,
    }), /LINE_WITHDRAWAL_IDENTITY_MISMATCH/);
    const validState = new URL(await beginLineWithdrawalReauth(config, browserSecret, user)).searchParams.get('state')!;
    const ticket = await completeLineWithdrawalAndIssueProof({
      state: validState, browserSecret, verifiedSubject: 'U-native-one',
      currentUser: user, bindings: [], nativeAccount,
    });
    assert.match(ticket, /^[a-f0-9]{64}$/);
    await consumeLineWithdrawalProof(ticket, user.id, user.farmId);
    await assert.rejects(consumeLineWithdrawalProof(ticket, user.id, user.farmId), /REAUTH_REQUIRED/);
    await assert.rejects(fs.stat(path.join(root, 'account-withdrawals.json')), { code: 'ENOENT' });
  } finally {
    if (original === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = original;
    await fs.rm(root, { recursive: true, force: true });
  }
});
