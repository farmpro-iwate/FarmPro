import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimalLifecycleForm } from './AnimalLifecycleForm';

const fixture = vi.hoisted(() => ({
  context: { farmId: 'lifecycle-test-farm', userId: 'lifecycle-test-user', token: 'test-token', planId: 'standard', cloudEnabled: true },
  cattle: vi.fn(), calves: vi.fn(), sales: vi.fn(), updateCattle: vi.fn(), updateCalf: vi.fn(),
}));
vi.mock('../services/api', async importOriginal => ({
  ...await importOriginal<typeof import('../services/api')>(),
  getCattleList: fixture.cattle, updateCattleLifecycle: fixture.updateCattle,
}));
vi.mock('../services/calfApi', async importOriginal => ({
  ...await importOriginal<typeof import('../services/calfApi')>(),
  getCalfList: fixture.calves, updateCalfLifecycle: fixture.updateCalf,
}));
vi.mock('../services/salesApi', async importOriginal => ({
  ...await importOriginal<typeof import('../services/salesApi')>(), getSalesList: fixture.sales,
}));
vi.mock('../services/animalRecordSyncSafety', async importOriginal => ({
  ...await importOriginal<typeof import('../services/animalRecordSyncSafety')>(),
  getAnimalSyncContext: () => ({ ...fixture.context }),
  assertAnimalSyncContext: (expected: typeof fixture.context) => {
    if (JSON.stringify(expected) !== JSON.stringify(fixture.context)) throw new Error('農場が変わりました。');
  },
}));

const cow = { id: 91, syncId: 'lifecycle-cow-uuid', name: '試験母牛', earTag: '0123', identificationNumber: '1234500123',
  birthday: '2020-01-01', sex: '雌', stage: '繁殖牛' };
const calf = { id: 92, syncRecordId: 'lifecycle-calf-uuid', name: '試験子牛', calfNumber: '0456', identificationNumber: '1234500456',
  birthday: '2026-01-01', sex: '雌', motherName: '試験母牛', managementStatus: '育成中' };
