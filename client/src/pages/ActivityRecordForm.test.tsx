import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityRecordForm } from './ActivityRecordForm';

const fixture = vi.hoisted(() => ({
  context: { farmId: 'activity-form-farm', userId: 'activity-form-user', token: 'activity-form-token', planId: 'standard', cloudEnabled: true },
  create: vi.fn(), update: vi.fn(), get: vi.fn(), cattle: vi.fn(), calves: vi.fn(),
  LocalSaveError: class extends Error {
    constructor(public record: { id: string }, cause: unknown) {
      super(cause instanceof Error ? cause.message : '保存の応答を確認できませんでした。');
    }
  },
}));
vi.mock('../services/activityRecordsApi', async importOriginal => ({
  ...await importOriginal<typeof import('../services/activityRecordsApi')>(),
  createActivityRecord: fixture.create, updateActivityRecord: fixture.update, getActivityRecord: fixture.get,
  ActivityRecordLocalSaveError: fixture.LocalSaveError,
  getActivityRecordSyncContext: () => ({ ...fixture.context }),
  assertActivityRecordSyncContext: (expected: typeof fixture.context) => {
    if (JSON.stringify(expected) !== JSON.stringify(fixture.context)) throw new Error('Context changed');
  },
}));
vi.mock('../services/api', async importOriginal => ({
  ...await importOriginal<typeof import('../services/api')>(), getCattleList: fixture.cattle,
}));
vi.mock('../services/calfApi', async importOriginal => ({
  ...await importOriginal<typeof import('../services/calfApi')>(), getCalfList: fixture.calves,
}));

