import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('LINE login flow composes start/callback/finish and requires isolated full-app opt-in', async () => {
 const base=process.cwd();
 const combined=await fs.readFile(path.join(base,'src/routes/lineSession.ts'),'utf8');
 const app=await fs.readFile(path.join(base,'src/app.ts'),'utf8');
 for(const part of ['lineSessionStartRouter','lineSessionCallbackRouter','lineSessionFinishRouter']) assert.ok(combined.includes(part));
 assert.match(app,/FARMPRO_LINE_FULL_APP_PREVIEW === 'true'/);
 assert.match(app,/LINE_FULL_APP_PREVIEW_ISOLATION_REQUIRED/);
 assert.match(app,/app\.use\('\/api\/auth\/line', lineSessionRouter\)/);
});
