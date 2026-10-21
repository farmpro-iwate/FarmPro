import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
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
  it('does not save when user cancels the final confirmation', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      show();
      await screen.findByText(/ふくこ（5953）/);
      fireEvent.change(screen.getByLabelText('精算番号'), { target: { value: '26025106' } });
      fireEvent.change(screen.getByLabelText('差引精算額（円）'), { target: { value: '663597' } });
      fireEvent.change(screen.getByLabelText('控除名'), { target: { value: '控除額' } });
      fireEvent.change(screen.getByLabelText('控除額（税込円）'), { target: { value: '49203' } });
      fireEvent.change(screen.getByLabelText('経費の支払日（精算日）'), { target: { value: '2026-04-21' } });
      fireEvent.change(screen.getByLabelText('支払先'), { target: { value: '新岩手農業協同組合' } });
      const save = screen.getByRole('button', { name: '確認して新規経費を一括登録' });
      expect(save).toBeEnabled();
      fireEvent.click(save);
      expect(confirmMock).toHaveBeenCalledOnce();
      expect(saveMock).not.toHaveBeenCalled();
    } finally {
      confirmMock.mockRestore();
    }
  });

  it('saves only new expense on confirmed settlement and blocks second click', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      show();
      await screen.findByText(/ふくこ（5953）/);
      fireEvent.change(screen.getByLabelText('精算番号'), { target: { value: '26025106' } });
      fireEvent.change(screen.getByLabelText('差引精算額（円）'), { target: { value: '663597' } });
      fireEvent.change(screen.getByLabelText('控除名'), { target: { value: '控除額' } });
      fireEvent.change(screen.getByLabelText('控除額（税込円）'), { target: { value: '49203' } });
      fireEvent.change(screen.getByLabelText('経費の支払日（精算日）'), { target: { value: '2026-04-21' } });
      fireEvent.change(screen.getByLabelText('支払先'), { target: { value: '新岩手農業協同組合' } });
      fireEvent.click(screen.getByRole('button', { name: '確認して新規経費を一括登録' }));
      await waitFor(() => expect(saveMock).toHaveBeenCalledOnce());
      expect(saveMock.mock.calls[0][0].expensesToCreate).toHaveLength(1);
      expect(saveMock.mock.calls[0][0].expensesToCreate[0].amount).toBe('49203');
      expect(await screen.findByText('新規経費の一括登録が完了しました。')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '登録済み' })).toBeDisabled();
    } finally {
      confirmMock.mockRestore();
    }
  });

  it('links a recorded vaccine expense without creating a duplicate expense', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      show();
      await screen.findByText(/ふくこ（5953）/);
      fireEvent.change(screen.getByLabelText('精算番号'), { target: { value: '26025106' } });
      fireEvent.change(screen.getByLabelText('差引精算額（円）'), { target: { value: '709160' } });
      fireEvent.mouseDown(screen.getByRole('combobox', { name: '登録済み経費と紐づけ（任意）' }));
      fireEvent.click(await screen.findByRole('option', { name: /五種混合・ヘモフィルスワクチン/ }));
      fireEvent.change(screen.getByLabelText('経費の支払日（精算日）'), { target: { value: '2026-04-21' } });
      fireEvent.change(screen.getByLabelText('支払先'), { target: { value: 'JA' } });
      expect(screen.getByText(/登録済み経費：1件 ／ 新規経費候補：0件/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '確認して新規経費を一括登録' }));
      await waitFor(() => expect(saveMock).toHaveBeenCalledOnce());
      expect(saveMock.mock.calls[0][0].deductions[0].existingExpenseId).toBe('expense-vaccine');
      expect(saveMock.mock.calls[0][0].expensesToCreate).toEqual([]);
      expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('新規経費：0件'));
    } finally {
      confirmMock.mockRestore();
    }
  });

});
