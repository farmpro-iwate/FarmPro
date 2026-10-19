import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('LINE preview requires explicit opt-in and remains separate from production app', async () => {
  const root=process.cwd();
  const preview=await fs.readFile(path.join(root,'src/lineTrialApp.ts'),'utf8');
  const production=await fs.readFile(path.join(root,'src/app.ts'),'utf8');
  assert.match(preview,/FARMPRO_LINE_ISOLATED_PREVIEW/);
  assert.match(preview,/FARMPRO_DATA_DIR/);
  assert.match(preview,/LINE_LOGIN_CALLBACK_URL/);
  assert.match(preview,/LINE_ISOLATED_AUTH_CONFIG_REQUIRED/);
  assert.match(preview,/FARMPRO_AUTH_SECRET/);
  assert.match(preview,/getLineLoginConfig/);
  assert.match(preview,/healthz/);
  assert.match(preview,/lineSessionRouter/);
  assert.match(preview,/LINE_ISOLATED_CALLBACK_HOST_FORBIDDEN/);
  assert.ok(preview.includes('app.farmpro-app.jp'));
  assert.ok(preview.includes('farmpro-line-test.onrender.com'));
  assert.match(preview,/LINE_ISOLATED_DATA_DIR_REUSE_FORBIDDEN/);
  assert.equal(production.includes('lineTrialApp'),false);
  assert.equal(production.includes('lineSessionRouter'),false);
});
