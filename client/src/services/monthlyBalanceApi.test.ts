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
});
