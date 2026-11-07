import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedPurchasePaymentFields, type FeedPurchasePaymentFieldsProps } from './FeedPurchasePaymentFields';
import type { ExpenseRecord } from '../services/expensesApi';

function expense(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    id: 'fixture-expense', paymentDate: '2026-10-21', category: '飼料費',
    description: '確認済みの飼料代', vendor: '確認用仕入先', amount: '2200',
    paymentMethod: '銀行振込', target: '農場全体', memo: '',
    createdAt: '2026-10-21T00:00:00.000Z', updatedAt: '2026-10-21T00:00:00.000Z',
    ...overrides,
  };
}

function props(overrides: Partial<FeedPurchasePaymentFieldsProps> = {}): FeedPurchasePaymentFieldsProps {
  return {
    enabled: true,
    onEnabledChange: vi.fn(),
    paymentDate: '',
    onPaymentDateChange: vi.fn(),
    paymentMethod: '',
    onPaymentMethodChange: vi.fn(),
    transactionDate: '2026-10-20',
    amount: '2200',
    supplier: '確認用仕入先',
    candidates: [],
    selectedExpenseId: '',
    allowSeparatePayment: false,
    onExpenseChoiceChange: vi.fn(),
    ...overrides,
  };
}

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Payment fields must not access record APIs'));
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  cleanup();
  vi.restoreAllMocks();
});

