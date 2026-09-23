import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SoldCattleList } from './SoldCattleList';
import * as salesApi from '../services/salesApi';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';

describe('SoldCattleList actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([] as any);
  });

  it('販売済み牛一覧から編集と削除ができる', async () => {
    vi.spyOn(salesApi, 'getSalesList').mockResolvedValue([
      {
        id: 'sale-1',
        targetType: '成牛',
        targetNumber: '7358',
        targetName: 'はなみつ',
        cattleId: '123',
        status: '販売済み',
        saleDate: '2026-09-23',
        salePrice: '10000',
        productionCostSnapshot: 909,
        profitSnapshot: 9091,
      },
    ] as any);
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([
      {
        id: '123',
        earTag: '7358',
        name: 'はなみつ',
      },
    ] as any);

    const deleteSale = vi.spyOn(salesApi, 'deleteSale').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SoldCattleList />
      </MemoryRouter>,
    );

    expect(await screen.findByText('はなみつ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '編集' })).toHaveAttribute('href', '/sales/sale-1/edit');

    await user.click(screen.getByRole('button', { name: '削除' }));

    expect(deleteSale).toHaveBeenCalledWith('sale-1');
    expect(screen.queryByText('はなみつ')).not.toBeInTheDocument();
  });
});
