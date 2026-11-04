import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CattleForm } from './CattleForm';
import * as cattleApi from '../services/api';

const environment = vi.hoisted(() => ({ planId: 'free' }));

vi.mock('../components/BirthdayField', () => ({
  BirthdayField: ({ value, onChange, required }: any) => (
    <input aria-label="生年月日" type="date" value={value} onChange={(event) => onChange(event.target.value)} required={required} />
  ),
}));

vi.mock('../plans/current-plan', () => ({
  getCurrentFarmProPlanId: () => environment.planId,
}));

vi.mock('../plans/policy', () => ({
  getFarmProPlan: () => ({ multiDeviceSync: environment.planId !== 'free' }),
}));

function FormEntryLinks() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/cattle/new')}>通常の新規登録へ</button>;
}

function renderCattleRoutes(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FormEntryLinks />
      <Routes>
        <Route path="/cattle/new" element={<CattleForm mode="create" />} />
        <Route path="/cattle/:id/edit" element={<CattleForm mode="edit" />} />
        <Route path="/cattle/growing" element={<h1>育成牛台帳</h1>} />
        <Route path="/cattle" element={<h1>繁殖牛台帳</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillBasicFields(user: ReturnType<typeof userEvent.setup>, earTag: string, name: string) {
  await user.type(screen.getByLabelText(/耳標番号/), earTag);
  await user.type(screen.getByLabelText(/名号/), name);
  await user.type(screen.getByLabelText('生年月日'), '2026-01-04');
}

describe('CattleForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    environment.planId = 'free';
  });

  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('耳標番号・名号・生年月日が不足している場合は保存しない', async () => {
    const createCattle = vi.spyOn(cattleApi, 'createCattle').mockResolvedValue({ id: 1 } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <CattleForm mode="create" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByText('耳標番号、名号、生年月日は必須です')).toBeInTheDocument();
    expect(createCattle).not.toHaveBeenCalled();
  });

  it('個体識別番号が10桁でない場合は保存しない', async () => {
    const createCattle = vi.spyOn(cattleApi, 'createCattle').mockResolvedValue({ id: 1 } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <CattleForm mode="create" />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/耳標番号/), '9130');
    await user.type(screen.getByLabelText(/個体識別番号/), '12345');
    await user.type(screen.getByLabelText(/名号/), 'はな');
    await user.type(screen.getByLabelText('生年月日'), '2024-01-01');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByText('個体識別番号は10桁の数字で入力してください。')).toBeInTheDocument();
    expect(createCattle).not.toHaveBeenCalled();
  });

  it('基本情報を新規登録して端末内保存メッセージを表示する', async () => {
    const createCattle = vi.spyOn(cattleApi, 'createCattle').mockResolvedValue({
      id: 1,
      earTag: '9130',
      identificationNumber: '1234567890',
      name: 'はな',
      birthday: '2024-01-01',
      sex: '雌',
    } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <CattleForm mode="create" />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/耳標番号/), '9130');
    await user.type(screen.getByLabelText(/個体識別番号/), '1234567890');
    await user.type(screen.getByLabelText(/名号/), 'はな');
    await user.type(screen.getByLabelText('生年月日'), '2024-01-01');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(createCattle).toHaveBeenCalledWith(expect.objectContaining({
      earTag: '9130',
      identificationNumber: '1234567890',
      name: 'はな',
      birthday: '2024-01-01',
      sex: '雌',
    }));
    expect(createCattle.mock.calls[0][0].stage).toBeUndefined();
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '/cattle');
    expect(await screen.findByText('端末内に登録しました')).toBeInTheDocument();
  });

  it('育成牛台帳の入口からは育成牛として登録し、同じ台帳へ戻る', async () => {
    const createCattle = vi.spyOn(cattleApi, 'createCattle').mockResolvedValue({ id: 1, stage: '育成牛' } as any);
    const user = userEvent.setup();
    renderCattleRoutes('/cattle/new?stage=growing');

    expect(screen.getByRole('heading', { name: '育成牛を新規登録' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '/cattle/growing');
    await fillBasicFields(user, '5754', 'ひめこ');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(createCattle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      earTag: '5754', name: 'ひめこ', birthday: '2026-01-04', stage: '育成牛',
    }));
    expect(await screen.findByRole('heading', { name: '育成牛台帳' })).toBeInTheDocument();
  });

  it('既存牛を読み込んで名号を編集できる', async () => {
    vi.spyOn(cattleApi, 'getCattle').mockResolvedValue({
      id: 1,
      earTag: '9130',
      identificationNumber: '1234567890',
      name: 'はな',
      birthday: '2024-01-01',
      sex: '雌',
      sire: '父A',
      dam: '母A',
      parity: 2,
      blvStatus: '未検査',
      acquisitionDate: '',
      note: '',
    } as any);
    const updateCattle = vi.spyOn(cattleApi, 'updateCattle').mockResolvedValue({ id: 1 } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/cattle/1/edit?stage=growing']}>
        <Routes>
          <Route path="/cattle/:id/edit" element={<CattleForm mode="edit" />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '牛を編集' });
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '/cattle');
    const name = screen.getByLabelText(/名号/);
    await user.clear(name);
    await user.type(name, 'はな改');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(updateCattle).toHaveBeenCalledWith('1', expect.objectContaining({
      earTag: '9130',
      identificationNumber: '1234567890',
      name: 'はな改',
      birthday: '2024-01-01',
      parity: 2,
    }));
    expect(updateCattle.mock.calls[0][1]).not.toHaveProperty('stage');
    expect(await screen.findByText('端末内のデータを更新しました')).toBeInTheDocument();
  });

  it('育成牛の基本情報編集は区分や元の子牛情報・死亡廃用記録を上書きせず最新の区分の台帳へ戻る', async () => {
    vi.spyOn(cattleApi, 'getCattle').mockResolvedValue({
      id: 1, earTag: '5754', identificationNumber: '', name: 'ひめこ', birthday: '2026-01-04', sex: '雌',
      sire: '父A', dam: '母A', parity: 0, blvStatus: '未検査', stage: '育成牛', sourceCalfId: 51,
      acquisitionMethod: 'retained', acquisitionDate: '2026-10-01', acquisitionCost: 300000,
      lifecycle: { version: 1 }, note: '元のメモ',
    } as any);
    const updateCattle = vi.spyOn(cattleApi, 'updateCattle').mockResolvedValue({ id: 1, stage: '繁殖牛' } as any);
    const user = userEvent.setup();
    renderCattleRoutes('/cattle/1/edit');

    await screen.findByRole('heading', { name: '育成牛を編集' });
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '/cattle/growing');
    await user.clear(screen.getByLabelText(/名号/));
    await user.type(screen.getByLabelText(/名号/), 'ひめこ改');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(updateCattle).toHaveBeenCalledExactlyOnceWith('1', expect.objectContaining({
      name: 'ひめこ改', earTag: '5754', acquisitionMethod: 'retained', acquisitionDate: '2026-10-01', note: '元のメモ',
    }));
    for (const field of ['stage', 'sourceCalfId', 'acquisitionCost', 'lifecycle']) {
      expect(updateCattle.mock.calls[0][1]).not.toHaveProperty(field);
    }
    expect(await screen.findByRole('heading', { name: '繁殖牛台帳' })).toBeInTheDocument();
  });

  it('有料の未送信保存を同期済みと表示せず、再保存は同じ端末IDを更新し旧送信先を使わない', async () => {
    environment.planId = 'standard';
    const saved = {
      id: 7, earTag: '9130', identificationNumber: '1234567890', name: 'はな',
      birthday: '2024-01-01', sex: '雌' as const, sire: '', dam: '', parity: 0,
      blvStatus: '未検査', note: '', cloudSyncPending: true,
      syncWarning: 'クラウド同期は完了していません。端末の記録を保持しています。',
    };
    const create = vi.spyOn(cattleApi, 'createCattle').mockResolvedValue(saved);
    const update = vi.spyOn(cattleApi, 'updateCattle').mockResolvedValue({ ...saved, cloudSyncPending: false, syncWarning: undefined });
    const legacy = vi.spyOn(cattleApi, 'syncCattleRecordToCloud').mockResolvedValue(saved);
    const user = userEvent.setup();
    render(<MemoryRouter><CattleForm mode="create" /></MemoryRouter>);
    await user.type(screen.getByLabelText(/耳標番号/), '9130');
    await user.type(screen.getByLabelText(/個体識別番号/), '1234567890');
    await user.type(screen.getByLabelText(/名号/), 'はな');
    await user.type(screen.getByLabelText('生年月日'), '2024-01-01');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('この端末には登録しました')).toBeInTheDocument();
    expect(screen.getByText(saved.syncWarning)).toBeInTheDocument();
    expect(screen.queryByText('登録してクラウドへ同期しました')).not.toBeInTheDocument();
    expect(legacy).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('登録してクラウドへ同期しました')).toBeInTheDocument();
    expect(create).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledExactlyOnceWith('7', expect.objectContaining({ name: 'はな' }));
    expect(legacy).not.toHaveBeenCalled();
  });

  it('保存待機中に契約状態が変わったら旧応答で同期成功と表示しない', async () => {
    environment.planId = 'standard';
    let resolve!: (record: Awaited<ReturnType<typeof cattleApi.createCattle>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof cattleApi.createCattle>>>(done => { resolve = done; });
    vi.spyOn(cattleApi, 'createCattle').mockReturnValue(pending);
    const legacy = vi.spyOn(cattleApi, 'syncCattleRecordToCloud');
    const user = userEvent.setup();
    render(<MemoryRouter><CattleForm mode="create" /></MemoryRouter>);
    await user.type(screen.getByLabelText(/耳標番号/), '9130');
    await user.type(screen.getByLabelText(/名号/), 'はな');
    await user.type(screen.getByLabelText('生年月日'), '2024-01-01');
    await user.click(screen.getByRole('button', { name: '保存' }));
    environment.planId = 'free';
    await act(async () => {
      resolve({ id: 7, earTag: '9130', identificationNumber: '', name: 'はな', birthday: '2024-01-01',
        sex: '雌', sire: '', dam: '', parity: 0, blvStatus: '未検査', note: '', cloudSyncPending: false });
      await pending;
    });
    expect(await screen.findByText(/ログインまたは農場の情報が変わった/)).toBeInTheDocument();
    expect(screen.queryByText('登録してクラウドへ同期しました')).not.toBeInTheDocument();
    expect(legacy).not.toHaveBeenCalled();
  });

  it('育成牛の同期待ちから通常の新規登録へ切り替えると古い入力・区分・再試行IDを使わない', async () => {
    environment.planId = 'standard';
    const createCattle = vi.spyOn(cattleApi, 'createCattle')
      .mockResolvedValueOnce({ id: 7, stage: '育成牛', cloudSyncPending: true } as any)
      .mockResolvedValueOnce({ id: 8, cloudSyncPending: true } as any);
    const updateCattle = vi.spyOn(cattleApi, 'updateCattle');
    const user = userEvent.setup();
    renderCattleRoutes('/cattle/new?stage=growing');
    await fillBasicFields(user, '5754', 'ひめこ');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByText('この端末には登録しました');

    await user.click(screen.getByRole('button', { name: '通常の新規登録へ' }));
    expect(screen.getByRole('heading', { name: '牛を新規登録' })).toBeInTheDocument();
    expect(screen.getByLabelText(/耳標番号/)).toHaveValue('');
    expect(screen.getByLabelText(/名号/)).toHaveValue('');
    expect(screen.getByLabelText('生年月日')).toHaveValue('');
    expect(screen.queryByText('この端末には登録しました')).not.toBeInTheDocument();
    await fillBasicFields(user, '7480', 'れいこ');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(createCattle).toHaveBeenCalledTimes(2);
    expect(createCattle.mock.calls[1][0]).toEqual(expect.objectContaining({ earTag: '7480', name: 'れいこ' }));
    expect(createCattle.mock.calls[1][0].stage).toBeUndefined();
    expect(updateCattle).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '/cattle');
  });

  it('育成牛の保存応答が別の新規登録を開いた後に届いても現在の入力や移動先を変えない', async () => {
    let resolve!: (record: Awaited<ReturnType<typeof cattleApi.createCattle>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof cattleApi.createCattle>>>(done => { resolve = done; });
    vi.spyOn(cattleApi, 'createCattle').mockReturnValue(pending);
    const user = userEvent.setup();
    renderCattleRoutes('/cattle/new?stage=growing');
    await fillBasicFields(user, '5754', 'ひめこ');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await user.click(screen.getByRole('button', { name: '通常の新規登録へ' }));
    await user.type(screen.getByLabelText(/名号/), '入力中の牛');

    vi.useFakeTimers();
    await act(async () => {
      resolve({ id: 7, stage: '育成牛' } as any);
      await pending;
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(screen.getByRole('heading', { name: '牛を新規登録' })).toBeInTheDocument();
    expect(screen.getByLabelText(/名号/)).toHaveValue('入力中の牛');
    expect(screen.queryByText('端末内に登録しました')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '/cattle');
  });
});
