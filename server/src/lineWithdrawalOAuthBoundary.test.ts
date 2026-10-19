import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('withdrawal LINE OAuth must not be started by ordinary login routes', async () => {
  const root = path.join(process.cwd(), 'src');
  const [start, callback, finish, withdrawal] = await Promise.all([
    fs.readFile(path.join(root, 'routes/lineSessionStart.ts'), 'utf8'),
    fs.readFile(path.join(root, 'routes/lineSessionCallback.ts'), 'utf8'),
    fs.readFile(path.join(root, 'routes/lineSessionFinish.ts'), 'utf8'),
    fs.readFile(path.join(root, 'routes/accountWithdrawals.ts'), 'utf8'),
  ]);
  assert.match(start, /get\('\/start'/);
  assert.match(callback, /consumeDurableLineChallenge\(state, browserSecret\)/);
  assert.match(callback, /issueVerifiedLineLoginHandoff\(verified\)/);
  assert.match(finish, /consumeLineHandoff/);
  assert.doesNotMatch(start + callback + finish, /issueLineWithdrawalConfirmation|executeAccountWithdrawal/);
  assert.doesNotMatch(withdrawal, /issueLineWithdrawalConfirmation|consumeLineWithdrawalConfirmation/);
});
