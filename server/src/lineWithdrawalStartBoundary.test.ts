import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('withdrawal OAuth start requires logged-in actor, trusted origin, and preview and cannot delete', async () => {
  const root=path.join(process.cwd(),'src');
  const [source, app]=await Promise.all([
    fs.readFile(path.join(root,'routes/lineWithdrawalStart.ts'),'utf8'),
    fs.readFile(path.join(root,'app.ts'),'utf8'),
  ]);
  assert.match(source, /post\('\/start', requireAuth/);
  assert.match(source, /FARMPRO_LINE_FULL_APP_PREVIEW !== 'true'/);
  assert.match(source, /isTrustedLineOrigin\(req\.get\('Origin'\)\)/);
  assert.match(source, /getNativeLineSubjectForSession\(actor\.id, actor\.farmId\)/);
  assert.match(source, /httpOnly: true, secure: true, sameSite: 'lax'/);
  assert.doesNotMatch(source, /executeAccountWithdrawal|consumeLineWithdrawalConfirmation/);
  assert.doesNotMatch(app, /app\.use\([^\n]*lineWithdrawalStartRouter/);
});
