import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('isolated LINE signup flow requires verified provider identity and explicit consent',async()=>{
 const root=process.cwd();
 const callback=await fs.readFile(path.join(root,'src/routes/lineSessionCallback.ts'),'utf8');
 const signup=await fs.readFile(path.join(root,'src/routes/linePreviewSignup.ts'),'utf8');
 const page=await fs.readFile(path.join(root,'src/routes/linePreviewSignupPage.ts'),'utf8');
 const preview=await fs.readFile(path.join(root,'src/lineTrialApp.ts'),'utf8');
 const production=await fs.readFile(path.join(root,'src/app.ts'),'utf8');
 assert.match(callback,/issueLineSignupTicket\(verified\.subject\)/);
 assert.match(signup,/persistCanonicalLineSignupFromTicket/);
 assert.match(signup,/validateLineFreeSignupProfile/);
 assert.match(signup,/isTrustedLineOrigin/);
 assert.match(page,/type="checkbox"/);
 assert.match(page,/confirm\.checked/);
 assert.match(page,/LINEでログイン/);
 assert.match(page,/id="signin" hidden/);
 assert.match(page,/if\(r\.ok\)/);
 assert.match(preview,/linePreviewSignupRouter/);
 assert.match(preview,/linePreviewSignupPageRouter/);
 assert.match(production,/FARMPRO_LINE_FULL_APP_PREVIEW === 'true'/);
 assert.match(production,/app\.use\('\/api\/auth\/line', linePreviewSignupRouter\)/);
 assert.match(production,/app\.use\(linePreviewSignupPageRouter\)/);
 assert.match(signup,/FARMPRO_LINE_FULL_APP_PREVIEW/);
 assert.match(callback,/FARMPRO_LINE_FULL_APP_PREVIEW/);
});
