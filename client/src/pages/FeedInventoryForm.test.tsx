import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedInventoryForm } from './FeedInventoryForm';
import * as inventoryApi from '../services/feedInventoryApi';
import * as costingApi from '../services/feedCostingSnapshot';
import * as settingsApi from '../services/settingsApi';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';

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

describe('FeedInventoryForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ defaultTaxRate: '10' } as any);
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([] as any);
  });

  afterEach(() => cleanup());

  it('入庫の数量×単価から税込金額と税抜金額を計算して保存する', async () => {
    const createFeedInventory = vi.spyOn(inventoryApi, 'createFeedInventory').mockResolvedValue({ id: 'fi1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feed-inventory/new']}>
        <Routes>
          <Route path="/feed-inventory/new" element={<FeedInventoryForm />} />
          <Route path="/feed-inventory" element={<div>飼料在庫一覧へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/入出庫日/), '2026-09-29');
    await user.type(screen.getByLabelText('飼料名'), '配合飼料');
    await user.type(screen.getByLabelText(/数量/), '10');
    await user.type(screen.getByLabelText(/単価（税込）/), '1100');

    expect(screen.getByLabelText(/金額（税込）/)).toHaveValue('11000');
    expect(screen.getByLabelText('税抜金額')).toHaveValue('10000');
    expect(screen.getByLabelText('消費税額')).toHaveValue('1000');

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(createFeedInventory).toHaveBeenCalledWith(expect.objectContaining({
      transactionType: '入庫',
      feedName: '配合飼料',
      quantity: '10',
      unitPrice: '1100',
      totalPrice: '11000',
      taxRate: '10',
      taxExcludedPrice: '10000',
      taxAmount: '1000',
    }));
    expect(await screen.findByText('飼料在庫一覧へ戻った')).toBeInTheDocument();
  });

  it('袋単位では袋数×1袋重量から合計重量を保存する', async () => {
    const createFeedInventory = vi.spyOn(inventoryApi, 'createFeedInventory').mockResolvedValue({ id: 'fi2' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feed-inventory/new']}>
        <FeedInventoryForm />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/入出庫日/), '2026-09-29');
    await user.click(screen.getByRole('combobox', { name: /単位/ }));
    await user.click(screen.getByRole('option', { name: '袋' }));
    await user.type(screen.getByLabelText('飼料名'), 'スターター');
    await user.type(screen.getByLabelText(/数量/), '5');
    await user.type(screen.getByLabelText(/1袋の重量/), '20');
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(screen.getByLabelText(/合計重量/)).toHaveValue('100');
    expect(createFeedInventory).toHaveBeenCalledWith(expect.objectContaining({
      unit: '袋',
      quantity: '5',
      bagWeightKg: '20',
      totalWeightKg: '100',
    }));
  });

  it('出庫時は在庫原価スナップショットの単価と使用原価で保存する', async () => {
    const createFeedInventory = vi.spyOn(inventoryApi, 'createFeedInventory').mockResolvedValue({ id: 'fi3' } as any);
    vi.spyOn(costingApi, 'buildFeedCostingSnapshot').mockResolvedValue({
      averageUnitCost: 87.5,
      usedCost: 875,
      usedQuantity: 10,
      targetType: 'farm',
      allocationMethod: 'equal',
      allocations: [],
      calculatedAt: '2026-09-29T00:00:00.000Z',
    } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feed-inventory/new?mode=use&feedName=%E9%85%8D%E5%90%88%E9%A3%BC%E6%96%99&unit=kg']}>
        <FeedInventoryForm />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/数量/), '10');
    await user.click(screen.getByRole('button', { name: '使用を記録' }));

    expect(costingApi.buildFeedCostingSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: '出庫',
        feedName: '配合飼料',
        quantity: '10',
      }),
      'farm',
      undefined,
    );
    expect(createFeedInventory).toHaveBeenCalledWith(expect.objectContaining({
      transactionType: '出庫',
      unitPrice: '87.5',
      totalPrice: '875',
      costing: expect.objectContaining({
        averageUnitCost: 87.5,
        usedCost: 875,
      }),
    }));
  });

  it('個体出庫では個体未選択を保存しない', async () => {
    const createFeedInventory = vi.spyOn(inventoryApi, 'createFeedInventory').mockResolvedValue({ id: 'fi4' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feed-inventory/new?mode=use&feedName=%E9%85%8D%E5%90%88%E9%A3%BC%E6%96%99&unit=kg']}>
        <FeedInventoryForm />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('combobox', { name: /使用先/ }));
    await user.click(screen.getByRole('option', { name: '個体' }));
    await user.type(screen.getByLabelText(/数量/), '5');
    screen.getByLabelText(/個体を選択/);

    await user.click(screen.getByRole('button', { name: '使用を記録' }));

    expect(createFeedInventory).not.toHaveBeenCalled();
  });
});
