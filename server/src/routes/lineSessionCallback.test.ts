import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('LINE callback remains isolated and verifies browser-bound OAuth before handoff',async()=>{
 const root=process.cwd();
 const app=await fs.readFile(path.join(root,'src/app.ts'),'utf8');
 const callback=await fs.readFile(path.join(root,'src/routes/lineSessionCallback.ts'),'utf8');
 assert.equal(app.includes('lineSessionCallbackRouter'),false);
 assert.match(callback,/consumeDurableLineChallenge\(state, browserSecret\)/);
 assert.match(callback,/exchangeAndVerifyLineCode\(config, code, nonce\)/);
 assert.match(callback,/issueVerifiedLineLoginHandoff\(verified\)/);
 assert.match(callback,/httpOnly: true, secure: true, sameSite: 'strict'/);
 assert.match(callback,/res\.clearCookie\('farmpro_line_oauth'/);
 assert.match(callback,/FARMPRO_LINE_ISOLATED_PREVIEW === 'true'/);
 assert.match(callback,/\/login\/email\?line=complete/);
 assert.match(callback,/\/login\?line=complete/);
});
