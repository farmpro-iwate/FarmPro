import 'fake-indexeddb/auto';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedingList } from './FeedingList';
import { ExpenseList } from './ExpenseList';
import { createFeeding } from '../services/feedingsApi';
import { createExpense } from '../services/expensesApi';
import { clearStore, getAllRecords } from '../storage/repository';

vi.mock('../plans/current-plan', () => ({
  getCurrentFarmProPlanId: () => 'free',
}));

vi.mock('../plans/policy', () => ({
  getFarmProPlan: () => ({ multiDeviceSync: false }),
}));

vi.mock('../services/authClient', () => ({
  getAuthToken: () => '',
  getStoredAuthUser: () => null,
}));

describe('飼料給与・経費の登録から一覧反映まで', () => {
  beforeEach(async () => {
    await clearStore('feedings');
    await clearStore('feedInventory');
    await clearStore('expenses');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('保存した飼料給与を飼料給与管理の一覧へ表示する', async () => {
    await createFeeding({
      feedingDate: '2026-09-23',
      target: '繁殖牛群',
      feedName: 'テスト配合飼料',
      amount: '12',
      unit: 'kg',
      unitPrice: '80',
      totalPrice: '960',
      purpose: '繁殖',
      memo: '給与テスト',
    });

    expect(await getAllRecords('feedings')).toHaveLength(1);
    expect(await getAllRecords('feedInventory')).toHaveLength(1);

    render(
      <MemoryRouter>
        <FeedingList />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '飼料給与管理' })).toBeInTheDocument();
    expect((await screen.findAllByText('テスト配合飼料')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('2026-09-23').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/繁殖牛群/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/12kg/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/960円/).length).toBeGreaterThan(0);
  });

  it('保存した経費を経費管理の一覧と集計へ表示する', async () => {
    await createExpense({
      paymentDate: '2026-09-23',
      category: '飼料費',
      expenseCategoryMasterId: undefined,
      description: 'テスト飼料購入',
      vendor: 'テスト商店',
      vendorMasterId: undefined,
      amount: '5000',
      paymentMethod: '現金',
      target: '農場全体',
      animalType: undefined,
      animalId: undefined,
      animalEarTag: undefined,
      animalName: undefined,
      sourceType: 'manual',
      sourceId: undefined,
      sourceDetail: undefined,
      memo: '経費テスト',
    });

    expect(await getAllRecords('expenses')).toHaveLength(1);

    render(
      <MemoryRouter>
        <ExpenseList />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '経費管理' })).toBeInTheDocument();
    expect((await screen.findAllByText('テスト飼料購入')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('テスト商店').length).toBeGreaterThan(0);
    expect(screen.getAllByText('飼料費').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5,000円/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/表示件数：1件/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/経費合計：/).length).toBeGreaterThan(0);
  });
});
