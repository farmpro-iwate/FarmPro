import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseList } from './ExpenseList';
import { CalvingList } from './CalvingList';
import type { ExpenseRecord } from '../services/expensesApi';
import type { CalvingRecord } from '../services/calvingsApi';

const fixture = vi.hoisted(() => ({
  context: { farmId: 'list-farm', userId: 'list-user', token: 'list-token', plan: 'standard' },
  expenses: vi.fn<() => Promise<ExpenseRecord[]>>(),
  calvings: vi.fn<() => Promise<CalvingRecord[]>>(),
  pullCalvings: vi.fn<() => Promise<{ applied: number }>>(),
  calves: vi.fn<() => Promise<unknown[]>>(),
  deleteExpense: vi.fn<() => Promise<void>>(), deleteCalving: vi.fn<() => Promise<void>>(),
  registerCalf: vi.fn<() => Promise<void>>(), ensureMother: vi.fn<(record: CalvingRecord) => Promise<CalvingRecord>>(),
}));
vi.mock('../services/expensesApi', () => ({
  getExpensesList: fixture.expenses, deleteExpense: fixture.deleteExpense,
  EXPENSE_SYNC_STATUS_EVENT: 'fixture-expense-status', paymentMethodOptions: ['現金'],
  expenseSyncContext: () => ({ farmId: fixture.context.farmId, userId: fixture.context.userId,
    token: fixture.context.token, cloudEnabled: fixture.context.plan !== 'free' }),
  assertExpenseSyncContext: (expected: { farmId: string; userId: string; token: string; cloudEnabled: boolean }) => {
    const current = fixture.context;
    if (expected.farmId !== current.farmId || expected.userId !== current.userId ||
        expected.token !== current.token || expected.cloudEnabled !== (current.plan !== 'free')) throw new Error('Old expense context');
  },
}));
vi.mock('../services/calvingsApi', () => ({
  fetchCalvingsReadOnly: fixture.calvings, fetchCalvings: fixture.calvings,
  deleteCalving: fixture.deleteCalving, registerCalvingToCalfLedger: fixture.registerCalf,
}));
vi.mock('../services/calvingRecordSync', () => ({
  pullNewerCalvingRecordsFromCloud: fixture.pullCalvings,
  calvingSyncContext: () => ({ ...fixture.context }),
  assertCalvingSyncContext: (expected: typeof fixture.context) => {
    if (JSON.stringify(expected) !== JSON.stringify(fixture.context)) throw new Error('Old calving context');
  },
}));
vi.mock('../services/animalRecordSyncSafety', () => ({ ANIMAL_SYNC_STATUS_EVENT: 'fixture-animal-status' }));
vi.mock('../services/calfApi', () => ({ getCalfList: fixture.calves }));
vi.mock('../services/motherCattleLink', () => ({ ensureCalvingMotherCattle: fixture.ensureMother }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => fixture.context.plan }));

