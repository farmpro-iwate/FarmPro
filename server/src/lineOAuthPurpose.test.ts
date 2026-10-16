import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLineOAuthPurpose } from './lineOAuthPurpose';

test('withdrawal OAuth cannot be substituted with login or account linking', () => {
  const withdrawal = {purpose:'withdrawal-reauth' as const,userId:'user-1',farmId:'farm-1'};
  assert.doesNotThrow(()=>assertLineOAuthPurpose(withdrawal,withdrawal));
  assert.throws(()=>assertLineOAuthPurpose({purpose:'login'},withdrawal),/PURPOSE_MISMATCH/);
  assert.throws(()=>assertLineOAuthPurpose({purpose:'account-link',userId:'user-1',farmId:'farm-1'},withdrawal),/PURPOSE_MISMATCH/);
  assert.throws(()=>assertLineOAuthPurpose({...withdrawal,farmId:'farm-2'},withdrawal),/PURPOSE_MISMATCH/);
  assert.throws(()=>assertLineOAuthPurpose({...withdrawal,userId:'user-2'},withdrawal),/PURPOSE_MISMATCH/);
});
test('login cannot accept withdrawal OAuth proof',()=>{
  assert.throws(()=>assertLineOAuthPurpose({purpose:'withdrawal-reauth',userId:'user-1',farmId:'farm-1'},{purpose:'login'}),/PURPOSE_MISMATCH/);
});
