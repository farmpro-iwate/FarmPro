import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = 'http://127.0.0.1:4173/FarmPro/';
const out = new URL('../test-artifacts/', import.meta.url);
await mkdir(out, { recursive: true });

async function expectVisible(locator, description) {
  await locator.waitFor({ state: 'visible', timeout: 20000 });
  if (!(await locator.isVisible())) throw new Error(description + ' not visible');
}

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'ja-JP',
  });
  const page = await context.newPage();

  // All tests use the browser's fresh IndexedDB, never an existing farm.
  await page.goto(base + 'supply-inventory', { waitUntil: 'networkidle' });
  await expectVisible(page.getByText('医薬品・受精卵 在庫管理'), 'Stock page');
  await page.getByText('＋ 購入・入出庫を記録').click();
  await expectVisible(page.getByText('購入・入出庫を記録', { exact: true }), 'Purchase page');

  await page.getByLabel(/医薬品名/).fill('ブラウザ検証用薬品');
  await page.getByLabel(/ロット番号/).fill('CI-LOT-001');
  await page.getByLabel(/数量/).fill('10');
  await page.getByLabel(/購入先/).fill('検証用仕入先');
  await page.getByLabel(/単価（円）/).fill('200');
  await page.getByRole('checkbox', { name: /購入費用を経費にも登録する/ }).check();
  await page.getByRole('button', { name: '内容を確認して保存' }).click();

  await expectVisible(page.getByText('ブラウザ検証用薬品').first(), 'Saved medicine');
  await expectVisible(page.getByText('10 本'), 'Stock balance 10');
  await page.screenshot({ path: new URL('medicine-stock-mobile.png', out).pathname, fullPage: true });

  await page.goto(base + 'expenses', { waitUntil: 'networkidle' });
  await expectVisible(
    page.getByText('ブラウザ検証用薬品 購入（CI-LOT-001）').first(),
    'Expense entry',
  );
  await page.screenshot({ path: new URL('purchase-expense-mobile.png', out).pathname, fullPage: true });

  await page.setViewportSize({ width: 1365, height: 900 });
  await page.goto(base + 'supply-inventory', { waitUntil: 'networkidle' });
  await expectVisible(page.getByText('10 本'), 'Desktop stock balance');
  await page.screenshot({ path: new URL('medicine-stock-desktop.png', out).pathname, fullPage: true });
  console.log('PASS: isolated browser medicine purchase -> stock 10 -> expense, mobile and desktop');
} finally {
  await browser?.close();
}
