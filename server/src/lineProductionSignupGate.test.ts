import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';

test('production auth schema must be migrated before LINE-only account writes are enabled', async () => {
  // Guard against accidentally mounting canonical LINE signup against the
  // legacy email/password-only production schema.
  const source = await fs.readFile(path.join(process.cwd(), 'src/authStore.ts'), 'utf8');
  const legacyEmailRequired = /email:\s*string\s*;/m.test(source);
  const legacySaltRequired = /passwordSalt:\s*string\s*;/m.test(source);
  const legacyHashRequired = /passwordHash:\s*string\s*;/m.test(source);
  assert.equal(legacyEmailRequired && legacySaltRequired && legacyHashRequired, true,
    'Review the schema compatibility gate before replacing this test.');
  // Fail-closed documentation: current production code must NOT call the
  // canonical LINE signup route until a separate credential model ships.
  const app = await fs.readFile(path.join(process.cwd(), 'src/app.ts'), 'utf8');
  assert.equal(app.includes('lineLoginRouter'), false,
    'LINE routes must remain disabled until authStore is migrated and tested.');
});


test('production custom hostname is not rejected solely because Render has a default service URL', async () => {
  const app = await fs.readFile(path.join(process.cwd(), 'src/app.ts'), 'utf8');
  assert.match(app, /fullAppLinePreview && deployedUrl && new URL\(deployedUrl\)\.origin !== originUrl\.origin/);
  assert.match(app, /lineSignupProduction && \(originUrl\.hostname !== 'app\.farmpro-app\.jp' \|\| !isProduction\)/);
});
