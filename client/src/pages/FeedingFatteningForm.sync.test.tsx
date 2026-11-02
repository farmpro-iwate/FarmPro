import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedingAlertActionForm } from './FeedingAlertActionForm';
import { FeedingAlertActionEditForm } from './FeedingAlertActionEditForm';
import { FatteningTransitionForm } from './FatteningTransitionForm';
import { FatteningTransitionEditForm } from './FatteningTransitionEditForm';

const fixture = vi.hoisted(() => ({
  context: { farmId: 'form-farm', userId: 'form-user', token: 'form-token', planId: 'standard', cloudEnabled: true },
  createAlert: vi.fn(), updateAlert: vi.fn(), getAlert: vi.fn(),
  createTransition: vi.fn(), updateTransition: vi.fn(), getTransition: vi.fn(),
  LocalSaveError: class extends Error {
    constructor(public record: { id: string }, public cause: unknown) {
      super(cause instanceof Error ? cause.message : '保存の応答を確認できませんでした。');
    }
  },
}));
vi.mock('../services/feedingAlertActionsApi', async importOriginal => ({
  ...await importOriginal<typeof import('../services/feedingAlertActionsApi')>(),
  createFeedingAlertAction: fixture.createAlert, updateFeedingAlertAction: fixture.updateAlert,
  fetchFeedingAlertAction: fixture.getAlert,
  FeedingAlertActionLocalSaveError: fixture.LocalSaveError,
  getFeedingAlertActionSyncContext: () => ({ ...fixture.context }),
  assertFeedingAlertActionSyncContext: (expected: typeof fixture.context) => {
    if (JSON.stringify(expected) !== JSON.stringify(fixture.context)) throw new Error('Context changed');
  },
}));
vi.mock('../services/fatteningTransitionsApi', async importOriginal => ({
  ...await importOriginal<typeof import('../services/fatteningTransitionsApi')>(),
  createFatteningTransition: fixture.createTransition, updateFatteningTransition: fixture.updateTransition,
  getFatteningTransition: fixture.getTransition,
  FatteningTransitionLocalSaveError: fixture.LocalSaveError,
  getFatteningTransitionSyncContext: () => ({ ...fixture.context }),
  assertFatteningTransitionSyncContext: (expected: typeof fixture.context) => {
    if (JSON.stringify(expected) !== JSON.stringify(fixture.context)) throw new Error('Context changed');
  },
}));

