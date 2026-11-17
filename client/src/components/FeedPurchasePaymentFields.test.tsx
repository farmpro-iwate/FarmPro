import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedPurchasePaymentFields, type FeedPurchasePaymentFieldsProps } from './FeedPurchasePaymentFields';
import type { ExpenseRecord } from '../services/expensesApi';

function expense(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return { id: 'fixture-expense', paymentDate: '2026-10-20', category: '飼料費',
    description: '確認済みの飼料代', vendor: '確認用仕入先', amount: '2200',
    paymentMethod: '銀行振込', target: '農場全体', memo: '',
    createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z',
    ...overrides };
}
function props(overrides: Partial<FeedPurchasePaymentFieldsProps> = {}): FeedPurchasePaymentFieldsProps {
  return { enabled: true, onEnabledChange: vi.fn(), paymentMethod: '',
    onPaymentMethodChange: vi.fn(), transactionDate: '2026-10-20',
    amount: '2200', supplier: '確認用仕入先', candidates: [],
    selectedExpenseId: '', allowSeparatePayment: false,
    onExpenseChoiceChange: vi.fn(), ...overrides };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('FeedPurchasePaymentFields - 経費発生日', () => {
  it('入庫日を経費発生日として表示し、別の支払日入力欄を作らない', () => {
    const input = props();
    const { rerender } = render(<FeedPurchasePaymentFields {...input} />);
    expect(screen.getByRole('region', { name: '支払い・経費' })).toBeInTheDocument();
    expect(screen.getByText(/経費発生日は入庫日（2026-10-20）/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^支払日/)).not.toBeInTheDocument();
    expect(screen.getByText('2,200円')).toBeInTheDocument();
    expect(screen.getByText('確認用仕入先')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveAttribute('aria-required', 'true');
    rerender(<FeedPurchasePaymentFields {...input} amount="3300" supplier="別の仕入先" />);
    expect(screen.getByText('3,300円')).toBeInTheDocument();
    expect(screen.getByText('別の仕入先')).toBeInTheDocument();
  });
  it('支払方法だけ変更し、経費を登録しない選択もできる', async () => {
    const user = userEvent.setup();
    const input = props();
    const { rerender } = render(<FeedPurchasePaymentFields {...input} />);
    await user.click(screen.getByRole('combobox', { name: /^支払方法/ }));
    await user.click(screen.getByRole('option', { name: 'JA精算' }));
    expect(input.onPaymentMethodChange).toHaveBeenCalledExactlyOnceWith('JA精算');
    await user.click(screen.getByRole('checkbox', { name: '経費にも登録する' }));
    expect(input.onEnabledChange).toHaveBeenCalledExactlyOnceWith(false);
    rerender(<FeedPurchasePaymentFields {...input} enabled={false} />);
    expect(screen.queryByRole('combobox', { name: /^支払方法/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });
  it('同じ経費候補は本人の明示選択が必要で、元記録を変更しない', async () => {
    const user = userEvent.setup();
    const existing = Object.freeze(expense());
    const input = props({ candidates: [existing] });
    const { rerender } = render(<FeedPurchasePaymentFields {...input} />);
    expect(screen.getByText('経費発生日：2026-10-20')).toBeInTheDocument();
    const radio = screen.getByRole('radio', { name: /確認済みの飼料代/ });
    expect(radio).not.toBeChecked();
    await user.click(radio);
    expect(input.onExpenseChoiceChange).toHaveBeenCalledExactlyOnceWith(existing.id, false);
    rerender(<FeedPurchasePaymentFields {...input} selectedExpenseId={existing.id} />);
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).not.toHaveAttribute('aria-required');
    await user.click(screen.getByRole('radio', { name: '別の支払いとして新しく登録' }));
    expect(input.onExpenseChoiceChange).toHaveBeenLastCalledWith('', true);
    expect(existing).toEqual(expense());
  });
  it('保存中は選択と変更を禁止する', () => {
    const input = props({ disabled: true, candidates: [expense()] });
    render(<FeedPurchasePaymentFields {...input} />);
    expect(screen.getByRole('checkbox', { name: '経費にも登録する' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveAttribute('aria-disabled', 'true');
    screen.getAllByRole('radio').forEach(radio => expect(radio).toBeDisabled());
  });
  it('紐付け不可の候補は選べず、新規経費には支払方法を要求する', () => {
    const input = props({ candidates: [expense({ cloudSyncPending: true, description: '同期中の飼料代' })] });
    render(<FeedPurchasePaymentFields {...input} />);
    expect(screen.getByRole('radio', { name: /同期中の飼料代/ })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveAttribute('aria-required', 'true');
  });
});
