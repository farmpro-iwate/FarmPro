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

vi.mock('../components/FeedPurchaseExpenseDialog', () => ({
  FeedPurchaseExpenseDialog: ({ record, onClose }: any) => record ? (
    <div role="dialog" aria-label="飼料購入の経費確認">
      <span>購入金額 {record.totalPrice}円</span>
      <button onClick={onClose}>あとで確認</button>
    </div>
  ) : null,
}));

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

  it('個体出庫では死亡牛を除外し廃用後も在籍する牛を選択できる', async () => {
    const event = { date: '2026-09-01', reason: '検証', note: '', recordedAt: '2026-09-01T00:00:00Z' };
    const base = { id: 1, earTag: 'LIVE-COW', name: '在籍牛', stage: '繁殖牛' };
    vi.mocked(cattleApi.getCattleList).mockResolvedValue([base,
      { ...base, id: 2, earTag: 'DEAD-COW', name: '死亡牛', lifecycle: { version: 1, death: event } },
      { ...base, id: 3, earTag: 'CULLED-COW', name: '廃用牛', lifecycle: { version: 1, culling: { ...event, route: 'fattening' } } },
    ] as any);
    vi.mocked(calfApi.getCalfList).mockResolvedValue([{ id: 4, calfNumber: 'DEAD-CALF', name: '死亡子牛',
      managementStatus: '育成中', lifecycle: { version: 1, death: event } }] as any);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/feed-inventory/new?mode=use']}><FeedInventoryForm /></MemoryRouter>);
    await user.click(screen.getByRole('combobox', { name: /使用先/ }));
    await user.click(screen.getByRole('option', { name: '個体' }));
    await user.click(screen.getByRole('combobox', { name: /個体を選択/ }));
    expect(screen.getByRole('option', { name: /LIVE-COW/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /廃用・肥育中.*CULLED-COW/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /DEAD-COW/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /DEAD-CALF/ })).not.toBeInTheDocument();
  });

  it('入庫の数量×単価から税込金額と税抜金額を計算して保存する', async () => {
    const createFeedInventory = vi.spyOn(inventoryApi, 'createFeedInventory').mockImplementation(async input => ({
      ...input, id: 'fi1', createdAt: '2026-09-29T00:00:00Z', updatedAt: '2026-09-29T00:00:00Z',
    }));
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

    await user.click(screen.getByRole('checkbox', { name: '経費にも登録する' }));
    await user.click(screen.getByRole('button', { name: '入庫のみ登録' }));

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
    expect(createFeedInventory).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('飼料在庫一覧へ戻った')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '飼料購入の経費確認' })).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('checkbox', { name: '経費にも登録する' }));
    await user.click(screen.getByRole('button', { name: '入庫のみ登録' }));

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
