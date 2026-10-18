import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRecentBillingReauth, type BillingReauthProof } from './lineBillingReauthProof';

const actor = {userId:'line-user',farmId:'farm-a',lineSubject:'Usubject'};
const proof: BillingReauthProof = {
 purpose:'billing-email-reauth',...actor,verifiedAt:1000,expiresAt:301000,consumed:false,
};
test('billing email proof requires same user, farm and LINE subject',()=>{
 assert.doesNotThrow(()=>assertRecentBillingReauth(proof,actor,1001));
 for(const wrong of [
  {...actor,userId:'other'}, {...actor,farmId:'farm-b'},
  {...actor,lineSubject:'Uother'},
 ]) assert.throws(()=>assertRecentBillingReauth(proof,wrong,1001),/REAUTH_REQUIRED/);
});
test('replay, expiry and future timestamps fail closed',()=>{
 assert.throws(()=>assertRecentBillingReauth({...proof,consumed:true},actor,1001),/REAUTH_REQUIRED/);
 assert.throws(()=>assertRecentBillingReauth(proof,actor,301000),/REAUTH_REQUIRED/);
 assert.throws(()=>assertRecentBillingReauth(proof,actor,999),/REAUTH_REQUIRED/);
 assert.throws(()=>assertRecentBillingReauth({...proof,expiresAt:601001},actor,1001),/REAUTH_REQUIRED/);
 assert.throws(()=>assertRecentBillingReauth(null,actor,1001),/REAUTH_REQUIRED/);
});
