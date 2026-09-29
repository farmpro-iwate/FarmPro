import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseForm } from './ExpenseForm';
import { ExpenseEditForm } from './ExpenseEditForm';
import * as expensesApi from '../services/expensesApi';

vi.mock('../components/ExpenseCategorySearchField', () => ({
  ExpenseCategorySearchField: ({ value, onChange }: any) => (
    <input aria-label="経費科目" value={value} onChange={(event) => onChange(event.target.value, 10)} />
  ),
}));

vi.mock('../components/PartnerSearchField', () => ({
  PartnerSearchField: ({ label = '支払先', value, onChange }: any) => (
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value, 20)} />
  ),
}));

describe('ExpenseForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => cleanup());

  it('必須項目不足では登録しない', async () => {
    const createExpense = vi.spyOn(expensesApi, 'createExpense').mockResolvedValue({ id: 'e1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ExpenseForm />
      </MemoryRouter>,
    );

    const paymentDate = screen.getByLabelText(/支払日/);
    expect(paymentDate).toBeRequired();

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(paymentDate).toBeInvalid();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it('負の金額は登録しない', async () => {
    const createExpense = vi.spyOn(expensesApi, 'createExpense').mockResolvedValue({ id: 'e1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ExpenseForm />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/支払日/), '2026-09-29');
    await user.type(screen.getByLabelText('経費科目'), '飼料費');
    await user.type(screen.getByLabelText(/金額/), '-100');
    await user.type(screen.getByLabelText(/内容/), '配合飼料');
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(screen.getByText('金額は数字で入力してください。例：120000')).toBeInTheDocument();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it('正常な経費を登録して一覧へ戻る', async () => {
    const createExpense = vi.spyOn(expensesApi, 'createExpense').mockResolvedValue({ id: 'e1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/expenses/new']}>
        <Routes>
          <Route path="/expenses/new" element={<ExpenseForm />} />
          <Route path="/expenses" element={<div>経費一覧へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/支払日/), '2026-09-29');
    await user.type(screen.getByLabelText('経費科目'), '飼料費');
    await user.type(screen.getByLabelText(/金額/), '120000');
    await user.type(screen.getByLabelText(/内容/), '配合飼料 9月分');
    await user.type(screen.getByLabelText('支払先'), 'JA');
    await user.type(screen.getByLabelText('メモ'), '請求書あり');

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(createExpense).toHaveBeenCalledWith(expect.objectContaining({
      paymentDate: '2026-09-29',
      category: '飼料費',
      expenseCategoryMasterId: 10,
      amount: '120000',
      description: '配合飼料 9月分',
      vendor: 'JA',
      vendorMasterId: 20,
      paymentMethod: '現金',
      memo: '請求書あり',
    }));

    expect(await screen.findByText('経費一覧へ戻った')).toBeInTheDocument();
  });
});

describe('ExpenseEditForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(expensesApi, 'getExpense').mockResolvedValue({
      id: 'e1',
      paymentDate: '2026-09-01',
      category: '飼料費',
      expenseCategoryMasterId: 10,
      description: '配合飼料',
      vendor: 'JA',
      vendorMasterId: 20,
      amount: '100000',
      paymentMethod: '現金',
      target: '',
      memo: '元データ',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    } as any);
  });

  afterEach(() => cleanup());

  it('既存経費を読み込み編集して保存できる', async () => {
    const updateExpense = vi.spyOn(expensesApi, 'updateExpense').mockResolvedValue({ id: 'e1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/expenses/e1/edit']}>
        <Routes>
          <Route path="/expenses/:id/edit" element={<ExpenseEditForm />} />
          <Route path="/expenses" element={<div>経費一覧へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '経費 編集' });
    const amount = screen.getByLabelText(/金額/);
    await user.clear(amount);
    await user.type(amount, '110000');

    const memo = screen.getByLabelText('メモ');
    await user.clear(memo);
    await user.type(memo, '修正済み');

    await user.click(screen.getByRole('button', { name: '更新' }));

    expect(updateExpense).toHaveBeenCalledWith('e1', expect.objectContaining({
      paymentDate: '2026-09-01',
      category: '飼料費',
      description: '配合飼料',
      amount: '110000',
      memo: '修正済み',
    }));
    expect(await screen.findByText('経費一覧へ戻った')).toBeInTheDocument();
  });
});