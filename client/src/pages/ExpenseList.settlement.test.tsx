import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ExpenseList } from './ExpenseList';

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));
vi.mock('../services/expensesApi', () => ({
  getExpensesList: listMock,
  deleteExpense: vi.fn(),
  paymentMethodOptions: ['JA精算'],
}));

const basic = {
  paymentDate: '2026-04-21', category: '手数料', description: '市場手数料',
  vendor: 'テストJA', amount: '16394', paymentMethod: 'JA精算',
  target: 'TEST5953', memo: '販売精算 TEST5953-002',
  createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:00:00.000Z',
};

describe('settlement expense target display', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('filters new animal-linked settlements as individual and preserves legacy farm-wide expenses', async () => {
    listMock.mockResolvedValue([
      { ...basic, id: 'individual', animalType: 'calf', animalEarTag: 'TEST5953', animalId: 'calf-1' },
      { ...basic, id: 'legacy', target: 'TEST5954', description: '旧精算手数料', animalType: undefined },
    ]);
    render(<MemoryRouter><ExpenseList /></MemoryRouter>);
    await waitFor(() => expect(listMock).toHaveBeenCalledOnce());
    expect(await screen.findByText('表示件数：2件')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '個体' }));
    await waitFor(() => expect(screen.getByText('表示件数：1件')).toBeInTheDocument());
    expect(screen.getAllByText('市場手数料').length).toBeGreaterThan(0);
    expect(screen.queryByText('旧精算手数料')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '農場全体' }));
    await waitFor(() => expect(screen.getByText('表示件数：1件')).toBeInTheDocument());
    expect(screen.queryByText('市場手数料')).not.toBeInTheDocument();
    expect(screen.getAllByText('旧精算手数料').length).toBeGreaterThan(0);
  });
});
