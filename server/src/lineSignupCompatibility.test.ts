import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLineSignupLedgerCompatible } from './lineSignupCompatibility';
import { planLineSignupLedgerCommit } from './lineSignupLedgerPlan';

const user = { id:'line-user', farmId:'line-farm', farmName:'農場', name:'利用者',
  loginMethod:'line' as const, role:'owner' as const, active:true as const, plan:'free' as const };
const ledger = planLineSignupLedgerCommit({version:1,entries:[]},'request-1','U123',user);

test('read-only compatibility check permits distinct legacy users and farms', () => {
  assert.doesNotThrow(() => assertLineSignupLedgerCompatible(
    ledger, [{id:'legacy-user',farmId:'legacy-farm'}],
    [{provider:'line',subject:'U456',userId:'legacy-user',linkedAt:'2026-10-16T00:00:00Z'}],
  ));
});

test('detects legacy ID, farm and provider subject collisions without writes', () => {
  assert.throws(()=>assertLineSignupLedgerCompatible(ledger,[{id:'line-user',farmId:'legacy-farm'}],[]),/STORE_COLLISION/);
  assert.throws(()=>assertLineSignupLedgerCompatible(ledger,[{id:'legacy-user',farmId:'line-farm'}],[]),/STORE_COLLISION/);
  assert.throws(()=>assertLineSignupLedgerCompatible(ledger,[],[{provider:'line',subject:'U123',userId:'legacy-user',linkedAt:'2026-10-16T00:00:00Z'}]),/STORE_COLLISION/);
});

test('rejects duplicated existing records rather than selecting an arbitrary user', () => {
  assert.throws(()=>assertLineSignupLedgerCompatible(ledger,[{id:'x',farmId:'farm-a'},{id:'x',farmId:'farm-b'}],[]),/EXISTING_USERS_INVALID/);
});
