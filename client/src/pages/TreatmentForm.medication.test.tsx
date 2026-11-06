import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TreatmentForm } from './TreatmentForm';
import type { MedicineOption } from '../components/MedicineSearchField';
import type { Treatment } from '../types/treatment';
import * as treatmentApi from '../services/treatmentApi';
import * as expensesApi from '../services/expensesApi';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';
import * as inventoryApi from '../services/supplyInventoryApi';
import * as inventorySync from '../services/supplyInventorySync';
import type { SupplyMovement } from '../services/supplyInventoryApi';

// Use the real stock component to cover the medication form's inventory-first entry.
vi.mock('../components/MedicineSearchField', () => ({
  MedicineSearchField: ({ value, onChange, required }: {
    value: string; onChange: (name: string, medicine?: MedicineOption | null) => void; required?: boolean;
  }) => <input aria-label="薬剤" value={value} required={required}
    onChange={event => onChange(event.target.value, null)} />,
}));
vi.mock('../components/CattlePicker', () => ({ CattlePicker: () => null }));
vi.mock('../components/CalfPicker', () => ({ CalfPicker: () => null }));
vi.mock('../components/StaffSearchField', () => ({
  StaffSearchField: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) =>
    <input aria-label={label} value={value} onChange={event => onChange(event.target.value)} />,
}));
vi.mock('../components/DiseaseSearchField', () => ({
  DiseaseSearchField: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) =>
    <input aria-label={label} value={value} onChange={event => onChange(event.target.value)} />,
}));
vi.mock('../components/TreatmentProcedureSearchField', () => ({
  TreatmentProcedureSearchField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
    <input aria-label="処置内容" value={value} onChange={event => onChange(event.target.value)} />,
}));

const owner = {
  id: 'qa-user', farmId: 'qa-farm', plan: 'free', active: true, role: 'owner',
  name: '投薬確認用利用者', farmName: '投薬確認用農場', email: 'medication-qa@example.invalid',
};
function movement(id: string, itemName: string, lotNumber: string): SupplyMovement {
  return {
    id, kind: '医薬品', action: '購入', date: '2026-11-01', itemName, lotNumber,
    quantity: 10, unit: '本', expiryDate: '2027-11-01', storageLocation: '確認用棚',
    supplier: '確認用仕入先', donorCow: '', sire: '', grade: '', cowEarTag: '',
    unitPrice: 0, amount: 0, paymentMethod: '', note: '', expenseRecorded: false,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  };
}
const stockA = movement('stock-a', '確認用薬品A', 'LOT-A');
const stockB = movement('stock-b', '確認用薬品B', 'LOT-B');
const emptyStock = movement('stock-empty', '確認用残量ゼロ', 'LOT-EMPTY');
const rows: SupplyMovement[] = [stockA, stockB, emptyStock,
  { ...emptyStock, id: 'stock-empty-use', action: '使用' }];

function storedMedication(): Treatment {
  return {
    id: 41, recordType: '投薬', targetNumber: '0456', targetName: '確認用個体',
    symptom: '既存の症状メモ', diagnosis: '既存の診断メモ', diseaseMasterId: 101,
    treatmentProcedure: '既存の処置メモ', treatmentProcedureMasterId: 102,
    treatmentDate: '2026-11-06', medicine: '確認用処方薬', dosage: '既存の投薬量文字列',
    medicineSource: 'veterinarian', medicineCost: '1200', medicalFee: '2300',
    withdrawalEndDate: '2026-11-20', veterinarian: '確認用担当者',
    progress: '経過観察', nextScheduledDate: '2026-11-25', note: '既存の投薬メモ',
  };
}
const activeTreatment: Treatment = {
  ...storedMedication(), id: 17, recordType: '治療', treatmentCourseId: 'qa-treatment-course',
  symptom: '別の治療の症状', diagnosis: '別の治療の診断', medicine: '別の治療の薬剤',
  treatmentDate: '2026-11-05', progress: '治療中',
};

