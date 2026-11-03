import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalfDetail } from './CalfDetail';
import { fetchFeedingAlertActions } from '../services/feedingAlertActionsApi';
import { getAllRecords, getRecordById, saveRecord } from '../storage/repository';
import { getAnimalFeedCostTotal } from '../services/feedInventoryApi';
import { promoteCalf, registerCalfEarTag, registerCalfName } from '../services/calfApi';
import type { Calf } from '../types/calf';

const session = vi.hoisted(() => ({ context: {
  farmId: 'calf-action-farm', userId: 'calf-action-user', token: 'calf-action-token',
  planId: 'standard', cloudEnabled: true,
} }));
vi.mock('../services/feedingAlertActionsApi', () => ({
  fetchFeedingAlertActions: vi.fn(),
  getFeedingAlertActionSyncContext: () => ({ ...session.context }),
  assertFeedingAlertActionSyncContext: (expected: typeof session.context) => {
    if (JSON.stringify(expected) !== JSON.stringify(session.context)) throw new Error('context changed');
  },
}));
vi.mock('../storage/repository', () => ({ getAllRecords: vi.fn(), getRecordById: vi.fn(), saveRecord: vi.fn() }));
vi.mock('../services/calfApi', () => ({ promoteCalf: vi.fn(), registerCalfEarTag: vi.fn(), registerCalfName: vi.fn() }));
vi.mock('../services/feedInventoryApi', () => ({ getAnimalFeedCostTotal: vi.fn(async () => 0) }));
vi.mock('../services/expensesApi', () => ({ getAnimalExpenseTotals: vi.fn(async () => ({ medical: 0, breeding: 0, other: 0, nonFeedTotal: 0 })) }));
vi.mock('../services/farmExpenseAllocation', () => ({ getCalfYearlyFarmExpenseAllocation: vi.fn(async () => 0) }));
vi.mock('../services/allFarmExpenseAllocation', () => ({ getAllFarmExpenseAllocation: vi.fn(async () => 0) }));
vi.mock('../services/breedingCattleAcquisitionAllocation', () => ({ getBreedingCattleAcquisitionAllocationForCalf: vi.fn(async () => ({ amount: 0, allocationParity: 7 })) }));
vi.mock('../services/salesApi', () => ({ getSalesList: vi.fn(async () => []) }));

