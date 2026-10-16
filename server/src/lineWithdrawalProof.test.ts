import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRecentLineWithdrawalProof } from './lineWithdrawalProof';

const now = Date.parse('2026-10-16T00:00:00Z');
const proof = {purpose:'account-withdrawal' as const,userId:'user-1',farmId:'farm-1',verifiedAt:now-1000,expiresAt:now+120000,consumed:false};
test('requires a recent purpose-bound proof for the same user and farm',()=>{
  assert.doesNotThrow(()=>assertRecentLineWithdrawalProof(proof,'user-1','farm-1',now));
  assert.throws(()=>assertRecentLineWithdrawalProof(proof,'other','farm-1',now),/REAUTH_REQUIRED/);
  assert.throws(()=>assertRecentLineWithdrawalProof(proof,'user-1','other',now),/REAUTH_REQUIRED/);
});
test('rejects normal login proof, replay, future and expired proof',()=>{
  assert.throws(()=>assertRecentLineWithdrawalProof({...proof,purpose:'login' as 'account-withdrawal'},'user-1','farm-1',now),/REAUTH_REQUIRED/);
  assert.throws(()=>assertRecentLineWithdrawalProof({...proof,consumed:true},'user-1','farm-1',now),/REAUTH_REQUIRED/);
  assert.throws(()=>assertRecentLineWithdrawalProof({...proof,verifiedAt:now+100},'user-1','farm-1',now),/REAUTH_REQUIRED/);
  assert.throws(()=>assertRecentLineWithdrawalProof({...proof,expiresAt:now-1},'user-1','farm-1',now),/REAUTH_REQUIRED/);
});
