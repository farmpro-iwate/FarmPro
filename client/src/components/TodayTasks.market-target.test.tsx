import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayTasks } from './TodayTasks';
import { HomeTaskSections } from './HomeTaskSections';
import * as scheduleApi from '../services/scheduleApi';
import * as vaccineApi from '../services/vaccineApi';
import * as blvApi from '../services/blvApi';
import * as treatmentApi from '../services/treatmentApi';
import * as salesApi from '../services/salesApi';
import * as calfApi from '../services/calfApi';

function makeSale(id: string, number: string, birthday: string): salesApi.SaleRecord {
  return {
    ...salesApi.emptySaleInput,
    id, targetType: '子牛', targetNumber: number, targetName: '子牛（耳標未装着）', birthday,
    shippingPlanDate: '2026-10-14', marketName: '岩手中央家畜市場', status: '出荷予定',
    createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
  };
}

function renderTasks() {
  return render(<MemoryRouter><TodayTasks renderItems={(items, loading, issues) => (
    <HomeTaskSections items={items} today="2026-10-06" loading={loading} issues={issues} />
  )} /></MemoryRouter>);
}

describe('home market cards use current calf ledger identity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 6, 12, 0, 0));
    vi.spyOn(scheduleApi, 'getScheduleList').mockResolvedValue([] as any);
    vi.spyOn(vaccineApi, 'getVaccineList').mockResolvedValue([] as any);
    vi.spyOn(blvApi, 'getBlvTestList').mockResolvedValue([] as any);
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([] as any);
    vi.spyOn(salesApi, 'getSalesList').mockResolvedValue([] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([] as any);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the two current names while keeping market dates, preparation, group and links', async () => {
    const sales = [
      Object.freeze(makeSale('sale-1', '5754', '2026-01-04')),
      Object.freeze(makeSale('sale-2', '5755', '2026-01-16')),
    ];
    const before = JSON.stringify(sales);
    const create = vi.spyOn(salesApi, 'createSale');
    vi.mocked(salesApi.getSalesList).mockResolvedValue(sales);
    vi.mocked(calfApi.getCalfList).mockResolvedValue([
      Object.freeze({ id: 91, calfNumber: '5754', name: 'ひめこ', birthday: '2026-01-04' }),
      Object.freeze({ id: 92, calfNumber: '5755', name: 'かつこ', birthday: '2026-01-16' }),
    ] as any);

    renderTasks();

    const first = await screen.findByRole('link', { name: /5754.*ひめこ/ });
    const second = screen.getByRole('link', { name: /5755.*かつこ/ });
    const ongoing = screen.getByRole('region', { name: '継続中・確認事項' });
    expect(within(ongoing).getByText('2 件')).toBeInTheDocument();
    for (const card of [first, second]) {
      expect(ongoing).toContainElement(card);
      expect(card).toHaveAttribute('href', '/market-shipping-plan');
      expect(within(card).getByText('市場まで8日')).toBeInTheDocument();
      expect(within(card).getByText('市場日：2026-10-14')).toBeInTheDocument();
      expect(card.textContent?.match(/2026-10-14/g)).toHaveLength(1);
      expect(within(card).getByText('体重確認')).toBeInTheDocument();
      expect(within(card).getByText('開く →')).toBeInTheDocument();
      expect(card).not.toHaveTextContent('耳標未装着');
    }
    expect(within(screen.getByRole('region', { name: '今日の対応' })).queryByRole('link')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '近日の対応' })).queryByRole('link')).not.toBeInTheDocument();
    expect(JSON.stringify(sales)).toBe(before);
    expect(create).not.toHaveBeenCalled();
  });

  it('refreshes a temporary calf to its assigned ear tag and name when home is reopened', async () => {
    const sale = Object.freeze(makeSale('sale-1', 'TEMP-MANUAL-1', '2026-01-04'));
    vi.mocked(salesApi.getSalesList).mockResolvedValue([sale]);
    vi.mocked(calfApi.getCalfList).mockResolvedValue([
      { id: 91, calfNumber: 'TEMP-MANUAL-1', name: '耳標未装着', birthday: '2026-01-04' },
    ] as any);
    const firstView = renderTasks();
    expect(await screen.findByRole('link', { name: /仮-0104.*子牛（耳標未装着）/ })).toBeInTheDocument();
    firstView.unmount();

    vi.mocked(calfApi.getCalfList).mockResolvedValue([
      { id: 91, calfNumber: '5754', temporaryCalfNumber: 'TEMP-MANUAL-1', name: 'ひめこ', birthday: '2026-01-04' },
    ] as any);
    renderTasks();
    const current = await screen.findByRole('link', { name: /5754.*ひめこ/ });
    expect(current).not.toHaveTextContent('耳標未装着');
    expect(current).toHaveTextContent('市場日：2026-10-14');
    expect(sale.targetNumber).toBe('TEMP-MANUAL-1');
    expect(sale.targetName).toBe('子牛（耳標未装着）');
    expect(sale.shippingPlanDate).toBe('2026-10-14');
    expect(calfApi.getCalfList).toHaveBeenCalledTimes(2);
  });

  it('keeps the recorded task and read warning when calf information cannot be loaded', async () => {
    vi.mocked(salesApi.getSalesList).mockResolvedValue([makeSale('sale-1', '5754', '2026-01-04')]);
    vi.mocked(calfApi.getCalfList).mockRejectedValue(new Error('test calf read failure'));
    renderTasks();
    expect(await screen.findByText(/子牛情報を読み込めませんでした/)).toBeInTheDocument();
    const card = screen.getByRole('link', { name: /5754.*子牛（耳標未装着）/ });
    expect(card).toHaveAttribute('href', '/market-shipping-plan');
    expect(card).toHaveTextContent('市場日：2026-10-14');
    expect(screen.queryByText('0 件')).not.toBeInTheDocument();
    expect(screen.queryByText(/対応予定はありません/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ひめこ/)).not.toBeInTheDocument();
  });

  it('does not use an ambiguous calf match or rename an adult sale with the same number', async () => {
    vi.mocked(salesApi.getSalesList).mockResolvedValue([
      { ...makeSale('sale-1', '5754', '2026-01-04'), targetName: '記録時の子牛名' },
      { ...makeSale('sale-2', '5754', '2026-01-04'), targetType: '成牛', targetName: '成牛の記録名' },
    ]);
    vi.mocked(calfApi.getCalfList).mockResolvedValue([
      { id: 91, calfNumber: '5754', name: '候補A', birthday: '2026-01-04' },
      { id: 92, calfNumber: '5754', name: '候補B', birthday: '2026-01-04' },
    ] as any);
    renderTasks();
    expect(await screen.findByRole('link', { name: /5754.*記録時の子牛名/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /5754.*成牛の記録名/ })).toBeInTheDocument();
    expect(screen.queryByText(/候補A|候補B/)).not.toBeInTheDocument();
  });
});
