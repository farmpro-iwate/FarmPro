import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateWithdrawalSafety } from './withdrawalSafetyPreflight';

const safe={isOwner:true,isOperator:false,isLegacySharedFarm:false,hasOtherFarmUsers:false,plan:'free' as const,hasOpenBankApplication:false,cardBillingVerifiedEnded:true};
test('eligible Free farm owner requires no pending billing or shared users',()=>{
  assert.deepEqual(evaluateWithdrawalSafety(safe),{eligible:true,reasons:[]});
});
test('blocks paid contracts, shared farms and unsettled billing regardless of login method',()=>{
  const result=evaluateWithdrawalSafety({...safe,plan:'standard',hasOtherFarmUsers:true,hasOpenBankApplication:true,cardBillingVerifiedEnded:false});
  assert.equal(result.eligible,false);
  assert.equal(result.reasons.length,4);
});
test('operator and non-owner are rejected',()=>{
  assert.equal(evaluateWithdrawalSafety({...safe,isOperator:true}).eligible,false);
  assert.equal(evaluateWithdrawalSafety({...safe,isOwner:false}).eligible,false);
});
