import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords } from '../storage/repository';
import {
  createSupplyMovement, getSupplyBatches, getSupplyMovements, type SupplyInput,
} from '../services/supplyInventoryApi';
import { TreatmentForm } from './TreatmentForm';
import { saveTreatmentWithMedicineSource } from '../services/treatmentInventoryLink';
import type { TreatmentInput } from '../types/treatment';

// Use the real form and inventory database. Mock only optional lookup widgets.
vi.mock('../components/MedicineSearchField', () => ({
  MedicineSearchField: ({ onChange }: { onChange: (name: string) => void }) =>
    <button type="button" onClick={() => onChange('試験用薬品')}>試験用薬品を選ぶ</button>,
}));
vi.mock('../components/CattlePicker', () => ({ CattlePicker: () => null }));
vi.mock('../components/CalfPicker', () => ({ CalfPicker: () => null }));
vi.mock('../components/StaffSearchField', () => ({ StaffSearchField: () => null }));
vi.mock('../components/DiseaseSearchField', () => ({ DiseaseSearchField: () => null }));
vi.mock('../components/TreatmentProcedureSearchField', () => ({
  TreatmentProcedureSearchField: () => null,
}));

const medicine: SupplyInput = {
  kind: '医薬品', action: '購入', date: '2026-10-27', itemName: '試験用薬品',
  lotNumber: 'LOT001', quantity: 10, unit: '本', expiryDate: '2027-10-27',
  supplier: 'JA', storageLocation: '冷蔵庫', donorCow: '', sire: '',
  grade: '', cowEarTag: '', unitPrice: 200, amount: 2000,
  paymentMethod: '現金', note: '',
};

function openNewTreatmentForm() {
  return render(
    <MemoryRouter initialEntries={['/treatments/new?targetNumber=1234&targetName=%E8%A9%A6%E9%A8%93%E7%89%9B']}>
      <Routes>
        <Route path="/treatments/new" element={<TreatmentForm mode="create" />} />
        <Route path="/treatments" element={<p>治療一覧に戻りました</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function selectOption(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: value }));
}

async function prepareTreatment(user: ReturnType<typeof userEvent.setup>) {
  openNewTreatmentForm();
  await user.type(screen.getByRole('textbox', { name: '症状' }), '発熱');
  fireEvent.change(screen.getByLabelText(/治療日/), { target: { value: '2026-10-28' } });
  await user.click(screen.getByRole('button', { name: '試験用薬品を選ぶ' }));
}

describe('TreatmentForm medicine stock integration', () => {
  beforeEach(async () => {
    await clearStore('treatments');
    await clearStore('supplyInventory');
    await clearStore('expenses');
  });
  afterEach(() => cleanup());

  it('farm medicine chosen in treatment form deducts stock on save', async () => {
    await createSupplyMovement(medicine, false);
    const user = userEvent.setup();
    await prepareTreatment(user);
    await selectOption(user, '薬剤の使用元', '農場在庫から使用');
    await selectOption(user, '使用する在庫・ロット', '試験用薬品／LOT001／冷蔵庫（残り10本）');
    fireEvent.change(screen.getByRole('spinbutton', { name: '在庫からの使用数量' }), { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByText('治療一覧に戻りました');
    const treatments = await getAllRecords('treatments');
    expect(treatments).toHaveLength(1);
    expect(treatments[0].targetNumber).toBe('1234');
    expect(treatments[0].medicineSource).toBe('farm_stock');
    expect(getSupplyBatches(await getSupplyMovements(), '医薬品')[0].balance).toBe(8);
    expect(await getAllRecords('expenses')).toHaveLength(0);
  });

  it('editing a farm-stock treatment adjusts existing usage instead of deducting twice', async () => {
    await createSupplyMovement(medicine, false);
    const key = getSupplyBatches(await getSupplyMovements(), '医薬品')[0].key;
    const original: TreatmentInput = {
      targetNumber: '1234', targetName: '試験牛', recordType: '治療',
      symptom: '発熱', diagnosis: '', treatmentProcedure: '', treatmentDate: '2026-10-28',
      medicine: '試験用薬品', dosage: '2本', withdrawalEndDate: '',
      veterinarian: '', progress: '治療中', note: '',
    };
    const saved = await saveTreatmentWithMedicineSource(original,
      { source: 'farm_stock', batchKey: key, quantity: 2 });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/treatments/' + saved.id + '/edit']}>
        <Routes>
          <Route path="/treatments/:id/edit" element={<TreatmentForm mode="edit" />} />
          <Route path="/treatments" element={<p>治療一覧に戻りました</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const quantity = await screen.findByRole('spinbutton', { name: '在庫からの使用数量' });
    await user.clear(quantity);
    await user.type(quantity, '3');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByText('治療一覧に戻りました');

    const stockRows = await getSupplyMovements();
    expect(getSupplyBatches(stockRows, '医薬品')[0].balance).toBe(7);
    expect(stockRows.filter((row) => row.action === '使用')).toHaveLength(1);
    const treatments = await getAllRecords('treatments');
    expect(treatments).toHaveLength(1);
    expect(treatments[0].medicineInventoryQuantity).toBe(3);
  });

  it('vet-supplied medicine saves treatment without decreasing farm inventory', async () => {
    const user = userEvent.setup();
    await prepareTreatment(user);
    await selectOption(user, '薬剤の使用元', '獣医師が処方・持参');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByText('治療一覧に戻りました');
    const treatments = await getAllRecords('treatments');
    expect(treatments).toHaveLength(1);
    expect(treatments[0].medicineSource).toBe('veterinarian');
    expect(await getSupplyMovements()).toHaveLength(0);
    expect(await getAllRecords('expenses')).toHaveLength(0);
  });
});