describe('FeedPurchasePaymentFields', () => {
  it('支払日と方法を補わず、購入金額と仕入先を入力不要の要約で表示する', () => {
    const input = props();
    const { rerender } = render(<FeedPurchasePaymentFields {...input} />);
    expect(screen.getByRole('region', { name: '支払い・経費' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '経費にも登録する' })).toBeChecked();
    expect(screen.getByLabelText(/^支払日/)).toHaveValue('');
    expect(screen.getByLabelText(/^支払日/)).toBeRequired();
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveTextContent('選択してください');
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('2,200円')).toBeInTheDocument();
    expect(screen.getByText('確認用仕入先')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /金額|仕入先/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();

    rerender(<FeedPurchasePaymentFields {...input} amount="3300" supplier="変更後の仕入先" />);
    expect(screen.getByText('3,300円')).toBeInTheDocument();
    expect(screen.getByText('変更後の仕入先')).toBeInTheDocument();
    expect(screen.queryByText('2,200円')).not.toBeInTheDocument();
    expect(input.onEnabledChange).not.toHaveBeenCalled();
    expect(input.onPaymentDateChange).not.toHaveBeenCalled();
    expect(input.onPaymentMethodChange).not.toHaveBeenCalled();
    expect(input.onExpenseChoiceChange).not.toHaveBeenCalled();
  });

  it('入庫日は利用者がボタンを押したときだけ使い、親フォームを送信しない', async () => {
    const user = userEvent.setup();
    const input = props({ paymentDate: '2026-10-19', paymentMethod: '現金' });
    const onSubmit = vi.fn(event => event.preventDefault());
    const view = (current: FeedPurchasePaymentFieldsProps) => <form onSubmit={onSubmit}>
      <FeedPurchasePaymentFields {...current} />
    </form>;
    const { rerender } = render(view(input));
    expect(input.onPaymentDateChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '入庫日と同じ' }));
    expect(input.onPaymentDateChange).toHaveBeenCalledExactlyOnceWith('2026-10-20');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.onPaymentMethodChange).not.toHaveBeenCalled();

    rerender(view({ ...input, transactionDate: '' }));
    expect(screen.getByRole('button', { name: '入庫日と同じ' })).toBeDisabled();
    expect(input.onPaymentDateChange).toHaveBeenCalledTimes(1);
  });

  it('支払欄の変更を親へ渡し、未払いの入庫のみでは支払欄や候補を要求しない', async () => {
    const user = userEvent.setup();
    const input = props({ candidates: [expense()] });
    const { rerender } = render(<FeedPurchasePaymentFields {...input} />);
    fireEvent.change(screen.getByLabelText(/^支払日/), { target: { value: '2026-10-22' } });
    expect(input.onPaymentDateChange).toHaveBeenCalledExactlyOnceWith('2026-10-22');
    await user.click(screen.getByRole('combobox', { name: /^支払方法/ }));
    await user.click(screen.getByRole('option', { name: '銀行振込' }));
    expect(input.onPaymentMethodChange).toHaveBeenCalledExactlyOnceWith('銀行振込');
    await user.click(screen.getByRole('checkbox', { name: '経費にも登録する' }));
    expect(input.onEnabledChange).toHaveBeenCalledExactlyOnceWith(false);

    rerender(<FeedPurchasePaymentFields {...input} enabled={false} />);
    expect(screen.getByRole('checkbox', { name: '経費にも登録する' })).not.toBeChecked();
    expect(screen.getByText('入庫だけ登録します。経費は支払後に登録できます。')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^支払日/)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^支払方法/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '入庫日と同じ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(input.onPaymentDateChange).toHaveBeenCalledTimes(1);
    expect(input.onPaymentMethodChange).toHaveBeenCalledTimes(1);
    expect(input.onExpenseChoiceChange).not.toHaveBeenCalled();
  });

  it('重複候補の支払内容を示し、既存経費か別支払いかを明示選択したときだけ親に伝える', async () => {
    const user = userEvent.setup();
    const existing = Object.freeze(expense());
    const input = props({
      paymentDate: '2026-10-21',
      candidates: [existing, expense({ id: 'fixture-expense-2', description: '別明細の飼料代', paymentMethod: '現金' })],
    });
    const { rerender } = render(<FeedPurchasePaymentFields {...input} />);
    expect(screen.getByRole('radiogroup', { name: '登録済みの経費を確認' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    screen.getAllByRole('radio').forEach(radio => expect(radio).not.toBeChecked());
    expect(screen.getAllByText('支払日：2026-10-21')).toHaveLength(2);
    expect(screen.getAllByText('金額：2,200円')).toHaveLength(2);
    expect(screen.getAllByText('支払先：確認用仕入先')).toHaveLength(2);
    expect(screen.getByText('内容：確認済みの飼料代')).toBeInTheDocument();
    expect(screen.getByText('支払方法：銀行振込')).toBeInTheDocument();
    expect(input.onExpenseChoiceChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: /確認済みの飼料代/ }));
    expect(input.onExpenseChoiceChange).toHaveBeenCalledExactlyOnceWith(existing.id, false);
    rerender(<FeedPurchasePaymentFields {...input} selectedExpenseId={existing.id} />);
    expect(screen.getByRole('radio', { name: /確認済みの飼料代/ })).toBeChecked();
    expect(screen.getByLabelText(/^支払日/)).not.toBeRequired();
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).not.toHaveAttribute('aria-required');
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveTextContent('選択してください');
    expect(screen.getByText('登録済み経費を選んでも、元の支払内容は変わりません。')).toBeInTheDocument();
    expect(existing).toEqual(expense());
    expect(input.onPaymentDateChange).not.toHaveBeenCalled();
    expect(input.onPaymentMethodChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: '別の支払いとして新しく登録' }));
    expect(input.onExpenseChoiceChange).toHaveBeenLastCalledWith('', true);
    rerender(<FeedPurchasePaymentFields {...input} allowSeparatePayment />);
    expect(screen.getByRole('radio', { name: '別の支払いとして新しく登録' })).toBeChecked();
    expect(screen.getByLabelText(/^支払日/)).toBeRequired();
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveAttribute('aria-required', 'true');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);

    // A field change resets the parent's confirmation; the component must not retain it.
    rerender(<FeedPurchasePaymentFields {...input} />);
    screen.getAllByRole('radio').forEach(radio => expect(radio).not.toBeChecked());
    expect(input.onExpenseChoiceChange).toHaveBeenCalledTimes(2);
  });

  it('入庫後は経費登録の切替だけを固定し、保存中はすべての操作を止める', async () => {
    const user = userEvent.setup();
    const existing = expense();
    const input = props({ locked: true, candidates: [existing] });
    const { rerender } = render(<FeedPurchasePaymentFields {...input} />);
    expect(screen.getByRole('checkbox', { name: '経費にも登録する' })).toBeDisabled();
    expect(screen.getByLabelText(/^支払日/)).toBeEnabled();
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: '入庫日と同じ' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /確認済みの飼料代/ })).toBeEnabled();
    expect(input.onEnabledChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '入庫日と同じ' }));
    expect(input.onPaymentDateChange).toHaveBeenCalledExactlyOnceWith(input.transactionDate);
    await user.click(screen.getByRole('combobox', { name: /^支払方法/ }));
    await user.click(screen.getByRole('option', { name: '銀行振込' }));
    expect(input.onPaymentMethodChange).toHaveBeenCalledExactlyOnceWith('銀行振込');
    await user.click(screen.getByRole('radio', { name: /確認済みの飼料代/ }));
    expect(input.onExpenseChoiceChange).toHaveBeenCalledExactlyOnceWith(existing.id, false);

    rerender(<FeedPurchasePaymentFields {...input} disabled />);
    expect(screen.getByRole('checkbox', { name: '経費にも登録する' })).toBeDisabled();
    expect(screen.getByLabelText(/^支払日/)).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: '入庫日と同じ' })).toBeDisabled();
    screen.getAllByRole('radio').forEach(radio => expect(radio).toBeDisabled());
    expect(input.onEnabledChange).not.toHaveBeenCalled();
    expect(input.onPaymentDateChange).toHaveBeenCalledTimes(1);
    expect(input.onPaymentMethodChange).toHaveBeenCalledTimes(1);
    expect(input.onExpenseChoiceChange).toHaveBeenCalledTimes(1);
  });

  it('選択した候補が消えた場合は既存経費扱いを続けず、新規の支払入力を必須に戻す', () => {
    const existing = expense();
    const input = props({ candidates: [existing], selectedExpenseId: existing.id });
    const { rerender } = render(<FeedPurchasePaymentFields {...input} />);
    expect(screen.getByLabelText(/^支払日/)).not.toBeRequired();
    rerender(<FeedPurchasePaymentFields {...input} candidates={[]} />);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^支払日/)).toBeRequired();
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveAttribute('aria-required', 'true');
    expect(input.onExpenseChoiceChange).not.toHaveBeenCalled();
  });

  it('既存経費の確認では日付一致と表示せず、支払日や方法が空でも候補を選択できる', async () => {
    const user = userEvent.setup();
    const existing = expense({ paymentDate: '2026-10-01' });
    const input = props({ candidates: [existing], candidateMode: 'link-existing' });
    const { rerender } = render(<FeedPurchasePaymentFields {...input} />);
    expect(screen.getByText('同じ金額・仕入先の経費です。この入庫の支払いとして登録済みのものを選んでください。')).toBeInTheDocument();
    expect(screen.queryByText(/同じ支払日・金額・仕入先の経費があります/)).not.toBeInTheDocument();
    expect(screen.getByText('支払日：2026-10-01')).toBeInTheDocument();
    expect(screen.getByLabelText(/^支払日/)).toHaveValue('');
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveTextContent('選択してください');
    expect(screen.getByRole('radio', { name: /確認済みの飼料代/ })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /確認済みの飼料代/ })).not.toBeChecked();
    await user.click(screen.getByRole('radio', { name: /確認済みの飼料代/ }));
    expect(input.onExpenseChoiceChange).toHaveBeenCalledExactlyOnceWith(existing.id, false);

    rerender(<FeedPurchasePaymentFields {...input} selectedExpenseId={existing.id} />);
    expect(screen.getByLabelText(/^支払日/)).toHaveValue('');
    expect(screen.getByLabelText(/^支払日/)).not.toBeRequired();
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).not.toHaveAttribute('aria-required');
    expect(input.onPaymentDateChange).not.toHaveBeenCalled();
    expect(input.onPaymentMethodChange).not.toHaveBeenCalled();
  });

  it('リンクできない重複候補も内容を示すが選択できず、必須入力を解除しない', async () => {
    const user = userEvent.setup();
    const unavailable = expense({ id: 'fixture-pending', description: '同期中の飼料代', cloudSyncPending: true });
    const available = expense();
    const input = props({ candidates: [unavailable, available], selectedExpenseId: unavailable.id });
    render(<FeedPurchasePaymentFields {...input} />);
    expect(screen.getByRole('radio', { name: /同期中の飼料代/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /同期中の飼料代/ })).not.toBeChecked();
    expect(screen.getByText('この経費は関連付けできません。経費管理で確認してください。')).toBeInTheDocument();
    expect(screen.getByLabelText(/^支払日/)).toBeRequired();
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveAttribute('aria-required', 'true');
    expect(input.onExpenseChoiceChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /確認済みの飼料代/ })).toBeEnabled();
    await user.click(screen.getByRole('radio', { name: /確認済みの飼料代/ }));
    expect(input.onExpenseChoiceChange).toHaveBeenCalledExactlyOnceWith(available.id, false);
  });
});
