import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('LINE finish route remains unmounted and accepts ticket only via cookie', async () => {
 const base=process.cwd();
 const route=await fs.readFile(path.join(base,'src/routes/lineSessionFinish.ts'),'utf8');
 const app=await fs.readFile(path.join(base,'src/app.ts'),'utf8');
 assert.equal(app.includes('lineSessionFinishRouter'),false);
 assert.match(route,/isTrustedLineOrigin/);
 assert.match(route,/req\.headers\.cookie/);
 assert.equal(route.includes('req.body?.ticket'),false);
 assert.match(route,/res\.clearCookie/);
 assert.match(route,/finishLineLoginSession/);
});
