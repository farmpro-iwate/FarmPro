import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaternalAnalysisPage } from './MaternalAnalysisPage';
import { getMaternalSnapshot } from '../services/maternalAnalysisApi';
import type { MaternalSnapshot } from '../utils/maternalAnalysis';
vi.mock('../services/maternalAnalysisApi', () => ({ getMaternalSnapshot: vi.fn() }));
const fixture: MaternalSnapshot = {
  cattle: [{ id: 1, name: '検証母A', earTag: '0123', sex: '雌' }, { id: 2, name: '検証母B', earTag: '0456', sex: '雌' }],
  calves: [{ id: 10, name: '検証子A', calfNumber: 'TEST-10', motherCowId: '0123', motherName: '検証母A', birthday: '2025-01-01', sex: '去勢', sireName: '検証父A' }],
  calvings: [{ id: 'c1', cowId: '0123', cowName: '検証母A', actualCalvingDate: '2024-01-01' }],
  breedings: [],
  sales: [{ id: 's1', targetType: '子牛', targetNumber: 'TEST-10', birthday: '2025-01-01', status: '販売済み', saleDate: '2025-10-02', shippingDate: '2025-10-01', salePrice: '700000' }],
};
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getMaternalSnapshot).mockResolvedValue(fixture); });
afterEach(cleanup);
const open = () => render(<MemoryRouter><MaternalAnalysisPage /></MemoryRouter>);
describe('mother analysis page', () => {
  it('shows reproduction comparisons, source history, and the cattle link', async () => {
    open();
    const table = await screen.findByRole('table', { name: '母牛別の繁殖成績' });
    expect(within(table).getByText('366日')).toBeInTheDocument();
    expect(within(table).getAllByText('記録不足').length).toBeGreaterThan(0);
    fireEvent.click(within(table).getByRole('button', { name: '検証母A（耳標 0123）の詳細' }));
    expect(screen.getByRole('heading', { name: '検証母A（耳標 0123）の記録' })).toBeInTheDocument();
    expect(screen.getByText('検証子A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '牛台帳を見る' })).toHaveAttribute('href', '/cattle/1');
    expect(screen.getByText('検証父A')).toBeInTheDocument();
  });
  it('compares shipping age and price, filters by sex, and searches ear tags', async () => {
    open(); await screen.findByRole('table');
    fireEvent.click(screen.getByRole('tab', { name: '産子・販売成績' }));
    const table = screen.getByRole('table', { name: '母牛別の産子販売成績' });
    expect(within(table).getByText('273日')).toBeInTheDocument();
    expect(within(table).getByText('700,000円')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '産子の性別' }));
    fireEvent.click(screen.getByRole('option', { name: '雌' }));
    expect(within(table).queryByText('700,000円')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('母牛を検索'), { target: { value: '0456' } });
    expect(within(table).queryByText('検証母A')).not.toBeInTheDocument();
    expect(within(table).getByText('検証母B')).toBeInTheDocument();
  });
  it('shows the read error and retries via the refresh action', async () => {
    vi.mocked(getMaternalSnapshot).mockRejectedValueOnce(new Error('検証用の読込エラー'));
    open(); expect(await screen.findByText('検証用の読込エラー')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '最新の記録で再集計' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByText('検証用の読込エラー')).not.toBeInTheDocument();
  });
  it('does not invent values when there are no mother records', async () => {
    vi.mocked(getMaternalSnapshot).mockResolvedValue({ cattle: [], calves: [], calvings: [], breedings: [], sales: [] });
    open(); expect(await screen.findByText(/母牛の台帳記録がまだありません/)).toBeInTheDocument();
    expect(screen.queryByText('0円')).not.toBeInTheDocument();
  });
});
