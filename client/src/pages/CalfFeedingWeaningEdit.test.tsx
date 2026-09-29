import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalfFeedingWeaningEdit } from './CalfFeedingWeaningEdit';
import * as calfApi from '../services/calfApi';

const baseCalf = {
  id: 'c1',
  calfNumber: '9131',
  identificationNumber: '1234567890',
  name: 'さくら',
  birthday: '2026-07-01',
  sex: '雌',
  motherName: '母A',
  sireName: '父A',
  startWeight: 35,
  currentWeight: 70,
  elapsedDays: 60,
  milkAmount: 6,
  starterAmount: 1.2,
  feedingMethod: '人工哺育',
  weaningPlannedDate: '2026-09-10',
  weaningDate: '',
  weaningStatus: '離乳前',
  weaningWeight: 0,
  weaningStarterAmount: 0,
  milkEndDate: '',
  managementStatus: '育成中',
  note: '元データ',
};

describe('CalfFeedingWeaningEdit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => cleanup());

  it('離乳済みにする場合は実際の離乳日が必須', async () => {
    vi.spyOn(calfApi, 'getCalf').mockResolvedValue(baseCalf as any);
    const updateCalf = vi.spyOn(calfApi, 'updateCalf').mockResolvedValue({ id: 'c1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/calves/c1/weaning']}>
        <Routes>
          <Route path="/calves/:id/weaning" element={<CalfFeedingWeaningEdit />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText(/さくら/);
    await user.click(screen.getByRole('combobox', { name: /離乳状態/ }));
    await user.click(screen.getByRole('option', { name: '離乳済み' }));
    await user.click(screen.getByRole('button', { name: '修正を保存' }));

    expect(screen.getByText('離乳済みにする場合は、実際の離乳日を入力してください。')).toBeInTheDocument();
    expect(updateCalf).not.toHaveBeenCalled();
  });

  it('離乳済みの記録を日付・体重・スターター量付きで保存できる', async () => {
    vi.spyOn(calfApi, 'getCalf').mockResolvedValue(baseCalf as any);
    const updateCalf = vi.spyOn(calfApi, 'updateCalf').mockResolvedValue({ id: 'c1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/calves/c1/weaning']}>
        <Routes>
          <Route path="/calves/:id/weaning" element={<CalfFeedingWeaningEdit />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText(/さくら/);
    await user.click(screen.getByRole('combobox', { name: /離乳状態/ }));
    await user.click(screen.getByRole('option', { name: '離乳済み' }));
    await user.type(screen.getByLabelText(/実際の離乳日/), '2026-09-15');

    const weight = screen.getByLabelText(/離乳時体重/);
    await user.clear(weight);
    await user.type(weight, '82');

    const starter = screen.getByLabelText(/離乳時スターター量/);
    await user.clear(starter);
    await user.type(starter, '1.5');

    await user.click(screen.getByRole('button', { name: '修正を保存' }));

    expect(updateCalf).toHaveBeenCalledWith('c1', expect.objectContaining({
      calfNumber: '9131',
      name: 'さくら',
      weaningStatus: '離乳済み',
      weaningDate: '2026-09-15',
      weaningWeight: 82,
      weaningStarterAmount: 1.5,
      feedingMethod: '人工哺育',
      milkAmount: 6,
      note: '元データ',
    }));
  });

  it('離乳前へ戻した場合は既存の離乳日を空にして保存する', async () => {
    vi.spyOn(calfApi, 'getCalf').mockResolvedValue({
      ...baseCalf,
      weaningStatus: '離乳済み',
      weaningDate: '2026-09-15',
      weaningWeight: 82,
      weaningStarterAmount: 1.5,
    } as any);
    const updateCalf = vi.spyOn(calfApi, 'updateCalf').mockResolvedValue({ id: 'c1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/calves/c1/weaning']}>
        <Routes>
          <Route path="/calves/:id/weaning" element={<CalfFeedingWeaningEdit />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText(/離乳記録を確認・修正/);
    await user.click(screen.getByRole('combobox', { name: /離乳状態/ }));
    await user.click(screen.getByRole('option', { name: '離乳前' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(updateCalf).toHaveBeenCalledWith('c1', expect.objectContaining({
      weaningStatus: '離乳前',
      weaningDate: '',
      weaningWeight: 82,
      weaningStarterAmount: 1.5,
    }));
  });
});
