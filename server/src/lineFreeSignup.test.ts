import assert from 'node:assert/strict';
import test from 'node:test';
import { assertVerifiedLineSignupIdentity, validateLineFreeSignupProfile } from './lineFreeSignup';

test('explicitly confirmed LINE signup becomes a Free farm owner profile', () => {
  assert.deepEqual(validateLineFreeSignupProfile({farmName:'  青空農場 ',name:' 利用者 ',confirm:true}),{
    farmName:'青空農場',name:'利用者',role:'owner',plan:'free'
  });
});

test('rejects signup without explicit confirmation or required names', () => {
  assert.throws(()=>validateLineFreeSignupProfile({farmName:'農場',name:'利用者'}),/CONFIRMATION_REQUIRED/);
  assert.throws(()=>validateLineFreeSignupProfile({farmName:' ',name:'利用者',confirm:true}),/INVALID_FARM_NAME/);
  assert.throws(()=>validateLineFreeSignupProfile({farmName:'農場',name:' ',confirm:true}),/INVALID_NAME/);
  assert.throws(()=>validateLineFreeSignupProfile({farmName:'農場',name:'\u0000',confirm:true}),/INVALID_NAME/);
});

test('only a validated opaque LINE subject may be used for server-side signup', () => {
  assert.equal(assertVerifiedLineSignupIdentity('U123456789'), 'U123456789');
  assert.throws(()=>assertVerifiedLineSignupIdentity('email@example.com'),/INVALID_LINE_SUBJECT/);
  assert.throws(()=>assertVerifiedLineSignupIdentity(undefined),/UNVERIFIED_IDENTITY/);
});
