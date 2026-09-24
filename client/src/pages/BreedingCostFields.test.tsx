import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InseminationRegistrationForm } from './InseminationRegistrationForm';
import { BreedingExecutionForm } from './BreedingExecutionForm';
import * as breedingApi from '../services/breedingApi';
import * as settingsApi from '../services/settingsApi';

vi.mock('../components/CattlePicker', () => ({
  CattlePicker: () => null,
}));

vi.mock('../components/SireSearchField', () => ({
  SireSearchField: () => <input aria-label="種雄牛" />,
}));

vi.mock('../components/InseminatorSearchField', () => ({
  InseminatorSearchField: () => <input aria-label="授精師" />,
}));

vi.mock('../components/PartnerSearchField', () => ({
  PartnerSearchField: () => <input aria-label="購入先・所有者" />,
}));

describe('breeding cost fields', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ estrousCycleDays: 21 } as any);
  });

  it('直接種付登録で人工授精・種付費を保存データへ渡す', async () => {
    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({} as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/ai/new?targetNumber=7358&targetName=%E3%81%AF%E3%81%AA%E3%81%BF%E3%81%A4&returnTo=%2Fcattle%2F123']}>
        <InseminationRegistrationForm />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('種付・授精日'), '2026-09-24');
    await user.type(screen.getByLabelText('人工授精・種付費（円）'), '100');
    await user.click(screen.getByRole('button', { name: '種付を保存' }));

    expect(createBreeding).toHaveBeenCalledWith(expect.objectContaining({
      cowEarTag: '7358',
      cowName: 'はなみつ',
      breedingMethod: '種付',
      inseminationDate: '2026-09-24',
      inseminationCost: '100',
    }));
  });

  it('ET実施でET費を更新データへ渡す', async () => {
    vi.spyOn(breedingApi, 'getBreeding').mockResolvedValue({
      id: 'b1',
      cowEarTag: '7358',
      cowName: 'はなみつ',
      heatDate: '2026-09-17',
      breedingMethod: '受精卵移植',
      breedingStatus: '移植予定',
      inseminationDate: '',
      inseminationCost: '',
      bullName: '',
      inseminatorName: '',
      transferPlannedDate: '2026-09-24',
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
      nextHeatExpectedDate: '',
      pregnancyCheckExpectedDate: '',
      pregnancyCheckDate: '',
      pregnancyCheckCost: '',
      pregnancyResult: '未鑑定',
      recheckExpectedDate: '',
      expectedCalvingDate: '',
      note: '',
    } as any);
    const updateBreeding = vi.spyOn(breedingApi, 'updateBreeding').mockResolvedValue({} as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/b1/transfer?returnTo=%2Fcattle%2F123']}>
        <Routes>
          <Route path="/breedings/:id/transfer" element={<BreedingExecutionForm kind="transfer" />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('受精卵移植を実施')).toBeInTheDocument();
    await user.type(screen.getByLabelText('ET費（円）'), '100');
    await user.click(screen.getByRole('button', { name: '受精卵移植を保存' }));

    expect(updateBreeding).toHaveBeenCalledWith('b1', expect.objectContaining({
      breedingMethod: '受精卵移植',
      transferDate: '2026-09-24',
      transferCost: '100',
    }));
  });
});
