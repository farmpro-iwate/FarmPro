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
function open(data = fixture()) {
  const analysis = buildMaternalAnalysis(data, { today: '2026-11-08' });
  return render(<MemoryRouter><BreedingCycleSummary analysis={analysis} report={buildReproductiveEfficiency(analysis, '2026-11-08')} asOf="2026-11-08" /></MemoryRouter>);
}
const card = (name: string) => screen.getByRole('heading', { name }).parentElement!;
const selectFirst = () => {
  fireEvent.click(screen.getByRole('button', { name: '対象牛を選ぶ' }));
  fireEvent.click(screen.getByRole('checkbox', { name: '見本母牛1（耳標 0001）' }));
  fireEvent.click(screen.getByRole('button', { name: 'この条件で見る' }));
};
describe('simple breeding cycle summary', () => {
  it('shows useful farm counts before any cohort setup without inventing rate denominators', () => {
    open();
    expect(card('授精した牛')).toHaveTextContent('1頭');
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
    expect(screen.getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true);
    expect(card('受胎を確認')).toHaveTextContent('1頭');
  });
  it('uses cow counts for the summary and keeps repeated-service review instead of falsifying the rate', () => {
    const data = fixture(); data.breedings.push({ ...data.breedings[0], id: 'b2', heatDate: '2026-10-25', inseminationDate: '2026-10-25' });
    open(data); selectFirst();
    expect(card('授精した牛')).toHaveTextContent('1頭'); expect(card('授精した牛')).toHaveTextContent('授精 2回');
    expect(card('受胎率')).toHaveTextContent('記録を確認');
    fireEvent.click(screen.getByRole('button', { name: '成績が表示されない理由を見る' }));
    expect(screen.getByText(/同じ牛に期間内の複数授精/)).toBeVisible();
  });
  it('keeps heat-date problems distinct from a normal pending diagnosis', () => {
    const data = fixture(); data.breedings[0].heatDate = '';
    open(data); selectFirst();
    expect(card('発情発見率')).toHaveTextContent('記録を確認');
    expect(card('妊娠率')).toHaveTextContent('記録を確認');
    expect(screen.queryByText(/鑑定結果を記録すると/)).not.toBeInTheDocument();
  });
});
