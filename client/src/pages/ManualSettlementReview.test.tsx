import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ManualSettlementReview } from './ManualSettlementReview';

const { saveMock, saleMock, expenseMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  saleMock: vi.fn(),
  expenseMock: vi.fn(),
}));
vi.mock('../services/salesApi', () => ({ getSale: saleMock }));
vi.mock('../services/expensesApi', () => ({ getExpensesList: expenseMock }));
vi.mock('../services/manualSettlementSave', () => ({ saveManualSettlement: saveMock }));

const sale = {
  id: 'sale-1', targetName: 'ふくこ', targetNumber: '5953', salePrice: '712800',
  status: '販売済み',
};
const vaccine = {
  id: 'expense-vaccine', description: '五種混合・ヘモフィルスワクチン',
  amount: '3640', paymentDate: '2026-04-21',
};

function show() {
  return render(<MemoryRouter initialEntries={['/sales/sale-1/settlement']}>
    <Routes><Route path="/sales/:id/settlement" element={<ManualSettlementReview />} /></Routes>
  </MemoryRouter>);
}

describe('manual settlement screen', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    saleMock.mockResolvedValue(sale);
    expenseMock.mockResolvedValue([vaccine]);
    saveMock.mockResolvedValue(undefined);
  });

  it('loads sale and existing expenses without saving anything', async () => {
    show();
    expect(await screen.findByText(/ふくこ（5953）/)).toBeInTheDocument();
    expect(screen.getByText(/販売金額：712800円/)).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '確認して新規経費を一括登録' })).toBeDisabled();
  });

  it('refuses save when settlement amount is invalid', async () => {
    show();
    await screen.findByText(/ふくこ（5953）/);
    fireEvent.change(screen.getByLabelText('精算番号'), { target: { value: '26025106' } });
    fireEvent.change(screen.getByLabelText('差引精算額（円）'), { target: { value: '999999' } });
    fireEvent.change(screen.getByLabelText('控除名'), { target: { value: '市場手数料' } });
    fireEvent.change(screen.getByLabelText('控除額（税込円）'), { target: { value: '16394' } });
    expect(screen.getByRole('button', { name: '確認して新規経費を一括登録' })).toBeDisabled();
    expect(saveMock).not.toHaveBeenCalled();
  });
});
