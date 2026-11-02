import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BlvForm } from './BlvForm';
import { BlvLocalSaveError, createBlvTest, deleteBlvTest, getBlvTest, updateBlvTest } from '../services/blvApi';
import type { BlvTest } from '../types/blv';

vi.mock('../services/blvApi', async importOriginal => ({
  ...await importOriginal<typeof import('../services/blvApi')>(),
  createBlvTest: vi.fn(), updateBlvTest: vi.fn(), deleteBlvTest: vi.fn(), getBlvTest: vi.fn(),
}));
vi.mock('../components/CattlePicker', () => ({ CattlePicker: () => <div>対象牛の選択</div> }));

const record: BlvTest = {
  id: 701, syncRecordId: 'blv:form-fixture', cowEarTag: 'FIXTURE-701', cowName: '試験牛',
  testDate: '2026-11-02', result: '陰性', nextTestDate: '2027-11-02', isolationMemo: '', note: '保持する入力',
};
function signIn(changes: { farmId?: string; id?: string; plan?: string; token?: string } = {}) {
  localStorage.setItem('farmpro.authUser', JSON.stringify({
    id: 'form-user', farmId: 'form-farm', plan: 'standard', ...changes,
  }));
  localStorage.setItem('farmpro.authToken', changes.token ?? 'form-token');
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function show(pathname = '/blv/new') {
  return render(<MemoryRouter initialEntries={[pathname]}><Routes>
    <Route path="/blv/new" element={<BlvForm mode="create" />} />
    <Route path="/blv/:id/edit" element={<BlvForm mode="edit" />} />
    <Route path="/blv" element={<div>BLV一覧に戻った</div>} />
  </Routes></MemoryRouter>);
}
function fillForm(name = '試験牛') {
  fireEvent.change(screen.getByLabelText(/耳標番号/), { target: { value: 'FIXTURE-701' } });
  fireEvent.change(screen.getByLabelText(/牛名/), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('備考'), { target: { value: '保持する入力' } });
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  signIn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(createBlvTest).mockImplementation(async input => ({ ...record, ...input }));
  vi.mocked(updateBlvTest).mockImplementation(async (id, input) => ({ ...record, ...input, id: Number(id) }));
  vi.mocked(getBlvTest).mockResolvedValue(record);
  vi.mocked(deleteBlvTest).mockResolvedValue();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('retries a locally committed creation with its same identity and the current form fields', async () => {
  vi.mocked(createBlvTest).mockRejectedValueOnce(new BlvLocalSaveError(record, new Error('保存の応答を確認できませんでした。')));
  show();
  fillForm();
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('この端末に保存されています');
  expect(screen.queryByText('BLV一覧に戻った')).toBeNull();
  fireEvent.change(screen.getByLabelText(/牛名/), { target: { value: '内容を確認した試験牛' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await screen.findByText('BLV一覧に戻った');
  expect(createBlvTest).toHaveBeenCalledOnce();
  expect(updateBlvTest).toHaveBeenCalledWith(record.id, expect.objectContaining({
    cowName: '内容を確認した試験牛', note: '保持する入力',
  }));
});

it('allows only one formal save while its result is pending', async () => {
  const pending = deferred<BlvTest>();
  vi.mocked(createBlvTest).mockReturnValueOnce(pending.promise);
  show(); fillForm();
  const save = screen.getByRole('button', { name: '保存' });
  fireEvent.click(save); fireEvent.click(save);
  expect(createBlvTest).toHaveBeenCalledOnce();
  expect(screen.getByLabelText(/牛名/)).toBeDisabled();
  await act(async () => { pending.resolve(record); });
  await screen.findByText('BLV一覧に戻った');
  expect(updateBlvTest).not.toHaveBeenCalled();
});

it.each([{ farmId: 'other-farm' }, { id: 'other-user' }, { plan: 'free' }, { token: 'other-token' }])(
  'keeps a delayed committed creation in its original editor when context changes to %j', async changes => {
    const pending = deferred<BlvTest>();
    vi.mocked(createBlvTest).mockReturnValueOnce(pending.promise);
    show(); fillForm();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    signIn(changes);
    await act(async () => { pending.reject(new BlvLocalSaveError(record, new Error('old-context failure'))); });
    expect(await screen.findByRole('alert')).toHaveTextContent('画面を開き直して');
    expect(screen.queryByText('BLV一覧に戻った')).toBeNull();
    expect(screen.queryByText(/old-context failure/)).toBeNull();
    expect(screen.getByLabelText(/牛名/)).toHaveValue('試験牛');
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(createBlvTest).toHaveBeenCalledOnce();
    expect(updateBlvTest).not.toHaveBeenCalled();
  },
);

it('does not let a previous unmounted attempt donate its id or navigate a newly opened form', async () => {
  const pending = deferred<BlvTest>();
  vi.mocked(createBlvTest).mockReturnValueOnce(pending.promise);
  const first = show(); fillForm('閉じた画面の牛');
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  first.unmount();
  show(); fillForm('新しい画面の牛');
  await act(async () => { pending.reject(new BlvLocalSaveError(record, new Error('closed-form failure'))); });
  expect(screen.getByLabelText(/牛名/)).toHaveValue('新しい画面の牛');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText('BLV一覧に戻った')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await screen.findByText('BLV一覧に戻った');
  expect(createBlvTest).toHaveBeenCalledTimes(2);
  expect(updateBlvTest).not.toHaveBeenCalled();
});

it('does not load an old-farm record into an editor after authentication changes', async () => {
  const pending = deferred<BlvTest>();
  vi.mocked(getBlvTest).mockReturnValueOnce(pending.promise);
  show('/blv/701/edit');
  signIn({ farmId: 'another-farm' });
  await act(async () => { pending.resolve({ ...record, cowName: '旧農場の遅い応答' }); });
  expect(await screen.findByRole('alert')).toHaveTextContent('画面を開き直して');
  expect(screen.getByLabelText(/牛名/)).toHaveValue('');
  expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  expect(updateBlvTest).not.toHaveBeenCalled();
});

it('keeps the editor and input after an unconfirmed deletion and allows one explicit retry', async () => {
  vi.mocked(deleteBlvTest).mockRejectedValueOnce(new Error('削除の完了を確認できませんでした。'));
  show('/blv/701/edit');
  await waitFor(() => expect(screen.getByLabelText(/牛名/)).toHaveValue(record.cowName));
  fireEvent.click(screen.getByRole('button', { name: '削除' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('削除の完了を確認できませんでした');
  expect(screen.getByLabelText('備考')).toHaveValue(record.note);
  expect(screen.queryByText('BLV一覧に戻った')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '削除' }));
  await screen.findByText('BLV一覧に戻った');
  expect(deleteBlvTest).toHaveBeenNthCalledWith(1, record.id);
  expect(deleteBlvTest).toHaveBeenNthCalledWith(2, record.id);
  expect(createBlvTest).not.toHaveBeenCalled();
  expect(updateBlvTest).not.toHaveBeenCalled();
});

it('does not save when required cattle fields are missing', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('耳標番号、牛名は必須');
  expect(createBlvTest).not.toHaveBeenCalled();
});
