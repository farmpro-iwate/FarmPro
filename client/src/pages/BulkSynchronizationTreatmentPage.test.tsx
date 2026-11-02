import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BulkSynchronizationTreatmentPage } from './BulkSynchronizationTreatmentPage';
import type { Treatment, TreatmentInput } from '../types/treatment';
import type { Schedule } from '../types/schedule';

const fixture = vi.hoisted(() => ({
  user: { id: 'bulk-user', farmId: 'bulk-farm' }, token: 'bulk-token', plan: 'standard',
  list: vi.fn<() => Promise<Schedule[]>>(),
  complete: vi.fn<(ids: Array<string | number>) => Promise<Schedule[]>>(),
  create: vi.fn<(inputs: TreatmentInput[], options?: { onLocalSaved?: (ids: number[]) => void }) => Promise<Treatment[]>>(),
  update: vi.fn<(id: string | number, input: TreatmentInput) => Promise<Treatment>>(),
}));
vi.mock('../services/authClient', () => ({
  getStoredAuthUser: () => fixture.user, getAuthToken: () => fixture.token,
}));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => fixture.plan }));
vi.mock('../services/scheduleApi', () => ({ getScheduleList: fixture.list, completeSchedules: fixture.complete }));
vi.mock('../services/treatmentApi', () => ({ createManyTreatments: fixture.create, updateTreatment: fixture.update }));

function dateText() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function url(programId = 'program-a') {
  return `/bulk?${new URLSearchParams({ programId, title: '発情誘起処置', returnTo: '/finished' })}`;
}
function TestRoutes() {
  const navigate = useNavigate();
  return <>
    <button onClick={() => navigate(url('program-b'))}>別の対象へ</button>
    <Routes>
      <Route path="/bulk" element={<BulkSynchronizationTreatmentPage />} />
      <Route path="/finished" element={<div>予定画面へ戻った</div>} />
    </Routes>
  </>;
}
async function show() {
  const view = render(<MemoryRouter initialEntries={[url()]}><TestRoutes /></MemoryRouter>);
  await screen.findByText('対象：2頭');
  return view;
}
const save = () => screen.getByRole('button', { name: '2頭に記録して完了' });
const cloudFailure = '治療の保存応答を確認できませんでした。';

