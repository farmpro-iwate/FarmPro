import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('production LINE signup is explicit opt-in and independent from preview', async () => {
 const root=path.join(process.cwd(),'src');
 const [app,signup,callback]=await Promise.all([
   fs.readFile(path.join(root,'app.ts'),'utf8'),
   fs.readFile(path.join(root,'routes/linePreviewSignup.ts'),'utf8'),
   fs.readFile(path.join(root,'routes/lineSessionCallback.ts'),'utf8'),
 ]);
 assert.match(app,/FARMPRO_LINE_SIGNUP_PRODUCTION === 'true'/);
 assert.match(app,/LINE_SIGNUP_MODE_CONFLICT/);
 assert.match(app,/originUrl\.hostname !== 'app\.farmpro-app\.jp'/);
 assert.match(app,/lineSignupProduction && \(originUrl\.hostname/);
 assert.match(signup,/FARMPRO_LINE_SIGNUP_PRODUCTION !== 'true'/);
 assert.match(callback,/FARMPRO_LINE_SIGNUP_PRODUCTION !== 'true'/);
});
