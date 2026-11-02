import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbryoTransferPlanForm } from './EmbryoTransferPlanForm';
import * as breedingApi from '../services/breedingApi';
import * as scheduleApi from '../services/scheduleApi';

vi.mock('../components/CattlePicker', () => ({
  CattlePicker: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect({ earTag: '9130', name: 'はな' })}>
      テスト牛を選択
    </button>
  ),
}));

describe('EmbryoTransferPlanForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('対象牛を選ばずに保存すると登録しない', async () => {
    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({ id: 'et-plan-1' } as any);
    const createSchedule = vi.spyOn(scheduleApi, 'createSchedule').mockResolvedValue({ id: 'schedule-1' } as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/transfer-plan/new']}>
        <EmbryoTransferPlanForm />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'ET予定を保存' }));

    expect(alertSpy).toHaveBeenCalledWith('対象牛を選択してください');
    expect(createBreeding).not.toHaveBeenCalled();
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it.each([
    ['2026-11-02', '2026-11-09'],
    ['2026-09-29', '2026-10-06'],
    ['2026-12-29', '2027-01-05'],
    ['2028-02-22', '2028-02-29'],
    ['2027-02-22', '2027-03-01'],
  ])('発情確認日%sから7日後の%sを移植予定日に自動入力する', async (heatDate, expectedDate) => {
    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({ id: 'et-plan-1' } as any);
    const createSchedule = vi.spyOn(scheduleApi, 'createSchedule').mockResolvedValue({ id: 'schedule-1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/transfer-plan/new']}>
        <EmbryoTransferPlanForm />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'テスト牛を選択' }));
    await user.type(screen.getByLabelText(/発情確認日/), heatDate);

    expect(screen.getByLabelText(/移植予定日/)).toHaveValue(expectedDate);
    expect(screen.getByText(new RegExp(`移植予定日：${expectedDate}`))).toBeInTheDocument();
    expect(createBreeding).not.toHaveBeenCalled();
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('発情確認日を消すと自動入力した移植予定日も空に戻る', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/breedings/transfer-plan/new']}>
        <EmbryoTransferPlanForm />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/発情確認日/), '2026-09-29');
    await user.clear(screen.getByLabelText(/発情確認日/));

    expect(screen.getByLabelText(/移植予定日/)).toHaveValue('');
    expect(screen.queryByText(/移植予定日：/)).not.toBeInTheDocument();
  });

  it.each([
    { label: '自動入力', plannedDate: '2026-10-06', manual: false },
    { label: '手動変更', plannedDate: '2026-10-07', manual: true },
  ])('$labelしたET予定を繁殖記録と予定表へ同じ日付で登録する', async ({ plannedDate, manual }) => {
    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({ id: 'et-plan-1' } as any);
    const createSchedule = vi.spyOn(scheduleApi, 'createSchedule').mockResolvedValue({ id: 'schedule-1' } as any);
    const updateBreeding = vi.spyOn(breedingApi, 'updateBreeding').mockResolvedValue({ id: 'et-plan-1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/transfer-plan/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA&returnTo=%2Fcattle%2F123']}>
        <Routes>
          <Route path="/breedings/transfer-plan/new" element={<EmbryoTransferPlanForm />} />
          <Route path="/cattle/:id" element={<div>個体カルテへ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/発情確認日/), '2026-09-29');
    if (manual) {
      await user.clear(screen.getByLabelText(/移植予定日/));
      await user.type(screen.getByLabelText(/移植予定日/), plannedDate);
    }
    await user.type(screen.getByLabelText('メモ'), 'ET予定テスト');
    await user.click(screen.getByRole('button', { name: 'ET予定を保存' }));

    expect(createBreeding).toHaveBeenCalledWith(expect.objectContaining({
      cowEarTag: '9130',
      cowName: 'はな',
      heatDate: '2026-09-29',
      transferPlannedDate: plannedDate,
      breedingMethod: '受精卵移植',
      breedingStatus: '移植予定',
      note: 'ET予定テスト',
    }));

    expect(createSchedule).toHaveBeenCalledWith({
      scheduleType: 'その他',
      title: '受精卵移植（ET）',
      targetNumber: '9130',
      targetName: 'はな',
      dueDate: plannedDate,
      status: '未完了',
      note: 'ET予定テスト',
    });

    expect(updateBreeding).toHaveBeenCalledWith('et-plan-1', expect.objectContaining({
      sourceScheduleId: 'schedule-1',
      transferPlannedDate: plannedDate,
    }));
    expect(await screen.findByText('個体カルテへ戻った')).toBeInTheDocument();
  });

  it('保存エラー時は予定表を作らず画面に残る', async () => {
    const message = 'ET予定を保存できませんでした。';
    vi.spyOn(breedingApi, 'createBreeding').mockRejectedValue(new Error(message));
    const createSchedule = vi.spyOn(scheduleApi, 'createSchedule').mockResolvedValue({ id: 'schedule-1' } as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/transfer-plan/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA']}>
        <EmbryoTransferPlanForm />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/発情確認日/), '2026-09-29');
    await user.click(screen.getByRole('button', { name: 'ET予定を保存' }));

    expect(alertSpy).toHaveBeenCalledWith(message);
    expect(createSchedule).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: '受精卵移植（ET）の予定を登録' })).toBeInTheDocument();
  });
});
