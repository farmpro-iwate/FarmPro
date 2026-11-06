import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TreatmentForm } from './TreatmentForm';
import type { MedicineOption } from '../components/MedicineSearchField';
import type { Treatment, TreatmentInput } from '../types/treatment';
import * as treatmentApi from '../services/treatmentApi';
import * as expensesApi from '../services/expensesApi';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';
import * as inventoryApi from '../services/supplyInventoryApi';
import * as inventorySync from '../services/supplyInventorySync';
import type { SupplyBatch, SupplyMovement } from '../services/supplyInventoryApi';

type StockProps = {
  medicine: string;
  source: TreatmentInput['medicineSource'];
  batches: SupplyBatch[];
  selectedKey?: string;
  quantity?: number;
  loading: boolean;
  error: string;
  syncWarning?: string;
  disabled?: boolean;
  onSourceChange: (source: TreatmentInput['medicineSource']) => void;
  onReload: () => void;
  onSelectBatch: (batch: SupplyBatch | null) => void;
  onQuantityChange: (quantity: number | undefined) => void;
};
type MedicineProps = { value: string; onChange: (name: string, medicine?: MedicineOption | null) => void };
const controls = vi.hoisted(() => ({
  stock: null as StockProps | null,
  medicine: null as MedicineProps | null,
  stockRenders: [] as Array<Pick<StockProps, 'medicine' | 'selectedKey' | 'quantity'>>,
}));

