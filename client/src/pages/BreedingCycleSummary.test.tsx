import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { buildMaternalAnalysis, type MaternalSnapshot } from '../utils/maternalAnalysis';
import { buildReproductiveEfficiency } from '../utils/reproductiveEfficiency';
import { BreedingCycleSummary } from './BreedingCycleSummary';

afterEach(cleanup);
const fixture = (result = '未鑑定'): MaternalSnapshot => ({ cattle: [1, 2].map(id => ({ id, name: `見本母牛${id}`, earTag: `000${id}`, sex: '雌' })), calves: [], sales: [],
  calvings: [{ id: 'c', cowId: '0001', actualCalvingDate: '2026-09-01' }],
  breedings: [{ id: 'b', cowEarTag: '0001', breedingMethod: '種付', heatDate: '2026-10-20', inseminationDate: '2026-10-20', pregnancyResult: result, pregnancyCheckDate: result === '受胎' ? '2026-11-08' : '' }],
});
function view(data = fixture(), asOf = '2026-11-08') {
  const analysis = buildMaternalAnalysis(data, { today: asOf });
  return <MemoryRouter><BreedingCycleSummary analysis={analysis} report={buildReproductiveEfficiency(analysis, asOf)} asOf={asOf} /></MemoryRouter>;
}
const open = (data = fixture()) => render(view(data));
const card = (name: string) => screen.getByRole('heading', { name }).parentElement!;
const selectFirst = () => {
  fireEvent.click(screen.getByRole('button', { name: '候補を確認して集計' }));
  expect(screen.getByRole('checkbox', { name: '見本母牛1（耳標 0001）' })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'この1頭で集計' }));
};
describe('simple breeding cycle summary', () => {
  it('shows useful farm counts before any cohort setup without inventing rate denominators', () => {
    open();
    expect(card('授精・移植した牛')).toHaveTextContent('1頭');
    expect(card('受胎を確認')).toHaveTextContent('0頭');
    expect(card('鑑定待ち')).toHaveTextContent('1頭');
    expect(screen.queryByRole('heading', { name: '発情発見率' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('21日間の開始日')).not.toBeVisible();
    expect(screen.getByText('1頭の妊娠鑑定待ちです。')).toBeVisible();
    expect(screen.queryByText('記録不足・要確認')).not.toBeInTheDocument();
  });
  it('explains pending diagnoses and exposes the relevant cow instead of generic errors or 0%', () => {
    open(); selectFirst();
    expect(card('発情発見率')).toHaveTextContent('100%');
    expect(card('受胎率')).toHaveTextContent('鑑定待ち');
    expect(card('妊娠率')).toHaveTextContent('鑑定待ち');
    expect(screen.getByText(/鑑定結果を記録すると/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '鑑定待ちの牛を見る（1頭）' }));
    expect(screen.getByRole('link', { name: '牛台帳を見る' })).toHaveAttribute('href', '/cattle/1');
  });
  it('does not call pregnancy loss, contradictory dates or missing positive check dates diagnosis waiting', () => {
    open(fixture('流産・胎子喪失')); selectFirst();
    expect(card('鑑定待ち')).toHaveTextContent('0頭');
    expect(card('受胎率')).toHaveTextContent('記録を確認');
    expect(screen.queryByText(/鑑定結果を記録すると/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '成績が表示されない理由を見る' })).toBeVisible();
  });
  it('keeps confirmed rates and clears the selected denominator when the period changes', () => {
    open(fixture('受胎')); selectFirst();
    expect(card('妊娠率')).toHaveTextContent('100%');
    fireEvent.click(screen.getByRole('button', { name: '期間・対象牛を変更' }));
    fireEvent.change(screen.getByLabelText('21日間の開始日'), { target: { value: '2026-10-18' } });
    expect(screen.queryByRole('heading', { name: '妊娠率' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '見本母牛1（耳標 0001）' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '見本母牛2（耳標 0002）' })).not.toBeChecked();
    expect(card('受胎を確認')).toHaveTextContent('1頭');
  });
  it('uses cow counts for repeated treatments and keeps unresolved results pending', () => {
    const data = fixture(); data.breedings.push({ ...data.breedings[0], id: 'b2', heatDate: '2026-10-25', inseminationDate: '2026-10-25' });
    open(data); selectFirst();
    expect(card('授精・移植した牛')).toHaveTextContent('1頭'); expect(card('授精・移植した牛')).toHaveTextContent('人工授精 2回');
    expect(card('受胎率')).toHaveTextContent('鑑定待ち');
    expect(card('妊娠率')).toHaveTextContent('鑑定待ち');
  });
  it('does not infer a detected heat from a pending treatment without a heat record', () => {
    const data = fixture(); data.breedings[0].heatDate = '';
    open(data); selectFirst();
    expect(card('発情発見率')).toHaveTextContent('0%');
    expect(card('妊娠率')).toHaveTextContent('鑑定待ち');
  });
  it('preselects only provisional candidates, explains missing records and waits for confirmation', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: '候補を確認して集計' }));
    expect(screen.getByRole('checkbox', { name: '見本母牛1（耳標 0001）' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '見本母牛2（耳標 0002）' })).not.toBeChecked();
    expect(screen.getByText(/候補：開始時点で産後48日/)).toBeVisible();
    expect(screen.getByText(/要確認：分娩日の記録がありません/)).toBeVisible();
    expect(screen.getByText(/体調や休養中かどうかを確認/)).toBeVisible();
    expect(screen.queryByRole('heading', { name: '妊娠率' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: '見本母牛2（耳標 0002）' }));
    fireEvent.click(screen.getByRole('button', { name: 'この2頭で集計' }));
    expect(card('発情発見率')).toHaveTextContent('50%');
  });
  it('requires confirmation again after manual changes or a different postpartum threshold', () => {
    open(fixture('受胎')); selectFirst();
    fireEvent.click(screen.getByRole('button', { name: '期間・対象牛を変更' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '見本母牛2（耳標 0002）' }));
    expect(screen.queryByRole('heading', { name: '妊娠率' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('繁殖対象とする産後日数'), { target: { value: '50' } });
    expect(screen.getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText(/基準50日未満/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'この0頭で集計' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('繁殖対象とする産後日数'), { target: { value: '40' } });
    expect(screen.getByRole('checkbox', { name: '見本母牛1（耳標 0001）' })).toBeChecked();
    expect(screen.queryByRole('heading', { name: '妊娠率' })).not.toBeInTheDocument();
  });
  it('lets the farmer remove a resting cow without falling back to all cows', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: '候補を確認して集計' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '見本母牛1（耳標 0001）' }));
    expect(screen.getByRole('button', { name: 'この0頭で集計' })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: '発情発見率' })).not.toBeInTheDocument();
  });
  it('looks back from a successful insemination and includes eligible cows with negative or no services', () => {
    const data = fixture('受胎');
    data.cattle.push({ id: 3, name: '見本母牛3', earTag: '0003', sex: '雌' });
    data.calvings = data.cattle.map(c => ({ id: `c${c.id}`, cowId: c.earTag, actualCalvingDate: '2026-08-01' }));
    data.breedings.push({ ...data.breedings[0], id: 'b2', cowEarTag: '0002', heatDate: '2026-10-01', inseminationDate: '2026-10-01', pregnancyResult: '空胎', pregnancyCheckDate: '2026-11-01' });
    open(data);
    fireEvent.change(screen.getByLabelText('授精・移植記録から振り返る'), { target: { value: JSON.stringify(['1', '2026-10-20', 'ai']) } });
    expect(screen.getByText(/2026年 9\/30 〜 10\/20/)).toBeVisible();
    expect(screen.getByLabelText('21日間の開始日')).not.toBeVisible();
    expect(screen.getByText(/当時の繁殖対象牛全体で集計/)).toBeVisible();
    expect(card('授精・移植した牛')).toHaveTextContent('2頭');
    expect(screen.queryByRole('heading', { name: '妊娠率' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '候補を確認して集計' }));
    expect(screen.getAllByRole('checkbox').every(box => (box as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'この3頭で集計' }));
    expect(card('発情発見率')).toHaveTextContent('66.7%');
    expect(card('受胎率')).toHaveTextContent('50%');
    expect(card('妊娠率')).toHaveTextContent('33.3%');
    // Changing the basis, even to another service in the same cow, requires a new cohort review.
    fireEvent.change(screen.getByLabelText('授精・移植記録から振り返る'), { target: { value: JSON.stringify(['2', '2026-10-01', 'ai']) } });
    expect(screen.getByText(/2026年 9\/11 〜 10\/1/)).toBeVisible();
    expect(screen.queryByRole('heading', { name: '妊娠率' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('授精・移植記録から振り返る'), { target: { value: 'recent' } });
    expect(screen.getByText(/2026年 10\/19 〜 11\/8/)).toBeVisible();
  });
  it('offers AI and ET records but excludes cancelled, future or duplicate services as anchors', () => {
    const data = fixture();
    data.breedings.push(
      { ...data.breedings[0], id: 'cancel', inseminationDate: '2026-10-21', breedingStatus: '取消' },
      { ...data.breedings[0], id: 'future', inseminationDate: '2026-12-01' },
      { ...data.breedings[0], id: 'et', breedingMethod: '受精卵移植', transferDate: '2026-10-27' },
      { ...data.breedings[0], id: 'duplicate1', inseminationDate: '2026-10-29' },
      { ...data.breedings[0], id: 'duplicate2', inseminationDate: '2026-10-29' },
    );
    open(data);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByRole('option', { name: /2026\/10\/20.*鑑定待ち/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /2026\/10\/27.*ET移植.*鑑定待ち/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('授精・移植記録から振り返る'), { target: { value: JSON.stringify(['1', '2026-10-20', 'ai']) } });
    expect(card('鑑定待ち')).toHaveTextContent('1頭');
  });
  it('looks back from ET and includes an observed heat without treatment in the same cohort', () => {
    const data = fixture('受胎');
    data.calvings = data.cattle.map(c => ({ id: `c${c.id}`, cowId: c.earTag, actualCalvingDate: '2026-08-01' }));
    data.breedings = [
      { ...data.breedings[0], breedingMethod: '受精卵移植', inseminationDate: '', transferDate: '2026-10-27' },
      { id: 'heat', cowEarTag: '0002', breedingMethod: '種付', heatDate: '2026-10-21' },
    ];
    open(data);
    fireEvent.change(screen.getByLabelText('授精・移植記録から振り返る'), { target: { value: JSON.stringify(['1', '2026-10-27', 'et']) } });
    expect(card('授精・移植した牛')).toHaveTextContent('1頭');
    expect(card('授精・移植した牛')).toHaveTextContent('ET 1回');
    fireEvent.click(screen.getByRole('button', { name: '候補を確認して集計' }));
    fireEvent.click(screen.getByRole('button', { name: 'この2頭で集計' }));
    expect(card('発情発見率')).toHaveTextContent('100%');
    expect(card('受胎率')).toHaveTextContent('100%');
    expect(card('妊娠率')).toHaveTextContent('50%');
    expect(card('妊娠率')).toHaveTextContent('対象2頭のうち、受胎確認1頭');
    expect(screen.queryByText(/発情発見率と受胎率から計算/)).not.toBeInTheDocument();
  });
  it('invalidates the window if the chosen service disappears rather than keeping stale percentages', () => {
    const data = fixture('受胎'); data.calvings[0].actualCalvingDate = '2026-08-01';
    const { rerender } = open(data);
    fireEvent.change(screen.getByLabelText('授精・移植記録から振り返る'), { target: { value: JSON.stringify(['1', '2026-10-20', 'ai']) } });
    selectFirst(); expect(card('妊娠率')).toHaveTextContent('100%');
    rerender(view({ ...data, breedings: [] }));
    expect(screen.queryByRole('heading', { name: '妊娠率' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('授精・移植記録から振り返る')).toHaveTextContent('選択した授精・移植記録を確認してください');
  });
  it('updates the automatic recent window as the analysis date advances, without manual date input', () => {
    const { rerender } = open();
    rerender(view(fixture(), '2026-11-09'));
    expect(screen.getByText(/2026年 10\/20 〜 11\/9/)).toBeVisible();
    expect(screen.getByLabelText('21日間の開始日')).not.toBeVisible();
  });
});