function mount(mode: 'create' | 'edit' = 'create') {
  const query = new URLSearchParams({ recordType: '投薬', targetNumber: '0456',
    targetName: '確認用個体', treatmentDate: '2026-11-06' });
  render(<MemoryRouter initialEntries={[mode === 'edit' ? '/treatments/41/edit' : `/treatments/new?${query}`]}>
    <Routes>
      <Route path="/treatments/new" element={<TreatmentForm mode="create" />} />
      <Route path="/treatments/:id/edit" element={<TreatmentForm mode="edit" />} />
      <Route path="/treatments" element={<div>投薬保存後の一覧</div>} />
    </Routes>
  </MemoryRouter>);
}
function expectMedicationFieldsOnly() {
  expect(screen.getByLabelText(/投薬日/)).toBeInTheDocument();
  expect(screen.getByLabelText('薬剤')).toBeInTheDocument();
  expect(screen.getByLabelText(/投薬量/)).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '薬剤の使用元' })).toBeInTheDocument();
  expect(screen.getByLabelText('休薬期間終了日')).toBeInTheDocument();
  expect(screen.getByLabelText('メモ')).toBeInTheDocument();
  expect(screen.queryByLabelText(/症状/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/診断/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/診療費/)).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: '経過' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/次回予定/)).not.toBeInTheDocument();
  expect(screen.queryByText(/前回の治療を引き継いで/)).not.toBeInTheDocument();
}
function expectNoSave() {
  expect(treatmentApi.createTreatment).not.toHaveBeenCalled();
  expect(treatmentApi.updateTreatment).not.toHaveBeenCalled();
  expect(expensesApi.upsertExpenseBySource).not.toHaveBeenCalled();
  expect(expensesApi.deleteExpenseBySource).not.toHaveBeenCalled();
}
async function chooseSource(user: ReturnType<typeof userEvent.setup>, option: string) {
  await user.click(screen.getByRole('combobox', { name: '薬剤の使用元' }));
  await user.click(screen.getByRole('option', { name: option }));
}

beforeEach(() => {
  vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('farmpro.authUser', JSON.stringify(owner));
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('このテストは外部リクエストを行いません。')));
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  vi.spyOn(inventoryApi, 'getSupplyMovements').mockResolvedValue(rows);
  vi.spyOn(inventorySync, 'getSupplyInventorySyncStatus').mockReturnValue({ state: 'idle', message: '' });
  vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([activeTreatment]);
  vi.spyOn(treatmentApi, 'getTreatment').mockResolvedValue(storedMedication());
  vi.spyOn(treatmentApi, 'createTreatment').mockImplementation(async input => ({ ...input, id: 91 }));
  vi.spyOn(treatmentApi, 'updateTreatment').mockImplementation(async (id, input) => ({ ...input, id: Number(id) }));
  vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([]);
  vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([]);
  vi.spyOn(expensesApi, 'upsertExpenseBySource').mockImplementation(async input => ({
    ...input, id: 'qa-expense', createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z',
  }));
  vi.spyOn(expensesApi, 'deleteExpenseBySource').mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear();
});