vi.mock('../components/TreatmentMedicineStockFields', () => ({
  TreatmentMedicineStockFields: (props: StockProps) => {
    controls.stock = props;
    controls.stockRenders.push({ medicine: props.medicine, selectedKey: props.selectedKey, quantity: props.quantity });
    return <section aria-label="在庫入力の確認用操作">
      {props.error && <p role="alert">{props.error}</p>}
      <button type="button" disabled={props.loading || props.disabled} onClick={props.onReload}>在庫を再読み込み</button>
      <input aria-label="在庫からの使用数量" type="number" value={props.quantity ?? ''}
        disabled={props.loading || Boolean(props.error) || props.disabled}
        onChange={event => props.onQuantityChange(event.target.value === '' ? undefined : Number(event.target.value))} />
    </section>;
  },
}));
vi.mock('../components/MedicineSearchField', () => ({
  MedicineSearchField: (props: MedicineProps) => {
    controls.medicine = props;
    return <input aria-label="薬剤" value={props.value} onChange={event => props.onChange(event.target.value, null)} />;
  },
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
  name: '在庫確認用利用者', farmName: '在庫確認用農場', email: 'stock-qa@example.invalid',
};
// Fictional master data only: these numbers exercise date calculation, not treatment guidance.
const master: MedicineOption = { id: 901, name: '確認用薬品A', autoCalculateWithdrawal: true, meatWithdrawalDays: 7 };
const otherMedicine = '確認用薬品Ｂ・規格Q';
function movement(id: string, itemName: string, lotNumber: string): SupplyMovement {
  return {
    id, kind: '医薬品', action: '購入', date: '2026-11-01', itemName, lotNumber,
    quantity: 10, unit: '本', expiryDate: '2027-11-01', storageLocation: '確認用棚',
    supplier: '確認用仕入先', donorCow: '', sire: '', grade: '', cowEarTag: '',
    unitPrice: 0, amount: 0, paymentMethod: '', note: '', expenseRecorded: false,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  };
}
const rows = [movement('stock-a1', master.name, 'LOT-A1'), movement('stock-a2', master.name, 'LOT-A2'),
  movement('stock-b1', otherMedicine, 'LOT-B1')];
const batches = inventoryApi.getSupplyBatches(rows, '医薬品');
const batchA1 = batches.find(batch => batch.lotNumber === 'LOT-A1')!;
const batchA2 = batches.find(batch => batch.lotNumber === 'LOT-A2')!;
const batchB = batches.find(batch => batch.lotNumber === 'LOT-B1')!;

function existingTreatment(): Treatment {
  return {
    id: 41, recordType: '治療', targetNumber: '0456', targetName: '確認用個体',
    symptom: '入力済みの確認用症状', diagnosis: '確認用疾病名', treatmentProcedure: '確認用処置',
    treatmentDate: '2026-11-01', medicine: master.name, dosage: '入力済みの投薬量',
    medicineSource: 'farm_stock', medicineInventoryBatchKey: batchA1.key, medicineInventoryQuantity: 2,
    medicineCost: '1250', medicalFee: '2300', withdrawalEndDate: '2026-11-20',
    veterinarian: '確認用担当者', progress: '治療中', note: '入力済みのメモ', nextScheduledDate: '2026-11-25',
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}
function mount(mode: 'create' | 'edit' = 'create') {
  const query = new URLSearchParams({ targetNumber: '0456', targetName: '確認用個体',
    treatmentDate: '2026-11-01', symptom: '入力済みの確認用症状' });
  render(<MemoryRouter initialEntries={[mode === 'edit' ? '/treatments/41/edit' : `/treatments/new?${query}`]}>
    <Routes>
      <Route path="/treatments/new" element={<TreatmentForm mode="create" />} />
      <Route path="/treatments/:id/edit" element={<TreatmentForm mode="edit" />} />
      <Route path="/treatments" element={<div>治療保存後の一覧</div>} />
    </Routes>
  </MemoryRouter>);
}
function fillDetails() {
  fireEvent.change(screen.getByLabelText('薬剤'), { target: { value: master.name } });
  for (const [label, value] of [
    ['投薬量', '入力済みの投薬量'], ['休薬期間終了日', '2026-11-20'], ['医薬品費（円）', '1250'],
    ['診療費（円）', '2300'], ['疾病名（診断名）', '確認用疾病名'], ['処置内容', '確認用処置'],
    ['獣医師名', '確認用担当者'], ['メモ', '入力済みのメモ'], ['次回予定日（任意）', '2026-11-25'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function expectDetailsRetained() {
  expect(screen.getByLabelText(/症状/)).toHaveValue('入力済みの確認用症状');
  expect(screen.getByLabelText(/治療日/)).toHaveValue('2026-11-01');
  expect(screen.getByLabelText('投薬量')).toHaveValue('入力済みの投薬量');
  expect(screen.getByLabelText('休薬期間終了日')).toHaveValue('2026-11-20');
  expect(screen.getByLabelText('医薬品費（円）')).toHaveValue(1250);
  expect(screen.getByLabelText('診療費（円）')).toHaveValue(2300);
  expect(screen.getByLabelText('疾病名（診断名）')).toHaveValue('確認用疾病名');
  expect(screen.getByLabelText('処置内容')).toHaveValue('確認用処置');
  expect(screen.getByLabelText('獣医師名')).toHaveValue('確認用担当者');
  expect(screen.getByLabelText('メモ')).toHaveValue('入力済みのメモ');
  expect(screen.getByLabelText('次回予定日（任意）')).toHaveValue('2026-11-25');
}
async function readyStock() {
  await waitFor(() => {
    expect(controls.stock).not.toBeNull();
    expect(controls.stock?.loading).toBe(false);
    expect(controls.stock?.error).toBe('');
  });
}
async function chooseFarmStock() {
  act(() => { controls.stock!.onSourceChange('farm_stock'); });
  await readyStock();
}
function selectBatch(batch: SupplyBatch) {
  act(() => { controls.stock!.onSelectBatch(batch); });
}
function setQuantity(quantity: number) {
  fireEvent.change(screen.getByLabelText('在庫からの使用数量'), { target: { value: String(quantity) } });
}
function expectNoSave() {
  expect(treatmentApi.createTreatment).not.toHaveBeenCalled();
  expect(treatmentApi.updateTreatment).not.toHaveBeenCalled();
  expect(expensesApi.upsertExpenseBySource).not.toHaveBeenCalled();
  expect(expensesApi.deleteExpenseBySource).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear();
  controls.stock = null; controls.medicine = null; controls.stockRenders = [];
  localStorage.setItem('farmpro.authUser', JSON.stringify(owner));
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('このテストは外部リクエストを行いません。')));
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  vi.spyOn(inventoryApi, 'getSupplyMovements').mockResolvedValue(rows);
  vi.spyOn(inventorySync, 'getSupplyInventorySyncStatus').mockReturnValue({ state: 'idle', message: '' });
  vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
  vi.spyOn(treatmentApi, 'getTreatment').mockResolvedValue(existingTreatment());
  vi.spyOn(treatmentApi, 'createTreatment').mockImplementation(async input => ({ ...input, id: 91 }));
  vi.spyOn(treatmentApi, 'updateTreatment').mockImplementation(async (id, input) => ({ ...input, id: Number(id) }));
  vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([]);
  vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([]);
  vi.spyOn(expensesApi, 'upsertExpenseBySource').mockImplementation(async input => ({
    ...input, id: 'qa-expense', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  }));
  vi.spyOn(expensesApi, 'deleteExpenseBySource').mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear();
});

describe('治療フォームの在庫選択', () => {
  it('在庫読込失敗を再試行でき、読込中も成功後も治療の入力を保持する', async () => {
    const retry = deferred<SupplyMovement[]>();
    vi.mocked(inventoryApi.getSupplyMovements).mockRejectedValueOnce(new Error('確認用の読込失敗'))
      .mockReturnValueOnce(retry.promise);
    const user = userEvent.setup(); mount(); fillDetails();
    await waitFor(() => expect(controls.stock?.error).toBeTruthy());
    expect(controls.stock?.loading).toBe(false);
    expect(controls.stock?.batches).toEqual([]);
    expectDetailsRetained();
    await user.click(screen.getByRole('button', { name: '在庫を再読み込み' }));
    expect(controls.stock?.loading).toBe(true);
    expectDetailsRetained();
    await act(async () => { retry.resolve(rows); });
    await readyStock();
    expect(controls.stock?.batches).toEqual(batches);
    expectDetailsRetained();
    expect(inventoryApi.getSupplyMovements).toHaveBeenCalledTimes(2);
    expectNoSave();
  });

  it('別薬の明示選択で薬名と在庫キーを同時に変え、数量だけ再入力にし、手入力の改名でも旧在庫を解除する', async () => {
    mount(); fillDetails(); await readyStock(); await chooseFarmStock();
    selectBatch(batchA1); setQuantity(2);
    const renderStart = controls.stockRenders.length;
    selectBatch(batchB);
    expect(controls.stock).toMatchObject({ medicine: otherMedicine, source: 'farm_stock', selectedKey: batchB.key, quantity: undefined });
    expect(controls.stockRenders.slice(renderStart)).not.toHaveLength(0);
    for (const rendered of controls.stockRenders.slice(renderStart)) {
      expect(rendered).toMatchObject({ medicine: otherMedicine, selectedKey: batchB.key, quantity: undefined });
    }
    expect(screen.getByLabelText('薬剤')).toHaveValue(otherMedicine);
    expectDetailsRetained();
    expectNoSave();

    setQuantity(3); selectBatch(batchB);
    expect(controls.stock?.quantity).toBe(3);
    act(() => { controls.medicine!.onChange(otherMedicine, null); });
    expect(controls.stock).toMatchObject({ selectedKey: batchB.key, quantity: 3 });
    fireEvent.change(screen.getByLabelText('薬剤'), { target: { value: '別の確認用入力名' } });
    expect(controls.stock?.selectedKey).toBeUndefined();
    expect(controls.stock?.quantity).toBeUndefined();
    expectDetailsRetained();
    expectNoSave();
  });

  it('別の在庫薬へ切り替えると旧薬マスターの自動休薬計算を使わず、既存の投薬量と休薬終了日を保持する', async () => {
    mount(); fillDetails(); await readyStock();
    act(() => { controls.medicine!.onChange(master.name, master); });
    expect(screen.getByLabelText('休薬期間終了日')).toHaveValue('2026-11-08');
    fireEvent.change(screen.getByLabelText('休薬期間終了日'), { target: { value: '2026-11-20' } });
    await chooseFarmStock(); selectBatch(batchA1); selectBatch(batchB);
    expect(screen.getByLabelText('投薬量')).toHaveValue('入力済みの投薬量');
    expect(screen.getByLabelText('休薬期間終了日')).toHaveValue('2026-11-20');
    fireEvent.change(screen.getByLabelText(/治療日/), { target: { value: '2026-11-02' } });
    expect(screen.getByLabelText('休薬期間終了日')).toHaveValue('2026-11-20');
    expect(screen.queryByText(/薬品マスターの肉・出荷/)).not.toBeInTheDocument();
    expectNoSave();
  });

  it('同薬の別ロットでは使用数量だけ解除し、選択済み薬品マスターの自動休薬計算を維持する', async () => {
    mount(); fillDetails(); await readyStock();
    act(() => { controls.medicine!.onChange(master.name, master); });
    await chooseFarmStock(); selectBatch(batchA1); setQuantity(2);
    fireEvent.change(screen.getByLabelText(/治療日/), { target: { value: '2026-11-02' } });
    expect(screen.getByLabelText('休薬期間終了日')).toHaveValue('2026-11-09');
    selectBatch(batchA2);
    expect(controls.stock).toMatchObject({ medicine: master.name, selectedKey: batchA2.key, quantity: undefined });
    fireEvent.change(screen.getByLabelText(/治療日/), { target: { value: '2026-11-03' } });
    expect(screen.getByLabelText('休薬期間終了日')).toHaveValue('2026-11-10');
    expect(screen.getByLabelText('投薬量')).toHaveValue('入力済みの投薬量');
    expectNoSave();
  });

  it.each(['farmId', 'id'] as const)('照会中に%sが変わった場合は旧農場・利用者の在庫結果を表示しない', async key => {
    const pending = deferred<SupplyMovement[]>();
    vi.mocked(inventoryApi.getSupplyMovements).mockReturnValueOnce(pending.promise);
    mount(); fillDetails();
    expect(controls.stock?.loading).toBe(true);
    localStorage.setItem('farmpro.authUser', JSON.stringify({ ...owner, [key]: 'changed-owner' }));
    await act(async () => { pending.resolve(rows); });
    await waitFor(() => expect(controls.stock?.loading).toBe(false));
    expect(controls.stock?.batches).toEqual([]);
    expect(controls.stock?.error).toMatch(/農場|利用者/);
    expectNoSave();
  });

  it('農場在庫の利用中は画面復帰で在庫だけを更新し、選択と治療の入力を保持する', async () => {
    mount(); fillDetails(); await readyStock(); await chooseFarmStock();
    selectBatch(batchA1); setQuantity(2);
    const before = vi.mocked(inventoryApi.getSupplyMovements).mock.calls.length;
    const refreshedRows = rows.map(row => ({ ...row, quantity: row.quantity + 1 }));
    vi.mocked(inventoryApi.getSupplyMovements).mockResolvedValue(refreshedRows);
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(inventoryApi.getSupplyMovements).toHaveBeenCalledTimes(before + 1));
    await readyStock();
    expect(controls.stock?.batches).toEqual(inventoryApi.getSupplyBatches(refreshedRows, '医薬品'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(inventoryApi.getSupplyMovements).toHaveBeenCalledTimes(before + 2));
    await readyStock();
    expect(controls.stock).toMatchObject({ medicine: master.name, selectedKey: batchA1.key, quantity: 2 });
    expectDetailsRetained();
    expectNoSave();
  });

  it.each(['create', 'edit'] as const)('%sの明示保存で確定した薬名・キー・使用数量を既存の保存APIへ渡す', async mode => {
    const user = userEvent.setup(); mount(mode);
    await screen.findByLabelText('薬剤');
    if (mode === 'create') fillDetails();
    await readyStock();
    if (mode === 'create') await chooseFarmStock();
    selectBatch(batchB);
    expect(controls.stock?.quantity).toBeUndefined();
    setQuantity(3);
    fireEvent.change(screen.getByLabelText('医薬品費（円）'), { target: { value: '0' } });
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByText('治療保存後の一覧');
    const expected = expect.objectContaining({
      targetNumber: '0456', targetName: '確認用個体', symptom: '入力済みの確認用症状',
      treatmentDate: '2026-11-01', medicine: otherMedicine, medicineSource: 'farm_stock',
      medicineInventoryBatchKey: batchB.key, medicineInventoryQuantity: 3,
      dosage: '入力済みの投薬量', withdrawalEndDate: '2026-11-20',
      medicineCost: '0', medicalFee: '2300', note: '入力済みのメモ',
    });
    if (mode === 'create') {
      expect(treatmentApi.createTreatment).toHaveBeenCalledExactlyOnceWith(expected,
        expect.objectContaining({ onLocalSaved: expect.any(Function) }));
      expect(treatmentApi.updateTreatment).not.toHaveBeenCalled();
    } else {
      expect(treatmentApi.updateTreatment).toHaveBeenCalledExactlyOnceWith('41', expected);
      expect(treatmentApi.createTreatment).not.toHaveBeenCalled();
    }
    expect(window.alert).not.toHaveBeenCalled();
  });
});
