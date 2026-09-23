import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedingList } from './FeedingList';
import { ExpenseList } from './ExpenseList';
import { createFeeding } from '../services/feedingsApi';
import { createExpense } from '../services/expensesApi';
import {
  getAllRecords,
  getRecordById,
  saveRecord,
  saveRecordPreservingTimestamps,
} from '../storage/repository';

vi.mock('../storage/repository', () => ({
  getAllRecords: vi.fn(),
  getRecordById: vi.fn(),
  saveRecord: vi.fn(),
  saveRecordPreservingTimestamps: vi.fn(),
  deleteRecord: vi.fn(),
}));

vi.mock('../plans/current-plan', () => ({
  getCurrentFarmProPlanId: () => 'free',
}));

vi.mock('../plans/policy', () => ({
  getFarmProPlan: () => ({ multiDeviceSync: false }),
}));

describe('飼料給与・経費の登録から一覧反映まで', () => {
  const stores: Record<string, any[]> = {
    feedings: [],
    expenses: [],
  };

  beforeEach(() => {
    for (const key of Object.keys(stores)) stores[key] = [];

    vi.mocked(getAllRecords).mockImplementation(async (storeName: any) => {
      return [...(stores[String(storeName)] ?? [])] as any;
    });

    vi.mocked(getRecordById).mockImplementation(async (storeName: any, id: any) => {
      return (stores[String(storeName)] ?? []).find((row) => String(row.id) === String(id)) as any;
    });

    vi.mocked(saveRecord).mockImplementation(async (storeName: any, record: any) => {
      const key = String(storeName);
      const rows = stores[key] ?? (stores[key] = []);
      const now = '2026-09-23T04:15:00.000Z';
      const saved = {
        ...record,
        createdAt: record.createdAt ?? now,
        updatedAt: now,
      };
      const index = rows.findIndex((row) => String(row.id) === String(saved.id));
      if (index >= 0) rows[index] = saved;
      else rows.push(saved);
      return saved as any;
    });

    vi.mocked(saveRecordPreservingTimestamps).mockImplementation(async (storeName: any, record: any) => {
      const key = String(storeName);
      const rows = stores[key] ?? (stores[key] = []);
      const saved = {
        ...record,
        createdAt: record.createdAt ?? '2026-09-23T04:15:00.000Z',
        updatedAt: record.updatedAt ?? '2026-09-23T04:15:00.000Z',
      };
      const index = rows.findIndex((row) => String(row.id) === String(saved.id));
      if (index >= 0) rows[index] = saved;
      else rows.push(saved);
      return saved as any;
    });
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

    expect(stores.feedings).toHaveLength(1);

    render(
      <MemoryRouter>
        <FeedingList />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '飼料給与管理' })).toBeInTheDocument();
    expect(screen.getAllByText('テスト配合飼料').length).toBeGreaterThan(0);
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

    expect(stores.expenses).toHaveLength(1);

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
