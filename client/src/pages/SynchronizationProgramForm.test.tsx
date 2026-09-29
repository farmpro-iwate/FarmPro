import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SynchronizationProgramForm } from './SynchronizationProgramForm';
import * as scheduleApi from '../services/scheduleApi';
import * as templateApi from '../services/synchronizationTemplateApi';

vi.mock('../components/CattlePicker', () => ({
  CattlePicker: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect({ id: 1, earTag: '9130', name: 'はな' })}>
      対象牛を選ぶ
    </button>
  ),
}));

vi.mock('../components/CattleMultiPicker', () => ({
  CattleMultiPicker: () => <div>複数頭選択</div>,
}));

describe('SynchronizationProgramForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(templateApi, 'getSynchronizationTemplates').mockResolvedValue([]);
  });

  afterEach(() => cleanup());

  it('対象牛未選択では開始しない', async () => {
    const create = vi.spyOn(scheduleApi, 'createSynchronizationProgramSchedules').mockResolvedValue([] as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <SynchronizationProgramForm />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'この同期化を開始' }));

    expect(alertSpy).toHaveBeenCalledWith('対象牛を選択してください');
    expect(create).not.toHaveBeenCalled();
  });

  it('単頭の同期化予定を開始日から作成してreturnToへ戻る', async () => {
    const create = vi.spyOn(scheduleApi, 'createSynchronizationProgramSchedules').mockResolvedValue([] as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/synchronization/new?returnTo=%2Fcattle%2F1']}>
        <Routes>
          <Route path="/synchronization/new" element={<SynchronizationProgramForm />} />
          <Route path="/cattle/:id" element={<div>個体カルテへ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '対象牛を選ぶ' }));
    await user.type(screen.getByLabelText(/今回のプログラム名/), '9月同期');
    await user.type(screen.getByLabelText(/開始日/), '2026-09-29');

    expect(screen.getByText('予定日：2026-09-29')).toBeInTheDocument();
    expect(screen.getByText('予定日：2026-10-06')).toBeInTheDocument();
    expect(screen.getByText('予定日：2026-10-08')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'この同期化を開始' }));

    expect(create).toHaveBeenCalledWith({
      programName: '9月同期',
      purpose: '発情同期化',
      startDate: '2026-09-29',
      targetNumber: '9130',
      targetName: 'はな',
      steps: [
        { dayOffset: 0, title: '同期化処置' },
        { dayOffset: 7, title: '同期化処置' },
        { dayOffset: 9, title: '排卵誘起処置' },
      ],
    });
    expect(await screen.findByText('個体カルテへ戻った')).toBeInTheDocument();
  });
});
