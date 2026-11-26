import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = 'http://127.0.0.1:4173';
const out = new URL('../test-artifacts/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' });
  const page = await context.newPage();
  await page.addInitScript(() => {
    // Isolated CI-only synthetic user. No real credentials, farm, server or production state.
    localStorage.setItem('farmpro.authToken', 'CI-NONPRODUCTION-LOCAL-ONLY');
    localStorage.setItem('farmpro.authUser', JSON.stringify({
      id:'ci-user',farmId:'ci-farm',farmName:'画面確認用農場',
      name:'画面確認',role:'owner',active:true,plan:'free'
    }));
  });
  // Boot verifies /api/auth/me. Respond only with a synthetic CI identity;
  // 401 would intentionally log the app out and make the screen test meaningless.
  // Playwright applies the newest matching route first.
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { id:'ci-user', farmId:'ci-farm',
      farmName:'画面確認用農場',name:'画面確認',role:'owner',active:true,plan:'free' } })
  }));
  await page.goto(base + '/market-results', { waitUntil:'domcontentloaded' });
  await page.getByText('子牛市場情報', { exact: true }).first().waitFor({ timeout:20000 });
  await page.getByRole('button', { name: '市場を追加' }).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
  if (overflow) throw new Error('Market page overflows 390px viewport');
  await page.screenshot({ path: new URL('paid-mainline-market-selection-390px.png',out).pathname,fullPage:true });
  await page.getByRole('button', { name: 'メニュー',exact:true }).first().click();
  await page.getByText('子牛市場を選択', { exact:true }).last().waitFor();
  await page.screenshot({path:new URL('paid-mainline-market-menu-390px.png',out).pathname,fullPage:true,animations:'disabled'});
  console.log('PASS: current paid-mainline AppLayout mobile menu and market selection screen');
  // Two independent browser profiles mimic separate paid-plan devices.
  // They share only the mock authenticated market API, not localStorage or IndexedDB.
  let cloud = { revision: 0, updatedAt: '', markets: [] };
  const fakeUser = { id:'paid-ci-user', farmId:'paid-ci-farm', farmName:'同期検証農場',
    name:'同期検証', role:'owner', active:true, plan:'standard' };
  async function paidDevice(width) {
    const browserContext = await browser.newContext({viewport:{width,height:844},locale:'ja-JP'});
    await browserContext.addInitScript(user => {
      localStorage.setItem('farmpro.authToken','CI-MOCK-PAID');
      localStorage.setItem('farmpro.authUser',JSON.stringify(user));
    }, fakeUser);
    await browserContext.route('**/api/**',route => route.fulfill({
      status:503,contentType:'application/json',body:'{}'
    }));
    await browserContext.route('**/api/auth/me',route => route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({user:fakeUser})
    }));
    await browserContext.route('**/api/market-watchlists',async route => {
      if (route.request().method()==='PUT') {
        const request = route.request().postDataJSON();
        if (request.baseRevision !== cloud.revision) {
          await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify(cloud)});
          return;
        }
        cloud = {revision:cloud.revision+1,updatedAt:new Date().toISOString(),markets:request.markets};
      }
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(cloud)});
    });
    const p=await browserContext.newPage();
    await p.goto(base + '/market-results',{waitUntil:'domcontentloaded'});
    await p.getByText('市場の選択内容はStandard・ProでPCとスマホに同期されます。').waitFor({timeout:20000});
    return {browserContext,p};
  }
  const first=await paidDevice(390);
  await first.p.getByRole('combobox',{name:'子牛市場を選択'}).click();
  await first.p.getByRole('option',{name:'県南家畜市場'}).click();
  await first.p.getByRole('button',{name:'市場を追加'}).click();
  await first.p.getByText('選択した市場（1件）').waitFor({timeout:10000});
  const second=await paidDevice(1280);
  await second.p.getByText('選択した市場（1件）').waitFor({timeout:10000});
  await second.p.getByText('県南家畜市場',{exact:true}).last().waitFor();
  if (cloud.markets[0]?.name!=='県南家畜市場') throw new Error('Paid device sync was not persisted');
  await second.browserContext.close();
  await first.browserContext.close();
  console.log('PASS: market selection propagates across separate paid-plan device profiles');

} finally { await browser.close(); }
