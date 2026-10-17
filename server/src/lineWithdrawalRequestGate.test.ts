import assert from 'node:assert/strict';
import test from 'node:test';
import { assessLineWithdrawalRequest } from './lineWithdrawalRequestGate';
const safety={isOwner:true,isOperator:false,isLegacySharedFarm:false,hasOtherFarmUsers:false,plan:'free' as const,hasOpenBankApplication:false,cardBillingVerifiedEnded:true};
const line={loginMethod:'line'};
test('valid LINE proof-shaped request with verified safe conditions passes preflight',()=>{
  assert.deepEqual(assessLineWithdrawalRequest(line,{lineProof:'a'.repeat(64)},safety),{method:'line',eligible:true});
});
test('open card/bank contracts and shared farm block even with LINE proof-shaped request',()=>{
  for(const patch of [{cardBillingVerifiedEnded:false},{hasOpenBankApplication:true},{hasOtherFarmUsers:true},{plan:'pro' as const}]){
    assert.throws(()=>assessLineWithdrawalRequest(line,{lineProof:'a'.repeat(64)},{...safety,...patch}),/SAFETY_BLOCKED/);
  }
});
test('legacy password account cannot use LINE withdrawal preflight',()=>{
  assert.throws(()=>assessLineWithdrawalRequest({email:'user@example.com',passwordSalt:'salt',passwordHash:'hash'},{lineProof:'a'.repeat(64)},safety),/PASSWORD_CONFIRMATION_REQUIRED/);
});

test('operator, non-owner and legacy shared farm cannot withdraw through LINE gate',()=>{
  for(const patch of [{isOperator:true},{isOwner:false},{isLegacySharedFarm:true},{plan:'standard' as const}]){
    assert.throws(()=>assessLineWithdrawalRequest(line,{lineProof:'a'.repeat(64)},{...safety,...patch}),/SAFETY_BLOCKED/);
  }
});
test('missing or malformed LINE proof is rejected before any withdrawal',()=>{
  for(const request of [{},{lineProof:''},{lineProof:'short'},{lineProof:null}]){
    assert.throws(()=>assessLineWithdrawalRequest(line,request,safety));
  }
});
