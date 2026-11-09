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
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
  vi.mocked(getMaternalSnapshot).mockResolvedValue(fixture);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const open = (entry = '/analysis?scope=mothers') => render(<MemoryRouter initialEntries={[entry]}><MaternalAnalysisPage /></MemoryRouter>);
describe('mother analysis page', () => {
  it.each(['mothers', 'efficiency'])('opens one reproductive view from the existing %s link', async scope => {
    open(`/analysis?scope=${scope}`);
    expect(await screen.findByRole('table', { name: '母牛別の繁殖成績' })).toBeInTheDocument();
    const tabs = within(screen.getByRole('tablist', { name: '分析の対象' }));
    expect(tabs.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['農場全体', '繁殖成績', '産子・販売成績']);
    expect(screen.getByRole('tab', { name: '繁殖成績' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: '母牛の繁殖成績' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('table', { name: '母牛別の繁殖成績' })).toHaveLength(1);
    expect(screen.getByText('分娩後初回の授精・移植', { selector: 'h3' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '農場全体' }));
    expect(screen.getByRole('table', { name: '農場全体の月別繁殖成績' })).toBeInTheDocument();
  });
  it('shows reproduction comparisons, source history, and the cattle link', async () => {
    open();
    const table = await screen.findByRole('table', { name: '母牛別の繁殖成績' });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '実績を振り返る年' }));
    fireEvent.click(screen.getByRole('option', { name: '全期間' }));
    expect(within(table).getByText('366日')).toBeInTheDocument();
    expect(within(table).getAllByText(/記録不足/).length).toBeGreaterThan(0);
    fireEvent.click(within(table).getByRole('button', { name: '検証母A（耳標 0123）の詳細' }));
    expect(screen.getByRole('heading', { name: '検証母A（耳標 0123）の記録' })).toBeInTheDocument();
    expect(screen.getByText('検証子A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '牛台帳を見る' })).toHaveAttribute('href', '/cattle/1');
    expect(screen.getByText('検証父A')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '全期間の分娩履歴' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '全期間の分娩後の経過' })).toBeInTheDocument();
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
  it('keeps reproductive history independent of offspring filters and clears a hidden detail selection', async () => {
    open('/analysis?scope=offspring');
    await screen.findByRole('table', { name: '母牛別の産子販売成績' });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '産子の性別' }));
    fireEvent.click(screen.getByRole('option', { name: '雌' }));
    fireEvent.click(screen.getByRole('tab', { name: '繁殖成績' }));
    const table = screen.getByRole('table', { name: '母牛別の繁殖成績' });
    fireEvent.click(within(table).getByRole('button', { name: '検証母A（耳標 0123）の詳細' }));
    expect(screen.getByText('検証子A')).toBeInTheDocument();
    expect(screen.getByText(/性別：すべて/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('母牛を検索'), { target: { value: '0456' } });
    expect(screen.queryByRole('heading', { name: '検証母A（耳標 0123）の記録' })).not.toBeInTheDocument();
    fireEvent.click(within(table).getByRole('button', { name: '検証母B（耳標 0456）の詳細' }));
    expect(screen.getByRole('heading', { name: '検証母B（耳標 0456）の記録' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '実績を振り返る年' }));
    fireEvent.click(screen.getByRole('option', { name: '全期間' }));
    expect(screen.queryByRole('heading', { name: '検証母B（耳標 0456）の記録' })).not.toBeInTheDocument();
  });
  it('does not invent values when there are no mother records', async () => {
    vi.mocked(getMaternalSnapshot).mockResolvedValue({ cattle: [], calves: [], calvings: [], breedings: [], sales: [] });
    open(); expect(await screen.findByText(/母牛の台帳記録がまだありません/)).toBeInTheDocument();
    expect(screen.queryByText('0円')).not.toBeInTheDocument();
  });
  it('opens farm-wide analysis independently and switches between table and graph', async () => {
    open('/analysis');
    await screen.findByRole('table', { name: '農場全体の月別繁殖成績' });
    expect(screen.getByRole('tab', { name: '農場全体' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '集計する年（1月〜12月）' }));
    fireEvent.click(screen.getByRole('option', { name: '2025年' }));
    fireEvent.click(screen.getByRole('tab', { name: '販売・出荷成績' }));
    const table = screen.getByRole('table', { name: '農場全体の月別販売出荷成績' });
    const october = within(table).getByText('10月').closest('tr')!;
    expect(within(october).getAllByText('700,000円')).toHaveLength(2);
    expect(within(october).getByText('273日')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'グラフ' }));
    expect(screen.getByRole('figure', { name: '2025年・月別の子牛販売頭数' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'グラフにする指標' }));
    fireEvent.click(screen.getByRole('option', { name: '平均販売価格' }));
    expect(screen.getByRole('figure', { name: '2025年・月別の平均販売価格' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '一覧表' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
  it('does not apply mother search filters to the whole farm and supports mother charts', async () => {
    open(); await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('母牛を検索'), { target: { value: '0456' } });
    fireEvent.click(screen.getByRole('button', { name: 'グラフ' }));
    const chart = screen.getByRole('figure', { name: '母牛別の平均分娩間隔' });
    expect(within(chart).queryByRole('button', { name: /検証母A/ })).not.toBeInTheDocument();
    expect(within(chart).getByRole('button', { name: /検証母B/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '農場全体' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '集計する年（1月〜12月）' }));
    fireEvent.click(screen.getByRole('option', { name: '全期間（年別で比較）' }));
    expect(screen.getByRole('combobox', { name: '集計する年（1月〜12月）' })).toHaveTextContent('全期間（年別で比較）');
    const table = screen.getByRole('table', { name: '農場全体の年別繁殖成績' });
    expect(within(table).getByText('366日')).toBeInTheDocument();
    expect(getMaternalSnapshot).toHaveBeenCalledTimes(1);
  });
});
