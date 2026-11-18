import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllRecords } from '../storage/repository';
import { getSalesList } from './salesApi';
import { getMonthlyBalance } from './monthlyBalanceApi';

vi.mock('../storage/repository', () => ({
  getAllRecords: vi.fn(),
}));

vi.mock('./salesApi', () => ({
  getSalesList: vi.fn(),
}));

const mockedGetAllRecords = vi.mocked(getAllRecords);
const mockedGetSalesList = vi.mocked(getSalesList);

describe('monthlyBalanceApi labor cost', () => {
  beforeEach(() => {
    mockedGetAllRecords.mockReset();
    mockedGetSalesList.mockReset();
    mockedGetSalesList.mockResolvedValue([]);
  });

  it('人件費をその他経費と分けて集計する', async () => {
    mockedGetAllRecords.mockResolvedValue([
      {
        id: 'expense-labor-1',
        paymentDate: '2026-09-10',
        category: '人件費',
        description: '作業員給与',
        vendor: '',
        amount: '100000',
        paymentMethod: '銀行振込',
        target: '農場全体',
        memo: '',
        createdAt: '2026-09-10T00:00:00.000Z',
        updatedAt: '2026-09-10T00:00:00.000Z',
      },
    ] as any);

    const result = await getMonthlyBalance();
    const row = result.rows.find((item) => item.yearMonth === '2026-09');

    expect(row).toBeDefined();
    expect(row?.expenseTotalAmount).toBe(100000);
    expect(row?.expenseLaborAmount).toBe(100000);
    expect(row?.expenseOtherAmount).toBe(0);
    expect(result.totals.expenseLaborAmount).toBe(100000);
  });

  it('請求書払いでも入庫月の飼料費として一度だけ集計し、翌月に繰り越さない', async () => {
    // The stored paymentDate key is retained for cloud/backward compatibility,
    // but new feed-purchase records fill it with the purchase/inbound date.
    mockedGetAllRecords.mockResolvedValue([
      {
        id: 'feed-purchase-november',
        paymentDate: '2026-11-17',
        category: '飼料費',
        description: '11月購入の配合飼料',
        vendor: '確認用飼料店',
        amount: '55000',
        paymentMethod: '請求書払い',
        target: '農場全体',
        sourceType: 'feed-purchase',
        sourceId: 'feed-inventory:purchase-november',
        memo: '',
        createdAt: '2026-11-17T00:00:00.000Z',
        updatedAt: '2026-11-17T00:00:00.000Z',
      },
      {
        id: 'feed-purchase-december',
        paymentDate: '2026-12-02',
        category: '飼料費',
        description: '12月購入の牧草',
        vendor: '確認用飼料店',
        amount: '12000',
        paymentMethod: '現金',
        target: '農場全体',
        memo: '',
        createdAt: '2026-12-02T00:00:00.000Z',
        updatedAt: '2026-12-02T00:00:00.000Z',
      },
    ] as any);

    const result = await getMonthlyBalance();
    const november = result.rows.find(row => row.yearMonth === '2026-11');
    const december = result.rows.find(row => row.yearMonth === '2026-12');

    expect(november?.expenseFeedAmount).toBe(55000);
    expect(november?.expenseTotalAmount).toBe(55000);
    expect(november?.expenseCount).toBe(1);
    expect(december?.expenseFeedAmount).toBe(12000);
    expect(december?.expenseTotalAmount).toBe(12000);
    expect(december?.expenseCount).toBe(1);
    expect(result.totals.expenseFeedAmount).toBe(67000);
    expect(result.totals.expenseCount).toBe(2);
  });
});
