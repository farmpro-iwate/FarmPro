import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

describe('CattleForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    environment.planId = 'free';
  });

  afterEach(() => cleanup());

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
    expect(await screen.findByText('端末内に登録しました')).toBeInTheDocument();
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
      <MemoryRouter initialEntries={['/cattle/1/edit']}>
        <Routes>
          <Route path="/cattle/:id/edit" element={<CattleForm mode="edit" />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '牛を編集' });
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
    expect(await screen.findByText('端末内のデータを更新しました')).toBeInTheDocument();
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
});