function calf(id: number): Calf {
  return {
    id, calfNumber: `913${id}`, identificationNumber: '', name: `カルテ確認${id}`, birthday: '2026-07-20',
    sex: '雌', motherName: '', startWeight: 30, currentWeight: 90, elapsedDays: 0,
    milkAmount: 0, starterAmount: 0, feedingMethod: '母乳哺育', weaningPlannedDate: '', weaningDate: '',
    weaningStatus: '離乳前', weaningWeight: 0, weaningStarterAmount: 0, milkEndDate: '', managementStatus: '育成中', note: '',
  };
}
function action(memo: string, calfId = '1') {
  return { id: `action-${memo}`, calfId, calfName: `カルテ確認${calfId}`, ageDays: '100', actionDate: '2026-11-02',
    alertType: '不足気味', actionType: '確認のみ', memo, nextCheckDate: '', status: '対応中',
    createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z' };
}
function app() {
  return <MemoryRouter initialEntries={['/calves/1']}><Routes><Route path="/calves/:id" element={<CalfDetail />} /></Routes><Link to="/calves/2">別の子牛へ</Link></MemoryRouter>;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  session.context = { farmId: 'calf-action-farm', userId: 'calf-action-user', token: 'calf-action-token', planId: 'standard', cloudEnabled: true };
  vi.mocked(getRecordById).mockImplementation(async (_store, id) => calf(Number(id)) as never);
  vi.mocked(getAllRecords).mockResolvedValue([]);
  vi.mocked(fetchFeedingAlertActions).mockResolvedValue([action('別端末で確認した対応履歴')]);
  vi.mocked(getAnimalFeedCostTotal).mockResolvedValue(0);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('calf detail uses the normal feeding action receiver', () => {
  it('retains deceased calf history but removes promotion, shipping and new care actions', async () => {
    const deceased = { ...calf(1), lifecycle: { version: 1 as const,
      death: { date: '2026-10-01', reason: '死亡の検証', note: '履歴を保持', recordedAt: '2026-10-01T00:00:00Z' } } };
    vi.mocked(getRecordById).mockResolvedValue(deceased);
    render(app());
    await screen.findByText('別端末で確認した対応履歴');
    expect(screen.getByText('死亡日：2026-10-01')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '牛台帳へ移行' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '市場出荷予定' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '対応記録を追加' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '記録を追加' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '死亡履歴へ戻る' })).toHaveAttribute('href', '/calves?state=deceased');
    expect(screen.getByRole('link', { name: '内容を確認・修正' })).toHaveAttribute('href', expect.stringContaining('/animal-lifecycle/new?'));
    expect(saveRecord).not.toHaveBeenCalled();
    expect(promoteCalf).not.toHaveBeenCalled();
  });
  it('shows received action history without creating or changing a calf or other record', async () => {
    render(app());

    expect(await screen.findByText('別端末で確認した対応履歴')).toBeInTheDocument();
    expect(fetchFeedingAlertActions).toHaveBeenCalledOnce();
    expect(getAllRecords).not.toHaveBeenCalledWith('feedingAlertActions');
    expect(saveRecord).not.toHaveBeenCalled();
    expect(promoteCalf).not.toHaveBeenCalled();
    expect(registerCalfEarTag).not.toHaveBeenCalled();
    expect(registerCalfName).not.toHaveBeenCalled();
  });

  it('does not replace the next calf with a delayed response from the previous calf', async () => {
    const old = deferred<ReturnType<typeof action>[]>();
    vi.mocked(fetchFeedingAlertActions).mockReturnValueOnce(old.promise).mockResolvedValueOnce([action('次の子牛の履歴', '2')]);
    render(app());
    fireEvent.click(screen.getByRole('link', { name: '別の子牛へ' }));
    await screen.findByText('次の子牛の履歴');

    await act(async () => { old.resolve([action('古い子牛の履歴')]); });

    expect(screen.getByText('次の子牛の履歴')).toBeInTheDocument();
    expect(screen.queryByText('古い子牛の履歴')).toBeNull();
  });

  it.each([
    { farmId: 'other-farm' }, { userId: 'other-user' }, { token: 'other-token' }, { planId: 'free', cloudEnabled: false },
  ])('discards action data captured before a context change: %j', async changes => {
    const old = deferred<ReturnType<typeof action>[]>();
    vi.mocked(fetchFeedingAlertActions).mockReturnValueOnce(old.promise).mockResolvedValueOnce([action('現在の利用者の履歴')]);
    const view = render(app());
    session.context = { ...session.context, ...changes };
    view.rerender(app());
    await screen.findByText('現在の利用者の履歴');

    await act(async () => { old.resolve([action('前の利用者の履歴')]); });

    expect(screen.getByText('現在の利用者の履歴')).toBeInTheDocument();
    expect(screen.queryByText('前の利用者の履歴')).toBeNull();
  });

  it('checks the context again after waiting for the cost readers', async () => {
    const old = deferred<number>();
    vi.mocked(fetchFeedingAlertActions).mockResolvedValueOnce([action('前の費用読取に付随した履歴')]).mockResolvedValueOnce([action('現在の農場の履歴')]);
    vi.mocked(getAnimalFeedCostTotal).mockReturnValueOnce(old.promise);
    const view = render(app());
    await waitFor(() => expect(getAnimalFeedCostTotal).toHaveBeenCalledOnce());
    session.context.farmId = 'replacement-farm';
    view.rerender(app());
    await screen.findByText('現在の農場の履歴');

    await act(async () => { old.resolve(9900); });

    expect(screen.getByText('現在の農場の履歴')).toBeInTheDocument();
    expect(screen.queryByText('前の費用読取に付随した履歴')).toBeNull();
  });

  it('does not start the remaining readers after the detail screen is closed', async () => {
    const old = deferred<ReturnType<typeof action>[]>();
    vi.mocked(fetchFeedingAlertActions).mockReturnValueOnce(old.promise);
    const view = render(app());
    view.unmount();
    await act(async () => { old.resolve([action('閉じた画面の履歴')]); });
    expect(getAnimalFeedCostTotal).not.toHaveBeenCalled();
    expect(saveRecord).not.toHaveBeenCalled();
  });
});
