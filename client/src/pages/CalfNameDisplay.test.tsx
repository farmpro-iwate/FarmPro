import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalfFeedingWeaningList } from './CalfFeedingWeaningList';
import { MarketShippingPlan } from './MarketShippingPlan';
import { getCalfList } from '../services/calfApi';
import { createSale, getSalesList } from '../services/salesApi';
import { getRecordById, saveRecord } from '../storage/repository';

vi.mock('../services/calfApi', () => ({ getCalfList: vi.fn() }));
vi.mock('../services/salesApi', () => ({ getSalesList: vi.fn(), createSale: vi.fn() }));
vi.mock('../storage/repository', () => ({ getRecordById: vi.fn(), saveRecord: vi.fn() }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => 'free' }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCalfList).mockResolvedValue([
    { id: 1, calfNumber: '9131', name: '' },
    { id: 2, calfNumber: '9132', name: '耳標未装着' },
    { id: 3, calfNumber: 'TEMP-MANUAL-3', name: '' },
    { id: 4, calfNumber: '9134', name: 'はる' },
  ].map(row => ({
    ...row, birthday: '2026-04-01', sex: '雌', managementStatus: '育成中',
    motherName: '母A', feedingMethod: '人工哺育', weaningStatus: '離乳前',
  })) as any);
  vi.mocked(getSalesList).mockResolvedValue([]);
  vi.mocked(getRecordById).mockResolvedValue({
    id: 'market-shipping-plan-settings', fiscalYear: '2026', minAgeDays: 260, maxAgeDays: 310,
    schedules: [{ id: 'fixture-market', marketName: '確認用市場', marketDate: '2027-01-01' }],
  });
});

afterEach(() => cleanup());

it.each([
  { page: '市場出荷予定', Component: MarketShippingPlan },
  { page: '哺育・離乳管理', Component: CalfFeedingWeaningList },
])('$pageで名号未定と耳標未装着を区別する', async ({ Component }) => {
  render(<MemoryRouter><Component /></MemoryRouter>);

  expect(await screen.findAllByText('子牛（名号未登録）', { exact: false })).toHaveLength(2);
  expect(screen.getAllByText('子牛（耳標未装着）', { exact: false })).toHaveLength(1);
  expect(screen.getByText('はる', { exact: false })).toBeInTheDocument();
  expect(saveRecord).not.toHaveBeenCalled();
  expect(createSale).not.toHaveBeenCalled();
});
