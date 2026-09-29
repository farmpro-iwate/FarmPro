import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VaccineForm } from './VaccineForm';
import * as vaccineApi from '../services/vaccineApi';
import * as expensesApi from '../services/expensesApi';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';

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
    <input aria-label="ワクチン名" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

describe('VaccineForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([] as any);
    vi.spyOn(expensesApi, 'upsertExpenseBySource').mockResolvedValue(undefined as any);
    vi.spyOn(expensesApi, 'deleteExpenseBySource').mockResolvedValue(undefined as any);
  });

  afterEach(() => cleanup());

  it('必須項目が不足している場合は保存しない', async () => {
    const createVaccine = vi.spyOn(vaccineApi, 'createVaccine').mockResolvedValue({ id: 1 } as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/vaccines/new']}>
        <VaccineForm mode="create" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(alertSpy).toHaveBeenCalledWith('必須項目を入力してください');
    expect(createVaccine).not.toHaveBeenCalled();
  });

  it('接種済みで費用がある場合は接種日を必須にする', async () => {
    const createVaccine = vi.spyOn(vaccineApi, 'createVaccine').mockResolvedValue({ id: 1 } as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/vaccines/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA']}>
        <VaccineForm mode="create" />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('ワクチン名'), '5種混合');
    await user.click(screen.getByRole('combobox', { name: /状態/ }));
    await user.click(screen.getByRole('option', { name: '接種済み' }));
    await user.type(screen.getByLabelText('ワクチン費用（円）'), '2500');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(alertSpy).toHaveBeenCalledWith('ワクチン費用を経費へ反映するには接種日を入力してください');
    expect(createVaccine).not.toHaveBeenCalled();
  });

  it('接種済み保存時に医薬品費へ連携し元画面へ戻る', async () => {
    const createVaccine = vi.spyOn(vaccineApi, 'createVaccine').mockResolvedValue({
      id: 55,
      targetType: '成牛',
      targetNumber: '9130',
      targetName: 'はな',
      vaccineName: '5種混合',
      vaccinationDate: '2026-09-29',
      status: '接種済み',
    } as any);
    const upsertExpense = vi.spyOn(expensesApi, 'upsertExpenseBySource');
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/vaccines/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA&returnTo=%2Fcattle%2F1']}>
        <Routes>
          <Route path="/vaccines/new" element={<VaccineForm mode="create" />} />
          <Route path="/cattle/:id" element={<div>個体カルテへ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('ワクチン名'), '5種混合');
    await user.type(screen.getByLabelText('接種日'), '2026-09-29');
    await user.type(screen.getByLabelText('次回予定日'), '2027-09-29');
    await user.click(screen.getByRole('combobox', { name: /状態/ }));
    await user.click(screen.getByRole('option', { name: '接種済み' }));
    await user.type(screen.getByLabelText('ワクチン費用（円）'), '2500');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(createVaccine).toHaveBeenCalledWith(expect.objectContaining({
      targetType: '成牛',
      targetNumber: '9130',
      targetName: 'はな',
      vaccineName: '5種混合',
      vaccinationDate: '2026-09-29',
      nextDueDate: '2027-09-29',
      status: '接種済み',
      vaccineCost: '2500',
    }));

    expect(upsertExpense).toHaveBeenCalledWith(expect.objectContaining({
      paymentDate: '2026-09-29',
      category: '医薬品費',
      description: 'ワクチン：5種混合',
      amount: '2500',
      sourceType: 'vaccine',
      sourceId: '55',
    }));

    expect(await screen.findByText('個体カルテへ戻った')).toBeInTheDocument();
  });

  it('未接種では費用が入力されていても経費へ反映しない', async () => {
    vi.spyOn(vaccineApi, 'createVaccine').mockResolvedValue({ id: 56 } as any);
    const deleteExpense = vi.spyOn(expensesApi, 'deleteExpenseBySource');
    const upsertExpense = vi.spyOn(expensesApi, 'upsertExpenseBySource');
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/vaccines/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA']}>
        <VaccineForm mode="create" />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('ワクチン名'), '5種混合');
    await user.type(screen.getByLabelText('ワクチン費用（円）'), '2500');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(upsertExpense).not.toHaveBeenCalled();
    expect(deleteExpense).toHaveBeenCalledWith('vaccine', '56', '医薬品費');
  });
});
