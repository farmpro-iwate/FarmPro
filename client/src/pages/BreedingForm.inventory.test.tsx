import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords } from '../storage/repository';
import { createSupplyMovement, getSupplyBatches, getSupplyMovements, type SupplyInput } from '../services/supplyInventoryApi';
import { BreedingForm } from './BreedingForm';

// Keep the form and IndexedDB implementations real; mock only complex lookup widgets.
vi.mock('../components/CattlePicker', () => ({
  CattlePicker: ({ onSelect }: { onSelect: (cow: { earTag: string; name: string }) => void }) =>
    <button type="button" onClick={() => onSelect({ earTag: '5953', name: '試験牛' })}>試験牛を選ぶ</button>,
}));
vi.mock('../components/SireSearchField', () => ({ SireSearchField: () => null }));
vi.mock('../components/InseminatorSearchField', () => ({ InseminatorSearchField: () => null }));
vi.mock('../components/PartnerSearchField', () => ({ PartnerSearchField: () => null }));

const embryo: SupplyInput = {
  kind: '受精卵', action: '購入', date: '2026-10-27', itemName: '試験受精卵',
  lotNumber: 'ET-123', quantity: 2, unit: '個', expiryDate: '',
  supplier: 'JA', storageLocation: 'タンクA', donorCow: '供卵牛A',
  sire: '父牛A', grade: 'A', cowEarTag: '', unitPrice: 15000,
  amount: 30000, paymentMethod: '現金', note: '',
};

function openCreateForm() {
  return render(
    <MemoryRouter initialEntries={['/breedings/new']}>
      <Routes>
        <Route path="/breedings/new" element={<BreedingForm mode="create" />} />
        <Route path="/breedings" element={<p>繁殖管理に戻りました</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function selectOption(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('BreedingForm ET inventory integration', () => {
  beforeEach(async () => {
    await clearStore('breedings');
    await clearStore('supplyInventory');
    await clearStore('expenses');
    await clearStore('metadata');
  });

  afterEach(() => cleanup());

  it('choosing farm stock and saving an ET deducts one embryo exactly once', async () => {
    await createSupplyMovement(embryo, false);
    const user = userEvent.setup();
    openCreateForm();
    await user.click(await screen.findByRole('button', { name: '試験牛を選ぶ' }));
    await selectOption(user, '繁殖方法', '受精卵移植');
    await selectOption(user, '現在の段階', '移植実施');
    await selectOption(user, '受精卵の使用元', '農場在庫から使用');
    await selectOption(user, '使用する受精卵在庫', 'ET-123／試験受精卵（残り2個）');
    fireEvent.change(screen.getByLabelText('移植実施日'), { target: { value: '2026-10-28' } });
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByText('繁殖管理に戻りました');
    expect(getSupplyBatches(await getSupplyMovements(), '受精卵')[0].balance).toBe(1);
    const records = await getAllRecords('breedings');
    expect(records).toHaveLength(1);
    expect(records[0].embryoInventoryMovementId).toBe('embryo-stock-' + records[0].id);
    expect(records[0].cowEarTag).toBe('5953');
    expect(await getAllRecords('expenses')).toHaveLength(0);
  });

  it('prevents saving a completed transfer until an embryo source is chosen', async () => {
    const user = userEvent.setup();
    openCreateForm();
    await user.click(await screen.findByRole('button', { name: '試験牛を選ぶ' }));
    await selectOption(user, '繁殖方法', '受精卵移植');
    await selectOption(user, '現在の段階', '移植実施');
    fireEvent.change(screen.getByLabelText('移植実施日'), { target: { value: '2026-10-28' } });
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.getByText('移植する受精卵の使用元を選んでください。')).toBeTruthy());
    expect(await getAllRecords('breedings')).toHaveLength(0);
    expect(await getSupplyMovements()).toHaveLength(0);
  });
});
