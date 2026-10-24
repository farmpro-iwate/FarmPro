import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('full-app LINE cannot bypass farm-authenticated cattle API', async () => {
  const root = path.join(process.cwd(), 'src');
  const [app, middleware, cattle] = await Promise.all([
    fs.readFile(path.join(root, 'app.ts'), 'utf8'),
    fs.readFile(path.join(root, 'authMiddleware.ts'), 'utf8'),
    fs.readFile(path.join(root, 'routes/cattle.ts'), 'utf8'),
  ]);
  const gate = app.indexOf("app.use('/api', requireAuth)");
  const cattleMount = app.indexOf("app.use('/api/cattle', cattleRouter)");
  assert.ok(gate >= 0 && cattleMount > gate, 'cattle routes must remain behind authentication');
  assert.match(middleware, /const user = await verifyToken\(token\)/);
  assert.match(middleware, /withFarmRequest\(user\.farmId/);
  assert.match(middleware, /runWithFarm\(current\.farmId, next\)/);
  assert.match(cattle, /listCattle\(\)/);
  assert.match(cattle, /createCattle\(req\.body\)/);
  assert.match(app, /FARMPRO_LINE_FULL_APP_PREVIEW === 'true'/);
  assert.match(app, /LINE_FULL_APP_PREVIEW_ISOLATION_REQUIRED/);
});
