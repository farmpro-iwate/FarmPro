import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMaternalAnalysis, type MaternalSnapshot } from '../utils/maternalAnalysis';
import { ReproductiveEfficiencyPanel } from './ReproductiveEfficiencyPanel';

afterEach(cleanup);
const data: MaternalSnapshot = {
  cattle: [1, 2, 3, 4].map(id => ({ id, name: `検証母${id}`, earTag: `00${id}`, identificationNumber: `TEST-IDENT-${id}`, sex: '雌' })), calves: [], sales: [],
  calvings: [{ id: 'c1', cowId: '001', actualCalvingDate: '2026-07-01' }],
  breedings: [
    { id: 'a', cowEarTag: '001', breedingMethod: '種付', heatDate: '2026-08-15', inseminationDate: '2026-08-15', pregnancyCheckDate: '2026-10-01', pregnancyResult: '受胎' },
    { id: 'b', cowEarTag: '002', breedingMethod: '種付', heatDate: '2026-08-20', inseminationDate: '2026-08-20', pregnancyCheckDate: '2026-10-01', pregnancyResult: '空胎' },
  ],
};
function Harness({ input, onSelect }: { input: MaternalSnapshot; onSelect: (key: string) => void }) {
  const [year, setYear] = useState('2026');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  return <ReproductiveEfficiencyPanel analysis={buildMaternalAnalysis(input, { today: '2026-11-08' })} asOf="2026-11-08"
    year={year} onYearChange={value => { setYear(value); setSelected(''); }}
    query={query} onQueryChange={value => { setQuery(value); setSelected(''); }}
    selectedMotherKey={selected} onSelectMother={key => { setSelected(key); onSelect(key); }} />;
}
const open = (input = data, onSelect = vi.fn()) => ({ ...render(<Harness input={input} onSelect={onSelect} />), onSelect });
const choose = (label: string, option: string) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
};
const table = () => screen.getByRole('table', { name: '母牛別の繁殖成績' });
const rowFor = (name: string) => within(table()).getByText(name).closest('tr')!;

