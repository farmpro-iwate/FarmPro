import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('withdrawal callback consumes browser-bound state before LINE verification and never deletes',async()=>{
 const root=path.join(process.cwd(),'src');
 const [callback,intent,app]=await Promise.all([
  fs.readFile(path.join(root,'routes/lineWithdrawalCallback.ts'),'utf8'),
  fs.readFile(path.join(root,'lineWithdrawalOAuthIntent.ts'),'utf8'),
  fs.readFile(path.join(root,'app.ts'),'utf8'),
 ]);
 assert.match(callback,/consumeLineWithdrawalOAuthCallback\(state,browserSecret\)/);
 assert.match(callback,/exchangeAndVerifyLineCode\(\{\.\.\.config,redirectUri:callback\},code,nonce\)/);
 assert.match(callback,/assertNativeLineWithdrawalIdentity\(actor,actor,identity\)/);
 assert.match(callback,/httpOnly:true,secure:true,sameSite:'strict'/);
 assert.doesNotMatch(callback,/executeAccountWithdrawal|finish\(root|fs\.rm/);
 assert.match(app,/FARMPRO_LINE_WITHDRAWAL_REAUTH_PREVIEW === 'true'/);
 assert.match(app,/app\.use\('\/api\/auth\/line\/withdrawal', lineWithdrawalCallbackRouter\)/);
 assert.match(intent,/return \{ nonce:entry\.nonce, actor:\{id:entry\.userId,farmId:entry\.farmId\} \}/);
});
