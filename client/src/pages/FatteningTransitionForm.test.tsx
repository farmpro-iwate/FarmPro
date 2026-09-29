import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FatteningTransitionForm } from './FatteningTransitionForm';
import * as api from '../services/fatteningTransitionsApi';

describe('FatteningTransitionForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => cleanup());

  it('対象牛がない場合は保存しない', async () => {
    const createRecord = vi.spyOn(api, 'createFatteningTransition').mockResolvedValue({ id: 'ft1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/fattening-transitions/new']}>
        <FatteningTransitionForm />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(screen.getByText('対象牛が設定されていません。')).toBeInTheDocument();
    expect(createRecord).not.toHaveBeenCalled();
  });

  it('肥育開始日がない場合は保存しない', async () => {
    const createRecord = vi.spyOn(api, 'createFatteningTransition').mockResolvedValue({ id: 'ft1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/fattening-transitions/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA']}>
        <FatteningTransitionForm />
      </MemoryRouter>,
    );

    const startDate = screen.getByLabelText(/肥育開始日/);
    expect(startDate).toBeRequired();

    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(startDate).toBeInvalid();
    expect(createRecord).not.toHaveBeenCalled();
  });

  it('対象牛と開始日を含めて正常登録できる', async () => {
    const createRecord = vi.spyOn(api, 'createFatteningTransition').mockResolvedValue({ id: 'ft1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/fattening-transitions/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA']}>
        <Routes>
          <Route path="/fattening-transitions/new" element={<FatteningTransitionForm />} />
          <Route path="/fattening-transitions" element={<div>肥育移行一覧へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/肥育開始日/), '2026-09-29');
    await user.type(screen.getByLabelText('移行理由'), '繁殖終了');
    await user.type(screen.getByLabelText(/開始時体重/), '620');
    await user.type(screen.getByLabelText(/目標体重/), '780');
    await user.type(screen.getByLabelText(/目標出荷日/), '2027-03-31');
    await user.type(screen.getByLabelText('飼養場所'), '第2牛舎');
    await user.type(screen.getByLabelText(/休薬終了日/), '2026-10-10');
    await user.type(screen.getByLabelText('メモ'), '肥育へ移行');

    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(createRecord).toHaveBeenCalledWith(expect.objectContaining({
      targetNumber: '9130',
      targetName: 'はな',
      startDate: '2026-09-29',
      transitionReason: '繁殖終了',
      status: '肥育中',
      startWeight: '620',
      targetWeight: '780',
      targetShippingDate: '2027-03-31',
      housingLocation: '第2牛舎',
      withdrawalEndDate: '2026-10-10',
      memo: '肥育へ移行',
    }));
    expect(await screen.findByText('肥育移行一覧へ戻った')).toBeInTheDocument();
  });

  it('戻るボタンは指定されたreturnToへ戻る', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/fattening-transitions/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA&returnTo=%2Fcattle%2F1']}>
        <Routes>
          <Route path="/fattening-transitions/new" element={<FatteningTransitionForm />} />
          <Route path="/cattle/:id" element={<div>個体カルテへ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: '戻る' }));

    expect(await screen.findByText('個体カルテへ戻った')).toBeInTheDocument();
  });
});
