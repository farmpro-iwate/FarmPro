import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesForm } from './SalesForm';
import * as salesApi from '../services/salesApi';
import * as saleCostSnapshot from '../services/saleCostSnapshot';
import * as calfApi from '../services/calfApi';
import * as treatmentApi from '../services/treatmentApi';

vi.mock('../components/PartnerSearchField', () => ({
  PartnerSearchField: ({ value, onChange }: any) => (
    <input aria-label="販売先・購買者" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

describe('SalesForm sold registration snapshot', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([] as any);
    vi.spyOn(calfApi, 'markCalfSold').mockResolvedValue(undefined as any);
  });

  it('販売済みで新規登録した直後に販売時生産費スナップショットを作る', async () => {
    const created = {
      id: 'sale-test',
      targetType: '成牛',
      targetNumber: '7358',
      targetName: 'はなみつ',
      cattleId: '123',
      saleDate: '2026-09-23',
      salePrice: '10000',
      status: '販売済み',
    } as any;

    const createSale = vi.spyOn(salesApi, 'createSale').mockResolvedValue(created);
    const createSnapshot = vi.spyOn(saleCostSnapshot, 'getOrCreateSaleCostSnapshot').mockResolvedValue({
      productionCost: 909,
      profit: 9091,
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sales/new?source=cattle&targetType=%E6%88%90%E7%89%9B&targetNumber=7358&targetName=%E3%81%AF%E3%81%AA%E3%81%BF%E3%81%A4&cattleId=123&returnTo=%2Fcattle%2F123']}>
        <SalesForm />
      </MemoryRouter>,
    );

    await user.click(screen.getByLabelText('販売・出荷までの進め方 *'));
    await user.click(screen.getByRole('option', { name: '即座に販売・出荷' }));

    const saleDate = screen.getByLabelText('販売日');
    await user.type(saleDate, '2026-09-23');

    const salePrice = screen.getByLabelText('販売金額 円');
    await user.type(salePrice, '10000');

    await user.click(screen.getByLabelText('状態'));
    await user.click(screen.getByRole('option', { name: '販売済み' }));

    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(createSale).toHaveBeenCalledWith(expect.objectContaining({
      targetType: '成牛',
      targetNumber: '7358',
      targetName: 'はなみつ',
      cattleId: '123',
      saleDate: '2026-09-23',
      salePrice: '10000',
      status: '販売済み',
    }));
    expect(createSnapshot).toHaveBeenCalledWith(created);
  });
});
