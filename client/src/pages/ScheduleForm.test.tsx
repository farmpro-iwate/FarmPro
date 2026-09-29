import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleForm } from './ScheduleForm';
import * as scheduleApi from '../services/scheduleApi';

vi.mock('../components/CattlePicker', () => ({
  CattlePicker: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect({ earTag: '9130', name: 'はな' })}>繁殖牛を選択</button>
  ),
}));

vi.mock('../components/CalfPicker', () => ({
  CalfPicker: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect({ calfNumber: 'C-001', name: '子牛A' })}>子牛を選択</button>
  ),
}));

describe('ScheduleForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => cleanup());

  it('予定内容または予定日がない場合は保存しない', async () => {
    const createSchedule = vi.spyOn(scheduleApi, 'createSchedule').mockResolvedValue({ id: 1 } as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/schedules/new']}>
        <ScheduleForm mode="create" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '予定を保存' }));

    expect(alertSpy).toHaveBeenCalledWith('予定内容、予定日は必須です');
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('妊娠鑑定を選ぶと予定種類を妊娠鑑定として保存する', async () => {
    const createSchedule = vi.spyOn(scheduleApi, 'createSchedule').mockResolvedValue({ id: 1 } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/schedules/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA&returnTo=%2Fcattle%2F1']}>
        <Routes>
          <Route path="/schedules/new" element={<ScheduleForm mode="create" />} />
          <Route path="/cattle/:id" element={<div>個体カルテへ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('combobox', { name: /予定内容/ }));
    await user.click(screen.getByRole('option', { name: '妊娠鑑定' }));
    await user.type(screen.getByLabelText(/予定日/), '2026-10-20');
    await user.click(screen.getByRole('button', { name: '予定を保存' }));

    expect(createSchedule).toHaveBeenCalledWith(expect.objectContaining({
      scheduleType: '妊娠鑑定',
      title: '妊娠鑑定',
      targetNumber: '9130',
      targetName: 'はな',
      dueDate: '2026-10-20',
      status: '未完了',
    }));
    expect(await screen.findByText('個体カルテへ戻った')).toBeInTheDocument();
  });

  it('分娩予定を選ぶと予定種類を分娩として保存する', async () => {
    const createSchedule = vi.spyOn(scheduleApi, 'createSchedule').mockResolvedValue({ id: 2 } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/schedules/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA']}>
        <ScheduleForm mode="create" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('combobox', { name: /予定内容/ }));
    await user.click(screen.getByRole('option', { name: '分娩予定' }));
    await user.type(screen.getByLabelText(/予定日/), '2027-06-15');
    await user.click(screen.getByRole('button', { name: '予定を保存' }));

    expect(createSchedule).toHaveBeenCalledWith(expect.objectContaining({
      scheduleType: '分娩',
      title: '分娩予定',
      dueDate: '2027-06-15',
      status: '未完了',
    }));
  });

  it('編集では状態を変更して保存できる', async () => {
    vi.spyOn(scheduleApi, 'getSchedule').mockResolvedValue({
      id: 10,
      scheduleType: '治療',
      title: '治療',
      targetNumber: '9130',
      targetName: 'はな',
      dueDate: '2026-10-01',
      status: '未完了',
      note: '初回',
    } as any);
    const updateSchedule = vi.spyOn(scheduleApi, 'updateSchedule').mockResolvedValue({ id: 10 } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/schedules/10/edit']}>
        <Routes>
          <Route path="/schedules/:id/edit" element={<ScheduleForm mode="edit" />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '予定を編集' });
    await user.click(screen.getByRole('combobox', { name: /状態/ }));
    await user.click(screen.getByRole('option', { name: '完了' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(updateSchedule).toHaveBeenCalledWith('10', expect.objectContaining({
      scheduleType: '治療',
      title: '治療',
      status: '完了',
    }));
  });

  it('編集画面で確認後に削除できる', async () => {
    vi.spyOn(scheduleApi, 'getSchedule').mockResolvedValue({
      id: 10,
      scheduleType: '治療',
      title: '治療',
      targetNumber: '9130',
      targetName: 'はな',
      dueDate: '2026-10-01',
      status: '未完了',
      note: '',
    } as any);
    const deleteSchedule = vi.spyOn(scheduleApi, 'deleteSchedule').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/schedules/10/edit']}>
        <Routes>
          <Route path="/schedules/:id/edit" element={<ScheduleForm mode="edit" />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '予定を編集' });
    await user.click(screen.getByRole('button', { name: '削除' }));

    expect(deleteSchedule).toHaveBeenCalledWith(10);
  });
});