const expense: ExpenseRecord = {
  id: 'expense-1', paymentDate: '2026-11-02', category: '診療費', description: '一覧の経費',
  vendor: '', amount: '1200', paymentMethod: '現金', target: '', memo: '', createdAt: '', updatedAt: '',
};
const calving: CalvingRecord = {
  id: 'calving-1', cowId: 'MOTHER-1', cowName: '一覧の分娩', calfName: 'CALF-1', calfSex: '雌',
  actualCalvingDate: '2026-11-01', calvingResult: '自然分娩', colostrumStatus: '確認済み', registeredToCalfLedger: false,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const cases = [
  { name: 'expense', Component: ExpenseList, list: fixture.expenses, remove: fixture.deleteExpense,
    event: 'fixture-expense-status', row: expense, withName: (name: string) => ({ ...expense, description: name }) },
  { name: 'calving', Component: CalvingList, list: fixture.calvings, remove: fixture.deleteCalving,
    event: 'fixture-animal-status', row: calving, withName: (name: string) => ({ ...calving, cowName: name }) },
] as const;

beforeEach(() => {
  fixture.context = { farmId: 'list-farm', userId: 'list-user', token: 'list-token', plan: 'standard' };
  fixture.expenses.mockReset().mockResolvedValue([expense]);
  fixture.calvings.mockReset().mockResolvedValue([calving]);
  fixture.pullCalvings.mockReset().mockResolvedValue({ applied: 0 });
  fixture.calves.mockReset().mockResolvedValue([]);
  fixture.deleteExpense.mockReset().mockResolvedValue();
  fixture.deleteCalving.mockReset().mockResolvedValue();
  fixture.registerCalf.mockReset().mockResolvedValue();
  fixture.ensureMother.mockReset().mockImplementation(async record => record);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each(cases)('$name list resume', ({ Component, list, remove, event, row, withName }) => {
  const mockList = list as ReturnType<typeof vi.fn<() => Promise<Array<ExpenseRecord | CalvingRecord>>>>;

  it('coalesces resume/status bursts while preserving one follow-up read and performs no formal mutation', async () => {
    const reading = deferred<Array<ExpenseRecord | CalvingRecord>>();
    mockList.mockReturnValueOnce(reading.promise).mockResolvedValue([withName('更新された一覧')]);
    render(<MemoryRouter><Component /></MemoryRouter>);
    await waitFor(() => expect(list).toHaveBeenCalledOnce());
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    fireEvent(window, new Event(event));
    expect(list).toHaveBeenCalledOnce();

    await act(async () => { reading.resolve([row]); });

    expect(await screen.findAllByText('更新された一覧')).not.toHaveLength(0);
    expect(list).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalled();
    expect(fixture.registerCalf).not.toHaveBeenCalled();
    expect(fixture.ensureMother).not.toHaveBeenCalled();
  });

  it('ignores hidden/offline events and refreshes when visible and online', async () => {
    render(<MemoryRouter><Component /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument());
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(window, new Event(event));
    fireEvent(window, new Event('focus'));
    fireEvent(document, new Event('visibilitychange'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    fireEvent(window, new Event('online'));
    expect(list).toHaveBeenCalledOnce();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it.each(['farmId', 'userId', 'token', 'plan'] as const)('discards the old response after %s changes and reads the new context', async key => {
    const reading = deferred<Array<ExpenseRecord | CalvingRecord>>();
    mockList.mockReturnValueOnce(reading.promise).mockResolvedValue([withName('新しい文脈の一覧')]);
    render(<MemoryRouter><Component /></MemoryRouter>);
    await waitFor(() => expect(list).toHaveBeenCalledOnce());
    fixture.context = { ...fixture.context, [key]: key === 'plan' ? 'pro' : `new-${key}` };

    await act(async () => { reading.resolve([withName('古い文脈の応答')]); });

    expect(await screen.findAllByText('新しい文脈の一覧')).not.toHaveLength(0);
    expect(screen.queryByText('古い文脈の応答')).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalled();
    expect(fixture.registerCalf).not.toHaveBeenCalled();
  });

  it('drops a queued refresh and delayed completion after unmount', async () => {
    const reading = deferred<Array<ExpenseRecord | CalvingRecord>>();
    mockList.mockReturnValueOnce(reading.promise);
    const view = render(<MemoryRouter><Component /></MemoryRouter>);
    await waitFor(() => expect(list).toHaveBeenCalledOnce());
    fireEvent(window, new Event(event));
    view.unmount();
    await act(async () => { reading.resolve([row]); });
    fireEvent(window, new Event('online'));
    fireEvent(window, new Event(event));
    expect(list).toHaveBeenCalledOnce();
  });

  it('discards a pre-delete response, blocks refresh and double submission during deletion, then reads once', async () => {
    const reading = deferred<Array<ExpenseRecord | CalvingRecord>>();
    const deleting = deferred<void>();
    remove.mockReturnValueOnce(deleting.promise);
    render(<MemoryRouter><Component /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument());
    mockList.mockReturnValueOnce(reading.promise).mockResolvedValue([]);
    fireEvent(window, new Event(event));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    const buttons = screen.getAllByRole('button', { name: '削除' });
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[buttons.length - 1]);
    fireEvent(window, new Event(event));
    fireEvent(window, new Event('online'));
    await act(async () => { reading.resolve([withName('削除開始前の古い一覧')]); });
    expect(screen.queryByText('削除開始前の古い一覧')).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledOnce();

    await act(async () => { deleting.resolve(); });

    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(screen.queryByText('削除開始前の古い一覧')).toBeNull();
    expect(screen.queryAllByRole('button', { name: '削除' })).toHaveLength(0);
  });

  it('does not apply a deletion from a context changed while confirmation was open', async () => {
    render(<MemoryRouter><Component /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument());
    vi.mocked(window.confirm).mockImplementationOnce(() => {
      fixture.context = { ...fixture.context, token: 'changed-during-confirmation' };
      return true;
    });
    fireEvent.click(screen.getAllByRole('button', { name: '削除' })[0]);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(remove).not.toHaveBeenCalled();
  });
});

it('keeps an explicit calf registration isolated from pre-existing reads and reads once after confirmation', async () => {
  const reading = deferred<CalvingRecord[]>();
  const registering = deferred<void>();
  fixture.registerCalf.mockReturnValueOnce(registering.promise);
  render(<MemoryRouter><CalvingList /></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument());
  fixture.calvings.mockReturnValueOnce(reading.promise).mockResolvedValue([{ ...calving, registeredToCalfLedger: true, calfId: '1' }]);
  fixture.calves.mockResolvedValue([{ id: 1, calvingId: calving.id, calfNumber: 'CALF-1' }]);
  fireEvent(window, new Event('fixture-animal-status'));
  await waitFor(() => expect(fixture.calvings).toHaveBeenCalledTimes(2));
  const registerButtons = screen.getAllByRole('button', { name: '子牛台帳へ登録' });
  fireEvent.click(registerButtons[0]);
  fireEvent.click(registerButtons[registerButtons.length - 1]);
  fireEvent.click(screen.getAllByRole('button', { name: '削除' })[0]);
  fireEvent(window, new Event('focus'));
  fireEvent(window, new Event('fixture-animal-status'));
  expect(fixture.registerCalf).toHaveBeenCalledOnce();
  expect(fixture.deleteCalving).not.toHaveBeenCalled();
  expect(fixture.calvings).toHaveBeenCalledTimes(2);

  // The mutation may finish first: the pending read must still be discarded,
  // and its queued follow-up must retrieve the newly registered state.
  await act(async () => { registering.resolve(); });
  expect(fixture.calvings).toHaveBeenCalledTimes(2);
  await act(async () => { reading.resolve([{ ...calving, cowName: '登録前の古い一覧' }]); });

  await waitFor(() => expect(fixture.calvings).toHaveBeenCalledTimes(3));
  expect(screen.queryByText('登録前の古い一覧')).toBeNull();
  expect(screen.queryAllByRole('button', { name: '子牛台帳へ登録' })).toHaveLength(0);
  expect(screen.getByText('子牛台帳へ登録しました。子牛台帳で内容を確認してください。')).toBeInTheDocument();
  expect(fixture.ensureMother).not.toHaveBeenCalled();
});