describe('unified reproductive performance view', () => {
  it('combines calving history metrics and postpartum metrics in one five-column table', () => {
    open({ ...data, calvings: [{ id: 'previous', cowId: '001', actualCalvingDate: '2025-07-01' }, ...data.calvings] });
    const row = rowFor('検証母1');
    expect(within(table()).getAllByRole('columnheader')).toHaveLength(5);
    expect(row).toHaveTextContent('平均間隔：365日');
    expect(row).toHaveTextContent('分娩 1回');
    expect(row).toHaveTextContent('期間内最終：2026/07/01');
    expect(within(row).getAllByText('45日')).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: '農場全体の繁殖実績' })).getAllByRole('heading', { level: 3 })).toHaveLength(4);
    expect(screen.getByText(/目安40〜50日/)).toBeInTheDocument();
    expect(screen.queryByText('確定妊鑑の受胎割合')).not.toBeInTheDocument();
  });
  it('uses a common detail action instead of a second all-mother postpartum section', () => {
    const { onSelect } = open();
    fireEvent.click(within(table()).getByRole('button', { name: '検証母1（耳標 001）の詳細' }));
    expect(onSelect).toHaveBeenCalledWith('1');
    expect(screen.queryByRole('button', { name: '母牛ごとの分娩後の経過' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '授精・移植と受胎の状況' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '候補を確認して集計' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('授精・移植記録から振り返る')).not.toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.getAllByRole('group', { name: '繁殖成績の表示方法' })).toHaveLength(1);
  });
  it('offers calving and breeding metrics in one graph selector and opens the same mother details', () => {
    const { onSelect } = open();
    fireEvent.click(screen.getByRole('button', { name: 'グラフ' }));
    expect(screen.getByRole('figure', { name: '母牛別の平均分娩間隔' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '比較する繁殖成績' }));
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
      '平均分娩間隔', '分娩回数', '授精・ET実施回数', '分娩後初回の授精・移植', '空胎日数', '受胎率',
    ]);
    fireEvent.click(screen.getByRole('option', { name: '空胎日数' }));
    const chart = screen.getByRole('figure', { name: '母牛別の空胎日数' });
    fireEvent.click(within(chart).getByRole('button', { name: '検証母1（耳標 001）' }));
    expect(onSelect).toHaveBeenCalledWith('1');
    fireEvent.click(screen.getByRole('button', { name: '一覧表' }));
    expect(table()).toBeInTheDocument();
  });
  it('keeps farm totals and reference denominators unchanged when searching the visible mothers', () => {
    open({ ...data, calvings: data.cattle.map(c => ({ id: `c${c.id}`, cowId: c.earTag, actualCalvingDate: '2026-06-01' })) });
    const summary = screen.getByRole('region', { name: '農場全体の繁殖実績' });
    const before = summary.textContent;
    expect(within(table()).getByRole('columnheader', { name: /授精・移植時の農場成績/ })).toHaveTextContent('参考値');
    expect(rowFor('検証母2')).toHaveTextContent('発情発見率：50%');
    expect(rowFor('検証母2')).toHaveTextContent('妊娠率：25%');
    fireEvent.change(screen.getByLabelText('母牛を検索'), { target: { value: 'TEST-IDENT-2' } });
    expect(within(table()).queryByText('検証母1')).not.toBeInTheDocument();
    const row = rowFor('検証母2');
    expect(row).toHaveTextContent('発情発見率：50%');
    expect(row).toHaveTextContent('妊娠率：25%');
    expect(row).toHaveTextContent('2026/07/31〜2026/08/20');
    expect(row).toHaveTextContent('対象候補 4頭');
    expect(summary.textContent).toBe(before);
    expect(screen.getByText(/表示中 1頭／全4頭/)).toBeInTheDocument();
  });
  it('uses the same selected year for calving metrics, service metrics and interval sorting', () => {
    open({ ...data, cattle: data.cattle.slice(0, 2), calvings: [
      { id: 'a24', cowId: '001', actualCalvingDate: '2024-01-01' },
      { id: 'a25', cowId: '001', actualCalvingDate: '2025-01-01' },
      { id: 'a26', cowId: '001', actualCalvingDate: '2026-01-01' },
      { id: 'b24', cowId: '002', actualCalvingDate: '2024-02-01' },
      { id: 'b25', cowId: '002', actualCalvingDate: '2025-01-01' },
      { id: 'b26', cowId: '002', actualCalvingDate: '2026-02-01' },
    ] });
    choose('並び順', '分娩間隔が短い順');
    expect(within(table()).getAllByRole('row')[1]).toHaveTextContent('検証母1');
    expect(rowFor('検証母1')).toHaveTextContent('平均間隔：365日');
    expect(rowFor('検証母1')).toHaveTextContent('人工授精：100%');
    choose('実績を振り返る年', '2025年');
    expect(within(table()).getAllByRole('row')[1]).toHaveTextContent('検証母2');
    expect(rowFor('検証母1')).toHaveTextContent('平均間隔：366日');
    expect(rowFor('検証母1')).toHaveTextContent('期間内最終：2025/01/01');
    expect(rowFor('検証母1')).not.toHaveTextContent('人工授精：100%');
    expect(rowFor('検証母1')).toHaveTextContent('授精・移植記録なし');
  });
  it('shows a concrete reason when an inseminated cow lacks target records', () => {
    open({ ...data, calvings: [{ ...data.calvings[0], actualCalvingDate: '2026-06-01' }] });
    expect(rowFor('検証母2')).toHaveTextContent('対象牛を確認：検証母2（耳標 002）／分娩日の記録がありません');
  });
  it('shows ET conception and first transfer with heat-only cows included in the farm reference', () => {
    open({ ...data,
      calvings: data.cattle.map(c => ({ id: `c${c.id}`, cowId: c.earTag, actualCalvingDate: '2026-06-01' })),
      breedings: [
        { id: 'et', cowEarTag: '001', breedingMethod: '受精卵移植', heatDate: '2026-08-13', transferDate: '2026-08-20', pregnancyCheckDate: '2026-10-01', pregnancyResult: '受胎' },
        { id: 'heat', cowEarTag: '002', breedingMethod: '種付', heatDate: '2026-08-18' },
      ],
    });
    const row = rowFor('検証母1');
    expect(row).toHaveTextContent('80日計算対象 1件ET移植 1件');
    expect(row).toHaveTextContent('73日計算対象 1件');
    expect(row).toHaveTextContent('ET：100%');
    expect(row).toHaveTextContent('受胎 1 / 移植 1回');
    expect(row).toHaveTextContent('発情発見率：50%');
    expect(row).toHaveTextContent('妊娠率：25%');
    expect(row).not.toHaveTextContent('人工授精記録なし');
  });
  it('keeps ET conception visible when a missing calving prevents day calculations', () => {
    open({ ...data, calvings: [], breedings: [
      { id: 'et', cowEarTag: '001', breedingMethod: '受精卵移植', heatDate: '2026-02-10', transferDate: '2026-02-17', pregnancyCheckDate: '2026-04-01', pregnancyResult: '受胎' },
    ] });
    const row = rowFor('検証母1');
    expect(row).toHaveTextContent('ET：100%');
    expect(row).toHaveTextContent('受胎 1 / 移植 1回');
    expect(within(row).getAllByText('計算対象 0件')).toHaveLength(2);
    expect(row).not.toHaveTextContent('0受胎');
  });
  it('shows both methods in one cell and preserves an unresolved ET instead of reporting failure', () => {
    open({ ...data, breedings: [
      { ...data.breedings[0], pregnancyResult: '空胎' },
      { id: 'et', cowEarTag: '001', breedingMethod: '受精卵移植', heatDate: '2026-10-20', transferDate: '2026-10-27', pregnancyResult: '未鑑定' },
    ] });
    const conception = within(rowFor('検証母1')).getAllByRole('cell')[3];
    expect(conception).toHaveTextContent('人工授精：0%');
    expect(conception).toHaveTextContent('ET：記録不足・要確認');
    expect(conception).toHaveTextContent('未確定 1回');
    expect(conception).not.toHaveTextContent('ET：0%');
  });
  it('shows the unresolved total when excluded ET records leave only a confirmed AI method', () => {
    const et = { cowEarTag: '001', breedingMethod: '受精卵移植', heatDate: '2026-10-20', transferDate: '2026-10-27', pregnancyCheckDate: '2026-11-01', pregnancyResult: '受胎' };
    open({ ...data, breedings: [data.breedings[0], { ...et, id: 'et1' }, { ...et, id: 'et2' }] });
    const conception = within(rowFor('検証母1')).getAllByRole('cell')[3];
    expect(conception).toHaveTextContent('人工授精：100%');
    expect(conception).toHaveTextContent('合計：記録不足・要確認');
  });
  it('distinguishes an empty search from a farm with no mother records', () => {
    open();
    fireEvent.change(screen.getByLabelText('母牛を検索'), { target: { value: '不存在の見本' } });
    expect(screen.getByText('検索条件に合う母牛がいません。')).toBeInTheDocument();
    expect(screen.queryByText('母牛の台帳記録がまだありません。')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '農場全体の繁殖実績' })).toHaveTextContent('50%');
  });
});
