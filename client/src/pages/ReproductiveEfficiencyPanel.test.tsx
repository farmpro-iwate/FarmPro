import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { buildMaternalAnalysis, type MaternalSnapshot } from '../utils/maternalAnalysis';
import { ReproductiveEfficiencyPanel } from './ReproductiveEfficiencyPanel';

afterEach(cleanup);
const data: MaternalSnapshot = {
  cattle: [1, 2, 3, 4].map(id => ({ id, name: `検証母${id}`, earTag: `00${id}`, sex: '雌' })), calves: [], sales: [],
  calvings: [{ id: 'c1', cowId: '001', actualCalvingDate: '2026-07-01' }],
  breedings: [
    { id: 'a', cowEarTag: '001', breedingMethod: '種付', heatDate: '2026-08-15', inseminationDate: '2026-08-15', pregnancyCheckDate: '2026-10-01', pregnancyResult: '受胎' },
    { id: 'b', cowEarTag: '002', breedingMethod: '種付', heatDate: '2026-08-20', inseminationDate: '2026-08-20', pregnancyCheckDate: '2026-10-01', pregnancyResult: '空胎' },
  ],
};
const open = () => render(<MemoryRouter><ReproductiveEfficiencyPanel analysis={buildMaternalAnalysis(data, { today: '2026-11-08' })} asOf="2026-11-08" /></MemoryRouter>);
describe('reproductive efficiency view', () => {
  it('shows completed postpartum averages, target guidance and separate missing metrics', () => {
    open();
    const table = screen.getByRole('table', { name: '母牛別の繁殖効率' });
    expect(within(table).getAllByText('45日')).toHaveLength(2);
    expect(screen.getByText(/目安40〜50日/)).toBeInTheDocument();
    expect(screen.getByText(/期間開始時に授精対象だった未妊娠牛を選択/)).toBeInTheDocument();
    expect(screen.getByText('発情発見率（21日間）').parentElement).toHaveTextContent('記録不足・要確認');
  });
  it('computes 50% x 50% = 25% only after the cohort is selected and clears it on a period change', () => {
    open();
    fireEvent.change(screen.getByLabelText('21日間の開始日'), { target: { value: '2026-08-01' } });
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);
    expect(screen.getByText('発情発見率（21日間）').parentElement).toHaveTextContent('50%');
    expect(screen.getByText('妊娠率（21日間）').parentElement).toHaveTextContent('25%');
    fireEvent.change(screen.getByLabelText('21日間の開始日'), { target: { value: '2026-08-02' } });
    expect(screen.getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText('妊娠率（21日間）').parentElement).toHaveTextContent('記録不足・要確認');
  });
  it('switches the three mother metrics between tables and graphs and exposes source dates', () => {
    open(); fireEvent.click(screen.getByRole('button', { name: 'グラフ' }));
    expect(screen.getByRole('figure', { name: '母牛別の分娩後初回授精日数' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '比較する繁殖効率' }));
    fireEvent.click(screen.getByRole('option', { name: '空胎日数' }));
    expect(screen.getByRole('figure', { name: '母牛別の空胎日数' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '一覧表' }));
    fireEvent.click(screen.getByText('母牛ごとの分娩後の経過'));
    expect(screen.getByText(/受胎成立 2026-08-15 人工授精/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '牛台帳を見る' })[0]).toHaveAttribute('href', '/cattle/1');
  });
});
