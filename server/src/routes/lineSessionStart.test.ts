import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('LINE OAuth start is unmounted and uses secure browser-bound cookie', async () => {
 const app=await fs.readFile(path.join(process.cwd(),'src/app.ts'),'utf8');
 const route=await fs.readFile(path.join(process.cwd(),'src/routes/lineSessionStart.ts'),'utf8');
 assert.equal(app.includes('lineSessionStartRouter'),false);
 assert.match(route,/issueDurableLineChallenge\(browserSecret\)/);
 assert.match(route,/httpOnly: true, secure: true, sameSite: 'lax'/);
 assert.match(route,/getLineLoginConfig/);
 assert.match(route,/makeLineAuthorizationUrl/);
});
