import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BreedingExecutionForm } from './BreedingExecutionForm';
import * as breedingApi from '../services/breedingApi';
import * as settingsApi from '../services/settingsApi';

vi.mock('../components/SireSearchField', () => ({
  SireSearchField: ({ value, onChange, label = '種雄牛' }: any) => (
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value, 101)} />
  ),
}));

vi.mock('../components/PartnerSearchField', () => ({
  PartnerSearchField: ({ value, onChange, label = '購入先・所有者' }: any) => (
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value, 303)} />
  ),
}));

vi.mock('../components/InseminatorSearchField', () => ({
  InseminatorSearchField: ({ value, onChange, label = '授精師' }: any) => (
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value, 202)} />
  ),
}));

const baseRecord = {
  id: 'et-1',
  cowEarTag: '9130',
  cowName: 'はな',
  heatDate: '2026-09-29',
  estrusType: '',
  breedingMethod: '受精卵移植',
  breedingStatus: '移植予定',
  inseminationDate: '',
  inseminationCost: '',
  bullName: '',
  bullMasterId: undefined,
  inseminatorName: '',
  inseminatorMasterId: undefined,
  transferPlannedDate: '2026-10-06',
  transferDate: '',
  transferCost: '',
  embryoCost: '',
  transferProcedureCost: '',
  transferOtherCost: '',
  transferCancelReason: '',
  embryoNumber: '',
  collectionDate: '',
  embryoType: '未選択',
  donorCowName: '',
  donorCowEarTag: '',
  embryoSireName: '',
  embryoSireMasterId: undefined,
  embryoGrade: '',
  strawNumber: '',
  supplierName: '',
  supplierMasterId: undefined,
  transferTechnician: '',
  transferTechnicianMasterId: undefined,
  nextHeatExpectedDate: '',
  pregnancyCheckExpectedDate: '',
  pregnancyCheckDate: '',
  pregnancyCheckCost: '',
  pregnancyResult: '未鑑定',
  recheckExpectedDate: '',
  expectedCalvingDate: '',
  estrusSigns: [],
  estrusSignsOther: '',
  note: '',
};

describe('BreedingExecutionForm ET', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(breedingApi, 'getBreeding').mockResolvedValue(baseRecord as any);
    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ estrousCycleDays: 21 } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it('ET予定日を移植実施日の初期値として表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/breedings/et-1/transfer']}>
        <Routes>
          <Route path="/breedings/:id/transfer" element={<BreedingExecutionForm kind="transfer" />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '受精卵移植を実施' })).toBeInTheDocument();
    expect(screen.getByLabelText(/移植実施日/)).toHaveValue('2026-10-06');
    expect(screen.getByText('2026-10-06')).toBeInTheDocument();
  });

  it('負のET費内訳は保存しない', async () => {
    const updateBreeding = vi.spyOn(breedingApi, 'updateBreeding').mockResolvedValue(baseRecord as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/et-1/transfer']}>
        <Routes>
          <Route path="/breedings/:id/transfer" element={<BreedingExecutionForm kind="transfer" />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '受精卵移植を実施' });
    await user.type(screen.getByLabelText('受精卵代（円）'), '-1');
    await user.click(screen.getByRole('button', { name: '受精卵移植を保存' }));

    expect(alertSpy).toHaveBeenCalledWith('受精卵代は0以上の数字で入力してください');
    expect(updateBreeding).not.toHaveBeenCalled();
  });

  it('移植実施時にET情報と次回予定日を保存し元の個体カルテへ戻る', async () => {
    const updateBreeding = vi.spyOn(breedingApi, 'updateBreeding').mockResolvedValue(baseRecord as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/et-1/transfer?returnTo=%2Fcattle%2F123']}>
        <Routes>
          <Route path="/breedings/:id/transfer" element={<BreedingExecutionForm kind="transfer" />} />
          <Route path="/cattle/:id" element={<div>個体カルテへ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '受精卵移植を実施' });

    const transferDate = screen.getByLabelText(/移植実施日/);
    await user.clear(transferDate);
    await user.type(transferDate, '2026-10-07');
    await user.type(screen.getByLabelText('受精卵番号・管理番号'), 'ET-001');
    await user.type(screen.getByLabelText('受精卵代（円）'), '5000');
    await user.type(screen.getByLabelText('移植料（円）'), '2500');
    await user.type(screen.getByLabelText('その他ET費（円）'), '500');
    await user.type(screen.getByLabelText('採卵日'), '2026-09-20');
    await user.click(screen.getByRole('combobox', { name: /受精卵区分/ }));
    await user.click(screen.getByRole('option', { name: '凍結卵' }));
    await user.type(screen.getByLabelText('供卵牛名（遺伝的母牛）'), 'ドナーA');
    await user.type(screen.getByLabelText('供卵牛耳標番号'), 'D001');
    await user.type(screen.getByLabelText('受精卵の父牛'), '美津照重');
    await user.type(screen.getByLabelText('ストロー番号'), 'ST-01');
    await user.type(screen.getByLabelText('購入先・所有者'), 'ABC牧場');
    await user.type(screen.getByLabelText('移植担当者'), '担当B');

    await user.click(screen.getByRole('button', { name: '受精卵移植を保存' }));

    expect(updateBreeding).toHaveBeenCalledWith('et-1', expect.objectContaining({
      breedingMethod: '受精卵移植',
      breedingStatus: '移植実施',
      transferDate: '2026-10-07',
      embryoNumber: 'ET-001',
      embryoCost: '5000',
      transferProcedureCost: '2500',
      transferOtherCost: '500',
      collectionDate: '2026-09-20',
      embryoType: '凍結卵',
      donorCowName: 'ドナーA',
      donorCowEarTag: 'D001',
      embryoSireName: '美津照重',
      embryoSireMasterId: 101,
      strawNumber: 'ST-01',
      supplierName: 'ABC牧場',
      supplierMasterId: 303,
      transferTechnician: '担当B',
      transferTechnicianMasterId: 202,
      nextHeatExpectedDate: '2026-10-28',
      pregnancyCheckExpectedDate: '2026-11-18',
      expectedCalvingDate: '2027-07-19',
    }));

    expect(await screen.findByText('個体カルテへ戻った')).toBeInTheDocument();
  });

  it('保存エラー時は画面に残る', async () => {
    const message = '受精卵移植を保存できませんでした。';
    vi.spyOn(breedingApi, 'updateBreeding').mockRejectedValue(new Error(message));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/et-1/transfer']}>
        <Routes>
          <Route path="/breedings/:id/transfer" element={<BreedingExecutionForm kind="transfer" />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '受精卵移植を実施' });
    await user.click(screen.getByRole('button', { name: '受精卵移植を保存' }));

    expect(alertSpy).toHaveBeenCalledWith(message);
    expect(screen.getByRole('heading', { name: '受精卵移植を実施' })).toBeInTheDocument();
  });
});