const culling = { date: '2026-09-01', reason: '繁殖終了', note: '在籍継続', route: 'fattening', recordedAt: '2026-09-01T00:00:00Z' };
function show(query = '?animalKind=cattle&animalId=91') {
  return render(<MemoryRouter initialEntries={[`/animal-lifecycle/new${query}`]}><AnimalLifecycleForm /></MemoryRouter>);
}
function fill(type = '死亡') {
  fireEvent.change(screen.getByLabelText(new RegExp(type === '死亡' ? '死亡日' : '廃用決定日')), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText(new RegExp(`${type}理由`)), { target: { value: '試験用の理由' } });
}
function submit() { fireEvent.submit(screen.getByLabelText('メモ').closest('form')!); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function saveResult(animal: typeof cow | typeof calf, change: any) {
  return { ...animal, lifecycle: { version: 1, [change.type]: { ...change, recordedAt: '2026-11-03T00:00:00Z' } }, cloudSyncPending: false };
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.context = { farmId: 'lifecycle-test-farm', userId: 'lifecycle-test-user', token: 'test-token', planId: 'standard', cloudEnabled: true };
  fixture.cattle.mockReset().mockResolvedValue([cow]);
  fixture.calves.mockReset().mockResolvedValue([calf]);
  fixture.sales.mockReset().mockResolvedValue([]);
  fixture.updateCattle.mockReset().mockImplementation(async (_id, change) => saveResult(cow, change));
  fixture.updateCalf.mockReset().mockImplementation(async (_id, change) => saveResult(calf, change));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('死亡・廃用の登録', () => {
  it('Freeの端末保存では同期保留metadataがあってもクラウド反映待ちを表示しない', async () => {
    fixture.context.planId = 'free'; fixture.context.cloudEnabled = false;
    fixture.updateCattle.mockImplementation(async (_id, change) => ({ ...saveResult(cow, change), cloudSyncPending: true }));
    show(); await screen.findByDisplayValue(/試験母牛/); fill(); submit();
    await screen.findByText(/死亡の記録を保存しました/);
    expect(screen.queryByRole('button', { name: '同期を再試行' })).not.toBeInTheDocument();
    expect(screen.queryByText(/クラウドへの反映を確認できていません/)).not.toBeInTheDocument();
  });

  it('表示だけでは保存せず、選択した牛の識別情報と既存状態を添えて死亡を保存する', async () => {
    show();
    await screen.findByDisplayValue(/試験母牛.*0123/);
    expect(fixture.updateCattle).not.toHaveBeenCalled();
    fill(); submit();
    await screen.findByText(/死亡の記録を保存しました/);
    expect(fixture.updateCattle).toHaveBeenCalledExactlyOnceWith('91', expect.objectContaining({ type: 'death', date: '2026-10-01', reason: '試験用の理由' }), undefined, cow);
    expect(fixture.updateCalf).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '個体カルテを確認' })).toHaveAttribute('href', '/cattle/91');
    expect(screen.queryByRole('link', { name: /続けて出荷/ })).not.toBeInTheDocument();
  });

  it('廃用後の肥育継続を記録し、在籍を残す説明と既存肥育・販売フォームへの導線を表示する', async () => {
    show('?animalKind=cattle&animalId=91&type=culling');
    await screen.findByLabelText(/廃用理由/);
    expect(screen.getByText(/農場にいる間は在籍頭数に残します/)).toBeInTheDocument();
    fill('廃用'); submit();
    await screen.findByText(/廃用の記録を保存しました/);
    expect(fixture.updateCattle).toHaveBeenCalledWith('91', expect.objectContaining({ type: 'culling', route: 'fattening' }), undefined, cow);
    const fatteningLink = screen.getByRole('link', { name: '続けて肥育移行を登録' }).getAttribute('href')!;
    expect(new URL(fatteningLink, 'https://example.test').searchParams.get('targetNumber')).toBe('0123');
    const salesLink = screen.getByRole('link', { name: '続けて出荷・販売を登録' }).getAttribute('href')!;
    expect(new URL(salesLink, 'https://example.test').searchParams.get('cattleId')).toBe('91');
    expect(new URL(salesLink, 'https://example.test').searchParams.get('targetType')).toBe('成牛');
  });

  it('出荷待ちを選ぶと在籍のまま販売登録への導線だけを出す', async () => {
    const user = userEvent.setup();
    show('?animalKind=cattle&animalId=91&type=culling');
    await screen.findByLabelText(/廃用理由/);
    await user.click(screen.getByRole('combobox', { name: '廃用後の飼養' }));
    await user.click(screen.getByRole('option', { name: '出荷・販売を待つ' }));
    fill('廃用'); submit();
    await screen.findByText(/廃用の記録を保存しました/);
    expect(fixture.updateCattle).toHaveBeenCalledWith('91', expect.objectContaining({ route: 'sale' }), undefined, cow);
    expect(screen.queryByRole('link', { name: '続けて肥育移行を登録' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '続けて出荷・販売を登録' })).toBeInTheDocument();
  });

  it('仮番号の子牛も正しい台帳IDで保存し、仮番号を読みやすく表示する', async () => {
    const temporaryCalf = { ...calf, calfNumber: 'TEMP-MANUAL-92' };
    fixture.calves.mockResolvedValue([temporaryCalf]);
    fixture.updateCalf.mockImplementation(async (_id, change) => saveResult(temporaryCalf, change));
    show('?animalKind=calf&animalId=92&targetNumber=WRONG');
    await screen.findByDisplayValue(/試験子牛.*仮番号/);
    fill(); submit();
    await screen.findByText(/死亡の記録を保存しました/);
    expect(fixture.updateCalf).toHaveBeenCalledWith('92', expect.objectContaining({ type: 'death' }), undefined, temporaryCalf);
    expect(screen.getByRole('link', { name: '個体カルテを確認' })).toHaveAttribute('href', '/calves/92');
    expect(screen.queryByText(/TEMP-MANUAL/)).not.toBeInTheDocument();
  });

  it('保存対象未選択・未知IDをクエリだけから作らない', async () => {
    show('?animalKind=cattle&animalId=999&targetNumber=0123&targetName=試験母牛');
    await screen.findByLabelText(/死亡理由/); fill(); submit();
    await screen.findByText('対象牛を台帳から選択してください。');
    expect(fixture.updateCattle).not.toHaveBeenCalled();
    expect(fixture.updateCalf).not.toHaveBeenCalled();
  });

  it('販売済みと台帳へ移行済みの子牛を新規処理の対象にしない', async () => {
    const user = userEvent.setup();
    fixture.calves.mockResolvedValue([{ ...calf, managementStatus: '牛台帳へ移行済み', promotedCattleId: 91 }]);
    fixture.sales.mockResolvedValue([{ id: 'sold-1', targetType: '成牛', status: '販売済み', targetNumber: '0123' }]);
    show('');
    const picker = await screen.findByRole('combobox', { name: '対象牛' });
    await user.click(picker);
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    fill(); submit();
    expect(fixture.updateCattle).not.toHaveBeenCalled();
  });

  it('画面表示後に販売済みとなった牛を保存直前に再確認して止める', async () => {
    show(); await screen.findByDisplayValue(/試験母牛/);
    fixture.sales.mockResolvedValue([{ targetType: '成牛', status: '販売済み', targetNumber: '0123' }]);
    fill(); submit();
    await screen.findByText(/販売済み・牛台帳へ移行済みの牛は処理できません/);
    expect(fixture.updateCattle).not.toHaveBeenCalled();
  });

  it('既存の廃用日・理由を読み、同じ状態の修正として送信する', async () => {
    const current = { ...cow, lifecycle: { version: 1, culling } };
    fixture.cattle.mockResolvedValue([current]);
    show();
    await screen.findByDisplayValue('繁殖終了');
    expect(screen.getByLabelText(/廃用決定日/)).toHaveValue('2026-09-01');
    fill('廃用'); submit();
    await screen.findByText(/廃用の記録を保存しました/);
    expect(fixture.updateCattle).toHaveBeenCalledWith('91', expect.objectContaining({ type: 'culling' }), current.lifecycle, current);
  });

  it('農場変更後は保存を止めて入力を固定する', async () => {
    show(); await screen.findByDisplayValue(/試験母牛/); fill();
    fixture.context.farmId = 'other-farm'; submit();
    await screen.findByText(/ログインまたは農場の情報が変わりました/);
    expect(fixture.updateCattle).not.toHaveBeenCalled();
    expect(screen.getByLabelText('メモ')).toBeDisabled();
  });

  it('保存中の重複送信を防ぎ、遅い応答で農場変更後の画面を成功にしない', async () => {
    const pending = deferred<any>();
    fixture.updateCattle.mockReturnValue(pending.promise);
    show(); await screen.findByDisplayValue(/試験母牛/); fill();
    act(() => { submit(); submit(); });
    await waitFor(() => expect(fixture.updateCattle).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('メモ')).toBeDisabled();
    fixture.context.farmId = 'other-farm';
    await act(async () => { pending.resolve(saveResult(cow, { type: 'death', date: '2026-10-01' })); });
    await screen.findByText(/ログインまたは農場の情報が変わりました/);
    expect(screen.queryByText(/死亡の記録を保存しました/)).not.toBeInTheDocument();
  });

  it('端末保存後のクラウド未確認は明示し、保存済みの同じ個体・状態で再試行する', async () => {
    const firstSaved = { ...saveResult(cow, { type: 'death', date: '2026-10-01', reason: '試験用の理由', note: '' }), cloudSyncPending: true, syncWarning: 'クラウドへの反映待ちです。' };
    fixture.updateCattle.mockResolvedValueOnce(firstSaved);
    show(); await screen.findByDisplayValue(/試験母牛/); fill(); submit();
    await screen.findByText('クラウドへの反映待ちです。');
    fireEvent.click(screen.getByRole('button', { name: '同期を再試行' }));
    await waitFor(() => expect(fixture.updateCattle).toHaveBeenCalledTimes(2));
    expect(fixture.updateCattle).toHaveBeenLastCalledWith('91', expect.objectContaining({ type: 'death' }), firstSaved.lifecycle, firstSaved);
    await waitFor(() => expect(screen.queryByText('クラウドへの反映待ちです。')).not.toBeInTheDocument());
  });
});