beforeEach(() => {
  fixture.user = { id: 'bulk-user', farmId: 'bulk-farm' };
  fixture.token = 'bulk-token'; fixture.plan = 'standard';
  fixture.list.mockReset(); fixture.complete.mockReset(); fixture.create.mockReset(); fixture.update.mockReset();
  fixture.list.mockResolvedValue([101, 102, 201].map(id => ({
    id, scheduleType: '繁殖処置', title: '発情誘起処置', targetNumber: `COW-${id}`, targetName: `試験牛${id}`,
    dueDate: dateText(), status: '未完了', note: '', synchronizationProgramId: id === 201 ? 'program-b' : 'program-a',
    synchronizationProgramName: '同期化検証',
  })));
  fixture.complete.mockResolvedValue([]);
  fixture.create.mockImplementation(async (inputs, options) => {
    const ids = inputs.map((_, index) => 900 + fixture.create.mock.calls.length * 10 + index);
    options?.onLocalSaved?.(ids);
    return inputs.map((input, index) => ({ ...input, id: ids[index], cloudSyncPending: false }));
  });
  fixture.update.mockImplementation(async (id, input) => ({ ...input, id: Number(id), cloudSyncPending: false }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('retries the exact committed treatment IDs after cloud failure and completes schedules only after every source is confirmed', async () => {
  fixture.create.mockImplementationOnce(async (_inputs, options) => {
    options?.onLocalSaved?.([901, 902]);
    throw new Error(cloudFailure);
  });
  let finishSecond!: (saved: Treatment) => void;
  const second = new Promise<Treatment>(resolve => { finishSecond = resolve; });
  fixture.update.mockImplementation(async (id, input) => Number(id) === 902 ? second : ({ ...input, id: Number(id) }));
  await show();
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('薬剤名'), '検証薬');

  await user.click(save());
  await screen.findByText(cloudFailure);
  expect(fixture.complete).not.toHaveBeenCalled();
  await user.click(save());
  await waitFor(() => expect(fixture.update).toHaveBeenCalledTimes(2));

  expect(fixture.create).toHaveBeenCalledTimes(1);
  expect(fixture.update.mock.calls.map(([id]) => id)).toEqual([901, 902]);
  expect(fixture.update.mock.calls.map(([, input]) => [input.targetNumber, input.sourceScheduleId, input.medicine]))
    .toEqual([['COW-101', '101', '検証薬'], ['COW-102', '102', '検証薬']]);
  expect(fixture.complete).not.toHaveBeenCalled();
  await act(async () => { finishSecond({ ...fixture.update.mock.calls[1][1], id: 902 }); });

  await screen.findByText('予定画面へ戻った');
  expect(fixture.complete).toHaveBeenCalledExactlyOnceWith([101, 102]);
});

it('retries only schedule completion after all treatment sources have already been confirmed', async () => {
  fixture.complete.mockRejectedValueOnce(new Error('予定の完了を確認できませんでした。'));
  await show();
  const user = userEvent.setup();

  await user.click(save());
  await screen.findByText('治療記録は保存済みです。予定の完了を確認できませんでした。');
  await user.click(save());

  await screen.findByText('予定画面へ戻った');
  expect(fixture.create).toHaveBeenCalledTimes(1);
  expect(fixture.update).not.toHaveBeenCalled();
  expect(fixture.complete.mock.calls).toEqual([[[101, 102]], [[101, 102]]]);
});

it.each([false, true])('binds changed input to a new operation only before local IDs exist (committed=%s)', async committed => {
  fixture.create.mockImplementationOnce(async (_inputs, options) => {
    if (committed) options?.onLocalSaved?.([901, 902]);
    throw new Error(cloudFailure);
  });
  await show();
  const user = userEvent.setup();
  await user.click(save());
  await screen.findByText(cloudFailure);
  await user.type(screen.getByLabelText('メモ'), '変更した処置内容');

  await user.click(save());

  if (committed) {
    await screen.findByText(/保存待ちの処置と入力・対象が変わっています/);
    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.complete).not.toHaveBeenCalled();
  } else {
    await screen.findByText('予定画面へ戻った');
    expect(fixture.create).toHaveBeenCalledTimes(2);
    expect(fixture.create.mock.calls[1][0].every(input => input.note === '変更した処置内容')).toBe(true);
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.complete).toHaveBeenCalledExactlyOnceWith([101, 102]);
  }
});

it('remembers committed IDs before rejecting a changed context and safely reuses them when that same context returns', async () => {
  fixture.create.mockImplementationOnce(async (_inputs, options) => {
    fixture.token = 'changed-token';
    options?.onLocalSaved?.([901, 902]);
    throw new Error('A changed-context callback must reject before this point');
  });
  await show();
  const user = userEvent.setup();

  await user.click(save());
  await screen.findByText(/ログイン・農場または画面の情報が変わった/);
  await user.click(save());
  expect(fixture.create).toHaveBeenCalledTimes(1);
  expect(fixture.update).not.toHaveBeenCalled();
  expect(fixture.complete).not.toHaveBeenCalled();
  fixture.token = 'bulk-token';
  await user.click(save());

  await screen.findByText('予定画面へ戻った');
  expect(fixture.create).toHaveBeenCalledTimes(1);
  expect(fixture.update.mock.calls.map(([id]) => id)).toEqual([901, 902]);
  expect(fixture.complete).toHaveBeenCalledExactlyOnceWith([101, 102]);
});

it('stops before creating local treatments when the farm changes while the confirmation dialog is open', async () => {
  vi.mocked(window.confirm).mockImplementationOnce(() => {
    fixture.user.farmId = 'changed-farm';
    return true;
  });
  await show();
  const user = userEvent.setup();

  await user.click(save());

  await screen.findByText(/ログイン・農場または画面の情報が変わった/);
  expect(fixture.create).not.toHaveBeenCalled();
  expect(fixture.update).not.toHaveBeenCalled();
  expect(fixture.complete).not.toHaveBeenCalled();
});

it.each(['unmount', 'targets'] as const)('invalidates an old operation on %s while its source response is pending', async boundary => {
  let complete!: (saved: Treatment[]) => void;
  const pending = new Promise<Treatment[]>(resolve => { complete = resolve; });
  fixture.create.mockImplementationOnce(async (_inputs, options) => {
    options?.onLocalSaved?.([901, 902]);
    return pending;
  });
  await show();
  const user = userEvent.setup();
  await user.click(save());
  await waitFor(() => expect(fixture.create).toHaveBeenCalledTimes(1));

  if (boundary === 'unmount') {
    await user.click(screen.getByRole('link', { name: '戻る' }));
    await screen.findByText('予定画面へ戻った');
  } else {
    await user.click(screen.getByRole('button', { name: '別の対象へ' }));
    await screen.findByText('対象：1頭');
  }
  await act(async () => { complete(fixture.create.mock.calls[0][0].map((input, index) => ({ ...input, id: 901 + index }))); });

  expect(fixture.complete).not.toHaveBeenCalled();
  expect(fixture.update).not.toHaveBeenCalled();
  if (boundary === 'targets') {
    expect(screen.queryByText('予定画面へ戻った')).toBeNull();
    await user.click(screen.getByRole('button', { name: '1頭に記録して完了' }));
    await screen.findByText('予定画面へ戻った');
    expect(fixture.create).toHaveBeenCalledTimes(2);
    expect(fixture.create.mock.calls[1][0]).toMatchObject([{ targetNumber: 'COW-201', sourceScheduleId: '201' }]);
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.complete).toHaveBeenCalledExactlyOnceWith([201]);
  }
});

it('starts one creation when the save control is clicked twice before React renders its disabled state', async () => {
  let complete!: (saved: Treatment[]) => void;
  const pending = new Promise<Treatment[]>(resolve => { complete = resolve; });
  fixture.create.mockImplementationOnce(async (_inputs, options) => {
    options?.onLocalSaved?.([901, 902]);
    return pending;
  });
  await show();
  const button = save();

  act(() => { fireEvent.click(button); fireEvent.click(button); });

  expect(fixture.create).toHaveBeenCalledTimes(1);
  expect(window.confirm).toHaveBeenCalledTimes(1);
  await act(async () => { complete(fixture.create.mock.calls[0][0].map((input, index) => ({ ...input, id: 901 + index }))); });
  await screen.findByText('予定画面へ戻った');
  expect(fixture.complete).toHaveBeenCalledExactlyOnceWith([101, 102]);
});
