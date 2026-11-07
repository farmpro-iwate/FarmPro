import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FeedInventoryList } from './FeedInventoryList';
import * as inventoryApi from '../services/feedInventoryApi';

vi.mock('../components/FeedPurchaseExpenseDialog', () => ({
  FeedPurchaseExpenseDialog: ({ record, onClose }: any) => record ? (
    <div role="dialog" aria-label="飼料購入の経費確認">
      <span>{record.feedName}の購入金額 {record.totalPrice}円</span>
      <button onClick={onClose}>閉じる</button>
    </div>
  ) : null,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  const base = { ...inventoryApi.emptyFeedInventoryInput, quantity: '2', totalPrice: '2200',
    taxExcludedPrice: '2000', supplier: '検証用飼料店',
    createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' };
  vi.spyOn(inventoryApi, 'getFeedInventoryList').mockResolvedValue([
    { ...base, id: 'purchase-fixture', transactionDate: '2026-11-04', feedName: '購入飼料' },
    { ...base, id: 'outbound-fixture', transactionDate: '2026-11-03', feedName: '使用飼料', transactionType: '出庫' },
    { ...base, id: 'homegrown-fixture', transactionDate: '2026-11-02', feedName: '自家製牧草', sourceType: 'homegrown' },
    { ...base, id: 'adjustment-fixture', transactionDate: '2026-11-01', feedName: '棚卸飼料', transactionType: '調整' },
  ]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('過去の購入入庫から経費を確認でき、出庫・自家製・調整には登録入口を出さない', async () => {
  const user = userEvent.setup();
  const save = vi.spyOn(inventoryApi, 'createFeedInventory');
  const update = vi.spyOn(inventoryApi, 'updateFeedInventory');
  render(<MemoryRouter><FeedInventoryList /></MemoryRouter>);
  await screen.findAllByRole('button', { name: 'その他の操作' });
  await user.click(screen.getAllByRole('button', { name: 'その他の操作' })[0]);
  await user.click(screen.getByRole('menuitem', { name: '経費を確認・登録' }));
  expect(screen.getByRole('dialog', { name: '飼料購入の経費確認' })).toBeInTheDocument();
  expect(screen.getByText('購入飼料の購入金額 2200円')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '閉じる' }));

  for (const index of [1, 2, 3]) {
    await user.click(screen.getAllByRole('button', { name: 'その他の操作' })[index]);
    expect(screen.queryByRole('menuitem', { name: '経費を確認・登録' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '記録を修正' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
  }
  expect(save).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});
