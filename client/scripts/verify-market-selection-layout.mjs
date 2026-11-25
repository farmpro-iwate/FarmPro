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
  await page.screenshot({path:new URL('paid-mainline-market-menu-390px.png',out).pathname,fullPage:true});
  console.log('PASS: current paid-mainline AppLayout mobile menu and market selection screen');
} finally { await browser.close(); }
