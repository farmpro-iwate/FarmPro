import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('LINE login flow composes start/callback/finish but remains unmounted', async () => {
 const base=process.cwd();
 const combined=await fs.readFile(path.join(base,'src/routes/lineSession.ts'),'utf8');
 const app=await fs.readFile(path.join(base,'src/app.ts'),'utf8');
 for(const part of ['lineSessionStartRouter','lineSessionCallbackRouter','lineSessionFinishRouter']) assert.ok(combined.includes(part));
 assert.equal(app.includes('lineSessionRouter'),false);
});
