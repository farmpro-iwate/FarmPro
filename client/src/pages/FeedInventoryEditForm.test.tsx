import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedInventoryEditForm } from './FeedInventoryEditForm';
import * as inventoryApi from '../services/feedInventoryApi';
import * as settingsApi from '../services/settingsApi';

vi.mock('../components/FeedSearchField', () => ({
  FeedSearchField: ({ value, onChange }: any) => (
    <input aria-label="飼料名" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

vi.mock('../components/PartnerSearchField', () => ({
  PartnerSearchField: ({ label = '仕入先', value, onChange }: any) => (
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

const baseRecord = {
  id: 'fi1',
  transactionDate: '2026-09-01',
  feedName: '配合飼料',
  transactionType: '入庫',
  quantity: '10',
  unit: 'kg',
  bagWeightKg: '',
  totalWeightKg: '',
  unitPrice: '1100',
  totalPrice: '11000',
  supplier: 'JA',
  taxRate: '10',
  taxExcludedPrice: '10000',
  taxAmount: '1000',
  memo: '元データ',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('FeedInventoryEditForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(inventoryApi, 'getFeedInventory').mockResolvedValue(baseRecord as any);
    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ defaultTaxRate: '10' } as any);
  });

  afterEach(() => cleanup());

  it('既存の入庫記録を読み込み、数量変更後に税込・税抜金額を再計算して保存できる', async () => {
    const update = vi.spyOn(inventoryApi, 'updateFeedInventory').mockResolvedValue({ id: 'fi1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feed-inventory/fi1/edit']}>
        <Routes>
          <Route path="/feed-inventory/:id/edit" element={<FeedInventoryEditForm />} />
          <Route path="/feed-inventory" element={<div>飼料在庫一覧へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '飼料在庫 編集' });

    const quantity = screen.getByLabelText(/重量（kg）/);
    await user.clear(quantity);
    await user.type(quantity, '12');

    expect(screen.getByLabelText(/金額（税込）/)).toHaveValue('13200');
    expect(screen.getByLabelText('税抜金額')).toHaveValue('12000');
    expect(screen.getByLabelText('消費税額')).toHaveValue('1200');

    const memo = screen.getByLabelText('メモ');
    await user.clear(memo);
    await user.type(memo, '数量修正');

    await user.click(screen.getByRole('button', { name: '更新' }));

    expect(update).toHaveBeenCalledWith('fi1', expect.objectContaining({
      transactionDate: '2026-09-01',
      feedName: '配合飼料',
      transactionType: '入庫',
      quantity: '12',
      unit: 'kg',
      unitPrice: '1100',
      totalPrice: '13200',
      taxRate: '10',
      taxExcludedPrice: '12000',
      taxAmount: '1200',
      supplier: 'JA',
      memo: '数量修正',
    }));

    expect(await screen.findByText('飼料在庫一覧へ戻った')).toBeInTheDocument();
  });

  it('袋単位では袋数と1袋重量から合計重量を再計算して保存する', async () => {
    vi.spyOn(inventoryApi, 'getFeedInventory').mockResolvedValue({
      ...baseRecord,
      unit: '袋',
      quantity: '5',
      bagWeightKg: '20',
      totalWeightKg: '100',
      unitPrice: '2200',
      totalPrice: '11000',
    } as any);
    const update = vi.spyOn(inventoryApi, 'updateFeedInventory').mockResolvedValue({ id: 'fi1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feed-inventory/fi1/edit']}>
        <Routes>
          <Route path="/feed-inventory/:id/edit" element={<FeedInventoryEditForm />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '飼料在庫 編集' });

    const bags = screen.getByLabelText(/袋数/);
    await user.clear(bags);
    await user.type(bags, '6');

    expect(screen.getByLabelText(/合計重量/)).toHaveValue('120');

    await user.click(screen.getByRole('button', { name: '更新' }));

    expect(update).toHaveBeenCalledWith('fi1', expect.objectContaining({
      unit: '袋',
      quantity: '6',
      bagWeightKg: '20',
      totalWeightKg: '120',
      totalPrice: '13200',
    }));
  });

  it('必須の入出庫日を空にした場合は更新しない', async () => {
    const update = vi.spyOn(inventoryApi, 'updateFeedInventory').mockResolvedValue({ id: 'fi1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feed-inventory/fi1/edit']}>
        <Routes>
          <Route path="/feed-inventory/:id/edit" element={<FeedInventoryEditForm />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '飼料在庫 編集' });

    const date = screen.getByLabelText(/入出庫日/);
    await user.clear(date);
    expect(date).toBeRequired();

    await user.click(screen.getByRole('button', { name: '更新' }));

    expect(date).toBeInvalid();
    expect(update).not.toHaveBeenCalled();
  });
});
