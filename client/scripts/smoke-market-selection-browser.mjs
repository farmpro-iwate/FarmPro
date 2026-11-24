import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = 'http://127.0.0.1:4173/FarmPro/';
const output = new URL('../test-artifacts/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' });
  const page = await context.newPage();
  await page.goto(base + 'market-results', { waitUntil: 'networkidle' });
  await page.getByText('子牛市場情報', { exact: true }).first().waitFor();
  const horizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 2
  );
  if (horizontalOverflow) throw new Error('Market results page overflows 390px mobile viewport');
  await page.getByRole('combobox', { name: '子牛市場を選択' }).click();
  await page.getByRole('option', { name: '県南家畜市場' }).click();
  await page.getByRole('button', { name: '市場を追加' }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('farmpro-market-watchlist-v1') || '[]'));
  if (stored.length !== 1 || stored[0].name !== '県南家畜市場') {
    throw new Error('Market selection did not persist');
  }
  await page.getByText('選択した市場（1件）').waitFor();
  await page.screenshot({ path: new URL('market-selection-mobile.png', output).pathname, fullPage: true });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('選択した市場（1件）').waitFor();
  await page.getByRole('button', { name: '削除' }).click();
  await page.getByText('選択した市場（0件）').waitFor();
  await page.screenshot({ path: new URL('market-selection-empty-mobile.png', output).pathname, fullPage: true });
  const empty = await page.evaluate(() => JSON.parse(localStorage.getItem('farmpro-market-watchlist-v1') || '[]'));
  if (empty.length !== 0) throw new Error('Market deletion not persisted');
  console.log('PASS: mobile market select -> save -> reload -> remove, no horizontal overflow');
} finally {
  await browser.close();
}