describe('投薬専用フォーム', () => {
  it('薬名が空でも通常の在庫欄から選べ、数量入力後の明示保存で治療とは独立した投薬を作成する', async () => {
    const user = userEvent.setup(); mount();
    await screen.findByRole('heading', { name: '投薬を記録' });
    expectMedicationFieldsOnly();
    expect(screen.getByLabelText('薬剤')).toHaveValue('');
    expect(screen.getByLabelText('薬剤')).toBeRequired();
    await chooseSource(user, '農場在庫から使用');
    const stockSelect = screen.getByRole('combobox', { name: '使用する在庫・ロット' });
    await waitFor(() => expect(stockSelect).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(stockSelect);
    expect(screen.getByRole('option', { name: /確認用薬品A/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /確認用薬品B/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /確認用残量ゼロ/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /確認用薬品A/ }));
    expect(screen.getByLabelText('薬剤')).toHaveValue(stockA.itemName);
    expect(screen.getByLabelText('在庫からの使用数量')).toHaveValue(null);
    expectNoSave();

    fireEvent.change(screen.getByLabelText(/投薬量/), { target: { value: '確認用の投薬量文字列' } });
    fireEvent.change(screen.getByLabelText('休薬期間終了日'), { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '確認用の投薬メモ' } });
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(window.alert).toHaveBeenLastCalledWith('使用する在庫と数量を選んでください。');
    expectNoSave();
    fireEvent.change(screen.getByLabelText('在庫からの使用数量'), { target: { value: '2' } });
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByText('投薬保存後の一覧');
    expect(treatmentApi.createTreatment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      recordType: '投薬', targetNumber: '0456', targetName: '確認用個体', treatmentDate: '2026-11-06',
      medicine: stockA.itemName, dosage: '確認用の投薬量文字列', medicineSource: 'farm_stock',
      medicineInventoryBatchKey: inventoryApi.batchKey(stockA), medicineInventoryQuantity: 2,
      withdrawalEndDate: '2026-11-20', note: '確認用の投薬メモ',
      progress: '', nextScheduledDate: '', symptom: '', diagnosis: '', medicalFee: '',
    }), expect.objectContaining({ onLocalSaved: expect.any(Function) }));
    expect(vi.mocked(treatmentApi.createTreatment).mock.calls[0][0].treatmentCourseId).toBeUndefined();
    expect(treatmentApi.updateTreatment).not.toHaveBeenCalled();
  });

  it.each([
    { missing: '薬剤名', medicine: '   ', dosage: '確認用の投薬量文字列' },
    { missing: '投薬量', medicine: '確認用処方薬', dosage: '   ' },
  ])('$missingが未入力なら、使用元を選んでも保存しない', async ({ medicine, dosage }) => {
    const user = userEvent.setup(); mount();
    await screen.findByRole('heading', { name: '投薬を記録' });
    fireEvent.change(screen.getByLabelText('薬剤'), { target: { value: medicine } });
    fireEvent.change(screen.getByLabelText(/投薬量/), { target: { value: dosage } });
    await chooseSource(user, '獣医師が処方・持参');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(window.alert).toHaveBeenCalledWith('薬剤名と投薬量を入力してください。');
    expectNoSave();
    expect(screen.getByRole('heading', { name: '投薬を記録' })).toBeInTheDocument();
  });

  it('獣医師が処方・持参した薬は農場在庫なしで、投薬として明示保存できる', async () => {
    vi.mocked(inventoryApi.getSupplyMovements).mockResolvedValue([]);
    const user = userEvent.setup(); mount();
    await screen.findByRole('heading', { name: '投薬を記録' });
    fireEvent.change(screen.getByLabelText('薬剤'), { target: { value: '確認用処方薬' } });
    fireEvent.change(screen.getByLabelText(/投薬量/), { target: { value: '確認用の投薬量文字列' } });
    await chooseSource(user, '獣医師が処方・持参');
    expect(screen.queryByRole('combobox', { name: '使用する在庫・ロット' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('在庫からの使用数量')).not.toBeInTheDocument();
    expectMedicationFieldsOnly();
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByText('投薬保存後の一覧');
    expect(treatmentApi.createTreatment).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(treatmentApi.createTreatment).mock.calls[0][0];
    expect(saved).toMatchObject({
      recordType: '投薬', medicine: '確認用処方薬', dosage: '確認用の投薬量文字列', medicineSource: 'veterinarian',
      progress: '', nextScheduledDate: '', symptom: '', diagnosis: '', note: '',
    });
    expect(saved.medicineInventoryBatchKey).toBeUndefined();
    expect(saved.medicineInventoryQuantity).toBeUndefined();
    expect(saved.treatmentCourseId).toBeUndefined();
    expect(treatmentApi.updateTreatment).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('既存投薬の編集は専用画面を開き、非表示の症状・診断・費用・経過・次回予定を消さず更新する', async () => {
    const existing = storedMedication();
    const before = structuredClone(existing);
    vi.mocked(treatmentApi.getTreatment).mockResolvedValue(existing);
    const user = userEvent.setup(); mount('edit');
    await screen.findByRole('heading', { name: '投薬記録を編集' });
    expectMedicationFieldsOnly();
    expect(screen.getByLabelText(/投薬日/)).toHaveValue('2026-11-06');
    expect(screen.getByLabelText('薬剤')).toHaveValue(existing.medicine);
    expect(screen.getByLabelText('休薬期間終了日')).toHaveValue(existing.withdrawalEndDate);
    fireEvent.change(screen.getByLabelText(/投薬量/), { target: { value: '変更後の確認用投薬量文字列' } });
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '確認済みの投薬メモ' } });
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByText('投薬保存後の一覧');
    expect(treatmentApi.updateTreatment).toHaveBeenCalledExactlyOnceWith('41', expect.objectContaining({
      recordType: '投薬', targetNumber: existing.targetNumber, targetName: existing.targetName,
      medicine: existing.medicine, dosage: '変更後の確認用投薬量文字列', medicineSource: 'veterinarian',
      symptom: existing.symptom, diagnosis: existing.diagnosis, diseaseMasterId: existing.diseaseMasterId,
      treatmentProcedure: existing.treatmentProcedure, treatmentProcedureMasterId: existing.treatmentProcedureMasterId,
      medicineCost: existing.medicineCost, medicalFee: existing.medicalFee, veterinarian: existing.veterinarian,
      progress: existing.progress, nextScheduledDate: existing.nextScheduledDate,
      withdrawalEndDate: existing.withdrawalEndDate, note: '確認済みの投薬メモ',
    }));
    expect(treatmentApi.createTreatment).not.toHaveBeenCalled();
    expect(existing).toEqual(before);
  });

  it('既存投薬を農場在庫へ変更すると登録済み費用を確認でき、医薬品費を明示修正してから保存する', async () => {
    const existing = storedMedication();
    vi.mocked(treatmentApi.getTreatment).mockResolvedValue(existing);
    const user = userEvent.setup(); mount('edit');
    await screen.findByRole('heading', { name: '投薬記録を編集' });
    expect(screen.getByRole('button', { name: '登録済みの費用を確認・修正' })).toBeInTheDocument();
    expect(screen.queryByLabelText('医薬品費（円）')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('診療費（円）')).not.toBeInTheDocument();

    await chooseSource(user, '農場在庫から使用');
    expect(await screen.findByLabelText('医薬品費（円）')).toHaveValue(1200);
    expect(screen.getByLabelText('診療費（円）')).toHaveValue(2300);
    const stockSelect = screen.getByRole('combobox', { name: '使用する在庫・ロット' });
    await waitFor(() => expect(stockSelect).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(stockSelect);
    await user.click(screen.getByRole('option', { name: /確認用薬品A/ }));
    fireEvent.change(screen.getByLabelText('在庫からの使用数量'), { target: { value: '2' } });
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(window.alert).toHaveBeenLastCalledWith(expect.stringContaining('医薬品費を0円に'));
    expectNoSave();
    expect(screen.getByLabelText('医薬品費（円）')).toHaveValue(1200);

    fireEvent.change(screen.getByLabelText('医薬品費（円）'), { target: { value: '0' } });
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByText('投薬保存後の一覧');
    expect(treatmentApi.updateTreatment).toHaveBeenCalledExactlyOnceWith('41', expect.objectContaining({
      recordType: '投薬', medicine: stockA.itemName, dosage: existing.dosage,
      medicineSource: 'farm_stock', medicineInventoryBatchKey: inventoryApi.batchKey(stockA), medicineInventoryQuantity: 2,
      medicineCost: '0', medicalFee: existing.medicalFee, symptom: existing.symptom, diagnosis: existing.diagnosis,
      progress: existing.progress, nextScheduledDate: existing.nextScheduledDate, note: existing.note,
    }));
    expect(treatmentApi.createTreatment).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledTimes(1);
  });
});
