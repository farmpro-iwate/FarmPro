import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FatteningTransitionEditForm } from './FatteningTransitionEditForm';
import * as api from '../services/fatteningTransitionsApi';

const baseRecord = {
  id: 'ft1',
  targetNumber: '9130',
  targetName: 'はな',
  startDate: '2026-09-01',
  transitionReason: '繁殖終了',
  startWeight: '620',
  targetWeight: '780',
  targetShippingDate: '2027-03-31',
  housingLocation: '第2牛舎',
  withdrawalEndDate: '2026-10-10',
  status: '肥育中',
  memo: '元データ',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('FatteningTransitionEditForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => cleanup());

  it('既存記録を読み込み、状態とメモを編集して保存できる', async () => {
    vi.spyOn(api, 'getFatteningTransition').mockResolvedValue(baseRecord as any);
    const updateRecord = vi.spyOn(api, 'updateFatteningTransition').mockResolvedValue({ id: 'ft1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/fattening-transitions/ft1/edit']}>
        <Routes>
          <Route path="/fattening-transitions/:id/edit" element={<FatteningTransitionEditForm />} />
          <Route path="/fattening-transitions" element={<div>肥育移行一覧へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '肥育移行を編集' });
    expect(screen.getByText('はな')).toBeInTheDocument();
    expect(screen.getByText('耳標番号：9130')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /状態/ }));
    await user.click(screen.getByRole('option', { name: '出荷準備' }));

    const memo = screen.getByLabelText('メモ');
    await user.clear(memo);
    await user.type(memo, '出荷前確認');

    await user.click(screen.getByRole('button', { name: '更新する' }));

    expect(updateRecord).toHaveBeenCalledWith('ft1', expect.objectContaining({
      targetNumber: '9130',
      targetName: 'はな',
      startDate: '2026-09-01',
      transitionReason: '繁殖終了',
      startWeight: '620',
      targetWeight: '780',
      targetShippingDate: '2027-03-31',
      housingLocation: '第2牛舎',
      withdrawalEndDate: '2026-10-10',
      status: '出荷準備',
      memo: '出荷前確認',
    }));
    expect(await screen.findByText('肥育移行一覧へ戻った')).toBeInTheDocument();
  });

  it('肥育開始日を空にした場合は更新しない', async () => {
    vi.spyOn(api, 'getFatteningTransition').mockResolvedValue(baseRecord as any);
    const updateRecord = vi.spyOn(api, 'updateFatteningTransition').mockResolvedValue({ id: 'ft1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/fattening-transitions/ft1/edit']}>
        <Routes>
          <Route path="/fattening-transitions/:id/edit" element={<FatteningTransitionEditForm />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '肥育移行を編集' });
    const startDate = screen.getByLabelText(/肥育開始日/);
    await user.clear(startDate);
    expect(startDate).toBeRequired();

    await user.click(screen.getByRole('button', { name: '更新する' }));

    expect(startDate).toBeInvalid();
    expect(updateRecord).not.toHaveBeenCalled();
  });
});
