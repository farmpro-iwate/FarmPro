import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityRecordList } from './ActivityRecordList';

const fixture = vi.hoisted(() => ({
  context: { farmId: 'activity-list-farm', userId: 'activity-list-user', token: 'activity-list-token', planId: 'standard', cloudEnabled: true },
  status: { pending: false, warning: undefined as string | undefined },
  list: vi.fn(), remove: vi.fn(),
}));
vi.mock('../services/activityRecordsApi', () => ({
  getActivityRecords: fixture.list, deleteActivityRecord: fixture.remove,
  getActivityRecordSyncContext: () => ({ ...fixture.context }),
  assertActivityRecordSyncContext: (expected: typeof fixture.context) => {
    if (JSON.stringify(expected) !== JSON.stringify(fixture.context)) throw new Error('Context changed');
  },
  getActivityRecordSyncStatus: () => fixture.status,
  ACTIVITY_RECORD_SYNC_STATUS_EVENT: 'fixture-activity-status',
}));

const farmRecord = {
  id: 'activity-farm-1', activityType: 'farm', recordDate: '2026-11-03', title: '農場の清掃記録', note: '入口を清掃',
  animalKind: '', animalId: '', animalSyncId: '', animalIdentificationNumber: '', animalEarTag: '', animalName: '', animalBirthday: '',
  createdAt: '2026-11-03T00:00:00.000Z', updatedAt: '2026-11-03T00:00:00.000Z',
};
const animalRecord = {
  ...farmRecord, id: 'activity-animal-1', activityType: 'animal', title: '歩行の観察記録', note: '前日と同じ様子',
  animalKind: 'cattle', animalId: '101', animalEarTag: '0123', animalName: '一覧の試験牛',
};
function show(path = '/activities?type=farm') {
  return render(<MemoryRouter initialEntries={[path]}><ActivityRecordList /></MemoryRouter>);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.context = { farmId: 'activity-list-farm', userId: 'activity-list-user', token: 'activity-list-token', planId: 'standard', cloudEnabled: true };
  fixture.status = { pending: false, warning: undefined };
  fixture.list.mockReset().mockResolvedValue([farmRecord, animalRecord]);
  fixture.remove.mockReset().mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ActivityRecordList', () => {
  it('農場作業と個体記録を切り替え、先頭ゼロを保った耳標で検索できる', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText('農場の清掃記録');
    expect(screen.queryByText('歩行の観察記録')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '農場作業を登録' })).toHaveAttribute('href', '/activities/new?type=farm');
    await user.click(screen.getByRole('tab', { name: '個体の記録' }));
    await screen.findByText('歩行の観察記録');
    expect(screen.queryByText('農場の清掃記録')).not.toBeInTheDocument();
    expect(screen.getByText('一覧の試験牛（耳標 0123）')).toBeInTheDocument();
    await user.type(screen.getByLabelText('記録を検索'), '0123');
    expect(screen.getByText('歩行の観察記録')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('記録を検索'));
    await user.type(screen.getByLabelText('記録を検索'), '該当しない内容');
    expect(screen.queryByText('歩行の観察記録')).not.toBeInTheDocument();
    expect(fixture.remove).not.toHaveBeenCalled();
  });

  it('削除済みを除き、削除保留は編集せず本人の操作で削除を再試行できる', async () => {
    fixture.list.mockResolvedValue([
      animalRecord,
      { ...animalRecord, id: 'deleted-record', title: '削除済みの記録', deletedAt: '2026-11-03T01:00:00.000Z' },
      { ...animalRecord, id: 'pending-delete', title: '削除保留の記録', activityRecordSyncDeletePending: true },
    ]);
    const user = userEvent.setup();
    show('/activities?type=animal');
    await screen.findByText('歩行の観察記録');
    expect(screen.queryByText('削除済みの記録')).not.toBeInTheDocument();
    expect(screen.getByText('削除保留の記録')).toBeInTheDocument();
    expect(screen.getByText('削除確認待ち')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '削除保留の記録の操作' }));
    expect(screen.getByRole('menuitem', { name: '編集' })).toHaveAttribute('aria-disabled', 'true');
    fixture.list.mockResolvedValue([animalRecord]);
    await user.click(screen.getByRole('menuitem', { name: '削除を再試行' }));
    await waitFor(() => expect(screen.queryByText('削除保留の記録')).not.toBeInTheDocument());
    expect(fixture.remove).toHaveBeenCalledWith('pending-delete');
    fixture.remove.mockClear();
    await user.click(screen.getByRole('button', { name: '歩行の観察記録の操作' }));
    const link = screen.getByRole('menuitem', { name: '編集' });
    const destination = new URL(link.getAttribute('href') || '', 'https://fixture.invalid');
    expect(destination.pathname).toBe('/activities/activity-animal-1/edit');
    expect(destination.searchParams.get('returnTo')).toBe('/activities?type=animal');
    expect(fixture.remove).not.toHaveBeenCalled();
  });

  it('三点メニューで削除を確認し、取り消した場合は保存記録を維持する', async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    show(); await screen.findByText('農場の清掃記録');
    await user.click(screen.getByRole('button', { name: '農場の清掃記録の操作' }));
    await user.click(screen.getByRole('menuitem', { name: '削除' }));
    expect(window.confirm).toHaveBeenCalledWith('「農場の清掃記録」の記録を削除しますか？');
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(screen.getByText('農場の清掃記録')).toBeInTheDocument();

    fixture.list.mockResolvedValue([animalRecord]);
    await user.click(screen.getByRole('button', { name: '農場の清掃記録の操作' }));
    await user.click(screen.getByRole('menuitem', { name: '削除' }));
    await waitFor(() => expect(screen.queryByText('農場の清掃記録')).not.toBeInTheDocument());
    expect(fixture.remove).toHaveBeenCalledOnce();
    expect(fixture.remove).toHaveBeenCalledWith('activity-farm-1');
  });

  it('未送信や競合の表示だけでは記録を削除しない', async () => {
    fixture.list.mockResolvedValue([farmRecord]);
    fixture.status = { pending: true, warning: '別端末の変更を確認してください。' };
    show();
    await screen.findByText('未送信の活動記録が1件あります。この端末に保存されています。');
    expect(screen.getByText('別端末の変更を確認してください。')).toBeInTheDocument();
    expect(screen.getByText('農場の清掃記録')).toBeInTheDocument();
    expect(fixture.remove).not.toHaveBeenCalled();
  });

  it('農場切替後に旧農場の読み込み結果を表示しない', async () => {
    const reading = deferred<Array<typeof farmRecord>>();
    fixture.list.mockReturnValueOnce(reading.promise).mockResolvedValue([{ ...farmRecord, title: '現在の農場の記録' }]);
    show();
    fixture.context = { ...fixture.context, farmId: 'next-farm' };
    await act(async () => { reading.resolve([{ ...farmRecord, title: '旧農場の遅い応答' }]); });
    await screen.findByText('現在の農場の記録');
    expect(screen.queryByText('旧農場の遅い応答')).not.toBeInTheDocument();
    expect(fixture.remove).not.toHaveBeenCalled();
  });

  it('農場が切り替わったら旧農場の記録の操作メニューを閉じる', async () => {
    const user = userEvent.setup();
    show(); await screen.findByText('農場の清掃記録');
    await user.click(screen.getByRole('button', { name: '農場の清掃記録の操作' }));
    expect(screen.getByRole('menuitem', { name: '削除' })).toBeInTheDocument();
    fixture.context = { ...fixture.context, farmId: 'next-farm' };
    fixture.list.mockResolvedValue([{ ...farmRecord, id: 'next-farm-record', title: '別農場の記録' }]);
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(fixture.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('menuitem', { name: '削除' })).not.toBeInTheDocument();
    expect(fixture.remove).not.toHaveBeenCalled();
  });
});
