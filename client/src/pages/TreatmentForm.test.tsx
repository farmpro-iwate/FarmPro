import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TreatmentForm } from './TreatmentForm';
import * as treatmentApi from '../services/treatmentApi';
import * as expensesApi from '../services/expensesApi';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';
import * as scheduleApi from '../services/scheduleApi';

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
    }));

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
});
