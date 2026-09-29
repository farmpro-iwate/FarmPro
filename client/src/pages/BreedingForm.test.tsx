import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BreedingForm } from './BreedingForm';
import * as breedingApi from '../services/breedingApi';
import * as settingsApi from '../services/settingsApi';

vi.mock('../components/CattlePicker', () => ({
  CattlePicker: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect({ earTag: '9130', name: 'はな' })}>牛を選ぶ</button>
  ),
}));
vi.mock('../components/SireSearchField', () => ({
  SireSearchField: ({ value, onChange, label = '種雄牛' }: any) => (
    <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value, 10)} />
  ),
}));
vi.mock('../components/InseminatorSearchField', () => ({
  InseminatorSearchField: ({ value, onChange, label = '授精師' }: any) => (
    <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value, 20)} />
  ),
}));
vi.mock('../components/PartnerSearchField', () => ({
  PartnerSearchField: ({ value, onChange, label }: any) => (
    <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value, 30)} />
  ),
}));

describe('BreedingForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({
      estrousCycleDays: 21,
      bullMasters: [],
      supplierMasters: [],
    } as any);
  });

  afterEach(() => cleanup());

  it('個体カルテから発情日だけを登録すると発情確認で保存する', async () => {
    const create = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({ id: 'b1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA&returnTo=%2Fcattle%2F1']}>
        <Routes>
          <Route path="/breedings/new" element={<BreedingForm mode="create" />} />
          <Route path="/cattle/:id" element={<div>個体カルテへ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '発情を登録' });
    await user.type(screen.getByLabelText(/実際の発情日/), '2026-09-29');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      cowEarTag: '9130',
      cowName: 'はな',
      heatDate: '2026-09-29',
      breedingStatus: '発情確認',
    }));
    expect(await screen.findByText('個体カルテへ戻った')).toBeInTheDocument();
  });

  it('種付実施日から次回予定を自動計算して保存する', async () => {
    const create = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({ id: 'b2' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <BreedingForm mode="create" />
      </MemoryRouter>,
    );

    await screen.findByRole('heading');
    await user.click(screen.getByRole('button', { name: '牛を選ぶ' }));
    await user.click(screen.getByRole('combobox', { name: /繁殖方法/ }));
    await user.click(screen.getByRole('option', { name: '種付' }));
    await user.click(screen.getByRole('combobox', { name: /現在の段階/ }));
    await user.click(screen.getByRole('option', { name: '種付実施' }));
    await user.type(screen.getByLabelText(/種付・授精日/), '2026-09-29');
    await user.type(screen.getByLabelText('種雄牛'), '福之姫');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      breedingMethod: '種付',
      breedingStatus: '種付実施',
      inseminationDate: '2026-09-29',
      nextHeatExpectedDate: '2026-10-20',
      pregnancyCheckExpectedDate: '2026-11-10',
      expectedCalvingDate: '2027-07-11',
    }));
  });

  it('編集時に既存の妊娠鑑定結果を未鑑定で上書きしない', async () => {
    const existing = {
      id: 'b3',
      cowEarTag: '9130',
      cowName: 'はな',
      heatDate: '2026-08-01',
      breedingMethod: '種付',
      breedingStatus: '種付実施',
      inseminationDate: '2026-08-02',
      inseminationCost: '',
      bullName: '福之姫',
      inseminatorName: '',
      transferPlannedDate: '',
      transferDate: '',
      transferCost: '',
      transferCancelReason: '',
      embryoNumber: '',
      collectionDate: '',
      embryoType: '未選択',
      donorCowName: '',
      donorCowEarTag: '',
      embryoSireName: '',
      embryoGrade: '',
      strawNumber: '',
      supplierName: '',
      transferTechnician: '',
      nextHeatExpectedDate: '2026-08-23',
      pregnancyCheckExpectedDate: '2026-09-13',
      pregnancyCheckDate: '2026-09-15',
      pregnancyCheckCost: '3000',
      pregnancyResult: '受胎',
      recheckExpectedDate: '',
      expectedCalvingDate: '2027-05-14',
      note: '元データ',
    } as any;
    vi.spyOn(breedingApi, 'getBreeding').mockResolvedValue(existing);
    const update = vi.spyOn(breedingApi, 'updateBreeding').mockResolvedValue({ id: 'b3' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/b3/edit?returnTo=%2Fcattle%2F1']}>
        <Routes>
          <Route path="/breedings/:id/edit" element={<BreedingForm mode="edit" />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '種付記録を編集' });
    const memo = screen.getByLabelText('メモ');
    await user.clear(memo);
    await user.type(memo, '修正済み');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(update).toHaveBeenCalledWith('b3', expect.objectContaining({
      pregnancyCheckDate: '2026-09-15',
      pregnancyCheckCost: '3000',
      pregnancyResult: '受胎',
      note: '修正済み',
    }));
  });
});
