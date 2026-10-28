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
  await expectVisible(page.getByText('10 本', { exact: true }), 'Stock balance 10');
  await page.screenshot({ path: new URL('medicine-stock-mobile.png', out).pathname, fullPage: true });

  await page.goto(base + 'expenses', { waitUntil: 'networkidle' });
  await expectVisible(
    page.getByText('ブラウザ検証用薬品 購入（CI-LOT-001）').first(),
    'Expense entry',
  );
  await page.screenshot({ path: new URL('purchase-expense-mobile.png', out).pathname, fullPage: true });

  await page.setViewportSize({ width: 1365, height: 900 });
  await page.goto(base + 'supply-inventory', { waitUntil: 'networkidle' });
  await expectVisible(page.getByText('10 本', { exact: true }), 'Desktop stock balance');
  await page.screenshot({ path: new URL('medicine-stock-desktop.png', out).pathname, fullPage: true });
  console.log('PASS: isolated browser medicine purchase -> stock 10 -> expense, mobile and desktop');

  // The following steps exercise the user's real screens on the same empty
  // browser profile. They never connect to a production or trial farm.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + 'treatments/new?targetNumber=9911&targetName=CI-test-cow', { waitUntil: 'networkidle' });
  await expectVisible(page.getByText('治療記録を新規登録'), 'Treatment registration');
  await page.getByLabel(/^症状/).fill('検証用発熱');
  await page.getByLabel(/治療日/).fill('2026-10-28');

  // The medicine selector is master-driven, so register the test medicine
  // through its genuine UI once, then choose it from the stock batch.
  await page.getByRole('combobox', { name: '使用薬剤／ワクチン' })
    .locator('xpath=ancestor::div[contains(@class, "MuiStack-root")][1]')
    .getByRole('button', { name: '新規登録', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/薬品・ワクチン名/).fill('ブラウザ検証用薬品');
  await dialog.getByRole('button', { name: '登録', exact: true }).click();
  await expectVisible(page.getByText('✓ ブラウザ検証用薬品'), 'Selected medicine master');
  await page.getByRole('combobox', { name: '薬剤の使用元' }).click();
  await page.getByRole('option', { name: '農場在庫から使用' }).click();
  await page.getByRole('combobox', { name: '使用する在庫・ロット' }).click();
  await page.getByRole('option', { name: /CI-LOT-001/ }).click();
  await page.getByLabel(/在庫からの使用数量/).fill('2');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expectVisible(page.getByText('治療管理', { exact: true }), 'Saved treatment list');

  await page.goto(base + 'supply-inventory', { waitUntil: 'networkidle' });
  await expectVisible(page.getByText('8 本', { exact: true }), 'Medicine remaining 8 after treatment');
  await page.screenshot({ path: new URL('medicine-treatment-stock.png', out).pathname, fullPage: true });
  console.log('PASS: treatment farm stock 10 -> 8');

  await page.goto(base + 'treatments/new?targetNumber=9922&targetName=CI-vet-cow', { waitUntil: 'networkidle' });
  await page.getByLabel(/^症状/).fill('獣医師処方の検証');
  await page.getByLabel(/治療日/).fill('2026-10-28');
  await page.getByRole('combobox', { name: '使用薬剤／ワクチン' }).fill('ブラウザ検証用薬品');
  await page.getByRole('option', { name: /ブラウザ検証用薬品/ }).click();
  await page.getByRole('combobox', { name: '薬剤の使用元' }).click();
  await page.getByRole('option', { name: '獣医師が処方・持参' }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expectVisible(page.getByText('治療管理', { exact: true }), 'Veterinarian supplied treatment list');
  await page.goto(base + 'supply-inventory', { waitUntil: 'networkidle' });
  await expectVisible(page.getByText('8 本', { exact: true }), 'Unchanged stock after vet supplied medicine');
  console.log('PASS: veterinarian-supplied medicine leaves farm stock at 8');

  await page.goto(base + 'supply-inventory/new?kind=' + encodeURIComponent('受精卵'), { waitUntil: 'networkidle' });
  await page.getByLabel(/受精卵名・品名/).fill('ブラウザ検証用受精卵');
  await page.getByLabel(/受精卵番号・管理番号/).fill('CI-EMB-001');
  await page.getByLabel(/^数量/).fill('2');
  await page.getByLabel(/購入先/).fill('検証用仕入先');
  await page.getByRole('button', { name: '内容を確認して保存' }).click();
  try {
    await expectVisible(page.getByText('2 個', { exact: true }), 'Embryo purchase increases stock to 2');
  } catch (cause) {
    console.error('EMBRYO PURCHASE DIAGNOSTIC URL:', page.url());
    console.error('EMBRYO PURCHASE DIAGNOSTIC TEXT:', (await page.locator('body').innerText()).slice(0, 3500));
    await page.screenshot({ path: new URL('embryo-purchase-diagnostic.png', out).pathname, fullPage: true });
    throw cause;
  }

  await page.goto(base + 'breedings/new?targetNumber=9933&targetName=CI-transfer-cow', { waitUntil: 'networkidle' });
  await page.getByLabel(/発情日/).fill('2026-10-25');
  await page.getByRole('button', { name: '発情を保存' }).click();
  await page.getByRole('button', { name: '受精卵移植を実施', exact: true }).click();
  await expectVisible(page.getByText('受精卵移植内容'), 'Embryo transfer form');
  await page.getByRole('combobox', { name: '受精卵の使用元' }).click();
  await page.getByRole('option', { name: '農場在庫から使用' }).click();
  await page.getByRole('combobox', { name: '使用する受精卵在庫' }).click();
  await page.getByRole('option', { name: /CI-EMB-001/ }).click();
  await page.getByLabel(/移植実施日/).fill('2026-10-28');
  await page.getByRole('button', { name: '受精卵移植を実施を保存' }).click();
  await expectVisible(page.getByText('繁殖管理', { exact: true }).first(), 'Breeding list after transfer');
  await page.goto(base + 'supply-inventory?kind=' + encodeURIComponent('受精卵'), { waitUntil: 'networkidle' });
  await expectVisible(page.getByText('1 個', { exact: true }), 'Embryo stock 2 -> 1 after transfer');
  await page.screenshot({ path: new URL('embryo-transfer-stock.png', out).pathname, fullPage: true });
  console.log('PASS: embryo purchase 2 -> transfer 1 -> balance 1');

} finally {
  await browser?.close();
}