const farmRecord = {
  id: 'activity-1', activityType: 'farm', recordDate: '2026-11-03', title: '牛舎を清掃', note: '入口を確認',
  animalKind: '', animalId: '', animalSyncId: '', animalIdentificationNumber: '', animalEarTag: '', animalName: '', animalBirthday: '',
  createdAt: '2026-11-03T00:00:00.000Z', updatedAt: '2026-11-03T00:00:00.000Z',
};
const cattle = {
  id: 101, syncId: 'cattle-fixture-uuid', name: '記録の試験母牛', earTag: '0123',
  identificationNumber: '1234500123', birthday: '2020-01-01', stage: '繁殖牛',
};
const calf = {
  id: 202, syncRecordId: 'calf-fixture-uuid', name: '記録の試験子牛', calfNumber: '0456',
  identificationNumber: '1234500456', birthday: '2026-01-01', managementStatus: '育成中',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function show(path = '/activities/new?type=farm') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/activities/new" element={<ActivityRecordForm mode="create" />} />
    <Route path="/activities/:id/edit" element={<ActivityRecordForm mode="edit" />} />
    <Route path="/activities" element={<div>記録一覧へ戻った</div>} />
    <Route path="/calves/:id" element={<div>子牛カルテへ戻った</div>} />
  </Routes></MemoryRouter>);
}
function fillFarm() {
  fireEvent.change(screen.getByLabelText(/作業日/), { target: { value: '2026-11-03' } });
  fireEvent.change(screen.getByLabelText(/作業内容/), { target: { value: '牛舎を清掃' } });
  fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '入口を確認' } });
}
function fillAnimal() {
  fireEvent.change(screen.getByLabelText(/記録日/), { target: { value: '2026-11-03' } });
  fireEvent.change(screen.getByLabelText(/記録内容/), { target: { value: '歩行を確認' } });
}
function submit() {
  const field = screen.queryByLabelText(/作業内容/) || screen.getByLabelText(/記録内容/);
  fireEvent.submit(field.closest('form')!);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  fixture.context = { farmId: 'activity-form-farm', userId: 'activity-form-user', token: 'activity-form-token', planId: 'standard', cloudEnabled: true };
  fixture.create.mockReset().mockImplementation(async input => ({ ...farmRecord, ...input }));
  fixture.update.mockReset().mockImplementation(async (id, input) => ({ ...farmRecord, ...input, id }));
  fixture.get.mockReset().mockResolvedValue(farmRecord);
  fixture.cattle.mockReset().mockResolvedValue([cattle]);
  fixture.calves.mockReset().mockResolvedValue([calf]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ActivityRecordForm', () => {
  it('新規の個体記録では死亡牛を選ばず、選択後に死亡登録された場合も追加を止める', async () => {
    const dead = { ...cattle, lifecycle: { version: 1, death: { date: '2020-01-01' } } };
    const view = show('/activities/new?type=animal&animalKind=cattle&animalId=101');
    await screen.findByDisplayValue(/記録の試験母牛/);
    fixture.cattle.mockResolvedValue([dead]);
    fillAnimal(); submit();
    await screen.findByText(/死亡が登録された牛には/);
    expect(fixture.create).not.toHaveBeenCalled();
    view.unmount();
    show('/activities/new?type=animal&animalKind=cattle&animalId=101');
    await screen.findByText(/対象の牛が見つかりません/);
    expect(screen.queryByDisplayValue(/記録の試験母牛/)).not.toBeInTheDocument();
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it('農場作業は表示時に保存せず、利用者の保存操作で日付と内容だけを登録する', async () => {
    show();
    await screen.findByLabelText(/作業内容/);
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.update).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox', { name: /対象/ })).not.toBeInTheDocument();
    fillFarm(); submit();

    await screen.findByText('記録一覧へ戻った');
    expect(fixture.create).toHaveBeenCalledOnce();
    expect(fixture.create).toHaveBeenCalledWith(expect.objectContaining({
      activityType: 'farm', recordDate: '2026-11-03', title: '牛舎を清掃', note: '入口を確認',
      animalKind: '', animalId: '', animalSyncId: '', animalIdentificationNumber: '', animalEarTag: '', animalName: '', animalBirthday: '',
    }));
  });

  it('個体の記録は対象未選択を拒否し、台帳から選んだ牛の耳標の先頭ゼロと識別情報を保存する', async () => {
    const user = userEvent.setup();
    show('/activities/new?type=animal');
    const picker = await screen.findByRole('combobox', { name: /対象/ });
    fillAnimal(); submit();
    expect(fixture.create).not.toHaveBeenCalled();
    await user.click(picker);
    await user.click(await screen.findByRole('option', { name: /記録の試験母牛/ }));
    submit();

    await screen.findByText('記録一覧へ戻った');
    expect(fixture.create).toHaveBeenCalledWith(expect.objectContaining({
      activityType: 'animal', recordDate: '2026-11-03', title: '歩行を確認',
      animalKind: 'cattle', animalId: '101', animalSyncId: 'cattle-fixture-uuid',
      animalIdentificationNumber: '1234500123', animalEarTag: '0123', animalName: '記録の試験母牛', animalBirthday: '2020-01-01',
    }));
  });

  it('個体カルテからの子牛は実際の台帳を読み直して選択し、保存後に同じカルテへ戻る', async () => {
    show('/activities/new?type=animal&animalKind=calf&animalId=202&targetNumber=WRONG&targetName=WRONG&returnTo=%2Fcalves%2F202');
    await screen.findByDisplayValue(/記録の試験子牛/);
    fillAnimal(); submit();
    await screen.findByText('子牛カルテへ戻った');
    expect(fixture.create).toHaveBeenCalledWith(expect.objectContaining({
      animalKind: 'calf', animalId: '202', animalSyncId: 'calf-fixture-uuid',
      animalEarTag: '0456', animalName: '記録の試験子牛',
    }));
  });

  it('存在しない対象IDやクエリ文字列だけでは個体記録を保存しない', async () => {
    show('/activities/new?type=animal&animalKind=calf&animalId=999&targetNumber=0456&targetName=記録の試験子牛');
    await screen.findByLabelText(/記録内容/);
    await waitFor(() => expect(fixture.calves).toHaveBeenCalled());
    fillAnimal(); submit();
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it('既存の記録を編集して同じIDを更新する', async () => {
    show('/activities/activity-1/edit');
    await screen.findByDisplayValue('牛舎を清掃');
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '作業後の確認を追記' } });
    submit();
    await screen.findByText('記録一覧へ戻った');
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.update).toHaveBeenCalledWith('activity-1', expect.objectContaining({
      recordDate: '2026-11-03', title: '牛舎を清掃', note: '作業後の確認を追記',
    }));
  });

  it('保存中の二重送信を防ぎ、入力を固定する', async () => {
    const saving = deferred<typeof farmRecord>();
    fixture.create.mockReturnValueOnce(saving.promise);
    show(); await screen.findByLabelText(/作業内容/); fillFarm();
    const form = screen.getByLabelText(/作業内容/).closest('form')!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(fixture.create).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('メモ')).toBeDisabled();
    await act(async () => { saving.resolve(farmRecord); });
    await screen.findByText('記録一覧へ戻った');
  });

  it('端末保存後の応答失敗は現在入力を保持し、再試行で同じIDを更新する', async () => {
    fixture.create.mockRejectedValueOnce(new fixture.LocalSaveError(farmRecord, new Error('応答を確認できませんでした。')));
    show(); await screen.findByLabelText(/作業内容/); fillFarm(); submit();
    await screen.findByText(/この端末に保存されています/);
    expect(screen.getByLabelText(/作業内容/)).toHaveValue('牛舎を清掃');
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '再確認後の入力' } });
    submit();
    await screen.findByText('記録一覧へ戻った');
    expect(fixture.create).toHaveBeenCalledOnce();
    expect(fixture.update).toHaveBeenCalledWith('activity-1', expect.objectContaining({ note: '再確認後の入力' }));
  });

  it('入力中に農場が切り替わったら古い入力を新しい農場へ保存しない', async () => {
    show(); await screen.findByLabelText(/作業内容/); fillFarm();
    fixture.context = { ...fixture.context, farmId: 'another-farm' };
    submit();
    await screen.findByText(/画面を開き直して/);
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.update).not.toHaveBeenCalled();
    expect(screen.getByLabelText('メモ')).toHaveValue('入口を確認');
    expect(screen.getByLabelText('メモ')).toBeDisabled();
  });
});
