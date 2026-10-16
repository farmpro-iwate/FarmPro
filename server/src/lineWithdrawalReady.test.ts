import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLineWithdrawalReady } from './lineWithdrawalReady';

const now=Date.parse('2026-10-16T00:00:00Z');
const proof={purpose:'account-withdrawal' as const,userId:'user-1',farmId:'farm-1',verifiedAt:now-1000,expiresAt:now+100000,consumed:false};
const safety={isOwner:true,isOperator:false,isLegacySharedFarm:false,hasOtherFarmUsers:false,plan:'free' as const,hasOpenBankApplication:false,cardBillingVerifiedEnded:true};
test('ready only with LINE-only credentials, fresh proof and verified contract checks',()=>{
  assert.doesNotThrow(()=>assertLineWithdrawalReady({loginMethod:'line'},'user-1','farm-1',proof,safety,now));
  assert.throws(()=>assertLineWithdrawalReady({loginMethod:'line'},'user-1','farm-2',proof,safety,now),/REAUTH_REQUIRED/);
  assert.throws(()=>assertLineWithdrawalReady({loginMethod:'line'},'user-1','farm-1',proof,{...safety,plan:'standard'},now),/SAFETY_BLOCKED/);
  assert.throws(()=>assertLineWithdrawalReady({loginMethod:'line'},'user-1','farm-1',proof,{...safety,cardBillingVerifiedEnded:false},now),/SAFETY_BLOCKED/);
});
test('legacy account cannot enter LINE-only withdrawal path',()=>{
  assert.throws(()=>assertLineWithdrawalReady({email:'user@example.com',passwordSalt:'salt',passwordHash:'hash'},'user-1','farm-1',proof,safety,now),/LINE_WITHDRAWAL_ACCOUNT_REQUIRED/);
});
