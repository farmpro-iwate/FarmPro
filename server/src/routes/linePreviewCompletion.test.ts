import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('preview completion is isolated and never stores auth tokens', async () => {
 const root=process.cwd();
 const page=await fs.readFile(path.join(root,'src/routes/linePreviewCompletion.ts'),'utf8');
 const preview=await fs.readFile(path.join(root,'src/lineTrialApp.ts'),'utf8');
 const prod=await fs.readFile(path.join(root,'src/app.ts'),'utf8');
 assert.match(page,/\/api\/auth\/line\/finish/);
 assert.match(page,/Cache-Control/);
 assert.equal(page.includes('localStorage'),false);
 assert.equal(page.includes('sessionStorage'),false);
 assert.equal(page.includes('await r.json()'),false);
 assert.match(preview,/linePreviewCompletionRouter/);
 assert.equal(prod.includes('linePreviewCompletionRouter'),false);
});
