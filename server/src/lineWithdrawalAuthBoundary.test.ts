import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('LINE login handoff is not treated as withdrawal reauthentication', async () => {
  const root = path.join(process.cwd(), 'src');
  const [start, callback, finish, withdrawal] = await Promise.all([
    fs.readFile(path.join(root, 'routes/lineSessionStart.ts'), 'utf8'),
    fs.readFile(path.join(root, 'routes/lineSessionCallback.ts'), 'utf8'),
    fs.readFile(path.join(root, 'routes/lineSessionFinish.ts'), 'utf8'),
    fs.readFile(path.join(root, 'accountWithdrawalStore.ts'), 'utf8'),
  ]);
  // Current login OAuth is intentionally login-only. Reusing this handoff as
  // proof of a destructive action would be an authentication bypass.
  assert.match(start, /lineSessionStartRouter\.get\('\/start'/);
  assert.match(callback, /issueVerifiedLineLoginHandoff\(verified\)/);
  assert.match(finish, /consumeLineHandoff/);
  assert.doesNotMatch(start + callback + finish, /executeAccountWithdrawal|withdrawalProof|withdrawalIntent/);
  assert.match(withdrawal, /crypto\.scryptSync\(input\.password, state\.caller\.passwordSalt/);
});
