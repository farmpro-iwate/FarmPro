import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TreatmentForm } from './TreatmentForm';
import * as treatmentApi from '../services/treatmentApi';
import * as expensesApi from '../services/expensesApi';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';
import * as scheduleApi from '../services/scheduleApi';
import * as authClient from '../services/authClient';

vi.mock('../components/CattlePicker', () => ({
  CattlePicker: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect({ earTag: '9130', name: 'はな' })}>繁殖牛を選択</button>
  ),
}));

vi.mock('../components/CalfPicker', () => ({
  CalfPicker: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect({ calfNumber: 'C-001', name: '子牛A' })}>子牛を選択</button>
  ),
}));

vi.mock('../components/MedicineSearchField', () => ({
  MedicineSearchField: ({ value, onChange }: any) => (
    <input
      aria-label="薬剤"
      value={value}
      onChange={(event) => onChange(event.target.value, {
        name: event.target.value,
        autoCalculateWithdrawal: true,
        meatWithdrawalDays: 7,
        milkWithdrawalHours: 0,
      })}
    />
  ),
}));

vi.mock('../components/StaffSearchField', () => ({
  StaffSearchField: ({ label = '獣医師名', value, onChange }: any) => (
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

vi.mock('../components/DiseaseSearchField', () => ({
  DiseaseSearchField: ({ label = '疾病名（診断名）', value, onChange }: any) => (
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value, 11)} />
  ),
}));

vi.mock('../components/TreatmentProcedureSearchField', () => ({
  TreatmentProcedureSearchField: ({ value, onChange }: any) => (
    <input aria-label="処置内容" value={value} onChange={(event) => onChange(event.target.value, 22)} />
  ),
}));

describe('TreatmentForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([] as any);
    vi.spyOn(expensesApi, 'upsertExpenseBySource').mockResolvedValue(undefined as any);
    vi.spyOn(expensesApi, 'deleteExpenseBySource').mockResolvedValue(undefined as any);
    vi.spyOn(scheduleApi, 'getSchedule').mockResolvedValue({} as any);
    vi.spyOn(scheduleApi, 'updateSchedule').mockResolvedValue({} as any);
  });

  afterEach(() => cleanup());

  it('対象牛または治療日がない場合は保存しない', async () => {
    const createTreatment = vi.spyOn(treatmentApi, 'createTreatment').mockResolvedValue({ id: 1 } as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/treatments/new']}>
        <TreatmentForm mode="create" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(alertSpy).toHaveBeenCalledWith('耳標番号、名号、治療日は必須です');
    expect(createTreatment).not.toHaveBeenCalled();
  });

  it('治療記録では症状を必須にする', async () => {
    const createTreatment = vi.spyOn(treatmentApi, 'createTreatment').mockResolvedValue({ id: 1 } as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/treatments/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA']}>
        <TreatmentForm mode="create" />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/治療日/), '2026-09-29');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(alertSpy).toHaveBeenCalledWith('治療記録では症状を入力してください');
    expect(createTreatment).not.toHaveBeenCalled();
  });

  it.each(['区分を選択', '予防への直接リンク'] as const)('%sからの新規予防は症状・疾病名・経過を表示せず、未入力のまま次回予定を保持して保存する', async entry => {
    const createTreatment = vi.spyOn(treatmentApi, 'createTreatment')
      .mockImplementation(async input => ({ ...input, id: 124 }));
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    const query = new URLSearchParams({ targetNumber: '9130', targetName: 'はな',
      treatmentDate: '2026-11-03', returnTo: '/finished' });
    if (entry === '予防への直接リンク') query.set('recordType', '予防');

    render(<MemoryRouter initialEntries={[`/treatments/new?${query}`]}><Routes>
      <Route path="/treatments/new" element={<TreatmentForm mode="create" />} />
      <Route path="/finished" element={<div>予防記録を保存した</div>} />
    </Routes></MemoryRouter>);

    if (entry === '区分を選択') {
      await user.click(screen.getByRole('combobox', { name: '治療区分' }));
      await user.click(screen.getByRole('option', { name: '予防' }));
    }

    expect(screen.queryByLabelText(/症状/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/疾病名/)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '経過' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('処置内容')).toBeInTheDocument();
    expect(screen.getByLabelText('薬剤')).toBeInTheDocument();
    expect(screen.getByLabelText('医薬品費（円）')).toBeInTheDocument();
    expect(screen.getByLabelText('診療費（円）')).toBeInTheDocument();
    await user.type(screen.getByLabelText('次回予定日（任意）'), '2026-11-10');
    await user.type(screen.getByLabelText('メモ'), '予防の実施記録');
    expect(createTreatment).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('予防記録を保存した')).toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(createTreatment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      recordType: '予防', targetNumber: '9130', targetName: 'はな', treatmentDate: '2026-11-03',
      symptom: '', diagnosis: '', progress: '', nextScheduledDate: '2026-11-10', note: '予防の実施記録',
    }), expect.objectContaining({ onLocalSaved: expect.any(Function) }));
  });

  it('一般治療と予防を切り替えても入力を保持し、予防の保存で明示した経過を消さない', async () => {
    const createTreatment = vi.spyOn(treatmentApi, 'createTreatment')
      .mockImplementation(async input => ({ ...input, id: 125 }));
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
    const user = userEvent.setup();
    const query = new URLSearchParams({ targetNumber: '9130', targetName: 'はな',
      treatmentDate: '2026-11-03', returnTo: '/finished' });
    render(<MemoryRouter initialEntries={[`/treatments/new?${query}`]}><Routes>
      <Route path="/treatments/new" element={<TreatmentForm mode="create" />} />
      <Route path="/finished" element={<div>入力を保持して予防を保存した</div>} />
    </Routes></MemoryRouter>);

    await user.type(screen.getByLabelText(/症状/), '入力済みの症状');
    await user.type(screen.getByLabelText('疾病名（診断名）'), '入力済みの診断');
    await user.click(screen.getByRole('combobox', { name: '経過' }));
    await user.click(screen.getByRole('option', { name: '要再診' }));
    await user.click(screen.getByRole('combobox', { name: '治療区分' }));
    await user.click(screen.getByRole('option', { name: '予防' }));

    expect(screen.queryByLabelText(/症状/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/疾病名/)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '経過' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: '治療区分' }));
    await user.click(screen.getByRole('option', { name: '一般治療' }));

    expect(screen.getByLabelText(/症状/)).toHaveValue('入力済みの症状');
    expect(screen.getByLabelText('疾病名（診断名）')).toHaveValue('入力済みの診断');
    expect(screen.getByRole('combobox', { name: '経過' })).toHaveTextContent('要再診');
    expect(createTreatment).not.toHaveBeenCalled();
    await user.click(screen.getByRole('combobox', { name: '治療区分' }));
    await user.click(screen.getByRole('option', { name: '予防' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('入力を保持して予防を保存した')).toBeInTheDocument();
    expect(createTreatment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      recordType: '予防', symptom: '入力済みの症状', diagnosis: '入力済みの診断', diseaseMasterId: 11, progress: '要再診',
    }), expect.objectContaining({ onLocalSaved: expect.any(Function) }));
  });

  it('既存予防の編集では非表示の症状・診断ID・経過と次回予定を保持する', async () => {
    const createTreatment = vi.spyOn(treatmentApi, 'createTreatment');
    const updateTreatment = vi.spyOn(treatmentApi, 'updateTreatment')
      .mockImplementation(async (id, input) => ({ ...input, id: Number(id) }));
    vi.spyOn(treatmentApi, 'getTreatment').mockResolvedValue({
      id: 126, targetNumber: '9130', targetName: 'はな', recordType: '予防', symptom: '以前の症状',
      diagnosis: '以前の診断', diseaseMasterId: 77, treatmentProcedure: '予防処置', treatmentDate: '2026-11-03',
      medicine: '', dosage: '', medicineCost: '', medicalFee: '', withdrawalEndDate: '', veterinarian: '',
      progress: '経過観察', nextScheduledDate: '2026-11-10', note: '以前のメモ',
    });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/treatments/126/edit?returnTo=/finished']}><Routes>
      <Route path="/treatments/:id/edit" element={<TreatmentForm mode="edit" />} />
      <Route path="/finished" element={<div>既存予防を編集した</div>} />
    </Routes></MemoryRouter>);

    const note = await screen.findByLabelText('メモ');
    expect(screen.queryByLabelText(/症状/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/疾病名/)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '経過' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('次回予定日（任意）')).toHaveValue('2026-11-10');
    await user.clear(note);
    await user.type(note, 'メモだけを修正');
    expect(updateTreatment).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('既存予防を編集した')).toBeInTheDocument();
    expect(createTreatment).not.toHaveBeenCalled();
    expect(updateTreatment).toHaveBeenCalledExactlyOnceWith('126', expect.objectContaining({
      recordType: '予防', symptom: '以前の症状', diagnosis: '以前の診断', diseaseMasterId: 77,
      progress: '経過観察', nextScheduledDate: '2026-11-10', treatmentProcedure: '予防処置', note: 'メモだけを修正',
    }));
  });

  it('薬剤と治療日から休薬終了日を自動計算する', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/treatments/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA']}>
        <TreatmentForm mode="create" />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/治療日/), '2026-09-29');
    await user.type(screen.getByLabelText('薬剤'), 'テスト薬');

    expect(screen.getByLabelText('休薬期間終了日')).toHaveValue('2026-10-06');
    expect(screen.getByText(/肉・出荷 7日/)).toBeInTheDocument();
  });

  it('保存時に医薬品費と診療費を経費へ連携する', async () => {
    const createTreatment = vi.spyOn(treatmentApi, 'createTreatment').mockResolvedValue({
      id: 123,
      targetNumber: '9130',
      targetName: 'はな',
      treatmentDate: '2026-09-29',
    } as any);
    const upsertExpense = vi.spyOn(expensesApi, 'upsertExpenseBySource');
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/treatments/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA&returnTo=%2Fcattle%2F1']}>
        <Routes>
          <Route path="/treatments/new" element={<TreatmentForm mode="create" />} />
          <Route path="/cattle/:id" element={<div>個体カルテへ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/症状/), '食欲低下');
    await user.type(screen.getByLabelText(/治療日/), '2026-09-29');
    await user.type(screen.getByLabelText('薬剤'), 'テスト薬');
    await user.type(screen.getByLabelText('医薬品費（円）'), '1200');
    await user.type(screen.getByLabelText('診療費（円）'), '3000');
    await user.type(screen.getByLabelText('獣医師名'), '担当獣医');

    await user.click(screen.getByRole('combobox', { name: '薬剤の使用元' }));
    await user.click(screen.getByRole('option', { name: '獣医師が処方・持参' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(createTreatment).toHaveBeenCalledWith(expect.objectContaining({
      targetNumber: '9130',
      targetName: 'はな',
      symptom: '食欲低下',
      treatmentDate: '2026-09-29',
      medicine: 'テスト薬',
      medicineCost: '1200',
      medicalFee: '3000',
      withdrawalEndDate: '2026-10-06',
      veterinarian: '担当獣医',
    }), expect.objectContaining({ onLocalSaved: expect.any(Function) }));

    expect(upsertExpense).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'treatment',
      sourceId: '123',
      category: '医薬品費',
      amount: '1200',
    }));
    expect(upsertExpense).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'treatment',
      sourceId: '123',
      category: '診療費',
      amount: '3000',
    }));
    expect(await screen.findByText('個体カルテへ戻った')).toBeInTheDocument();
  });

  it.each(['create', 'edit'] as const)('%s の保存が競合した場合は入力を残してエラーを表示し、経費・予定・画面遷移へ進まない', async mode => {
    const message = 'この治療記録は削除済みです。端末の変更を保持して保存を中止しました。';
    const save = mode === 'create'
      ? vi.spyOn(treatmentApi, 'createTreatment').mockRejectedValue(new Error(message))
      : vi.spyOn(treatmentApi, 'updateTreatment').mockRejectedValue(new Error(message));
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
    vi.spyOn(treatmentApi, 'getTreatment').mockResolvedValue({
      id: 123, targetNumber: '9130', targetName: 'はな', recordType: '治療', symptom: '食欲低下',
      diagnosis: '', treatmentProcedure: '', treatmentDate: '2026-11-02', medicine: '', dosage: '',
      medicineCost: '', medicalFee: '', withdrawalEndDate: '', veterinarian: '', progress: '治療中', note: '',
    });
    const user = userEvent.setup();
    const query = new URLSearchParams({ targetNumber: '9130', targetName: 'はな',
      treatmentDate: '2026-11-02', symptom: '食欲低下', sourceScheduleId: 'fixture-schedule', returnTo: '/finished' });
    render(<MemoryRouter initialEntries={[mode === 'create' ? `/treatments/new?${query}` : '/treatments/123/edit?returnTo=/finished']}>
      <Routes>
        <Route path="/treatments/new" element={<TreatmentForm mode="create" />} />
        <Route path="/treatments/:id/edit" element={<TreatmentForm mode="edit" />} />
        <Route path="/finished" element={<div>保存後の画面へ移動した</div>} />
      </Routes>
    </MemoryRouter>);
    const medicineCost = await screen.findByLabelText('医薬品費（円）');
    await user.type(medicineCost, mode === 'create' ? '1200' : '0');
    await user.type(screen.getByLabelText('診療費（円）'), mode === 'create' ? '3000' : '0');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(save).toHaveBeenCalledOnce();
    expect(expensesApi.upsertExpenseBySource).not.toHaveBeenCalled();
    expect(expensesApi.deleteExpenseBySource).not.toHaveBeenCalled();
    expect(scheduleApi.updateSchedule).not.toHaveBeenCalled();
    expect(screen.queryByText('保存後の画面へ移動した')).not.toBeInTheDocument();
    expect(screen.getByLabelText('医薬品費（円）')).toHaveValue(mode === 'create' ? 1200 : 0);
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });

  it('保存の再試行を始めると前回のエラーを消し、不明な失敗には日本語で案内する', async () => {
    const create = vi.spyOn(treatmentApi, 'createTreatment')
      .mockRejectedValueOnce(new Error('前回の保存を確認できませんでした。'))
      .mockRejectedValueOnce('fixture: unknown failure');
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
    const user = userEvent.setup();
    const query = new URLSearchParams({ targetNumber: '9130', targetName: 'はな',
      treatmentDate: '2026-11-02', symptom: '食欲低下' });
    render(<MemoryRouter initialEntries={[`/treatments/new?${query}`]}><TreatmentForm mode="create" /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('前回の保存を確認できませんでした。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('治療記録の保存を確認できませんでした。入力内容と通信状態を確認してください。')).toBeInTheDocument();
    expect(screen.queryByText('前回の保存を確認できませんでした。')).not.toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(2);
    expect(expensesApi.upsertExpenseBySource).not.toHaveBeenCalled();
    expect(expensesApi.deleteExpenseBySource).not.toHaveBeenCalled();
  });

  it.each(['cloud', 'expense'] as const)('新規登録の%s失敗後は保存済みIDを再利用し、再登録せず経費を完了する', async phase => {
    const message = phase === 'cloud' ? 'クラウド応答を確認できませんでした。' : '経費の保存を確認できませんでした。';
    const create = vi.spyOn(treatmentApi, 'createTreatment').mockImplementation(async (input, options) => {
      if (phase === 'cloud') {
        options?.onLocalSaved?.(901);
        throw new Error(message);
      }
      return { ...input, id: 901 };
    });
    const update = vi.spyOn(treatmentApi, 'updateTreatment').mockImplementation(async (id, input) => ({ ...input, id: Number(id) }));
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
    if (phase === 'expense') vi.mocked(expensesApi.upsertExpenseBySource).mockRejectedValueOnce(new Error(message));
    const user = userEvent.setup();
    const query = new URLSearchParams({ targetNumber: '9130', targetName: 'はな',
      treatmentDate: '2026-11-02', symptom: '食欲低下', returnTo: '/finished' });
    render(<MemoryRouter initialEntries={[`/treatments/new?${query}`]}><Routes>
      <Route path="/treatments/new" element={<TreatmentForm mode="create" />} />
      <Route path="/finished" element={<div>同じ治療の保存を完了した</div>} />
    </Routes></MemoryRouter>);
    await user.type(screen.getByLabelText('診療費（円）'), '3000');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    if (phase === 'cloud') expect(expensesApi.upsertExpenseBySource).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('同じ治療の保存を完了した')).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledExactlyOnceWith(901, expect.objectContaining({ medicalFee: '3000' }));
    expect(vi.mocked(expensesApi.upsertExpenseBySource).mock.calls.every(([expense]) => expense.sourceId === '901')).toBe(true);
  });

  it.each(['farm', 'user', 'token'] as const)('新規登録後に%sが変わったら前の保存済みIDを使わず処理を止める', async changed => {
    const auth = { token: 'first-token', user: { id: 'form-user', farmId: 'form-farm' } };
    vi.spyOn(authClient, 'getAuthToken').mockImplementation(() => auth.token);
    vi.spyOn(authClient, 'getStoredAuthUser').mockImplementation(() => auth.user as any);
    const create = vi.spyOn(treatmentApi, 'createTreatment').mockImplementation(async (_input, options) => {
      options?.onLocalSaved?.(901);
      throw new Error('最初の保存応答を確認できませんでした。');
    });
    const update = vi.spyOn(treatmentApi, 'updateTreatment');
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
    const user = userEvent.setup();
    const query = new URLSearchParams({ targetNumber: '9130', targetName: 'はな',
      treatmentDate: '2026-11-02', symptom: '食欲低下' });
    render(<MemoryRouter initialEntries={[`/treatments/new?${query}`]}><TreatmentForm mode="create" /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('最初の保存応答を確認できませんでした。')).toBeInTheDocument();
    if (changed === 'farm') auth.user.farmId = 'different-farm';
    else if (changed === 'user') auth.user.id = 'different-user';
    else auth.token = 'different-token';

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText(/ログイン・農場または画面の情報が変わった/)).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(expensesApi.upsertExpenseBySource).not.toHaveBeenCalled();
    expect(expensesApi.deleteExpenseBySource).not.toHaveBeenCalled();
  });

  it('同時に保存を押しても新規登録を1回だけ実行する', async () => {
    let complete!: (value: any) => void;
    const pending = new Promise<any>(resolve => { complete = resolve; });
    const create = vi.spyOn(treatmentApi, 'createTreatment').mockReturnValue(pending);
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
    const query = new URLSearchParams({ targetNumber: '9130', targetName: 'はな',
      treatmentDate: '2026-11-02', symptom: '食欲低下' });
    render(<MemoryRouter initialEntries={[`/treatments/new?${query}`]}><TreatmentForm mode="create" /></MemoryRouter>);
    const save = screen.getByRole('button', { name: '保存' });

    act(() => { fireEvent.click(save); fireEvent.click(save); });

    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => { complete({ id: 901 }); await pending; });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('commit通知時に認証が変わっても閉じた試行のIDを保持し、元の文脈へ戻った再試行で再登録しない', async () => {
    let token = 'original-form-token';
    vi.spyOn(authClient, 'getAuthToken').mockImplementation(() => token);
    const create = vi.spyOn(treatmentApi, 'createTreatment').mockImplementation(async (input, options) => {
      token = 'context-changed-after-commit';
      options?.onLocalSaved?.(901);
      return { ...input, id: 901 };
    });
    const update = vi.spyOn(treatmentApi, 'updateTreatment').mockImplementation(async (id, input) => ({ ...input, id: Number(id) }));
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
    const user = userEvent.setup();
    const query = new URLSearchParams({ targetNumber: '9130', targetName: 'はな',
      treatmentDate: '2026-11-02', symptom: '食欲低下', returnTo: '/finished' });
    render(<MemoryRouter initialEntries={[`/treatments/new?${query}`]}><Routes>
      <Route path="/treatments/new" element={<TreatmentForm mode="create" />} />
      <Route path="/finished" element={<div>元の文脈で同じ治療を完了した</div>} />
    </Routes></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText(/ログイン・農場または画面の情報が変わった/)).toBeInTheDocument();
    expect(expensesApi.deleteExpenseBySource).not.toHaveBeenCalled();
    token = 'original-form-token';

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('元の文脈で同じ治療を完了した')).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledExactlyOnceWith(901, expect.objectContaining({ targetNumber: '9130' }));
  });

  it('保存待ち中に画面を離れたら遅い成功応答で経費・予定・旧画面遷移へ進まない', async () => {
    let complete!: (value: any) => void;
    const pending = new Promise<any>(resolve => { complete = resolve; });
    vi.spyOn(treatmentApi, 'createTreatment').mockImplementation((_input, options) => {
      options?.onLocalSaved?.(901);
      return pending;
    });
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
    const user = userEvent.setup();
    const query = new URLSearchParams({ targetNumber: '9130', targetName: 'はな',
      treatmentDate: '2026-11-02', symptom: '食欲低下', sourceScheduleId: 'fixture-schedule', returnTo: '/finished' });
    render(<MemoryRouter initialEntries={[`/treatments/new?${query}`]}>
      <Link to="/elsewhere">別の画面へ</Link>
      <Routes>
        <Route path="/treatments/new" element={<TreatmentForm mode="create" />} />
        <Route path="/elsewhere" element={<div>移動先の画面</div>} />
        <Route path="/finished" element={<div>古い保存後の画面</div>} />
      </Routes>
    </MemoryRouter>);
    await user.click(screen.getByRole('button', { name: '保存' }));
    await user.click(screen.getByRole('link', { name: '別の画面へ' }));
    expect(await screen.findByText('移動先の画面')).toBeInTheDocument();

    await act(async () => { complete({ id: 901 }); await pending; });

    expect(screen.getByText('移動先の画面')).toBeInTheDocument();
    expect(expensesApi.upsertExpenseBySource).not.toHaveBeenCalled();
    expect(expensesApi.deleteExpenseBySource).not.toHaveBeenCalled();
    expect(scheduleApi.updateSchedule).not.toHaveBeenCalled();
    expect(screen.queryByText('古い保存後の画面')).not.toBeInTheDocument();
  });
});
