import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareLineWithdrawalReauth } from './lineWithdrawalReauthStart';

const config = { clientId:'2012033386',clientSecret:'test-secret',redirectUri:'https://app.farmpro-app.jp/api/auth/line/callback' };
test('creates a withdrawal-only LINE challenge for an active user',()=>{
  const r=prepareLineWithdrawalReauth(config,{id:'user-one',farmId:'farm-one',active:true});
  assert.deepEqual(r.purpose,{purpose:'withdrawal-reauth',userId:'user-one',farmId:'farm-one'});
  assert.match(r.challenge.state,/^[a-f0-9]{64}$/);
  assert.match(r.challenge.nonce,/^[a-f0-9]{64}$/);
  const url=new URL(r.authorizationUrl);
  assert.equal(url.searchParams.get('state'),r.challenge.state);
  assert.equal(url.searchParams.get('nonce'),r.challenge.nonce);
});
test('never begins withdrawal reauth for missing or disabled user',()=>{
  assert.throws(()=>prepareLineWithdrawalReauth(config,null),/SESSION_REQUIRED/);
  assert.throws(()=>prepareLineWithdrawalReauth(config,{id:'user-one',farmId:'farm-one',active:false}),/SESSION_REQUIRED/);
});
