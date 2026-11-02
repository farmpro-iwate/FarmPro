import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedingAlertActionList } from './FeedingAlertActionList';
import { FatteningTransitionList } from './FatteningTransitionList';

const fixture = vi.hoisted(() => ({
  context: { farmId: 'list-farm', userId: 'list-user', token: 'list-token', planId: 'standard', cloudEnabled: true },
  status: { pending: false, warning: undefined as string | undefined },
  listAlert: vi.fn(), deleteAlert: vi.fn(), listTransition: vi.fn(), deleteTransition: vi.fn(),
  retryAlert: vi.fn(), retryTransition: vi.fn(),
}));
vi.mock('../services/feedingAlertActionsApi', () => ({
  fetchFeedingAlertActions: fixture.listAlert, deleteFeedingAlertAction: fixture.deleteAlert,
  getFeedingAlertActionSyncContext: () => ({ ...fixture.context }),
  assertFeedingAlertActionSyncContext: (expected: typeof fixture.context) => {
    if (JSON.stringify(expected) !== JSON.stringify(fixture.context)) throw new Error('Context changed');
  },
  getFeedingAlertActionSyncStatus: () => fixture.status,
  FEEDING_ALERT_ACTION_SYNC_STATUS_EVENT: 'fixture-feeding-alert-status',
  retryPendingFeedingAlertActionSync: fixture.retryAlert,
}));
vi.mock('../services/fatteningTransitionsApi', () => ({
  getFatteningTransitions: fixture.listTransition, deleteFatteningTransition: fixture.deleteTransition,
  getFatteningTransitionSyncContext: () => ({ ...fixture.context }),
  assertFatteningTransitionSyncContext: (expected: typeof fixture.context) => {
    if (JSON.stringify(expected) !== JSON.stringify(fixture.context)) throw new Error('Context changed');
  },
  getFatteningTransitionSyncStatus: () => fixture.status,
  FATTENING_TRANSITION_SYNC_STATUS_EVENT: 'fixture-fattening-transition-status',
  retryPendingFatteningTransitionSync: fixture.retryTransition,
}));
const alertRecord = {
  id: 'alert-1', actionDate: '2026-11-02', calfId: 'calf-1', calfName: '表示する試験子牛', ageDays: '92',
  alertType: '不足気味', actionType: '確認のみ', memo: '', nextCheckDate: '', status: '未対応',
  createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z',
};
const transitionRecord = {
  id: 'transition-1', targetNumber: 'COW-1', targetName: '表示する試験牛', startDate: '2026-11-02',
  transitionReason: '繁殖終了', startWeight: '620', targetWeight: '780', targetShippingDate: '',
  housingLocation: '第2牛舎', withdrawalEndDate: '', status: '肥育中', memo: '',
  createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z',
};
const cases = [
  { name: 'feeding alert', Component: FeedingAlertActionList, list: fixture.listAlert, remove: fixture.deleteAlert,
    event: 'fixture-feeding-alert-status', row: alertRecord, rowName: alertRecord.calfName,
    withName: (name: string) => ({ ...alertRecord, calfName: name }),
    pending: '未送信の給与アラート対応記録が1件あります。この端末に保存されています。' },
  { name: 'fattening transition', Component: FatteningTransitionList, list: fixture.listTransition, remove: fixture.deleteTransition,
    event: 'fixture-fattening-transition-status', row: transitionRecord, rowName: transitionRecord.targetName,
    withName: (name: string) => ({ ...transitionRecord, targetName: name }),
    pending: '未送信の肥育移行記録が1件あります。この端末に保存されています。' },
] as const;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.context = { farmId: 'list-farm', userId: 'list-user', token: 'list-token', planId: 'standard', cloudEnabled: true };
  fixture.status = { pending: false, warning: undefined };
  for (const test of cases) {
    test.list.mockReset().mockResolvedValue([test.row]);
    test.remove.mockReset().mockResolvedValue(undefined);
  }
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each(cases)('$name list synchronization', ({ Component, list, remove, event, row, rowName, withName, pending }) => {
  function show() { return render(<MemoryRouter><Component /></MemoryRouter>); }
  function notify() {
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    fireEvent(window, new Event(event));
  }

  it('shows synchronization status and refreshes it without starting a formal write', async () => {
    fixture.status = { pending: true, warning: '別端末の変更を確認してください。' };
    show();
    await screen.findByText(pending);
    expect(screen.getByText('別端末の変更を確認してください。')).toBeInTheDocument();
    expect(screen.getByText('同期の確認が必要')).toBeInTheDocument();
    fixture.status = { pending: false, warning: undefined };
    list.mockResolvedValue([{ ...row }]);
    fireEvent(window, new Event(event));
    await waitFor(() => expect(screen.queryByText(pending)).toBeNull());
    expect(screen.queryByText('同期の確認が必要')).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalled();
    expect(fixture.retryAlert).not.toHaveBeenCalled();
    expect(fixture.retryTransition).not.toHaveBeenCalled();
  });

  it('coalesces a notification burst during an outstanding read into one follow-up', async () => {
    const reading = deferred<Array<typeof row>>();
    list.mockReturnValueOnce(reading.promise).mockResolvedValue([withName('更新後の表示')]);
    show(); notify();
    expect(list).toHaveBeenCalledOnce();
    await act(async () => { reading.resolve([row]); });
    await screen.findByText('更新後の表示');
    expect(list).toHaveBeenCalledTimes(2);
  });

  it.each([{ farmId: 'new-farm' }, { userId: 'new-user' }, { token: 'new-token' }, { planId: 'free', cloudEnabled: false }])(
    'discards a stale response and rebinds after the context changes by %j', async changes => {
      const reading = deferred<Array<typeof row>>();
      list.mockReturnValueOnce(reading.promise).mockResolvedValue([withName('現在の文脈の表示')]);
      show();
      fixture.context = { ...fixture.context, ...changes };
      await act(async () => { reading.resolve([withName('旧文脈の遅い応答')]); });
      await screen.findByText('現在の文脈の表示');
      expect(screen.queryByText('旧文脈の遅い応答')).toBeNull();
      expect(list).toHaveBeenCalledTimes(2);
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('does not follow a queued read or respond to events after unmount', async () => {
    const reading = deferred<Array<typeof row>>();
    list.mockReturnValueOnce(reading.promise);
    const view = show(); notify(); view.unmount();
    await act(async () => { reading.resolve([row]); });
    notify();
    expect(list).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
  });

  it('invalidates pre-delete reads and suppresses notifications until one final reload', async () => {
    const reading = deferred<Array<typeof row>>();
    const deleting = deferred<void>();
    remove.mockReturnValueOnce(deleting.promise);
    show(); await screen.findByText(rowName);
    list.mockReturnValueOnce(reading.promise).mockResolvedValue([]);
    fireEvent(window, new Event(event));
    const button = screen.getByRole('button', { name: /削除/ });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(remove).toHaveBeenCalledOnce();
    notify();
    await act(async () => { reading.resolve([withName('削除前の古い読取')]); });
    expect(screen.queryByText('削除前の古い読取')).toBeNull();
    expect(screen.getByText(rowName)).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
    await act(async () => { deleting.resolve(); });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(screen.queryByText(rowName)).toBeNull();
    expect(remove).toHaveBeenCalledWith(row.id);
  });

  it('retains a failed deletion and its warning after reload, then allows an explicit retry', async () => {
    remove.mockRejectedValueOnce(new Error('削除の確認が必要です。端末の記録は保持されています。'));
    show(); await screen.findByText(rowName);
    fireEvent.click(screen.getByRole('button', { name: /削除/ }));
    await screen.findByText('削除の確認が必要です。端末の記録は保持されています。');
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(screen.getByText(rowName)).toBeInTheDocument();
    list.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: /削除/ }));
    await waitFor(() => expect(screen.queryByText(rowName)).toBeNull());
    expect(remove).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/削除の確認が必要です/)).toBeNull();
  });

  it('does not delete in a different context after the confirmation dialog', async () => {
    show(); await screen.findByText(rowName);
    vi.mocked(window.confirm).mockImplementation(() => {
      fixture.context = { ...fixture.context, token: 'new-token' };
      return true;
    });
    fireEvent.click(screen.getByRole('button', { name: /削除/ }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(remove).not.toHaveBeenCalled();
  });

  it('skips hidden and offline events, then reloads on a visible online resume', async () => {
    show(); await screen.findByText(rowName);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    notify();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    notify();
    expect(list).toHaveBeenCalledOnce();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});
