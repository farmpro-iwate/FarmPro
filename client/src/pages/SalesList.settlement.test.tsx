import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SalesList } from './SalesList';
import { getSalesList, type SaleRecord } from '../services/salesApi';
import { getExpensesList, type ExpenseRecord } from '../services/expensesApi';
import { getOrCreateSaleCostSnapshot } from '../services/saleCostSnapshot';

vi.mock('../services/salesApi', () => ({ getSalesList: vi.fn(), deleteSale: vi.fn() }));
vi.mock('../services/expensesApi', () => ({ getExpensesList: vi.fn() }));
vi.mock('../services/saleCostSnapshot', () => ({ getOrCreateSaleCostSnapshot: vi.fn() }));

const sale = {
  id: 'local-sale', syncRecordId: 'sale:shared', status: '販売済み', targetType: '子牛',
  calfId: 'device-2-calf', targetNumber: 'TEST5954', targetName: 'TEST5954',
  salePrice: '500000', saleDate: '2026-10-27', productionCostSnapshot: 200000, profitSnapshot: 300000,
} as SaleRecord;
const fee = {
  id: 'fee', syncRecordId: 'settlement:fee', amount: '10000', category: '手数料',
  target: 'TEST5954', animalEarTag: 'TEST5954', animalType: 'calf', animalId: 'device-1-calf',
  settlementSaleId: 'sale:shared', settlementExpenseKind: 'created',
} as ExpenseRecord;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(getSalesList).mockResolvedValue([{ ...sale }]);
  vi.mocked(getExpensesList).mockResolvedValue([{ ...fee }]);
});

describe('sale and aggregate settlement profit display', () => {
  it('shows 290000 on the list and aggregate without rewriting fixed snapshots', async () => {
    render(<MemoryRouter><SalesList /></MemoryRouter>);
    expect((await screen.findAllByText('290,000円')).length).toBeGreaterThan(1);
    expect(screen.queryAllByText('300,000円')).toHaveLength(0);
    expect(getOrCreateSaleCostSnapshot).not.toHaveBeenCalled();
  });

  it('preserves a fixed zero production cost on a historical sale with no animal ID', async () => {
    vi.mocked(getSalesList).mockResolvedValue([{ ...sale, calfId: undefined, productionCostSnapshot: 0, profitSnapshot: 500000 }]);
    render(<MemoryRouter><SalesList /></MemoryRouter>);
    expect((await screen.findAllByText('490,000円')).length).toBeGreaterThan(1);
    expect(getOrCreateSaleCostSnapshot).not.toHaveBeenCalled();
  });

  it('labels historical ambiguous linked profits and aggregates 要確認 rather than showing a false number', async () => {
    vi.mocked(getExpensesList).mockResolvedValue([{ ...fee, settlementExpenseKind: 'linked' }]);
    render(<MemoryRouter><SalesList /></MemoryRouter>);
    expect((await screen.findAllByText('要確認')).length).toBeGreaterThan(1);
    expect(screen.queryAllByText('300,000円')).toHaveLength(0);
    expect(screen.queryAllByText('290,000円')).toHaveLength(0);
    expect(getOrCreateSaleCostSnapshot).not.toHaveBeenCalled();
  });
});