const alertRecord = {
  id: 'alert-1', actionDate: '2026-11-02', calfId: 'calf-1', calfName: '試験子牛', ageDays: '92',
  alertType: '不足気味', actionType: '確認のみ', memo: '保持する入力', nextCheckDate: '', status: '未対応',
  createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z',
};
const transitionRecord = {
  id: 'transition-1', targetNumber: 'COW-1', targetName: '試験牛', startDate: '2026-11-02',
  transitionReason: '繁殖終了', startWeight: '620', targetWeight: '780', targetShippingDate: '',
  housingLocation: '第2牛舎', withdrawalEndDate: '', status: '肥育中', memo: '保持する入力',
  createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z',
};
const cases = [
  { name: 'feeding alert', Create: FeedingAlertActionForm, Edit: FeedingAlertActionEditForm,
    path: '/feeding-alert-actions', query: '?calfId=calf-1&calfName=9131&ageDays=92',
    nextQuery: '?calfId=calf-2&calfName=9232&ageDays=93',
    create: fixture.createAlert, update: fixture.updateAlert, get: fixture.getAlert, row: alertRecord,
    date: /対応日/, editButton: '保存する' },
  { name: 'fattening transition', Create: FatteningTransitionForm, Edit: FatteningTransitionEditForm,
    path: '/fattening-transitions', query: '?targetNumber=COW-1&targetName=試験牛&returnTo=%2Fcattle%2F1',
    nextQuery: '?targetNumber=COW-2&targetName=次の試験牛&returnTo=%2Fcattle%2F2',
    create: fixture.createTransition, update: fixture.updateTransition, get: fixture.getTransition,
    row: transitionRecord, date: /肥育開始日/, editButton: '更新する' },
] as const;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function ChangeRoute({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>別の入力画面へ</button>;
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.context = { farmId: 'form-farm', userId: 'form-user', token: 'form-token', planId: 'standard', cloudEnabled: true };
  for (const test of cases) {
    test.create.mockReset().mockImplementation(async input => ({ ...test.row, ...input }));
    test.update.mockReset().mockImplementation(async (id, input) => ({ ...test.row, ...input, id }));
    test.get.mockReset().mockResolvedValue(test.row);
  }
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each(cases)('$name form synchronization', test => {
  const { Create, Edit, path, create, update, get, row, date, editButton } = test;
  function show(edit = false, next?: string) {
    return render(<MemoryRouter initialEntries={[edit ? `${path}/${row.id}/edit` : `${path}/new${test.query}`]}>
      {next && <ChangeRoute to={next} />}
      <Routes>
        <Route path={`${path}/new`} element={<Create />} />
        <Route path={`${path}/:id/edit`} element={<Edit />} />
        <Route path={path} element={<div>一覧に戻った</div>} />
      </Routes>
    </MemoryRouter>);
  }
  function fill() {
    fireEvent.change(screen.getByLabelText(date), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '保持する入力' } });
  }
  function submit(label = '登録する') {
    fireEvent.click(screen.getByRole('button', { name: label }));
  }

  it('retries a committed creation with the same UUID and the current input after a lost response', async () => {
    create.mockRejectedValueOnce(new fixture.LocalSaveError(row, new Error('保存の応答を確認できませんでした。')));
    show(); fill(); submit();
    await screen.findByText(/この端末に保存されています/);
    expect(screen.queryByText('一覧に戻った')).toBeNull();
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '確認後の現在入力' } });
    submit();
    await screen.findByText('一覧に戻った');
    expect(create).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(row.id, expect.objectContaining({ memo: '確認後の現在入力' }));
  });

  it('blocks duplicate form submissions synchronously while a save is pending', async () => {
    const saving = deferred<typeof row>();
    create.mockReturnValueOnce(saving.promise);
    show(); fill();
    const form = screen.getByRole('button', { name: '登録する' }).closest('form')!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(create).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('メモ')).toBeDisabled();
    await act(async () => { saving.resolve(row); });
    await screen.findByText('一覧に戻った');
    expect(update).not.toHaveBeenCalled();
  });

  it.each([{ farmId: 'other-farm' }, { userId: 'other-user' }, { token: 'other-token' }, { planId: 'free', cloudEnabled: false }])(
    'keeps a committed attempt in its original context after %j changes', async changes => {
      const saving = deferred<typeof row>();
      create.mockReturnValueOnce(saving.promise);
      show(); fill(); submit();
      fixture.context = { ...fixture.context, ...changes };
      await act(async () => { saving.reject(new fixture.LocalSaveError(row, new Error('old-context failure'))); });
      await screen.findByText(/画面を開き直して/);
      expect(screen.queryByText('一覧に戻った')).toBeNull();
      expect(screen.queryByText(/old-context failure/)).toBeNull();
      expect(screen.getByLabelText('メモ')).toHaveValue('保持する入力');
      expect(screen.getByRole('button', { name: '登録する' })).toBeDisabled();
      expect(create).toHaveBeenCalledOnce();
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('does not donate a late committed UUID to another target opened in the same route', async () => {
    const saving = deferred<typeof row>();
    create.mockReturnValueOnce(saving.promise);
    show(false, `${path}/new${test.nextQuery}`); fill(); submit();
    fireEvent.click(screen.getByRole('button', { name: '別の入力画面へ' }));
    expect(screen.getByLabelText('メモ')).toHaveValue('');
    await act(async () => { saving.reject(new fixture.LocalSaveError(row, new Error('previous-form failure'))); });
    expect(screen.queryByText(/previous-form failure/)).toBeNull();
    expect(screen.queryByText('一覧に戻った')).toBeNull();
    fill(); submit();
    await screen.findByText('一覧に戻った');
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining(test.name === 'feeding alert'
      ? { calfId: 'calf-2', calfName: '9232' } : { targetNumber: 'COW-2', targetName: '次の試験牛' }));
    expect(update).not.toHaveBeenCalled();
  });

  it('ignores a delayed creation after the form is unmounted', async () => {
    const saving = deferred<typeof row>();
    create.mockReturnValueOnce(saving.promise);
    const old = show(); fill(); submit(); old.unmount();
    show(); fill();
    await act(async () => { saving.reject(new fixture.LocalSaveError(row, new Error('closed-form failure'))); });
    expect(screen.queryByText(/closed-form failure/)).toBeNull();
    expect(screen.getByLabelText('メモ')).toHaveValue('保持する入力');
    submit();
    await screen.findByText('一覧に戻った');
    expect(create).toHaveBeenCalledTimes(2);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a delayed edit load from a previous farm before hydrating or saving it', async () => {
    const reading = deferred<typeof row>();
    get.mockReturnValueOnce(reading.promise);
    show(true);
    fixture.context = { ...fixture.context, farmId: 'new-farm' };
    await act(async () => { reading.resolve({ ...row, memo: '旧農場の遅い応答' }); });
    await screen.findByText(/画面を開き直して/);
    expect(screen.queryByDisplayValue('旧農場の遅い応答')).toBeNull();
    const save = screen.queryByRole('button', { name: editButton });
    if (save) fireEvent.click(save);
    expect(update).not.toHaveBeenCalled();
  });

  it('discards an old edit response when the route opens a different UUID', async () => {
    const reading = deferred<typeof row>();
    get.mockReturnValueOnce(reading.promise).mockResolvedValue({ ...row, id: 'next-record', memo: '次の記録の入力' });
    show(true, `${path}/next-record/edit`);
    fireEvent.click(screen.getByRole('button', { name: '別の入力画面へ' }));
    await screen.findByDisplayValue('次の記録の入力');
    await act(async () => { reading.resolve({ ...row, memo: '旧画面の遅い応答' }); });
    expect(screen.getByLabelText('メモ')).toHaveValue('次の記録の入力');
    submit(editButton);
    await screen.findByText('一覧に戻った');
    expect(update).toHaveBeenCalledWith('next-record', expect.objectContaining({ memo: '次の記録の入力' }));
  });

  it('keeps an edit failure visible with its current input and permits one explicit retry', async () => {
    const saving = deferred<typeof row>();
    update.mockReturnValueOnce(saving.promise);
    show(true);
    await screen.findByDisplayValue('保持する入力');
    const form = screen.getByRole('button', { name: editButton }).closest('form')!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(update).toHaveBeenCalledOnce();
    await act(async () => { saving.reject(new Error('保存の完了を確認できませんでした。')); });
    await screen.findByText('保存の完了を確認できませんでした。');
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '再試行前に確認した入力' } });
    submit(editButton);
    await screen.findByText('一覧に戻った');
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenNthCalledWith(2, row.id, expect.objectContaining({ memo: '再試行前に確認した入力' }));
  });
});
