import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('withdrawal completion performs fresh nonce-bound LINE verification before confirming', async () => {
  const source = await fs.readFile(path.join(process.cwd(),'src','lineWithdrawalReauthentication.ts'),'utf8');
  const consume = source.indexOf('await consumeLineWithdrawalOAuthIntent(');
  const verify = source.indexOf('await exchangeAndVerifyLineCode(config, input.code, nonce)');
  const identity = source.indexOf('await assertNativeLineWithdrawalIdentity(');
  const issue = source.indexOf('return issueLineWithdrawalConfirmation(');
  assert.ok(consume >= 0 && verify > consume && identity > verify && issue > identity);
  assert.doesNotMatch(source, /verifiedIdentity:/);
  assert.doesNotMatch(source, /executeAccountWithdrawal/);
});
