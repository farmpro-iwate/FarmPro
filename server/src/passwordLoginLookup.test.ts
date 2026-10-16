import assert from 'node:assert/strict';
import test from 'node:test';
import { findPasswordLoginUser } from './passwordLoginLookup';

const legacy = { id:'legacy', active:true, email:'User@Example.com', passwordSalt:'salt', passwordHash:'hash' };
test('finds legacy email credentials alongside LINE-only records', () => {
  const users = [legacy, {id:'line',active:true,loginMethod:'line'}];
  assert.equal(findPasswordLoginUser(users, ' user@example.com ')?.id, 'legacy');
  assert.equal(findPasswordLoginUser(users, 'missing@example.com'), null);
});
test('LINE-only record cannot be selected for password login', () => {
  assert.equal(findPasswordLoginUser([{...legacy,loginMethod:'line'}], 'user@example.com'), null);
  assert.equal(findPasswordLoginUser([{...legacy,active:false}], 'user@example.com'), null);
});
test('ambiguous duplicate legacy credentials fail closed', () => {
  assert.equal(findPasswordLoginUser([legacy,{...legacy,id:'second'}], 'user@example.com'), null);
});
