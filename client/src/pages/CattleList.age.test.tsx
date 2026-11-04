import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CattleList } from './CattleList';
import * as cattleApi from '../services/api';
import * as planSnapshotApi from '../services/cattlePlanSnapshot';
import * as currentPlan from '../plans/current-plan';

const growingCow = {
  id: 1, earTag: '5754', name: 'ひめこ', birthday: '2026-01-04', sex: '雌', stage: '育成牛',
  sire: '福之姫', dam: 'ゆりひさ', parity: 0, blvStatus: '未検査', note: '',
} as const;

describe('育成牛台帳の月齢・日齢', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 4, 12));
    vi.spyOn(currentPlan, 'getCurrentFarmProPlanId').mockReturnValue('free');
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([{ ...growingCow }]);
    vi.spyOn(planSnapshotApi, 'getCattlePlanSnapshot').mockResolvedValue({ breedings: [], calvings: [], sales: [], cycleDays: 21, unavailable: [] });
  });

  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('shows the same age under the birth date in the desktop row and mobile card, with a growing registration link', async () => {
    render(<MemoryRouter initialEntries={['/cattle/growing']}><CattleList stageFilter="育成牛" /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText('10か月齢（304日齢）')).toHaveLength(2));

    expect(screen.getByRole('columnheader', { name: '生年月日・月齢・日齢' })).toBeInTheDocument();
    const birthdayCell = within(screen.getByRole('table')).getByText(growingCow.birthday).closest('td')!;
    expect(within(birthdayCell).getByText('10か月齢（304日齢）')).toBeInTheDocument();
    const mobileBirthday = screen.getByText(`生年月日：${growingCow.birthday}`);
    expect(within(mobileBirthday.parentElement!).getByText('10か月齢（304日齢）')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '新規登録' })).toHaveAttribute('href', '/cattle/new?stage=growing');
  });

  it('shows age at death in the growing history view', async () => {
    vi.mocked(cattleApi.getCattleList).mockResolvedValue([{ ...growingCow,
      lifecycle: { version: 1, death: { date: '2026-05-06', reason: '検証', note: '', recordedAt: '2026-05-06T00:00:00Z' } },
    }]);
    render(<MemoryRouter initialEntries={['/cattle/growing?state=deceased']}><CattleList stageFilter="育成牛" /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText('4か月齢（122日齢・死亡時）')).toHaveLength(2));
    expect(screen.queryByText('10か月齢（304日齢）')).not.toBeInTheDocument();
  });

  it('keeps the breeding ledger birth date and new-registration destination unchanged', async () => {
    vi.mocked(cattleApi.getCattleList).mockResolvedValue([{ ...growingCow, stage: '繁殖牛' }]);
    render(<MemoryRouter initialEntries={['/cattle']}><CattleList /></MemoryRouter>);
    await screen.findByText('耳標 5754');
    expect(screen.getByRole('columnheader', { name: '生年月日' })).toBeInTheDocument();
    expect(screen.queryByText('10か月齢（304日齢）')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '新規登録' })).toHaveAttribute('href', '/cattle/new');
  });
});
