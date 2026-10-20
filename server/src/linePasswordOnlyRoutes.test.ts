import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('LINE-only sessions are explicitly blocked from legacy password-dependent account changes', async () => {
  const source = await fs.readFile(path.join(process.cwd(), 'src/routes/auth.ts'), 'utf8');
  for (const route of ['email-change/start', 'email-change/verify', 'password-change']) {
    const start = source.indexOf("authRouter.post('/" + route + "'");
    assert.notEqual(start, -1, 'missing route ' + route);
    const tail = source.slice(start, source.indexOf('\n});', start));
    assert.match(tail, /loginMethod === 'line' \|\| !user\.email/);
    assert.ok(tail.indexOf("loginMethod === 'line'") < tail.indexOf('const currentPassword') || !tail.includes('const currentPassword'));
  }
});
