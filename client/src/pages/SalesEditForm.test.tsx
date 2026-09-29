import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesEditForm } from './SalesEditForm';
import * as salesApi from '../services/salesApi';
import * as calfApi from '../services/calfApi';
import * as snapshotApi from '../services/saleCostSnapshot';

vi.mock('../components/PartnerSearchField', () => ({
  PartnerSearchField: ({ value, onChange }: any) => (
    <input aria-label="販売先・購買者" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

const baseSale = {
  id: 's1',
  targetType: '子牛',
  targetNumber: '9131',
  targetName: 'さくら',
  sex: '雌',
  birthday: '2026-07-01',
  motherName: '母A',
  calfId: 'c1',
  cattleId: '',
  calvingId: 'cv1',
  motherCowId: '100',
  shippingPlanDate: '',
  shippingDate: '',
  saleDate: '',
  buyer: '',
  marketName: '',
  saleWeight: '',
  salePrice: '',
  status: '出荷予定',
  reason: '',
  memo: '',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('SalesEditForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(salesApi, 'getSale').mockResolvedValue(baseSale as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([{
      id: 'c1',
      calfNumber: '9131',
      birthday: '2026-07-01',
      name: 'さくら',
      calvingId: 'cv1',
    }] as any);
    vi.spyOn(calfApi, 'markCalfSold').mockResolvedValue(undefined as any);
    vi.spyOn(calfApi, 'resetCalfSoldStatus').mockResolvedValue(undefined as any);
    vi.spyOn(snapshotApi, 'refreshSaleProfitFromFixedCost').mockResolvedValue(undefined as any);
    vi.spyOn(snapshotApi, 'clearSaleCostSnapshot').mockResolvedValue(undefined as any);
  });

  afterEach(() => cleanup());

  it('販売済みにする場合は販売日が必須', async () => {
    const updateSale = vi.spyOn(salesApi, 'updateSale').mockResolvedValue({ id: 's1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/sales/s1/edit']}>
        <Routes>
          <Route path="/sales/:id/edit" element={<SalesEditForm />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '出荷・販売 編集' });
    await user.click(screen.getByRole('combobox', { name: /状態/ }));
    await user.click(screen.getByRole('option', { name: '販売済み' }));
    await user.click(screen.getByRole('button', { name: '更新する' }));

    expect(updateSale).not.toHaveBeenCalled();
  });

  it('子牛を販売済みに更新すると利益を再計算し販売済みにする', async () => {
    const updateSale = vi.spyOn(salesApi, 'updateSale').mockResolvedValue({ id: 's1' } as any);
    const refresh = vi.spyOn(snapshotApi, 'refreshSaleProfitFromFixedCost').mockResolvedValue(undefined as any);
    const markSold = vi.spyOn(calfApi, 'markCalfSold').mockResolvedValue(undefined as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/sales/s1/edit']}>
        <Routes>
          <Route path="/sales/:id/edit" element={<SalesEditForm />} />
          <Route path="/sales" element={<div>販売一覧へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '出荷・販売 編集' });
    await user.type(screen.getByLabelText(/販売日/), '2026-09-29');
    await user.type(screen.getByLabelText(/販売金額 円/), '500000');
    await user.click(screen.getByRole('combobox', { name: /状態/ }));
    await user.click(screen.getByRole('option', { name: '販売済み' }));
    await user.click(screen.getByRole('button', { name: '更新する' }));

    expect(updateSale).toHaveBeenCalledWith('s1', expect.objectContaining({
      calfId: 'c1',
      status: '販売済み',
      saleDate: '2026-09-29',
      salePrice: '500000',
    }));
    expect(refresh).toHaveBeenCalledWith('s1');
    expect(markSold).toHaveBeenCalledWith('c1');
    expect(await screen.findByText('販売一覧へ戻った')).toBeInTheDocument();
  });

  it('子牛販売を取消すると利益スナップショットを消して販売済み状態を解除する', async () => {
    vi.spyOn(salesApi, 'getSale').mockResolvedValue({
      ...baseSale,
      status: '販売済み',
      saleDate: '2026-09-20',
      salePrice: '480000',
    } as any);
    const updateSale = vi.spyOn(salesApi, 'updateSale').mockResolvedValue({ id: 's1' } as any);
    const clear = vi.spyOn(snapshotApi, 'clearSaleCostSnapshot').mockResolvedValue(undefined as any);
    const reset = vi.spyOn(calfApi, 'resetCalfSoldStatus').mockResolvedValue(undefined as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/sales/s1/edit']}>
        <Routes>
          <Route path="/sales/:id/edit" element={<SalesEditForm />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '出荷・販売 編集' });
    await user.click(screen.getByRole('combobox', { name: /状態/ }));
    await user.click(screen.getByRole('option', { name: '取消' }));
    await user.click(screen.getByRole('button', { name: '更新する' }));

    expect(updateSale).toHaveBeenCalledWith('s1', expect.objectContaining({
      calfId: 'c1',
      status: '取消',
    }));
    expect(clear).toHaveBeenCalledWith('s1');
    expect(reset).toHaveBeenCalledWith('c1');
  });
});
