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
const open = (input = data) => render(<MemoryRouter><ReproductiveEfficiencyPanel analysis={buildMaternalAnalysis(input, { today: '2026-11-08' })} asOf="2026-11-08" /></MemoryRouter>);
describe('reproductive efficiency view', () => {
  it('shows completed postpartum averages, target guidance and separate missing metrics', () => {
    open();
    const table = screen.getByRole('table', { name: '母牛別の繁殖成績' });
    expect(within(table).getAllByText('45日')).toHaveLength(2);
    expect(screen.getByText(/目安40〜50日/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '候補を確認して集計' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '妊娠率' })).not.toBeInTheDocument();
  });
  it('ends after postpartum details without the separate cycle controls and formula section', () => {
    open();
    expect(screen.getByRole('button', { name: '母牛ごとの分娩後の経過' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '授精・移植と受胎の状況' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('授精・移植記録から振り返る')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /計算方法・集計元の確認/ })).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: '母牛別の繁殖成績' })).toBeVisible();
  });
  it('switches the three mother metrics between tables and graphs and exposes source dates', () => {
    open(); fireEvent.click(screen.getByRole('button', { name: 'グラフ' }));
    expect(screen.getByRole('figure', { name: '母牛別の分娩後初回の授精・移植' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '比較する繁殖成績' }));
    fireEvent.click(screen.getByRole('option', { name: '空胎日数' }));
    expect(screen.getByRole('figure', { name: '母牛別の空胎日数' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '一覧表' }));
    fireEvent.click(screen.getByText('母牛ごとの分娩後の経過'));
    expect(screen.getByText(/受胎成立 2026-08-15 人工授精/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '牛台帳を見る' })[0]).toHaveAttribute('href', '/cattle/1');
  });
  it('shows farm reference rates directly in each mother row without any button press', () => {
    const input: MaternalSnapshot = { ...data, calvings: data.cattle.map(c => ({ id: `c${c.id}`, cowId: c.earTag, actualCalvingDate: '2026-06-01' })) };
    open(input);
    const table = screen.getByRole('table', { name: '母牛別の繁殖成績' });
    expect(within(table).getByRole('columnheader', { name: /授精・移植時の農場成績/ })).toHaveTextContent('参考値');
    const row = within(table).getByText('検証母2').closest('tr')!;
    expect(row).toHaveTextContent('発情発見率：50%');
    expect(row).toHaveTextContent('妊娠率：25%');
    expect(row).toHaveTextContent('2026/07/31〜2026/08/20');
    expect(row).toHaveTextContent('対象候補 4頭');
    expect(within(table).getByText('検証母3').closest('tr')).toHaveTextContent('授精・移植記録なし');
    expect(screen.getByText(/体調・休養は未確認/)).toBeVisible();
  });
  it('shows a concrete reason in the table when an inseminated cow lacks target records', () => {
    open({ ...data, calvings: [{ ...data.calvings[0], actualCalvingDate: '2026-06-01' }] });
    const row = within(screen.getByRole('table', { name: '母牛別の繁殖成績' })).getByText('検証母2').closest('tr')!;
    expect(row).toHaveTextContent('対象牛を確認：検証母2（耳標 002）／分娩日の記録がありません');
  });
  it('shows ET conception and first transfer with heat-only cows included in the farm reference', () => {
    const input: MaternalSnapshot = { ...data,
      calvings: data.cattle.map(c => ({ id: `c${c.id}`, cowId: c.earTag, actualCalvingDate: '2026-06-01' })),
      breedings: [
        { id: 'et', cowEarTag: '001', breedingMethod: '受精卵移植', heatDate: '2026-08-13', transferDate: '2026-08-20', pregnancyCheckDate: '2026-10-01', pregnancyResult: '受胎' },
        { id: 'heat', cowEarTag: '002', breedingMethod: '種付', heatDate: '2026-08-18' },
      ],
    };
    open(input);
    const row = within(screen.getByRole('table', { name: '母牛別の繁殖成績' })).getByText('検証母1').closest('tr')!;
    expect(row).toHaveTextContent('80日計算対象 1件ET移植 1件');
    expect(row).toHaveTextContent('73日計算対象 1件');
    expect(row).toHaveTextContent('ET：100%');
    expect(row).toHaveTextContent('受胎 1 / 移植 1回');
    expect(row).toHaveTextContent('発情発見率：50%');
    expect(row).toHaveTextContent('妊娠率：25%');
    expect(row).not.toHaveTextContent('人工授精記録なし');
    fireEvent.click(screen.getByText('母牛ごとの分娩後の経過'));
    expect(screen.getByText(/初回の授精・移植 2026-08-20 ET移植/)).toBeInTheDocument();
  });
  it('keeps ET conception visible when a missing calving prevents day calculations', () => {
    open({ ...data, calvings: [], breedings: [
      { id: 'et', cowEarTag: '001', breedingMethod: '受精卵移植', heatDate: '2026-02-10', transferDate: '2026-02-17', pregnancyCheckDate: '2026-04-01', pregnancyResult: '受胎' },
    ] });
    const row = within(screen.getByRole('table', { name: '母牛別の繁殖成績' })).getByText('検証母1').closest('tr')!;
    expect(row).toHaveTextContent('ET：100%');
    expect(row).toHaveTextContent('受胎 1 / 移植 1回');
    expect(within(row).getAllByText('計算対象 0件')).toHaveLength(2);
    expect(row).not.toHaveTextContent('0受胎');
  });
  it('shows both methods in one cell and preserves an unresolved ET instead of reporting failure', () => {
    const input: MaternalSnapshot = { ...data, breedings: [
      { ...data.breedings[0], pregnancyResult: '空胎' },
      { id: 'et', cowEarTag: '001', breedingMethod: '受精卵移植', heatDate: '2026-10-20', transferDate: '2026-10-27', pregnancyResult: '未鑑定' },
    ] };
    open(input);
    const row = within(screen.getByRole('table', { name: '母牛別の繁殖成績' })).getByText('検証母1').closest('tr')!;
    const conception = within(row).getAllByRole('cell')[3];
    expect(conception).toHaveTextContent('人工授精：0%');
    expect(conception).toHaveTextContent('ET：記録不足・要確認');
    expect(conception).toHaveTextContent('未確定 1回');
    expect(conception).not.toHaveTextContent('ET：0%');
  });
  it('shows the unresolved total when excluded ET records leave only a confirmed AI method', () => {
    const et = { cowEarTag: '001', breedingMethod: '受精卵移植', heatDate: '2026-10-20', transferDate: '2026-10-27', pregnancyCheckDate: '2026-11-01', pregnancyResult: '受胎' };
    open({ ...data, breedings: [data.breedings[0], { ...et, id: 'et1' }, { ...et, id: 'et2' }] });
    const row = within(screen.getByRole('table', { name: '母牛別の繁殖成績' })).getByText('検証母1').closest('tr')!;
    const conception = within(row).getAllByRole('cell')[3];
    expect(conception).toHaveTextContent('人工授精：100%');
    expect(conception).toHaveTextContent('合計：記録不足・要確認');
  });
});
