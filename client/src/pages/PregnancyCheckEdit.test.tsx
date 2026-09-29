import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PregnancyCheckEdit } from './PregnancyCheckEdit';
import * as breedingApi from '../services/breedingApi';

const record = {
  id: 'breed-1',
  cowEarTag: '9130',
  cowName: 'はな',
  heatDate: '2026-09-01',
  estrusType: '自然発情',
  breedingMethod: '種付',
  breedingStatus: '種付実施',
  inseminationDate: '2026-09-02',
  inseminationCost: '',
  bullName: '美津照重',
  bullMasterId: undefined,
  inseminatorName: '',
  inseminatorMasterId: undefined,
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
  embryoSireMasterId: undefined,
  embryoGrade: '',
  strawNumber: '',
  supplierName: '',
  supplierMasterId: undefined,
  transferTechnician: '',
  transferTechnicianMasterId: undefined,
  nextHeatExpectedDate: '2026-09-23',
  pregnancyCheckExpectedDate: '2026-10-14',
  pregnancyCheckDate: '',
  pregnancyCheckCost: '',
  pregnancyResult: '未鑑定',
  recheckExpectedDate: '',
  expectedCalvingDate: '2027-06-14',
  estrusSigns: [],
  estrusSignsOther: '',
  note: '',
  createdAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
};

describe('PregnancyCheckEdit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(breedingApi, 'getBreeding').mockResolvedValue(record as any);
  });

  afterEach(() => cleanup());

  it('受胎を選ぶと実施日を自動入力し保存できる', async () => {
    const updateBreeding = vi.spyOn(breedingApi, 'updateBreeding').mockResolvedValue(record as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/pregnancy-checks/breed-1/edit']}>
        <Routes>
          <Route path="/pregnancy-checks/:id/edit" element={<PregnancyCheckEdit />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '妊娠鑑定を編集' });
    await user.click(screen.getByRole('button', { name: '受胎' }));
    expect(screen.getByLabelText(/妊娠鑑定実施日/)).not.toHaveValue('');

    await user.click(screen.getByRole('button', { name: '妊娠鑑定を保存' }));

    expect(updateBreeding).toHaveBeenCalledWith('breed-1', expect.objectContaining({
      pregnancyResult: '受胎',
    }));
    expect(await screen.findByText('妊娠鑑定を更新しました。')).toBeInTheDocument();
  });

  it('再鑑定予定では再鑑定予定日を必須にする', async () => {
    const updateBreeding = vi.spyOn(breedingApi, 'updateBreeding').mockResolvedValue(record as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/pregnancy-checks/breed-1/edit']}>
        <Routes>
          <Route path="/pregnancy-checks/:id/edit" element={<PregnancyCheckEdit />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '妊娠鑑定を編集' });
    await user.click(screen.getByRole('button', { name: '再鑑定予定' }));
    const recheckDate = screen.getByLabelText(/再鑑定予定日/);
    expect(recheckDate).toBeRequired();

    await user.click(screen.getByRole('button', { name: '妊娠鑑定を保存' }));

    expect(recheckDate).toBeInvalid();
    expect(updateBreeding).not.toHaveBeenCalled();
  });

  it('負の妊娠鑑定費は保存しない', async () => {
    const updateBreeding = vi.spyOn(breedingApi, 'updateBreeding').mockResolvedValue(record as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/pregnancy-checks/breed-1/edit']}>
        <Routes>
          <Route path="/pregnancy-checks/:id/edit" element={<PregnancyCheckEdit />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '妊娠鑑定を編集' });
    await user.click(screen.getByRole('button', { name: '受胎' }));
    const cost = screen.getByLabelText('妊娠鑑定費（円）');
    expect(cost).toHaveAttribute('min', '0');

    await user.type(cost, '-1');
    await user.click(screen.getByRole('button', { name: '妊娠鑑定を保存' }));

    expect(cost).toBeInvalid();
    expect(updateBreeding).not.toHaveBeenCalled();
  });

  it('妊娠鑑定取消では元の種付記録を残して鑑定項目だけ消す', async () => {
    vi.spyOn(breedingApi, 'getBreeding').mockResolvedValue({
      ...record,
      pregnancyCheckDate: '2026-10-14',
      pregnancyCheckCost: '3000',
      pregnancyResult: '受胎',
      recheckExpectedDate: '2026-10-21',
    } as any);
    const updateBreeding = vi.spyOn(breedingApi, 'updateBreeding').mockResolvedValue(record as any);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/pregnancy-checks/breed-1/edit']}>
        <Routes>
          <Route path="/pregnancy-checks/:id/edit" element={<PregnancyCheckEdit />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '妊娠鑑定を編集' });
    await user.click(screen.getByRole('button', { name: '妊娠鑑定を取消' }));

    expect(updateBreeding).toHaveBeenCalledWith('breed-1', expect.objectContaining({
      breedingMethod: '種付',
      inseminationDate: '2026-09-02',
      pregnancyCheckExpectedDate: '',
      pregnancyCheckDate: '',
      pregnancyCheckCost: '',
      pregnancyResult: '未鑑定',
      recheckExpectedDate: '',
    }));
    expect(await screen.findByText('妊娠鑑定を取消しました。種付・移植の記録は残っています。')).toBeInTheDocument();
  });
});