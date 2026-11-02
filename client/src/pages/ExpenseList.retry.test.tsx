import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseList } from './ExpenseList';
import { EXPENSE_SYNC_STATUS_EVENT, getExpensesList, retryUnsentExpenses, type ExpenseRecord } from '../services/expensesApi';

vi.mock('../services/expensesApi', () => ({
  EXPENSE_SYNC_STATUS_EVENT: 'farmpro:expense-sync-status',
  expenseSyncContext: () => ({ farmId: null, userId: null, token: null, cloudEnabled: false }),
  assertExpenseSyncContext: vi.fn(),
  getExpensesList: vi.fn(),
  retryUnsentExpenses: vi.fn(),
  deleteExpense: vi.fn(),
  paymentMethodOptions: ['現金'],
}));

const pending: ExpenseRecord = {
  id: 'et-fee', syncRecordId: 'expense:et-fee', cloudSyncPending: true,
  category: '種付け・繁殖費', sourceType: 'breeding', sourceId: 'et-1', sourceDetail: 'transfer-procedure',
  paymentDate: '2026-11-01', description: '移植料', amount: '10000',
  vendor: '', paymentMethod: '現金', target: '試験牛', memo: '', createdAt: '', updatedAt: '',
};
const synced: ExpenseRecord = { ...pending, cloudSyncPending: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getExpensesList).mockResolvedValue([pending]);
});
afterEach(() => { cleanup(); });

describe('ExpenseList expense sync status', () => {
  it('送信待ち件数を表示し、同期完了event後は金額を変えず警告を解除する', async () => {
    render(<MemoryRouter><ExpenseList /></MemoryRouter>);
    expect(await screen.findByText('同期確認待ちの経費が1件あります。記録はこの端末に保存されています。')).toBeInTheDocument();
    expect(screen.getAllByText('10,000円').length).toBeGreaterThan(0);

    vi.mocked(getExpensesList).mockResolvedValue([synced]);
    fireEvent(window, new Event(EXPENSE_SYNC_STATUS_EVENT));
    await waitFor(() => expect(screen.queryByText(/同期確認待ちの経費/)).not.toBeInTheDocument());
    expect(screen.getAllByText('10,000円').length).toBeGreaterThan(0);
    expect(screen.getAllByText('移植料').length).toBeGreaterThan(0);
    expect(retryUnsentExpenses).not.toHaveBeenCalled();
  });

  it('初回取得中の複数eventを1回の再取得にまとめ、完了後の最新状態を取りこぼさない', async () => {
    let resolve!: (records: ExpenseRecord[]) => void;
    const initial = new Promise<ExpenseRecord[]>((done) => { resolve = done; });
    vi.mocked(getExpensesList).mockReturnValueOnce(initial).mockResolvedValue([synced]);
    render(<MemoryRouter><ExpenseList /></MemoryRouter>);
    fireEvent(window, new Event(EXPENSE_SYNC_STATUS_EVENT));
    fireEvent(window, new Event(EXPENSE_SYNC_STATUS_EVENT));
    fireEvent(window, new Event(EXPENSE_SYNC_STATUS_EVENT));
    expect(getExpensesList).toHaveBeenCalledOnce();

    await act(async () => { resolve([pending]); });
    await waitFor(() => expect(getExpensesList).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/同期確認待ちの経費/)).not.toBeInTheDocument();
    expect(screen.getAllByText('移植料').length).toBeGreaterThan(0);
    expect(retryUnsentExpenses).not.toHaveBeenCalled();
  });

  it('再送未完了のeventでは記録と警告を保持し、画面を閉じた後は再取得しない', async () => {
    const view = render(<MemoryRouter><ExpenseList /></MemoryRouter>);
    await screen.findByText(/同期確認待ちの経費が1件/);
    fireEvent(window, new Event(EXPENSE_SYNC_STATUS_EVENT));
    await waitFor(() => expect(getExpensesList).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/同期確認待ちの経費が1件/)).toBeInTheDocument();
    expect(screen.getAllByText('10,000円').length).toBeGreaterThan(0);

    view.unmount();
    fireEvent(window, new Event(EXPENSE_SYNC_STATUS_EVENT));
    expect(getExpensesList).toHaveBeenCalledTimes(2);
    expect(retryUnsentExpenses).not.toHaveBeenCalled();
  });
});
